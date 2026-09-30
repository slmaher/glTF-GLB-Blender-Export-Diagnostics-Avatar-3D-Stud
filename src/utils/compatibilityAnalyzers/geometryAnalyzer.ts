import type { MeshAnalysis, SceneStructure } from '../../types/diagnostic';
import type { CompatibilityFinding, DeductionItem } from '../../types/compatibility';

export function analyzeGeometry(
  meshes: MeshAnalysis[],
  _sceneStructure: SceneStructure,
  gltfRaw: any
): { findings: CompatibilityFinding[]; deductions: DeductionItem[] } {
  const findings: CompatibilityFinding[] = [];
  const deductions: DeductionItem[] = [];

  const rawNodes = gltfRaw?.nodes || [];

  // 1. High Polygon Density for WebGL
  let totalTriangles = 0;
  let totalVertices = 0;
  meshes.forEach((m) => {
    totalTriangles += m.totalTriangles;
    totalVertices += m.totalVertices;
  });

  if (totalTriangles > 250000) {
    findings.push({
      id: 'GEOM_HIGH_POLY_COUNT',
      category: 'Geometry & Transforms',
      severity: 'warning',
      title: `High Triangle Count (${totalTriangles.toLocaleString()} Triangles) May Cause WebGL Frame Drops`,
      affectedItem: `All Meshes (${meshes.length} Meshes, ${totalVertices.toLocaleString()} Vertices)`,
      problem: `Total polygon count (${totalTriangles.toLocaleString()}) exceeds typical mobile/web performance budgets (~100k - 200k).`,
      evidence: `Asset contains ${totalTriangles.toLocaleString()} triangles across ${meshes.length} meshes.`,
      whyItMatters:
        'Blender runs locally with high-performance desktop hardware and handles millions of triangles smoothly. In WebGL, rendering hundreds of thousands of triangles on integrated GPUs or mobile browsers consumes excessive rasterization fill-rate and memory bandwidth, resulting in stuttering and low framerates (< 30 FPS).',
      expectedBlenderBehavior: 'Smooth desktop viewport performance.',
      expectedThreeJsBehavior: 'Potential framerate drops on mobile devices and low-power laptops.',
      recommendedFix:
        'In Blender: Use the Decimate Modifier or Retopology tools to optimize high-density meshes before export, or create LODs (Levels of Detail).',
    });
    deductions.push({
      reason: `High triangle count (${totalTriangles.toLocaleString()} tris) exceeds real-time web budget`,
      points: 8,
    });
  }

  // 2. Unapplied Non-Uniform Node Transforms
  const nonUniformNodes: Array<{ name: string; scale: [number, number, number] }> = [];
  const negativeNodes: Array<{ name: string; scale: [number, number, number] }> = [];

  rawNodes.forEach((node: any, idx: number) => {
    if (node.scale && Array.isArray(node.scale) && node.scale.length === 3) {
      const [sx, sy, sz] = node.scale;
      const isNegative = sx < 0 || sy < 0 || sz < 0;
      const isNonUniform = Math.abs(sx - sy) > 0.001 || Math.abs(sx - sz) > 0.001;

      if (isNegative) {
        negativeNodes.push({ name: node.name || `Node_${idx}`, scale: [sx, sy, sz] });
      } else if (isNonUniform) {
        nonUniformNodes.push({ name: node.name || `Node_${idx}`, scale: [sx, sy, sz] });
      }
    }
  });

  if (negativeNodes.length > 0) {
    const sample = negativeNodes[0];
    findings.push({
      id: 'GEOM_NEGATIVE_SCALE',
      category: 'Geometry & Transforms',
      severity: 'critical',
      title: `Negative Scale Transform Inverts Polygon Winding Order (${negativeNodes.length} Nodes)`,
      affectedItem: `Node "${sample.name}" (Scale: [${sample.scale.join(', ')}])`,
      problem: `Node has negative scale component, causing inverted face normals.`,
      evidence: `Scale: [${sample.scale.join(', ')}] on node "${sample.name}".`,
      whyItMatters:
        'Negative scale inverts the vertex winding order (Counter-Clockwise becomes Clockwise). With standard Three.js backface culling enabled, this causes the exterior surfaces to become invisible backfaces while the inside of the mesh is rendered instead, making the model look inside-out or inverted.',
      expectedBlenderBehavior:
        'Blender may display normals properly if "Two Sided" or object-level matrix inversion is active.',
      expectedThreeJsBehavior:
        'Model surfaces appear inverted, hollow, or render with inside-out lighting.',
      recommendedFix:
        'In Blender: Select object in Object Mode, press Ctrl+A > "Apply All Transforms" (specifically Scale), then enter Edit Mode and press Shift+N to Recalculate Normals Outside.',
    });
    deductions.push({
      reason: `${negativeNodes.length} nodes have negative scale values (inverts polygon winding)`,
      points: 15,
    });
  }

  if (nonUniformNodes.length > 0) {
    const sample = nonUniformNodes[0];
    findings.push({
      id: 'GEOM_NON_UNIFORM_SCALE',
      category: 'Geometry & Transforms',
      severity: 'warning',
      title: `Unapplied Non-Uniform Scale Transforms (${nonUniformNodes.length} Nodes)`,
      affectedItem: `Node "${sample.name}" (Scale: [${sample.scale.join(', ')}])`,
      problem: `Nodes have non-uniform scaling ([${sample.scale.map((v) => v.toFixed(2)).join(', ')}]).`,
      evidence: `Node "${sample.name}" has scale [${sample.scale.map((v) => v.toFixed(2)).join(', ')}].`,
      whyItMatters:
        'Non-uniform scaling stretches the local space of the mesh. While Three.js calculates normal matrices via inverse-transpose, non-uniform scaling can distort tangent vectors, stretch normal map bumps unequally across axes, and skew light reflection vectors compared to Blender’s evaluated mesh.',
      expectedBlenderBehavior:
        'Mesh looks evaluated as modified by object transform.',
      expectedThreeJsBehavior:
        'Potential anisotropic distortion in normal maps and lighting highlights.',
      recommendedFix:
        'In Blender: Select the object in Object Mode and press Ctrl+A > "Apply Scale" before exporting.',
    });
    deductions.push({
      reason: `${nonUniformNodes.length} nodes have unapplied non-uniform scale`,
      points: 6,
    });
  }

  // 3. Multiple UV Sets (TEXCOORD_0, TEXCOORD_1, etc.)
  let maxTexCoords = 0;
  meshes.forEach((mesh) => {
    mesh.primitives.forEach((prim) => {
      let tcCount = 0;
      if (prim.attributes.hasTexCoord0) tcCount++;
      if (prim.attributes.hasTexCoord1) tcCount++;
      // Check custom attributes
      prim.attributes.customAttributes.forEach((attr) => {
        if (attr.startsWith('TEXCOORD_')) tcCount++;
      });
      if (tcCount > maxTexCoords) maxTexCoords = tcCount;
    });
  });

  if (maxTexCoords > 2) {
    findings.push({
      id: 'GEOM_MULTI_UV_LIMIT',
      category: 'Geometry & Transforms',
      severity: 'warning',
      title: `Mesh Uses ${maxTexCoords} UV Sets (Three.js MeshStandardMaterial Limited to 2)`,
      affectedItem: 'Texture Coordinate Channels',
      problem: `Geometry defines ${maxTexCoords} distinct UV coordinate streams (TEXCOORD_0 through TEXCOORD_${maxTexCoords - 1}).`,
      evidence: `Max UV channels detected on primitive: ${maxTexCoords}.`,
      whyItMatters:
        'Standard Three.js materials (MeshStandardMaterial) natively support uv (TEXCOORD_0) for diffuse/normal/roughness and uv1 (TEXCOORD_1) for ambient occlusion or lightmaps. Additional UV sets (TEXCOORD_2, etc.) are ignored unless a custom ShaderMaterial or NodeMaterial is implemented.',
      expectedBlenderBehavior:
        'In Blender Shader Editor, UV Map nodes can route any arbitrary UV map to any texture node.',
      expectedThreeJsBehavior:
        'Textures mapped to UV sets beyond channel 1 will fail to sample properly.',
      recommendedFix:
        'Consolidate textures to use at most 2 UV sets in Blender or bake multiple texture channels into a single unified UV layout.',
    });
    deductions.push({
      reason: `Geometry uses ${maxTexCoords} UV sets, exceeding Three.js standard material support`,
      points: 6,
    });
  }

  return { findings, deductions };
}
