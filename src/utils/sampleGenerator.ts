import { Document, WebIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

// Minimal 2x2 PNG for synthetic textures
const SAMPLE_PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x02, 0x08, 0x06, 0x00, 0x00, 0x00, 0x72, 0xb6, 0x0d,
  0x24, 0x00, 0x00, 0x00, 0x13, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0xf8, 0xcf, 0xc0, 0xf0,
  0x1f, 0x0c, 0x19, 0x18, 0xfe, 0x83, 0x01, 0x00, 0x49, 0xc8, 0x09, 0xf7, 0x14, 0x63, 0x32, 0x9d,
  0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

export async function createProblematicBlenderSample(): Promise<File> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene('Blender_Export_Sample');

  // Material with typical Blender export problems:
  // 1. AlphaMode = 'BLEND' (sorting glitches)
  // 2. Metallic = 1.0 (black in standard viewers without HDRI)
  // 3. Normal Map attached, but mesh primitive lacks TANGENT attributes
  // 4. Missing TEXCOORD_0 for diffuse
  const mat = doc
    .createMaterial('Blender_Troublesome_Material')
    .setAlphaMode('BLEND')
    .setMetallicFactor(0.95)
    .setRoughnessFactor(0.08)
    .setBaseColorFactor([0.9, 0.2, 0.2, 1.0])
    .setEmissiveFactor([1.0, 0.5, 0.0]); // Emissive without KHR_materials_emissive_strength

  const normalTex = doc
    .createTexture('NormalMap_MikkTSpace')
    .setImage(SAMPLE_PNG_BYTES)
    .setMimeType('image/png');
  mat.setNormalTexture(normalTex);

  const baseTex = doc
    .createTexture('BaseColor_Diffuse')
    .setImage(SAMPLE_PNG_BYTES)
    .setMimeType('image/png');
  mat.setBaseColorTexture(baseTex);

  // Quad geometry: POSITION & NORMAL provided, but TANGENT and UV (TEXCOORD_0) are intentionally missing!
  const positions = new Float32Array([
    -1, -1, 0,
     1, -1, 0,
     1,  1, 0,
    -1, -1, 0,
     1,  1, 0,
    -1,  1, 0,
  ]);
  const normals = new Float32Array([
    0, 0, 1,
    0, 0, 1,
    0, 0, 1,
    0, 0, 1,
    0, 0, 1,
    0, 0, 1,
  ]);

  const prim = doc
    .createPrimitive()
    .setMaterial(mat)
    .setAttribute('POSITION', doc.createAccessor('POS').setType('VEC3').setArray(positions).setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor('NORM').setType('VEC3').setArray(normals).setBuffer(buffer));
    // TANGENT and TEXCOORD_0 intentionally omitted to trigger exact Blender diagnostic detection!

  const mesh = doc.createMesh('Hero_Shield_Mesh').addPrimitive(prim);

  // Node with non-uniform scale and negative scale
  const node = doc
    .createNode('Mirrored_Shield_Node')
    .setMesh(mesh)
    .setScale([1.0, -1.0, 1.5]); // Negative scale triggers inverted culling!
  scene.addChild(node);

  const io = new WebIO().registerExtensions(ALL_EXTENSIONS);
  const glbBytes = await io.writeBinary(doc);

  return new File([glbBytes as unknown as BlobPart], 'sample_blender_with_issues.glb', {
    type: 'model/gltf-binary',
  });
}

export async function createCleanAssetSample(): Promise<File> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene('Clean_Production_Scene');

  const mat = doc
    .createMaterial('PBR_Clean_Metal')
    .setAlphaMode('OPAQUE')
    .setMetallicFactor(0.2)
    .setRoughnessFactor(0.4)
    .setBaseColorFactor([0.3, 0.7, 0.9, 1.0]);

  const baseTex = doc
    .createTexture('Tile_BaseColor')
    .setImage(SAMPLE_PNG_BYTES)
    .setMimeType('image/png');
  mat.setBaseColorTexture(baseTex);

  const normalTex = doc
    .createTexture('Tile_Normal')
    .setImage(SAMPLE_PNG_BYTES)
    .setMimeType('image/png');
  mat.setNormalTexture(normalTex);

  const positions = new Float32Array([
    -1, -1, 0,
     1, -1, 0,
     1,  1, 0,
    -1, -1, 0,
     1,  1, 0,
    -1,  1, 0,
  ]);
  const normals = new Float32Array([
    0, 0, 1,
    0, 0, 1,
    0, 0, 1,
    0, 0, 1,
    0, 0, 1,
    0, 0, 1,
  ]);
  const tangents = new Float32Array([
    1, 0, 0, 1,
    1, 0, 0, 1,
    1, 0, 0, 1,
    1, 0, 0, 1,
    1, 0, 0, 1,
    1, 0, 0, 1,
  ]);
  const uvs = new Float32Array([
    0, 0,
    1, 0,
    1, 1,
    0, 0,
    1, 1,
    0, 1,
  ]);

  const prim = doc
    .createPrimitive()
    .setMaterial(mat)
    .setAttribute('POSITION', doc.createAccessor('POS').setType('VEC3').setArray(positions).setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor('NORM').setType('VEC3').setArray(normals).setBuffer(buffer))
    .setAttribute('TANGENT', doc.createAccessor('TAN').setType('VEC4').setArray(tangents).setBuffer(buffer))
    .setAttribute('TEXCOORD_0', doc.createAccessor('UV0').setType('VEC2').setArray(uvs).setBuffer(buffer));

  const mesh = doc.createMesh('Clean_Tile_Mesh').addPrimitive(prim);
  const node = doc.createNode('Tile_Node').setMesh(mesh).setScale([1, 1, 1]);
  scene.addChild(node);

  const io = new WebIO().registerExtensions(ALL_EXTENSIONS);
  const glbBytes = await io.writeBinary(doc);

  return new File([glbBytes as unknown as BlobPart], 'clean_model_production.glb', {
    type: 'model/gltf-binary',
  });
}

export async function createAvatarBlenderSample(): Promise<File> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene('Avatar_Scene');

  const mat = doc
    .createMaterial('Avatar_Skin_Material')
    .setAlphaMode('OPAQUE')
    .setMetallicFactor(0.0)
    .setRoughnessFactor(0.65)
    .setBaseColorFactor([0.9, 0.75, 0.65, 1.0]);

  const positions = new Float32Array([
    -0.5, 0, 0,
     0.5, 0, 0,
     0.5, 1.8, 0,
    -0.5, 0, 0,
     0.5, 1.8, 0,
    -0.5, 1.8, 0,
  ]);
  const normals = new Float32Array([
    0, 0, 1,
    0, 0, 1,
    0, 0, 1,
    0, 0, 1,
    0, 0, 1,
    0, 0, 1,
  ]);
  const uvs = new Float32Array([
    0, 0, 1, 0, 1, 1,
    0, 0, 1, 1, 0, 1,
  ]);
  const joints = new Uint16Array([
    0, 1, 0, 0,
    0, 1, 0, 0,
    1, 2, 0, 0,
    0, 1, 0, 0,
    1, 2, 0, 0,
    1, 2, 0, 0,
  ]);
  const weights = new Float32Array([
    0.8, 0.2, 0, 0,
    0.8, 0.2, 0, 0,
    0.3, 0.7, 0, 0,
    0.8, 0.2, 0, 0,
    0.3, 0.7, 0, 0,
    0.3, 0.7, 0, 0,
  ]);

  const morphPos1 = new Float32Array(positions);
  const morphPos2 = new Float32Array(positions);

  const prim = doc
    .createPrimitive()
    .setMaterial(mat)
    .setAttribute('POSITION', doc.createAccessor('POS').setType('VEC3').setArray(positions).setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor('NORM').setType('VEC3').setArray(normals).setBuffer(buffer))
    .setAttribute('TEXCOORD_0', doc.createAccessor('UV0').setType('VEC2').setArray(uvs).setBuffer(buffer))
    .setAttribute('JOINTS_0', doc.createAccessor('JOINTS0').setType('VEC4').setArray(joints).setBuffer(buffer))
    .setAttribute('WEIGHTS_0', doc.createAccessor('WEIGHTS0').setType('VEC4').setArray(weights).setBuffer(buffer));

  const target1 = doc.createPrimitiveTarget()
    .setAttribute('POSITION', doc.createAccessor('MORPH1').setType('VEC3').setArray(morphPos1).setBuffer(buffer));
  const target2 = doc.createPrimitiveTarget()
    .setAttribute('POSITION', doc.createAccessor('MORPH2').setType('VEC3').setArray(morphPos2).setBuffer(buffer));

  prim.addTarget(target1);
  prim.addTarget(target2);

  const mesh = doc.createMesh('Avatar_Character_Mesh')
    .addPrimitive(prim)
    .setExtras({ targetNames: ['jawOpen', 'eyeBlinkLeft', 'eyeBlinkRight', 'mouthSmileLeft'] });

  const rootNode = doc.createNode('Hips');
  const spineNode = doc.createNode('Spine');
  const headNode = doc.createNode('Head');
  rootNode.addChild(spineNode);
  spineNode.addChild(headNode);

  const skin = doc.createSkin('Avatar_Armature')
    .addJoint(rootNode)
    .addJoint(spineNode)
    .addJoint(headNode);

  const charNode = doc.createNode('Character_Node')
    .setMesh(mesh)
    .setSkin(skin);

  scene.addChild(rootNode);
  scene.addChild(charNode);

  const io = new WebIO().registerExtensions(ALL_EXTENSIONS);
  const glbBytes = await io.writeBinary(doc);

  return new File([glbBytes as unknown as BlobPart], 'avatar_character_rigged.glb', {
    type: 'model/gltf-binary',
  });
}

