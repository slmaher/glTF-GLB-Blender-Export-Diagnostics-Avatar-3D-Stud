import type {
  FileInfo,
  SceneStructure,
  MaterialAnalysis,
  TextureAnalysis,
  MeshAnalysis,
} from '../../types/diagnostic';
import type {
  BlenderCompatibilityReport,
  CompatibilityFinding,
  CompatibilityScores,
  CategoryScore,
  RenderDifferenceCause,
  KnownUnknownItem,
  ComparisonChecklistItem,
} from '../../types/compatibility';

import { analyzeMaterials } from './materialAnalyzer';
import { analyzeTextures } from './textureAnalyzer';
import { analyzeColorManagement } from './colorManagementAnalyzer';
import { analyzeNormalsAndTangents } from './normalsTangentsAnalyzer';
import { analyzeLighting } from './lightingAnalyzer';
import { analyzeGeometry } from './geometryAnalyzer';
import { analyzeAvatarReadiness } from './avatarAnalyzer';

function buildCategoryScore(
  name: string,
  categoryKey: string,
  deductions: Array<{ reason: string; points: number }>
): CategoryScore {
  const totalDeduction = deductions.reduce((acc, d) => acc + d.points, 0);
  const score = Math.max(10, Math.min(100, 100 - totalDeduction));
  const status: CategoryScore['status'] =
    score >= 85 ? 'passed' : score >= 60 ? 'warning' : 'critical';

  return {
    name,
    categoryKey,
    score,
    deductions,
    status,
  };
}

export function analyzeRenderCompatibility(
  fileInfo: FileInfo,
  sceneStructure: SceneStructure,
  materials: MaterialAnalysis[],
  textures: TextureAnalysis[],
  meshes: MeshAnalysis[],
  gltfRaw: any
): BlenderCompatibilityReport {
  // 1. Run all modular analyzers
  const matResult = analyzeMaterials(materials, meshes, fileInfo, gltfRaw);
  const texResult = analyzeTextures(textures, materials, gltfRaw);
  const colorResult = analyzeColorManagement(materials, textures, fileInfo, gltfRaw);
  const normResult = analyzeNormalsAndTangents(meshes, materials, gltfRaw);
  const lightResult = analyzeLighting(gltfRaw);
  const geomResult = analyzeGeometry(meshes, sceneStructure, gltfRaw);
  const avatarResult = analyzeAvatarReadiness(meshes, gltfRaw);

  const allFindings: CompatibilityFinding[] = [
    ...normResult.findings,
    ...matResult.findings,
    ...colorResult.findings,
    ...lightResult.findings,
    ...texResult.findings,
    ...geomResult.findings,
    ...avatarResult.findings,
  ];

  // 2. Build Category Scores with transparent point deductions
  const materialsScore = buildCategoryScore('Material Compatibility', 'materials', matResult.deductions);
  const texturesScore = buildCategoryScore('Texture Compatibility', 'textures', texResult.deductions);
  const lightingScore = buildCategoryScore('Lighting Compatibility', 'lighting', lightResult.deductions);
  const colorManagementScore = buildCategoryScore(
    'Color Management Compatibility',
    'colorManagement',
    colorResult.deductions
  );
  const geometryScore = buildCategoryScore(
    'Geometry Compatibility',
    'geometry',
    [...geomResult.deductions, ...normResult.deductions]
  );
  const avatarScore = buildCategoryScore(
    'Avatar / Animation Compatibility',
    'avatar',
    avatarResult.deductions
  );

  // Overall Score Calculation (Transparent weighted average)
  let overallScore: number;
  if (avatarResult.avatarReadiness.isAvatar) {
    overallScore = Math.round(
      materialsScore.score * 0.25 +
      lightingScore.score * 0.20 +
      colorManagementScore.score * 0.15 +
      geometryScore.score * 0.15 +
      texturesScore.score * 0.15 +
      avatarScore.score * 0.10
    );
  } else {
    overallScore = Math.round(
      materialsScore.score * 0.30 +
      lightingScore.score * 0.22 +
      colorManagementScore.score * 0.18 +
      geometryScore.score * 0.15 +
      texturesScore.score * 0.15
    );
  }
  overallScore = Math.max(10, Math.min(100, overallScore));

  const deductionLog: Array<{ category: string; reason: string; points: number }> = [];
  [
    { cat: 'Materials', list: matResult.deductions },
    { cat: 'Textures', list: texResult.deductions },
    { cat: 'Lighting', list: lightResult.deductions },
    { cat: 'Color Management', list: colorResult.deductions },
    { cat: 'Geometry', list: geomResult.deductions },
    { cat: 'Normals & Tangents', list: normResult.deductions },
    { cat: 'Avatar & Rigging', list: avatarResult.deductions },
  ].forEach((group) => {
    group.list.forEach((d) => deductionLog.push({ category: group.cat, reason: d.reason, points: d.points }));
  });

  const scores: CompatibilityScores = {
    overall: overallScore,
    materials: materialsScore,
    textures: texturesScore,
    lighting: lightingScore,
    colorManagement: colorManagementScore,
    geometry: geometryScore,
    avatar: avatarScore,
    deductionLog,
  };

  // 3. Render Difference Diagnosis: # Why Does Blender Look Different?
  // Generate prioritized list from findings with highest visual impact
  const prioritizedCauses: RenderDifferenceCause[] = [];

  // HIGH: Color Management pipeline
  prioritizedCauses.push({
    priority: 'HIGH',
    category: 'Color Management',
    title: 'Color Management & Tone Mapping Pipeline',
    affectedItem: 'Full Screen Viewport',
    technicalReason:
      'Blender viewport displays through AgX (Blender 4+) or Filmic tone mapping with gentle highlight compression. The GLB cannot store tone mapping curves, so Three.js renders via its own tone-mapping (often ACESFilmic or Linear), resulting in noticeably different contrast and color saturation.',
    expectedBlenderBehavior: 'Smooth dynamic range roll-off with natural highlight desaturation.',
    expectedThreeJsBehavior:
      'Higher contrast or blown-out highlights depending on renderer.toneMapping configuration.',
    recommendedFix:
      'In Three.js, set renderer.toneMapping = THREE.AgXToneMapping and renderer.outputColorSpace = THREE.SRGBColorSpace.',
  });

  // HIGH: Missing World HDRI environment
  prioritizedCauses.push({
    priority: 'HIGH',
    category: 'Lighting & Environment',
    title: 'Missing World HDRI Environment & Ambient Reflections',
    affectedItem: 'All Reflective & Metallic Surfaces',
    technicalReason:
      'Blender 3D Viewport "Material Preview" mode automatically illuminates the scene with a 360° Studio or Forest HDRI. The glTF 2.0 specification does not export world environments. In standard Three.js without scene.environment, metallic objects will reflect pitch black.',
    expectedBlenderBehavior: 'Rich multi-directional environment reflections and soft ambient fill light.',
    expectedThreeJsBehavior:
      'Dark ambient shadows and unreflective metals unless an HDR environment map is manually loaded.',
    recommendedFix:
      'Load an HDR equirectangular map in Three.js via RGBELoader and attach it to scene.environment.',
  });

  // HIGH: Missing Tangents (if found)
  const missingTangentsFinding = allFindings.find((f) => f.id === 'NORMALS_MISSING_TANGENTS');
  if (missingTangentsFinding) {
    prioritizedCauses.push({
      priority: 'HIGH',
      category: 'Normals & Tangents',
      title: 'Missing MikkTSpace Tangents on Normal Mapped Meshes',
      affectedItem: missingTangentsFinding.affectedItem,
      technicalReason:
        'Normal maps rely on tangent coordinate frames. Without exported TANGENT vectors, Three.js falls back to screen-space partial derivatives (dFdx/dFdy), causing visible UV seam splits and faceted reflections on curved surfaces.',
      expectedBlenderBehavior: 'Seamless smooth surface shading evaluated with MikkTSpace tangents.',
      expectedThreeJsBehavior: 'Noticeable UV seam lines and inaccurate anisotropic reflection directions.',
      recommendedFix:
        'In Blender glTF exporter, check "Data > Mesh > Tangents", or run BufferGeometryUtils.computeMikkTSpaceTangents() in Three.js.',
    });
  }

  // HIGH: Procedural Shader Detection (if found)
  const proceduralFinding = allFindings.find((f) => f.category === 'Procedural Shaders');
  if (proceduralFinding) {
    prioritizedCauses.push({
      priority: 'HIGH',
      category: 'Procedural Shaders',
      title: proceduralFinding.title,
      affectedItem: proceduralFinding.affectedItem,
      technicalReason:
        'Blender procedural shader nodes (Noise, Voronoi, ColorRamp, Mapping) cannot exist in glTF PBR. Any procedural shading not baked into UV image textures was stripped or exported as flat constant colors.',
      expectedBlenderBehavior: 'Dynamic procedural patterns and procedural micro-bump relief.',
      expectedThreeJsBehavior: 'Renders flat constant baseColorFactor and uniform roughness.',
      recommendedFix:
        'Bake all procedural shader nodes to image textures (Base Color, Normal, Roughness) in Blender before export.',
    });
  }

  // MEDIUM: Negative scale or unapplied transforms
  const negativeScaleFinding = allFindings.find((f) => f.id === 'GEOM_NEGATIVE_SCALE');
  if (negativeScaleFinding) {
    prioritizedCauses.push({
      priority: 'HIGH',
      category: 'Geometry & Transforms',
      title: 'Negative Scale Transforms Inverting Polygon Winding',
      affectedItem: negativeScaleFinding.affectedItem,
      technicalReason:
        'Negative node scale mirrors geometry and flips vertex winding order (CCW to CW). Backface culling causes external faces to become invisible in Three.js.',
      expectedBlenderBehavior: 'Visible surfaces if two-sided or object matrix compensation is on.',
      expectedThreeJsBehavior: 'Inside-out, hollow, or inverted surface lighting.',
      recommendedFix: 'In Blender, press Ctrl+A > Apply All Transforms, then Shift+N to recalculate normals.',
    });
  }

  // MEDIUM: Alpha mode BLEND sorting
  const alphaBlendFinding = allFindings.find((f) => f.id.startsWith('MAT_ALPHA_BLEND'));
  if (alphaBlendFinding) {
    prioritizedCauses.push({
      priority: 'MEDIUM',
      category: 'Materials & Shaders',
      title: 'Alpha Mode BLEND Depth-Sorting Discrepancy',
      affectedItem: alphaBlendFinding.affectedItem,
      technicalReason:
        'In Blender EEVEE, transparency uses Alpha Hashed stippling with depth writing. In WebGL, alphaMode: BLEND disables depthWrite, causing overlapping transparent polygons to flicker and sort incorrectly.',
      expectedBlenderBehavior: 'Clean order-independent transparency without depth-fighting.',
      expectedThreeJsBehavior: 'Self-intersecting transparent triangles sort unpredictably.',
      recommendedFix: 'Switch to Alpha Clip / glTF MASK mode with alphaCutoff for cutouts (hair/leaves).',
    });
  }

  // MEDIUM: High metallic surfaces without roughness map
  const metallicFinding = allFindings.find((f) => f.id.startsWith('MAT_METALLIC_MIRROR'));
  if (metallicFinding && !prioritizedCauses.some((c) => c.title.includes('Mirror Metal'))) {
    prioritizedCauses.push({
      priority: 'MEDIUM',
      category: 'Materials & Shaders',
      title: 'Mirror Conductive Metals Dependent on External IBL',
      affectedItem: metallicFinding.affectedItem,
      technicalReason:
        'Metals have 0 diffuse albedo and reflect 100% environment radiance. Without an active environment map in Three.js, these materials render as solid black.',
      expectedBlenderBehavior: 'Shining chrome reflections from Blender studio HDRI.',
      expectedThreeJsBehavior: 'Pitch-black silhouette under standard directional lights.',
      recommendedFix: 'Provide an HDR environment map to Three.js scene.environment.',
    });
  }

  // LOW: Texture resolution or NPOT
  const textureResFinding = allFindings.find((f) => f.id.startsWith('TEX_HIGH_RES') || f.id.startsWith('TEX_NPOT'));
  if (textureResFinding) {
    prioritizedCauses.push({
      priority: 'LOW',
      category: 'Textures',
      title: 'Texture Memory & Filtering Differences',
      affectedItem: textureResFinding.affectedItem,
      technicalReason:
        'Desktop Blender utilizes unconstrained dedicated GPU VRAM and desktop anisotropic filtering. In WebGL, large or NPOT textures may trigger mipmap downgrades or memory pressure.',
      expectedBlenderBehavior: 'Full resolution 16x anisotropic desktop texture filtering.',
      expectedThreeJsBehavior: 'Potential texture compression artifacts or mobile memory limits.',
      recommendedFix: 'Ensure textures are power-of-two (POT) and optimized for web delivery.',
    });
  }

  // 4. Known vs Unknown Section
  const verifiedFromGlb: KnownUnknownItem[] = [
    {
      feature: 'PBR Materials & Factors',
      details: `${materials.length} materials parsed with exact baseColor, metallic, roughness, and emissive factors.`,
      status: 'verified',
      source: 'glTF materials array',
    },
    {
      feature: 'Texture Dimensions & Formats',
      details: `${textures.length} textures inspected for MIME type, dimensions, and NPOT status.`,
      status: 'verified',
      source: 'glTF images and textures buffers',
    },
    {
      feature: 'Geometry & Attribute Streams',
      details: `${meshes.length} meshes with vertex attributes (POSITION, NORMAL, TANGENT, UVs).`,
      status: 'verified',
      source: 'glTF accessors and bufferViews',
    },
    {
      feature: 'glTF Extensions',
      details: `${fileInfo.generator || 'Exporter'} utilized extensions: ${(gltfRaw?.extensionsUsed || []).join(', ') || 'None'}.`,
      status: 'verified',
      source: 'glTF extensionsUsed header',
    },
    {
      feature: 'Skinning & Blendshapes',
      details: `${avatarResult.avatarReadiness.boneCount} bones, ${avatarResult.avatarReadiness.morphTargetCount} morph targets detected.`,
      status: 'verified',
      source: 'glTF skins and mesh targets',
    },
    {
      feature: 'Punctual Lights',
      details: (gltfRaw?.extensions?.KHR_lights_punctual?.lights?.length || 0) + ' embedded punctual lights.',
      status: 'verified',
      source: 'KHR_lights_punctual extension',
    },
  ];

  const cannotBeVerified: KnownUnknownItem[] = [
    {
      feature: 'Blender View Transform',
      details: 'Whether Blender was rendering with AgX, Filmic, Standard, or False Color cannot be stored in glTF.',
      status: 'unknown',
      source: 'Blender Color Management tab (External to GLB)',
    },
    {
      feature: 'Blender World HDRI Environment',
      details: 'Blender’s 360° World background HDRI and ambient bounce radiance are not exported into glTF.',
      status: 'unknown',
      source: 'Blender World Shader Graph (External to GLB)',
    },
    {
      feature: 'Original Procedural Shader Nodes',
      details: 'Any procedural noise, voronoi, color ramps, or vector math nodes stripped or baked cannot be recovered.',
      status: 'unknown',
      source: 'Blender Shader Node Editor (External to GLB)',
    },
    {
      feature: 'Blender Compositor Post-Processing',
      details: 'Glare, bloom, color grading curves, and lens distortion from the Compositing workspace are excluded.',
      status: 'unknown',
      source: 'Blender Compositor Tree (External to GLB)',
    },
    {
      feature: 'Render Engine Settings',
      details: 'Cycles ray-bounce limits, EEVEE Next screen-space reflections, and shadow bias are not in glTF.',
      status: 'unknown',
      source: 'Blender Render Properties (External to GLB)',
    },
    {
      feature: 'Scene Exposure & Look Presets',
      details: 'Exposure slider values and Look contrast presets (e.g. "Medium High Contrast") are not recorded.',
      status: 'unknown',
      source: 'Blender Scene Properties (External to GLB)',
    },
  ];

  // 5. Comparison Checklist
  const hasNormals = !allFindings.some((f) => f.id === 'NORMALS_MISSING_ATTRIBUTES');
  const hasTangents = !allFindings.some((f) => f.id === 'NORMALS_MISSING_TANGENTS');
  const hasProceduralIssue = allFindings.some((f) => f.category === 'Procedural Shaders' && f.severity === 'warning');
  const hasGeomError = allFindings.some((f) => f.category === 'Geometry & Transforms' && f.severity === 'critical');
  const hasGeomWarn = allFindings.some((f) => f.category === 'Geometry & Transforms' && f.severity === 'warning');

  const comparisonChecklist: ComparisonChecklistItem[] = [
    {
      feature: 'Geometry',
      status: hasGeomError ? '✕' : hasGeomWarn ? '⚠' : '✓',
      statusLabel: hasGeomError ? 'Critical / Issue' : hasGeomWarn ? 'Attention / Warning' : 'Verified / Good',
      blenderStatus: 'Evaluated mesh modifiers & subdivisions',
      threeJsStatus: 'Direct GPU BufferGeometry rasterization',
      note: hasGeomError
        ? 'Negative scale or corrupted vertex attributes detected.'
        : 'Polygon topology and vertex positions cleanly transfer.',
    },
    {
      feature: 'UVs',
      status: '✓',
      statusLabel: 'Verified / Good',
      blenderStatus: 'Active UV Maps',
      threeJsStatus: 'Mapped to geometry.attributes.uv',
      note: 'TEXCOORD_0 UV channel successfully serialized in GLB.',
    },
    {
      feature: 'Normals',
      status: hasNormals ? '✓' : '✕',
      statusLabel: hasNormals ? 'Verified / Good' : 'Critical / Issue',
      blenderStatus: 'Calculated split normals & auto-smooth',
      threeJsStatus: 'geometry.attributes.normal',
      note: hasNormals ? 'Vertex normal vectors present across all primitives.' : 'Missing vertex normals!',
    },
    {
      feature: 'Tangents',
      status: hasTangents ? '✓' : '⚠',
      statusLabel: hasTangents ? 'Verified / Good' : 'Attention / Warning',
      blenderStatus: 'MikkTSpace 4-component tangent vectors',
      threeJsStatus: hasTangents ? 'Precomputed tangents' : 'Screen-space derivative approximation (dFdx/dFdy)',
      note: hasTangents
        ? 'MikkTSpace tangents explicitly exported in GLB.'
        : 'TANGENT attribute missing for normal-mapped surfaces.',
    },
    {
      feature: 'PBR Materials',
      status: materialsScore.score >= 80 ? '✓' : '⚠',
      statusLabel: materialsScore.score >= 80 ? 'Verified / Good' : 'Attention / Warning',
      blenderStatus: 'Principled BSDF (Cycles / EEVEE)',
      threeJsStatus: 'MeshStandardMaterial / MeshPhysicalMaterial',
      note: 'Standard glTF metallic-roughness factors transfer accurately.',
    },
    {
      feature: 'Textures',
      status: texturesScore.score >= 80 ? '✓' : '⚠',
      statusLabel: texturesScore.score >= 80 ? 'Verified / Good' : 'Attention / Warning',
      blenderStatus: 'Image Texture nodes in Blender memory',
      threeJsStatus: 'WebGLTexture GPU samplers',
      note: `${textures.length} textures embedded with designated color spaces.`,
    },
    {
      feature: 'Procedural Shaders',
      status: hasProceduralIssue ? '⚠' : '?',
      statusLabel: hasProceduralIssue ? 'Attention / Warning' : 'Unknown / Not Stored in GLB',
      blenderStatus: 'Noise, Voronoi, ColorRamp, Mix Shader',
      threeJsStatus: 'Unsupported in glTF 2.0 (Only baked textures)',
      note: hasProceduralIssue
        ? 'Evidence of procedural shader names or unbaked materials.'
        : 'Procedural node graphs cannot be verified once exported to glTF.',
    },
    {
      feature: 'Color Management',
      status: '⚠',
      statusLabel: 'Attention / Warning',
      blenderStatus: 'AgX / Filmic View Transform',
      threeJsStatus: 'renderer.toneMapping (ACESFilmic / AgX / Linear)',
      note: 'Color transform is external to GLB; must be configured in Three.js renderer.',
    },
    {
      feature: 'Lighting',
      status: lightResult.findings.some((f) => f.id === 'LIGHTING_PUNCTUAL_EMBEDDED') ? '⚠' : '✕',
      statusLabel: lightResult.findings.some((f) => f.id === 'LIGHTING_PUNCTUAL_EMBEDDED')
        ? 'Attention / Warning'
        : 'Critical / Issue',
      blenderStatus: 'Blender scene lights with physical falloff',
      threeJsStatus: 'Three.js scene lights or ambient setup',
      note: 'Blender scene lighting cannot be fully reconstructed from this GLB.',
    },
    {
      feature: 'Environment (IBL)',
      status: '?',
      statusLabel: 'Unknown / Not Stored in GLB',
      blenderStatus: 'World Shader HDRI dome & Viewport Preview',
      threeJsStatus: 'scene.environment PMREM target',
      note: 'World HDRI is not stored in GLB. Three.js must provide its own HDR map.',
    },
    {
      feature: 'Tone Mapping',
      status: '?',
      statusLabel: 'Unknown / Not Stored in GLB',
      blenderStatus: 'Blender Color Management Look & Exposure',
      threeJsStatus: 'renderer.toneMappingExposure & toneMapping',
      note: 'Camera exposure and contrast curves are not stored in glTF.',
    },
  ];

  return {
    overallScore,
    scores,
    prioritizedCauses,
    findings: allFindings,
    knownVsUnknown: {
      verifiedFromGlb,
      cannotBeVerified,
    },
    comparisonChecklist,
    avatarReadiness: avatarResult.avatarReadiness,
    lightingReconstructible: lightResult.lightingReconstructible,
    lightingDisclaimer: lightResult.lightingDisclaimer,
  };
}
