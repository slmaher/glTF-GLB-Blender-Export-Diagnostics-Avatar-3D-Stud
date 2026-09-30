import React, { useState } from 'react';
import type {
  BlenderCompatibilityReport,
  CompatibilityCategory,
} from '../types/compatibility';
import {
  Sparkles,
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Info,
  Layers,
  Palette,
  Sun,
  Maximize2,
  User,
  Sliders,
  ShieldCheck,
  Search,
  Zap,
} from 'lucide-react';
import './BlenderCompatibilityView.css';

interface BlenderCompatibilityViewProps {
  compatibility?: BlenderCompatibilityReport | null;
}

export const BlenderCompatibilityView: React.FC<BlenderCompatibilityViewProps> = ({
  compatibility,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFindings, setExpandedFindings] = useState<Record<string, boolean>>({});
  const [showDeductionLog, setShowDeductionLog] = useState(false);

  if (!compatibility) {
    return null;
  }

  const overallScore = typeof compatibility.overallScore === 'number' ? compatibility.overallScore : 85;
  const scores = compatibility.scores || ({} as any);
  const prioritizedCauses = Array.isArray(compatibility.prioritizedCauses) ? compatibility.prioritizedCauses : [];
  const findings = Array.isArray(compatibility.findings) ? compatibility.findings : [];
  const knownVsUnknown = compatibility.knownVsUnknown || { verifiedFromGlb: [], cannotBeVerified: [] };
  const verifiedList = Array.isArray(knownVsUnknown.verifiedFromGlb) ? knownVsUnknown.verifiedFromGlb : [];
  const cannotVerifyList = Array.isArray(knownVsUnknown.cannotBeVerified) ? knownVsUnknown.cannotBeVerified : [];
  const comparisonChecklist = Array.isArray(compatibility.comparisonChecklist) ? compatibility.comparisonChecklist : [];
  const avatarReadiness = compatibility.avatarReadiness || ({} as any);
  const lightingDisclaimer = compatibility.lightingDisclaimer || 'Blender scene lighting cannot be fully reconstructed from this GLB.';

  const matScore = scores.materials?.score ?? 100;
  const matDeductions = scores.materials?.deductions ?? [];
  const texScore = scores.textures?.score ?? 100;
  const texDeductions = scores.textures?.deductions ?? [];
  const lightScore = scores.lighting?.score ?? 85;
  const colorScore = scores.colorManagement?.score ?? 90;
  const geomScore = scores.geometry?.score ?? 100;
  const geomDeductions = scores.geometry?.deductions ?? [];
  const avatarScore = scores.avatar?.score ?? 100;
  const deductionLog = Array.isArray(scores.deductionLog) ? scores.deductionLog : [];

  const isAvatar = Boolean(avatarReadiness?.isAvatar);
  const suitabilityStatus = avatarReadiness?.suitabilityStatus || 'Compatible';
  const avatarRecs = Array.isArray(avatarReadiness?.recommendations) ? avatarReadiness.recommendations : [];

  const toggleFinding = (id: string) => {
    setExpandedFindings((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const expandAll = () => {
    const allExpanded: Record<string, boolean> = {};
    findings.forEach((f) => {
      if (f && f.id) allExpanded[f.id] = true;
    });
    setExpandedFindings(allExpanded);
  };

  const collapseAll = () => {
    setExpandedFindings({});
  };

  // Safe filter findings
  const filteredFindings = findings.filter((f) => {
    if (!f) return false;
    if (selectedCategory !== 'all' && f.category !== selectedCategory) return false;
    if (selectedSeverity !== 'all' && f.severity !== selectedSeverity) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = (f.title || '').toLowerCase().includes(q);
      const matchItem = (f.affectedItem || '').toLowerCase().includes(q);
      const matchProblem = (f.problem || '').toLowerCase().includes(q);
      const matchEvidence = (f.evidence || '').toLowerCase().includes(q);
      if (!matchTitle && !matchItem && !matchProblem && !matchEvidence) return false;
    }
    return true;
  });

  const getScoreColorClass = (score: number) => {
    if (score >= 85) return 'score-good';
    if (score >= 60) return 'score-warn';
    return 'score-crit';
  };

  const categories: CompatibilityCategory[] = [
    'Materials & Shaders',
    'Procedural Shaders',
    'Color Management',
    'Textures',
    'Normals & Tangents',
    'Lighting & Environment',
    'Geometry & Transforms',
    'Skinning & Avatar',
  ];

  return (
    <section className="section-block blender-compat-section" id="blender-compatibility">
      {/* Header */}
      <div className="section-header">
        <div className="section-title-wrap">
          <div className="section-badge">
            <Sparkles size={14} /> Comprehensive Engine Audit
          </div>
          <h2 className="section-title">Blender ↔ Web Render Compatibility</h2>
          <p className="section-subtitle">
            Explaining exactly <strong>why this asset can look different in Blender compared with Three.js / WebGL</strong> based on verifiable glTF data and pipeline limits.
          </p>
        </div>

        <div className="overall-score-pill">
          <div className="score-meter-wrap">
            <span className="score-label">Overall Compatibility</span>
            <span className={`score-value ${getScoreColorClass(overallScore)}`}>
              {overallScore}
              <small>/100</small>
            </span>
          </div>
        </div>
      </div>

      {/* Category Score Grid */}
      <div className="compat-score-grid">
        <div className={`score-card ${getScoreColorClass(matScore)}`}>
          <div className="score-card-header">
            <span className="score-cat-title"><Palette size={16} /> Materials & PBR</span>
            <span className="score-num">{matScore}%</span>
          </div>
          <div className="score-bar-bg">
            <div className="score-bar-fill" style={{ width: `${matScore}%` }} />
          </div>
          <p className="score-subtext">
            {matDeductions.length === 0
              ? 'Zero material discrepancies'
              : `${matDeductions.length} deduction factor(s)`}
          </p>
        </div>

        <div className={`score-card ${getScoreColorClass(texScore)}`}>
          <div className="score-card-header">
            <span className="score-cat-title"><Layers size={16} /> Textures & Memory</span>
            <span className="score-num">{texScore}%</span>
          </div>
          <div className="score-bar-bg">
            <div className="score-bar-fill" style={{ width: `${texScore}%` }} />
          </div>
          <p className="score-subtext">
            {texDeductions.length === 0
              ? 'Clean texture channels'
              : `${texDeductions.length} texture alert(s)`}
          </p>
        </div>

        <div className={`score-card ${getScoreColorClass(lightScore)}`}>
          <div className="score-card-header">
            <span className="score-cat-title"><Sun size={16} /> Lighting & IBL</span>
            <span className="score-num">{lightScore}%</span>
          </div>
          <div className="score-bar-bg">
            <div className="score-bar-fill" style={{ width: `${lightScore}%` }} />
          </div>
          <p className="score-subtext">Requires host scene HDRI</p>
        </div>

        <div className={`score-card ${getScoreColorClass(colorScore)}`}>
          <div className="score-card-header">
            <span className="score-cat-title"><Sliders size={16} /> Color Management</span>
            <span className="score-num">{colorScore}%</span>
          </div>
          <div className="score-bar-bg">
            <div className="score-bar-fill" style={{ width: `${colorScore}%` }} />
          </div>
          <p className="score-subtext">Blender AgX vs WebGL ACES</p>
        </div>

        <div className={`score-card ${getScoreColorClass(geomScore)}`}>
          <div className="score-card-header">
            <span className="score-cat-title"><Maximize2 size={16} /> Geometry & Tangents</span>
            <span className="score-num">{geomScore}%</span>
          </div>
          <div className="score-bar-bg">
            <div className="score-bar-fill" style={{ width: `${geomScore}%` }} />
          </div>
          <p className="score-subtext">
            {geomDeductions.length === 0
              ? 'Clean vertex attributes'
              : `${geomDeductions.length} geometry alert(s)`}
          </p>
        </div>

        <div className={`score-card ${getScoreColorClass(avatarScore)}`}>
          <div className="score-card-header">
            <span className="score-cat-title"><User size={16} /> Avatar & Skinning</span>
            <span className="score-num">
              {isAvatar ? `${avatarScore}%` : 'N/A'}
            </span>
          </div>
          <div className="score-bar-bg">
            <div
              className="score-bar-fill"
              style={{ width: `${isAvatar ? avatarScore : 100}%` }}
            />
          </div>
          <p className="score-subtext">
            {isAvatar
              ? `${avatarReadiness.boneCount ?? 0} bones, ${avatarReadiness.morphTargetCount ?? 0} morphs`
              : 'Static asset (no skinning)'}
          </p>
        </div>
      </div>

      {/* Transparent Deduction Breakdown Toggle */}
      <div className="deduction-log-toggle-wrap">
        <button
          type="button"
          className="transparent-scoring-btn"
          onClick={() => setShowDeductionLog(!showDeductionLog)}
        >
          <ShieldCheck size={16} />
          {showDeductionLog ? 'Hide Transparent Scoring Breakdown' : 'View Transparent Scoring Breakdown'}
          {showDeductionLog ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {showDeductionLog && (
          <div className="deduction-log-card">
            <h4>Transparent Score Deduction Breakdown</h4>
            <p className="deduction-intro">
              Compatibility scores start at 100% and deduct points based on verifiable technical factors that cause visible deviation between Blender and WebGL:
            </p>
            {deductionLog.length === 0 ? (
              <p className="clean-deductions">✓ No point deductions recorded. Asset adheres strictly to WebGL glTF 2.0 PBR standards.</p>
            ) : (
              <ul className="deduction-list">
                {deductionLog.map((item, idx) => (
                  <li key={idx} className="deduction-item">
                    <span className="deduction-badge">-{item.points} pts</span>
                    <span className="deduction-category">[{item.category}]</span>
                    <span className="deduction-reason">{item.reason}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Lighting Disclaimer Banner */}
      <div className="lighting-disclaimer-card">
        <Sun size={18} className="lighting-disclaimer-icon" />
        <div className="lighting-disclaimer-body">
          <strong>Fundamental Pipeline Advisory:</strong>
          <p>{lightingDisclaimer}</p>
        </div>
      </div>

      {/* MOST IMPORTANT FEATURE: # Why Does Blender Look Different? */}
      {prioritizedCauses.length > 0 && (
        <div className="difference-diagnosis-card">
          <div className="diagnosis-header">
            <div className="diagnosis-title-group">
              <div className="pulse-dot" />
              <h3># Why Does Blender Look Different?</h3>
            </div>
            <span className="diagnosis-tagline">Prioritized Root Causes</span>
          </div>
          <p className="diagnosis-description">
            The following list ranks the most probable causes of visual discrepancy between Blender and Three.js for this specific model, ordered by perceptual impact:
          </p>

          <div className="prioritized-causes-list">
            {prioritizedCauses.map((cause, idx) => {
              const priorityLower = (cause.priority || 'MEDIUM').toLowerCase();
              return (
                <div key={idx} className={`cause-item cause-${priorityLower}`}>
                  <div className="cause-rank">
                    <span className="rank-num">#{idx + 1}</span>
                    <span className={`priority-badge badge-${priorityLower}`}>
                      {cause.priority || 'MEDIUM'} PRIORITY
                    </span>
                  </div>

                  <div className="cause-content">
                    <div className="cause-title-row">
                      <h4 className="cause-title">{cause.title}</h4>
                      <span className="cause-category-tag">{cause.category}</span>
                    </div>
                    <div className="cause-affected">
                      <strong>Affected Component:</strong> <code>{cause.affectedItem}</code>
                    </div>
                    <p className="cause-reason">{cause.technicalReason}</p>

                    <div className="cause-comparison-boxes">
                      <div className="cmp-box cmp-blender">
                        <span className="cmp-label">Expected in Blender:</span>
                        <p>{cause.expectedBlenderBehavior}</p>
                      </div>
                      <div className="cmp-box cmp-three">
                        <span className="cmp-label">Expected in Three.js / WebGL:</span>
                        <p>{cause.expectedThreeJsBehavior}</p>
                      </div>
                    </div>

                    <div className="cause-fix">
                      <Zap size={14} className="fix-icon" />
                      <div>
                        <strong>Actionable Fix:</strong> {cause.recommendedFix}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Comparison Checklist */}
      {comparisonChecklist.length > 0 && (
        <div className="checklist-card">
          <div className="card-header-simple">
            <h3>Blender → GLB → Three.js Pipeline Checklist</h3>
            <span className="checklist-legend">
              <span><code>✓</code> Verified</span>
              <span><code>⚠</code> Attention</span>
              <span><code>✕</code> Critical</span>
              <span><code>?</code> Not Stored in GLB</span>
            </span>
          </div>

          <div className="checklist-table-wrap">
            <table className="checklist-table">
              <thead>
                <tr>
                  <th>Feature Pipeline</th>
                  <th>Status</th>
                  <th>Original in Blender</th>
                  <th>WebGL / Three.js Translation</th>
                  <th>Technical Verification Notes</th>
                </tr>
              </thead>
              <tbody>
                {comparisonChecklist.map((item, idx) => (
                  <tr key={idx} className={`status-row-${item.status === '✓' ? 'pass' : item.status === '⚠' ? 'warn' : item.status === '✕' ? 'crit' : 'unknown'}`}>
                    <td className="feature-name">
                      <strong>{item.feature}</strong>
                    </td>
                    <td>
                      <span className={`symbol-badge symbol-${item.status === '✓' ? 'pass' : item.status === '⚠' ? 'warn' : item.status === '✕' ? 'crit' : 'unknown'}`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="pipeline-cell">{item.blenderStatus}</td>
                    <td className="pipeline-cell">{item.threeJsStatus}</td>
                    <td className="note-cell">{item.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Known vs Unknown Section */}
      <div className="known-unknown-container">
        <div className="known-col">
          <div className="col-header verified-header">
            <CheckCircle2 size={18} />
            <div>
              <h4>Verified from GLB Asset</h4>
              <span>Directly parsed from file bytes and headers</span>
            </div>
          </div>
          <div className="known-items-list">
            {verifiedList.map((item, idx) => (
              <div key={idx} className="known-item verified">
                <div className="item-title-row">
                  <strong>{item.feature}</strong>
                  <span className="source-tag">{item.source}</span>
                </div>
                <p>{item.details}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="unknown-col">
          <div className="col-header unknown-header">
            <HelpCircle size={18} />
            <div>
              <h4>Cannot Be Verified from GLB Asset</h4>
              <span>External to file (belongs to host renderer or original scene)</span>
            </div>
          </div>
          <div className="known-items-list">
            {cannotVerifyList.map((item, idx) => (
              <div key={idx} className="known-item unknown">
                <div className="item-title-row">
                  <strong>{item.feature}</strong>
                  <span className="source-tag-unknown">{item.source}</span>
                </div>
                <p>{item.details}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Avatar / Real-Time Web Animation Readiness (if avatar detected) */}
      {isAvatar && (
        <div className="avatar-readiness-card">
          <div className="avatar-header">
            <div className="avatar-title-group">
              <User size={20} className="avatar-icon" />
              <div>
                <h3>Character & Avatar Real-Time Web Animation Readiness</h3>
                <span className="avatar-subtitle">
                  Inspection of Armature, Bones, Weight Influences, and ARKit / Facial Blendshapes
                </span>
              </div>
            </div>
            <span className={`suitability-badge badge-${suitabilityStatus.toLowerCase().replace(/[^a-z]/g, '')}`}>
              {suitabilityStatus}
            </span>
          </div>

          <div className="avatar-stats-grid">
            <div className="avatar-stat-tile">
              <span className="stat-label">Total Bones</span>
              <span className="stat-val">{avatarReadiness.boneCount ?? 0}</span>
              <span className="stat-hint">{(avatarReadiness.boneCount ?? 0) <= 120 ? 'Optimal (≤ 120)' : 'Heavy (> 120)'}</span>
            </div>
            <div className="avatar-stat-tile">
              <span className="stat-label">Max Weights / Vertex</span>
              <span className="stat-val">{avatarReadiness.maxJointsPerVertex ?? 0}</span>
              <span className="stat-hint">{(avatarReadiness.maxJointsPerVertex ?? 0) <= 4 ? 'Standard WebGL (4)' : 'Requires JOINTS_1 (8)'}</span>
            </div>
            <div className="avatar-stat-tile">
              <span className="stat-label">Morph Targets</span>
              <span className="stat-val">{avatarReadiness.morphTargetCount ?? 0}</span>
              <span className="stat-hint">{(avatarReadiness.morphTargetCount ?? 0) > 0 ? 'Blendshapes Present' : 'Rig Only'}</span>
            </div>
            <div className="avatar-stat-tile">
              <span className="stat-label">ARKit 52 Standard</span>
              <span className="stat-val">{avatarReadiness.arkitStandardCount ?? 0} / 52</span>
              <span className="stat-hint">{(avatarReadiness.arkitStandardCount ?? 0) >= 40 ? 'Full AR Tracking Ready' : 'Custom / Partial'}</span>
            </div>
            <div className="avatar-stat-tile">
              <span className="stat-label">Jaw Control (jawOpen)</span>
              <span className="stat-val">{avatarReadiness.hasJawControl ? 'Yes' : 'Missing'}</span>
              <span className="stat-hint">Required for Speech/Lip-sync</span>
            </div>
            <div className="avatar-stat-tile">
              <span className="stat-label">Eye Blink / Gaze</span>
              <span className="stat-val">{avatarReadiness.hasEyeBlinkOrGaze ? 'Yes' : 'Missing'}</span>
              <span className="stat-hint">Natural idle movement</span>
            </div>
          </div>

          {avatarRecs.length > 0 && (
            <div className="avatar-recommendations">
              <strong>Avatar Optimization Recommendations:</strong>
              <ul>
                {avatarRecs.map((rec: string, idx: number) => (
                  <li key={idx}>{rec}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Detailed Diagnostic Findings */}
      <div className="findings-section-wrap">
        <div className="findings-controls">
          <div className="findings-title-group">
            <h3>Detailed Compatibility Findings ({filteredFindings.length})</h3>
            <div className="expand-collapse-actions">
              <button type="button" className="text-btn" onClick={expandAll}>Expand All</button>
              <span>•</span>
              <button type="button" className="text-btn" onClick={collapseAll}>Collapse All</button>
            </div>
          </div>

          <div className="filters-toolbar">
            <div className="search-box">
              <Search size={14} />
              <input
                type="text"
                placeholder="Search findings by material, mesh, or keyword..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="filter-selects">
              <select
                value={selectedSeverity}
                onChange={(e) => setSelectedSeverity(e.target.value)}
                className="filter-select"
              >
                <option value="all">All Severities</option>
                <option value="critical">Critical Only</option>
                <option value="warning">Warnings Only</option>
                <option value="info">Info Only</option>
              </select>

              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="filter-select"
              >
                <option value="all">All Categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {filteredFindings.length === 0 ? (
          <div className="empty-findings-box">
            <CheckCircle2 size={32} color="#10b981" />
            <h4>No findings match your filter criteria</h4>
            <p>Try clearing filters or search query.</p>
          </div>
        ) : (
          <div className="findings-accordion-list">
            {filteredFindings.map((finding) => {
              const isExpanded = expandedFindings[finding.id] ?? false;
              const severityIcon =
                finding.severity === 'critical' ? (
                  <AlertOctagon size={18} className="icon-critical" />
                ) : finding.severity === 'warning' ? (
                  <AlertTriangle size={18} className="icon-warning" />
                ) : (
                  <Info size={18} className="icon-info" />
                );

              const sevStr = finding.severity || 'info';

              return (
                <div
                  key={finding.id}
                  className={`finding-card severity-${sevStr} ${isExpanded ? 'is-expanded' : ''}`}
                >
                  <div className="finding-header" onClick={() => toggleFinding(finding.id)}>
                    <div className="finding-header-left">
                      {severityIcon}
                      <div>
                        <div className="finding-badges-row">
                          <span className={`finding-sev-badge badge-${sevStr}`}>
                            {sevStr.toUpperCase()}
                          </span>
                          <span className="finding-cat-badge">{finding.category}</span>
                        </div>
                        <h4 className="finding-title">{finding.title}</h4>
                      </div>
                    </div>

                    <div className="finding-header-right">
                      <span className="affected-item-preview">{finding.affectedItem}</span>
                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="finding-body">
                      <div className="finding-quad-grid">
                        <div className="quad-item quad-problem">
                          <span className="quad-label">Problem:</span>
                          <p>{finding.problem}</p>
                        </div>

                        <div className="quad-item quad-evidence">
                          <span className="quad-label">Evidence in Asset:</span>
                          <p><code>{finding.evidence}</code></p>
                        </div>

                        <div className="quad-item quad-why">
                          <span className="quad-label">Why It Matters:</span>
                          <p>{finding.whyItMatters}</p>
                        </div>

                        <div className="quad-item quad-fix">
                          <span className="quad-label">Recommended Fix:</span>
                          <p>{finding.recommendedFix}</p>
                        </div>
                      </div>

                      <div className="finding-engine-comparison">
                        <div className="engine-cell blender-cell">
                          <span className="engine-cell-label">Expected Blender Behavior:</span>
                          <p>{finding.expectedBlenderBehavior}</p>
                        </div>
                        <div className="engine-cell three-cell">
                          <span className="engine-cell-label">Expected Three.js Behavior:</span>
                          <p>{finding.expectedThreeJsBehavior}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
