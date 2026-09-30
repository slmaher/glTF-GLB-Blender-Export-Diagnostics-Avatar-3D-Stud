import type { TextureAnalysis } from '../../types/diagnostic';
import type { CompatibilityFinding, DeductionItem } from '../../types/compatibility';

export function analyzeTextures(
  textures: TextureAnalysis[],
  _materials: any[],
  gltfRaw: any
): { findings: CompatibilityFinding[]; deductions: DeductionItem[] } {
  const findings: CompatibilityFinding[] = [];
  const deductions: DeductionItem[] = [];

  const rawExtensionsUsed = (gltfRaw?.extensionsUsed as string[]) || [];
  const hasKtx2 = rawExtensionsUsed.includes('KHR_texture_basisu');

  const failedTextures = textures.filter((t) => t.validationStatus === 'ERROR');
  if (failedTextures.length > 0) {
    failedTextures.forEach((tex) => {
      findings.push({
        id: `TEX_BROKEN_${tex.index}`,
        category: 'Textures',
        severity: 'critical',
        title: `Broken Image Resource (${tex.storage}: ${tex.validationClassification})`,
        affectedItem: `Texture "${tex.name}" (Image #${tex.imageIndex})`,
        problem: tex.validationDetails || 'Binary image data could not be validated or decoded.',
        evidence: `Storage: ${tex.storage}, BufferView: ${tex.bufferViewIndex ?? 'None'}, Format: ${tex.format}, Failure: ${tex.validationClassification}.`,
        whyItMatters:
          'Three.js cannot load or sample textures with corrupt binary data or invalid bufferView bounds, causing materials to render black or transparent.',
        expectedBlenderBehavior: 'Blender may display missing texture or purple error.',
        expectedThreeJsBehavior: 'Texture fails to upload to GPU, material renders untextured.',
        recommendedFix: 'Re-export model ensuring all images are packed into the GLB binary.',
      });
      deductions.push({
        reason: `Texture "${tex.name}" failed binary validation (${tex.validationDetails || tex.validationClassification})`,
        points: Math.round(50 / failedTextures.length),
      });
    });
  }

  textures.forEach((tex) => {
    // 1. Non-Power-of-Two (NPOT) Textures
    if (tex.isNPOT && tex.width && tex.height) {
      const usesRepeat =
        tex.sampler.wrapS === 10497 || // REPEAT
        tex.sampler.wrapT === 10497 ||
        tex.sampler.wrapS === 33648 || // MIRRORED_REPEAT
        tex.sampler.wrapT === 33648;

      if (usesRepeat) {
        findings.push({
          id: `TEX_NPOT_${tex.index}`,
          category: 'Textures',
          severity: 'warning',
          title: `Non-Power-of-Two (NPOT) Texture with REPEAT Wrapping (${tex.width}x${tex.height})`,
          affectedItem: `Texture "${tex.name || tex.imageName}" (index ${tex.index})`,
          problem: `Texture resolution ${tex.width}x${tex.height} is non-power-of-two and specifies REPEAT wrapping.`,
          evidence: `Dimensions: ${tex.width} x ${tex.height}. Wrap modes: ${tex.sampler.wrapSName} / ${tex.sampler.wrapTName}.`,
          whyItMatters:
            'While modern WebGL 2.0 supports NPOT textures, GPU hardware performs optimal mipmapping, trilinear anisotropic filtering, and texture cache compression only on power-of-two dimensions (e.g. 512, 1024, 2048).',
          expectedBlenderBehavior:
            'Blender handles arbitrary image aspect ratios and resolutions seamlessly on desktop GPUs.',
          expectedThreeJsBehavior:
            'Possible mipmap generation warning or reduced anisotropic filtering fidelity.',
          recommendedFix:
            'In an image editor or Blender texture export settings, resize texture dimensions to standard power-of-two resolutions.',
        });
        deductions.push({
          reason: `Texture "${tex.name}" is non-power-of-two (${tex.width}x${tex.height}) with REPEAT wrapping`,
          points: 2,
        });
      }
    }

    // 2. Heavy 4K/8K Texture Memory in WebGL
    if (tex.width && tex.height && (tex.width >= 4096 || tex.height >= 4096)) {
      findings.push({
        id: `TEX_HIGH_RES_${tex.index}`,
        category: 'Textures',
        severity: 'warning',
        title: `Ultra-High Resolution Texture (${tex.width}x${tex.height}) May Exhaust Mobile WebGL VRAM`,
        affectedItem: `Texture "${tex.name || tex.imageName}" (index ${tex.index})`,
        problem: `Texture is 4K or higher (${tex.width}x${tex.height}). Uncompressed GPU footprint exceeds ~${Math.round((tex.width * tex.height * 4) / 1024 / 1024)} MB.`,
        evidence: `Dimensions: ${tex.width}x${tex.height}, format: ${tex.format}, file size: ${tex.byteSizeFormatted}.`,
        whyItMatters:
          'Blender runs on desktop workstations with 8GB to 24GB+ dedicated VRAM. Mobile devices and low-tier laptops running WebGL often have strict 256MB to 1GB browser VRAM quotas. Multiple 4K textures will cause mobile Safari / Chrome WebGL contexts to be abruptly lost and crash the browser tab.',
        expectedBlenderBehavior: 'Smooth viewport rendering backed by dedicated desktop GPU memory.',
        expectedThreeJsBehavior:
          'Risk of WebGL context loss or severe frame stutter during GPU texture upload.',
        recommendedFix:
          'Downscale diffuse/roughness textures to 2048x2048 (or 1024x1024 for mobile), or compress with KTX2 / Basis Universal GPU compressed texture formats.',
      });
      deductions.push({
        reason: `Texture "${tex.name}" is ${tex.width}x${tex.height} (high WebGL VRAM consumption)`,
        points: 5,
      });
    }

    // 3. Normal Map Channel and Filtering
    if (tex.detectedPurposes.includes('Normal Map')) {
      const isLinearFilter =
        tex.sampler.minFilter === 9729 || // LINEAR
        tex.sampler.minFilter === 9987; // LINEAR_MIPMAP_LINEAR

      if (!isLinearFilter && tex.sampler.minFilter !== 0) {
        findings.push({
          id: `TEX_NORMAL_SAMPLER_${tex.index}`,
          category: 'Textures',
          severity: 'warning',
          title: `Non-Trilinear Sampler Filtering on Normal Map`,
          affectedItem: `Normal Map "${tex.name || tex.imageName}" (index ${tex.index})`,
          problem: `Normal map uses sampler minFilter: ${tex.sampler.minFilterName}.`,
          evidence: `minFilter: ${tex.sampler.minFilterName} (${tex.sampler.minFilter})`,
          whyItMatters:
            'Normal maps encode 3D surface vectors in RGB channels. Using nearest or improper mipmap filtering produces harsh pixelated specular shimmering and noise across surfaces when viewed at grazing angles in Three.js.',
          expectedBlenderBehavior: 'Blender applies internal bicubic or trilinear texture filtering.',
          expectedThreeJsBehavior: 'Noticeable specular glitter and aliasing along polygonal edges.',
          recommendedFix:
            'Ensure the glTF sampler specifies LINEAR_MIPMAP_LINEAR (9987) for normal textures.',
        });
      }
    }
  });

  // 4. Missing GPU Texture Compression (KTX2 / BasisU)
  if (textures.length > 3 && !hasKtx2) {
    findings.push({
      id: `TEX_NO_BASISU`,
      category: 'Textures',
      severity: 'info',
      title: `No KTX2 GPU Compressed Textures (Standard PNG/JPEG Used)`,
      affectedItem: `All ${textures.length} Textures`,
      problem: `Textures are stored as standard uncompressed PNG/JPEG files inside the GLB.`,
      evidence: `KHR_texture_basisu is not in extensionsUsed. Total textures: ${textures.length}.`,
      whyItMatters:
        'PNG and JPEG images must be completely uncompressed in CPU memory to raw RGBA arrays and uploaded to GPU VRAM as uncompressed bitstreams. KTX2 / Basis Universal keeps textures compressed directly inside GPU VRAM, reducing memory consumption by 70-80% and speeding up WebGL asset download and parsing.',
      expectedBlenderBehavior: 'Blender unpacks textures to desktop RAM without mobile memory constraints.',
      expectedThreeJsBehavior:
        'Higher memory pressure and longer initial scene download and decode time.',
      recommendedFix:
        'Consider compressing textures with gltfpack (-tc) or KTX2 Basis Universal via `@gltf-transform/cli` for web distribution.',
    });
  }

  return { findings, deductions };
}
