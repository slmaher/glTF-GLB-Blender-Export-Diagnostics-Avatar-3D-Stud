export interface ExtensionMeta {
  description: string;
  threeJsSupport: string;
  renderingImpact: string;
  isCompression: boolean;
}

export const EXTENSION_DATABASE: Record<string, ExtensionMeta> = {
  KHR_draco_mesh_compression: {
    description: 'Draco geometry compression reduces mesh file size via lossy or lossless attribute quantization and entropy coding.',
    threeJsSupport: 'Requires THREE.DRACOLoader with WebAssembly/JS decoder workers configured via loader.setDRACOLoader().',
    renderingImpact: 'If Draco decoder is missing, Three.js and glTF viewers will throw an unhandled load error and completely fail to render. Slight vertex quantization may slightly shift vertex positions.',
    isCompression: true,
  },
  EXT_meshopt_compression: {
    description: 'Meshoptimizer compression offers high-speed decompression for vertex and index buffers with WebAssembly/SIMD.',
    threeJsSupport: 'Supported via MeshoptDecoder. Must be attached with loader.setMeshoptDecoder(MeshoptDecoder).',
    renderingImpact: 'Fails to decode geometry if MeshoptDecoder is omitted. Once decoded, renders identically to uncompressed geometry.',
    isCompression: true,
  },
  KHR_texture_basisu: {
    description: 'Basis Universal (KTX2) supercompressed GPU textures (ETC1S / UASTC) that transcode directly to GPU native VRAM formats.',
    threeJsSupport: 'Requires THREE.KTX2Loader with basis transcoder workers configured with loader.setKTX2Loader(ktx2Loader).',
    renderingImpact: 'Will fail to load textures unless KTX2Loader is attached. Textures are decoded into native GPU formats with ultra-low VRAM overhead.',
    isCompression: true,
  },
  KHR_texture_transform: {
    description: 'Applies UV offset, rotation, scale, and custom UV channel to texture coordinates (from Blender Mapping nodes).',
    threeJsSupport: 'Supported natively in Three.js GLTFLoader. Note: Three.js MeshStandardMaterial only supports one shared transform per UV map.',
    renderingImpact: 'If multiple textures on the same material use different UV scale/offsets on the same UV set, Three.js cannot represent differing transforms without custom shaders or physical material separation.',
    isCompression: false,
  },
  KHR_materials_clearcoat: {
    description: 'Adds a clear protective outer coat layer (like car paint or lacquer) over the base PBR material.',
    threeJsSupport: 'Supported natively when Three.js uses MeshPhysicalMaterial (created automatically by GLTFLoader).',
    renderingImpact: 'Adds an extra specular reflection highlight. If viewing in a basic viewer without physical material support, clearcoat sheen will simply be omitted.',
    isCompression: false,
  },
  KHR_materials_transmission: {
    description: 'Simulates optical transmission through thin/thick transparent surfaces (glass, water, colored acrylic).',
    threeJsSupport: 'Supported via MeshPhysicalMaterial.transmission. Requires proper background render target and depth buffer sampling.',
    renderingImpact: 'Without an environment map or scene background, transmission can look completely black or invisible. High visual difference if viewer does not support physical transmission.',
    isCompression: false,
  },
  KHR_materials_volume: {
    description: 'Models light absorption and scattering inside the volume of transmissive materials (glass thickness, colored liquid).',
    threeJsSupport: 'Supported in Three.js MeshPhysicalMaterial (thickness, attenuationColor, attenuationDistance).',
    renderingImpact: 'Works with KHR_materials_transmission. Without volume support, colored glass appears uniform without depth-dependent absorption.',
    isCompression: false,
  },
  KHR_materials_ior: {
    description: 'Controls the Index of Refraction (IOR) for dielectric materials (default is 1.5 for standard plastic/glass).',
    threeJsSupport: 'Supported natively in MeshPhysicalMaterial (ior property).',
    renderingImpact: 'Changes Fresnel reflection falloff and refraction angles. Subtle difference on opaque materials, high difference on transmissive/clearcoat materials.',
    isCompression: false,
  },
  KHR_materials_specular: {
    description: 'Enables custom specular tint and specular reflectance strength for dielectrics (corresponds to Blender Principled BSDF Specular).',
    threeJsSupport: 'Supported natively in Three.js MeshPhysicalMaterial (specularIntensity, specularColor).',
    renderingImpact: 'Allows colored specular reflections on non-metals. When omitted or unsupported, specular defaults to standard 4% dielectric reflection.',
    isCompression: false,
  },
  KHR_materials_sheen: {
    description: 'Simulates micro-fibrous fabric sheen (velvet, cloth, peach fuzz) at grazing angles.',
    threeJsSupport: 'Supported natively in Three.js MeshPhysicalMaterial (sheen, sheenRoughness, sheenColor).',
    renderingImpact: 'Renders soft rim lighting on fabrics. Will look like standard smooth plastic/diffuse if sheen is unsupported.',
    isCompression: false,
  },
  KHR_materials_emissive_strength: {
    description: 'Allows HDR emissive factors greater than 1.0 (vital for Blender bloom, neon lights, and glowing surfaces).',
    threeJsSupport: 'Supported in modern Three.js GLTFLoader (multiplies material.emissive by emissiveStrength).',
    renderingImpact: 'CRITICAL: In standard glTF, emissiveFactor is clamped to [0.0, 1.0]. If high Blender emission is exported without this extension, glow is capped to 1.0 and looks very dim.',
    isCompression: false,
  },
  KHR_materials_unlit: {
    description: 'Shadeless / unlit material that is unaffected by scene lights and shadows (pure flat base color / texture).',
    threeJsSupport: 'Supported natively in Three.js GLTFLoader (maps to MeshBasicMaterial).',
    renderingImpact: 'Surfaces will have no shading, no shadows, and no specular highlights. Useful for UI, cartoon style, or lightmaps.',
    isCompression: false,
  },
  KHR_materials_iridescence: {
    description: 'Simulates thin-film interference producing rainbow color shifts (soap bubbles, beetle wings, oil slicks).',
    threeJsSupport: 'Supported natively in Three.js MeshPhysicalMaterial (iridescence, iridescenceIOR, iridescenceThicknessRange).',
    renderingImpact: 'Subtle angle-dependent color shifts. Missing support falls back to standard specular.',
    isCompression: false,
  },
  KHR_materials_dispersion: {
    description: 'Simulates optical chromatic dispersion (splitting light into rainbow colors through prisms or cut gems).',
    threeJsSupport: 'Supported in latest Three.js MeshPhysicalMaterial (dispersion).',
    renderingImpact: 'Only visible on transmissive objects with refractive bends.',
    isCompression: false,
  },
  KHR_materials_anisotropy: {
    description: 'Simulates anisotropic specular reflections (brushed metal, vinyl records, hair strands).',
    threeJsSupport: 'Supported natively in Three.js MeshPhysicalMaterial (anisotropy, anisotropyRotation).',
    renderingImpact: 'Requires tangent vectors on geometry. Highlights stretch along tangent direction.',
    isCompression: false,
  },
  KHR_lights_punctual: {
    description: 'Defines punctual scene lights (Directional, Point, Spot lights exported from Blender).',
    threeJsSupport: 'Supported natively in Three.js GLTFLoader. Creates THREE.DirectionalLight / PointLight / SpotLight.',
    renderingImpact: 'Light intensities in glTF are in physical photometric units (Lumens / Candela / Lux). In Three.js, physical light units require renderer.useLegacyLights = false.',
    isCompression: false,
  },
  KHR_mesh_quantization: {
    description: 'Allows 16-bit or 8-bit integers for vertex positions, normals, and texture coordinates to save memory without Draco.',
    threeJsSupport: 'Supported natively in Three.js GLTFLoader.',
    renderingImpact: 'Transparently unpacked on GPU. Minor quantization precision limits on giant architectural scales.',
    isCompression: true,
  },
  EXT_texture_webp: {
    description: 'Allows WebP image format for textures inside glTF/GLB.',
    threeJsSupport: 'Supported in all modern browsers (Chrome, Edge, Firefox, Safari 14+).',
    renderingImpact: 'Fast load times and smaller file size. Legacy WebGL environments without WebP will fail.',
    isCompression: true,
  },
  MSFT_lod: {
    description: 'Hierarchical level of detail (LOD) nodes for switching geometry based on distance/screen coverage.',
    threeJsSupport: 'Can be integrated with THREE.LOD, but requires custom loader setup.',
    renderingImpact: 'Only highest or lowest LOD might show if LOD loader handler is not registered.',
    isCompression: false,
  }
};

export function getExtensionDetails(name: string): ExtensionMeta {
  if (EXTENSION_DATABASE[name]) {
    return EXTENSION_DATABASE[name];
  }
  
  if (name.startsWith('KHR_materials_')) {
    return {
      description: `Khronos glTF PBR material extension: ${name}`,
      threeJsSupport: 'Requires Three.js MeshPhysicalMaterial or modern GLTFLoader.',
      renderingImpact: 'Provides advanced physical optical properties. Viewer must support glTF 2.0 PBR Next extensions.',
      isCompression: false,
    };
  }

  return {
    description: `glTF Extension: ${name}`,
    threeJsSupport: 'Compatibility depends on specific loader extension handlers registered.',
    renderingImpact: 'May be ignored or require custom loader plugin if not supported natively.',
    isCompression: name.toLowerCase().includes('compress') || name.toLowerCase().includes('quant'),
  };
}
