import type { CompatibilityFinding, DeductionItem } from '../../types/compatibility';

export function analyzeLighting(
  gltfRaw: any
): {
  findings: CompatibilityFinding[];
  deductions: DeductionItem[];
  lightingReconstructible: boolean;
  lightingDisclaimer: string;
} {
  const findings: CompatibilityFinding[] = [];
  const deductions: DeductionItem[] = [];

  const rawExtensionsUsed = (gltfRaw?.extensionsUsed as string[]) || [];
  const punctualExtension = gltfRaw?.extensions?.KHR_lights_punctual;
  const rawLights = punctualExtension?.lights || [];
  const hasPunctualLights = rawExtensionsUsed.includes('KHR_lights_punctual') && rawLights.length > 0;

  // Crucial requirement: Check if Blender lighting can be reconstructed
  // glTF 2.0 does not have a standard specification for exporting Blender's World background HDRI or ambient IBL probes.
  const lightingReconstructible = false;
  const lightingDisclaimer =
    'Blender scene lighting cannot be fully reconstructed from this GLB. The glTF 2.0 standard does not embed Blender’s World HDRI environment, ambient bounce radiance, or Viewport Material Preview lighting. Three.js must provide its own lighting and IBL environment setup, which may result in visual differences even when the model and materials are technically 100% identical.';

  // 1. Mandatory Disclaimer Finding
  findings.push({
    id: 'LIGHTING_WORLD_HDRI_MISSING',
    category: 'Lighting & Environment',
    severity: 'warning',
    title: 'Blender Scene Lighting Cannot Be Fully Reconstructed from This GLB',
    affectedItem: 'World Environment & Ambient Radiance',
    problem:
      'The GLB does not and cannot contain Blender’s original World HDRI environment map, ambient bounce probes, or Material Preview studio dome.',
    evidence:
      'glTF 2.0 core format has no mechanism to serialize 360° Equirectangular World backgrounds or spherical harmonic irradiance coefficients.',
    whyItMatters:
      'In Blender, both EEVEE and Cycles rely heavily on World IBL (Image-Based Lighting) to illuminate every face and specular reflection. In Three.js, a mesh rendered without an HDR environment texture (scene.environment) receives zero ambient reflection, turning metallic surfaces pitch black and shadows unnaturally harsh. This environmental void is a primary factor in renders appearing different between Blender and WebGL.',
    expectedBlenderBehavior:
      'Model is illuminated by 360° multi-directional ambient photons from Blender’s World shader or default viewport studio HDRI.',
    expectedThreeJsBehavior:
      'Dependent entirely on the host web developer’s Three.js scene lighting setup (e.g. ambient lights, directional lights, or custom HDR).',
    recommendedFix:
      'Export Blender’s World HDRI as a separate .hdr or .exr file, and load it in Three.js using RGBELoader into scene.environment and scene.background.',
  });
  deductions.push({
    reason: 'Blender World environment lighting and HDRI reflections cannot be stored in GLB',
    points: 15,
  });

  // 2. Embedded Punctual Lights Inspection
  if (hasPunctualLights) {
    const lightSummary = rawLights
      .map((l: any, i: number) => `${l.type || 'light'} #${i} (${l.color ? 'custom color' : 'white'}, ${l.intensity ?? 1} cd)`)
      .join(', ');

    findings.push({
      id: 'LIGHTING_PUNCTUAL_EMBEDDED',
      category: 'Lighting & Environment',
      severity: 'info',
      title: `Embedded KHR_lights_punctual Detected (${rawLights.length} Lights)`,
      affectedItem: `Lights: ${lightSummary}`,
      problem: `Asset includes ${rawLights.length} punctual light definitions via KHR_lights_punctual.`,
      evidence: `Found ${rawLights.length} lights in glTF KHR_lights_punctual extension.`,
      whyItMatters:
        'Blender exports lights in photometric Candela/Lumens. Three.js supports KHR_lights_punctual when using GLTFLoader, but requires renderer.useLegacyLights = false (default in modern Three.js) to interpret light attenuation and inverse-square falloff properly. Verify shadow map settings in Three.js as glTF lights do not serialize shadow resolution or bias.',
      expectedBlenderBehavior:
        'Lights match Blender light objects with inverse-square physical falloff.',
      expectedThreeJsBehavior:
        'Three.js creates DirectionalLight, PointLight, or SpotLight instances; shadows must be enabled manually.',
      recommendedFix:
        'Ensure Three.js is configured with physically correct lighting attenuation and shadows are enabled on light instances.',
    });
  } else {
    findings.push({
      id: 'LIGHTING_NO_EMBEDDED_LIGHTS',
      category: 'Lighting & Environment',
      severity: 'info',
      title: 'No Directional or Point Lights Embedded in File',
      affectedItem: 'Punctual Lights',
      problem: 'File contains 0 embedded light sources.',
      evidence: 'KHR_lights_punctual is not present in glTF file.',
      whyItMatters:
        'The model will appear completely invisible or unlit unless the web application creates its own Three.js light setup (e.g. HemisphereLight, DirectionalLight).',
      expectedBlenderBehavior: 'Blender scene lights illuminate the object.',
      expectedThreeJsBehavior: 'Illumination depends completely on the Three.js viewport configuration.',
      recommendedFix:
        'Ensure the Three.js canvas contains key, fill, and rim lights or a PMREM environment map.',
    });
  }

  return { findings, deductions, lightingReconstructible, lightingDisclaimer };
}
