export type CompatibilitySeverity = 'critical' | 'warning' | 'info' | 'passed';

export type CompatibilityCategory =
  | 'Materials & Shaders'
  | 'Procedural Shaders'
  | 'Color Management'
  | 'Textures'
  | 'Normals & Tangents'
  | 'Lighting & Environment'
  | 'Geometry & Transforms'
  | 'Skinning & Avatar';

export interface CompatibilityFinding {
  id: string;
  category: CompatibilityCategory;
  severity: CompatibilitySeverity;
  title: string;
  affectedItem: string; // e.g. Material "Skin_Mat", Mesh "Body.001"
  problem: string;
  evidence: string;
  whyItMatters: string;
  expectedBlenderBehavior: string;
  expectedThreeJsBehavior: string;
  recommendedFix: string;
}

export interface RenderDifferenceCause {
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  category: CompatibilityCategory;
  title: string;
  affectedItem: string;
  technicalReason: string;
  expectedBlenderBehavior: string;
  expectedThreeJsBehavior: string;
  recommendedFix: string;
}

export interface DeductionItem {
  reason: string;
  points: number;
}

export interface CategoryScore {
  name: string;
  categoryKey: string;
  score: number; // 0 to 100
  deductions: DeductionItem[];
  status: 'passed' | 'warning' | 'critical';
}

export interface CompatibilityScores {
  overall: number; // 0 to 100
  materials: CategoryScore;
  textures: CategoryScore;
  lighting: CategoryScore;
  colorManagement: CategoryScore;
  geometry: CategoryScore;
  avatar: CategoryScore;
  deductionLog: Array<{ category: string; reason: string; points: number }>;
}

export interface KnownUnknownItem {
  feature: string;
  details: string;
  status: 'verified' | 'unknown';
  source: string;
}

export interface ComparisonChecklistItem {
  feature: string;
  status: '✓' | '⚠' | '✕' | '?';
  statusLabel: 'Verified / Good' | 'Attention / Warning' | 'Critical / Issue' | 'Unknown / Not Stored in GLB';
  blenderStatus: string;
  threeJsStatus: string;
  note: string;
}

export interface BlendshapeDetail {
  index: number;
  name: string;
  isARKitStandard: boolean;
  category?: 'eye' | 'jaw' | 'mouth' | 'brow' | 'cheek' | 'nose' | 'viseme' | 'other';
}

export interface AvatarReadinessAnalysis {
  isAvatar: boolean;
  hasSkinning: boolean;
  boneCount: number;
  rootJointName?: string;
  skinsCount: number;
  maxJointsPerVertex: number;
  hasMorphTargets: boolean;
  morphTargetCount: number;
  morphTargetNames: string[];
  blendshapeDetails: BlendshapeDetail[];
  arkitStandardCount: number;
  hasJawControl: boolean;
  hasEyeBlinkOrGaze: boolean;
  isWebAnimationReady: boolean;
  suitabilityStatus: 'Optimal' | 'Compatible' | 'Needs Attention' | 'Not an Avatar / Incomplete';
  recommendations: string[];
}

export interface BlenderCompatibilityReport {
  overallScore: number;
  scores: CompatibilityScores;
  prioritizedCauses: RenderDifferenceCause[];
  findings: CompatibilityFinding[];
  knownVsUnknown: {
    verifiedFromGlb: KnownUnknownItem[];
    cannotBeVerified: KnownUnknownItem[];
  };
  comparisonChecklist: ComparisonChecklistItem[];
  avatarReadiness: AvatarReadinessAnalysis;
  lightingReconstructible: boolean;
  lightingDisclaimer: string;
}
