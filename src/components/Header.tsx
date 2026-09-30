import React, { useState } from 'react';
import type { DiagnosticReport } from '../types/diagnostic';
import { generateJsonReport, generateTxtReport, generateMarkdownReportForLlm, downloadFile } from '../utils/exportReport';
import { createProblematicBlenderSample, createCleanAssetSample, createAvatarBlenderSample } from '../utils/sampleGenerator';
import {
  Upload,
  Copy,
  Check,
  FileText,
  FileJson,
  Boxes,
  Sparkles,
  AlertTriangle,
  Eye,
  EyeOff,
  User,
} from 'lucide-react';


interface HeaderProps {
  report: DiagnosticReport | null;
  onFileUpload: (file: File) => void;
  show3DViewer: boolean;
  setShow3DViewer: (show: boolean) => void;
  analyzing: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  report,
  onFileUpload,
  show3DViewer,
  setShow3DViewer,
  analyzing,
}) => {
  const [copied, setCopied] = useState(false);
  const [sampleLoading, setSampleLoading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileUpload(file);
      e.target.value = '';
    }
  };

  const handleCopyReport = async () => {
    if (!report) return;
    const markdown = generateMarkdownReportForLlm(report);
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error('Failed to copy report to clipboard:', err);
    }
  };

  const handleDownloadJson = () => {
    if (!report) return;
    const json = generateJsonReport(report);
    downloadFile(json, `${report.fileInfo.name.replace(/\.[^/.]+$/, '')}_diagnostic_report.json`, 'application/json');
  };

  const handleDownloadTxt = () => {
    if (!report) return;
    const txt = generateTxtReport(report);
    downloadFile(txt, `${report.fileInfo.name.replace(/\.[^/.]+$/, '')}_diagnostic_report.txt`, 'text/plain');
  };

  const loadProblematicSample = async () => {
    setSampleLoading(true);
    try {
      const sampleFile = await createProblematicBlenderSample();
      onFileUpload(sampleFile);
    } finally {
      setSampleLoading(false);
    }
  };

  const loadCleanSample = async () => {
    setSampleLoading(true);
    try {
      const sampleFile = await createCleanAssetSample();
      onFileUpload(sampleFile);
    } finally {
      setSampleLoading(false);
    }
  };

  const loadAvatarSample = async () => {
    setSampleLoading(true);
    try {
      const sampleFile = await createAvatarBlenderSample();
      onFileUpload(sampleFile);
    } finally {
      setSampleLoading(false);
    }
  };

  return (
    <header className="app-header">
      <div className="header-top">
        <div className="brand-group">
          <div className="brand-icon">
            <Boxes size={22} color="#60a5fa" />
          </div>
          <div>
            <h1 className="brand-title">glTF / GLB Blender Export Diagnostics</h1>
            <p className="brand-tagline">
              Inspect hidden GLB structures, tangents, UVs, and PBR configs causing differences between Blender, glTF Viewer & Three.js.
            </p>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="header-actions">
          {report && (
            <>
              <button
                type="button"
                className={`action-btn viewer-toggle-btn ${show3DViewer ? 'active' : ''}`}
                onClick={() => setShow3DViewer(!show3DViewer)}
                title="Toggle interactive 3D WebGL preview"
              >
                {show3DViewer ? <EyeOff size={15} /> : <Eye size={15} />}
                <span>{show3DViewer ? 'Hide 3D Viewport' : 'Show 3D Viewport'}</span>
              </button>

              <button
                type="button"
                className="action-btn copy-btn"
                onClick={handleCopyReport}
                title="Copy formatted markdown report ready to paste into ChatGPT / Claude"
              >
                {copied ? <Check size={15} color="#10b981" /> : <Copy size={15} />}
                <span>{copied ? 'Copied to Clipboard!' : 'Copy Diagnostic Report'}</span>
              </button>

              <div className="download-group">
                <button
                  type="button"
                  className="action-btn download-btn"
                  onClick={handleDownloadJson}
                  title="Download complete diagnostic report as JSON"
                >
                  <FileJson size={15} />
                  <span>JSON</span>
                </button>
                <button
                  type="button"
                  className="action-btn download-btn"
                  onClick={handleDownloadTxt}
                  title="Download human-readable text diagnostic report"
                >
                  <FileText size={15} />
                  <span>TXT</span>
                </button>
              </div>
            </>
          )}

          {/* Upload input button */}
          <label className="action-btn primary-upload-btn" title="Choose a .glb or .gltf file from your disk">
            <Upload size={16} />
            <span>{analyzing ? 'Analyzing File...' : 'Upload GLB / glTF'}</span>
            <input
              type="file"
              accept=".glb,.gltf"
              onChange={handleFileChange}
              disabled={analyzing}
              style={{ display: 'none' }}
            />
          </label>
        </div>
      </div>

      {/* Quick Sample Presets bar */}
      <div className="header-samples-bar">
        <div className="samples-label">
          <Sparkles size={14} color="#f59e0b" />
          <span>Quick Test Presets (Instant In-Browser):</span>
        </div>
        <div className="samples-buttons">
          <button
            type="button"
            className="sample-preset-btn warning-preset"
            onClick={loadProblematicSample}
            disabled={sampleLoading || analyzing}
            title="Generates a GLB with real Blender export problems: missing tangents, BLEND alpha mode, missing UVs, and pure metallic without IBL"
          >
            <AlertTriangle size={13} />
            <span>Problematic Blender Export (Tangents, Alpha, UVs)</span>
          </button>
          <button
            type="button"
            className="sample-preset-btn avatar-preset"
            onClick={loadAvatarSample}
            disabled={sampleLoading || analyzing}
            title="Generates a rigged avatar character with bones, skinning, and ARKit blendshapes"
          >
            <User size={13} />
            <span>Rigged Avatar (Bones, Blendshapes)</span>
          </button>
          <button
            type="button"
            className="sample-preset-btn clean-preset"
            onClick={loadCleanSample}
            disabled={sampleLoading || analyzing}
            title="Generates a clean glTF asset following best practices"
          >
            <Check size={13} />
            <span>Clean Production Asset (Valid Tangents & UVs)</span>
          </button>
        </div>
        <div className="local-privacy-pill" title="Analysis happens 100% locally in your browser memory. Nothing is sent to any server.">
          <span>🔒 100% Local Browser Analysis (Zero Server Upload)</span>
        </div>
      </div>

      {/* Section Jump Nav */}
      {report && (
        <nav className="section-jump-nav" aria-label="Quick jump navigation">
          <a href="#diagnostic-summary">Summary</a>
          <a href="#blender-compatibility" className="nav-highlight">
            Blender ↔ Web Compatibility
          </a>
          <a href="#blender-compatibility-issues">
            Blender Issues ({report.summary?.issues?.length || 0})
          </a>
          <a href="#file-information">File Info</a>
          <a href="#scene-structure">Hierarchy</a>
          <a href="#materials-inspection">Materials ({report.materials?.length || 0})</a>
          <a href="#textures-and-images">Textures ({report.textures?.length || 0})</a>
          <a href="#mesh-analysis">Meshes ({report.meshes?.length || 0})</a>
          <a href="#extensions-and-compression">Extensions ({report.extensions?.length || 0})</a>

          <a href="#rendering-diagnostics">Advisory & Limitations</a>
        </nav>
      )}
    </header>
  );
};
