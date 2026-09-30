import type { TextureAnalysis, MaterialAnalysis, FileInfo } from '../../types/diagnostic';
import type { CompatibilityFinding, DeductionItem } from '../../types/compatibility';

export function analyzeColorManagement(
  materials: MaterialAnalysis[],
  _textures: TextureAnalysis[],
  fileInfo: FileInfo,
  _gltfRaw: any
): { findings: CompatibilityFinding[]; deductions: DeductionItem[] } {
  const findings: CompatibilityFinding[] = [];
  const deductions: DeductionItem[] = [];

  const isBlenderExport =
    fileInfo.generator?.toLowerCase().includes('blender') ||
    fileInfo.generator?.toLowerCase().includes('khronos gltf blender');

  // 1. Core View Transform Mismatch: AgX / Filmic vs Three.js Tone Mapping
  findings.push({
    id: 'COLOR_VIEW_TRANSFORM_PIPELINE',
    category: 'Color Management',
    severity: 'warning',
    title: 'Tone Mapping & View Transform Discrepancy (Blender AgX vs WebGL ACES/Linear)',
    affectedItem: 'Entire Scene Color Pipeline',
    problem:
      'Blender viewport renders through AgX (Blender 4.0+) or Filmic (Blender 2.8-3.6) tone mapping, which is NOT embedded in the GLB file.',
    evidence: `File generator: "${fileInfo.generator || 'Unknown'}". The glTF 2.0 specification contains no fields for view transforms or tone mapping operators.`,
    whyItMatters:
      'In Blender 4.0+, the default Color Management "View Transform" is AgX. AgX provides broad dynamic range compression with gradual desaturation in extreme highlights, preventing color clipping. Three.js applications frequently use ACESFilmicToneMapping (which produces much higher contrast and oversaturated reddish/golden skin tones) or LinearToneMapping (which produces blown-out white specular spots). This is the #1 single cause of visual disparity between Blender and Three.js renders.',
    expectedBlenderBehavior:
      'Smooth cinematic highlight roll-off and natural color saturation via AgX / Filmic view transform.',
    expectedThreeJsBehavior:
      'Often appears either oversaturated, excessively contrasty (with ACESFilmic), or harsh and washed out (with LinearToneMapping).',
    recommendedFix:
      'In your Three.js application setup, configure renderer.toneMapping = THREE.AgXToneMapping (available in Three.js r160+) or THREE.ACESFilmicToneMapping with renderer.toneMappingExposure = 0.9 - 1.1, and renderer.outputColorSpace = THREE.SRGBColorSpace.',
  });
  deductions.push({
    reason: 'Scene relies on external tone-mapping pipeline (Blender AgX/Filmic vs Three.js)',
    points: 10,
  });

  // 2. Texture Color Spaces (sRGB vs Linear)
  const hasBaseColor = materials.some((m) => !!m.baseColorTexture);
  const hasNormalOrPbr = materials.some(
    (m) => !!m.normalTexture || !!m.metallicRoughnessTexture || !!m.occlusionTexture
  );

  if (hasBaseColor && hasNormalOrPbr) {
    findings.push({
      id: 'COLOR_SPACE_ENCODINGS',
      category: 'Color Management',
      severity: 'info',
      title: 'Dual Texture Color Space Requirements (sRGB Albedo vs Linear Data)',
      affectedItem: 'glTF Texture Samplers & WebGL Shader Pipelines',
      problem:
        'Base Color textures require sRGB-to-Linear conversion in shaders, whereas Normal, Roughness, and Metallic textures must remain strictly Linear.',
      evidence: `Asset includes both visual color maps (sRGB) and physical data maps (Linear).`,
      whyItMatters:
        'The glTF specification mandates that BaseColor and Emissive textures are sRGB encoded, while Normal, Roughness, Metallic, and AO textures are Linear floats. If a Three.js developer assigns a normal map or roughness map with texture.colorSpace = THREE.SRGBColorSpace, the values will be gamma-corrected twice, destroying the PBR metallic balance and perturbing surface normals incorrectly.',
      expectedBlenderBehavior:
        'Blender Principled BSDF enforces "sRGB" for color inputs and "Non-Color" for data inputs.',
      expectedThreeJsBehavior:
        'Three.js GLTFLoader correctly sets map.colorSpace = THREE.SRGBColorSpace and normalMap.colorSpace = THREE.NoColorSpace automatically.',
      recommendedFix:
        'When creating custom Three.js shader passes or manually swapping textures at runtime, ensure data textures use THREE.NoColorSpace and albedo textures use THREE.SRGBColorSpace.',
    });
  }

  // 3. Unbaked Compositor Color Grading
  if (isBlenderExport) {
    findings.push({
      id: 'COLOR_COMPOSITOR_UNVERIFIABLE',
      category: 'Color Management',
      severity: 'info',
      title: 'Blender Compositor & Exposure Settings Cannot Be Verified From GLB',
      affectedItem: 'Blender Compositor Post-Processing Nodes',
      problem:
        'Any color balance, exposure, curve adjustments, or vignette nodes in Blender’s Compositor are not exported.',
      evidence: 'glTF 2.0 does not support Blender scene-level compositor graphs.',
      whyItMatters:
        'If the artist judged the model’s appearance in Blender using post-processing compositor nodes (Color Balance, RGB Curves, Exposure, Glare), the raw exported GLB will look flatter in WebGL because those post-processing effects are absent from the file.',
      expectedBlenderBehavior:
        'Renders with post-processing curves and exposure multipliers applied in Blender.',
      expectedThreeJsBehavior: 'Renders the raw PBR texture and lighting values without post-processing.',
      recommendedFix:
        'Match Blender compositor adjustments in Three.js using postprocessing passes (e.g. EffectComposer with ColorCorrectionShader or LUTPass).',
    });
  }

  return { findings, deductions };
}
