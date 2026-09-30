import { useState, useEffect, useCallback } from 'react';
import type { DiagnosticReport } from './types/diagnostic';
import type { RuntimeMaterialInspection, ThreeJsCapturedImage } from './types/renderComparison';
import type { ThreeJsRuntimeState } from './types/pipelineCompatibility';
import { analyzeModel } from './utils/analyzer';
import { Header } from './components/Header';
import { DropZone } from './components/DropZone';
import { DiagnosticSummaryCards } from './components/DiagnosticSummaryCards';
import { IssuesSection } from './components/IssuesSection';
import { FileInfoCard } from './components/FileInfoCard';
import { SceneHierarchyView } from './components/SceneHierarchyView';
import { MaterialsTable } from './components/MaterialsTable';
import { TexturesGrid } from './components/TexturesGrid';
import { MeshesTable } from './components/MeshesTable';
import { ExtensionsTable } from './components/ExtensionsTable';
import { RenderingAdvisory } from './components/RenderingAdvisory';
import { ModelViewer } from './components/ModelViewer';
import { BlenderCompatibilityView } from './components/BlenderCompatibilityView';
import { WhyBlenderLooksDifferentView } from './components/WhyBlenderLooksDifferentView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AlertCircle, RefreshCw } from 'lucide-react';
import './App.css';

export function App() {
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [show3DViewer, setShow3DViewer] = useState(true);

  // Render comparison & runtime state
  const [runtimeMaterials, setRuntimeMaterials] = useState<RuntimeMaterialInspection[]>([]);
  const [runtimeState, setRuntimeState] = useState<ThreeJsRuntimeState | null>(null);
  const [hairMode, setHairMode] = useState<'BLEND' | 'MASK'>('BLEND');
  const [normalMapsEnabled, setNormalMapsEnabled] = useState(true);
  const [captureCanvasFn, setCaptureCanvasFn] = useState<(() => ThreeJsCapturedImage | null) | null>(null);

  const handleCaptureReady = useCallback((fn: () => ThreeJsCapturedImage | null) => {
    setCaptureCanvasFn(() => fn);
  }, []);

  const handleRuntimeInspection = useCallback((mats: RuntimeMaterialInspection[]) => {
    setRuntimeMaterials(mats);
  }, []);

  const handleRuntimeStateChange = useCallback((state: ThreeJsRuntimeState) => {
    setRuntimeState(state);
  }, []);

  const handleFileUpload = async (file: File) => {
    setCurrentFile(file);
    setAnalyzing(true);
    setAnalysisError(null);
    setRuntimeMaterials([]);
    setHairMode('BLEND');
    setNormalMapsEnabled(true);
    setCaptureCanvasFn(null);

    try {
      const result = await analyzeModel(file);
      setReport(result);
    } catch (err: any) {
      console.error('Fatal analysis failure:', err);
      setAnalysisError(err.message || 'An unexpected error occurred while parsing the model.');
    } finally {
      setAnalyzing(false);
    }
  };

  // Global drag-and-drop listener on window
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      const droppedFile = e.dataTransfer?.files?.[0];
      if (droppedFile && (droppedFile.name.endsWith('.glb') || droppedFile.name.endsWith('.gltf'))) {
        handleFileUpload(droppedFile);
      }
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);

  return (
    <div className="app-layout">
      <Header
        report={report}
        onFileUpload={handleFileUpload}
        show3DViewer={show3DViewer}
        setShow3DViewer={setShow3DViewer}
        analyzing={analyzing}
      />

      <main className="main-content">
        {analysisError && (
          <div className="fatal-error-banner">
            <AlertCircle size={22} color="#ef4444" />
            <div className="error-text">
              <h3>Diagnostic Engine Error</h3>
              <p>{analysisError}</p>
            </div>
            <button
              type="button"
              className="retry-btn"
              onClick={() => currentFile && handleFileUpload(currentFile)}
            >
              <RefreshCw size={14} /> Retry
            </button>
          </div>
        )}

        {analyzing && (
          <div className="analyzing-backdrop">
            <div className="analyzing-card">
              <div className="spinner large" />
              <h3>Analyzing GLB Structure Locally...</h3>
              <p>
                Inspecting buffer views, accessors, tangent vectors, PBR metallic-roughness factors, and glTF extensions.
              </p>
            </div>
          </div>
        )}

        {!report && !analyzing && (
          <div className="dropzone-page-wrap">
            <DropZone onFileUpload={handleFileUpload} analyzing={analyzing} />
          </div>
        )}

        {report && (
          <div className="report-flow-container">
            {/* 3D Model Inspector (Toggleable) */}
            {show3DViewer && currentFile && (
              <ErrorBoundary fallbackTitle="3D WebGL Viewport Notice">
                <div className="section-block viewer-container-card">
                  <div className="section-header">
                    <div className="section-title-wrap">
                      <h2 className="section-title">Interactive 3D Viewport Inspection</h2>
                      <p className="section-subtitle">
                        WebGL Three.js canvas loaded directly from browser memory. Switch lighting presets to observe metallic reflection behaviors.
                      </p>
                    </div>
                  </div>
                  <ModelViewer
                    file={currentFile}
                    onCaptureReady={handleCaptureReady}
                    onRuntimeInspection={handleRuntimeInspection}
                    onRuntimeStateChange={handleRuntimeStateChange}
                    externalHairMode={hairMode}
                    externalNormalMapsEnabled={normalMapsEnabled}
                  />
                </div>
              </ErrorBoundary>
            )}

            {/* PRIMARY DIAGNOSIS: Why Can This Model Look Different in Three.js? */}
            <ErrorBoundary fallbackTitle="Why Blender Looks Different Diagnosis Notice">
              <WhyBlenderLooksDifferentView
                report={report}
                runtimeMaterials={runtimeMaterials}
                runtimeState={runtimeState}
                hairMode={hairMode}
                onHairModeChange={setHairMode}
                normalMapsEnabled={normalMapsEnabled}
                onNormalMapsEnabledChange={setNormalMapsEnabled}
                onTriggerCapture={() => (captureCanvasFn ? captureCanvasFn() : null)}
              />
            </ErrorBoundary>

            {/* Diagnostic Summary Status Cards */}
            <ErrorBoundary fallbackTitle="Diagnostic Summary Status Notice">
              <DiagnosticSummaryCards summary={report.summary} />
            </ErrorBoundary>

            {/* Blender ↔ Web Render Compatibility Analyzer */}
            {report.blenderCompatibility && (
              <ErrorBoundary fallbackTitle="Blender Compatibility Section Notice">
                <BlenderCompatibilityView compatibility={report.blenderCompatibility} />
              </ErrorBoundary>
            )}

            {/* Section 7 & 9: Potential Blender -> glTF / Three.js Issues */}
            <IssuesSection issues={report.summary.issues} />


            {/* Section 1: File Information */}
            <FileInfoCard fileInfo={report.fileInfo} />

            {/* Section 2: Scene Structure & Hierarchy */}
            <SceneHierarchyView structure={report.sceneStructure} materials={report.materials} />

            {/* Section 3: Materials Analysis */}
            <MaterialsTable materials={report.materials} />

            {/* Section 4: Textures & Images */}
            <TexturesGrid textures={report.textures} />

            {/* Section 5: Mesh Analysis */}
            <MeshesTable meshes={report.meshes} />

            {/* Section 6: Extensions and Compression */}
            <ExtensionsTable extensions={report.extensions} />

            {/* Section 8: Rendering-Related Diagnostics & Blender Limitations */}
            <RenderingAdvisory diagnostics={report.renderingDiagnostics} />
          </div>
        )}
      </main>

      <footer className="app-footer">
        <div className="footer-content">
          <span>glTF 2.0 & GLB Diagnostic Studio for Blender & Three.js</span>
          <span>•</span>
          <span>100% In-Browser Analysis via <code>@gltf-transform/core</code> & <code>Three.js</code></span>
          <span>•</span>
          <span>No files or textures uploaded to any remote server</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
