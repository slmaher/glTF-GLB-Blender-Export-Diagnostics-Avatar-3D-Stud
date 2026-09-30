# glTF / GLB Blender Export Diagnostics & Avatar 3D Studio

> *"It looked stunning in Blender... why does it look completely broken in Three.js?"*

If you've ever exported a 3D avatar or asset from Blender to glTF/GLB only to find it rendering with dark shadows, strange transparent hair artifacts, missing tangents, or washed-out colors on the web, **this tool was built for you**.

Instead of guessing what went wrong or blindly tweaking Blender export settings, this project provides a **100% in-browser diagnostic lab and interactive 3D studio** that audits your entire asset pipeline from Blender to WebGL.

---

## Why Does This Tool Exist?

Exporting 3D assets from Blender to real-time WebGL engines (like Three.js, Babylon.js, or Model-Viewer) is notoriously tricky:

- **Lighting Differences**: Blender EEVEE and Cycles rely on global illumination, multi-bounce light paths, and world HDRI maps that aren't exported into standard glTF files.
- **Alpha Sorting**: Blender's "Alpha Hashed" transparency doesn't directly map to WebGL's `alphaMode: BLEND`, causing overlapping hair strands and eyelashes to sort unpredictably.
- **Normal Maps & Tangents**: If vertex tangents (`MikkTSpace`) aren't baked during export, Three.js has to generate runtime approximations, resulting in faceted, noisy specular highlights.
- **Color Management & Tone Mapping**: Blender defaults to Filmic or AgX color transforms, while WebGL renderers default to standard sRGB or neutral curves unless explicitly configured.
- **Asset Weight & VRAM**: Heavy 4K textures or uncompressed PNGs inside a GLB can silently exhaust mobile GPU memory and crash browser tabs.

This tool diagnoses these discrepancies with **concrete, verifiable evidence** extracted directly from your binary GLB data and Three.js runtime.

---

## Key Features

### 1. Evidence-Based Pipeline Diagnostics
- **Five-Step Audit Trail**: Traces the asset from `Blender Scene` -> `glTF Export` -> `GLB Binary Data` -> `Three.js GLTFLoader` -> `WebGL Rasterization`.
- **Fact-Based Classification**: Clear distinction between **Confirmed Facts** (verifiable data in the GLB), **Runtime Behaviors** (Three.js WebGL state), and **Blender Differences** (engine divergences).
- **Tangents & Normal Map Check**: Instantly verifies whether primitives contain baked `TANGENT` attributes or rely on runtime approximations.
- **Texture Health & Samplers**: Identifies non-power-of-two (NPOT) textures, uncompressed VRAM-heavy textures, missing textures, and sampler filtering issues.
- **Actionable Blender Fixes**: Every reported finding comes with clear, step-by-step instructions on how to adjust your Blender materials and export settings to fix it.

### 2. Interactive Avatar 3D Studio
- **Flexible Workspaces**:
  - **Embedded View**: Clean, compact 3D viewport that integrates neatly within the diagnostic report.
  - **Studio Mode**: Expanded 840px workspace giving you room for deep scene inspection and appearance adjustments.
  - **Fullscreen**: Clean presentation mode (press `F` or click Fullscreen) for distraction-free reviews.
- **Studio Lighting Rigs**: Switch between curated studio lighting presets (*Neutral Studio*, *Soft Portrait*, *Beauty*, *Dramatic*, *Rim Light*, *Product Studio*) or fine-tune key, fill, rim, and ambient lights individually.
- **Custom Environment & HDRI**: Load your own `.hdr` or `.exr` environment maps directly from your machine with automatic PMREM reflection generation.
- **Tone Mapping Controls**: Toggle between **AgX**, **ACESFilmic**, **Neutral**, and **Linear** tone mapping with real-time exposure adjustment.
- **Parts & Layer Isolation**: Dynamically inspects all meshes in your model, detects semantic avatar components (*Hair*, *Skin*, *Eyes*, *Clothes*, *Accessories*), and provides individual **Show**, **Hide**, and **Solo** buttons.
- **Dynamic Camera Presets**: Instantly frame your model using vertical landmarks (*Full Body*, *Half Body*, *Waist Up*, *Bust*, *Portrait*, *Head*) across multiple presentation angles (*Front*, *3/4 Right*, *3/4 Left*, *Profile*, *Back*).
- **Animation & Pose Controls**: Inspect skeletal hierarchies and blendshapes, scrub animation clips, toggle playback speed, and test humanoid pose presets.
- **Diagnostic A/B Experiments**:
  - **Hair Transparency Experiment**: Toggle live between `alphaMode: BLEND` (standard glTF) and `MASK` (dithered/alpha-test) to observe depth-sorting changes.
  - **Normal Maps A/B**: Toggle normal maps on/off to immediately isolate whether shading issues stem from geometry or tangent-space normal maps.

### 3. 100% Private & In-Browser
- **Zero Server Uploads**: Your 3D models and textures never leave your computer.
- Everything is parsed locally in your browser memory using `@gltf-transform/core` and `Three.js`.
- Fast, secure, and safe for confidential or unreleased client 3D assets.

---

## Getting Started

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed (version 18 or newer recommended).

### Installation
Clone or navigate to the project directory and install the dependencies:

```bash
npm install
```

### Running Locally
Start the Vite development server:

```bash
npm run dev
```

Open your browser and navigate to `http://localhost:5173/`.

### Building for Production
Create an optimized production bundle:

```bash
npm run build
```

The compiled assets will be written to the `dist/` directory.

### Linting & Type Checking
To run the ultra-fast Oxlint linter and TypeScript type checker:

```bash
npx oxlint .
npx tsc -b
```

---

## Tech Stack

- **Framework**: [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Bundler & Dev Server**: [Vite 8](https://vite.dev/)
- **3D Engine**: [Three.js](https://threejs.org/) (WebGL2 renderer, OrbitControls, GLTFLoader, DRACOLoader, RGBELoader, EXRLoader)
- **glTF Inspection**: [@gltf-transform/core](https://gltf-transform.dev/) for binary buffer, accessor, and extension parsing
- **Icons**: [Lucide React](https://lucide.dev/)
- **Linter**: [Oxlint](https://oxc.rs/)

---

## Recommended Blender Export Settings

For the most consistent results between Blender and Three.js / WebGL:

1. **Geometry**:
   - Enable **Tangents** (under *Geometry* in the Blender glTF export settings) whenever your model uses normal maps.
   - Enable **Apply Modifiers** (unless exporting shape keys / blendshapes).
2. **Materials**:
   - Use standard **Principled BSDF** nodes. Avoid complex procedural Blender-specific node trees (Noise, Voronoi, ColorRamp) without baking them to image textures first.
   - For hair and eyelashes with transparency, test whether **Alpha Clip** (`alphaMode: MASK`) or **Alpha Hashed** gives cleaner silhouette results than **Alpha Blend**.
3. **Textures**:
   - Keep texture dimensions to power-of-two resolutions (e.g. `1024x1024`, `2048x2048`) for optimal GPU mipmapping.
   - Save roughness and metallic into separate channels or a combined ORM map to save memory.
4. **Draco Compression**:
   - If using Draco compression, ensure your destination web application includes the Draco WebAssembly decoders.

---

## Contributing

Contributions, issue reports, and feature suggestions are welcome! Feel free to open an issue or submit a pull request.

---

## License

This project is open source and available under the [MIT License](LICENSE).


