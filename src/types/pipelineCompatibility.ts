/**
 * Types for the Blender -> glTF -> Three.js Render Pipeline Compatibility Analyzer
 */

export type EvidenceClassification =
  | 'CONFIRMED FROM GLB'
  | 'CONFIRMED FROM THREE.JS RUNTIME'
  | 'CONFIRMED BY RENDER EXPERIMENT'
  | 'POTENTIAL'
  | 'UNKNOWN';

export type FeatureRepresentationInGlb =
  | 'Represented in GLB'
  | 'Partially represented'
  | 'Not represented'
  | 'Unknown';

export interface MaterialFeatureAudit {
  featureName: string;
  glbStatus: FeatureRepresentationInGlb;
  valueInGlb: string;
  runtimeThreeJsInterpretation: string;
  blenderExportNotes: string;
}

export interface MaterialDetailedAudit {
  materialIndex: number;
  materialName: string;
  materialType: string;
  features: MaterialFeatureAudit[];
  isHairOrThinGeometry: boolean;
  hasHighMetalness: boolean;
  alphaMode: 'OPAQUE' | 'MASK' | 'BLEND';
  alphaCutoff?: number;
  doubleSided: boolean;
  runtimeInspection?: {
    transparent: boolean;
    depthWrite: boolean;
    depthTest: boolean;
    alphaTest: number;
    side: string;
    opacity: number;
  };
}

export interface NormalTangentPrimitiveAudit {
  meshIndex: number;
  meshName: string;
  primitiveIndex: number;
  materialName: string;
  hasNormalAttribute: boolean;
  hasTangentAttribute: boolean;
  hasTexCoord0: boolean;
  hasTexCoord1: boolean;
  hasNormalTexture: boolean;
  hasSkinning: boolean;
  hasMorphTargets: boolean;
  runtimeTangentHandling: string;
}

export interface PipelineDiagnosticFinding {
  id: string;
  classification: EvidenceClassification;
  category:
    | 'Materials & Shaders'
    | 'Transparency & Hair'
    | 'Normals & Tangents'
    | 'Geometry & Skinning'
    | 'Textures & Color Space'
    | 'Lighting & Environment'
    | 'Color Management & Tone Mapping';
  title: string;
  finding: string;
  evidence: string;
  affectedObjects: string[];
  whyItCanChangeAppearance: string;
  suggestedExperiment?: string;
  experimentKey?: 'HAIR' | 'NORMAL_MAPS' | 'TONE_MAPPING' | 'EXPOSURE' | 'ENVIRONMENT' | 'METALLIC';
  threeJsRuntimeContext?: string;
  blenderContext?: string;
}

export interface ThreeJsRuntimeState {
  outputColorSpace: string;
  toneMapping: string;
  exposure: number;
  envEnabled: boolean;
  hdrName: string;
  hdrIntensity: number;
  hdrRotation: number;
  sceneLightsCount: number;
  hairMode: 'BLEND' | 'MASK';
  normalMapsEnabled: boolean;
}

export interface ActiveRenderExperiments {
  hairMaskActive: boolean;
  normalMapsDisabled: boolean;
  experimentalToneMapping: string | null;
  experimentalExposure: number | null;
  environmentDisabled: boolean;
  experimentLog: Array<{
    id: string;
    name: string;
    resultSummary: string;
    confirmedDifference: boolean;
    timestamp: string;
  }>;
}

export interface PipelineCompatibilityReport {
  pipelineSummary: {
    confirmedGlbCount: number;
    confirmedRuntimeCount: number;
    confirmedExperimentCount: number;
    potentialCount: number;
    unknownCount: number;
  };
  materialAudits: MaterialDetailedAudit[];
  normalAudits: NormalTangentPrimitiveAudit[];
  findingsByTier: {
    confirmedFromGlb: PipelineDiagnosticFinding[];
    confirmedFromRuntime: PipelineDiagnosticFinding[];
    confirmedByExperiment: PipelineDiagnosticFinding[];
    potentialCauses: PipelineDiagnosticFinding[];
    unknownFactors: PipelineDiagnosticFinding[];
  };
}
