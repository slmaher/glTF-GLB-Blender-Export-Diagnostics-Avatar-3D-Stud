import React, { useState } from 'react';
import type { DiagnosticReport } from '../types/diagnostic';
import type {
  PipelineCompatibilityReport,
  PipelineDiagnosticFinding,
  ActiveRenderExperiments,
  ThreeJsRuntimeState,
} from '../types/pipelineCompatibility';
import type { RuntimeMaterialInspection } from '../types/renderComparison';
import { analyzePipelineCompatibility } from '../utils/pipelineCompatibilityAnalyzer';
import {
  Sliders,
  Sun,
  Layers,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  ArrowRight,
  Camera,
  Upload,
} from 'lucide-react';
import './WhyBlenderLooksDifferentView.css';

interface WhyBlenderLooksDifferentViewProps {
  report: DiagnosticReport;
  runtimeMaterials: RuntimeMaterialInspection[];
  runtimeState?: ThreeJsRuntimeState | null;
  hairMode: 'BLEND' | 'MASK';
  onHairModeChange: (mode: 'BLEND' | 'MASK') => void;
  normalMapsEnabled: boolean;
  onNormalMapsEnabledChange: (enabled: boolean) => void;
  onTriggerCapture?: () => any;
}

export const WhyBlenderLooksDifferentView: React.FC<WhyBlenderLooksDifferentViewProps> = ({
  report,
  runtimeMaterials,
  runtimeState,
  hairMode,
  onHairModeChange,
  normalMapsEnabled,
  onNormalMapsEnabledChange,
  onTriggerCapture,
}) => {
  const [activeTierTab, setActiveTierTab] = useState<string>('ALL');
  const [activeExperiments, setActiveExperiments] = useState<ActiveRenderExperiments>({
    hairMaskActive: hairMode === 'MASK',
    normalMapsDisabled: !normalMapsEnabled,
    experimentalToneMapping: null,
    experimentalExposure: null,
    environmentDisabled: false,
    experimentLog: [],
  });

  const [showMaterialAuditTable, setShowMaterialAuditTable] = useState(false);
  const [showNormalAuditTable, setShowNormalAuditTable] = useState(false);
  const [showOptionalScreenshotTool, setShowOptionalScreenshotTool] = useState(false);

  // Optional screenshot comparison state
  const [blenderImage, setBlenderImage] = useState<string | null>(null);
  const [capturedThreeImage, setCapturedThreeImage] = useState<string | null>(null);

  // Run pipeline compatibility analysis
  const pipelineReport: PipelineCompatibilityReport = analyzePipelineCompatibility(
    report,
    runtimeMaterials,
    runtimeState,
    activeExperiments
  );

  const { findingsByTier, pipelineSummary, materialAudits, normalAudits } = pipelineReport;

  // Experiment Handlers
  const handleToggleHairMask = () => {
    const newMode = hairMode === 'BLEND' ? 'MASK' : 'BLEND';
    onHairModeChange(newMode);
    const isMask = newMode === 'MASK';

    setActiveExperiments((prev) => ({
      ...prev,
      hairMaskActive: isMask,
      experimentLog: [
        ...prev.experimentLog.filter((e) => e.id !== 'EXP_HAIR_MASK'),
        ...(isMask
          ? [
              {
                id: 'EXP_HAIR_MASK',
                name: 'Hair MASK Cutoff (Depth Writing Enabled)',
                resultSummary:
                  'Temporarily switched Three.js hair materials to alphaMode MASK (transparent = false, depthWrite = true, alphaTest = 0.5). Back-facing hair strands no longer incorrectly bleed through foreground locks.',
                confirmedDifference: true,
                timestamp: new Date().toLocaleTimeString(),
              },
            ]
          : []),
      ],
    }));
  };

  const handleToggleNormalMaps = () => {
    const newEnabled = !normalMapsEnabled;
    onNormalMapsEnabledChange(newEnabled);

    setActiveExperiments((prev) => ({
      ...prev,
      normalMapsDisabled: !newEnabled,
      experimentLog: [
        ...prev.experimentLog.filter((e) => e.id !== 'EXP_NORMAL_MAPS'),
        ...(!newEnabled
          ? [
              {
                id: 'EXP_NORMAL_MAPS',
                name: 'Normal Perturbation Disabled (A/B Test)',
                resultSummary:
                  'Temporarily forced normalScale to (0, 0) across all normal-mapped meshes. Evaluated visual delta to determine how much tangent derivative approximation affects the silhouette.',
                confirmedDifference: true,
                timestamp: new Date().toLocaleTimeString(),
              },
            ]
          : []),
      ],
    }));
  };

  const handleResetAllExperiments = () => {
    onHairModeChange('BLEND');
    onNormalMapsEnabledChange(true);
    setActiveExperiments({
      hairMaskActive: false,
      normalMapsDisabled: false,
      experimentalToneMapping: null,
      experimentalExposure: null,
      environmentDisabled: false,
      experimentLog: [],
    });
  };

  const handleCaptureClick = () => {
    if (onTriggerCapture) {
      const res = onTriggerCapture();
      if (res && res.dataUrl) {
        setCapturedThreeImage(res.dataUrl);
      }
    }
  };

  const handleBlenderUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setBlenderImage(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const getTierBadge = (tier: string) => {
    switch (tier) {
      case 'CONFIRMED FROM GLB':
        return {
          bg: 'rgba(52, 211, 153, 0.15)',
          color: '#34d399',
          border: 'rgba(52, 211, 153, 0.4)',
        };
      case 'CONFIRMED FROM THREE.JS RUNTIME':
        return {
          bg: 'rgba(59, 130, 246, 0.15)',
          color: '#60a5fa',
          border: 'rgba(59, 130, 246, 0.4)',
        };
      case 'CONFIRMED BY RENDER EXPERIMENT':
        return {
          bg: 'rgba(168, 85, 247, 0.18)',
          color: '#c084fc',
          border: 'rgba(168, 85, 247, 0.4)',
        };
      case 'POTENTIAL':
        return {
          bg: 'rgba(251, 191, 36, 0.15)',
          color: '#fbbf24',
          border: 'rgba(251, 191, 36, 0.4)',
        };
      case 'UNKNOWN':
      default:
        return {
          bg: 'rgba(148, 163, 184, 0.15)',
          color: '#94a3b8',
          border: 'rgba(148, 163, 184, 0.35)',
        };
    }
  };

  // Filter findings based on active tab
  const allFindings: PipelineDiagnosticFinding[] = [
    ...findingsByTier.confirmedFromGlb,
    ...findingsByTier.confirmedFromRuntime,
    ...findingsByTier.confirmedByExperiment,
    ...findingsByTier.potentialCauses,
    ...findingsByTier.unknownFactors,
  ];

  const displayedFindings = allFindings.filter((f) => {
    if (activeTierTab === 'ALL') return true;
    if (activeTierTab === 'CONFIRMED_GLB') return f.classification === 'CONFIRMED FROM GLB';
    if (activeTierTab === 'CONFIRMED_RUNTIME') return f.classification === 'CONFIRMED FROM THREE.JS RUNTIME';
    if (activeTierTab === 'CONFIRMED_EXPERIMENT') return f.classification === 'CONFIRMED BY RENDER EXPERIMENT';
    if (activeTierTab === 'POTENTIAL') return f.classification === 'POTENTIAL';
    if (activeTierTab === 'UNKNOWN') return f.classification === 'UNKNOWN';
    return true;
  });

  return (
    <section className="section-block why-blender-looks-different-view" id="why-blender-looks-different">
      {/* 1. PRIMARY TITLE BANNER (SECTION 19) */}
      <div className="pipeline-header-wrap">
        <div className="pipeline-badge-row">
          <span className="pipeline-primary-badge">PRIMARY COMPATIBILITY DIAGNOSIS</span>
          <span className="pipeline-evidence-badge">EVIDENCE-BASED PIPELINE AUDIT</span>
        </div>
        <h1 className="pipeline-main-title">
          Why Can This Model Look Different in Three.js?
        </h1>
        <p className="pipeline-subtitle">
          End-to-end diagnosis of the export-and-render chain:{' '}
          <strong style={{ color: '#f8fafc' }}>Blender</strong> →{' '}
          <strong style={{ color: '#f8fafc' }}>glTF/GLB Export</strong> →{' '}
          <strong style={{ color: '#f8fafc' }}>GLB File Contents</strong> →{' '}
          <strong style={{ color: '#f8fafc' }}>Three.js GLTFLoader</strong> →{' '}
          <strong style={{ color: '#f8fafc' }}>WebGL Rasterization</strong>.
        </p>

        {/* Pipeline Architecture Flowchart */}
        <div className="pipeline-flow-diagram">
          <div className="flow-step">
            <div className="step-num">Step 1</div>
            <div className="step-title">Blender Scene</div>
            <div className="step-desc">Cycles/EEVEE, MikkTSpace, procedural nodes, World HDRI</div>
          </div>
          <ArrowRight size={16} className="flow-arrow" />
          <div className="flow-step">
            <div className="step-num">Step 2</div>
            <div className="step-title">glTF 2.0 Export</div>
            <div className="step-desc">Bakes to metallic-roughness PBR; drops unsupported nodes</div>
          </div>
          <ArrowRight size={16} className="flow-arrow" />
          <div className="flow-step highlight">
            <div className="step-num">Step 3</div>
            <div className="step-title">GLB Binary Data</div>
            <div className="step-desc">Confirmed facts: bufferViews, accessors, alphaMode, UVs</div>
          </div>
          <ArrowRight size={16} className="flow-arrow" />
          <div className="flow-step">
            <div className="step-num">Step 4</div>
            <div className="step-title">Three.js Runtime</div>
            <div className="step-desc">transparent=true, depthWrite=false, sRGB mapping</div>
          </div>
          <ArrowRight size={16} className="flow-arrow" />
          <div className="flow-step">
            <div className="step-num">Step 5</div>
            <div className="step-title">WebGL Render</div>
            <div className="step-desc">GPU fragment shading, tone mapping, IBL reflections</div>
          </div>
        </div>
      </div>

      {/* 2. FIVE EVIDENCE TIERS NAV BAR */}
      <div className="evidence-tiers-nav">
        <button
          type="button"
          className={`tier-tab-btn ${activeTierTab === 'ALL' ? 'active' : ''}`}
          onClick={() => setActiveTierTab('ALL')}
        >
          All Findings ({allFindings.length})
        </button>
        <button
          type="button"
          className={`tier-tab-btn ${activeTierTab === 'CONFIRMED_GLB' ? 'active' : ''}`}
          onClick={() => setActiveTierTab('CONFIRMED_GLB')}
        >
          <span className="dot green" />
          Confirmed from GLB ({pipelineSummary.confirmedGlbCount})
        </button>
        <button
          type="button"
          className={`tier-tab-btn ${activeTierTab === 'CONFIRMED_RUNTIME' ? 'active' : ''}`}
          onClick={() => setActiveTierTab('CONFIRMED_RUNTIME')}
        >
          <span className="dot blue" />
          Three.js Runtime ({pipelineSummary.confirmedRuntimeCount})
        </button>
        <button
          type="button"
          className={`tier-tab-btn ${activeTierTab === 'CONFIRMED_EXPERIMENT' ? 'active' : ''}`}
          onClick={() => setActiveTierTab('CONFIRMED_EXPERIMENT')}
        >
          <span className="dot purple" />
          Render Experiments ({pipelineSummary.confirmedExperimentCount})
        </button>
        <button
          type="button"
          className={`tier-tab-btn ${activeTierTab === 'POTENTIAL' ? 'active' : ''}`}
          onClick={() => setActiveTierTab('POTENTIAL')}
        >
          <span className="dot amber" />
          Potential Causes ({pipelineSummary.potentialCount})
        </button>
        <button
          type="button"
          className={`tier-tab-btn ${activeTierTab === 'UNKNOWN' ? 'active' : ''}`}
          onClick={() => setActiveTierTab('UNKNOWN')}
        >
          <span className="dot slate" />
          Unknown Factors ({pipelineSummary.unknownCount})
        </button>
      </div>

      {/* 3. ACTIVE EXPERIMENT CONTROL STRIP (NON-DESTRUCTIVE) */}
      <div className="active-experiments-strip">
        <div className="strip-title-wrap">
          <Sliders size={16} color="#c084fc" />
          <span className="strip-title">Interactive Render Experiment Engine</span>
          <span className="strip-note">(Non-destructive tests modify WebGL runtime only — GLB is never modified)</span>
        </div>
        <div className="strip-controls">
          <button
            type="button"
            className={`exp-btn ${hairMode === 'MASK' ? 'active-test' : ''}`}
            onClick={handleToggleHairMask}
          >
            {hairMode === 'MASK' ? '✓ Hair MASK Active' : 'Test Hair MASK (Cutoff)'}
          </button>
          <button
            type="button"
            className={`exp-btn ${!normalMapsEnabled ? 'active-test' : ''}`}
            onClick={handleToggleNormalMaps}
          >
            {!normalMapsEnabled ? '✓ Normal Maps Disabled' : 'Test Normal Maps A/B'}
          </button>
          {(hairMode === 'MASK' || !normalMapsEnabled || activeExperiments.experimentLog.length > 0) && (
            <button
              type="button"
              className="reset-exp-btn"
              onClick={handleResetAllExperiments}
            >
              <RefreshCw size={12} /> Reset Experiments
            </button>
          )}
        </div>
      </div>

      {/* 4. FINDINGS CARDS BY EVIDENCE TIER */}
      <div className="findings-cards-list">
        {displayedFindings.map((finding) => {
          const badge = getTierBadge(finding.classification);
          return (
            <div key={finding.id} className="finding-card">
              <div className="finding-header">
                <div className="finding-badge-wrap">
                  <span
                    className="finding-tier-badge"
                    style={{
                      backgroundColor: badge.bg,
                      color: badge.color,
                      borderColor: badge.border,
                    }}
                  >
                    {finding.classification}
                  </span>
                  <span className="finding-category-tag">{finding.category}</span>
                </div>
                {finding.experimentKey && (
                  <div className="card-experiment-action">
                    {finding.experimentKey === 'HAIR' && (
                      <button
                        type="button"
                        className={`inline-exp-btn ${hairMode === 'MASK' ? 'active' : ''}`}
                        onClick={handleToggleHairMask}
                      >
                        {hairMode === 'MASK' ? 'Switch back to BLEND' : 'Run Hair MASK Test'}
                      </button>
                    )}
                    {finding.experimentKey === 'NORMAL_MAPS' && (
                      <button
                        type="button"
                        className={`inline-exp-btn ${!normalMapsEnabled ? 'active' : ''}`}
                        onClick={handleToggleNormalMaps}
                      >
                        {!normalMapsEnabled ? 'Enable Normal Maps' : 'Disable Normal Maps (A/B)'}
                      </button>
                    )}
                  </div>
                )}
              </div>

              <h3 className="finding-title">{finding.title}</h3>
              <p className="finding-statement">
                <strong style={{ color: '#f1f5f9' }}>Finding:</strong> {finding.finding}
              </p>

              <div className="finding-details-grid">
                <div className="detail-item">
                  <span className="detail-label">Evidence</span>
                  <span className="detail-content">{finding.evidence}</span>
                </div>

                <div className="detail-item">
                  <span className="detail-label">Affected Objects</span>
                  <span className="detail-content">
                    {finding.affectedObjects.slice(0, 5).join(', ')}
                    {finding.affectedObjects.length > 5 && ` (+${finding.affectedObjects.length - 5} more)`}
                  </span>
                </div>

                <div className="detail-item full-width">
                  <span className="detail-label">Why It Can Change Appearance</span>
                  <span className="detail-content">{finding.whyItCanChangeAppearance}</span>
                </div>

                {finding.suggestedExperiment && (
                  <div className="detail-item full-width experiment-callout">
                    <span className="detail-label">Suggested Experiment</span>
                    <span className="detail-content">{finding.suggestedExperiment}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 5. MATERIAL COMPATIBILITY INSPECTOR (19 FEATURES AUDITED) */}
      <div className="collapsible-audit-section">
        <button
          type="button"
          className="toggle-section-btn"
          onClick={() => setShowMaterialAuditTable(!showMaterialAuditTable)}
        >
          <div className="btn-title-wrap">
            <Layers size={18} color="#60a5fa" />
            <span>PBR Material Pipeline Breakdown ({materialAudits.length} Materials Inspected)</span>
          </div>
          {showMaterialAuditTable ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>

        {showMaterialAuditTable && (
          <div className="audit-content-body">
            <p className="table-intro">
              Inspects how each material property exported from Blender Principled BSDF maps to glTF 2.0 and is interpreted at runtime by Three.js.
            </p>
            <div className="table-scroll-container">
              <table className="pipeline-data-table">
                <thead>
                  <tr>
                    <th>Material</th>
                    <th>Alpha Mode</th>
                    <th>Metalness</th>
                    <th>Roughness</th>
                    <th>Normal Map</th>
                    <th>Runtime Three.js State</th>
                    <th>Blender Export Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {materialAudits.map((mat) => (
                    <tr key={mat.materialIndex}>
                      <td>
                        <strong>{mat.materialName}</strong>
                        <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{mat.materialType}</div>
                      </td>
                      <td>
                        <span className={`pill ${mat.alphaMode === 'BLEND' ? 'warning' : 'neutral'}`}>
                          {mat.alphaMode}
                        </span>
                      </td>
                      <td>
                        <span className={`pill ${mat.hasHighMetalness ? 'amber' : 'neutral'}`}>
                          {mat.features.find((f) => f.featureName === 'Metallic Factor')?.valueInGlb || '0.00'}
                        </span>
                      </td>
                      <td>{mat.features.find((f) => f.featureName === 'Roughness Factor')?.valueInGlb || '1.00'}</td>
                      <td>{mat.features.find((f) => f.featureName === 'Normal Map')?.valueInGlb || 'None'}</td>
                      <td>
                        {mat.runtimeInspection ? (
                          <div style={{ fontSize: '0.74rem', lineHeight: '1.4' }}>
                            <div>transparent: {String(mat.runtimeInspection.transparent)}</div>
                            <div>depthWrite: {String(mat.runtimeInspection.depthWrite)}</div>
                            <div>alphaTest: {mat.runtimeInspection.alphaTest}</div>
                            <div>side: {mat.runtimeInspection.side}</div>
                          </div>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>Awaiting runtime inspect</span>
                        )}
                      </td>
                      <td>
                        <span style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>
                          {mat.isHairOrThinGeometry
                            ? 'Hair geometry: BLEND mode turns off depth writing in Three.js.'
                            : mat.hasHighMetalness
                            ? 'High metalness: relies completely on environment reflections (IBL).'
                            : 'Standard PBR metallic-roughness mapping.'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* 6. NORMAL TANGENT AUDIT INSPECTOR (SECTION 6 & 20) */}
      <div className="collapsible-audit-section">
        <button
          type="button"
          className="toggle-section-btn"
          onClick={() => setShowNormalAuditTable(!showNormalAuditTable)}
        >
          <div className="btn-title-wrap">
            <Sun size={18} color="#fbbf24" />
            <span>Normal & Tangent Primitives Audit ({normalAudits.length} Primitives)</span>
          </div>
          {showNormalAuditTable ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>

        {showNormalAuditTable && (
          <div className="audit-content-body">
            <p className="table-intro">
              Audit of primitives using normal maps. Highlights whether per-vertex TANGENT vectors are precomputed in the GLB or generated dynamically at runtime via screen-space derivatives.
            </p>
            <div className="table-scroll-container">
              <table className="pipeline-data-table">
                <thead>
                  <tr>
                    <th>Mesh / Primitive</th>
                    <th>Material</th>
                    <th>NORMAL</th>
                    <th>UV0</th>
                    <th>TANGENT</th>
                    <th>Skinning</th>
                    <th>Runtime Handling</th>
                  </tr>
                </thead>
                <tbody>
                  {normalAudits.map((prim) => (
                    <tr key={`${prim.meshIndex}_${prim.primitiveIndex}`}>
                      <td>
                        <strong>{prim.meshName}</strong> (Prim #{prim.primitiveIndex})
                      </td>
                      <td>{prim.materialName}</td>
                      <td>{prim.hasNormalAttribute ? '✓ Yes' : '✕ No'}</td>
                      <td>{prim.hasTexCoord0 ? '✓ Yes' : '✕ No'}</td>
                      <td>
                        <span className={`pill ${prim.hasTangentAttribute ? 'green' : 'amber'}`}>
                          {prim.hasTangentAttribute ? '✓ Present' : 'Absent (No TANGENT)'}
                        </span>
                      </td>
                      <td>{prim.hasSkinning ? 'Skinned (Joints/Weights)' : 'Static'}</td>
                      <td>
                        <span style={{ fontSize: '0.75rem', color: '#93c5fd' }}>
                          {prim.runtimeTangentHandling}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* 7. OPTIONAL SECONDARY TOOL: BLENDER SCREENSHOT COMPARISON (SECTION 14) */}
      <div className="collapsible-audit-section optional-tool-wrap">
        <button
          type="button"
          className="toggle-section-btn"
          onClick={() => setShowOptionalScreenshotTool(!showOptionalScreenshotTool)}
        >
          <div className="btn-title-wrap">
            <Camera size={18} color="#a855f7" />
            <span>Optional Visual Validation (Blender Screenshot Upload & Difference Wipe)</span>
            <span className="optional-badge">OPTIONAL SECONDARY EXPERIMENT</span>
          </div>
          {showOptionalScreenshotTool ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>

        {showOptionalScreenshotTool && (
          <div className="audit-content-body">
            <p className="table-intro">
              This is an optional visual experiment. If you have a screenshot from Blender, upload it below to compare side-by-side with the Three.js viewport render.
            </p>
            <div className="optional-comparison-grid">
              <div className="comparison-slot">
                <h4>Blender Reference (Optional)</h4>
                <label className="upload-box-btn">
                  <Upload size={14} /> Upload Blender Screenshot
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    style={{ display: 'none' }}
                    onChange={handleBlenderUpload}
                  />
                </label>
                {blenderImage && (
                  <div className="preview-image-wrap">
                    <img src={blenderImage} alt="Blender Reference" />
                  </div>
                )}
              </div>

              <div className="comparison-slot">
                <h4>Three.js WebGL Capture</h4>
                <button type="button" className="capture-canvas-btn" onClick={handleCaptureClick}>
                  <Camera size={14} /> Capture Canvas Pixels
                </button>
                {capturedThreeImage && (
                  <div className="preview-image-wrap">
                    <img src={capturedThreeImage} alt="Three.js Capture" />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
