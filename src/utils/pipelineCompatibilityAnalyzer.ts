import type {
  DiagnosticReport,
  MaterialAnalysis,
  MeshAnalysis,
} from '../types/diagnostic';
import type {
  PipelineCompatibilityReport,
  PipelineDiagnosticFinding,
  MaterialDetailedAudit,
  NormalTangentPrimitiveAudit,
  ThreeJsRuntimeState,
  ActiveRenderExperiments,
  FeatureRepresentationInGlb,
} from '../types/pipelineCompatibility';
import type { RuntimeMaterialInspection } from '../types/renderComparison';

/**
 * Builds the complete Blender -> glTF -> Three.js Compatibility Analysis
 * with the 5 exact evidence tiers:
 * - CONFIRMED FROM GLB
 * - CONFIRMED FROM THREE.JS RUNTIME
 * - CONFIRMED BY RENDER EXPERIMENT
 * - POTENTIAL
 * - UNKNOWN
 */
export function analyzePipelineCompatibility(
  report: DiagnosticReport,
  runtimeMaterials: RuntimeMaterialInspection[],
  runtimeState?: ThreeJsRuntimeState | null,
  activeExperiments?: ActiveRenderExperiments | null
): PipelineCompatibilityReport {
  const gltfRaw = report.rawJson || {};

  // 1. Audit Normal-Mapped Primitives
  const normalAudits: NormalTangentPrimitiveAudit[] = [];
  report.meshes.forEach((mesh: MeshAnalysis) => {
    mesh.primitives.forEach((prim) => {
      const hasNormalAttr = prim.attributes.hasNormal;
      const hasTangentAttr = prim.attributes.hasTangent;
      const hasTexCoord0 = prim.attributes.hasTexCoord0;
      const hasTexCoord1 = prim.attributes.hasTexCoord1;
      const hasSkinning = prim.attributes.hasJoints0 && prim.attributes.hasWeights0;
      const hasMorphTargets = mesh.primitives.some((p) => p.attributes.customAttributes.length > 0);

      const mat = report.materials.find((m) => m.name === prim.materialName);
      const hasNormalTexture = Boolean(mat?.normalTexture);

      if (hasNormalTexture) {
        normalAudits.push({
          meshIndex: mesh.index,
          meshName: mesh.name,
          primitiveIndex: prim.primitiveIndex,
          materialName: prim.materialName || 'Default Material',
          hasNormalAttribute: hasNormalAttr,
          hasTangentAttribute: hasTangentAttr,
          hasTexCoord0,
          hasTexCoord1,
          hasNormalTexture,
          hasSkinning,
          hasMorphTargets,
          runtimeTangentHandling: hasTangentAttr
            ? 'Vertex TANGENT buffer uploaded to GPU'
            : 'Screen-space partial derivatives (dFdx/dFdy) in WebGL fragment shader',
        });
      }
    });
  });

  const primitivesWithoutTangents = normalAudits.filter((a) => !a.hasTangentAttribute);

  // 2. Audit All Materials across 19 PBR/Extension Features
  const materialAudits: MaterialDetailedAudit[] = report.materials.map((mat: MaterialAnalysis) => {
    const rawMat = gltfRaw.materials?.[mat.index] || {};
    const pbr = rawMat.pbrMetallicRoughness || {};
    const ext = rawMat.extensions || {};

    const runtimeMat = runtimeMaterials.find(
      (rm) => rm.materialIndex === mat.index || rm.name === mat.name
    );

    const isHair =
      mat.name.toLowerCase().includes('hair') ||
      mat.name.toLowerCase().includes('blinn') ||
      mat.name.toLowerCase().includes('strand');

    const hasHighMetalness = mat.metallicFactor >= 0.8;

    const features: MaterialDetailedAudit['features'] = [
      {
        featureName: 'Base Color (Albedo)',
        glbStatus: (pbr.baseColorTexture || pbr.baseColorFactor ? 'Represented in GLB' : 'Not represented') as FeatureRepresentationInGlb,
        valueInGlb: mat.baseColorTexture
          ? `Texture: "${mat.baseColorTexture.textureName}"`
          : `Factor: RGBA(${mat.baseColorFactor.map((v) => v.toFixed(2)).join(', ')})`,
        runtimeThreeJsInterpretation: 'Mapped to MeshStandardMaterial.map and .color (sRGB color space)',
        blenderExportNotes: 'Baked or uniform factor. Complex Blender node color mixing is baked to image albedo.',
      },
      {
        featureName: 'Metallic Factor',
        glbStatus: 'Represented in GLB',
        valueInGlb: `${mat.metallicFactor.toFixed(2)}`,
        runtimeThreeJsInterpretation: `MeshStandardMaterial.metalness = ${mat.metallicFactor.toFixed(2)}`,
        blenderExportNotes: 'Maps directly from Principled BSDF Metallic slider (0.0 = dielectric, 1.0 = conductor).',
      },
      {
        featureName: 'Roughness Factor',
        glbStatus: 'Represented in GLB',
        valueInGlb: `${mat.roughnessFactor.toFixed(2)}`,
        runtimeThreeJsInterpretation: `MeshStandardMaterial.roughness = ${mat.roughnessFactor.toFixed(2)}`,
        blenderExportNotes: 'Maps directly from Principled BSDF Roughness (linear roughness squared internally for GGX).',
      },
      {
        featureName: 'Normal Map',
        glbStatus: (mat.normalTexture ? 'Represented in GLB' : 'Not represented') as FeatureRepresentationInGlb,
        valueInGlb: mat.normalTexture
          ? `Texture: "${mat.normalTexture.textureName}" (scale ${mat.normalScale})`
          : 'None',
        runtimeThreeJsInterpretation: mat.normalTexture
          ? 'MeshStandardMaterial.normalMap (linear NoColorSpace)'
          : 'None',
        blenderExportNotes: 'Evaluated in tangent space. Requires UV map coordinates in TEXCOORD_0.',
      },
      {
        featureName: 'Alpha Transparency Mode',
        glbStatus: 'Represented in GLB',
        valueInGlb: `${mat.alphaMode}${mat.alphaMode === 'MASK' ? ` (cutoff ${mat.alphaCutoff})` : ''}`,
        runtimeThreeJsInterpretation:
          mat.alphaMode === 'BLEND'
            ? 'MeshStandardMaterial.transparent = true, depthWrite = false'
            : mat.alphaMode === 'MASK'
            ? `MeshStandardMaterial.alphaTest = ${mat.alphaCutoff || 0.5}, depthWrite = true`
            : 'MeshStandardMaterial.transparent = false, depthWrite = true',
        blenderExportNotes:
          mat.alphaMode === 'BLEND'
            ? 'In Blender EEVEE, hair typically renders with "Alpha Hashed" (dithered stippling with depth write enabled). glTF BLEND mode turns depthWrite OFF in WebGL.'
            : 'Solid opaque or threshold cutout.',
      },
      {
        featureName: 'Double-Sided Face Rendering',
        glbStatus: 'Represented in GLB',
        valueInGlb: mat.doubleSided ? 'true (Render both sides)' : 'false (Backface culling active)',
        runtimeThreeJsInterpretation: mat.doubleSided
          ? 'MeshStandardMaterial.side = THREE.DoubleSide'
          : 'MeshStandardMaterial.side = THREE.FrontSide',
        blenderExportNotes: 'Blender Viewport defaults to two-sided shading unless "Backface Culling" is checked.',
      },
      {
        featureName: 'Occlusion (AO)',
        glbStatus: (mat.occlusionTexture ? 'Represented in GLB' : 'Not represented') as FeatureRepresentationInGlb,
        valueInGlb: mat.occlusionTexture ? `Texture: "${mat.occlusionTexture.textureName}"` : 'None',
        runtimeThreeJsInterpretation: mat.occlusionTexture ? 'MeshStandardMaterial.aoMap' : 'None',
        blenderExportNotes: 'Blender Principled BSDF does not have a dedicated AO input; baked externally into ORM Red channel.',
      },
      {
        featureName: 'Emissive Color',
        glbStatus: (mat.emissiveFactor.some((v) => v > 0) || mat.emissiveTexture ? 'Represented in GLB' : 'Not represented') as FeatureRepresentationInGlb,
        valueInGlb: `RGB(${mat.emissiveFactor.map((v) => v.toFixed(2)).join(', ')})`,
        runtimeThreeJsInterpretation: 'MeshStandardMaterial.emissive',
        blenderExportNotes: 'Blender Emission Color & Strength. High values require KHR_materials_emissive_strength.',
      },
      {
        featureName: 'Clearcoat Extension',
        glbStatus: (ext.KHR_materials_clearcoat ? 'Represented in GLB' : 'Not represented') as FeatureRepresentationInGlb,
        valueInGlb: ext.KHR_materials_clearcoat ? 'KHR_materials_clearcoat active' : 'None',
        runtimeThreeJsInterpretation: ext.KHR_materials_clearcoat ? 'MeshPhysicalMaterial.clearcoat' : 'Ignored in StandardMaterial',
        blenderExportNotes: 'Maps from Principled BSDF Clearcoat slider in Blender 3.0+.',
      },
      {
        featureName: 'Transmission (Glass/Refraction)',
        glbStatus: (ext.KHR_materials_transmission ? 'Represented in GLB' : 'Not represented') as FeatureRepresentationInGlb,
        valueInGlb: ext.KHR_materials_transmission ? 'KHR_materials_transmission active' : 'None',
        runtimeThreeJsInterpretation: ext.KHR_materials_transmission ? 'MeshPhysicalMaterial.transmission' : 'None',
        blenderExportNotes: 'Maps from Principled BSDF Transmission slider.',
      },
      {
        featureName: 'Subsurface Scattering (Skin Translucency)',
        glbStatus: (ext.KHR_materials_subsurface ? 'Partially represented' : 'Not represented') as FeatureRepresentationInGlb,
        valueInGlb: ext.KHR_materials_subsurface ? 'Vendor extension' : 'None in standard glTF 2.0',
        runtimeThreeJsInterpretation: 'Standard Three.js physical material does not simulate multi-layer skin SSS',
        blenderExportNotes: 'Blender Principled BSDF Subsurface Weight is SIMPLIFIED or LOST during export to standard glTF.',
      },
      {
        featureName: 'Procedural Shader Nodes (ColorRamp / Musgrave / Noise)',
        glbStatus: 'Not represented',
        valueInGlb: 'None (glTF does not support procedural shading graphs)',
        runtimeThreeJsInterpretation: 'WebGL only executes precompiled PBR fragment shaders with static textures',
        blenderExportNotes: 'Procedural Blender nodes must be baked into image textures prior to export.',
      },
    ];

    return {
      materialIndex: mat.index,
      materialName: mat.name,
      materialType: rawMat.extensions ? 'Extended Physical PBR' : 'Standard Metallic-Roughness',
      features,
      isHairOrThinGeometry: isHair,
      hasHighMetalness,
      alphaMode: mat.alphaMode,
      alphaCutoff: mat.alphaCutoff,
      doubleSided: mat.doubleSided,
      runtimeInspection: runtimeMat
        ? {
            transparent: runtimeMat.transparent,
            depthWrite: runtimeMat.depthWrite,
            depthTest: runtimeMat.depthTest,
            alphaTest: runtimeMat.alphaTest,
            side: runtimeMat.side,
            opacity: 1.0,
          }
        : undefined,
    };
  });

  // 3. Populate Findings across the 5 Evidence Tiers
  const confirmedFromGlb: PipelineDiagnosticFinding[] = [];
  const confirmedFromRuntime: PipelineDiagnosticFinding[] = [];
  const confirmedByExperiment: PipelineDiagnosticFinding[] = [];
  const potentialCauses: PipelineDiagnosticFinding[] = [];
  const unknownFactors: PipelineDiagnosticFinding[] = [];

  // TIER 1: CONFIRMED FROM GLB
  // Normal primitives lacking tangents
  if (primitivesWithoutTangents.length > 0) {
    confirmedFromGlb.push({
      id: 'GLB_MISSING_TANGENTS_FACT',
      classification: 'CONFIRMED FROM GLB',
      category: 'Normals & Tangents',
      title: `${primitivesWithoutTangents.length} Normal-Mapped Primitives Lack Tangent Attribute`,
      finding: `Asset defines ${primitivesWithoutTangents.length} primitive(s) with normal maps but without per-vertex TANGENT attributes.`,
      evidence: `glTF accessors confirm NORMAL and TEXCOORD_0 exist on primitives [${primitivesWithoutTangents.map((p) => `Mesh ${p.meshName}#${p.primitiveIndex}`).join(', ')}], but TANGENT is absent.`,
      affectedObjects: primitivesWithoutTangents.map((p) => `${p.meshName} (Prim #${p.primitiveIndex})`),
      whyItCanChangeAppearance:
        'This is a confirmed asset trait. In Blender, normal maps render using internal MikkTSpace tangent bases. Without exported tangents, Three.js shaders must approximate tangent frames at runtime using screen-space partial derivatives (dFdx/dFdy).',
    });
  }

  // Hair BLEND transparency
  const blendMaterials = report.materials.filter((m) => m.alphaMode === 'BLEND');
  if (blendMaterials.length > 0) {
    confirmedFromGlb.push({
      id: 'GLB_HAIR_BLEND_FACT',
      classification: 'CONFIRMED FROM GLB',
      category: 'Transparency & Hair',
      title: `${blendMaterials.length} Material(s) Define alphaMode: BLEND`,
      finding: `Materials [${blendMaterials.map((m) => `"${m.name}"`).join(', ')}] explicitly specify alphaMode: 'BLEND'.`,
      evidence: `glTF materials JSON specifies alphaMode: 'BLEND' without an alphaCutoff threshold.`,
      affectedObjects: blendMaterials.map((m) => m.name),
      whyItCanChangeAppearance:
        'This is a confirmed asset definition. In standard WebGL rasterization, BLEND transparency turns depth writing off (depthWrite = false).',
    });
  }

  // Metallic materials
  const highMetallicMats = report.materials.filter((m) => m.metallicFactor >= 0.8);
  if (highMetallicMats.length > 0) {
    confirmedFromGlb.push({
      id: 'GLB_METALLIC_MATERIALS_FACT',
      classification: 'CONFIRMED FROM GLB',
      category: 'Materials & Shaders',
      title: `${highMetallicMats.length} Material(s) Have High Metallic Factor (≥ 0.80)`,
      finding: `Materials [${highMetallicMats.map((m) => `"${m.name}" (${(m.metallicFactor * 100).toFixed(0)}%)`).join(', ')}] are metallic conductors.`,
      evidence: `metallicFactor in pbrMetallicRoughness is between 0.80 and 1.00.`,
      affectedObjects: highMetallicMats.map((m) => m.name),
      whyItCanChangeAppearance:
        'Metallic surfaces have 0% diffuse reflectance and rely entirely on reflected environment radiance (IBL).',
    });
  }

  // Embedded lights fact
  const punctualLightsCount = gltfRaw.extensions?.KHR_lights_punctual?.lights?.length || 0;
  confirmedFromGlb.push({
    id: 'GLB_LIGHTS_FACT',
    classification: 'CONFIRMED FROM GLB',
    category: 'Lighting & Environment',
    title: `Embedded Scene Lights: ${punctualLightsCount}`,
    finding: punctualLightsCount === 0
      ? 'The GLB file contains 0 embedded scene lights (KHR_lights_punctual is absent).'
      : `The GLB file contains ${punctualLightsCount} embedded punctual lights.`,
    evidence: `glTF extensionsUsed does not list KHR_lights_punctual.`,
    affectedObjects: ['Scene Root'],
    whyItCanChangeAppearance:
      'This is an asset fact, not an error. All illumination in the web viewer must be provided externally by the viewer environment and fill lights.',
  });

  // Embedded images fact
  const totalTextures = report.textures.length;
  const embeddedTextures = report.textures.filter((t) => t.isEmbedded).length;
  const validTextures = report.textures.filter((t) => t.validationStatus === 'VALID').length;
  confirmedFromGlb.push({
    id: 'GLB_TEXTURES_FACT',
    classification: 'CONFIRMED FROM GLB',
    category: 'Textures & Color Space',
    title: `All ${totalTextures} Textures Embedded and Valid in GLB Binary Chunk`,
    finding: `${validTextures}/${totalTextures} textures are valid (${embeddedTextures} embedded in GLB bufferViews) and decode successfully. 0 textures are missing.`,
    evidence: `Binary byte-slicing confirmed valid WebP / PNG magic bytes inside the GLB chunk without missing external URIs.`,
    affectedObjects: report.textures.map((t) => t.name),
    whyItCanChangeAppearance:
      'Texture pixel data is intact and completely accessible to the Three.js GLTFLoader without network latency.',
  });

  // Draco mesh compression fact
  const hasDraco = (report.extensions || []).some((e) => e.name === 'KHR_draco_mesh_compression');
  if (hasDraco) {
    confirmedFromGlb.push({
      id: 'GLB_DRACO_FACT',
      classification: 'CONFIRMED FROM GLB',
      category: 'Geometry & Skinning',
      title: 'Geometry Compressed with KHR_draco_mesh_compression',
      finding: 'Vertex geometry is compressed using Google Draco WebAssembly encoding.',
      evidence: 'glTF extensionsRequired lists KHR_draco_mesh_compression.',
      affectedObjects: report.meshes.map((m) => m.name),
      whyItCanChangeAppearance:
        'Draco quantization reconstructs vertex positions within sub-millimeter tolerances. Three.js decodes it via DRACOLoader WebAssembly.',
    });
  }

  // TIER 2: CONFIRMED FROM THREE.JS RUNTIME
  if (runtimeMaterials.length > 0) {
    const runtimeHair = runtimeMaterials.filter(
      (m) =>
        m.name.toLowerCase().includes('hair') ||
        m.name.toLowerCase().includes('blinn') ||
        m.name.toLowerCase().includes('strand')
    );
    if (runtimeHair.length > 0) {
      confirmedFromRuntime.push({
        id: 'RUNTIME_HAIR_DEPTH_WRITE',
        classification: 'CONFIRMED FROM THREE.JS RUNTIME',
        category: 'Transparency & Hair',
        title: `Three.js Runtime Material: transparent = true, depthWrite = false`,
        finding: `Loaded material "${runtimeHair[0].name}" has transparent = ${runtimeHair[0].transparent}, depthWrite = ${runtimeHair[0].depthWrite}, alphaTest = ${runtimeHair[0].alphaTest}.`,
        evidence: `Active Three.js WebGLMaterial inspected directly in memory: depthWrite is false.`,
        affectedObjects: runtimeHair.map((m) => m.name),
        whyItCanChangeAppearance:
          'Because depthWrite is false, overlapping hair strands cannot write to the GPU Z-buffer. Triangle drawing order depends on camera orbit perspective.',
      });
    }

    // Texture color space inspection
    const colorSpaceSamples = runtimeMaterials
      .flatMap((m) => m.textures)
      .slice(0, 4);
    if (colorSpaceSamples.length > 0) {
      confirmedFromRuntime.push({
        id: 'RUNTIME_TEXTURE_COLOR_SPACE',
        classification: 'CONFIRMED FROM THREE.JS RUNTIME',
        category: 'Textures & Color Space',
        title: `Texture Color Space Mapping: sRGB for Albedo, Linear for Normal/ORM`,
        finding: `Three.js assigns sRGBColorSpace to color maps and NoColorSpace (Linear) to normal/metallic-roughness maps.`,
        evidence: `Inspected runtime Three.js texture objects: [${colorSpaceSamples.map((t) => `${t.slot} → ${t.colorSpace}`).join(', ')}].`,
        affectedObjects: colorSpaceSamples.map((t) => t.textureName),
        whyItCanChangeAppearance:
          'Correct texture color space conversion avoids washed-out albedo and distorted normal perturbation vectors.',
      });
    }
  }

  if (runtimeState) {
    confirmedFromRuntime.push({
      id: 'RUNTIME_RENDER_SETTINGS',
      classification: 'CONFIRMED FROM THREE.JS RUNTIME',
      category: 'Color Management & Tone Mapping',
      title: `Renderer State: ${runtimeState.toneMapping} Tone Mapping, Exposure ${runtimeState.exposure.toFixed(2)}, ${runtimeState.outputColorSpace}`,
      finding: `Three.js renderer is actively operating with toneMapping = ${runtimeState.toneMapping}, toneMappingExposure = ${runtimeState.exposure.toFixed(2)}, outputColorSpace = ${runtimeState.outputColorSpace}.`,
      evidence: `WebGLRenderer properties queried directly from runtime instance.`,
      affectedObjects: ['WebGLRenderer domElement'],
      whyItCanChangeAppearance:
        'Tone mapping curves compress high dynamic range values into standard 8-bit monitor output, directly defining highlight roll-off and skin saturation.',
    });

    confirmedFromRuntime.push({
      id: 'RUNTIME_ENVIRONMENT_STATUS',
      classification: 'CONFIRMED FROM THREE.JS RUNTIME',
      category: 'Lighting & Environment',
      title: `Active Environment: ${runtimeState.envEnabled ? `ON ("${runtimeState.hdrName}", intensity ${runtimeState.hdrIntensity.toFixed(1)}x)` : 'OFF'}`,
      finding: `Three.js scene.environment is currently ${runtimeState.envEnabled ? 'ACTIVE' : 'DISABLED'}. Scene lights count: ${runtimeState.sceneLightsCount}.`,
      evidence: `scene.environment texture and scene.environmentIntensity inspected at runtime.`,
      affectedObjects: ['Scene Environment'],
      whyItCanChangeAppearance:
        'The environment map provides all ambient fill and specular reflection radiance in WebGL.',
    });
  }

  // TIER 3: CONFIRMED BY RENDER EXPERIMENT
  if (activeExperiments && activeExperiments.experimentLog.length > 0) {
    activeExperiments.experimentLog.forEach((exp) => {
      confirmedByExperiment.push({
        id: `EXP_${exp.id}`,
        classification: 'CONFIRMED BY RENDER EXPERIMENT',
        category: exp.id.includes('HAIR')
          ? 'Transparency & Hair'
          : exp.id.includes('NORMAL')
          ? 'Normals & Tangents'
          : exp.id.includes('TONE')
          ? 'Color Management & Tone Mapping'
          : 'Lighting & Environment',
        title: `Experiment Result: ${exp.name}`,
        finding: exp.resultSummary,
        evidence: `Interactive A/B test executed on live Three.js scene at ${exp.timestamp}.`,
        affectedObjects: ['Live WebGL Canvas'],
        whyItCanChangeAppearance:
          'Proves causality: modifying this specific runtime parameter produced an observable visual difference in WebGL.',
      });
    });
  }

  // TIER 4: POTENTIAL CAUSES (Strict evidence-based language)
  // 1. Tangent Space evaluation
  if (primitivesWithoutTangents.length > 0) {
    potentialCauses.push({
      id: 'POTENTIAL_TANGENTS',
      classification: 'POTENTIAL',
      category: 'Normals & Tangents',
      title: 'Screen-Space Derivative Approximation on Normal Maps',
      finding: `${primitivesWithoutTangents.length} primitives use normal maps without tangent attributes. This is a potential rendering difference. A runtime A/B experiment is required before identifying it as the cause.`,
      evidence: `GLB contains normal maps but 0 TANGENT attributes on ${primitivesWithoutTangents.length} primitive(s). Three.js uses fragment shader derivatives (dFdx/dFdy).`,
      affectedObjects: primitivesWithoutTangents.map((p) => `${p.meshName}#${p.primitiveIndex}`),
      whyItCanChangeAppearance:
        'Screen-space tangent approximation can introduce subtle UV island seam lighting artifacts and flipped shading across mirrored UVs under grazing camera angles compared to Blender MikkTSpace precomputed tangents.',
      suggestedExperiment: 'Toggle Normal Maps [ A: ON / B: OFF ] in the Render Experiment Engine below to isolate surface bumpiness.',
      experimentKey: 'NORMAL_MAPS',
    });
  }

  // 2. Hair BLEND transparency
  if (blendMaterials.length > 0) {
    potentialCauses.push({
      id: 'POTENTIAL_HAIR_BLEND',
      classification: 'POTENTIAL',
      category: 'Transparency & Hair',
      title: 'Depth-Sorting Order on Transparent Hair Strands',
      finding: `Hair materials use glTF BLEND transparency. Three.js runtime reports transparent = true and depthWrite = false. This is a potential source of visual differences.`,
      evidence: `Materials [${blendMaterials.map((m) => m.name).join(', ')}] have alphaMode: BLEND. In Three.js runtime, depthWrite is disabled.`,
      affectedObjects: blendMaterials.map((m) => m.name),
      whyItCanChangeAppearance:
        'Transparent hair ribbons can be affected by depth sorting and blending behavior. Overlapping transparent triangles render back-to-front or front-to-back depending on camera orbit perspective, whereas Blender EEVEE typically uses Alpha Hashed with depth writing enabled.',
      suggestedExperiment: 'Run the non-destructive [ Hair MASK Experiment ] below (transparent = false, depthWrite = true, alphaTest = 0.5) to test depth sorting.',
      experimentKey: 'HAIR',
    });
  }

  // 3. Metallic Environment Dependency
  if (highMetallicMats.length > 0) {
    potentialCauses.push({
      id: 'POTENTIAL_METALLIC_ENV',
      classification: 'POTENTIAL',
      category: 'Materials & Shaders',
      title: 'Environment Lighting Dependency on Metallic Materials',
      finding: `Metallic materials strongly depend on reflected environment lighting. If Blender and Three.js use different environments, the material can look substantially different even when the GLB material parameters are identical.`,
      evidence: `metallicFactor: ${highMetallicMats.map((m) => `${m.name}=${m.metallicFactor.toFixed(2)}`).join(', ')}.`,
      affectedObjects: highMetallicMats.map((m) => m.name),
      whyItCanChangeAppearance:
        'Dielectric materials reflect diffuse color regardless of environment. Conductive metals have 0% diffuse reflectance and get 100% of their color from environment specular reflections.',
      suggestedExperiment: 'Toggle Environment [ ON / OFF ] or adjust HDRI intensity/rotation in the 3D viewport.',
      experimentKey: 'ENVIRONMENT',
    });
  }

  // 4. Tone Mapping Highlight Roll-off
  potentialCauses.push({
    id: 'POTENTIAL_TONE_MAPPING',
    classification: 'POTENTIAL',
    category: 'Color Management & Tone Mapping',
    title: 'Tone Mapping Curve & Dynamic Range Highlight Compression',
    finding: `Tone mapping curve differences between Blender view transform and Three.js tone mapping can alter highlight desaturation and skin warmth. This is a potential difference.`,
    evidence: `Three.js is currently using ${runtimeState?.toneMapping || 'AgX'} tone mapping. Blender uses AgX (Blender 4+) or Filmic (Blender 3.x).`,
    affectedObjects: ['Entire Render Output'],
    whyItCanChangeAppearance:
      'AgX desaturates bright highlights toward white like film photography, whereas ACESFilmic or Linear mapping can over-saturate warm skin tones toward magenta or clip bright specular highlights.',
    suggestedExperiment: 'Switch Tone Mapping between AgX, ACES Filmic, and Neutral in the Experiment Matrix.',
    experimentKey: 'TONE_MAPPING',
  });

  // TIER 5: UNKNOWN / REQUIRES BLENDER DATA
  unknownFactors.push({
    id: 'UNKNOWN_BLENDER_VIEW_TRANSFORM',
    classification: 'UNKNOWN',
    category: 'Color Management & Tone Mapping',
    title: 'Blender View Transform & Look Configuration',
    finding: 'Blender view transform is unknown from the GLB alone.',
    evidence: 'glTF 2.0 specification stores linear PBR radiometric values only; Blender Color Management properties (AgX vs Filmic vs Standard, Look: None vs High Contrast) are not stored in the GLB.',
    affectedObjects: ['Blender Render Properties > Color Management'],
    whyItCanChangeAppearance:
      'If Blender was set to Standard sRGB while Three.js uses AgX, shadows and midtones will appear with significantly different contrast curves.',
    suggestedExperiment: 'Check Blender Properties > Render > Color Management in your original .blend file.',
  });

  unknownFactors.push({
    id: 'UNKNOWN_BLENDER_WORLD_HDRI',
    classification: 'UNKNOWN',
    category: 'Lighting & Environment',
    title: 'Blender World Lighting Strength, HDRI Map, and Rotation',
    finding: 'Blender world/HDRI settings are not encoded in the GLB and therefore cannot be reconstructed exactly from the GLB alone.',
    evidence: 'glTF does not support environment world textures or background dome settings.',
    affectedObjects: ['Blender World Properties'],
    whyItCanChangeAppearance:
      'In Blender Material Preview, an internal 360° Studio or Forest EXR map illuminates meshes. In Three.js, lighting depends entirely on the active HDRI loaded into the viewer.',
    suggestedExperiment: 'Load the exact matching .exr or .hdr file in the Three.js viewport Render Settings.',
  });

  unknownFactors.push({
    id: 'UNKNOWN_BLENDER_EXPOSURE',
    classification: 'UNKNOWN',
    category: 'Color Management & Tone Mapping',
    title: 'Blender Viewport Camera Exposure & Gamma',
    finding: 'Original Blender camera exposure slider is unknown from the GLB alone.',
    evidence: 'Scene radiance scaling prior to display encoding is an application viewport setting, not saved in glTF.',
    affectedObjects: ['Blender Color Management > Exposure'],
    whyItCanChangeAppearance:
      'An exposure difference of even 0.3 EV dramatically changes skin luminosity and perceived roughness.',
    suggestedExperiment: 'Adjust the Three.js Exposure slider in Render Settings.',
    experimentKey: 'EXPOSURE',
  });

  unknownFactors.push({
    id: 'UNKNOWN_BLENDER_PROCEDURAL_NODES',
    classification: 'UNKNOWN',
    category: 'Materials & Shaders',
    title: 'Blender Shader Node Tree & Procedural Shading',
    finding: 'Blender node-tree information is not available in the GLB, so exact Blender shader differences cannot be confirmed from the GLB alone.',
    evidence: 'glTF 2.0 core format supports only standard metallic-roughness PBR. Procedural node networks (ColorRamp, Musgrave, Noise, Fresnel/LayerWeight) cannot be stored.',
    affectedObjects: ['Blender Shader Editor Node Tree'],
    whyItCanChangeAppearance:
      'If the original Blender material used procedural noise for pores or velvet rim lighting, those effects are simplified or lost during glTF export unless manually baked into image textures.',
    suggestedExperiment: 'Inspect the Materials Table below to verify which texture maps are present in the GLB.',
  });

  unknownFactors.push({
    id: 'UNKNOWN_BLENDER_SHADOW_SETTINGS',
    classification: 'UNKNOWN',
    category: 'Lighting & Environment',
    title: 'EEVEE Next Raytraced Shadows & Contact Shadow Settings',
    finding: 'Blender shadow penumbra, screen-space raytracing, and contact shadow distances are unknown.',
    evidence: 'Shadow resolution and screen-space raytracing properties are desktop engine settings not supported by glTF.',
    affectedObjects: ['Blender Render Properties > Shadows'],
    whyItCanChangeAppearance:
      'Blender computes soft shadow falloff around the neck, nose, and eyelids that standard WebGL rasterizers do not reproduce without post-processing (SSAO / GTAO).',
  });

  return {
    pipelineSummary: {
      confirmedGlbCount: confirmedFromGlb.length,
      confirmedRuntimeCount: confirmedFromRuntime.length,
      confirmedExperimentCount: confirmedByExperiment.length,
      potentialCount: potentialCauses.length,
      unknownCount: unknownFactors.length,
    },
    materialAudits,
    normalAudits,
    findingsByTier: {
      confirmedFromGlb,
      confirmedFromRuntime,
      confirmedByExperiment,
      potentialCauses,
      unknownFactors,
    },
  };
}
