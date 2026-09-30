import * as THREE from 'three';
import type {
  AvatarPartItem,
  AvatarPartCategory,
  StudioSceneNode,
  LightingStudioSettings,
  CameraPresetKey,
  PresentationAngleKey,
  AvatarPosePreset,
} from '../types/avatarStudio';

// 1. Lighting Studio Presets
export const LIGHTING_PRESETS: Record<string, LightingStudioSettings> = {
  'Neutral Studio': {
    presetName: 'Neutral Studio',
    keyLight: { enabled: true, color: '#ffffff', intensity: 2.2, position: [4, 6, 5] },
    fillLight: { enabled: true, color: '#cbd5e1', intensity: 1.2, position: [-4, 3, -3] },
    rimLight: { enabled: true, color: '#93c5fd', intensity: 1.8, position: [0, 5, -6] },
    ambientLight: { enabled: true, color: '#ffffff', intensity: 0.6 },
  },
  'Soft Portrait': {
    presetName: 'Soft Portrait',
    keyLight: { enabled: true, color: '#fff1e6', intensity: 2.5, position: [3, 5, 4] },
    fillLight: { enabled: true, color: '#dbeafe', intensity: 1.6, position: [-4, 2, 2] },
    rimLight: { enabled: true, color: '#fed7aa', intensity: 1.2, position: [-2, 6, -5] },
    ambientLight: { enabled: true, color: '#fff7ed', intensity: 0.8 },
  },
  'Beauty': {
    presetName: 'Beauty',
    keyLight: { enabled: true, color: '#ffffff', intensity: 3.0, position: [0, 5, 6] },
    fillLight: { enabled: true, color: '#f8fafc', intensity: 2.0, position: [0, -2, 4] },
    rimLight: { enabled: true, color: '#e2e8f0', intensity: 1.8, position: [4, 4, -5] },
    ambientLight: { enabled: true, color: '#ffffff', intensity: 0.9 },
  },
  'Dramatic': {
    presetName: 'Dramatic',
    keyLight: { enabled: true, color: '#ffedd5', intensity: 3.8, position: [6, 4, 3] },
    fillLight: { enabled: true, color: '#1e293b', intensity: 0.4, position: [-5, 1, 2] },
    rimLight: { enabled: true, color: '#38bdf8', intensity: 3.5, position: [-3, 5, -6] },
    ambientLight: { enabled: true, color: '#0f172a', intensity: 0.2 },
  },
  'Front Light': {
    presetName: 'Front Light',
    keyLight: { enabled: true, color: '#ffffff', intensity: 3.2, position: [0, 3, 6] },
    fillLight: { enabled: false, color: '#cbd5e1', intensity: 0.8, position: [-3, 2, 2] },
    rimLight: { enabled: true, color: '#93c5fd', intensity: 1.2, position: [0, 4, -5] },
    ambientLight: { enabled: true, color: '#f1f5f9', intensity: 0.7 },
  },
  'Three-Quarter': {
    presetName: 'Three-Quarter',
    keyLight: { enabled: true, color: '#fffbeb', intensity: 2.8, position: [5, 5, 4] },
    fillLight: { enabled: true, color: '#e0f2fe', intensity: 1.4, position: [-4, 2, 1] },
    rimLight: { enabled: true, color: '#fbcfe8', intensity: 2.2, position: [-4, 6, -5] },
    ambientLight: { enabled: true, color: '#f8fafc', intensity: 0.6 },
  },
  'Rim Light': {
    presetName: 'Rim Light',
    keyLight: { enabled: true, color: '#f8fafc', intensity: 1.0, position: [2, 2, 4] },
    fillLight: { enabled: true, color: '#1e293b', intensity: 0.4, position: [-2, 1, 2] },
    rimLight: { enabled: true, color: '#38bdf8', intensity: 4.5, position: [0, 6, -6] },
    ambientLight: { enabled: true, color: '#020617', intensity: 0.2 },
  },
  'Product Studio': {
    presetName: 'Product Studio',
    keyLight: { enabled: true, color: '#ffffff', intensity: 2.4, position: [3, 8, 4] },
    fillLight: { enabled: true, color: '#f1f5f9', intensity: 1.8, position: [-4, 3, 3] },
    rimLight: { enabled: true, color: '#e2e8f0', intensity: 1.5, position: [0, -2, -5] },
    ambientLight: { enabled: true, color: '#ffffff', intensity: 1.2 },
  },
};

// 2. Semantic Avatar Parts Classification Patterns
interface CategoryPattern {
  category: AvatarPartCategory;
  keywords: string[];
}

const CATEGORY_PATTERNS: CategoryPattern[] = [
  {
    category: 'Hair',
    keywords: ['hair', 'blinn', 'strand', 'scalp', 'braid', 'ponytail', 'bun', 'curl', 'locks'],
  },
  {
    category: 'Eyes',
    keywords: ['eye_mesh', 'eye', 'cornea', 'iris', 'pupil', 'sclera', 'eyeball'],
  },
  {
    category: 'Eyebrows',
    keywords: ['eyebrow', 'brow'],
  },
  {
    category: 'Eyelashes',
    keywords: ['eyelash', 'lash'],
  },
  {
    category: 'Teeth',
    keywords: ['teeth', 'tooth', 'dental'],
  },
  {
    category: 'Tongue',
    keywords: ['tongue'],
  },
  {
    category: 'Shirt',
    keywords: ['shirt', 'top', 'jacket', 'coat', 'hoodie', 'tshirt', 'blouse', 'vest', 'sweater'],
  },
  {
    category: 'Pants',
    keywords: ['pant', 'trouser', 'jean', 'bottom', 'skirt', 'short', 'legging'],
  },
  {
    category: 'Shoes',
    keywords: ['shoe', 'boot', 'footwear', 'sneaker', 'heel', 'sandal'],
  },
  {
    category: 'Accessories',
    keywords: ['glove', 'hat', 'cap', 'belt', 'glass', 'spectacle', 'ring', 'necklace', 'bracelet', 'accessory'],
  },
  {
    category: 'Clothes',
    keywords: ['cloth', 'outfit', 'dress', 'garment', 'apparel', 'suit', 'uniform'],
  },
  {
    category: 'Skin',
    keywords: ['skin', 'body', 'head', 'face', 'arm', 'leg', 'torso', 'hand', 'neck', 'standardSurface'],
  },
];

export function inspectAvatarParts(model: THREE.Group): AvatarPartItem[] {
  const partsMap = new Map<string, AvatarPartItem>();

  model.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      const meshName = (mesh.name || '').toLowerCase();
      const nodeName = (mesh.parent?.name || '').toLowerCase();

      // Check materials
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const matNames = materials.map((m) => (m ? m.name : ''));
      const combinedText = `${meshName} ${nodeName} ${matNames.join(' ')}`.toLowerCase();

      let matchedCategory: AvatarPartCategory = 'Other';
      let confidence: 'High' | 'Medium' | 'Low' = 'Low';
      let source = 'Mesh structure';

      for (const pat of CATEGORY_PATTERNS) {
        const hasKeyword = pat.keywords.some((kw) => combinedText.includes(kw));
        if (hasKeyword) {
          matchedCategory = pat.category;
          const matchInMesh = pat.keywords.some((kw) => meshName.includes(kw));
          const matchInMat = pat.keywords.some((kw) => matNames.some((m) => m.toLowerCase().includes(kw)));
          if (matchInMesh && matchInMat) {
            confidence = 'High';
            source = `Mesh and Material name ("${pat.keywords.find((kw) => combinedText.includes(kw))}")`;
          } else {
            confidence = 'Medium';
            source = `Naming pattern match ("${pat.keywords.find((kw) => combinedText.includes(kw))}")`;
          }
          break;
        }
      }

      // Calculate triangles
      let triangles = 0;
      if (mesh.geometry) {
        if (mesh.geometry.index) {
          triangles = Math.floor(mesh.geometry.index.count / 3);
        } else if (mesh.geometry.attributes.position) {
          triangles = Math.floor(mesh.geometry.attributes.position.count / 3);
        }
      }

      const partKey = `${matchedCategory}_${mesh.name || mesh.id}`;
      if (!partsMap.has(partKey)) {
        partsMap.set(partKey, {
          id: mesh.uuid,
          name: mesh.name || `${matchedCategory} Part`,
          category: matchedCategory,
          meshUuids: [mesh.uuid],
          materialNames: matNames.filter(Boolean),
          trianglesCount: triangles,
          visible: mesh.visible,
          confidence,
          detectionSource: source,
        });
      } else {
        const existing = partsMap.get(partKey)!;
        existing.meshUuids.push(mesh.uuid);
        existing.trianglesCount += triangles;
      }
    }
  });

  return Array.from(partsMap.values());
}

// 3. Dynamic Framing Calculations based on Bounding Box
export interface CameraFramingTarget {
  cameraPos: [number, number, number];
  targetPos: [number, number, number];
  fov?: number;
}

export function calculateCameraFraming(
  model: THREE.Group,
  preset: CameraPresetKey,
  angle: PresentationAngleKey = 'front'
): CameraFramingTarget {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const height = Math.max(size.y, 0.1);
  const width = Math.max(size.x, 0.1);

  // Vertical landmarks
  const headY = box.max.y - height * 0.12;
  const faceY = box.max.y - height * 0.15;
  const bustY = box.max.y - height * 0.28;
  const waistY = box.max.y - height * 0.48;
  const fullBodyY = center.y;

  // Angle azimuth in radians
  let azimuth = 0;
  switch (angle) {
    case 'front':
      azimuth = 0;
      break;
    case 'threeQuarterRight':
      azimuth = Math.PI / 5; // ~36 deg
      break;
    case 'threeQuarterLeft':
      azimuth = -Math.PI / 5;
      break;
    case 'sideRight':
      azimuth = Math.PI / 2;
      break;
    case 'sideLeft':
      azimuth = -Math.PI / 2;
      break;
    case 'back':
      azimuth = Math.PI;
      break;
  }

  let targetY = fullBodyY;
  let targetDistance = height * 1.6;
  let cameraElevation = 0;

  switch (preset) {
    case 'fullBody':
      targetY = fullBodyY;
      targetDistance = Math.max(height * 1.55, width * 1.8);
      break;
    case 'fullBody34':
      targetY = fullBodyY;
      targetDistance = Math.max(height * 1.6, width * 1.8);
      azimuth = azimuth === 0 ? Math.PI / 5 : azimuth;
      break;
    case 'halfBody':
      targetY = waistY + height * 0.12;
      targetDistance = height * 0.95;
      break;
    case 'waistUp':
      targetY = waistY + height * 0.15;
      targetDistance = height * 0.8;
      break;
    case 'bust':
      targetY = bustY;
      targetDistance = height * 0.55;
      break;
    case 'portrait':
      targetY = faceY;
      targetDistance = height * 0.48;
      break;
    case 'head':
      targetY = headY;
      targetDistance = height * 0.38;
      break;
    case 'face':
      targetY = faceY;
      targetDistance = height * 0.3;
      break;
    case 'closeUp':
      targetY = faceY;
      targetDistance = height * 0.22;
      cameraElevation = height * 0.02;
      break;
  }

  const posX = center.x + Math.sin(azimuth) * targetDistance;
  const posY = targetY + cameraElevation;
  const posZ = center.z + Math.cos(azimuth) * targetDistance;

  return {
    cameraPos: [posX, posY, posZ],
    targetPos: [center.x, targetY, center.z],
  };
}

// 4. Build Tree Node Hierarchy for Scene Explorer
export function buildSceneNodeTree(object: THREE.Object3D): StudioSceneNode {
  let triangles = 0;
  const isMesh = (object as THREE.Mesh).isMesh === true;
  const isSkinned = (object as THREE.SkinnedMesh).isSkinnedMesh === true;
  const isBone = (object as THREE.Bone).isBone === true;

  if (isMesh) {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) {
      if (mesh.geometry.index) {
        triangles = Math.floor(mesh.geometry.index.count / 3);
      } else if (mesh.geometry.attributes.position) {
        triangles = Math.floor(mesh.geometry.attributes.position.count / 3);
      }
    }
  }

  const children: StudioSceneNode[] = [];
  for (const child of object.children) {
    children.push(buildSceneNodeTree(child));
  }

  return {
    uuid: object.uuid,
    name: object.name || `${object.type}_${object.id}`,
    type: object.type,
    visible: object.visible,
    isMesh,
    isSkinned,
    isBone,
    triangles,
    children,
  };
}

// 5. Gradient Canvas Texture Generator for Studio Background
export function createGradientCanvasTexture(
  topColor: string,
  bottomColor: string,
  angleDeg: number = 180
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const rad = (angleDeg * Math.PI) / 180;
  const x1 = Math.round(256 - Math.cos(rad) * 256);
  const y1 = Math.round(256 - Math.sin(rad) * 256);
  const x2 = Math.round(256 + Math.cos(rad) * 256);
  const y2 = Math.round(256 + Math.sin(rad) * 256);

  const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
  gradient.addColorStop(0, topColor);
  gradient.addColorStop(1, bottomColor);

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 512);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// 6. Pose Presets for Humanoid Skeletons
export const HUMANOID_POSE_PRESETS: AvatarPosePreset[] = [
  {
    id: 'neutral',
    name: 'Neutral Relaxed',
    description: 'Natural resting posture with arms at sides.',
    boneRotations: {
      leftarm: [0, 0, 0.45],
      rightarm: [0, 0, -0.45],
      leftforearm: [0, 0, 0.2],
      rightforearm: [0, 0, -0.2],
      head: [0.05, 0, 0],
    },
  },
  {
    id: 't-pose',
    name: 'T-Pose',
    description: 'Standard modeling calibration pose with arms horizontal.',
    boneRotations: {
      leftarm: [0, 0, 1.57],
      rightarm: [0, 0, -1.57],
      leftforearm: [0, 0, 0],
      rightforearm: [0, 0, 0],
      head: [0, 0, 0],
    },
  },
  {
    id: 'a-pose',
    name: 'A-Pose',
    description: 'Standard 45-degree arm angle presentation pose.',
    boneRotations: {
      leftarm: [0, 0, 0.78],
      rightarm: [0, 0, -0.78],
      leftforearm: [0, 0, 0],
      rightforearm: [0, 0, 0],
      head: [0, 0, 0],
    },
  },
  {
    id: 'portrait',
    name: 'Portrait Elegance',
    description: 'Gentle head tilt with subtle shoulder angle for photography.',
    boneRotations: {
      head: [-0.08, 0.12, 0.05],
      neck: [-0.04, 0.08, 0.03],
      leftarm: [0.1, 0, 0.35],
      rightarm: [-0.1, 0, -0.4],
    },
  },
  {
    id: 'hero',
    name: 'Hero Stance',
    description: 'Confident chest-forward posture with hands slightly forward.',
    boneRotations: {
      spine: [0.08, 0, 0],
      head: [0.08, 0, 0],
      leftarm: [0.2, 0.1, 0.4],
      rightarm: [0.2, -0.1, -0.4],
    },
  },
];
