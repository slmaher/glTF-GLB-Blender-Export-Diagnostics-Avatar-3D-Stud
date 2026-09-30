export type StudioViewerMode = 'embedded' | 'fullscreen' | 'studio';

export type BackgroundStyle = 'solid' | 'gradient' | 'environment' | 'transparent';

export interface BackgroundSettings {
  style: BackgroundStyle;
  solidColor: string;
  gradientTop: string;
  gradientBottom: string;
  gradientAngle: number;
}

export interface CustomLightSettings {
  enabled: boolean;
  color: string;
  intensity: number;
  position: [number, number, number];
}

export interface LightingStudioSettings {
  presetName: string;
  keyLight: CustomLightSettings;
  fillLight: CustomLightSettings;
  rimLight: CustomLightSettings;
  ambientLight: {
    enabled: boolean;
    color: string;
    intensity: number;
  };
}

export type CameraPresetKey =
  | 'fullBody'
  | 'fullBody34'
  | 'halfBody'
  | 'waistUp'
  | 'bust'
  | 'portrait'
  | 'head'
  | 'face'
  | 'closeUp';

export type PresentationAngleKey =
  | 'front'
  | 'threeQuarterLeft'
  | 'threeQuarterRight'
  | 'sideLeft'
  | 'sideRight'
  | 'back';

export type AvatarPartCategory =
  | 'Hair'
  | 'Skin'
  | 'Face'
  | 'Eyes'
  | 'Eyebrows'
  | 'Eyelashes'
  | 'Teeth'
  | 'Tongue'
  | 'Clothes'
  | 'Shirt'
  | 'Pants'
  | 'Shoes'
  | 'Accessories'
  | 'Jewelry'
  | 'Other';

export interface AvatarPartItem {
  id: string;
  name: string;
  category: AvatarPartCategory;
  meshUuids: string[];
  materialNames: string[];
  trianglesCount: number;
  visible: boolean;
  confidence: 'High' | 'Medium' | 'Low';
  detectionSource: string;
}

export interface MaterialRuntimeOverride {
  materialName: string;
  tintColor?: string;
  roughness?: number;
  metalness?: number;
  opacity?: number;
  emissiveColor?: string;
  emissiveIntensity?: number;
  alphaTest?: number;
}

export interface StudioSceneNode {
  uuid: string;
  name: string;
  type: string;
  visible: boolean;
  isMesh: boolean;
  isSkinned: boolean;
  isBone: boolean;
  triangles: number;
  children: StudioSceneNode[];
}

export interface AvatarPosePreset {
  id: string;
  name: string;
  description: string;
  boneRotations: Record<string, [number, number, number]>; // Euler rotations in radians
}

export interface StudioSavedPreset {
  id: string;
  name: string;
  timestamp: string;
  background: BackgroundSettings;
  lighting: LightingStudioSettings;
  toneMapping: string;
  exposure: number;
  partVisibilities: Record<string, boolean>;
  materialOverrides: Record<string, MaterialRuntimeOverride>;
}
