export type EvidenceLevel =
  | 'CONFIRMED_FROM_GLB'
  | 'POTENTIAL_DIFFERENCE'
  | 'CONFIRMED_BY_RENDER_COMPARISON'
  | 'UNKNOWN';

export type ComparisonConfidence = 'High' | 'Medium' | 'Low';

export interface BlenderReferenceImage {
  name: string;
  dataUrl: string;
  width: number;
  height: number;
  aspectRatio: number;
  fileSizeFormatted: string;
}

export interface ThreeJsCapturedImage {
  dataUrl: string;
  width: number;
  height: number;
  aspectRatio: number;
  capturedAt: string;
  renderSettings: {
    toneMapping: string;
    exposure: number;
    colorSpace: string;
    envEnabled: boolean;
    hdrName: string;
    hdrIntensity: number;
    hdrRotation: number;
    sceneLights: number;
    hairMode: 'BLEND' | 'MASK';
    normalMapsEnabled: boolean;
  };
}

export interface AlignmentCheckResult {
  confidence: ComparisonConfidence;
  aspectRatioDiffPercent: number;
  isAspectSimilar: boolean;
  isResolutionSimilar: boolean;
  reason: string;
  details: string[];
}

export interface VisualDifferenceFinding {
  id: string;
  category:
    | 'Color'
    | 'Exposure'
    | 'Lighting'
    | 'Shadows'
    | 'Reflections'
    | 'Roughness'
    | 'Normal Detail'
    | 'Transparency'
    | 'Hair'
    | 'Skin'
    | 'Materials'
    | 'Geometry'
    | 'Background';
  title: string;
  confidence: ComparisonConfidence;
  evidenceLevel: EvidenceLevel;
  evidence: string;
  potentialCause: string;
  nextTest: string;
}

export interface RuntimeTextureInfo {
  slot: string;
  textureName: string;
  colorSpace: string;
  wrapS: string;
  wrapT: string;
  minFilter: string;
  magFilter: string;
  flipY: boolean;
}

export interface RuntimeMaterialInspection {
  materialIndex: number;
  name: string;
  type: string;
  transparent: boolean;
  depthWrite: boolean;
  depthTest: boolean;
  alphaTest: number;
  side: string;
  roughness: number;
  metalness: number;
  normalScale: number;
  textures: RuntimeTextureInfo[];
}

export interface NormalTangentPrimitiveAudit {
  meshIndex: number;
  meshName: string;
  primitiveIndex: number;
  materialName: string;
  hasNormalMap: boolean;
  hasUv0: boolean;
  hasTangent: boolean;
  isSkinned: boolean;
  hasMorphTargets: boolean;
}
