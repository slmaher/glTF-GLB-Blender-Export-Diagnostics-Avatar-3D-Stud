import type { DiagnosticReport } from '../types/diagnostic';

export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function generateJsonReport(report: DiagnosticReport): string {
  // Clone report and omit heavy raw preview URLs or circular objects
  const sanitizedReport = {
    ...report,
    textures: report.textures.map((t) => ({
      ...t,
      previewUrl: undefined, // omit blob url in json
    })),
    rawJson: undefined, // exclude large raw json if included
  };
  return JSON.stringify(sanitizedReport, null, 2);
}

export function generateTxtReport(report: DiagnosticReport): string {
  const lines: string[] = [];
  const divider = '='.repeat(80);
  const subDivider = '-'.repeat(80);

  lines.push(divider);
  lines.push(`GLB / glTF DIAGNOSTIC REPORT: ${report.fileInfo.name}`);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(divider);
  lines.push('');

  // 1. FILE INFORMATION
  lines.push('[ 1. FILE INFORMATION ]');
  lines.push(`File Name       : ${report.fileInfo.name}`);
  lines.push(`File Size       : ${report.fileInfo.sizeFormatted} (${report.fileInfo.sizeBytes} bytes)`);
  lines.push(`Format          : ${report.fileInfo.format}`);
  lines.push(`Version         : ${report.fileInfo.version}`);
  lines.push(`Generator       : ${report.fileInfo.generator || 'N/A'}`);
  lines.push(`Status          : ${report.fileInfo.isValid ? 'VALID' : 'INVALID'}`);
  lines.push(`Parse Time      : ${report.fileInfo.parseTimeMs} ms`);
  if (report.fileInfo.parsingErrors.length > 0) {
    lines.push('Parsing Errors:');
    report.fileInfo.parsingErrors.forEach((e) => lines.push(`  ! ${e}`));
  }
  if (report.fileInfo.parsingWarnings.length > 0) {
    lines.push('Parsing Warnings:');
    report.fileInfo.parsingWarnings.forEach((w) => lines.push(`  * ${w}`));
  }
  lines.push('');

  // 2. DIAGNOSTIC SUMMARY
  lines.push('[ 2. DIAGNOSTIC SUMMARY ]');
  lines.push(`File Status          : ${report.summary.fileStatus}`);
  lines.push(`Materials Status     : ${report.summary.materialsStatus}`);
  lines.push(`Textures Status      : ${report.summary.texturesStatus}`);
  lines.push(`Geometry Status      : ${report.summary.geometryStatus}`);
  lines.push(`Extensions Status    : ${report.summary.extensionsStatus}`);
  lines.push(`Three.js Compatibility: ${report.summary.threeJsCompatibility}`);
  lines.push(`High Priority Issues : ${report.summary.highPriorityCount}`);
  lines.push(`Medium Priority Issues: ${report.summary.mediumPriorityCount}`);
  lines.push(`Low Priority Issues  : ${report.summary.lowPriorityCount}`);
  lines.push('');

  // 2.5 BLENDER ↔ WEB COMPATIBILITY
  if (report.blenderCompatibility) {
    const bc = report.blenderCompatibility;
    lines.push(subDivider);
    lines.push(`[ 2.5 BLENDER ↔ WEB RENDER COMPATIBILITY (Score: ${bc.overallScore}/100) ]`);
    lines.push(subDivider);
    lines.push(`Scores: Materials: ${bc.scores.materials.score}%, Textures: ${bc.scores.textures.score}%, Lighting: ${bc.scores.lighting.score}%, Color: ${bc.scores.colorManagement.score}%, Geometry: ${bc.scores.geometry.score}%`);
    if (bc.avatarReadiness.isAvatar) {
      lines.push(`Avatar Animation Readiness: ${bc.avatarReadiness.suitabilityStatus} (${bc.avatarReadiness.boneCount} bones, ${bc.avatarReadiness.morphTargetCount} morph targets)`);
    }
    lines.push('');
    lines.push('# WHY DOES BLENDER LOOK DIFFERENT? (Prioritized Causes)');
    bc.prioritizedCauses.forEach((cause, idx) => {
      lines.push(`[${idx + 1}] [${cause.priority}] ${cause.title} (${cause.category})`);
      lines.push(`    AFFECTED ITEM: ${cause.affectedItem}`);
      lines.push(`    REASON       : ${cause.technicalReason}`);
      lines.push(`    BLENDER      : ${cause.expectedBlenderBehavior}`);
      lines.push(`    THREE.JS     : ${cause.expectedThreeJsBehavior}`);
      lines.push(`    FIX          : ${cause.recommendedFix}`);
      lines.push('');
    });
  }

  // 3. BLENDER -> THREE.JS ISSUES
  lines.push(subDivider);
  lines.push('[ 3. BLENDER -> glTF / THREE.JS COMPATIBILITY ISSUES ]');
  lines.push(subDivider);
  if (report.summary.issues.length === 0) {
    lines.push('No issues detected! File follows standard glTF specifications.');
  } else {
    report.summary.issues.forEach((issue, idx) => {
      lines.push(`[${idx + 1}] [${issue.severity}] [${issue.category}] ${issue.title}`);
      lines.push(`    EVIDENCE   : ${issue.evidence}`);
      lines.push(`    EXPLANATION: ${issue.explanation}`);
      lines.push(`    BLENDER FIX: ${issue.blenderFix}`);
      lines.push('');
    });
  }
  lines.push('');


  // 4. SCENE STRUCTURE
  lines.push('[ 4. SCENE STRUCTURE ]');
  lines.push(`Scenes    : ${report.sceneStructure.scenesCount}`);
  lines.push(`Nodes     : ${report.sceneStructure.nodesCount}`);
  lines.push(`Meshes    : ${report.sceneStructure.meshesCount}`);
  lines.push(`Primitives: ${report.sceneStructure.primitivesCount}`);
  lines.push(`Materials : ${report.sceneStructure.materialsCount}`);
  lines.push(`Textures  : ${report.sceneStructure.texturesCount}`);
  lines.push(`Images    : ${report.sceneStructure.imagesCount}`);
  lines.push(`Cameras   : ${report.sceneStructure.camerasCount}`);
  lines.push(`Lights    : ${report.sceneStructure.lightsCount}`);
  lines.push(`Animations: ${report.sceneStructure.animationsCount}`);
  lines.push('');

  // 5. MATERIALS
  lines.push('[ 5. MATERIALS ]');
  report.materials.forEach((mat) => {
    lines.push(`Material #${mat.index}: "${mat.name}"`);
    lines.push(`  Type             : ${mat.type}`);
    lines.push(`  Alpha Mode       : ${mat.alphaMode} (Cutoff: ${mat.alphaCutoff})`);
    lines.push(`  Double Sided     : ${mat.doubleSided}`);
    lines.push(`  BaseColorFactor  : [${mat.baseColorFactor.map((v) => v.toFixed(3)).join(', ')}]`);
    lines.push(`  Metallic Factor  : ${mat.metallicFactor}`);
    lines.push(`  Roughness Factor : ${mat.roughnessFactor}`);
    lines.push(`  Emissive Factor  : [${mat.emissiveFactor.join(', ')}]`);
    lines.push(`  BaseColor Texture: ${mat.baseColorTexture ? `${mat.baseColorTexture.textureName} (Index ${mat.baseColorTexture.textureIndex})` : 'None'}`);
    lines.push(`  Normal Texture   : ${mat.normalTexture ? `${mat.normalTexture.textureName} (Scale: ${mat.normalScale})` : 'None'}`);
    lines.push(`  ORM Texture      : ${mat.metallicRoughnessTexture ? mat.metallicRoughnessTexture.textureName : 'None'}`);
    lines.push(`  Extensions (${mat.extensions.length}): ${mat.extensions.map((e) => e.name).join(', ') || 'None'}`);
    if (mat.diagnostics.length > 0) {
      lines.push('  Diagnostics:');
      mat.diagnostics.forEach((d) => lines.push(`    - ${d}`));
    }
    lines.push('');
  });

  // 6. TEXTURES
  lines.push('[ 6. TEXTURES & IMAGES ]');
  lines.push('| Texture | Image | Storage | Format | Size | BufferView | Decode | Status |');
  lines.push('|---------|-------|---------|--------|------|------------|--------|--------|');
  report.textures.forEach((tex) => {
    lines.push(`| ${tex.name} (#${tex.index}) | ${tex.imageName} (#${tex.imageIndex}) | ${tex.storage} | ${tex.format} | ${tex.byteSizeFormatted} | ${tex.bufferViewIndex !== undefined ? tex.bufferViewIndex : '—'} | ${tex.decodeStatus} | ${tex.validationStatus} |`);
  });
  lines.push('');
  report.textures.forEach((tex) => {
    lines.push(`Texture #${tex.index}: "${tex.name}" -> Image: "${tex.imageName}"`);
    lines.push(`  Storage    : ${tex.storage} (BufferView: ${tex.bufferViewIndex !== undefined ? tex.bufferViewIndex : 'None'}, Classification: ${tex.validationClassification})`);
    lines.push(`  Status     : ${tex.validationStatus} | Decoded: ${tex.decodeStatus}`);
    if (tex.validationDetails) lines.push(`  Validation : ${tex.validationDetails}`);
    lines.push(`  Format     : ${tex.format} (${tex.mimeType})`);
    lines.push(`  Dimensions : ${tex.width || '?'} x ${tex.height || '?'} (NPOT: ${tex.isNPOT})`);
    lines.push(`  Size       : ${tex.byteSizeFormatted}`);
    lines.push(`  Sampler    : Min: ${tex.sampler.minFilterName}, Mag: ${tex.sampler.magFilterName}, WrapS: ${tex.sampler.wrapSName}, WrapT: ${tex.sampler.wrapTName}`);
    lines.push(`  Purposes   : ${tex.detectedPurposes.join(', ') || 'None (Unused)'}`);
    if (tex.diagnostics.length > 0) {
      lines.push('  Diagnostics:');
      tex.diagnostics.forEach((d) => lines.push(`    - ${d}`));
    }
    lines.push('');
  });

  // 7. MESH ANALYSIS
  lines.push('[ 7. MESH ANALYSIS ]');
  report.meshes.forEach((mesh) => {
    lines.push(`Mesh #${mesh.index}: "${mesh.name}"`);
    lines.push(`  Vertices: ${mesh.totalVertices.toLocaleString()} | Triangles: ${mesh.totalTriangles.toLocaleString()} | Primitives: ${mesh.primitivesCount}`);
    if (mesh.boundingBox) {
      lines.push(`  Bounding Box: Min [${mesh.boundingBox.min.map((v) => v.toFixed(2)).join(', ')}] Max [${mesh.boundingBox.max.map((v) => v.toFixed(2)).join(', ')}] Size [${mesh.boundingBox.size.map((v) => v.toFixed(2)).join(', ')}]`);
    }
    mesh.primitives.forEach((prim) => {
      const a = prim.attributes;
      lines.push(`  Primitive #${prim.primitiveIndex} (Mode: ${prim.mode}, Vertices: ${prim.vertexCount}, Material: ${prim.materialName || 'None'}):`);
      lines.push(`    Attributes: POS: ${a.hasPosition} | NORM: ${a.hasNormal} | TAN: ${a.hasTangent} | UV0: ${a.hasTexCoord0} | UV1: ${a.hasTexCoord1} | COL0: ${a.hasColor0} | SKEL: ${a.hasJoints0 && a.hasWeights0}`);
      if (prim.diagnostics.length > 0) {
        prim.diagnostics.forEach((d) => lines.push(`      ! ${d}`));
      }
    });
    lines.push('');
  });

  // 8. EXTENSIONS
  lines.push('[ 8. EXTENSIONS & COMPRESSION ]');
  if (report.extensions.length === 0) {
    lines.push('No glTF extensions used in this file.');
  } else {
    report.extensions.forEach((ext) => {
      lines.push(`Extension: ${ext.name} (Required: ${ext.isRequired}, Compression: ${ext.isCompression})`);
      lines.push(`  Description: ${ext.description}`);
      lines.push(`  Three.js   : ${ext.threeJsSupport}`);
      lines.push(`  Impact     : ${ext.renderingImpact}`);
      lines.push('');
    });
  }

  // 9. RENDERING ADVISORY
  lines.push(divider);
  lines.push('[ 9. RENDERING ADVISORY & BLENDER SPECIFIC LIMITATIONS ]');
  lines.push(divider);
  lines.push(report.renderingDiagnostics.blenderShaderNodeDisclaimer);
  lines.push('');
  lines.push('COLOR SPACE:');
  report.renderingDiagnostics.colorSpaceNotes.forEach((n) => lines.push(`- ${n}`));
  lines.push('');
  lines.push('LIGHTING & ENVIRONMENT (IBL):');
  report.renderingDiagnostics.lightingAndEnvironmentNotes.forEach((n) => lines.push(`- ${n}`));
  lines.push('');
  lines.push('ALPHA BLENDING:');
  report.renderingDiagnostics.alphaBlendingNotes.forEach((n) => lines.push(`- ${n}`));
  lines.push('');
  lines.push('TANGENTS & NORMAL MAPS:');
  report.renderingDiagnostics.tangentSpaceNotes.forEach((n) => lines.push(`- ${n}`));
  lines.push('');
  lines.push(divider);

  return lines.join('\n');
}

export function generateMarkdownReportForLlm(report: DiagnosticReport): string {
  const lines: string[] = [];

  lines.push(`# glTF / GLB Diagnostic Report for LLM Analysis`);
  lines.push(`**File**: \`${report.fileInfo.name}\` (${report.fileInfo.sizeFormatted}) | **Generator**: \`${report.fileInfo.generator}\``);
  lines.push(`**Three.js Compatibility Assessment**: **${report.summary.threeJsCompatibility}**`);
  lines.push('');

  lines.push(`## 1. Executive Summary`);
  lines.push(`- **Status**: ${report.summary.fileStatus}`);
  lines.push(`- **Materials**: ${report.summary.materialsStatus}`);
  lines.push(`- **Textures**: ${report.summary.texturesStatus}`);
  lines.push(`- **Geometry**: ${report.summary.geometryStatus}`);
  lines.push(`- **Extensions**: ${report.summary.extensionsStatus}`);
  lines.push(`- **Priority Counts**: ${report.summary.highPriorityCount} High, ${report.summary.mediumPriorityCount} Medium, ${report.summary.lowPriorityCount} Low`);
  lines.push('');

  if (report.blenderCompatibility) {
    const bc = report.blenderCompatibility;
    lines.push(`## 1.5 Blender ↔ Web Render Compatibility (Score: ${bc.overallScore}/100)`);
    lines.push(`- **Material Compatibility**: ${bc.scores.materials.score}%`);
    lines.push(`- **Texture Compatibility**: ${bc.scores.textures.score}%`);
    lines.push(`- **Lighting Compatibility**: ${bc.scores.lighting.score}%`);
    lines.push(`- **Color Management Compatibility**: ${bc.scores.colorManagement.score}%`);
    lines.push(`- **Geometry & Tangents Compatibility**: ${bc.scores.geometry.score}%`);
    if (bc.avatarReadiness.isAvatar) {
      lines.push(`- **Avatar / Web Animation Readiness**: ${bc.avatarReadiness.suitabilityStatus} (${bc.avatarReadiness.boneCount} bones, ${bc.avatarReadiness.morphTargetCount} blendshapes, ${bc.avatarReadiness.arkitStandardCount}/52 ARKit standard)`);
    }
    lines.push('');
    lines.push(`### # Why Does Blender Look Different? (Prioritized Causes)`);
    bc.prioritizedCauses.forEach((cause, idx) => {
      lines.push(`${idx + 1}. **[${cause.priority}] ${cause.title}** (${cause.category})`);
      lines.push(`   - *Affected*: \`${cause.affectedItem}\``);
      lines.push(`   - *Reason*: ${cause.technicalReason}`);
      lines.push(`   - *Expected in Blender*: ${cause.expectedBlenderBehavior}`);
      lines.push(`   - *Expected in Three.js*: ${cause.expectedThreeJsBehavior}`);
      lines.push(`   - *Recommended Fix*: ${cause.recommendedFix}`);
      lines.push('');
    });
  }


  lines.push(`## 2. Identified Blender -> glTF / Three.js Export Issues`);
  if (report.summary.issues.length === 0) {
    lines.push(`*No structural or compatibility issues detected in the GLB.*`);
  } else {
    report.summary.issues.forEach((issue) => {
      lines.push(`### [${issue.severity}] ${issue.title} (${issue.category})`);
      lines.push(`- **Evidence from GLB**: ${issue.evidence}`);
      lines.push(`- **Why it looks different**: ${issue.explanation}`);
      lines.push(`- **Actionable Blender Fix**: ${issue.blenderFix}`);
      lines.push('');
    });
  }

  lines.push(`## 3. Materials Overview`);
  report.materials.forEach((mat) => {
    lines.push(`- **Material \`${mat.name}\`**: Alpha=\`${mat.alphaMode}\`, DoubleSided=\`${mat.doubleSided}\`, Metallic=\`${mat.metallicFactor}\`, Roughness=\`${mat.roughnessFactor}\``);
    if (mat.normalTexture) lines.push(`  - Normal Map: Texture Index \`${mat.normalTexture.textureIndex}\` (Scale: ${mat.normalScale})`);
    if (mat.baseColorTexture) lines.push(`  - Base Color Texture: Texture Index \`${mat.baseColorTexture.textureIndex}\``);
    if (mat.extensions.length > 0) lines.push(`  - Extensions: \`${mat.extensions.map((e) => e.name).join(', ')}\``);
  });
  lines.push('');

  lines.push(`## 4. Geometry Attributes & Tangents`);
  report.meshes.forEach((mesh) => {
    mesh.primitives.forEach((prim) => {
      const a = prim.attributes;
      lines.push(`- **Mesh \`${mesh.name}\` Prim #${prim.primitiveIndex}** (Material: \`${prim.materialName || 'None'}\`): POSITION=${a.hasPosition}, NORMAL=${a.hasNormal}, TANGENT=${a.hasTangent}, UV0=${a.hasTexCoord0}, COLOR0=${a.hasColor0}`);
    });
  });
  lines.push('');

  lines.push(`## 5. Extensions Used`);
  if (report.extensions.length === 0) {
    lines.push(`*None*`);
  } else {
    report.extensions.forEach((e) => {
      lines.push(`- \`${e.name}\` (Required: ${e.isRequired}): ${e.description} - *Three.js: ${e.threeJsSupport}*`);
    });
  }
  lines.push('');

  lines.push(`## 6. Blender Procedural Shader Note`);
  lines.push(`> ${report.renderingDiagnostics.blenderShaderNodeDisclaimer}`);

  return lines.join('\n');
}
