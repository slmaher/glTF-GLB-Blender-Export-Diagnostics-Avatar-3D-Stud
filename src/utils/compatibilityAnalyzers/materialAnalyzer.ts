import type { MaterialAnalysis, MeshAnalysis, FileInfo } from '../../types/diagnostic';
import type { CompatibilityFinding, DeductionItem } from '../../types/compatibility';

export function analyzeMaterials(
  materials: MaterialAnalysis[],
  meshes: MeshAnalysis[],
  fileInfo: FileInfo,
  gltfRaw: any
): { findings: CompatibilityFinding[]; deductions: DeductionItem[] } {
  const findings: CompatibilityFinding[] = [];
  const deductions: DeductionItem[] = [];

  const rawMaterials = gltfRaw?.materials || [];
  const isBlenderExport =
    fileInfo.generator?.toLowerCase().includes('blender') ||
    fileInfo.generator?.toLowerCase().includes('khronos gltf blender');

  materials.forEach((mat) => {
    const rawMat = rawMaterials[mat.index] || {};
    const rawExtensions = rawMat.extensions || {};
    const rawExtras = rawMat.extras || {};

    // 1. Alpha Mode BLEND vs Blender Alpha Hashed
    if (mat.alphaMode === 'BLEND') {
      findings.push({
        id: `MAT_ALPHA_BLEND_${mat.index}`,
        category: 'Materials & Shaders',
        severity: 'warning',
        title: `Alpha Mode BLEND Causes WebGL Depth Sorting Glitches`,
        affectedItem: `Material "${mat.name}" (index ${mat.index})`,
        problem: `Material uses alphaMode: 'BLEND', which turns off WebGL depth writing in Three.js.`,
        evidence: `alphaMode is explicitly set to 'BLEND' in glTF material definition.`,
        whyItMatters:
          'In Blender EEVEE, alpha transparency often uses "Alpha Hashed" (dithered stippling with depth writing enabled) or Cycles raytracing, which eliminates transparent polygon self-overlap sorting glitches. In WebGL / Three.js, alphaMode: BLEND sets material.depthWrite = false, causing back surfaces or internal geometry to render unpredictably in front of foreground polygons.',
        expectedBlenderBehavior:
          'Blender displays smoothly ordered transparency using depth-aware stochastic hashing or multi-bounce Cycles ray tracing.',
        expectedThreeJsBehavior:
          'Three.js sorts meshes by center distance, but cannot sort intersecting or concave transparent triangles, producing visible polygon sorting flicker.',
        recommendedFix:
          'In Blender Material Settings > Settings > Blend Mode: If the texture has sharp cutouts (e.g. hair strands, foliage, decals), switch to "Alpha Clip" (glTF MASK with alphaCutoff). If full alpha gradient is required, separate the mesh into outer and inner convex shells.',
      });
      deductions.push({
        reason: `Material "${mat.name}" uses alphaMode 'BLEND' (risk of WebGL sorting glitches)`,
        points: 8,
      });
    }

    // 2. High Metallic with Dark Base Color (Render-Environment Compatibility)
    const baseRgb = mat.baseColorFactor ? mat.baseColorFactor.slice(0, 3) : [1, 1, 1];
    const luminance = 0.2126 * baseRgb[0] + 0.7152 * baseRgb[1] + 0.0722 * baseRgb[2];
    const isDarkBase = luminance <= 0.25;
    const hasPunctualLights = (gltfRaw?.extensions?.KHR_lights_punctual?.lights?.length || 0) > 0;

    if (mat.metallicFactor >= 0.85 && isDarkBase && !hasPunctualLights) {
      findings.push({
        id: `MAT_METALLIC_MIRROR_${mat.index}`,
        category: 'Materials & Shaders',
        severity: 'info',
        title: `Material Dependent on Environment Reflections (Metallic ≈ 1, Dark Base Color)`,
        affectedItem: `Material "${mat.name}" (index ${mat.index})`,
        problem: `This material is highly dependent on environment reflections. Without an environment map it may appear very dark or black in Three.js.`,
        evidence: `metallicFactor: ${mat.metallicFactor.toFixed(2)}, baseColor luminance: ${luminance.toFixed(2)}, scene lights: 0.`,
        whyItMatters:
          'Standard physical PBR dictates that 100% conductive metals possess zero diffuse albedo and reflect 100% specular environment radiance. In Blender Viewport "Material Preview" mode, a default 360° Studio or Forest HDRI is always active. In standard Three.js without an HDR Equirectangular texture assigned to scene.environment, metallic surfaces reflect no light and appear pitch black. This is a render-environment compatibility requirement, not an asset corruption error.',
        expectedBlenderBehavior:
          'Reflects the built-in Blender Viewport Studio HDRI sphere with bright specular reflections.',
        expectedThreeJsBehavior:
          'Renders nearly pitch black if the web scene lacks an active HDR environment map on scene.environment.',
        recommendedFix:
          'Ensure your Three.js viewer or application enables an HDR environment map (e.g. RGBELoader studio.hdr) assigned to scene.environment.',
      });
      // Do NOT classify as an asset error or deduct health points - it is a render-environment compatibility advisory.
    }

    // 3. Double-Sided Flag Mismatch (Backface Culling)
    if (!mat.doubleSided) {
      // Check if any mesh using this material is single-layer (leaves, cloth, paper)
      const matMeshes = meshes.filter((m) =>
        m.primitives.some((p) => p.materialIndex === mat.index)
      );
      const isSuspectedSinglePlane = matMeshes.some(
        (m) =>
          m.name.toLowerCase().includes('leaf') ||
          m.name.toLowerCase().includes('cloth') ||
          m.name.toLowerCase().includes('hair') ||
          m.name.toLowerCase().includes('grass') ||
          m.name.toLowerCase().includes('plane') ||
          mat.name.toLowerCase().includes('leaf') ||
          mat.name.toLowerCase().includes('hair') ||
          mat.name.toLowerCase().includes('cloth')
      );

      if (isSuspectedSinglePlane) {
        findings.push({
          id: `MAT_DOUBLE_SIDED_FALSE_${mat.index}`,
          category: 'Materials & Shaders',
          severity: 'warning',
          title: `Double-Sided is FALSE on Thin Geometry (Backface Culling Active)`,
          affectedItem: `Material "${mat.name}" (index ${mat.index})`,
          problem: `Single-plane geometry material has doubleSided: false.`,
          evidence: `doubleSided: false in glTF material definition on thin geometry (${mat.name}).`,
          whyItMatters:
            'In Blender 3D Viewport, "Backface Culling" is disabled by default in Solid and Material Preview modes, allowing artists to see both sides of single-layer planes (clothing, hair cards, foliage). In glTF and Three.js, doubleSided defaults to false. Back-facing polygons are culled by the GPU, causing surfaces to appear hollow or completely invisible from behind.',
          expectedBlenderBehavior: 'Both front and back faces are rendered and visible in Blender.',
          expectedThreeJsBehavior: 'Back-facing triangles are discarded during rasterization.',
          recommendedFix:
            'In Blender Material Properties > Settings > Surface, check "Double-Sided" before exporting, or enable material.side = THREE.DoubleSide in Three.js.',
        });
        deductions.push({
          reason: `Material "${mat.name}" has doubleSided disabled on suspected thin geometry`,
          points: 5,
        });
      }
    }

    // 4. Emissive Intensity > 1.0 without KHR_materials_emissive_strength
    const maxEmissive = Math.max(...mat.emissiveFactor);
    const hasEmissiveStrength = !!rawExtensions.KHR_materials_emissive_strength;
    if (maxEmissive > 0 && !hasEmissiveStrength) {
      findings.push({
        id: `MAT_EMISSIVE_NO_STRENGTH_${mat.index}`,
        category: 'Materials & Shaders',
        severity: 'info',
        title: `Emissive Output Clamped to 1.0 (No KHR_materials_emissive_strength)`,
        affectedItem: `Material "${mat.name}" (index ${mat.index})`,
        problem: `Material emits light (${mat.emissiveFactor.join(', ')}) but does not use the glTF emissive strength extension.`,
        evidence: `emissiveFactor: [${mat.emissiveFactor.map((v) => v.toFixed(2)).join(', ')}], KHR_materials_emissive_strength is absent.`,
        whyItMatters:
          'In Blender EEVEE and Cycles, Principled BSDF Emissive Emission Strength can be boosted to 10, 50, or 500 Watts for intense bloom. In core glTF 2.0, emissiveFactor is strictly normalized between [0.0, 1.0]. Without KHR_materials_emissive_strength, any HDR intensity set in Blender is clipped to 1.0 upon export, losing its glow appearance in WebGL unless post-processing bloom is manually configured.',
        expectedBlenderBehavior: 'High intensity emission glowing with bloom/glare in EEVEE/Cycles.',
        expectedThreeJsBehavior:
          'Standard non-bloomed solid color clamped to maximum 1.0 luminance in WebGL.',
        recommendedFix:
          'Enable "Export glTF Extensions > KHR_materials_emissive_strength" in the Blender glTF exporter, or manually adjust material.emissiveIntensity in Three.js alongside UnrealBloomPass.',
      });
    }

    // 5. Advanced PBR Extensions (Transmission, Volume, Clearcoat, IOR)
    const hasTransmission = !!rawExtensions.KHR_materials_transmission;
    const hasVolume = !!rawExtensions.KHR_materials_volume;
    const hasClearcoat = !!rawExtensions.KHR_materials_clearcoat;
    const hasIor = !!rawExtensions.KHR_materials_ior;
    const hasSpecular = !!rawExtensions.KHR_materials_specular;

    if (hasTransmission) {
      findings.push({
        id: `MAT_TRANSMISSION_${mat.index}`,
        category: 'Materials & Shaders',
        severity: 'info',
        title: `Optical Glass Transmission Requires High-End WebGL Physical Pass`,
        affectedItem: `Material "${mat.name}" (index ${mat.index})`,
        problem: `Material utilizes KHR_materials_transmission extension.`,
        evidence: `KHR_materials_transmission present in material extensions.`,
        whyItMatters:
          'In Blender Cycles, transmission performs physically accurate ray-marched optical refraction with caustic bounces. In Three.js, MeshPhysicalMaterial transmission relies on a screen-space render target copy pass. It will only refract objects that were already rendered in the background buffer (render order dependency) and will not refract other refractive objects behind it.',
        expectedBlenderBehavior: 'Full recursive refraction through glass with internal caustics.',
        expectedThreeJsBehavior:
          'Screen-space background refraction texture; other transmissive objects behind it may fail to refract.',
        recommendedFix:
          'Ensure Three.js uses MeshPhysicalMaterial with transmission = 1.0, configure roughness appropriately, and verify renderOrder so background objects render before glass meshes.',
      });
    }

    if (hasVolume && !hasTransmission) {
      findings.push({
        id: `MAT_VOLUME_NO_TRANS_${mat.index}`,
        category: 'Materials & Shaders',
        severity: 'warning',
        title: `Volume Absorption Defined Without Transmission`,
        affectedItem: `Material "${mat.name}" (index ${mat.index})`,
        problem: `KHR_materials_volume extension is used, but KHR_materials_transmission is not enabled.`,
        evidence: `KHR_materials_volume is present; transmission is 0.`,
        whyItMatters:
          'In glTF and Three.js, volume absorption (thickness, attenuation distance) requires transmission to be visually rendered. Without transmission, volume properties have no effect.',
        expectedBlenderBehavior: 'Blender material might show subsurface or volume absorption.',
        expectedThreeJsBehavior: 'Three.js ignores volume properties on opaque materials.',
        recommendedFix:
          'Enable Transmission in the Blender Principled BSDF or remove the volume extension from opaque materials.',
      });
      deductions.push({
        reason: `Material "${mat.name}" has volume extension on non-transmissive material`,
        points: 4,
      });
    }

    if (hasClearcoat) {
      findings.push({
        id: `MAT_CLEARCOAT_${mat.index}`,
        category: 'Materials & Shaders',
        severity: 'info',
        title: `Clearcoat Car-Paint Layer Uses KHR_materials_clearcoat`,
        affectedItem: `Material "${mat.name}" (index ${mat.index})`,
        problem: `Material defines secondary reflective clearcoat layer.`,
        evidence: `KHR_materials_clearcoat present in material extensions.`,
        whyItMatters:
          'In Blender, Clearcoat is a native slider in Principled BSDF. In Three.js, rendering clearcoat requires MeshPhysicalMaterial with roughness sampling on the secondary specular lobe.',
        expectedBlenderBehavior: 'Evaluated clearcoat shine over base PBR albedo.',
        expectedThreeJsBehavior: 'Requires MeshPhysicalMaterial clearcoat = 1.0.',
        recommendedFix: 'Verify Three.js uses MeshPhysicalMaterial and environmental reflections are active.',
      });
    }

    if (hasIor || hasSpecular) {
      findings.push({
        id: `MAT_SPECULAR_IOR_${mat.index}`,
        category: 'Materials & Shaders',
        severity: 'info',
        title: `Custom Index of Refraction / Specular Intensity Defined`,
        affectedItem: `Material "${mat.name}" (index ${mat.index})`,
        problem: `Material uses KHR_materials_ior or KHR_materials_specular.`,
        evidence: `Extensions: ${[hasIor ? 'KHR_materials_ior' : '', hasSpecular ? 'KHR_materials_specular' : ''].filter(Boolean).join(', ')}.`,
        whyItMatters:
          'Standard glTF 2.0 assumes default dielectric F0 reflectance of 4% (IOR 1.5). Non-standard IOR or specular tinted highlights in Blender require MeshPhysicalMaterial in Three.js.',
        expectedBlenderBehavior: 'Custom dielectric reflectance curve evaluated in Cycles/EEVEE.',
        expectedThreeJsBehavior: 'Supported in Three.js MeshPhysicalMaterial via ior and specularIntensity properties.',
        recommendedFix: 'Ensure MeshPhysicalMaterial is used in Three.js with correct IOR properties.',
      });
    }
    const proceduralNamePatterns = /(noise|voronoi|musgrave|wave|procedural|colorramp|ramp|gradient|proc|shadernode|mixrgb|mapping|generated|brick|checker|magic)/i;
    const nameMatchesProcedural = proceduralNamePatterns.test(mat.name);
    const extrasString = JSON.stringify(rawExtras).toLowerCase();
    const extrasMatchesProcedural = proceduralNamePatterns.test(extrasString);

    // Look for evidence that material was complex procedural in Blender but exported as flat PBR
    const hasAnyTexture =
      !!mat.baseColorTexture ||
      !!mat.normalTexture ||
      !!mat.metallicRoughnessTexture ||
      !!mat.occlusionTexture ||
      !!mat.emissiveTexture;

    if (nameMatchesProcedural || extrasMatchesProcedural) {
      findings.push({
        id: `PROCEDURAL_SHADER_${mat.index}`,
        category: 'Procedural Shaders',
        severity: 'warning',
        title: `Procedural Shader Signature Detected on Material "${mat.name}"`,
        affectedItem: `Material "${mat.name}" (index ${mat.index})`,
        problem: `Material identifier or metadata hints at an original Blender procedural shader tree.`,
        evidence: `Material name "${mat.name}" matches procedural node patterns (${nameMatchesProcedural ? 'name match' : 'metadata match'}). Textures attached: ${hasAnyTexture ? 'Yes (Baked/Exported)' : 'None (Only constant PBR factors)'}.`,
        whyItMatters:
          'Blender procedural shader nodes (e.g. Noise Texture, Voronoi, Musgrave, ColorRamp, Mix Shader, Object/Generated Coordinates, Vector Math) DO NOT exist in the glTF 2.0 specification. If these nodes were not explicitly baked into image textures prior to export, the procedural variance is permanently absent from the GLB and replaces complex surfaces with flat constant PBR color factors.',
        expectedBlenderBehavior:
          'Dynamic infinite-resolution mathematical procedural patterns, organic gradients, and noise bumps.',
        expectedThreeJsBehavior: hasAnyTexture
          ? 'Renders the baked image texture resolution.'
          : 'Renders a single flat untextured color with uniform metallic/roughness.',
        recommendedFix:
          'In Blender, bake the procedural shader output (Base Color, Roughness, Normal) onto an image texture with UV coordinates before exporting to glTF.',
      });
      deductions.push({
        reason: `Material "${mat.name}" contains procedural shader indicators that may not match Blender`,
        points: 7,
      });
    } else if (!hasAnyTexture && isBlenderExport) {
      // Check if mesh has high detail but material is completely untextured
      const usingMeshes = meshes.filter((m) =>
        m.primitives.some((p) => p.materialIndex === mat.index)
      );
      const totalTris = usingMeshes.reduce((acc, m) => acc + m.totalTriangles, 0);

      if (totalTris > 2000 && !mat.name.toLowerCase().includes('default')) {
        findings.push({
          id: `POSSIBLE_UNBAKED_PROCEDURAL_${mat.index}`,
          category: 'Procedural Shaders',
          severity: 'info',
          title: `Detailed Mesh Uses Constant Color Material (Possible Unbaked Procedural)`,
          affectedItem: `Material "${mat.name}" on ${usingMeshes.map((m) => m.name).join(', ')}`,
          problem: `Complex mesh (${totalTris.toLocaleString()} triangles) has zero image textures attached to material "${mat.name}".`,
          evidence: `No baseColor, normal, or roughness textures found. BaseColorFactor is [${mat.baseColorFactor.map((v) => v.toFixed(2)).join(', ')}].`,
          whyItMatters:
            'In Blender, complex hero assets frequently employ procedural procedural materials (e.g. procedural noise bump, edge wear, or color gradients). When exported without texture baking, glTF only preserves the root Principled BSDF baseColorFactor, discarding procedural node trees without throwing an error.',
          expectedBlenderBehavior: 'Rich surface variation if procedural nodes were connected in Blender.',
          expectedThreeJsBehavior: 'Completely uniform flat surface shading.',
          recommendedFix:
            'Verify in Blender whether this material used shader node networks. If yes, bake them to PBR image maps.',
        });
      }
    }
  });

  return { findings, deductions };
}
