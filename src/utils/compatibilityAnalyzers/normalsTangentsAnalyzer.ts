import type { MeshAnalysis, MaterialAnalysis } from '../../types/diagnostic';
import type { CompatibilityFinding, DeductionItem } from '../../types/compatibility';

export function analyzeNormalsAndTangents(
  meshes: MeshAnalysis[],
  materials: MaterialAnalysis[],
  _gltfRaw: any
): { findings: CompatibilityFinding[]; deductions: DeductionItem[] } {
  const findings: CompatibilityFinding[] = [];
  const deductions: DeductionItem[] = [];

  const matMap = new Map<number, MaterialAnalysis>();
  materials.forEach((m) => matMap.set(m.index, m));

  const missingTangentMeshes: Array<{
    meshName: string;
    meshIndex: number;
    primIndex: number;
    matName: string;
    hasUv0: boolean;
    hasSkinning: boolean;
  }> = [];

  const missingNormalMeshes: Array<{
    meshName: string;
    meshIndex: number;
    primIndex: number;
  }> = [];

  meshes.forEach((mesh) => {
    mesh.primitives.forEach((prim) => {
      // 1. Missing NORMAL attribute
      if (!prim.attributes.hasNormal) {
        missingNormalMeshes.push({
          meshName: mesh.name,
          meshIndex: mesh.index,
          primIndex: prim.primitiveIndex,
        });
      }

      // 2. Normal Map used without TANGENT attribute
      if (prim.materialIndex !== undefined) {
        const mat = matMap.get(prim.materialIndex);
        if (mat && mat.normalTexture && !prim.attributes.hasTangent) {
          missingTangentMeshes.push({
            meshName: mesh.name,
            meshIndex: mesh.index,
            primIndex: prim.primitiveIndex,
            matName: mat.name,
            hasUv0: prim.attributes.hasTexCoord0,
            hasSkinning: prim.attributes.hasJoints0,
          });
        }
      }
    });
  });

  // Report Missing Tangents
  if (missingTangentMeshes.length > 0) {
    const sample = missingTangentMeshes[0];
    const uniqueMeshes = Array.from(new Set(missingTangentMeshes.map((m) => m.meshName))).slice(0, 5);

    findings.push({
      id: 'NORMALS_MISSING_TANGENTS',
      category: 'Normals & Tangents',
      severity: 'warning',
      title: `Potential Rendering Difference: Normal Map Primitives without TANGENT (${missingTangentMeshes.length} Primitives)`,
      affectedItem: `Meshes: ${uniqueMeshes.join(', ')}${missingTangentMeshes.length > 5 ? '...' : ''}`,
      problem: `Potential rendering difference: This primitive uses a normal map but does not provide TANGENT. Normal-map appearance may differ depending on the renderer and material setup.`,
      evidence: `Normal Map: Yes | TANGENT: No | UV0: ${sample.hasUv0 ? 'Yes' : 'No'} | Skinning: ${sample.hasSkinning ? 'Yes' : 'No'} (Observed on ${missingTangentMeshes.length} primitive(s) including mesh "${sample.meshName}").`,
      whyItMatters:
        'Normal maps encode fine surface detail relative to tangent space. When vertex TANGENT attributes are omitted from glTF geometry, Three.js approximates tangents at runtime using screen-space partial derivatives (dFdx/dFdy). Normal-map appearance may differ subtly between Blender (MikkTSpace) and WebGL depending on renderer tone mapping and light directions.',
      expectedBlenderBehavior:
        'Evaluated with internal MikkTSpace tangent basis calculation.',
      expectedThreeJsBehavior:
        'Approximated via shader screen-space derivatives unless tangents are generated on the geometry.',
      recommendedFix:
        'In Blender glTF Exporter: Expand "Data > Mesh" and check "Tangents", or compute tangents in Three.js via BufferGeometryUtils.computeMikkTSpaceTangents().',
    });
    deductions.push({
      reason: `${missingTangentMeshes.length} primitives use normal maps without precomputed TANGENT vectors`,
      points: Math.min(10, 4 + missingTangentMeshes.length),
    });
  }

  // Report Missing Normals
  if (missingNormalMeshes.length > 0) {
    const sample = missingNormalMeshes[0];
    findings.push({
      id: 'NORMALS_MISSING_ATTRIBUTES',
      category: 'Normals & Tangents',
      severity: 'critical',
      title: `Missing Vertex NORMAL Attributes (${missingNormalMeshes.length} Primitives)`,
      affectedItem: `Mesh "${sample.meshName}" (primitive ${sample.primIndex})`,
      problem: `Geometry lacks per-vertex NORMAL vectors.`,
      evidence: `NORMAL attribute is undefined in primitive accessor list.`,
      whyItMatters:
        'Without vertex normals, the Three.js shader cannot compute standard Lambertian or GGX specular reflectance. The renderer must either fall back to flat facet normals (flatShading = true) or compute geometric face normals in screen space, stripping all smooth shading from the model.',
      expectedBlenderBehavior:
        'Blender automatically evaluates smoothed normals dynamically in the viewport.',
      expectedThreeJsBehavior: 'Hard-edged low-poly faceted shading on all un-normalized surfaces.',
      recommendedFix:
        'In Blender: Select mesh in Edit Mode, press Shift+N (Recalculate Normals Outside), and re-export with "Normals" checked.',
    });
    deductions.push({
      reason: `${missingNormalMeshes.length} primitives have missing vertex normal vectors`,
      points: 15,
    });
  }

  // Check normal scales
  materials.forEach((mat) => {
    if (mat.normalTexture && mat.normalScale !== 1.0) {
      findings.push({
        id: `NORMAL_SCALE_${mat.index}`,
        category: 'Normals & Tangents',
        severity: 'info',
        title: `Non-Unit Normal Map Scale Factor (${mat.normalScale}) on Material "${mat.name}"`,
        affectedItem: `Material "${mat.name}"`,
        problem: `Normal map scale is set to ${mat.normalScale} instead of default 1.0.`,
        evidence: `normalTexture.scale = ${mat.normalScale}.`,
        whyItMatters:
          'Blender glTF exporter supports normal scale factors. Three.js MeshStandardMaterial normalScale is a Vector2(scale, scale). Verify that intensity scaling matches Blender visual strength.',
        expectedBlenderBehavior: 'Normal map strength scaled according to Normal Map node strength.',
        expectedThreeJsBehavior: 'Three.js applies scale factor to X and Y tangent components.',
        recommendedFix:
          'If bumpiness appears too harsh or subtle in WebGL, adjust the Normal Map node strength slider in Blender before exporting.',
      });
    }
  });

  return { findings, deductions };
}
