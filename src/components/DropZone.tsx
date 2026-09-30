import React, { useState } from 'react';
import { Upload, CheckCircle2, AlertTriangle } from 'lucide-react';
import { createProblematicBlenderSample, createCleanAssetSample } from '../utils/sampleGenerator';

interface DropZoneProps {
  onFileUpload: (file: File) => void;
  analyzing: boolean;
}

export const DropZone: React.FC<DropZoneProps> = ({ onFileUpload, analyzing }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [sampleLoading, setSampleLoading] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && (file.name.endsWith('.glb') || file.name.endsWith('.gltf'))) {
      onFileUpload(file);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileUpload(file);
    }
  };

  const loadSample = async (type: 'problem' | 'clean') => {
    setSampleLoading(true);
    try {
      const file = type === 'problem' ? await createProblematicBlenderSample() : await createCleanAssetSample();
      onFileUpload(file);
    } finally {
      setSampleLoading(false);
    }
  };

  return (
    <div
      className={`dropzone-card ${isDragging ? 'dragging' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="dropzone-center-content">
        <div className="dropzone-icon-ring">
          <Upload size={38} className="upload-arrow-icon" />
        </div>

        <h2 className="dropzone-title">Drop your .GLB or .glTF file here</h2>
        <p className="dropzone-desc">
          Analyzed <strong>100% locally in your browser memory</strong>. No files leave your machine.
        </p>

        <label className="browse-files-btn">
          <span>{analyzing ? 'Analyzing glTF Structure...' : 'Browse Local File'}</span>
          <input
            type="file"
            accept=".glb,.gltf"
            onChange={handleFileInput}
            disabled={analyzing || sampleLoading}
            style={{ display: 'none' }}
          />
        </label>

        <div className="sample-quick-pick">
          <span className="sample-pick-lbl">Or test immediately with a synthetic sample:</span>
          <div className="sample-pick-actions">
            <button
              type="button"
              className="quick-sample-pill warning"
              onClick={() => loadSample('problem')}
              disabled={analyzing || sampleLoading}
            >
              <AlertTriangle size={13} />
              <span>Blender Export with Common Issues</span>
            </button>
            <button
              type="button"
              className="quick-sample-pill clean"
              onClick={() => loadSample('clean')}
              disabled={analyzing || sampleLoading}
            >
              <CheckCircle2 size={13} />
              <span>Clean Production Asset</span>
            </button>
          </div>
        </div>
      </div>

      {/* Feature capabilities matrix */}
      <div className="dropzone-features-grid">
        <div className="feature-item">
          <div className="feature-bullet">•</div>
          <div>
            <strong>Missing Tangents & Normal Maps:</strong> Identifies why normal maps create visible seams and inverted lighting without MikkTSpace tangents.
          </div>
        </div>
        <div className="feature-item">
          <div className="feature-bullet">•</div>
          <div>
            <strong>Alpha BLEND Sorting Glitches:</strong> Detects unintended <code>depthWrite: false</code> causing backfaces to bleed through front geometry.
          </div>
        </div>
        <div className="feature-item">
          <div className="feature-bullet">•</div>
          <div>
            <strong>Missing UV Coordinates:</strong> Flags materials mapped with textures on meshes lacking <code>TEXCOORD_0</code>.
          </div>
        </div>
        <div className="feature-item">
          <div className="feature-bullet">•</div>
          <div>
            <strong>Procedural Shader Disclaimer:</strong> Clarifies why unbaked Blender procedural nodes (Noise, Mix, ColorRamp) vanish upon export.
          </div>
        </div>
        <div className="feature-item">
          <div className="feature-bullet">•</div>
          <div>
            <strong>Pure Metallic & Missing IBL:</strong> Explains why metallicFactor = 1.0 looks completely black without an HDR environment map.
          </div>
        </div>
        <div className="feature-item">
          <div className="feature-bullet">•</div>
          <div>
            <strong>Extension & Decoder Checks:</strong> Validates Draco, BasisU, Meshopt, Clearcoat, Transmission, and Emissive Strength support.
          </div>
        </div>
      </div>
    </div>
  );
};
