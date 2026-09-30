export type AlphaMode = 'OPAQUE' | 'MASK' | 'BLEND';

export type IssueSeverity = 'HIGH' | 'MEDIUM' | 'LOW';
export type IssueCategory = 'Confirmed issue' | 'Potential issue' | 'Informational';

export interface ParserNotice {
  source: string;
  severity: 'Notice' | 'Warning' | 'Error';
  impact: string;
  message: string;
  details?: string;
}

export interface FileInfo {
  name: string;
  sizeBytes: number;
  sizeFormatted: string;
  format: 'GLB' | 'glTF' | 'Unknown';
  version: string;
  generator?: string;
  copyright?: string;
  isValid: boolean;
  parseTimeMs: number;
  parsingErrors: string[];
  parsingWarnings: string[];
  parserNotices?: ParserNotice[];
}

export interface HierarchyNode {
  index: number;
  name: string;
  translation?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
  hasNonUniformScale: boolean;
  hasNegativeScale: boolean;
  meshIndex?: number;
  meshName?: string;
  cameraIndex?: number;
  children: HierarchyNode[];
}

export interface SceneStructure {
  scenesCount: number;
  nodesCount: number;
  meshesCount: number;
  primitivesCount: number;
  materialsCount: number;
  texturesCount: number;
  imagesCount: number;
  camerasCount: number;
  lightsCount: number;
  animationsCount: number;
  skinsCount: number;
  scenes: Array<{
    index: number;
    name: string;
    rootNodes: HierarchyNode[];
  }>;
}

export interface MaterialExtensionInfo {
  name: string;
  data: Record<string, unknown>;
  description: string;
  threeJsSupport: string;
  renderingImpact: string;
}

export interface TextureRefInfo {
  textureIndex: number;
  textureName: string;
  hasTransform?: boolean;
  transform?: {
    offset?: [number, number];
    scale?: [number, number];
    rotation?: number;
    texCoord?: number;
  };
  scale?: number;
  strength?: number;
}

export interface MaterialAnalysis {
  index: number;
  name: string;
  type: string;
  alphaMode: AlphaMode;
  alphaCutoff: number;
  doubleSided: boolean;
  baseColorFactor: [number, number, number, number];
  metallicFactor: number;
  roughnessFactor: number;
  emissiveFactor: [number, number, number];
  normalScale: number;
  occlusionStrength: number;
  baseColorTexture?: TextureRefInfo;
  normalTexture?: TextureRefInfo;
  metallicRoughnessTexture?: TextureRefInfo;
  occlusionTexture?: TextureRefInfo;
  emissiveTexture?: TextureRefInfo;
  extensions: MaterialExtensionInfo[];
  diagnostics: string[];
}

export interface TextureAnalysis {
  index: number;
  name: string;
  imageIndex: number;
  imageName: string;
  format: string;
  mimeType: string;
  width?: number;
  height?: number;
  isNPOT: boolean;
  byteSize?: number;
  byteSizeFormatted: string;
  isEmbedded: boolean;
  storage: 'Embedded GLB' | 'External URI' | 'Data URI' | 'Unknown';
  sourceUri?: string;
  bufferViewIndex?: number;
  validationStatus: 'VALID' | 'WARNING' | 'ERROR';
  validationClassification: string;
  decodeStatus: 'PASS' | 'FAIL' | 'SKIPPED';
  validationDetails?: string;
  sampler: {
    minFilter: number;
    minFilterName: string;
    magFilter: number;
    magFilterName: string;
    wrapS: number;
    wrapSName: string;
    wrapT: number;
    wrapTName: string;
  };
  detectedPurposes: string[];
  isUnused: boolean;
  isMissing: boolean;
  previewUrl?: string;
  diagnostics: string[];
}

export interface PrimitiveAnalysis {
  primitiveIndex: number;
  materialIndex?: number;
  materialName?: string;
  mode: string;
  vertexCount: number;
  triangleCount: number;
  hasIndices: boolean;
  attributes: {
    hasPosition: boolean;
    hasNormal: boolean;
    hasTangent: boolean;
    hasTexCoord0: boolean;
    hasTexCoord1: boolean;
    hasColor0: boolean;
    color0Type?: string;
    hasJoints0: boolean;
    hasWeights0: boolean;
    customAttributes: string[];
  };
  diagnostics: string[];
}

export interface MeshAnalysis {
  index: number;
  name: string;
  primitivesCount: number;
  totalVertices: number;
  totalTriangles: number;
  boundingBox?: {
    min: [number, number, number];
    max: [number, number, number];
    size: [number, number, number];
  };
  primitives: PrimitiveAnalysis[];
  diagnostics: string[];
}

export interface ExtensionAnalysis {
  name: string;
  isRequired: boolean;
  description: string;
  threeJsSupport: string;
  renderingImpact: string;
  isCompression: boolean;
}

export interface CompatibilityIssue {
  id: string;
  severity: IssueSeverity;
  category: IssueCategory;
  title: string;
  evidence: string;
  explanation: string;
  blenderFix: string;
}

export type SectionStatus = 'OK' | 'Warning' | 'Error';

export interface DiagnosticSummary {
  fileStatus: 'Valid' | 'Invalid';
  materialsStatus: SectionStatus;
  texturesStatus: SectionStatus;
  geometryStatus: SectionStatus;
  extensionsStatus: SectionStatus;
  threeJsCompatibility: 'No obvious issue' | 'Potential compatibility issue' | 'Significant compatibility issue';
  highPriorityCount: number;
  mediumPriorityCount: number;
  lowPriorityCount: number;
  issues: CompatibilityIssue[];
}

export interface RenderingDiagnostics {
  blenderShaderNodeDisclaimer: string;
  colorSpaceNotes: string[];
  lightingAndEnvironmentNotes: string[];
  alphaBlendingNotes: string[];
  tangentSpaceNotes: string[];
  doubleSidedNotes: string[];
}

export * from './compatibility';
import type { BlenderCompatibilityReport } from './compatibility';

export interface DiagnosticReport {
  fileInfo: FileInfo;
  sceneStructure: SceneStructure;
  materials: MaterialAnalysis[];
  textures: TextureAnalysis[];
  meshes: MeshAnalysis[];
  extensions: ExtensionAnalysis[];
  renderingDiagnostics: RenderingDiagnostics;
  summary: DiagnosticSummary;
  rawJson?: any;
  blenderCompatibility?: BlenderCompatibilityReport;
}

