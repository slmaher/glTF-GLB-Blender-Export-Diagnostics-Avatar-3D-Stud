import React, { useState } from 'react';
import type { MaterialAnalysis } from '../types/diagnostic';
import { AlertTriangle, Sparkles, ChevronDown, ChevronRight } from 'lucide-react';

interface MaterialsTableProps {
  materials: MaterialAnalysis[];
}

export const MaterialsTable: React.FC<MaterialsTableProps> = ({ materials }) => {
  const [expandedMaterial, setExpandedMaterial] = useState<number | null>(0);

  const toggleExpand = (idx: number) => {
    setExpandedMaterial((prev) => (prev === idx ? null : idx));
  };

  const rgbaToCss = (factor: [number, number, number, number]) => {
    const r = Math.round(factor[0] * 255);
    const g = Math.round(factor[1] * 255);
    const b = Math.round(factor[2] * 255);
    const a = factor[3] !== undefined ? factor[3] : 1;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  };

  return (
    <section className="section-block materials-section" id="materials-inspection">
      <div className="section-header">
        <div className="section-title-wrap">
          <h2 className="section-title">Materials Analysis ({materials.length})</h2>
          <p className="section-subtitle">
            Inspect PBR parameters, texture slot bindings, alpha modes, and glTF material extensions.
          </p>
        </div>
      </div>

      {materials.length === 0 ? (
        <div className="empty-notice-card">No materials found in file (default material will be used).</div>
      ) : (
        <div className="materials-list">
          {materials.map((mat) => {
            const isExpanded = expandedMaterial === mat.index;
            const hasWarnings = mat.diagnostics.length > 0;
            const colorCss = rgbaToCss(mat.baseColorFactor);

            return (
              <div
                key={mat.index}
                className={`material-item-card ${isExpanded ? 'expanded' : ''} ${hasWarnings ? 'has-advisory' : ''}`}
              >
                <div className="material-card-summary" onClick={() => toggleExpand(mat.index)}>
                  <div className="summary-left">
                    <button type="button" className="expand-chevron">
                      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>

                    <div
                      className="color-swatch-badge"
                      style={{ backgroundColor: colorCss }}
                      title={`Base Color: ${colorCss}`}
                    />

                    <div className="mat-title-group">
                      <span className="mat-name">{mat.name}</span>
                      <span className="mat-id">#{mat.index}</span>
                      <span className="mat-type-pill">{mat.type}</span>
                    </div>
                  </div>

                  <div className="summary-badges">
                    <span className={`alpha-pill mode-${mat.alphaMode.toLowerCase()}`}>
                      Alpha: {mat.alphaMode} {mat.alphaMode === 'MASK' ? `(${mat.alphaCutoff})` : ''}
                    </span>

                    {mat.doubleSided && (
                      <span className="info-pill double-sided" title="Renders both front and back faces">
                        Double-Sided
                      </span>
                    )}

                    {mat.extensions.length > 0 && (
                      <span className="ext-badge-count">
                        <Sparkles size={11} /> {mat.extensions.length} Extension{mat.extensions.length === 1 ? '' : 's'}
                      </span>
                    )}

                    {hasWarnings && (
                      <span className="warn-badge-pill" title="Has advisory diagnostics">
                        <AlertTriangle size={12} /> {mat.diagnostics.length} Notice{mat.diagnostics.length === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="material-detail-panel">
                    {/* Material Diagnostics Alerts */}
                    {mat.diagnostics.length > 0 && (
                      <div className="mat-diagnostics-box">
                        <div className="box-title">
                          <AlertTriangle size={14} color="#f59e0b" /> Material Diagnostics:
                        </div>
                        <ul className="box-list">
                          {mat.diagnostics.map((d, i) => (
                            <li key={i}>{d}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* PBR Properties Grid */}
                    <div className="props-subgrid">
                      <div className="prop-box">
                        <span className="prop-label">Base Color Factor (RGBA):</span>
                        <div className="prop-val-row">
                          <span className="inline-swatch" style={{ backgroundColor: colorCss }} />
                          <code>
                            [{mat.baseColorFactor.map((v) => v.toFixed(3)).join(', ')}]
                          </code>
                        </div>
                      </div>

                      <div className="prop-box">
                        <span className="prop-label">Metallic Factor:</span>
                        <div className="prop-val-row">
                          <div className="factor-bar-wrap">
                            <div className="factor-bar" style={{ width: `${Math.min(mat.metallicFactor * 100, 100)}%` }} />
                          </div>
                          <code>{mat.metallicFactor.toFixed(3)}</code>
                        </div>
                      </div>

                      <div className="prop-box">
                        <span className="prop-label">Roughness Factor:</span>
                        <div className="prop-val-row">
                          <div className="factor-bar-wrap">
                            <div className="factor-bar" style={{ width: `${Math.min(mat.roughnessFactor * 100, 100)}%` }} />
                          </div>
                          <code>{mat.roughnessFactor.toFixed(3)}</code>
                        </div>
                      </div>

                      <div className="prop-box">
                        <span className="prop-label">Emissive Factor (RGB):</span>
                        <div className="prop-val-row">
                          <code>[{mat.emissiveFactor.join(', ')}]</code>
                        </div>
                      </div>
                    </div>

                    {/* Textures Slot Assignment */}
                    <div className="texture-slots-container">
                      <h4 className="slots-title">Bound Texture Channels</h4>
                      <div className="slots-grid">
                        <div className={`slot-card ${mat.baseColorTexture ? 'bound' : 'empty'}`}>
                          <span className="slot-channel">Base Color (sRGB)</span>
                          {mat.baseColorTexture ? (
                            <div className="slot-info">
                              <span className="tex-name">{mat.baseColorTexture.textureName}</span>
                              <span className="tex-idx">Texture Index #{mat.baseColorTexture.textureIndex}</span>
                              {mat.baseColorTexture.hasTransform && (
                                <span className="transform-pill">KHR_texture_transform</span>
                              )}
                            </div>
                          ) : (
                            <span className="slot-empty">No texture bound (uses baseColorFactor)</span>
                          )}
                        </div>

                        <div className={`slot-card ${mat.normalTexture ? 'bound' : 'empty'}`}>
                          <span className="slot-channel">Normal Map (Linear / Tangent-Space)</span>
                          {mat.normalTexture ? (
                            <div className="slot-info">
                              <span className="tex-name">{mat.normalTexture.textureName}</span>
                              <span className="tex-scale">Scale: {mat.normalScale}</span>
                              <span className="tex-idx">Texture Index #{mat.normalTexture.textureIndex}</span>
                              {mat.normalTexture.hasTransform && (
                                <span className="transform-pill">KHR_texture_transform</span>
                              )}
                            </div>
                          ) : (
                            <span className="slot-empty">No normal map</span>
                          )}
                        </div>

                        <div className={`slot-card ${mat.metallicRoughnessTexture ? 'bound' : 'empty'}`}>
                          <span className="slot-channel">Metallic / Roughness (G=Roughness, B=Metallic)</span>
                          {mat.metallicRoughnessTexture ? (
                            <div className="slot-info">
                              <span className="tex-name">{mat.metallicRoughnessTexture.textureName}</span>
                              <span className="tex-idx">Texture Index #{mat.metallicRoughnessTexture.textureIndex}</span>
                            </div>
                          ) : (
                            <span className="slot-empty">No packed texture (uses uniform factors)</span>
                          )}
                        </div>

                        <div className={`slot-card ${mat.occlusionTexture ? 'bound' : 'empty'}`}>
                          <span className="slot-channel">Ambient Occlusion (R channel)</span>
                          {mat.occlusionTexture ? (
                            <div className="slot-info">
                              <span className="tex-name">{mat.occlusionTexture.textureName}</span>
                              <span className="tex-strength">Strength: {mat.occlusionStrength}</span>
                            </div>
                          ) : (
                            <span className="slot-empty">No AO map</span>
                          )}
                        </div>

                        <div className={`slot-card ${mat.emissiveTexture ? 'bound' : 'empty'}`}>
                          <span className="slot-channel">Emissive Map (sRGB)</span>
                          {mat.emissiveTexture ? (
                            <div className="slot-info">
                              <span className="tex-name">{mat.emissiveTexture.textureName}</span>
                            </div>
                          ) : (
                            <span className="slot-empty">No emissive map</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Material Extensions Section */}
                    {mat.extensions.length > 0 && (
                      <div className="material-extensions-container">
                        <h4 className="slots-title">glTF Material Extensions Applied ({mat.extensions.length})</h4>
                        <div className="ext-cards-grid">
                          {mat.extensions.map((ext) => (
                            <div key={ext.name} className="mat-ext-card">
                              <div className="ext-header">
                                <span className="ext-name"><code>{ext.name}</code></span>
                                <span className="three-compat-pill">{ext.threeJsSupport}</span>
                              </div>
                              <p className="ext-desc">{ext.description}</p>
                              <div className="ext-impact">
                                <span className="impact-label">Visual Impact:</span> {ext.renderingImpact}
                              </div>
                              {ext.data && Object.keys(ext.data).length > 0 && (
                                <details className="ext-raw-details">
                                  <summary>View raw extension parameters</summary>
                                  <pre>{JSON.stringify(ext.data, null, 2)}</pre>
                                </details>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
