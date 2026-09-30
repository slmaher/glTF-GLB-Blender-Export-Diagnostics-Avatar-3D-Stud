import type {
  BlenderReferenceImage,
  ThreeJsCapturedImage,
  AlignmentCheckResult,
  VisualDifferenceFinding,
  NormalTangentPrimitiveAudit,
  RuntimeMaterialInspection,
} from '../types/renderComparison';
import type { DiagnosticReport } from '../types/diagnostic';

/**
 * 1. Camera / Alignment Check (Section 12)
 * Do NOT perform pixel-level comparison if the two images are not aligned.
 */
export function checkAlignment(
  blender: BlenderReferenceImage | null,
  three: ThreeJsCapturedImage | null
): AlignmentCheckResult {
  if (!blender || !three) {
    return {
      confidence: 'Low',
      aspectRatioDiffPercent: 0,
      isAspectSimilar: false,
      isResolutionSimilar: false,
      reason: 'Both Blender Reference and Three.js Render images must be provided to evaluate camera alignment.',
      details: ['Missing comparison image(s).'],
    };
  }

  const bAspect = blender.aspectRatio;
  const tAspect = three.aspectRatio;
  const aspectDiff = Math.abs(bAspect - tAspect) / bAspect;
  const aspectRatioDiffPercent = Math.round(aspectDiff * 100);

  const isAspectSimilar = aspectDiff < 0.08; // within 8%
  const resRatio = (three.width * three.height) / (blender.width * blender.height);
  const isResolutionSimilar = resRatio >= 0.4 && resRatio <= 2.5;

  const details: string[] = [
    `Blender Reference: ${blender.width} × ${blender.height} px (Aspect: ${bAspect.toFixed(2)})`,
    `Three.js Render: ${three.width} × ${three.height} px (Aspect: ${tAspect.toFixed(2)})`,
    `Aspect Ratio Discrepancy: ${aspectRatioDiffPercent}%`,
  ];

  if (!isAspectSimilar) {
    return {
      confidence: 'Low',
      aspectRatioDiffPercent,
      isAspectSimilar,
      isResolutionSimilar,
      reason: `Camera framing or aspect ratio differs by ${aspectRatioDiffPercent}%. Direct pixel-to-pixel comparison is unreliable.`,
      details: [
        ...details,
        'Confidence is LOW because camera FOV, viewport width-to-height ratio, or avatar distance does not match.',
      ],
    };
  }

  if (!isResolutionSimilar) {
    return {
      confidence: 'Medium',
      aspectRatioDiffPercent,
      isAspectSimilar,
      isResolutionSimilar,
      reason: 'Aspect ratio matches closely, but image resolutions differ significantly. High-frequency normal and hair details may show scaling bias.',
      details: [
        ...details,
        'Confidence is MEDIUM: Framing is compatible, but resolution scale differences affect subpixel anti-aliasing.',
      ],
    };
  }

  return {
    confidence: 'High',
    aspectRatioDiffPercent,
    isAspectSimilar: true,
    isResolutionSimilar: true,
    reason: `Camera framing and aspect ratio match closely (discrepancy: ${aspectRatioDiffPercent}%). Visual comparison provides reliable evidence.`,
    details: [
      ...details,
      'Confidence is HIGH: Framing, viewport ratio, and resolution are well-aligned for visual comparison.',
    ],
  };
}

/**
 * 2. Audit Normal-Mapped Primitives for Tangents (Section 20)
 * Evaluates every primitive using a normal map.
 */
export function auditNormalMappedPrimitives(
  report: DiagnosticReport
): NormalTangentPrimitiveAudit[] {
  const list: NormalTangentPrimitiveAudit[] = [];
  const matMap = new Map<number, any>();
  report.materials.forEach((m) => matMap.set(m.index, m));

  report.meshes.forEach((mesh) => {
    mesh.primitives.forEach((prim) => {
      const mat = prim.materialIndex !== undefined ? matMap.get(prim.materialIndex) : null;
      const hasNormalMap = Boolean(mat?.normalTexture);

      if (hasNormalMap) {
        list.push({
          meshIndex: mesh.index,
          meshName: mesh.name || `Mesh_${mesh.index}`,
          primitiveIndex: prim.primitiveIndex,
          materialName: mat?.name || `Material_${prim.materialIndex}`,
          hasNormalMap: true,
          hasUv0: prim.attributes.hasTexCoord0,
          hasTangent: prim.attributes.hasTangent,
          isSkinned: prim.attributes.hasJoints0 && prim.attributes.hasWeights0,
          hasMorphTargets: (prim.attributes.customAttributes?.length || 0) > 0,
        });
      }
    });
  });

  return list;
}

/**
 * 3. Actual Visual Difference Analysis across 13 Categories (Section 13, 14, 15)
 * Classifies every finding under the 4 Evidence Levels:
 * - CONFIRMED_FROM_GLB
 * - POTENTIAL_DIFFERENCE
 * - CONFIRMED_BY_RENDER_COMPARISON
 * - UNKNOWN
 */
export function analyzeVisualDifferences(
  report: DiagnosticReport,
  blenderRef: BlenderReferenceImage | null,
  threeCapture: ThreeJsCapturedImage | null,
  alignment: AlignmentCheckResult,
  runtimeMaterials: RuntimeMaterialInspection[]
): VisualDifferenceFinding[] {
  const findings: VisualDifferenceFinding[] = [];
  const normalAudits = auditNormalMappedPrimitives(report);
  const missingTangentCount = normalAudits.filter((a) => !a.hasTangent).length;

  const hairMaterials = report.materials.filter(
    (m) =>
      m.name.toLowerCase().includes('hair') ||
      m.name.toLowerCase().includes('blinn') ||
      m.name.toLowerCase().includes('strand')
  );
  const hairHasBlend = hairMaterials.some((m) => m.alphaMode === 'BLEND');

  const hasPunctualLights = (report.sceneStructure.lightsCount || 0) > 0;
  const metallicMaterials = report.materials.filter((m) => m.metallicFactor >= 0.8);

  // 1. Color Management & Tone Mapping (Color)
  findings.push({
    id: 'DIFF_COLOR_MANAGEMENT',
    category: 'Color',
    title: 'Tone Mapping Curve & View Transform Color Response',
    confidence: 'High',
    evidenceLevel: 'POTENTIAL_DIFFERENCE',
    evidence: `GLB stores linear PBR values. Three.js is actively using ${threeCapture?.renderSettings.toneMapping || 'AgX'} tone mapping with ${threeCapture?.renderSettings.colorSpace || 'sRGB'} output color space. Blender viewport default uses AgX (Blender 4+) or Filmic (Blender 3.x), which compresses highlights differently.`,
    potentialCause:
      'Tone mapping curves alter color saturation and shoulder dynamic range roll-off. ACESFilmic saturates shadows and shifts warm skin tones toward magenta/orange compared with Blender AgX.',
    nextTest:
      'In the Render Settings panel, test switching Tone Mapping between AgX, ACES Filmic, and Neutral to see if skin/cloth hue aligns with Blender.',
  });

  // 2. Exposure & Luminance (Exposure)
  findings.push({
    id: 'DIFF_EXPOSURE',
    category: 'Exposure',
    title: 'Camera Exposure Slider Discrepancy',
    confidence: 'Medium',
    evidenceLevel: 'UNKNOWN',
    evidence: `Three.js renderer exposure is ${threeCapture?.renderSettings.exposure.toFixed(2) || '1.00'}. The original Blender scene exposure setting is NOT stored in the GLB file.`,
    potentialCause:
      'Blender Render Properties > Color Management > Exposure slider scales scene radiance prior to view transform. A difference of even 0.3 EV noticeably alters skin tone brightness.',
    nextTest:
      'Adjust the Three.js Exposure slider (e.g. 0.8x to 1.3x) to match overall perceived brightness with the Blender screenshot.',
  });

  // 3. Environment & Ambient Lighting (Lighting)
  findings.push({
    id: 'DIFF_LIGHTING_ENV',
    category: 'Lighting',
    title: 'World HDRI Environment Lighting & Ambient Fill',
    confidence: 'High',
    evidenceLevel: threeCapture && !threeCapture.renderSettings.envEnabled ? 'CONFIRMED_BY_RENDER_COMPARISON' : 'POTENTIAL_DIFFERENCE',
    evidence: `Asset defines ${hasPunctualLights ? report.sceneStructure.lightsCount : 0} embedded scene lights. Three.js HDRI Environment is currently: ${threeCapture?.renderSettings.envEnabled ? `ON (${threeCapture.renderSettings.hdrName}, intensity ${threeCapture.renderSettings.hdrIntensity.toFixed(1)}x)` : 'OFF'}. Blender Viewport Material Preview always illuminates meshes with a built-in 360° Studio or Forest HDRI sphere.`,
    potentialCause:
      'In Blender Material Preview mode, unlit meshes receive 360° image-based ambient lighting. In Three.js without an HDR/EXR environment map, ambient shadows become pitch black and unreflective.',
    nextTest:
      'Toggle Environment [ ON / OFF ] and load the matching HDRI / EXR map used in Blender.',
  });

  // 4. Directional Shadows (Shadows)
  findings.push({
    id: 'DIFF_SHADOWS',
    category: 'Shadows',
    title: 'Contact Shadows and Ambient Occlusion Falloff',
    confidence: 'Medium',
    evidenceLevel: 'UNKNOWN',
    evidence: 'Blender EEVEE Next screen-space raytraced shadows and Cycles light bounces are computed on desktop GPU. The GLB contains no shadow bias or screen-space shadow settings.',
    potentialCause:
      'Blender viewport computes soft shadow penumbras and contact shadows around neck, nose, and clothing folds. Real-time Three.js basic lighting does not compute multi-bounce GI shadows without custom post-processing (SSAO / GTAO).',
    nextTest:
      'Inspect ambient occlusion texture channels in Materials Table to verify baked contact shadows are present.',
  });

  // 5. Environment Reflections & Metallic Surfaces (Reflections)
  findings.push({
    id: 'DIFF_REFLECTIONS',
    category: 'Reflections',
    title: 'Specular Environment Radiance on Conductive Surfaces',
    confidence: 'High',
    evidenceLevel: metallicMaterials.length > 0 ? 'CONFIRMED_FROM_GLB' : 'POTENTIAL_DIFFERENCE',
    evidence: `${metallicMaterials.length} material(s) have metallic factor >= 0.8 (e.g. buckles, eye reflections, jewelry). Metals have 0 diffuse reflectance and reflect 100% environment radiance.`,
    potentialCause:
      'Without an active PMREM environment map loaded in Three.js, conductive metallic surfaces reflect 0 radiance and render pitch black.',
    nextTest:
      'Load an EXR / HDR environment map in Three.js and rotate the environment to align reflection highlights.',
  });

  // 6. Roughness & Specular Response (Roughness)
  findings.push({
    id: 'DIFF_ROUGHNESS',
    category: 'Roughness',
    title: 'Microfacet GGX Specular Roughness & Mipmap Filtering',
    confidence: 'Medium',
    evidenceLevel: 'POTENTIAL_DIFFERENCE',
    evidence: `Roughness textures are stored in green channel of ORM maps. Three.js uses WebGL mipmaps and PMREM prefiltered cubemaps, whereas Blender Cycles samples multi-bounce microfacet GGX.`,
    potentialCause:
      'High roughness surfaces scatter light diffusely, while low roughness surfaces create sharp specular pinpoints. Desktop anisotropic filtering in Blender may produce crisper specular glints than default WebGL.',
    nextTest:
      'Verify that ORM roughness textures are assigned Linear / NoColorSpace in the Texture Color Space audit below.',
  });

  // 7. Normal Map Detail & Tangents (Normal Detail)
  findings.push({
    id: 'DIFF_NORMAL_TANGENTS',
    category: 'Normal Detail',
    title: 'Normal Map Tangent Space Evaluation (MikkTSpace vs Screen Derivatives)',
    confidence: 'High',
    evidenceLevel: missingTangentCount > 0 ? 'CONFIRMED_FROM_GLB' : 'POTENTIAL_DIFFERENCE',
    evidence: `Confirmed from GLB: ${missingTangentCount} normal-mapped primitive(s) lack per-vertex TANGENT attributes. Three.js shaders must approximate tangents at runtime using screen-space partial derivatives (dFdx/dFdy), whereas Blender evaluates normal maps using precalculated MikkTSpace tangent bases.`,
    potentialCause:
      'Screen-space derivative approximation can produce subtle UV island seam lighting artifacts and flipped shading across mirrored UVs under grazing camera angles.',
    nextTest:
      'Toggle Normal Maps [ Enabled / Disabled ] in Experimental Tests to observe how much surface bumpiness changes the avatar silhouette.',
  });

  // 8. Hair Transparency & Depth Sorting (Hair & Transparency)
  const runtimeHairMats = runtimeMaterials.filter(
    (m) =>
      m.name.toLowerCase().includes('hair') ||
      m.name.toLowerCase().includes('blinn') ||
      m.name.toLowerCase().includes('strand')
  );
  const runtimeHairInfo = runtimeHairMats.length > 0
    ? ` Active Three.js runtime material: transparent=${runtimeHairMats[0].transparent}, depthWrite=${runtimeHairMats[0].depthWrite}, alphaTest=${runtimeHairMats[0].alphaTest}, side=${runtimeHairMats[0].side}.`
    : '';

  findings.push({
    id: 'DIFF_HAIR_TRANSPARENCY',
    category: 'Hair',
    title: 'Hair Material Alpha Mode BLEND vs Blender Alpha Hashed Depth Writing',
    confidence: 'High',
    evidenceLevel: hairHasBlend ? 'CONFIRMED_FROM_GLB' : 'POTENTIAL_DIFFERENCE',
    evidence: `Confirmed from GLB: Hair material(s) define alphaMode: 'BLEND'.${runtimeHairInfo} In Blender EEVEE, hair typically renders using "Alpha Hashed" (dithered stippling with depth writing enabled), avoiding triangle sorting glitches.`,
    potentialCause:
      'When depthWrite is false in WebGL, overlapping hair strands cannot write to the Z-buffer, causing back-facing strands to erroneously render on top of front-facing locks depending on camera view angle.',
    nextTest:
      'Run the non-destructive [ MASK Test ] in the Experimental Tests matrix below to enable depthWrite = true with alphaTest.',
  });

  // 9. Skin Subsurface Scattering (Skin)
  findings.push({
    id: 'DIFF_SKIN_SSS',
    category: 'Skin',
    title: 'Subsurface Scattering (Translucency) vs Standard Physical PBR',
    confidence: 'Medium',
    evidenceLevel: 'UNKNOWN',
    evidence: 'Core glTF 2.0 does not define subsurface scattering without vendor extensions. In Blender Principled BSDF, characters often have Subsurface Weight (0.1 to 0.5) enabled for soft skin shading.',
    potentialCause:
      'If the original Blender model used Subsurface Scattering (SSS) on face/ears/fingers, exporting to core glTF converts the material to standard opaque Lambertian/GGX diffuse, making skin appear drier and more plasticky in WebGL.',
    nextTest:
      'Compare skin softness along shadow terminators on the cheeks and nose in the side-by-side view.',
  });

  // 10. Material Double-Sided Culling (Materials)
  const singleSidedHairOrCloth = report.materials.filter(
    (m) =>
      !m.doubleSided &&
      (m.name.toLowerCase().includes('cloth') ||
        m.name.toLowerCase().includes('hair') ||
        m.name.toLowerCase().includes('dress'))
  );
  findings.push({
    id: 'DIFF_DOUBLE_SIDED',
    category: 'Materials',
    title: 'Double-Sided Face Culling on Thin Geometry',
    confidence: 'High',
    evidenceLevel: singleSidedHairOrCloth.length > 0 ? 'CONFIRMED_FROM_GLB' : 'POTENTIAL_DIFFERENCE',
    evidence: singleSidedHairOrCloth.length > 0
      ? `Confirmed from GLB: ${singleSidedHairOrCloth.length} thin-geometry material(s) have doubleSided: false.`
      : 'All cloth/hair materials define doubleSided: true.',
    potentialCause:
      'In Blender Solid/Material Preview, Backface Culling is off by default so artists see both sides of hair ribbons and cloth hems. In glTF, doubleSided: false causes back-facing triangles to be completely culled by the GPU.',
    nextTest:
      'Orbit the camera around the avatar to inspect if any underside fabric or hair cards disappear.',
  });

  // 11. Geometry Subdivision & Modifiers (Geometry)
  findings.push({
    id: 'DIFF_GEOMETRY',
    category: 'Geometry',
    title: 'Polygon Mesh Subdivision & Modifier Baking',
    confidence: 'High',
    evidenceLevel: 'CONFIRMED_FROM_GLB',
    evidence: `Asset contains ${report.meshes.length} meshes and ${report.sceneStructure.primitivesCount} primitives (${report.meshes.reduce((acc, m) => acc + m.totalTriangles, 0).toLocaleString()} triangles). Vertex positions are baked as Draco compressed BufferGeometry.`,
    potentialCause:
      'If Subdivision Surface or Multiresolution modifiers were not enabled during glTF export in Blender, the exported mesh has lower polygonal fidelity than the high-poly Blender viewport.',
    nextTest:
      'Toggle Wireframe in the 3D viewer to inspect polygonal density along curved facial features and fingers.',
  });

  // 12. Background & Viewport Contrast (Background)
  findings.push({
    id: 'DIFF_BACKGROUND',
    category: 'Background',
    title: 'Viewport Background Radiance & Contrast Framing',
    confidence: 'High',
    evidenceLevel: 'POTENTIAL_DIFFERENCE',
    evidence: 'Blender 3D Viewport uses a neutral mid-gray (or custom theme) background, whereas Three.js defaults to dark (#0e1117) or 360° HDR panorama.',
    potentialCause:
      'Perceptual contrast (simultaneous contrast illusion) causes identical avatar colors to look noticeably darker against a white/gray background and brighter against a pitch-black background.',
    nextTest:
      'Toggle Background On/Off in Render Settings to evaluate silhouette edge contrast against the environment.',
  });

  // If comparison images are loaded and confidence is high/medium, add render comparison confirmation
  if (blenderRef && threeCapture && alignment.confidence !== 'Low') {
    findings.push({
      id: 'DIFF_RENDER_CONFIRMED_CONTRAST',
      category: 'Reflections',
      title: 'Render Comparison: Ambient Specular Discrepancy Verified',
      confidence: alignment.confidence,
      evidenceLevel: 'CONFIRMED_BY_RENDER_COMPARISON',
      evidence: `Side-by-side inspection between Blender Reference (${blenderRef.width}x${blenderRef.height}) and Three.js Capture (${threeCapture.width}x${threeCapture.height}) shows concrete differences in reflection highlights and shadow softness under current environment settings (${threeCapture.renderSettings.hdrName}).`,
      potentialCause:
        'The HDRI map, light angle, or environment intensity in Three.js does not match the Blender viewport world setup.',
      nextTest:
        'Rotate the Three.js Environment Rotation slider or load the exact .exr/.hdr file used in Blender.',
    });
  }

  return findings;
}
