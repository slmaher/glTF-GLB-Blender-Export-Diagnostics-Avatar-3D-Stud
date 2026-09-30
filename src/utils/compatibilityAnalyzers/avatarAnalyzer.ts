import type { MeshAnalysis } from '../../types/diagnostic';
import type {
  AvatarReadinessAnalysis,
  BlendshapeDetail,
  CompatibilityFinding,
  DeductionItem,
} from '../../types/compatibility';

const ARKIT_STANDARD_BLENDSHAPES = new Set([
  'eyeblinkleft',
  'eyeblinkright',
  'eyelookdownleft',
  'eyelookdownright',
  'eyelookinleft',
  'eyelookinright',
  'eyelookoutleft',
  'eyelookoutright',
  'eyelookupleft',
  'eyelookupright',
  'eyesquintleft',
  'eyesquintright',
  'eyewideleft',
  'eyewideright',
  'jawforward',
  'jawleft',
  'jawopen',
  'jawright',
  'mouthclose',
  'mouthdimpleleft',
  'mouthdimpleright',
  'mouthfrownleft',
  'mouthfrownright',
  'mouthfunnel',
  'mouthleft',
  'mouthlowerdownleft',
  'mouthlowerdownright',
  'mouthpressleft',
  'mouthpressright',
  'mouthpucker',
  'mouthright',
  'mouthrolllower',
  'mouthrollupper',
  'mouthshruglower',
  'mouthshrugupper',
  'mouthsmileleft',
  'mouthsmileright',
  'mouthstretchleft',
  'mouthstretchright',
  'mouthupperupleft',
  'mouthupperupright',
  'browdownleft',
  'browdownright',
  'browinnerup',
  'browouterupleft',
  'browouterupright',
  'cheekpuff',
  'cheeksquintleft',
  'cheeksquintright',
  'nosesneerleft',
  'nosesneerright',
  'tongueout',
]);

function categorizeBlendshape(name: string): BlendshapeDetail['category'] {
  const lower = name.toLowerCase();
  if (lower.startsWith('viseme_')) return 'viseme';
  if (lower.includes('eye')) return 'eye';
  if (lower.includes('jaw')) return 'jaw';
  if (lower.includes('mouth') || lower.includes('lip') || lower.includes('smile')) return 'mouth';
  if (lower.includes('brow')) return 'brow';
  if (lower.includes('cheek')) return 'cheek';
  if (lower.includes('nose')) return 'nose';
  return 'other';
}

export function analyzeAvatarReadiness(
  meshes: MeshAnalysis[],
  gltfRaw: any
): {
  avatarReadiness: AvatarReadinessAnalysis;
  findings: CompatibilityFinding[];
  deductions: DeductionItem[];
} {
  const findings: CompatibilityFinding[] = [];
  const deductions: DeductionItem[] = [];

  const rawSkins = gltfRaw?.skins || [];
  const rawMeshes = gltfRaw?.meshes || [];
  const rawNodes = gltfRaw?.nodes || [];

  let boneCount = 0;
  let rootJointName: string | undefined;

  if (rawSkins.length > 0) {
    const skin0 = rawSkins[0];
    if (Array.isArray(skin0.joints)) {
      boneCount = skin0.joints.length;
      if (skin0.skeleton !== undefined && rawNodes[skin0.skeleton]) {
        rootJointName = rawNodes[skin0.skeleton].name;
      } else if (skin0.joints[0] !== undefined && rawNodes[skin0.joints[0]]) {
        rootJointName = rawNodes[skin0.joints[0]].name;
      }
    }
  }

  // Check joint count per vertex (JOINTS_0 vs JOINTS_1)
  let maxJointsPerVertex = 0;
  let hasSkinning = false;
  meshes.forEach((m) => {
    m.primitives.forEach((p) => {
      if (p.attributes.hasJoints0) {
        hasSkinning = true;
        maxJointsPerVertex = Math.max(maxJointsPerVertex, 4);
      }
      if (p.attributes.customAttributes.includes('JOINTS_1')) {
        maxJointsPerVertex = Math.max(maxJointsPerVertex, 8);
      }
    });
  });

  // Extract Morph Targets and Target Names
  const morphTargetNames: string[] = [];
  const blendshapeDetails: BlendshapeDetail[] = [];
  let hasMorphTargets = false;

  rawMeshes.forEach((rm: any) => {
    const names = rm.extras?.targetNames || rm.targetNames || [];
    if (Array.isArray(names) && names.length > 0) {
      names.forEach((n: string) => {
        if (!morphTargetNames.includes(n)) {
          morphTargetNames.push(n);
        }
      });
    }

    if (rm.primitives) {
      rm.primitives.forEach((p: any) => {
        if (p.targets && Array.isArray(p.targets) && p.targets.length > 0) {
          hasMorphTargets = true;
          // If names weren't explicitly provided, assign fallback
          if (morphTargetNames.length === 0) {
            for (let i = 0; i < p.targets.length; i++) {
              const fallbackName = `Target_${i}`;
              if (!morphTargetNames.includes(fallbackName)) {
                morphTargetNames.push(fallbackName);
              }
            }
          }
        }
      });
    }
  });

  // Analyze blendshapes
  let arkitStandardCount = 0;
  let hasJawControl = false;
  let hasEyeBlinkOrGaze = false;

  morphTargetNames.forEach((name, index) => {
    const lower = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const isARKit = ARKIT_STANDARD_BLENDSHAPES.has(lower);
    if (isARKit) arkitStandardCount++;

    const cat = categorizeBlendshape(name);
    if (cat === 'jaw' || lower.includes('jaw')) hasJawControl = true;
    if (cat === 'eye' || lower.includes('blink') || lower.includes('look')) hasEyeBlinkOrGaze = true;

    blendshapeDetails.push({
      index,
      name,
      isARKitStandard: isARKit,
      category: cat,
    });
  });

  // Also check bones for jaw/eye controls if not in blendshapes
  if (!hasJawControl && rawNodes.length > 0) {
    hasJawControl = rawNodes.some((n: any) =>
      typeof n.name === 'string' && /(jaw|mandible)/i.test(n.name)
    );
  }
  if (!hasEyeBlinkOrGaze && rawNodes.length > 0) {
    hasEyeBlinkOrGaze = rawNodes.some((n: any) =>
      typeof n.name === 'string' && /(eye|pupil)/i.test(n.name)
    );
  }

  // Determine if this model is an avatar/character
  const isAvatar = hasSkinning || morphTargetNames.length > 0 || boneCount > 0;

  const recommendations: string[] = [];

  let suitabilityStatus: AvatarReadinessAnalysis['suitabilityStatus'] = 'Not an Avatar / Incomplete';
  let isWebAnimationReady = false;

  if (isAvatar) {
    if (boneCount > 0 && boneCount <= 120 && maxJointsPerVertex <= 4) {
      if (arkitStandardCount >= 40) {
        suitabilityStatus = 'Optimal';
        isWebAnimationReady = true;
        recommendations.push(
          'Excellent character asset: Complete ARKit 52 facial blendshape setup with optimal bone count for real-time web animation.'
        );
      } else if (morphTargetNames.length > 0 || hasSkinning) {
        suitabilityStatus = 'Compatible';
        isWebAnimationReady = true;
        recommendations.push(
          `Skinned rig with ${boneCount} bones ready for skeletal animation in Three.js.`
        );
      }
    } else if (boneCount > 150) {
      suitabilityStatus = 'Needs Attention';
      recommendations.push(
        `High bone count (${boneCount} bones). May exceed GPU vertex shader uniform vector limits on mobile WebGL.`
      );
    } else if (maxJointsPerVertex > 4) {
      suitabilityStatus = 'Needs Attention';
      recommendations.push(
        'Uses more than 4 joint influences per vertex (JOINTS_1). Requires Three.js SkinWeight extension or bone weight reduction to 4 influences.'
      );
    } else {
      suitabilityStatus = 'Compatible';
      isWebAnimationReady = true;
    }

    // Avatar Findings
    if (maxJointsPerVertex > 4) {
      findings.push({
        id: 'AVATAR_JOINT_WEIGHT_LIMIT',
        category: 'Skinning & Avatar',
        severity: 'warning',
        title: `More Than 4 Joint Weights Per Vertex (${maxJointsPerVertex} Influences)`,
        affectedItem: 'Skinned Mesh Primitives',
        problem: `Primitive specifies JOINTS_1 and WEIGHTS_1 attributes.`,
        evidence: `Vertices are bound to up to ${maxJointsPerVertex} bones simultaneously.`,
        whyItMatters:
          'Blender allows unlimited bone weight influences per vertex. Standard WebGL vertex shaders in Three.js optimize skinning calculations for exactly 4 bone influences per vertex (vec4 skinIndex and skinWeight). Utilizing 8 bone influences doubles vertex attribute bandwidth and can fail on mobile GPUs unless custom multi-pass skinning shaders are used.',
        expectedBlenderBehavior: 'Smooth skeletal deformation across 8+ bones.',
        expectedThreeJsBehavior:
          'Skinning weights may be truncated to the top 4 joints or require custom shader compilation.',
        recommendedFix:
          'In Blender: In Weight Paint mode, select Weights > Limit Total, and set "Limit" to 4. Then choose Weights > Normalize All before exporting.',
      });
      deductions.push({
        reason: 'Character mesh uses more than 4 bone influences per vertex (JOINTS_1)',
        points: 8,
      });
    }

    if (boneCount > 160) {
      findings.push({
        id: 'AVATAR_HIGH_BONE_COUNT',
        category: 'Skinning & Avatar',
        severity: 'warning',
        title: `High Skeleton Bone Count (${boneCount} Bones)`,
        affectedItem: `Skeleton "${rootJointName || 'Armature'}" (${boneCount} bones)`,
        problem: `Skeleton joint count (${boneCount}) is relatively high for real-time WebGL.`,
        evidence: `Skin defines ${boneCount} joints in glTF skin accessor.`,
        whyItMatters:
          'In WebGL, bone transformation matrices are typically uploaded to a floating-point DataTexture or uniform buffer. Skeletons exceeding 150-200 bones can lead to uniform buffer overflow or CPU-to-GPU bone matrix synchronization bottlenecks on 60 FPS mobile devices.',
        expectedBlenderBehavior: 'Blender CPU/GPU viewport handles dense rigs effortlessly.',
        expectedThreeJsBehavior: 'Potential animation evaluation overhead on low-end devices.',
        recommendedFix:
          'In Blender: Strip non-deforming control bones, helper IK chains, and widget bones by unchecking non-deform bones during glTF export.',
      });
      deductions.push({
        reason: `High skeleton bone count (${boneCount} bones) for real-time WebGL`,
        points: 5,
      });
    }

    if (morphTargetNames.length > 0 && !hasJawControl) {
      findings.push({
        id: 'AVATAR_MISSING_JAW',
        category: 'Skinning & Avatar',
        severity: 'info',
        title: 'Facial Blendshapes Detected But Jaw Control (jawOpen) is Missing',
        affectedItem: 'Facial Blendshapes',
        problem: 'Model has morph targets but lacks a dedicated jaw opening morph target or bone.',
        evidence: `Found ${morphTargetNames.length} morph targets, but none matched jawOpen / jaw control.`,
        whyItMatters:
          'Interactive speech lip-sync, visemes, and AR facial tracking (Apple ARKit / WebXR) require vertical jaw movement for realistic talking animations.',
        expectedBlenderBehavior: 'Manual animator keyframing.',
        expectedThreeJsBehavior: 'Speech and lip-sync avatars will appear with stationary teeth/jaw.',
        recommendedFix:
          'Add a "jawOpen" blendshape or skin the lower jaw to a jaw bone for lip-sync support.',
      });
    }
  }

  const avatarReadiness: AvatarReadinessAnalysis = {
    isAvatar,
    hasSkinning,
    boneCount,
    rootJointName,
    skinsCount: rawSkins.length,
    maxJointsPerVertex,
    hasMorphTargets,
    morphTargetCount: morphTargetNames.length,
    morphTargetNames,
    blendshapeDetails,
    arkitStandardCount,
    hasJawControl,
    hasEyeBlinkOrGaze,
    isWebAnimationReady,
    suitabilityStatus,
    recommendations,
  };

  return { avatarReadiness, findings, deductions };
}
