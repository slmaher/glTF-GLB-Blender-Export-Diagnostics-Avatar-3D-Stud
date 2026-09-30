import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import {
  Sparkles,
  Grid3X3,
  Eye,
  RotateCw,
  AlertTriangle,
  Sliders,
  Upload,
  Camera,
  CheckCircle2,
  XCircle,
  RefreshCw,
  X,
  Maximize2,
  Layers,
  Sun,
  Palette,
  Film,
  FolderTree,
  Play,
  Pause,
  Square,
  User,
  Info,
  Save,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import type {
  ThreeJsCapturedImage,
  RuntimeMaterialInspection,
  RuntimeTextureInfo,
} from '../types/renderComparison';
import type { ThreeJsRuntimeState } from '../types/pipelineCompatibility';
import type {
  StudioViewerMode,
  BackgroundSettings,
  LightingStudioSettings,
  CameraPresetKey,
  PresentationAngleKey,
  AvatarPartItem,
  MaterialRuntimeOverride,
  StudioSceneNode,
  StudioSavedPreset,
} from '../types/avatarStudio';
import {
  LIGHTING_PRESETS,
  inspectAvatarParts,
  calculateCameraFraming,
  buildSceneNodeTree,
  createGradientCanvasTexture,
  HUMANOID_POSE_PRESETS,
} from '../utils/avatarStudioUtils';
import './AvatarStudio.css';

export interface ModelViewerProps {
  file: File;
  onCaptureReady?: (captureFn: () => ThreeJsCapturedImage | null) => void;
  onRuntimeInspection?: (materials: RuntimeMaterialInspection[]) => void;
  onRuntimeStateChange?: (state: ThreeJsRuntimeState) => void;
  externalHairMode?: 'BLEND' | 'MASK';
  externalNormalMapsEnabled?: boolean;
}

const DEFAULT_BACKGROUND: BackgroundSettings = {
  style: 'solid',
  solidColor: '#0e1117',
  gradientTop: '#1e293b',
  gradientBottom: '#020617',
  gradientAngle: 180,
};

export const ModelViewer: React.FC<ModelViewerProps> = ({
  file,
  onCaptureReady,
  onRuntimeInspection,
  onRuntimeStateChange,
  externalHairMode,
  externalNormalMapsEnabled,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasMountRef = useRef<HTMLDivElement>(null);
  const hdrFileInputRef = useRef<HTMLInputElement>(null);

  // Studio Display Mode State (embedded by default to maintain page flow)
  const [viewerMode, setViewerMode] = useState<StudioViewerMode>('embedded');
  const [presentationMode, setPresentationMode] = useState(false);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [activeLeftTab, setActiveLeftTab] = useState<'bg' | 'light' | 'mat' | 'render'>('bg');
  const [activeRightTab, setActiveRightTab] = useState<'parts' | 'tree' | 'pose' | 'anim'>('parts');

  // Loading & Base Stats
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [wireframe, setWireframe] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [stats, setStats] = useState<{ triangles: number; meshes: number } | null>(null);

  // Background Studio
  const [backgroundSettings, setBackgroundSettings] = useState<BackgroundSettings>(DEFAULT_BACKGROUND);

  // Lighting Studio
  const [lightingSettings, setLightingSettings] = useState<LightingStudioSettings>(
    LIGHTING_PRESETS['Neutral Studio']
  );

  // HDRI & Environment State
  const [envEnabled, setEnvEnabled] = useState(true);
  const [hdrSourceType, setHdrSourceType] = useState<'Studio' | 'Custom'>('Studio');
  const [hdrName, setHdrName] = useState('studio.hdr');
  const [hdrFormat, setHdrFormat] = useState<'EXR' | 'HDR' | 'Studio HDR'>('Studio HDR');
  const [hdrStatus, setHdrStatus] = useState<'Loaded' | 'Loading' | 'Failed'>('Loaded');
  const [hdrError, setHdrError] = useState<string | null>(null);
  const [envIntensity, setEnvIntensity] = useState(1.0);
  const [envRotation, setEnvRotation] = useState(0);

  // Color Management & Tone Mapping
  const [toneMappingType, setToneMappingType] = useState<'AgX' | 'ACESFilmic' | 'Neutral' | 'Linear' | 'None'>('AgX');
  const [exposure, setExposure] = useState(1.0);
  const [sceneLightsCount, setSceneLightsCount] = useState(0);

  // Camera & Framing
  const [activeCameraPreset, setActiveCameraPreset] = useState<CameraPresetKey>('fullBody');
  const [activeAngle, setActiveAngle] = useState<PresentationAngleKey>('front');

  // Avatar Parts & Visibility
  const [avatarParts, setAvatarParts] = useState<AvatarPartItem[]>([]);
  const [soloPartId, setSoloPartId] = useState<string | null>(null);
  const savedVisibilitiesBeforeSoloRef = useRef<Map<string, boolean>>(new Map());

  // Material Runtime Overrides
  const [materialOverrides, setMaterialOverrides] = useState<Record<string, MaterialRuntimeOverride>>({});
  const [selectedMaterialName, setSelectedMaterialName] = useState<string>('');

  // Scene Tree & Inspection
  const [sceneTree, setSceneTree] = useState<StudioSceneNode | null>(null);
  const [selectedNodeUuid, setSelectedNodeUuid] = useState<string | null>(null);

  // Rig / Skeleton / Pose
  const [hasSkeleton, setHasSkeleton] = useState(false);
  const [activePoseId, setActivePoseId] = useState<string>('neutral');

  // Animation System
  const [animations, setAnimations] = useState<THREE.AnimationClip[]>([]);
  const [activeAnimIndex, setActiveAnimIndex] = useState<number>(0);
  const [isPlayingAnim, setIsPlayingAnim] = useState<boolean>(false);
  const [animSpeed, setAnimSpeed] = useState<number>(1.0);
  const [animProgress, setAnimProgress] = useState<number>(0);
  const [animLoop, setAnimLoop] = useState<boolean>(true);

  // Studio Saved Presets (in localStorage)
  const [savedPresets, setSavedPresets] = useState<StudioSavedPreset[]>(() => {
    try {
      const stored = localStorage.getItem('avatar_studio_presets');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [newPresetName, setNewPresetName] = useState('');

  // Diagnostic Experiments (Hair BLEND vs MASK & Normal Maps A/B)
  const [localHairMode, setLocalHairMode] = useState<'BLEND' | 'MASK'>('BLEND');
  const [localNormalMapsEnabled, setLocalNormalMapsEnabled] = useState(true);

  const activeHairMode = externalHairMode !== undefined ? externalHairMode : localHairMode;
  const activeNormalMapsEnabled =
    externalNormalMapsEnabled !== undefined ? externalNormalMapsEnabled : localNormalMapsEnabled;

  // Visual capture flash
  const [captureFlash, setCaptureFlash] = useState(false);

  // Three.js Core References
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const currentModelRef = useRef<THREE.Group | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);

  // Custom Studio Lights
  const keyLightRef = useRef<THREE.DirectionalLight | null>(null);
  const fillLightRef = useRef<THREE.DirectionalLight | null>(null);
  const rimLightRef = useRef<THREE.DirectionalLight | null>(null);
  const hemiLightRef = useRef<THREE.HemisphereLight | null>(null);

  // HDR Textures Ref
  const defaultStudioEnvRef = useRef<THREE.Texture | null>(null);
  const customHdrEnvRef = useRef<THREE.Texture | null>(null);
  const activeHdrTextureRef = useRef<THREE.Texture | null>(null);
  const gradientTextureRef = useRef<THREE.CanvasTexture | null>(null);

  // Animation Mixer
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const activeActionRef = useRef<THREE.AnimationAction | null>(null);
  const clockRef = useRef<THREE.Clock>(new THREE.Clock());
  const animSpeedRef = useRef(animSpeed);
  const isPlayingAnimRef = useRef(isPlayingAnim);

  useEffect(() => {
    animSpeedRef.current = animSpeed;
  }, [animSpeed]);

  useEffect(() => {
    isPlayingAnimRef.current = isPlayingAnim;
  }, [isPlayingAnim]);

  // Helper to create synthetic Studio HDR PMREM environment
  const createStudioHdr = (renderer: THREE.WebGLRenderer): THREE.Texture => {
    const pmremGen = new THREE.PMREMGenerator(renderer);
    pmremGen.compileEquirectangularShader();

    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0x1e2736);

    const key = new THREE.DirectionalLight(0xfffaed, 3.2);
    key.position.set(5, 7, 5);
    envScene.add(key);

    const fill = new THREE.DirectionalLight(0xcfd8dc, 1.8);
    fill.position.set(-5, 3, -4);
    envScene.add(fill);

    const rim = new THREE.DirectionalLight(0x93c5fd, 2.5);
    rim.position.set(0, 6, -6);
    envScene.add(rim);

    const ground = new THREE.DirectionalLight(0x334155, 1.0);
    ground.position.set(0, -6, 0);
    envScene.add(ground);

    const renderTarget = pmremGen.fromScene(envScene, 0.04);
    const texture = renderTarget.texture;
    texture.mapping = THREE.EquirectangularReflectionMapping;
    pmremGen.dispose();
    return texture;
  };

  const getToneMappingConstant = (type: string): THREE.ToneMapping => {
    switch (type) {
      case 'AgX':
        return THREE.AgXToneMapping;
      case 'ACESFilmic':
        return THREE.ACESFilmicToneMapping;
      case 'Neutral':
        return THREE.NeutralToneMapping;
      case 'Linear':
        return THREE.LinearToneMapping;
      case 'None':
      default:
        return THREE.NoToneMapping;
    }
  };

  const saveCurrentPreset = () => {
    const name = newPresetName.trim() || `Preset ${savedPresets.length + 1}`;
    const partVis: Record<string, boolean> = {};
    avatarParts.forEach((p) => {
      partVis[p.id] = p.visible;
    });

    const newPreset: StudioSavedPreset = {
      id: `preset_${Date.now()}`,
      name,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      background: { ...backgroundSettings },
      lighting: { ...lightingSettings },
      toneMapping: toneMappingType,
      exposure,
      partVisibilities: partVis,
      materialOverrides: { ...materialOverrides },
    };

    const updated = [newPreset, ...savedPresets];
    setSavedPresets(updated);
    setNewPresetName('');
    try {
      localStorage.setItem('avatar_studio_presets', JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  const loadSavedPreset = (preset: StudioSavedPreset) => {
    setBackgroundSettings({ ...preset.background });
    setLightingSettings({ ...preset.lighting });
    setToneMappingType(preset.toneMapping as any);
    setExposure(preset.exposure);
    setMaterialOverrides({ ...preset.materialOverrides });

    // Restore part visibilities
    if (currentModelRef.current && preset.partVisibilities) {
      currentModelRef.current.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          if (preset.partVisibilities[mesh.uuid] !== undefined) {
            mesh.visible = preset.partVisibilities[mesh.uuid];
          }
        }
      });
      setAvatarParts((prev) =>
        prev.map((p) => ({
          ...p,
          visible: preset.partVisibilities[p.id] !== undefined ? preset.partVisibilities[p.id] : p.visible,
        }))
      );
    }
  };

  const deleteSavedPreset = (id: string) => {
    const updated = savedPresets.filter((p) => p.id !== id);
    setSavedPresets(updated);
    try {
      localStorage.setItem('avatar_studio_presets', JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  // Master Reset Studio: Restores all runtime overrides cleanly
  const resetStudio = () => {
    setBackgroundSettings(DEFAULT_BACKGROUND);
    setLightingSettings(LIGHTING_PRESETS['Neutral Studio']);
    setEnvEnabled(true);
    setEnvIntensity(1.0);
    setEnvRotation(0);
    setToneMappingType('AgX');
    setExposure(1.0);
    setMaterialOverrides({});
    setSoloPartId(null);
    setLocalHairMode('BLEND');
    setLocalNormalMapsEnabled(true);

    if (currentModelRef.current) {
      // Reset mesh visibility and material changes
      currentModelRef.current.traverse((child) => {
        child.visible = true;
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          if (mesh.userData._originalMaterial) {
            mesh.material = mesh.userData._originalMaterial;
            delete mesh.userData._materialCloned;
          }
        }
      });
      setAvatarParts((prev) => prev.map((p) => ({ ...p, visible: true })));
      applyCameraPreset('fullBody', 'front');
    }
  };

  // Runtime State Notification for Parent Diagnostics
  const latestSettingsRef = useRef({
    toneMapping: toneMappingType,
    exposure,
    colorSpace: 'sRGB',
    envEnabled,
    hdrName,
    hdrIntensity: envIntensity,
    hdrRotation: envRotation,
    sceneLights: sceneLightsCount,
    hairMode: activeHairMode,
    normalMapsEnabled: activeNormalMapsEnabled,
  });

  const onRuntimeStateChangeRef = useRef(onRuntimeStateChange);
  useEffect(() => {
    onRuntimeStateChangeRef.current = onRuntimeStateChange;
  }, [onRuntimeStateChange]);

  useEffect(() => {
    const state: ThreeJsRuntimeState = {
      outputColorSpace: 'sRGB',
      toneMapping: toneMappingType,
      exposure,
      envEnabled,
      hdrName,
      hdrIntensity: envIntensity,
      hdrRotation: envRotation,
      sceneLightsCount,
      hairMode: activeHairMode,
      normalMapsEnabled: activeNormalMapsEnabled,
    };
    latestSettingsRef.current = {
      toneMapping: toneMappingType,
      exposure,
      colorSpace: 'sRGB',
      envEnabled,
      hdrName,
      hdrIntensity: envIntensity,
      hdrRotation: envRotation,
      sceneLights: sceneLightsCount,
      hairMode: activeHairMode,
      normalMapsEnabled: activeNormalMapsEnabled,
    };
    onRuntimeStateChangeRef.current?.(state);
  }, [
    toneMappingType,
    exposure,
    envEnabled,
    hdrName,
    envIntensity,
    envRotation,
    sceneLightsCount,
    activeHairMode,
    activeNormalMapsEnabled,
  ]);

  const onCaptureReadyRef = useRef(onCaptureReady);
  const onRuntimeInspectionRef = useRef(onRuntimeInspection);

  useEffect(() => {
    onCaptureReadyRef.current = onCaptureReady;
  }, [onCaptureReady]);

  useEffect(() => {
    onRuntimeInspectionRef.current = onRuntimeInspection;
  }, [onRuntimeInspection]);

  // Canvas capture implementation
  const captureCanvas = useCallback((): ThreeJsCapturedImage | null => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!renderer || !scene || !camera) return null;

    renderer.render(scene, camera);
    const dataUrl = renderer.domElement.toDataURL('image/png');
    const w = renderer.domElement.width;
    const h = renderer.domElement.height;

    setCaptureFlash(true);
    setTimeout(() => setCaptureFlash(false), 350);

    return {
      dataUrl,
      width: w,
      height: h,
      aspectRatio: w / (h || 1),
      capturedAt: new Date().toLocaleTimeString(),
      renderSettings: { ...latestSettingsRef.current },
    };
  }, []);

  useEffect(() => {
    onCaptureReadyRef.current?.(captureCanvas);
  }, [captureCanvas]);

  // Inspect runtime Three.js materials and textures
  const inspectRuntimeModel = useCallback((model: THREE.Group) => {
    const inspections: RuntimeMaterialInspection[] = [];
    const visited = new Set<THREE.Material>();
    let matCounter = 0;

    model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((m) => {
          if (m && !visited.has(m)) {
            visited.add(m);
            const std = m as THREE.MeshStandardMaterial;
            const textures: RuntimeTextureInfo[] = [];
            const formatWrapping = (wrap: THREE.Wrapping): string => {
              if (wrap === THREE.RepeatWrapping) return 'REPEAT';
              if (wrap === THREE.MirroredRepeatWrapping) return 'MIRRORED_REPEAT';
              return 'CLAMP_TO_EDGE';
            };

            if (std.map) {
              textures.push({
                slot: 'Base Color (map)',
                textureName: std.map.name || 'map',
                colorSpace: std.map.colorSpace || 'sRGB',
                wrapS: formatWrapping(std.map.wrapS),
                wrapT: formatWrapping(std.map.wrapT),
                minFilter: String(std.map.minFilter),
                magFilter: String(std.map.magFilter),
                flipY: std.map.flipY,
              });
            }
            if (std.normalMap) {
              textures.push({
                slot: 'Normal Map',
                textureName: std.normalMap.name || 'normalMap',
                colorSpace: std.normalMap.colorSpace || 'NoColorSpace (Linear)',
                wrapS: formatWrapping(std.normalMap.wrapS),
                wrapT: formatWrapping(std.normalMap.wrapT),
                minFilter: String(std.normalMap.minFilter),
                magFilter: String(std.normalMap.magFilter),
                flipY: std.normalMap.flipY,
              });
            }
            if (std.roughnessMap) {
              textures.push({
                slot: 'Roughness / Metalness (ORM)',
                textureName: std.roughnessMap.name || 'roughnessMap',
                colorSpace: std.roughnessMap.colorSpace || 'NoColorSpace (Linear)',
                wrapS: formatWrapping(std.roughnessMap.wrapS),
                wrapT: formatWrapping(std.roughnessMap.wrapT),
                minFilter: String(std.roughnessMap.minFilter),
                magFilter: String(std.roughnessMap.magFilter),
                flipY: std.roughnessMap.flipY,
              });
            }

            inspections.push({
              materialIndex: matCounter++,
              name: m.name || `Material_${matCounter}`,
              type: m.type,
              transparent: Boolean(m.transparent),
              depthWrite: Boolean(m.depthWrite),
              depthTest: Boolean(m.depthTest),
              alphaTest: m.alphaTest,
              side: m.side === THREE.DoubleSide ? 'DoubleSide' : m.side === THREE.BackSide ? 'BackSide' : 'FrontSide',
              roughness: std.roughness ?? 1,
              metalness: std.metalness ?? 0,
              normalScale: std.normalScale?.x ?? 1,
              textures,
            });
          }
        });
      }
    });

    onRuntimeInspectionRef.current?.(inspections);
  }, []);

  // 1. Initialize Three.js Scene
  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const width = mount.clientWidth || 800;
    const height = mount.clientHeight || 600;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0e1117);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.05, 1000);
    camera.position.set(0, 1.2, 2.5);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.AgXToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    rendererRef.current = renderer;

    mount.replaceChildren(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 0.2;
    controls.maxDistance = 50.0;
    controls.maxPolarAngle = Math.PI / 2 + 0.1;
    controlsRef.current = controls;

    // Ground Grid
    const grid = new THREE.GridHelper(10, 20, 0x3b82f6, 0x1f2937);
    grid.position.y = -0.005;
    scene.add(grid);
    gridHelperRef.current = grid;

    // Studio Custom Lights Group
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(4, 6, 5);
    keyLightRef.current = keyLight;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xcbd5e1, 1.2);
    fillLight.position.set(-4, 3, -3);
    fillLightRef.current = fillLight;
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0x93c5fd, 1.8);
    rimLight.position.set(0, 5, -6);
    rimLightRef.current = rimLight;
    scene.add(rimLight);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x334155, 0.6);
    hemiLightRef.current = hemiLight;
    scene.add(hemiLight);

    // Build Default Studio HDR PMREM Environment
    const defaultHdr = createStudioHdr(renderer);
    defaultStudioEnvRef.current = defaultHdr;
    activeHdrTextureRef.current = defaultHdr;
    scene.environment = defaultHdr;
    scene.environmentIntensity = 1.0;

    let lights = 0;
    scene.traverse((obj) => {
      if ((obj as THREE.Light).isLight) lights++;
    });
    setSceneLightsCount(lights);

    // Animation Loop with Clock for Mixer
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      const delta = clockRef.current.getDelta();
      if (mixerRef.current) {
        mixerRef.current.update(delta * animSpeedRef.current);
        if (activeActionRef.current && isPlayingAnimRef.current) {
          const clip = activeActionRef.current.getClip();
          if (clip && clip.duration > 0) {
            setAnimProgress((activeActionRef.current.time % clip.duration) / clip.duration);
          }
        }
      }
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: w, height: h } = entry.contentRect;
        if (w > 0 && h > 0) {
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        }
      }
    });
    resizeObserver.observe(mount);

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      if (customHdrEnvRef.current) customHdrEnvRef.current.dispose();
      if (defaultStudioEnvRef.current) defaultStudioEnvRef.current.dispose();
      if (gradientTextureRef.current) gradientTextureRef.current.dispose();
      renderer.dispose();
      controls.dispose();
      mount.replaceChildren();
    };
  }, []);

  // 2. React to Studio Lighting Updates
  useEffect(() => {
    if (keyLightRef.current) {
      keyLightRef.current.visible = lightingSettings.keyLight.enabled;
      keyLightRef.current.intensity = lightingSettings.keyLight.intensity;
      keyLightRef.current.color.set(lightingSettings.keyLight.color);
      keyLightRef.current.position.set(...lightingSettings.keyLight.position);
    }
    if (fillLightRef.current) {
      fillLightRef.current.visible = lightingSettings.fillLight.enabled;
      fillLightRef.current.intensity = lightingSettings.fillLight.intensity;
      fillLightRef.current.color.set(lightingSettings.fillLight.color);
      fillLightRef.current.position.set(...lightingSettings.fillLight.position);
    }
    if (rimLightRef.current) {
      rimLightRef.current.visible = lightingSettings.rimLight.enabled;
      rimLightRef.current.intensity = lightingSettings.rimLight.intensity;
      rimLightRef.current.color.set(lightingSettings.rimLight.color);
      rimLightRef.current.position.set(...lightingSettings.rimLight.position);
    }
    if (hemiLightRef.current) {
      hemiLightRef.current.visible = lightingSettings.ambientLight.enabled;
      hemiLightRef.current.intensity = lightingSettings.ambientLight.intensity;
      hemiLightRef.current.color.set(lightingSettings.ambientLight.color);
    }
  }, [lightingSettings]);

  // 3. React to Background & Environment Settings Changes (INDEPENDENT!)
  useEffect(() => {
    const scene = sceneRef.current;
    const renderer = rendererRef.current;
    if (!scene || !renderer) return;

    const activeTexture =
      hdrSourceType === 'Custom' && customHdrEnvRef.current
        ? customHdrEnvRef.current
        : defaultStudioEnvRef.current;

    activeHdrTextureRef.current = activeTexture;

    // Environment Lighting
    if (envEnabled && activeTexture) {
      scene.environment = activeTexture;
      scene.environmentIntensity = envIntensity;
      scene.environmentRotation.y = THREE.MathUtils.degToRad(envRotation);
    } else {
      scene.environment = null;
      scene.environmentIntensity = 0;
    }

    // Background Canvas/Dome (Completely decoupled from lighting!)
    if (backgroundSettings.style === 'solid') {
      scene.background = new THREE.Color(backgroundSettings.solidColor);
    } else if (backgroundSettings.style === 'gradient') {
      if (gradientTextureRef.current) {
        gradientTextureRef.current.dispose();
      }
      const gradTex = createGradientCanvasTexture(
        backgroundSettings.gradientTop,
        backgroundSettings.gradientBottom,
        backgroundSettings.gradientAngle
      );
      gradientTextureRef.current = gradTex;
      scene.background = gradTex;
    } else if (backgroundSettings.style === 'environment') {
      if (activeTexture && envEnabled) {
        scene.background = activeTexture;
        scene.backgroundRotation.y = THREE.MathUtils.degToRad(envRotation);
      } else {
        scene.background = new THREE.Color(0x0e1117);
      }
    } else if (backgroundSettings.style === 'transparent') {
      scene.background = null;
    }

    // Color Management & Tone Mapping
    renderer.toneMapping = getToneMappingConstant(toneMappingType);
    renderer.toneMappingExposure = exposure;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  }, [
    envEnabled,
    hdrSourceType,
    envIntensity,
    envRotation,
    backgroundSettings,
    toneMappingType,
    exposure,
  ]);

  // 4. Grid Toggle
  useEffect(() => {
    if (gridHelperRef.current) {
      gridHelperRef.current.visible = showGrid;
    }
  }, [showGrid]);

  // 5. HDRI/EXR File Loader
  const handleHdrFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile || !rendererRef.current || !sceneRef.current) return;

    const lowerName = selectedFile.name.toLowerCase();
    const isExr = lowerName.endsWith('.exr');
    const isHdr = lowerName.endsWith('.hdr');

    if (!isExr && !isHdr) {
      setHdrStatus('Failed');
      setHdrError('Unsupported format. Please select an .exr or .hdr file.');
      return;
    }

    setHdrStatus('Loading');
    setHdrError(null);

    const blobUrl = URL.createObjectURL(selectedFile);

    if (isExr) {
      const loader = new EXRLoader();
      loader.load(
        blobUrl,
        (texture) => {
          URL.revokeObjectURL(blobUrl);
          if (!rendererRef.current || !sceneRef.current) return;

          try {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            const pmremGen = new THREE.PMREMGenerator(rendererRef.current);
            const hdrTarget = pmremGen.fromEquirectangular(texture);

            if (customHdrEnvRef.current) {
              customHdrEnvRef.current.dispose();
            }

            customHdrEnvRef.current = hdrTarget.texture;
            activeHdrTextureRef.current = hdrTarget.texture;

            if (envEnabled) {
              sceneRef.current.environment = hdrTarget.texture;
              sceneRef.current.environmentIntensity = envIntensity;
            }

            texture.dispose();
            pmremGen.dispose();

            setHdrName(selectedFile.name);
            setHdrFormat('EXR');
            setHdrSourceType('Custom');
            setHdrStatus('Loaded');
            setHdrError(null);
            setEnvEnabled(true);
          } catch (err: any) {
            console.error('PMREM generation error for EXR:', err);
            setHdrStatus('Failed');
            setHdrError(err.message || 'PMREM generation failed for EXR texture');
          }
        },
        undefined,
        (err: unknown) => {
          URL.revokeObjectURL(blobUrl);
          console.error('EXRLoader error:', err);
          const msg = err instanceof Error ? err.message : String(err);
          setHdrStatus('Failed');
          setHdrError(msg || 'Failed to decode EXR file');
        }
      );
    } else {
      const loader = new RGBELoader();
      loader.load(
        blobUrl,
        (texture) => {
          URL.revokeObjectURL(blobUrl);
          if (!rendererRef.current || !sceneRef.current) return;

          try {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            const pmremGen = new THREE.PMREMGenerator(rendererRef.current);
            const hdrTarget = pmremGen.fromEquirectangular(texture);

            if (customHdrEnvRef.current) {
              customHdrEnvRef.current.dispose();
            }

            customHdrEnvRef.current = hdrTarget.texture;
            activeHdrTextureRef.current = hdrTarget.texture;

            if (envEnabled) {
              sceneRef.current.environment = hdrTarget.texture;
              sceneRef.current.environmentIntensity = envIntensity;
            }

            texture.dispose();
            pmremGen.dispose();

            setHdrName(selectedFile.name);
            setHdrFormat('HDR');
            setHdrSourceType('Custom');
            setHdrStatus('Loaded');
            setHdrError(null);
            setEnvEnabled(true);
          } catch (err: any) {
            console.error('PMREM generation error for HDR:', err);
            setHdrStatus('Failed');
            setHdrError(err.message || 'PMREM generation failed for HDR texture');
          }
        },
        undefined,
        (err: unknown) => {
          URL.revokeObjectURL(blobUrl);
          console.error('RGBELoader error:', err);
          const msg = err instanceof Error ? err.message : String(err);
          setHdrStatus('Failed');
          setHdrError(msg || 'Failed to decode HDR file');
        }
      );
    }
  };

  const handleClearCustomHdr = () => {
    if (customHdrEnvRef.current) {
      customHdrEnvRef.current.dispose();
      customHdrEnvRef.current = null;
    }
    setHdrSourceType('Studio');
    setHdrName('studio.hdr');
    setHdrFormat('Studio HDR');
    setHdrStatus('Loaded');
    setHdrError(null);
    setEnvEnabled(true);
    if (sceneRef.current && defaultStudioEnvRef.current) {
      sceneRef.current.environment = defaultStudioEnvRef.current;
    }
  };

  // 6. Camera Dynamic Framing Preset Application
  const applyCameraPreset = (preset: CameraPresetKey, angle: PresentationAngleKey = activeAngle) => {
    setActiveCameraPreset(preset);
    setActiveAngle(angle);

    if (!currentModelRef.current || !cameraRef.current || !controlsRef.current) return;
    const framing = calculateCameraFraming(currentModelRef.current, preset, angle);

    cameraRef.current.position.set(...framing.cameraPos);
    controlsRef.current.target.set(...framing.targetPos);
    cameraRef.current.lookAt(...framing.targetPos);
    controlsRef.current.update();
  };

  const resetCamera = () => {
    applyCameraPreset('fullBody', 'front');
  };

  // 7. Load GLTF / GLB Model
  useEffect(() => {
    if (!sceneRef.current || !file) return;
    const scene = sceneRef.current;

    if (currentModelRef.current) {
      scene.remove(currentModelRef.current);
      currentModelRef.current = null;
    }
    if (mixerRef.current) {
      mixerRef.current.stopAllAction();
      mixerRef.current = null;
    }

    setLoading(true);
    setLoadError(null);
    setStats(null);
    setAvatarParts([]);
    setAnimations([]);
    setHasSkeleton(false);

    let isCancelled = false;
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');

    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);

    file
      .arrayBuffer()
      .then((buffer) => {
        if (isCancelled) {
          dracoLoader.dispose();
          return;
        }

        loader.parse(
          buffer,
          '',
          (gltf) => {
            if (isCancelled || !sceneRef.current) {
              dracoLoader.dispose();
              return;
            }

            const model = gltf.scene || gltf.scenes[0];
            if (!model) {
              setLoadError('Loaded glTF does not contain any scenes or root nodes.');
              setLoading(false);
              dracoLoader.dispose();
              return;
            }

            let triangles = 0;
            let meshes = 0;
            let assetLights = 0;
            let foundSkeleton = false;

            model.traverse((child) => {
              if ((child as THREE.Mesh).isMesh) {
                meshes++;
                const mesh = child as THREE.Mesh;
                // Store pristine original material reference for non-destructive reset
                mesh.userData._originalMaterial = mesh.material;

                if (mesh.geometry) {
                  if (mesh.geometry.index) {
                    triangles += Math.floor(mesh.geometry.index.count / 3);
                  } else if (mesh.geometry.attributes.position) {
                    triangles += Math.floor(mesh.geometry.attributes.position.count / 3);
                  }
                }
              }
              if ((child as THREE.SkinnedMesh).isSkinnedMesh || (child as THREE.Bone).isBone) {
                foundSkeleton = true;
              }
              if ((child as THREE.Light).isLight) {
                assetLights++;
              }
            });

            setStats({ triangles, meshes });
            setSceneLightsCount(assetLights);
            setHasSkeleton(foundSkeleton);

            // Align model so its feet rest on the ground plane (y = 0) and centered in X/Z
            const box = new THREE.Box3().setFromObject(model);
            const center = box.getCenter(new THREE.Vector3());
            if (isFinite(center.x) && isFinite(box.min.y) && isFinite(center.z)) {
              model.position.x -= center.x;
              model.position.y -= box.min.y;
              model.position.z -= center.z;
            }

            scene.add(model);
            currentModelRef.current = model;

            // Frame camera
            const framing = calculateCameraFraming(model, 'fullBody', 'front');
            if (cameraRef.current && controlsRef.current) {
              cameraRef.current.position.set(...framing.cameraPos);
              controlsRef.current.target.set(...framing.targetPos);
              cameraRef.current.lookAt(...framing.targetPos);
              controlsRef.current.update();
            }

            // Inspect semantic avatar parts & build scene tree
            const inspectedParts = inspectAvatarParts(model);
            setAvatarParts(inspectedParts);
            setSceneTree(buildSceneNodeTree(model));

            // Set up animation mixer if clips exist
            if (gltf.animations && gltf.animations.length > 0) {
              setAnimations(gltf.animations);
              const mixer = new THREE.AnimationMixer(model);
              mixerRef.current = mixer;
              const action = mixer.clipAction(gltf.animations[0]);
              action.play();
              activeActionRef.current = action;
              setIsPlayingAnim(true);
            }

            setLoading(false);
            inspectRuntimeModel(model);
          },
          (error: unknown) => {
            if (isCancelled) return;
            dracoLoader.dispose();
            const errMessage = error instanceof Error ? error.message : String(error);
            console.error('Three.js GLTFLoader error:', error);
            setLoadError(`Three.js Loader Error: ${errMessage || 'Failed to parse model directly in WebGL'}`);
            setLoading(false);
          }
        );
      })
      .catch((err: any) => {
        if (isCancelled) return;
        dracoLoader.dispose();
        console.error('Error reading model buffer:', err);
        setLoadError(`File reading error: ${err.message || String(err)}`);
        setLoading(false);
      });

    return () => {
      isCancelled = true;
      dracoLoader.dispose();
      if (currentModelRef.current && sceneRef.current) {
        sceneRef.current.remove(currentModelRef.current);
        currentModelRef.current = null;
      }
    };
  }, [file, inspectRuntimeModel]);

  // 8. Parts Visibility & Solo Mode Handling
  const togglePartVisibility = (partId: string) => {
    setAvatarParts((prev) =>
      prev.map((p) => {
        if (p.id === partId) {
          const nextVis = !p.visible;
          if (currentModelRef.current) {
            currentModelRef.current.traverse((child) => {
              if (p.meshUuids.includes(child.uuid)) {
                child.visible = nextVis;
              }
            });
          }
          return { ...p, visible: nextVis };
        }
        return p;
      })
    );
  };

  const soloPart = (partId: string) => {
    if (!currentModelRef.current) return;
    // Save current states before entering solo
    const saved = new Map<string, boolean>();
    avatarParts.forEach((p) => saved.set(p.id, p.visible));
    savedVisibilitiesBeforeSoloRef.current = saved;

    const targetPart = avatarParts.find((p) => p.id === partId);
    if (!targetPart) return;

    currentModelRef.current.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.visible = targetPart.meshUuids.includes(child.uuid);
      }
    });

    setAvatarParts((prev) =>
      prev.map((p) => ({
        ...p,
        visible: p.id === partId,
      }))
    );
    setSoloPartId(partId);
  };

  const exitSolo = () => {
    if (!currentModelRef.current) return;
    const saved = savedVisibilitiesBeforeSoloRef.current;
    currentModelRef.current.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const wasVis = saved.get(child.uuid) ?? true;
        child.visible = wasVis;
      }
    });
    setAvatarParts((prev) =>
      prev.map((p) => ({
        ...p,
        visible: saved.get(p.id) ?? true,
      }))
    );
    setSoloPartId(null);
  };

  // 9. Runtime Material Overrides (Safe & Non-Destructive)
  const applyMaterialOverride = (matName: string, updates: Partial<MaterialRuntimeOverride>) => {
    if (!currentModelRef.current) return;

    const existing = materialOverrides[matName] || { materialName: matName };
    const nextOverride = { ...existing, ...updates };
    setMaterialOverrides((prev) => ({ ...prev, [matName]: nextOverride }));

    currentModelRef.current.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((m, idx) => {
          if (m && m.name === matName) {
            // Safely clone if not already cloned for this mesh
            if (!mesh.userData._materialCloned) {
              mesh.material = Array.isArray(mesh.material)
                ? mesh.material.map((mat) => mat.clone())
                : mesh.material.clone();
              mesh.userData._materialCloned = true;
            }

            const activeMat = (Array.isArray(mesh.material) ? mesh.material[idx] : mesh.material) as THREE.MeshStandardMaterial;

            if (nextOverride.tintColor !== undefined) {
              activeMat.color.set(nextOverride.tintColor);
            }
            if (nextOverride.roughness !== undefined && 'roughness' in activeMat) {
              activeMat.roughness = nextOverride.roughness;
            }
            if (nextOverride.metalness !== undefined && 'metalness' in activeMat) {
              activeMat.metalness = nextOverride.metalness;
            }
            if (nextOverride.opacity !== undefined) {
              activeMat.opacity = nextOverride.opacity;
              activeMat.transparent = nextOverride.opacity < 0.999;
            }
            if (nextOverride.emissiveColor !== undefined && 'emissive' in activeMat) {
              activeMat.emissive.set(nextOverride.emissiveColor);
            }
            if (nextOverride.emissiveIntensity !== undefined && 'emissiveIntensity' in activeMat) {
              activeMat.emissiveIntensity = nextOverride.emissiveIntensity;
            }
            if (nextOverride.alphaTest !== undefined) {
              activeMat.alphaTest = nextOverride.alphaTest;
            }
            activeMat.needsUpdate = true;
          }
        });
      }
    });
  };

  // 10. Humanoid Pose Application
  const applyPosePreset = (presetId: string) => {
    setActivePoseId(presetId);
    if (!currentModelRef.current) return;

    const preset = HUMANOID_POSE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;

    currentModelRef.current.traverse((child) => {
      if ((child as THREE.Bone).isBone) {
        const bone = child as THREE.Bone;
        const bName = bone.name.toLowerCase();

        for (const [key, [rx, ry, rz]] of Object.entries(preset.boneRotations)) {
          if (bName.includes(key)) {
            bone.rotation.set(rx, ry, rz);
          }
        }
      }
    });
  };

  // 11. Animation Controls
  const handleSelectAnim = (index: number) => {
    setActiveAnimIndex(index);
    if (!mixerRef.current || !animations[index]) return;
    mixerRef.current.stopAllAction();
    const action = mixerRef.current.clipAction(animations[index]);
    action.setLoop(animLoop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.play();
    activeActionRef.current = action;
    setIsPlayingAnim(true);
  };

  const togglePlayAnim = () => {
    if (!activeActionRef.current) return;
    if (isPlayingAnim) {
      activeActionRef.current.paused = true;
      setIsPlayingAnim(false);
    } else {
      activeActionRef.current.paused = false;
      setIsPlayingAnim(true);
    }
  };

  const stopAnim = () => {
    if (!activeActionRef.current) return;
    activeActionRef.current.stop();
    setIsPlayingAnim(false);
    setAnimProgress(0);
  };

  // 12. Fullscreen & Keyboard Shortcuts
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (viewerMode === 'fullscreen' || document.fullscreenElement) {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      setViewerMode('embedded');
    } else {
      containerRef.current.requestFullscreen?.().catch(() => {});
      setViewerMode('fullscreen');
    }
  }, [viewerMode]);

  useEffect(() => {
    const handleFsChange = () => {
      if (!document.fullscreenElement && viewerMode === 'fullscreen') {
        setViewerMode('embedded');
      }
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, [viewerMode]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture when typing in an input
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === 'Escape') {
        if (viewerMode === 'fullscreen') setViewerMode('embedded');
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        resetCamera();
      } else if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        setPresentationMode((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewerMode, toggleFullscreen]);

  // Hair Transparency Test (Non-destructive MASK experiment)
  useEffect(() => {
    if (!currentModelRef.current) return;
    currentModelRef.current.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((m) => {
          const isHair =
            m.name.toLowerCase().includes('hair') ||
            m.name.toLowerCase().includes('blinn') ||
            m.name.toLowerCase().includes('strand');
          if (isHair) {
            if (activeHairMode === 'MASK') {
              m.transparent = false;
              m.depthWrite = true;
              m.alphaTest = 0.5;
              m.needsUpdate = true;
            } else {
              m.transparent = true;
              m.depthWrite = false;
              m.alphaTest = 0;
              m.needsUpdate = true;
            }
          }
        });
      }
    });
  }, [activeHairMode]);

  // Normal Maps Experimental Toggle
  useEffect(() => {
    if (!currentModelRef.current) return;
    currentModelRef.current.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((m) => {
          const std = m as THREE.MeshStandardMaterial;
          if (std.normalMap) {
            if (!activeNormalMapsEnabled) {
              std.normalScale.set(0, 0);
            } else {
              std.normalScale.set(1, 1);
            }
          }
        });
      }
    });
  }, [activeNormalMapsEnabled]);

  // Wireframe toggle
  useEffect(() => {
    if (!currentModelRef.current) return;
    currentModelRef.current.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => {
            if ('wireframe' in m) (m as any).wireframe = wireframe;
          });
        } else if (mesh.material && 'wireframe' in mesh.material) {
          (mesh.material as any).wireframe = wireframe;
        }
      }
    });
  }, [wireframe]);

  // Gather distinct materials for the Material editor
  const availableMaterialNames = Array.from(
    new Set(avatarParts.flatMap((p) => p.materialNames))
  );

  return (
    <div
      ref={containerRef}
      className={`avatar-studio-container mode-${viewerMode}`}
      id="avatar-3d-studio-workspace"
    >
      {/* 1. TOP STUDIO TOOLBAR */}
      <div className="studio-top-toolbar">
        <div className="studio-brand-group">
          <span className="studio-logo-badge">3D Studio</span>
          <span className="studio-model-name" title={file.name}>
            {file.name}
          </span>
          {stats && (
            <span className="studio-stats-pill">
              {stats.meshes} Meshes • {stats.triangles.toLocaleString()} Tris
            </span>
          )}
        </div>

        {/* View Mode Switcher */}
        <div className="studio-toolbar-center">
          <div className="mode-toggle-group">
            <button
              type="button"
              className={`mode-btn ${viewerMode === 'embedded' ? 'active' : ''}`}
              onClick={() => setViewerMode('embedded')}
              title="Embedded View"
            >
              Embedded
            </button>
            <button
              type="button"
              className={`mode-btn ${viewerMode === 'studio' ? 'active' : ''}`}
              onClick={() => setViewerMode('studio')}
              title="Full Studio Workspace"
            >
              Studio Mode
            </button>
            <button
              type="button"
              className={`mode-btn ${viewerMode === 'fullscreen' ? 'active' : ''}`}
              onClick={toggleFullscreen}
              title="Fullscreen (F)"
            >
              <Maximize2 size={13} /> Fullscreen
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="studio-toolbar-right">
          <button
            type="button"
            className={`studio-action-btn ${presentationMode ? 'primary' : ''}`}
            onClick={() => setPresentationMode(!presentationMode)}
            title="Clean Presentation Mode (H)"
          >
            <Eye size={13} /> {presentationMode ? 'Show UI' : 'Presentation'}
          </button>
          <button
            type="button"
            className="studio-action-btn primary"
            onClick={() => captureCanvas()}
            title="Capture rendered canvas snapshot"
          >
            <Camera size={13} /> Capture
          </button>
          <button
            type="button"
            className="studio-action-btn danger"
            onClick={resetStudio}
            title="Reset Studio Overrides to pristine GLB state"
          >
            <RotateCcw size={13} /> Reset Studio
          </button>
        </div>
      </div>

      {/* 2. MAIN 3D WORKSPACE BODY */}
      <div className="studio-main-body">
        {/* Canvas Mount */}
        <div className="studio-canvas-mount" ref={canvasMountRef} />

        {/* Capture flash overlay */}
        {captureFlash && <div className="capture-flash-overlay" />}

        {/* Floating Sidebar Toggle Pill (Left) */}
        {!presentationMode && !leftPanelOpen && (
          <button
            type="button"
            className="panel-toggle-pill left"
            onClick={() => setLeftPanelOpen(true)}
          >
            <Sliders size={13} /> Scene Tools
          </button>
        )}

        {/* Floating Sidebar Toggle Pill (Right) */}
        {!presentationMode && !rightPanelOpen && (
          <button
            type="button"
            className="panel-toggle-pill right"
            onClick={() => setRightPanelOpen(true)}
          >
            <Layers size={13} /> Avatar Layers
          </button>
        )}

        {/* 3. LEFT COLLAPSIBLE PANEL: Appearance & Render */}
        {!presentationMode && (
          <div className={`studio-side-panel left-panel ${!leftPanelOpen ? 'collapsed' : ''}`}>
            <div className="panel-header-tabs">
              <button
                type="button"
                className={`panel-tab-btn ${activeLeftTab === 'bg' ? 'active' : ''}`}
                onClick={() => setActiveLeftTab('bg')}
              >
                <Palette size={13} /> Background
              </button>
              <button
                type="button"
                className={`panel-tab-btn ${activeLeftTab === 'light' ? 'active' : ''}`}
                onClick={() => setActiveLeftTab('light')}
              >
                <Sun size={13} /> Lighting
              </button>
              <button
                type="button"
                className={`panel-tab-btn ${activeLeftTab === 'mat' ? 'active' : ''}`}
                onClick={() => setActiveLeftTab('mat')}
              >
                <Sliders size={13} /> Materials
              </button>
              <button
                type="button"
                className={`panel-tab-btn ${activeLeftTab === 'render' ? 'active' : ''}`}
                onClick={() => setActiveLeftTab('render')}
              >
                <Sparkles size={13} /> Render
              </button>
              <button
                type="button"
                onClick={() => setLeftPanelOpen(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', padding: '0 8px', cursor: 'pointer' }}
                title="Collapse Panel"
              >
                <X size={15} />
              </button>
            </div>

            <div className="panel-scroll-content">
              {/* TAB 1: BACKGROUND STUDIO */}
              {activeLeftTab === 'bg' && (
                <>
                  <div className="studio-ctrl-group">
                    <div className="studio-ctrl-label">
                      <span>Background Mode</span>
                    </div>
                    <div className="studio-preset-grid">
                      <button
                        type="button"
                        className={`studio-preset-card ${backgroundSettings.style === 'solid' ? 'active' : ''}`}
                        onClick={() => setBackgroundSettings((prev) => ({ ...prev, style: 'solid' }))}
                      >
                        Solid Color
                      </button>
                      <button
                        type="button"
                        className={`studio-preset-card ${backgroundSettings.style === 'gradient' ? 'active' : ''}`}
                        onClick={() => setBackgroundSettings((prev) => ({ ...prev, style: 'gradient' }))}
                      >
                        Gradient
                      </button>
                      <button
                        type="button"
                        className={`studio-preset-card ${backgroundSettings.style === 'environment' ? 'active' : ''}`}
                        onClick={() => setBackgroundSettings((prev) => ({ ...prev, style: 'environment' }))}
                      >
                        Environment Dome
                      </button>
                      <button
                        type="button"
                        className={`studio-preset-card ${backgroundSettings.style === 'transparent' ? 'active' : ''}`}
                        onClick={() => setBackgroundSettings((prev) => ({ ...prev, style: 'transparent' }))}
                      >
                        Transparent Alpha
                      </button>
                    </div>
                  </div>

                  {backgroundSettings.style === 'solid' && (
                    <div className="studio-ctrl-group">
                      <div className="studio-ctrl-label">
                        <span>Solid Color</span>
                        <span className="studio-ctrl-val">{backgroundSettings.solidColor}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input
                          type="color"
                          value={backgroundSettings.solidColor}
                          onChange={(e) =>
                            setBackgroundSettings((prev) => ({ ...prev, solidColor: e.target.value }))
                          }
                          style={{ width: '38px', height: '32px', borderRadius: '4px', cursor: 'pointer', border: 'none' }}
                        />
                        <input
                          type="text"
                          value={backgroundSettings.solidColor}
                          onChange={(e) =>
                            setBackgroundSettings((prev) => ({ ...prev, solidColor: e.target.value }))
                          }
                          style={{
                            flex: 1,
                            background: '#1e293b',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            color: '#fff',
                            padding: '5px 8px',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                          }}
                        />
                      </div>
                      <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                        {['#0e1117', '#1e293b', '#000000', '#ffffff', '#64748b', '#2b2d42'].map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setBackgroundSettings((prev) => ({ ...prev, solidColor: c }))}
                            style={{
                              flex: 1,
                              height: '20px',
                              background: c,
                              border: '1px solid rgba(255,255,255,0.2)',
                              borderRadius: '3px',
                              cursor: 'pointer',
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {backgroundSettings.style === 'gradient' && (
                    <>
                      <div className="studio-ctrl-group">
                        <div className="studio-ctrl-label">
                          <span>Top Color</span>
                          <span className="studio-ctrl-val">{backgroundSettings.gradientTop}</span>
                        </div>
                        <input
                          type="color"
                          value={backgroundSettings.gradientTop}
                          onChange={(e) =>
                            setBackgroundSettings((prev) => ({ ...prev, gradientTop: e.target.value }))
                          }
                          style={{ width: '100%', height: '30px', borderRadius: '4px', cursor: 'pointer', border: 'none' }}
                        />
                      </div>
                      <div className="studio-ctrl-group">
                        <div className="studio-ctrl-label">
                          <span>Bottom Color</span>
                          <span className="studio-ctrl-val">{backgroundSettings.gradientBottom}</span>
                        </div>
                        <input
                          type="color"
                          value={backgroundSettings.gradientBottom}
                          onChange={(e) =>
                            setBackgroundSettings((prev) => ({ ...prev, gradientBottom: e.target.value }))
                          }
                          style={{ width: '100%', height: '30px', borderRadius: '4px', cursor: 'pointer', border: 'none' }}
                        />
                      </div>
                      <div className="studio-ctrl-group">
                        <div className="studio-ctrl-label">
                          <span>Gradient Direction</span>
                          <span className="studio-ctrl-val">{backgroundSettings.gradientAngle}°</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="360"
                          value={backgroundSettings.gradientAngle}
                          onChange={(e) =>
                            setBackgroundSettings((prev) => ({
                              ...prev,
                              gradientAngle: parseInt(e.target.value),
                            }))
                          }
                          className="studio-slider"
                        />
                      </div>
                    </>
                  )}

                  <div
                    style={{
                      background: 'rgba(255, 255, 255, 0.04)',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      fontSize: '0.72rem',
                      color: '#94a3b8',
                      lineHeight: 1.4,
                    }}
                  >
                    <Info size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: '-2px' }} />
                    Background is decoupled from Environment Lighting. You can use HDRI reflections while displaying a clean solid or gradient backdrop.
                  </div>
                </>
              )}

              {/* TAB 2: LIGHTING STUDIO */}
              {activeLeftTab === 'light' && (
                <>
                  <div className="studio-ctrl-group">
                    <div className="studio-ctrl-label">
                      <span>Lighting Presets</span>
                    </div>
                    <div className="studio-preset-grid">
                      {Object.keys(LIGHTING_PRESETS).map((pName) => (
                        <button
                          key={pName}
                          type="button"
                          className={`studio-preset-card ${lightingSettings.presetName === pName ? 'active' : ''}`}
                          onClick={() => setLightingSettings(LIGHTING_PRESETS[pName])}
                        >
                          {pName}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Key Light Controls */}
                  <div className="studio-ctrl-group">
                    <div className="studio-ctrl-label">
                      <span>Key Light</span>
                      <label style={{ cursor: 'pointer', fontSize: '0.7rem' }}>
                        <input
                          type="checkbox"
                          checked={lightingSettings.keyLight.enabled}
                          onChange={(e) =>
                            setLightingSettings((prev) => ({
                              ...prev,
                              keyLight: { ...prev.keyLight, enabled: e.target.checked },
                            }))
                          }
                        />{' '}
                        Active
                      </label>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        type="color"
                        value={lightingSettings.keyLight.color}
                        onChange={(e) =>
                          setLightingSettings((prev) => ({
                            ...prev,
                            keyLight: { ...prev.keyLight, color: e.target.value },
                          }))
                        }
                        style={{ width: '32px', height: '26px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                      />
                      <input
                        type="range"
                        min="0"
                        max="5"
                        step="0.1"
                        value={lightingSettings.keyLight.intensity}
                        onChange={(e) =>
                          setLightingSettings((prev) => ({
                            ...prev,
                            keyLight: { ...prev.keyLight, intensity: parseFloat(e.target.value) },
                          }))
                        }
                        className="studio-slider"
                      />
                      <span className="studio-ctrl-val">{lightingSettings.keyLight.intensity.toFixed(1)}</span>
                    </div>
                  </div>

                  {/* Fill Light Controls */}
                  <div className="studio-ctrl-group">
                    <div className="studio-ctrl-label">
                      <span>Fill Light</span>
                      <label style={{ cursor: 'pointer', fontSize: '0.7rem' }}>
                        <input
                          type="checkbox"
                          checked={lightingSettings.fillLight.enabled}
                          onChange={(e) =>
                            setLightingSettings((prev) => ({
                              ...prev,
                              fillLight: { ...prev.fillLight, enabled: e.target.checked },
                            }))
                          }
                        />{' '}
                        Active
                      </label>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        type="color"
                        value={lightingSettings.fillLight.color}
                        onChange={(e) =>
                          setLightingSettings((prev) => ({
                            ...prev,
                            fillLight: { ...prev.fillLight, color: e.target.value },
                          }))
                        }
                        style={{ width: '32px', height: '26px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                      />
                      <input
                        type="range"
                        min="0"
                        max="4"
                        step="0.1"
                        value={lightingSettings.fillLight.intensity}
                        onChange={(e) =>
                          setLightingSettings((prev) => ({
                            ...prev,
                            fillLight: { ...prev.fillLight, intensity: parseFloat(e.target.value) },
                          }))
                        }
                        className="studio-slider"
                      />
                      <span className="studio-ctrl-val">{lightingSettings.fillLight.intensity.toFixed(1)}</span>
                    </div>
                  </div>

                  {/* Rim Light Controls */}
                  <div className="studio-ctrl-group">
                    <div className="studio-ctrl-label">
                      <span>Rim Light</span>
                      <label style={{ cursor: 'pointer', fontSize: '0.7rem' }}>
                        <input
                          type="checkbox"
                          checked={lightingSettings.rimLight.enabled}
                          onChange={(e) =>
                            setLightingSettings((prev) => ({
                              ...prev,
                              rimLight: { ...prev.rimLight, enabled: e.target.checked },
                            }))
                          }
                        />{' '}
                        Active
                      </label>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        type="color"
                        value={lightingSettings.rimLight.color}
                        onChange={(e) =>
                          setLightingSettings((prev) => ({
                            ...prev,
                            rimLight: { ...prev.rimLight, color: e.target.value },
                          }))
                        }
                        style={{ width: '32px', height: '26px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                      />
                      <input
                        type="range"
                        min="0"
                        max="5"
                        step="0.1"
                        value={lightingSettings.rimLight.intensity}
                        onChange={(e) =>
                          setLightingSettings((prev) => ({
                            ...prev,
                            rimLight: { ...prev.rimLight, intensity: parseFloat(e.target.value) },
                          }))
                        }
                        className="studio-slider"
                      />
                      <span className="studio-ctrl-val">{lightingSettings.rimLight.intensity.toFixed(1)}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="studio-action-btn"
                    onClick={() => setLightingSettings(LIGHTING_PRESETS['Neutral Studio'])}
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    <RotateCcw size={12} /> Reset Lighting
                  </button>
                </>
              )}

              {/* TAB 3: MATERIAL OVERRIDES */}
              {activeLeftTab === 'mat' && (
                <>
                  <div className="studio-ctrl-group">
                    <div className="studio-ctrl-label">
                      <span>Select Material</span>
                    </div>
                    {availableMaterialNames.length === 0 ? (
                      <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
                        No editable materials found in this model.
                      </div>
                    ) : (
                      <select
                        value={selectedMaterialName || availableMaterialNames[0]}
                        onChange={(e) => setSelectedMaterialName(e.target.value)}
                        style={{
                          width: '100%',
                          background: '#1e293b',
                          color: '#fff',
                          border: '1px solid rgba(255,255,255,0.15)',
                          padding: '6px',
                          borderRadius: '4px',
                          fontSize: '0.74rem',
                        }}
                      >
                        {availableMaterialNames.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {(() => {
                    const currentMatName = selectedMaterialName || availableMaterialNames[0];
                    if (!currentMatName) return null;
                    const override = materialOverrides[currentMatName] || {};

                    const isHair =
                      currentMatName.toLowerCase().includes('hair') ||
                      currentMatName.toLowerCase().includes('strand');

                    return (
                      <>
                        {isHair && (
                          <div
                            style={{
                              background: 'rgba(59, 130, 246, 0.15)',
                              border: '1px solid rgba(59, 130, 246, 0.3)',
                              borderRadius: '6px',
                              padding: '8px',
                              fontSize: '0.7rem',
                              color: '#93c5fd',
                            }}
                          >
                            <strong>Hair Material Notice:</strong> Material uses glTF BLEND transparency. Rendering behavior can differ between Blender Eevee and WebGL sorting.
                          </div>
                        )}

                        <div className="studio-ctrl-group">
                          <div className="studio-ctrl-label">
                            <span>Base Color Tint</span>
                            <span className="studio-ctrl-val">{override.tintColor || '#ffffff'}</span>
                          </div>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <input
                              type="color"
                              value={override.tintColor || '#ffffff'}
                              onChange={(e) =>
                                applyMaterialOverride(currentMatName, { tintColor: e.target.value })
                              }
                              style={{ width: '36px', height: '28px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                            />
                            <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                              Multiplies base color texture safely.
                            </span>
                          </div>
                        </div>

                        <div className="studio-ctrl-group">
                          <div className="studio-ctrl-label">
                            <span>Roughness</span>
                            <span className="studio-ctrl-val">{override.roughness !== undefined ? override.roughness.toFixed(2) : 'Default'}</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={override.roughness !== undefined ? override.roughness : 0.8}
                            onChange={(e) =>
                              applyMaterialOverride(currentMatName, { roughness: parseFloat(e.target.value) })
                            }
                            className="studio-slider"
                          />
                        </div>

                        <div className="studio-ctrl-group">
                          <div className="studio-ctrl-label">
                            <span>Metalness</span>
                            <span className="studio-ctrl-val">{override.metalness !== undefined ? override.metalness.toFixed(2) : 'Default'}</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={override.metalness !== undefined ? override.metalness : 0.1}
                            onChange={(e) =>
                              applyMaterialOverride(currentMatName, { metalness: parseFloat(e.target.value) })
                            }
                            className="studio-slider"
                          />
                        </div>

                        <div className="studio-ctrl-group">
                          <div className="studio-ctrl-label">
                            <span>Opacity</span>
                            <span className="studio-ctrl-val">{override.opacity !== undefined ? override.opacity.toFixed(2) : '1.00'}</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={override.opacity !== undefined ? override.opacity : 1.0}
                            onChange={(e) =>
                              applyMaterialOverride(currentMatName, { opacity: parseFloat(e.target.value) })
                            }
                            className="studio-slider"
                          />
                        </div>
                      </>
                    );
                  })()}
                </>
              )}

              {/* TAB 4: RENDER & TONE MAPPING */}
              {activeLeftTab === 'render' && (
                <>
                  <div className="studio-ctrl-group">
                    <div className="studio-ctrl-label">
                      <span>HDRI Environment</span>
                      <button
                        type="button"
                        onClick={() => setEnvEnabled(!envEnabled)}
                        style={{
                          background: envEnabled ? 'rgba(52, 211, 153, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                          color: envEnabled ? '#34d399' : '#f87171',
                          border: 'none',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {envEnabled ? 'ON' : 'OFF'}
                      </button>
                    </div>
                    <button
                      type="button"
                      className="studio-action-btn"
                      onClick={() => hdrFileInputRef.current?.click()}
                      style={{ justifyContent: 'center' }}
                    >
                      <Upload size={13} /> Upload Custom .hdr / .exr
                    </button>
                    <input
                      type="file"
                      ref={hdrFileInputRef}
                      accept=".hdr,.exr"
                      style={{ display: 'none' }}
                      onChange={handleHdrFileChange}
                    />
                    {hdrSourceType === 'Custom' && (
                      <button
                        type="button"
                        className="studio-action-btn"
                        onClick={handleClearCustomHdr}
                        style={{ justifyContent: 'center', fontSize: '0.7rem' }}
                      >
                        Reset to Studio HDRI
                      </button>
                    )}
                    <div
                      style={{
                        background: 'rgba(15, 23, 42, 0.7)',
                        borderRadius: '6px',
                        padding: '6px 8px',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        marginTop: '6px',
                        fontSize: '0.72rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                        <span style={{ color: '#94a3b8' }}>HDRI:</span>
                        <code style={{ color: '#f8fafc' }}>{hdrName}</code>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                        <span style={{ color: '#94a3b8' }}>Format:</span>
                        <span style={{ color: '#e2e8f0' }}>{hdrFormat}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#94a3b8' }}>Status:</span>
                        {hdrStatus === 'Loaded' && (
                          <span style={{ color: '#34d399', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <CheckCircle2 size={11} /> Loaded
                          </span>
                        )}
                        {hdrStatus === 'Loading' && (
                          <span style={{ color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <RefreshCw size={11} className="spin" /> Decoding...
                          </span>
                        )}
                        {hdrStatus === 'Failed' && (
                          <span style={{ color: '#f87171', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <XCircle size={11} /> Failed
                          </span>
                        )}
                      </div>
                      {hdrError && (
                        <div style={{ color: '#fca5a5', marginTop: '3px', fontSize: '0.68rem' }}>
                          Reason: {hdrError}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="studio-ctrl-group">
                    <div className="studio-ctrl-label">
                      <span>Environment Intensity</span>
                      <span className="studio-ctrl-val">{envIntensity.toFixed(1)}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="3"
                      step="0.1"
                      value={envIntensity}
                      disabled={!envEnabled}
                      onChange={(e) => setEnvIntensity(parseFloat(e.target.value))}
                      className="studio-slider"
                    />
                  </div>

                  <div className="studio-ctrl-group">
                    <div className="studio-ctrl-label">
                      <span>Environment Rotation</span>
                      <span className="studio-ctrl-val">{envRotation}°</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="360"
                      step="5"
                      value={envRotation}
                      disabled={!envEnabled}
                      onChange={(e) => setEnvRotation(parseInt(e.target.value))}
                      className="studio-slider"
                    />
                  </div>

                  <div className="studio-ctrl-group">
                    <div className="studio-ctrl-label">
                      <span>Tone Mapping</span>
                    </div>
                    <select
                      value={toneMappingType}
                      onChange={(e) => setToneMappingType(e.target.value as any)}
                      style={{
                        width: '100%',
                        background: '#1e293b',
                        color: '#fff',
                        border: '1px solid rgba(255,255,255,0.15)',
                        padding: '6px',
                        borderRadius: '4px',
                        fontSize: '0.74rem',
                      }}
                    >
                      <option value="AgX">AgX (Blender 4+ Viewport Default)</option>
                      <option value="ACESFilmic">ACES Filmic (Three.js Default)</option>
                      <option value="Neutral">Neutral (Khronos Tone Mapper)</option>
                      <option value="Linear">Linear Tone Mapping</option>
                      <option value="None">None</option>
                    </select>
                  </div>

                  <div className="studio-ctrl-group">
                    <div className="studio-ctrl-label">
                      <span>Exposure</span>
                      <span className="studio-ctrl-val">{exposure.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min="0.25"
                      max="2.5"
                      step="0.05"
                      value={exposure}
                      onChange={(e) => setExposure(parseFloat(e.target.value))}
                      className="studio-slider"
                    />
                  </div>

                  {/* Save Preset Section */}
                  <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                    <div className="studio-ctrl-label" style={{ marginBottom: '6px' }}>
                      <span>Save Studio Preset</span>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <input
                        type="text"
                        placeholder="Preset Name..."
                        value={newPresetName}
                        onChange={(e) => setNewPresetName(e.target.value)}
                        style={{
                          flex: 1,
                          background: '#1e293b',
                          border: '1px solid rgba(255,255,255,0.15)',
                          color: '#fff',
                          padding: '5px 8px',
                          borderRadius: '4px',
                          fontSize: '0.72rem',
                        }}
                      />
                      <button
                        type="button"
                        className="studio-action-btn primary"
                        onClick={saveCurrentPreset}
                      >
                        <Save size={12} /> Save
                      </button>
                    </div>

                    {savedPresets.length > 0 && (
                      <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {savedPresets.map((sp) => (
                          <div
                            key={sp.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              background: 'rgba(255,255,255,0.04)',
                              padding: '4px 6px',
                              borderRadius: '4px',
                              fontSize: '0.7rem',
                            }}
                          >
                            <span style={{ color: '#cbd5e1' }}>{sp.name}</span>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button
                                type="button"
                                onClick={() => loadSavedPreset(sp)}
                                style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '3px', padding: '1px 5px', cursor: 'pointer', fontSize: '0.65rem' }}
                              >
                                Load
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteSavedPreset(sp.id)}
                                style={{ background: 'transparent', color: '#f87171', border: 'none', cursor: 'pointer' }}
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* 4. RIGHT COLLAPSIBLE PANEL: Avatar Parts, Tree, Pose */}
        {!presentationMode && (
          <div className={`studio-side-panel right-panel ${!rightPanelOpen ? 'collapsed' : ''}`}>
            <div className="panel-header-tabs">
              <button
                type="button"
                className={`panel-tab-btn ${activeRightTab === 'parts' ? 'active' : ''}`}
                onClick={() => setActiveRightTab('parts')}
              >
                <Layers size={13} /> Parts
              </button>
              <button
                type="button"
                className={`panel-tab-btn ${activeRightTab === 'tree' ? 'active' : ''}`}
                onClick={() => setActiveRightTab('tree')}
              >
                <FolderTree size={13} /> Scene Tree
              </button>
              <button
                type="button"
                className={`panel-tab-btn ${activeRightTab === 'pose' ? 'active' : ''}`}
                onClick={() => setActiveRightTab('pose')}
              >
                <User size={13} /> Pose
              </button>
              {animations.length > 0 && (
                <button
                  type="button"
                  className={`panel-tab-btn ${activeRightTab === 'anim' ? 'active' : ''}`}
                  onClick={() => setActiveRightTab('anim')}
                >
                  <Film size={13} /> Clips
                </button>
              )}
              <button
                type="button"
                onClick={() => setRightPanelOpen(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', padding: '0 8px', cursor: 'pointer' }}
                title="Collapse Panel"
              >
                <X size={15} />
              </button>
            </div>

            <div className="panel-scroll-content">
              {/* TAB 1: AVATAR PARTS & SOLO MODE */}
              {activeRightTab === 'parts' && (
                <>
                  {soloPartId && (
                    <div className="solo-banner">
                      <span>Solo Mode Active</span>
                      <button type="button" className="exit-solo-btn" onClick={exitSolo}>
                        Exit Solo
                      </button>
                    </div>
                  )}

                  {avatarParts.length === 0 ? (
                    <div style={{ color: '#94a3b8', fontSize: '0.78rem', textAlign: 'center', padding: '2rem 0' }}>
                      Not available for this model
                    </div>
                  ) : (
                    <div className="parts-list">
                      {avatarParts.map((part) => (
                        <div key={part.id} className="part-item-row">
                          <div className="part-info-left">
                            <input
                              type="checkbox"
                              checked={part.visible}
                              onChange={() => togglePartVisibility(part.id)}
                            />
                            <div>
                              <div className="part-name" title={part.name}>
                                {part.name}
                              </div>
                              <span className="part-badge">
                                {part.category} • {part.confidence}
                              </span>
                            </div>
                          </div>
                          <div className="part-actions-right">
                            <button
                              type="button"
                              className="solo-part-btn"
                              onClick={() => (soloPartId === part.id ? exitSolo() : soloPart(part.id))}
                            >
                              {soloPartId === part.id ? 'Unsolo' : 'Solo'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* TAB 2: SCENE EXPLORER TREE VIEW */}
              {activeRightTab === 'tree' && (
                <div className="scene-tree-wrap">
                  {(() => {
                    const renderNode = (node: StudioSceneNode, depth: number = 0): React.ReactNode => (
                      <div key={node.uuid} style={{ marginLeft: `${depth * 10}px` }}>
                        <div
                          className={`tree-node-row ${selectedNodeUuid === node.uuid ? 'selected' : ''}`}
                          onClick={() => setSelectedNodeUuid(node.uuid)}
                        >
                          <div className="tree-node-left">
                            <span style={{ fontSize: '0.65rem', color: '#64748b' }}>
                              {node.isMesh ? 'MESH' : node.isBone ? 'BONE' : 'NODE'}
                            </span>
                            <span className="tree-node-name" title={node.name}>
                              {node.name}
                            </span>
                          </div>
                          {node.triangles > 0 && (
                            <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>
                              {node.triangles}t
                            </span>
                          )}
                        </div>
                        {node.children && node.children.map((ch) => renderNode(ch, depth + 1))}
                      </div>
                    );

                    return sceneTree ? (
                      renderNode(sceneTree)
                    ) : (
                      <div style={{ color: '#94a3b8', fontSize: '0.74rem' }}>Building scene tree...</div>
                    );
                  })()}
                </div>
              )}

              {/* TAB 3: POSE SYSTEM */}
              {activeRightTab === 'pose' && (
                <>
                  {!hasSkeleton ? (
                    <div style={{ color: '#94a3b8', fontSize: '0.75rem', padding: '1rem', textAlign: 'center', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
                      Pose controls unavailable — no compatible skeleton found.
                    </div>
                  ) : (
                    <div className="studio-ctrl-group">
                      <div className="studio-ctrl-label">
                        <span>Humanoid Poses</span>
                      </div>
                      <div className="studio-preset-grid">
                        {HUMANOID_POSE_PRESETS.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            className={`studio-preset-card ${activePoseId === p.id ? 'active' : ''}`}
                            onClick={() => applyPosePreset(p.id)}
                          >
                            {p.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* TAB 4: ANIMATION CLIPS */}
              {activeRightTab === 'anim' && (
                <>
                  {animations.length === 0 ? (
                    <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
                      No embedded animation clips.
                    </div>
                  ) : (
                    <>
                      <div className="studio-ctrl-group">
                        <div className="studio-ctrl-label">
                          <span>Animation Clip</span>
                        </div>
                        <select
                          value={activeAnimIndex}
                          onChange={(e) => handleSelectAnim(parseInt(e.target.value))}
                          style={{
                            width: '100%',
                            background: '#1e293b',
                            color: '#fff',
                            border: '1px solid rgba(255,255,255,0.15)',
                            padding: '6px',
                            borderRadius: '4px',
                            fontSize: '0.74rem',
                          }}
                        >
                          {animations.map((clip, i) => (
                            <option key={clip.name || i} value={i}>
                              {clip.name || `Clip ${i + 1}`} ({clip.duration.toFixed(1)}s)
                            </option>
                          ))}
                        </select>
                      </div>

                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          className="studio-action-btn primary"
                          onClick={togglePlayAnim}
                          style={{ flex: 1, justifyContent: 'center' }}
                        >
                          {isPlayingAnim ? <Pause size={12} /> : <Play size={12} />}
                          {isPlayingAnim ? 'Pause' : 'Play'}
                        </button>
                        <button
                          type="button"
                          className="studio-action-btn"
                          onClick={stopAnim}
                          style={{ justifyContent: 'center' }}
                        >
                          <Square size={12} />
                        </button>
                      </div>

                      {/* Scrubber & Loop */}
                      <div style={{ margin: '4px 0' }}>
                        <div style={{ height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                          <div style={{ width: `${(animProgress * 100).toFixed(1)}%`, height: '100%', background: '#3b82f6', transition: 'width 0.1s linear' }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.7rem', color: '#cbd5e1', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={animLoop}
                              onChange={(e) => setAnimLoop(e.target.checked)}
                            />
                            Loop
                          </label>
                          <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                            {Math.round(animProgress * 100)}%
                          </span>
                        </div>
                      </div>

                      <div className="studio-ctrl-group">
                        <div className="studio-ctrl-label">
                          <span>Playback Speed</span>
                          <span className="studio-ctrl-val">{animSpeed}x</span>
                        </div>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          {[0.5, 1.0, 1.5, 2.0].map((s) => (
                            <button
                              key={s}
                              type="button"
                              className={`studio-preset-card ${animSpeed === s ? 'active' : ''}`}
                              onClick={() => setAnimSpeed(s)}
                              style={{ flex: 1, textAlign: 'center', padding: '3px' }}
                            >
                              {s}x
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* 5. BOTTOM CAMERA & PRESENTATION SHELF */}
        <div className="studio-bottom-shelf">
          {/* Framing Presets */}
          <div className="shelf-section">
            <button
              type="button"
              className={`shelf-btn ${activeCameraPreset === 'fullBody' ? 'active' : ''}`}
              onClick={() => applyCameraPreset('fullBody')}
              title="Full Body Framing"
            >
              Full Body
            </button>
            <button
              type="button"
              className={`shelf-btn ${activeCameraPreset === 'waistUp' ? 'active' : ''}`}
              onClick={() => applyCameraPreset('waistUp')}
              title="Waist Up"
            >
              Waist Up
            </button>
            <button
              type="button"
              className={`shelf-btn ${activeCameraPreset === 'portrait' ? 'active' : ''}`}
              onClick={() => applyCameraPreset('portrait')}
              title="Portrait"
            >
              Portrait
            </button>
            <button
              type="button"
              className={`shelf-btn ${activeCameraPreset === 'face' ? 'active' : ''}`}
              onClick={() => applyCameraPreset('face')}
              title="Face Close-up"
            >
              Face
            </button>
          </div>

          <div className="shelf-divider" />

          {/* Angles */}
          <div className="shelf-section">
            <button
              type="button"
              className={`shelf-btn ${activeAngle === 'front' ? 'active' : ''}`}
              onClick={() => applyCameraPreset(activeCameraPreset, 'front')}
              title="Front View"
            >
              Front
            </button>
            <button
              type="button"
              className={`shelf-btn ${activeAngle === 'threeQuarterLeft' ? 'active' : ''}`}
              onClick={() => applyCameraPreset(activeCameraPreset, 'threeQuarterLeft')}
              title="3/4 Left"
            >
              3/4 L
            </button>
            <button
              type="button"
              className={`shelf-btn ${activeAngle === 'threeQuarterRight' ? 'active' : ''}`}
              onClick={() => applyCameraPreset(activeCameraPreset, 'threeQuarterRight')}
              title="3/4 R"
            >
              3/4 R
            </button>
            <button
              type="button"
              className={`shelf-btn ${activeAngle === 'sideLeft' ? 'active' : ''}`}
              onClick={() => applyCameraPreset(activeCameraPreset, 'sideLeft')}
              title="Side Profile"
            >
              Profile
            </button>
            <button
              type="button"
              className={`shelf-btn ${activeAngle === 'back' ? 'active' : ''}`}
              onClick={() => applyCameraPreset(activeCameraPreset, 'back')}
              title="Back"
            >
              Back
            </button>
          </div>

          <div className="shelf-divider" />

          {/* Quick Tools */}
          <div className="shelf-section">
            <button
              type="button"
              className={`shelf-btn ${wireframe ? 'active' : ''}`}
              onClick={() => setWireframe(!wireframe)}
              title="Wireframe"
            >
              <Grid3X3 size={13} />
            </button>
            <button
              type="button"
              className={`shelf-btn ${showGrid ? 'active' : ''}`}
              onClick={() => setShowGrid(!showGrid)}
              title="Ground Grid"
            >
              <Eye size={13} />
            </button>
            <button
              type="button"
              className="shelf-btn"
              onClick={resetCamera}
              title="Reset Camera (R)"
            >
              <RotateCw size={13} />
            </button>
          </div>
        </div>

        {/* Loading Overlay */}
        {loading && (
          <div className="viewer-overlay">
            <div className="spinner" />
            <p>Loading model into Three.js Avatar Studio...</p>
          </div>
        )}

        {/* Load Error Overlay */}
        {loadError && (
          <div className="viewer-overlay error">
            <AlertTriangle size={32} color="#f87171" />
            <p className="error-title">Three.js Studio Alert</p>
            <p className="error-desc">{loadError}</p>
          </div>
        )}
      </div>
    </div>
  );
};
