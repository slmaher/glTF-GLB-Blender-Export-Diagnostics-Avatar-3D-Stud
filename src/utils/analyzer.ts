import { WebIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import type {
  DiagnosticReport,
  FileInfo,
  SceneStructure,
  HierarchyNode,
  MaterialAnalysis,
  TextureAnalysis,
  MeshAnalysis,
  PrimitiveAnalysis,
  ExtensionAnalysis,
  CompatibilityIssue,
  DiagnosticSummary,
  RenderingDiagnostics,
  SectionStatus,
  TextureRefInfo,
  MaterialExtensionInfo,
  ParserNotice,
} from '../types/diagnostic';
import { getExtensionDetails } from './extensionDatabase';
import { analyzeRenderCompatibility } from './compatibilityAnalyzers';
import { validateGltfImage, parseDataUri } from './imageValidator';

function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function isPowerOfTwo(n: number): boolean {
  return (n & (n - 1)) === 0 && n > 0;
}

const GLTF_MIN_FILTER_NAMES: Record<number, string> = {
  9728: 'NEAREST',
  9729: 'LINEAR',
  9984: 'NEAREST_MIPMAP_NEAREST',
  9985: 'LINEAR_MIPMAP_NEAREST',
  9986: 'NEAREST_MIPMAP_LINEAR',
  9987: 'LINEAR_MIPMAP_LINEAR',
};

const GLTF_MAG_FILTER_NAMES: Record<number, string> = {
  9728: 'NEAREST',
  9729: 'LINEAR',
};

const GLTF_WRAP_NAMES: Record<number, string> = {
  33071: 'CLAMP_TO_EDGE',
  33648: 'MIRRORED_REPEAT',
  10497: 'REPEAT',
};

const GLTF_MODE_NAMES: Record<number, string> = {
  0: 'POINTS',
  1: 'LINES',
  2: 'LINE_LOOP',
  3: 'LINE_STRIP',
  4: 'TRIANGLES',
  5: 'TRIANGLE_STRIP',
  6: 'TRIANGLE_FAN',
};

function parseGlbHeaderAndJson(buffer: ArrayBuffer): {
  version: number;
  totalLength: number;
  gltfRaw: any;
  hasBinChunk: boolean;
  binChunkLength: number;
  binChunkBytes: Uint8Array | null;
} {
  const dataView = new DataView(buffer);
  const magic = dataView.getUint32(0, true);
  if (magic !== 0x46546c67) {
    throw new Error('Invalid GLB file: Magic number does not match 0x46546C67 ("glTF").');
  }

  const version = dataView.getUint32(4, true);
  const totalLength = dataView.getUint32(8, true);

  if (buffer.byteLength < 20) {
    throw new Error('GLB file header is truncated.');
  }

  let offset = 12;
  let gltfRaw: any = null;
  let hasBinChunk = false;
  let binChunkLength = 0;
  let binChunkBytes: Uint8Array | null = null;

  while (offset < buffer.byteLength) {
    if (offset + 8 > buffer.byteLength) break;
    const chunkLength = dataView.getUint32(offset, true);
    const chunkType = dataView.getUint32(offset + 4, true);
    offset += 8;

    if (chunkType === 0x4e4f534a) {
      // JSON chunk
      const jsonBytes = new Uint8Array(buffer, offset, chunkLength);
      const text = new TextDecoder('utf-8').decode(jsonBytes);
      gltfRaw = JSON.parse(text);
    } else if (chunkType === 0x004e4942) {
      // BIN chunk
      hasBinChunk = true;
      binChunkLength = chunkLength;
      binChunkBytes = new Uint8Array(buffer, offset, chunkLength);
    }

    offset += chunkLength;
  }

  if (!gltfRaw) {
    throw new Error('GLB does not contain a valid JSON chunk.');
  }

  return { version, totalLength, gltfRaw, hasBinChunk, binChunkLength, binChunkBytes };
}

export async function analyzeModel(file: File): Promise<DiagnosticReport> {
  const startTime = performance.now();
  const fileBytes = await file.arrayBuffer();
  const fileName = file.name;
  const fileSize = fileBytes.byteLength;
  const isGlb = fileName.toLowerCase().endsWith('.glb');

  const parsingErrors: string[] = [];
  const parsingWarnings: string[] = [];
  const parserNotices: ParserNotice[] = [];

  let gltfRaw: any = null;
  let glbVersion = 2;
  let binChunkBytes: Uint8Array | null = null;

  // 1. Raw Parsing
  if (isGlb) {
    try {
      const parsed = parseGlbHeaderAndJson(fileBytes);
      gltfRaw = parsed.gltfRaw;
      glbVersion = parsed.version;
      binChunkBytes = parsed.binChunkBytes;
    } catch (e: any) {
      parsingErrors.push(`GLB Binary Parse Error: ${e.message}`);
    }
  } else {
    try {
      const text = new TextDecoder('utf-8').decode(fileBytes);
      gltfRaw = JSON.parse(text);
      if (gltfRaw?.buffers?.[0]?.uri?.startsWith('data:')) {
        const parsedBuf = parseDataUri(gltfRaw.buffers[0].uri);
        if (parsedBuf) binChunkBytes = parsedBuf.bytes;
      }
    } catch (e: any) {
      parsingErrors.push(`glTF JSON Parse Error: ${e.message}`);
    }
  }

  // 2. High-level analysis with @gltf-transform
  try {
    const io = new WebIO().registerExtensions(ALL_EXTENSIONS);
    if (isGlb) {
      await io.readBinary(new Uint8Array(fileBytes));
    } else {
      await io.readJSON({ json: gltfRaw, resources: {} });
    }
  } catch (e: any) {
    const errMsg = e.message || String(e);
    const isDracoNotice = errMsg.includes('DT_FLOAT32') || errMsg.toLowerCase().includes('draco');
    if (isDracoNotice) {
      parserNotices.push({
        source: 'glTF-Transform',
        severity: 'Notice',
        impact: 'Unknown / Non-blocking',
        message: 'KHR_draco_mesh_compression decoder module notice: in-memory vertex decompression requires external draco3d library.',
        details: errMsg,
      });
      parsingWarnings.push(`Parser Notice: Source: glTF-Transform, Severity: Notice, Impact: Unknown / Non-blocking (Draco mesh compression requires external draco3d decoder to uncompress vertex geometry in memory).`);
    } else {
      parserNotices.push({
        source: 'glTF-Transform',
        severity: 'Notice',
        impact: 'Unknown / Non-blocking',
        message: errMsg,
      });
      parsingWarnings.push(`@gltf-transform notice: ${errMsg}`);
    }
  }

  // File Info construction
  const asset = gltfRaw?.asset || {};
  const fileInfo: FileInfo = {
    name: fileName,
    sizeBytes: fileSize,
    sizeFormatted: formatBytes(fileSize),
    format: isGlb ? 'GLB' : 'glTF',
    version: asset.version ? `glTF ${asset.version} (Binary v${glbVersion})` : `glTF 2.0`,
    generator: asset.generator || 'Unknown generator',
    copyright: asset.copyright,
    isValid: parsingErrors.length === 0 && !!gltfRaw,
    parseTimeMs: 0,
    parsingErrors,
    parsingWarnings,
    parserNotices,
  };

  // 3. Scene Structure & Hierarchy
  const rawScenes = gltfRaw?.scenes || [];
  const rawNodes = gltfRaw?.nodes || [];
  const rawMeshes = gltfRaw?.meshes || [];
  const rawMaterials = gltfRaw?.materials || [];
  const rawTextures = gltfRaw?.textures || [];
  const rawImages = gltfRaw?.images || [];
  const rawSamplers = gltfRaw?.samplers || [];
  const rawCameras = gltfRaw?.cameras || [];
  const rawAnimations = gltfRaw?.animations || [];
  const rawSkins = gltfRaw?.skins || [];
  const rawExtensionsUsed = (gltfRaw?.extensionsUsed as string[]) || [];
  const rawExtensionsRequired = (gltfRaw?.extensionsRequired as string[]) || [];

  let primitivesCount = 0;
  for (const m of rawMeshes) {
    primitivesCount += m.primitives?.length || 0;
  }

  // Build recursive node hierarchy
  function buildNodeHierarchy(nodeIndex: number, visited = new Set<number>()): HierarchyNode {
    if (visited.has(nodeIndex)) {
      return {
        index: nodeIndex,
        name: `[Cycle Detected: Node ${nodeIndex}]`,
        hasNonUniformScale: false,
        hasNegativeScale: false,
        children: [],
      };
    }
    visited.add(nodeIndex);

    const rawNode = rawNodes[nodeIndex] || {};
    const scale = rawNode.scale as [number, number, number] | undefined;
    let hasNonUniformScale = false;
    let hasNegativeScale = false;

    if (scale && Array.isArray(scale) && scale.length === 3) {
      const [sx, sy, sz] = scale;
      if (Math.abs(sx - sy) > 0.0001 || Math.abs(sy - sz) > 0.0001) {
        hasNonUniformScale = true;
      }
      if (sx < 0 || sy < 0 || sz < 0) {
        hasNegativeScale = true;
      }
    }

    const children: HierarchyNode[] = [];
    if (Array.isArray(rawNode.children)) {
      for (const childIdx of rawNode.children) {
        if (typeof childIdx === 'number' && childIdx < rawNodes.length) {
          children.push(buildNodeHierarchy(childIdx, new Set(visited)));
        }
      }
    }

    const meshIdx = typeof rawNode.mesh === 'number' ? rawNode.mesh : undefined;
    const meshName = meshIdx !== undefined && rawMeshes[meshIdx] ? (rawMeshes[meshIdx].name || `Mesh ${meshIdx}`) : undefined;

    return {
      index: nodeIndex,
      name: rawNode.name || `Node_${nodeIndex}`,
      translation: rawNode.translation,
      rotation: rawNode.rotation,
      scale: rawNode.scale,
      hasNonUniformScale,
      hasNegativeScale,
      meshIndex: meshIdx,
      meshName,
      cameraIndex: typeof rawNode.camera === 'number' ? rawNode.camera : undefined,
      children,
    };
  }

  const sceneStructure: SceneStructure = {
    scenesCount: rawScenes.length,
    nodesCount: rawNodes.length,
    meshesCount: rawMeshes.length,
    primitivesCount,
    materialsCount: rawMaterials.length,
    texturesCount: rawTextures.length,
    imagesCount: rawImages.length,
    camerasCount: rawCameras.length,
    lightsCount: (gltfRaw?.extensions?.KHR_lights_punctual?.lights?.length || 0),
    animationsCount: rawAnimations.length,
    skinsCount: rawSkins.length,
    scenes: rawScenes.map((s: any, idx: number) => {
      const rootNodeIndices = Array.isArray(s.nodes) ? s.nodes : [];
      return {
        index: idx,
        name: s.name || `Scene_${idx}`,
        rootNodes: rootNodeIndices
          .filter((nIdx: number) => nIdx >= 0 && nIdx < rawNodes.length)
          .map((nIdx: number) => buildNodeHierarchy(nIdx)),
      };
    }),
  };

  // 4. Extract Textures & Images
  const textureUsageMap = new Map<number, Set<string>>();
  const textureMaterialsMap = new Map<number, Set<string>>();

  // Helper for tracking texture usage
  function trackTexUsage(texIdx: number | undefined, purpose: string, matName: string) {
    if (texIdx === undefined || texIdx === null || texIdx < 0) return;
    if (!textureUsageMap.has(texIdx)) textureUsageMap.set(texIdx, new Set());
    if (!textureMaterialsMap.has(texIdx)) textureMaterialsMap.set(texIdx, new Set());
    textureUsageMap.get(texIdx)!.add(purpose);
    textureMaterialsMap.get(texIdx)!.add(matName);
  }

  // Pre-scan materials for texture references
  rawMaterials.forEach((m: any, mIdx: number) => {
    const matName = m.name || `Material_${mIdx}`;
    const pbr = m.pbrMetallicRoughness || {};
    if (pbr.baseColorTexture?.index !== undefined) {
      trackTexUsage(pbr.baseColorTexture.index, 'Base Color', matName);
    }
    if (pbr.metallicRoughnessTexture?.index !== undefined) {
      trackTexUsage(pbr.metallicRoughnessTexture.index, 'Metallic-Roughness (ORM)', matName);
    }
    if (m.normalTexture?.index !== undefined) {
      trackTexUsage(m.normalTexture.index, 'Normal Map', matName);
    }
    if (m.occlusionTexture?.index !== undefined) {
      trackTexUsage(m.occlusionTexture.index, 'Ambient Occlusion', matName);
    }
    if (m.emissiveTexture?.index !== undefined) {
      trackTexUsage(m.emissiveTexture.index, 'Emissive', matName);
    }

    // Material extensions
    const ext = m.extensions || {};
    if (ext.KHR_materials_clearcoat?.clearcoatTexture?.index !== undefined) {
      trackTexUsage(ext.KHR_materials_clearcoat.clearcoatTexture.index, 'Clearcoat', matName);
    }
    if (ext.KHR_materials_transmission?.transmissionTexture?.index !== undefined) {
      trackTexUsage(ext.KHR_materials_transmission.transmissionTexture.index, 'Transmission', matName);
    }
    if (ext.KHR_materials_sheen?.sheenColorTexture?.index !== undefined) {
      trackTexUsage(ext.KHR_materials_sheen.sheenColorTexture.index, 'Sheen Color', matName);
    }
    if (ext.KHR_materials_specular?.specularTexture?.index !== undefined) {
      trackTexUsage(ext.KHR_materials_specular.specularTexture.index, 'Specular', matName);
    }
  });

  // Extract texture objects from gltf-transform if available, or fall back to raw
  const textures: TextureAnalysis[] = [];

  for (let tIdx = 0; tIdx < rawTextures.length; tIdx++) {
    const rawTex = rawTextures[tIdx] || {};
    let imgIdx = rawTex.source;
    if (imgIdx === undefined && rawTex.extensions?.EXT_texture_webp?.source !== undefined) {
      imgIdx = rawTex.extensions.EXT_texture_webp.source;
    }
    if (imgIdx === undefined && rawTex.extensions?.KHR_texture_basisu?.source !== undefined) {
      imgIdx = rawTex.extensions.KHR_texture_basisu.source;
    }

    const rawImg = imgIdx !== undefined && rawImages[imgIdx] ? rawImages[imgIdx] : null;
    const samplerIdx = rawTex.sampler;
    const rawSampler = samplerIdx !== undefined && rawSamplers[samplerIdx] ? rawSamplers[samplerIdx] : {};

    const minFilter = rawSampler.minFilter || 9987; // default LINEAR_MIPMAP_LINEAR
    const magFilter = rawSampler.magFilter || 9729; // default LINEAR
    const wrapS = rawSampler.wrapS || 10497; // default REPEAT
    const wrapT = rawSampler.wrapT || 10497; // default REPEAT

    // Real image validation
    const validation = await validateGltfImage(imgIdx ?? -1, rawImg, gltfRaw, binChunkBytes);

    const imgName = rawImg?.name || (rawImg?.uri ? rawImg.uri.split('/').pop() : `Image_${imgIdx ?? tIdx}`);

    const width = validation.width;
    const height = validation.height;
    const isNPOT = !!(width && height && (!isPowerOfTwo(width) || !isPowerOfTwo(height)));
    const isMissing = validation.status === 'ERROR';

    const detectedPurposes = Array.from(textureUsageMap.get(tIdx) || []);
    const isUnused = detectedPurposes.length === 0;

    const diagnostics: string[] = [];
    if (validation.diagnostics.length > 0) {
      diagnostics.push(...validation.diagnostics);
    }
    if (isUnused) {
      diagnostics.push('Texture is present in the file but never referenced by any material primitive (wasted file size).');
    }
    if (isNPOT) {
      diagnostics.push(`Dimensions (${width}x${height}) are Non-Power-of-Two (NPOT). WebGL1 cannot generate mipmaps for NPOT textures with REPEAT wrapping.`);
    }
    if (width && height && (width > 4096 || height > 4096)) {
      diagnostics.push(`High resolution (${width}x${height}): Exceeds 4K, may cause GPU VRAM bottlenecks or crashes on mobile devices.`);
    }

    textures.push({
      index: tIdx,
      name: rawTex.name || `Texture_${tIdx}`,
      imageIndex: imgIdx ?? -1,
      imageName: imgName,
      format: validation.format,
      mimeType: validation.detectedMimeType,
      width,
      height,
      isNPOT,
      byteSize: validation.bytesCount,
      byteSizeFormatted: validation.formattedBytes,
      isEmbedded: validation.storage === 'Embedded GLB',
      storage: validation.storage,
      sourceUri: rawImg?.uri,
      bufferViewIndex: validation.bufferViewIndex,
      validationStatus: validation.status,
      validationClassification: validation.classification,
      decodeStatus: validation.decodeStatus,
      validationDetails: validation.reason,
      sampler: {
        minFilter,
        minFilterName: GLTF_MIN_FILTER_NAMES[minFilter] || `Custom (${minFilter})`,
        magFilter,
        magFilterName: GLTF_MAG_FILTER_NAMES[magFilter] || `Custom (${magFilter})`,
        wrapS,
        wrapSName: GLTF_WRAP_NAMES[wrapS] || `Custom (${wrapS})`,
        wrapT,
        wrapTName: GLTF_WRAP_NAMES[wrapT] || `Custom (${wrapT})`,
      },
      detectedPurposes,
      isUnused,
      isMissing,
      previewUrl: validation.previewUrl,
      diagnostics,
    });
  }

  // 5. Materials Analysis
  const materials: MaterialAnalysis[] = [];

  for (let mIdx = 0; mIdx < rawMaterials.length; mIdx++) {
    const rawMat = rawMaterials[mIdx] || {};
    const pbr = rawMat.pbrMetallicRoughness || {};

    const name = rawMat.name || `Material_${mIdx}`;
    const alphaMode = (rawMat.alphaMode || 'OPAQUE') as 'OPAQUE' | 'MASK' | 'BLEND';
    const alphaCutoff = typeof rawMat.alphaCutoff === 'number' ? rawMat.alphaCutoff : 0.5;
    const doubleSided = !!rawMat.doubleSided;

    const baseColorFactor: [number, number, number, number] = Array.isArray(pbr.baseColorFactor) && pbr.baseColorFactor.length === 4
      ? (pbr.baseColorFactor as [number, number, number, number])
      : [1, 1, 1, 1];

    const metallicFactor = typeof pbr.metallicFactor === 'number' ? pbr.metallicFactor : 1.0;
    const roughnessFactor = typeof pbr.roughnessFactor === 'number' ? pbr.roughnessFactor : 1.0;

    const emissiveFactor: [number, number, number] = Array.isArray(rawMat.emissiveFactor) && rawMat.emissiveFactor.length === 3
      ? (rawMat.emissiveFactor as [number, number, number])
      : [0, 0, 0];

    const normalScale = typeof rawMat.normalTexture?.scale === 'number' ? rawMat.normalTexture.scale : 1.0;
    const occlusionStrength = typeof rawMat.occlusionTexture?.strength === 'number' ? rawMat.occlusionTexture.strength : 1.0;

    // Helper for texture ref info
    const extractTexRef = (texObj: any): TextureRefInfo | undefined => {
      if (!texObj || typeof texObj.index !== 'number') return undefined;
      const tInfo = textures[texObj.index];
      const hasTransform = !!texObj.extensions?.KHR_texture_transform;
      const transform = hasTransform ? texObj.extensions.KHR_texture_transform : undefined;
      return {
        textureIndex: texObj.index,
        textureName: tInfo ? tInfo.name : `Texture_${texObj.index}`,
        hasTransform,
        transform,
        scale: typeof texObj.scale === 'number' ? texObj.scale : undefined,
        strength: typeof texObj.strength === 'number' ? texObj.strength : undefined,
      };
    };

    const baseColorTexture = extractTexRef(pbr.baseColorTexture);
    const normalTexture = extractTexRef(rawMat.normalTexture);
    const metallicRoughnessTexture = extractTexRef(pbr.metallicRoughnessTexture);
    const occlusionTexture = extractTexRef(rawMat.occlusionTexture);
    const emissiveTexture = extractTexRef(rawMat.emissiveTexture);

    // Extensions on material
    const rawMatExt = rawMat.extensions || {};
    const extensions: MaterialExtensionInfo[] = [];

    Object.keys(rawMatExt).forEach((extKey) => {
      const extMeta = getExtensionDetails(extKey);
      extensions.push({
        name: extKey,
        data: rawMatExt[extKey] || {},
        description: extMeta.description,
        threeJsSupport: extMeta.threeJsSupport,
        renderingImpact: extMeta.renderingImpact,
      });
    });

    const diagnostics: string[] = [];

    if (alphaMode === 'BLEND') {
      diagnostics.push(
        'Alpha Mode is set to BLEND. In Three.js and glTF viewers, this disables depth writing (depthWrite: false), causing transparent depth sorting artifacts where polygons or back-faces show through unexpectedly.'
      );
    }

    if (metallicFactor >= 0.9 && !baseColorTexture && !metallicRoughnessTexture) {
      diagnostics.push(
        `Metallic factor is ${metallicFactor} with no base texture. Metallic surfaces have 0% diffuse reflection and rely entirely on Environment Maps (IBL). In scenes without an HDR environment map, this material will render completely black.`
      );
    }

    if (roughnessFactor === 0 && metallicFactor > 0.5) {
      diagnostics.push(
        'Roughness is 0.0 (mirror-smooth). It will produce razor-sharp mirror reflections that appear black without an environment map.'
      );
    }

    if (normalTexture && Math.abs(normalScale - 1.0) > 0.01) {
      diagnostics.push(`Normal map scale is non-standard (${normalScale}).`);
    }

    if (rawMatExt.KHR_materials_emissive_strength) {
      const strength = rawMatExt.KHR_materials_emissive_strength.emissiveStrength;
      diagnostics.push(`Emissive strength extension is active (${strength}x multiplier).`);
    } else if (emissiveFactor.some((v) => v > 0)) {
      diagnostics.push(
        'Emissive color is active without KHR_materials_emissive_strength. In standard glTF, emissive is capped at 1.0, which may look noticeably dimmer than high bloom settings in Blender Cycles/EEVEE.'
      );
    }

    materials.push({
      index: mIdx,
      name,
      type: rawMatExt.KHR_materials_unlit ? 'Unlit (MeshBasicMaterial)' : 'PBR Metallic-Roughness (MeshStandardMaterial)',
      alphaMode,
      alphaCutoff,
      doubleSided,
      baseColorFactor,
      metallicFactor,
      roughnessFactor,
      emissiveFactor,
      normalScale,
      occlusionStrength,
      baseColorTexture,
      normalTexture,
      metallicRoughnessTexture,
      occlusionTexture,
      emissiveTexture,
      extensions,
      diagnostics,
    });
  }

  // 6. Meshes Analysis
  const meshes: MeshAnalysis[] = [];
  const rawAccessors = gltfRaw?.accessors || [];

  for (let meshIdx = 0; meshIdx < rawMeshes.length; meshIdx++) {
    const rawMesh = rawMeshes[meshIdx] || {};
    const meshName = rawMesh.name || `Mesh_${meshIdx}`;
    const rawPrimitives = rawMesh.primitives || [];

    let totalVertices = 0;
    let totalTriangles = 0;
    let overallMin: [number, number, number] | undefined;
    let overallMax: [number, number, number] | undefined;

    const primitives: PrimitiveAnalysis[] = [];
    const meshDiagnostics: string[] = [];

    for (let pIdx = 0; pIdx < rawPrimitives.length; pIdx++) {
      const prim = rawPrimitives[pIdx] || {};
      const attrs = prim.attributes || {};
      const modeNum = typeof prim.mode === 'number' ? prim.mode : 4; // 4 = TRIANGLES
      const mode = GLTF_MODE_NAMES[modeNum] || `Mode_${modeNum}`;

      const posAccessorIdx = attrs.POSITION;
      const normAccessorIdx = attrs.NORMAL;
      const tanAccessorIdx = attrs.TANGENT;
      const uv0AccessorIdx = attrs.TEXCOORD_0;
      const uv1AccessorIdx = attrs.TEXCOORD_1;
      const col0AccessorIdx = attrs.COLOR_0;
      const joint0AccessorIdx = attrs.JOINTS_0;
      const weight0AccessorIdx = attrs.WEIGHTS_0;

      const hasPosition = posAccessorIdx !== undefined;
      const hasNormal = normAccessorIdx !== undefined;
      const hasTangent = tanAccessorIdx !== undefined;
      const hasTexCoord0 = uv0AccessorIdx !== undefined;
      const hasTexCoord1 = uv1AccessorIdx !== undefined;
      const hasColor0 = col0AccessorIdx !== undefined;
      const hasJoints0 = joint0AccessorIdx !== undefined;
      const hasWeights0 = weight0AccessorIdx !== undefined;

      const customAttributes = Object.keys(attrs).filter(
        (k) => !['POSITION', 'NORMAL', 'TANGENT', 'TEXCOORD_0', 'TEXCOORD_1', 'COLOR_0', 'JOINTS_0', 'WEIGHTS_0'].includes(k)
      );

      let vertexCount = 0;
      if (hasPosition && rawAccessors[posAccessorIdx]) {
        vertexCount = rawAccessors[posAccessorIdx].count || 0;
        totalVertices += vertexCount;

        const posAcc = rawAccessors[posAccessorIdx];
        if (Array.isArray(posAcc.min) && Array.isArray(posAcc.max)) {
          if (!overallMin) {
            overallMin = [...posAcc.min] as [number, number, number];
            overallMax = [...posAcc.max] as [number, number, number];
          } else if (overallMax) {
            overallMin[0] = Math.min(overallMin[0], posAcc.min[0]);
            overallMin[1] = Math.min(overallMin[1], posAcc.min[1]);
            overallMin[2] = Math.min(overallMin[2], posAcc.min[2]);
            overallMax[0] = Math.max(overallMax[0], posAcc.max[0]);
            overallMax[1] = Math.max(overallMax[1], posAcc.max[1]);
            overallMax[2] = Math.max(overallMax[2], posAcc.max[2]);
          }
        }
      }

      let triangleCount = 0;
      const hasIndices = typeof prim.indices === 'number';
      if (hasIndices && rawAccessors[prim.indices]) {
        const indCount = rawAccessors[prim.indices].count || 0;
        triangleCount = Math.floor(indCount / 3);
      } else {
        triangleCount = Math.floor(vertexCount / 3);
      }
      totalTriangles += triangleCount;

      const matIdx = typeof prim.material === 'number' ? prim.material : undefined;
      const mat = matIdx !== undefined ? materials[matIdx] : undefined;
      const matName = mat ? mat.name : undefined;

      const primDiagnostics: string[] = [];

      if (!hasPosition) {
        primDiagnostics.push('FATAL: Primitive lacks POSITION vertex attribute.');
      }

      if (!hasNormal) {
        primDiagnostics.push(
          'CRITICAL: Missing NORMAL attribute. Smooth vertex shading will be lost; Three.js will calculate flat face normals in fragment shader, giving faceted look.'
        );
      }

      // Check Normal Map with Missing Tangent (The #1 Blender export trap!)
      if (mat && mat.normalTexture && !hasTangent) {
        primDiagnostics.push(
          `EVIDENCE: Material "${mat.name}" uses a Normal Map, but this Primitive lacks TANGENT attributes. Blender uses MikkTSpace in viewport. When tangents are missing from GLB, Three.js falls back to screen-space derivatives (dFdx/dFdy), causing visible seams, inverted shading on mirrored UVs, or faceted reflections.`
        );
      }

      // Check Textures with Missing UV
      if (mat && (mat.baseColorTexture || mat.normalTexture || mat.metallicRoughnessTexture) && !hasTexCoord0) {
        primDiagnostics.push(
          `CRITICAL: Material "${mat.name}" has image textures assigned, but this Primitive lacks TEXCOORD_0 (UV map). Textures cannot be rendered and will appear distorted or default grey.`
        );
      }

      if (hasColor0) {
        primDiagnostics.push(
          'Mesh contains COLOR_0 (Vertex Colors). Note: glTF specification states that vertex colors multiply with baseColorFactor/baseColorTexture. If unintended vertex colors were left in Blender, surface color will be tinted!'
        );
      }

      primitives.push({
        primitiveIndex: pIdx,
        materialIndex: matIdx,
        materialName: matName,
        mode,
        vertexCount,
        triangleCount,
        hasIndices,
        attributes: {
          hasPosition,
          hasNormal,
          hasTangent,
          hasTexCoord0,
          hasTexCoord1,
          hasColor0,
          color0Type: hasColor0 && rawAccessors[col0AccessorIdx] ? `${rawAccessors[col0AccessorIdx].type} (${rawAccessors[col0AccessorIdx].componentType})` : undefined,
          hasJoints0,
          hasWeights0,
          customAttributes,
        },
        diagnostics: primDiagnostics,
      });
    }

    let boundingBox: MeshAnalysis['boundingBox'] | undefined;
    if (overallMin && overallMax) {
      boundingBox = {
        min: overallMin,
        max: overallMax,
        size: [
          overallMax[0] - overallMin[0],
          overallMax[1] - overallMin[1],
          overallMax[2] - overallMin[2],
        ],
      };
    }

    meshes.push({
      index: meshIdx,
      name: meshName,
      primitivesCount: rawPrimitives.length,
      totalVertices,
      totalTriangles,
      boundingBox,
      primitives,
      diagnostics: meshDiagnostics,
    });
  }

  // 7. Extensions Analysis
  const allExtensionKeys = Array.from(new Set([...rawExtensionsUsed, ...rawExtensionsRequired]));
  const extensions: ExtensionAnalysis[] = allExtensionKeys.map((extName) => {
    const isRequired = rawExtensionsRequired.includes(extName);
    const meta = getExtensionDetails(extName);
    return {
      name: extName,
      isRequired,
      description: meta.description,
      threeJsSupport: meta.threeJsSupport,
      renderingImpact: meta.renderingImpact,
      isCompression: meta.isCompression,
    };
  });

  // 8. Blender -> glTF / Three.js Compatibility Analysis & Issues
  const issues: CompatibilityIssue[] = [];

  // Scan 1: Missing Tangents with Normal Map
  const missingTangentPrims: string[] = [];
  meshes.forEach((m) => {
    m.primitives.forEach((p) => {
      const mat = p.materialIndex !== undefined ? materials[p.materialIndex] : undefined;
      if (mat?.normalTexture && !p.attributes.hasTangent) {
        missingTangentPrims.push(`Mesh "${m.name}" Primitive #${p.primitiveIndex} (Material "${mat.name}")`);
      }
    });
  });

  if (missingTangentPrims.length > 0) {
    issues.push({
      id: 'MISSING_TANGENTS',
      severity: 'HIGH',
      category: 'Confirmed issue',
      title: 'Normal Map Used Without Mesh Tangents (MikkTSpace Discrepancy)',
      evidence: `${missingTangentPrims.length} primitive(s) use normal maps without TANGENT attribute: ${missingTangentPrims.slice(0, 3).join(', ')}${missingTangentPrims.length > 3 ? ` and ${missingTangentPrims.length - 3} more` : ''}.`,
      explanation:
        'In Blender viewport, normal maps are rendered using internal MikkTSpace tangent vectors. When exporting to glTF without tangents, Three.js and glTF viewers must generate tangents on the fly using screen-space partial derivatives (dFdx/dFdy). This is the #1 cause of visual differences: it introduces visible seams along UV borders, faceted lighting, and flipped normal shading across mirrored UV islands.',
      blenderFix:
        'In Blender glTF Exporter (File > Export > glTF 2.0), expand the "Geometry" accordion and check the "Tangents" checkbox. Ensure your mesh has a valid UV map.',
    });
  }

  // Scan 2: Missing UV Coordinates with Textures
  const missingUvPrims: string[] = [];
  meshes.forEach((m) => {
    m.primitives.forEach((p) => {
      const mat = p.materialIndex !== undefined ? materials[p.materialIndex] : undefined;
      if (mat && (mat.baseColorTexture || mat.normalTexture || mat.metallicRoughnessTexture) && !p.attributes.hasTexCoord0) {
        missingUvPrims.push(`Mesh "${m.name}" Primitive #${p.primitiveIndex} (Material "${mat.name}")`);
      }
    });
  });

  if (missingUvPrims.length > 0) {
    issues.push({
      id: 'MISSING_UVS',
      severity: 'HIGH',
      category: 'Confirmed issue',
      title: 'Textures Assigned but Mesh Lacks UV Coordinates (TEXCOORD_0)',
      evidence: `${missingUvPrims.length} primitive(s) reference textures without UV coordinates: ${missingUvPrims.slice(0, 3).join(', ')}.`,
      explanation:
        'Image textures require UV coordinates (TEXCOORD_0) to map 2D image pixels onto 3D surfaces. Without UV coordinates, WebGL shaders cannot sample texture pixels, resulting in solid flat fallback colors or rendering errors.',
      blenderFix:
        'In Blender, open the UV Editing workspace, select your mesh in Edit Mode, press "U" > "Unwrap" (or "Smart UV Project"), and verify that a UV Map exists in Object Data Properties > UV Maps before exporting.',
    });
  }

  // Scan 3: Missing Normals
  const missingNormalPrims: string[] = [];
  meshes.forEach((m) => {
    m.primitives.forEach((p) => {
      if (!p.attributes.hasNormal) {
        missingNormalPrims.push(`Mesh "${m.name}" Primitive #${p.primitiveIndex}`);
      }
    });
  });

  if (missingNormalPrims.length > 0) {
    issues.push({
      id: 'MISSING_NORMALS',
      severity: 'HIGH',
      category: 'Confirmed issue',
      title: 'Missing NORMAL Vertex Attributes',
      evidence: `${missingNormalPrims.length} primitive(s) lack normal vectors: ${missingNormalPrims.slice(0, 3).join(', ')}.`,
      explanation:
        'Without explicit vertex normals in the glTF file, Three.js must compute flat face normals dynamically in the fragment shader. Smooth shading, rounded corners, and soft lighting curves from Blender will be completely lost.',
      blenderFix:
        'In Blender export settings under "Geometry", ensure "Normals" is checked. In Blender Edit Mode, recalculate normals by pressing Shift+N (Mesh > Normals > Recalculate Outside).',
    });
  }

  // Scan 4: Alpha Mode BLEND Depth Sorting Artifacts
  const blendMaterials = materials.filter((m) => m.alphaMode === 'BLEND');
  if (blendMaterials.length > 0) {
    issues.push({
      id: 'ALPHA_BLEND_SORTING',
      severity: 'HIGH',
      category: 'Potential issue',
      title: 'Material Alpha Mode set to "BLEND" (Causes Depth-Sorting & Transparent Glitches)',
      evidence: `${blendMaterials.length} material(s) have alphaMode: "BLEND": ${blendMaterials.map((m) => `"${m.name}"`).join(', ')}.`,
      explanation:
        'In real-time rasterizers like Three.js and glTF viewers, glTF "BLEND" mode sets depthWrite: false to render transparency. If geometry has overlapping polygons, back faces or internal geometry will bleed through the front faces, or parts of the mesh will randomly disappear when orbiting the camera! Blender viewport EEVEE/Cycles handles transparency differently than standard WebGL alpha blending.',
      blenderFix:
        'In Blender Material Properties > Settings > Surface: If the object is solid, change "Blend Mode" from "Alpha Blend" to "Opaque". If it is a leaf/hair cutout, change "Blend Mode" to "Alpha Clip" (which maps to glTF MASK mode with depth writing enabled).',
    });
  }

  // Scan 5: Metallic 1.0 Without Environment Lighting
  const pureMetalMats = materials.filter(
    (m) => m.metallicFactor >= 0.8 && m.roughnessFactor < 0.25 && !m.baseColorTexture
  );
  if (pureMetalMats.length > 0) {
    issues.push({
      id: 'HIGH_METALLIC_NO_IBL',
      severity: 'MEDIUM',
      category: 'Potential issue',
      title: 'High Metallic / Low Roughness Surface (Requires HDR Environment Map in Three.js)',
      evidence: `Material(s) ${pureMetalMats.map((m) => `"${m.name}" (Metallic: ${m.metallicFactor}, Roughness: ${m.roughnessFactor})`).join(', ')} have high metallic and low roughness.`,
      explanation:
        'Blender Material Preview mode automatically provides a built-in 360° Studio HDRI environment. In pure PBR physics, metallic surfaces have zero diffuse color and reflect 100% of the surrounding environment. If your Three.js scene only has a directional light and lacks an HDR Environment Map (IBL), this material will look pitch black or lifeless.',
      blenderFix:
        'In Three.js, ensure you load an HDR environment map (e.g. using RGBELoader) and assign it to scene.environment. If this surface is not actually metal (e.g. plastic, stone, wood, fabric), set Metallic to 0.0 in Blender Principled BSDF.',
    });
  }

  // Scan 6: Emissive Factor Clamped Without KHR_materials_emissive_strength
  const clampedEmissiveMats = materials.filter(
    (m) => m.emissiveFactor.some((v) => v > 0) && !m.extensions.some((e) => e.name === 'KHR_materials_emissive_strength')
  );
  if (clampedEmissiveMats.length > 0) {
    issues.push({
      id: 'EMISSIVE_CLAMPED',
      severity: 'MEDIUM',
      category: 'Potential issue',
      title: 'Emissive Material Without KHR_materials_emissive_strength (Capped at 1.0)',
      evidence: `Material(s) ${clampedEmissiveMats.map((m) => `"${m.name}"`).join(', ')} use emissive factors but lack KHR_materials_emissive_strength.`,
      explanation:
        'In Blender Cycles or EEVEE Bloom, emission strength is commonly set to 5.0, 10.0, or higher. However, core glTF 2.0 strictly clamps emissiveFactor to [0.0, 1.0]. Without the KHR_materials_emissive_strength extension, strong glowing materials in Blender export as faint 1.0 emissive surfaces.',
      blenderFix:
        'Ensure you use Blender 3.6 or newer and that "Export glTF Material Extensions" is checked in the glTF export dialog. Setting emission strength > 1.0 in Blender will automatically export the KHR_materials_emissive_strength extension.',
    });
  }

  // Scan 7: Non-Uniform or Negative Scale Transforms
  const nonUniformNodes: string[] = [];
  const negativeNodes: string[] = [];
  function scanNodesForScale(nodes: HierarchyNode[]) {
    for (const n of nodes) {
      if (n.hasNonUniformScale && n.scale) {
        nonUniformNodes.push(`Node "${n.name}" (Scale: [${n.scale.map((v) => v.toFixed(3)).join(', ')}])`);
      }
      if (n.hasNegativeScale && n.scale) {
        negativeNodes.push(`Node "${n.name}" (Scale: [${n.scale.map((v) => v.toFixed(3)).join(', ')}])`);
      }
      scanNodesForScale(n.children);
    }
  }
  sceneStructure.scenes.forEach((s) => scanNodesForScale(s.rootNodes));

  if (negativeNodes.length > 0) {
    issues.push({
      id: 'NEGATIVE_SCALE',
      severity: 'HIGH',
      category: 'Confirmed issue',
      title: 'Negative Scale Detected on Scene Node (Inverted Face Culling)',
      evidence: `Negative scale detected on: ${negativeNodes.slice(0, 3).join(', ')}.`,
      explanation:
        'Negative scale matrices (e.g. from an unapplied Mirror modifier or -1 scale) invert the polygon vertex winding order. Because standard glTF defaults to single-sided backface culling, faces will appear inside-out or completely invisible in Three.js and glTF viewers unless double-sided is forced.',
      blenderFix:
        'In Blender Object Mode, select the object and press Ctrl+A > "Apply All Transforms" (or Apply Scale) before exporting.',
    });
  }

  if (nonUniformNodes.length > 0) {
    issues.push({
      id: 'NON_UNIFORM_SCALE',
      severity: 'LOW',
      category: 'Potential issue',
      title: 'Non-Uniform Scale on Scene Nodes',
      evidence: `Non-uniform scale detected on: ${nonUniformNodes.slice(0, 3).join(', ')}${nonUniformNodes.length > 3 ? ` and ${nonUniformNodes.length - 3} more` : ''}.`,
      explanation:
        'Non-uniform scaling stretches coordinate spaces unevenly. If normals and tangents are not normalized properly by the shader, lighting specular highlights can appear stretched or distorted.',
      blenderFix:
        'In Blender Object Mode, select objects and apply scale transforms (Ctrl+A > Apply Scale) to ensure all node scales are [1, 1, 1].',
    });
  }

  // Scan 8: Draco / Meshopt / BasisU Compression Decoders
  const requiredDraco = rawExtensionsRequired.includes('KHR_draco_mesh_compression');
  const requiredMeshopt = rawExtensionsRequired.includes('EXT_meshopt_compression');
  const requiredBasisU = rawExtensionsRequired.includes('KHR_texture_basisu');

  if (requiredDraco) {
    issues.push({
      id: 'DRACO_COMPRESSION_REQUIRED',
      severity: 'HIGH',
      category: 'Potential issue',
      title: 'KHR_draco_mesh_compression is Required by File',
      evidence: 'KHR_draco_mesh_compression is listed in glTF "extensionsRequired".',
      explanation:
        'Draco compressed geometry cannot be parsed by default Three.js GLTFLoader without an external DRACOLoader WebAssembly decoder. If Three.js code does not configure loader.setDRACOLoader(dracoLoader), loading will throw a runtime error.',
      blenderFix:
        'In your Three.js application, import DRACOLoader from "three/examples/jsm/loaders/DRACOLoader.js", set decoder path to Draco WASM files, and pass it to gltfLoader.setDRACOLoader(dracoLoader). Alternatively, disable Draco compression in Blender export settings if not needed.',
    });
  }

  if (requiredMeshopt) {
    issues.push({
      id: 'MESHOPT_COMPRESSION_REQUIRED',
      severity: 'MEDIUM',
      category: 'Potential issue',
      title: 'EXT_meshopt_compression is Required by File',
      evidence: 'EXT_meshopt_compression is listed in glTF "extensionsRequired".',
      explanation:
        'Requires MeshoptDecoder passed to GLTFLoader.setMeshoptDecoder(MeshoptDecoder).',
      blenderFix:
        'In Three.js, import MeshoptDecoder and call gltfLoader.setMeshoptDecoder(MeshoptDecoder).',
    });
  }

  if (requiredBasisU) {
    issues.push({
      id: 'BASISU_COMPRESSION_REQUIRED',
      severity: 'HIGH',
      category: 'Potential issue',
      title: 'KHR_texture_basisu is Required by File',
      evidence: 'KHR_texture_basisu is listed in glTF "extensionsRequired".',
      explanation:
        'Requires THREE.KTX2Loader with Basis Universal transcoder worker binaries. Standard image loaders cannot decode KTX2 containers.',
      blenderFix:
        'Configure KTX2Loader with detectSupport(renderer) and attach to GLTFLoader.setKTX2Loader(ktx2Loader).',
    });
  }

  // Scan 9: Missing Textures
  const missingTextures = textures.filter((t) => t.isMissing);
  if (missingTextures.length > 0) {
    issues.push({
      id: 'MISSING_TEXTURES',
      severity: 'HIGH',
      category: 'Confirmed issue',
      title: 'Missing or Broken Texture References',
      evidence: `${missingTextures.length} texture(s) failed binary validation: ${missingTextures
        .map(
          (t) =>
            `"${t.name}" (${t.storage}${t.sourceUri ? ` URI: ${t.sourceUri}` : t.bufferViewIndex !== undefined ? ` BufferView: ${t.bufferViewIndex}` : ''} - Reason: ${t.validationDetails || t.validationClassification})`
        )
        .join('; ')}.`,
      explanation:
        'The glTF structure references image URIs or bufferViews that contain invalid byte ranges, empty data, or undecodable image bitstreams.',
      blenderFix:
        'Re-export the asset from Blender ensuring all images are packed into the .blend file (File > External Data > Pack Resources) before exporting as GLB.',
    });
  }

  // Scan 10: Unused Textures
  const unusedTextures = textures.filter((t) => t.isUnused);
  if (unusedTextures.length > 0) {
    issues.push({
      id: 'UNUSED_TEXTURES',
      severity: 'LOW',
      category: 'Potential issue',
      title: 'Unused Textures Embedded in File (Bloat)',
      evidence: `${unusedTextures.length} texture(s) are stored in the file but never used by any material: ${unusedTextures.map((t) => `"${t.name}" (${t.byteSizeFormatted})`).join(', ')}.`,
      explanation:
        'These textures occupy file size and bandwidth but do not contribute to rendering.',
      blenderFix:
        'In Blender, remove unused image textures from the Blender file (File > Clean Up > Unused Data-Blocks) before exporting.',
    });
  }

  // Scan 11: Texture Transforms on Multiple Textures
  materials.forEach((mat) => {
    const transforms: string[] = [];
    if (mat.baseColorTexture?.hasTransform) transforms.push('baseColorTexture');
    if (mat.normalTexture?.hasTransform) transforms.push('normalTexture');
    if (mat.metallicRoughnessTexture?.hasTransform) transforms.push('metallicRoughnessTexture');

    if (transforms.length > 1) {
      issues.push({
        id: `TEXTURE_TRANSFORM_${mat.index}`,
        severity: 'LOW',
        category: 'Potential issue',
        title: `Multiple KHR_texture_transform Extensions on Material "${mat.name}"`,
        evidence: `Material "${mat.name}" has UV transforms on: ${transforms.join(', ')}.`,
        explanation:
          'Three.js MeshStandardMaterial only supports a single shared UV transform matrix per UV map channel. If your baseColor, normal, and roughness textures use different scale/offsets in Blender Mapping nodes, Three.js may only apply one of them across all slots.',
        blenderFix:
          'In Blender Shader Editor, ensure all image texture Mapping nodes share identical Scale, Rotation, and Location vectors, or bake textures into a uniform UV layout.',
      });
    }
  });

  // Calculate Status Summary
  const highIssues = issues.filter((i) => i.severity === 'HIGH');
  const medIssues = issues.filter((i) => i.severity === 'MEDIUM');
  const lowIssues = issues.filter((i) => i.severity === 'LOW');

  const fileStatus: 'Valid' | 'Invalid' = parsingErrors.length === 0 ? 'Valid' : 'Invalid';

  let materialsStatus: SectionStatus = 'OK';
  if (blendMaterials.length > 0 || pureMetalMats.length > 0) materialsStatus = 'Warning';
  if (materials.some((m) => m.diagnostics.some((d) => d.includes('CRITICAL') || d.includes('FATAL')))) {
    materialsStatus = 'Error';
  }

  let texturesStatus: SectionStatus = 'OK';
  if (unusedTextures.length > 0 || textures.some((t) => t.isNPOT)) texturesStatus = 'Warning';
  if (missingTextures.length > 0) texturesStatus = 'Error';

  let geometryStatus: SectionStatus = 'OK';
  if (missingTangentPrims.length > 0 || nonUniformNodes.length > 0) geometryStatus = 'Warning';
  if (missingNormalPrims.length > 0 || missingUvPrims.length > 0 || negativeNodes.length > 0) geometryStatus = 'Error';

  let extensionsStatus: SectionStatus = 'OK';
  if (requiredDraco || requiredBasisU || requiredMeshopt) extensionsStatus = 'Warning';

  let threeJsCompatibility: DiagnosticSummary['threeJsCompatibility'] = 'No obvious issue';
  if (highIssues.length > 0) {
    threeJsCompatibility = 'Significant compatibility issue';
  } else if (medIssues.length > 0) {
    threeJsCompatibility = 'Potential compatibility issue';
  }

  const summary: DiagnosticSummary = {
    fileStatus,
    materialsStatus,
    texturesStatus,
    geometryStatus,
    extensionsStatus,
    threeJsCompatibility,
    highPriorityCount: highIssues.length,
    mediumPriorityCount: medIssues.length,
    lowPriorityCount: lowIssues.length,
    issues,
  };

  // 9. Rendering Diagnostics Notes
  const renderingDiagnostics: RenderingDiagnostics = {
    blenderShaderNodeDisclaimer:
      'CRITICAL BLENDER LIMITATION: Blender-specific procedural shader nodes (e.g. Noise Texture, Voronoi, Musgrave, Wave, ColorRamp, Mix Shader, Math nodes, Bump nodes plugged into Height without baking, Geometry Nodes, and Bevel shaders) are NOT supported in the glTF/GLB specification. Blender’s glTF exporter only exports standard Principled BSDF inputs. Any procedural shading in Blender that is not explicitly baked into an image texture before export will be permanently lost and render as uniform default grey/white in glTF viewers and Three.js.',
    colorSpaceNotes: [
      'Color Space Mismatch: In Blender, image textures must be marked as "sRGB" for Base Color, but "Non-Color" for Normal Maps, Roughness, Metallic, and Ambient Occlusion.',
      'glTF Standard defines: Base Color and Emissive textures are sRGB (linearized by WebGL shaders). Normal, Roughness, Metallic, and Occlusion textures are strictly Linear data.',
      'Three.js Setup: Ensure renderer.outputColorSpace = THREE.SRGBColorSpace. If textures appear washed out, check if Three.js applied sRGB conversion twice or missed linearizing base color.',
    ],
    lightingAndEnvironmentNotes: [
      'Blender Viewport HDRI: Blender’s 3D Viewport "Material Preview" mode includes a default 360° Studio HDRI environment reflection probe that is NOT exported in the GLB.',
      'Three.js Default: A standard Three.js scene with only a DirectionalLight has zero ambient reflections. Conductive metals (Metallic = 1.0) reflect only the ambient background and will render pitch black without an HDR environment map (scene.environment).',
      'Punctual Light Units: Blender exports lights in photometric Watts/Lumens (KHR_lights_punctual). Ensure Three.js uses physically correct light attenuation (renderer.useLegacyLights = false).',
    ],
    alphaBlendingNotes: [
      'glTF OPAQUE vs MASK vs BLEND: glTF only supports these 3 alpha modes. Blender "Alpha Hashed" maps to glTF "BLEND".',
      'Depth Sorting: glTF "BLEND" mode disables depth writing (depthWrite = false) in WebGL. Transparent surfaces cannot sort complex self-intersecting meshes correctly.',
      'Solution for foliage/cutouts: Use MASK mode with alphaCutoff (Blender "Alpha Clip") so depth writing remains active.',
    ],
    tangentSpaceNotes: [
      'MikkTSpace vs Derivative Tangents: Blender calculates normal maps using the MikkTSpace algorithm. glTF standard supports MikkTSpace vertex tangents.',
      'Missing Tangents: When "Export Tangents" is omitted in Blender, Three.js shaders approximate tangents using screen-space derivatives (dFdx/dFdy), causing visible UV seam splits and faceted reflections on curved organic meshes.',
    ],
    doubleSidedNotes: [
      'Backface Culling: In Blender Viewport, Backface Culling is disabled by default, hiding inverted normal errors. In glTF, doubleSided defaults to FALSE. Inverted polygons will be invisible in Three.js unless "Double-Sided" was explicitly checked in Blender material settings.',
    ],
  };

  // Blender vs Three.js Web Render Compatibility Analysis
  const blenderCompatibility = analyzeRenderCompatibility(
    fileInfo,
    sceneStructure,
    materials,
    textures,
    meshes,
    gltfRaw
  );

  fileInfo.parseTimeMs = Math.round(performance.now() - startTime);

  return {
    fileInfo,
    sceneStructure,
    materials,
    textures,
    meshes,
    extensions,
    renderingDiagnostics,
    summary,
    rawJson: gltfRaw,
    blenderCompatibility,
  };
}

