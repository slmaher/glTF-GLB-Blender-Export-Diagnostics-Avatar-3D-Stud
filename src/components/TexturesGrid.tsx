import React, { useState } from 'react';
import type { TextureAnalysis } from '../types/diagnostic';
import {
  Image as ImageIcon,
  AlertTriangle,
  EyeOff,
  CheckCircle2,
  XCircle,
  Table as TableIcon,
  LayoutGrid,
  ChevronDown,
  ChevronUp,
  Info,
} from 'lucide-react';

interface TexturesGridProps {
  textures: TextureAnalysis[];
}

export const TexturesGrid: React.FC<TexturesGridProps> = ({ textures }) => {
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);

  // Compute validation summary metrics
  const validCount = textures.filter((t) => t.validationStatus === 'VALID').length;
  const errorCount = textures.filter((t) => t.validationStatus === 'ERROR').length;
  const warningCount = textures.filter((t) => t.validationStatus === 'WARNING').length;
  const embeddedCount = textures.filter((t) => t.storage === 'Embedded GLB').length;
  const decodedCount = textures.filter((t) => t.decodeStatus === 'PASS').length;

  return (
    <section className="section-block textures-section" id="textures-and-images">
      <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div className="section-title-wrap">
          <h2 className="section-title">Textures & Embedded Images ({textures.length})</h2>
          <p className="section-subtitle">
            Evidence-based image validation: binary bufferView boundaries, file signatures (PNG/JPEG/WebP/KTX2), and pixel decode verification.
          </p>
        </div>

        {/* View Mode Toggle */}
        <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(30, 41, 59, 0.7)', padding: '0.25rem', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <button
            type="button"
            className={`tool-btn ${viewMode === 'table' ? 'active' : ''}`}
            onClick={() => setViewMode('table')}
            style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
          >
            <TableIcon size={14} /> Validation Table
          </button>
          <button
            type="button"
            className={`tool-btn ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => setViewMode('grid')}
            style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
          >
            <LayoutGrid size={14} /> Card Grid
          </button>
        </div>
      </div>

      {/* Validation Status Summary Banner */}
      <div style={{
        display: 'flex',
        gap: '1rem',
        flexWrap: 'wrap',
        marginBottom: '1.25rem',
        padding: '0.85rem 1.15rem',
        background: 'rgba(15, 23, 42, 0.65)',
        borderRadius: '8px',
        border: '1px solid rgba(255, 255, 255, 0.06)',
        fontSize: '0.85rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <CheckCircle2 size={16} color="#34d399" />
          <span style={{ color: '#94a3b8' }}>Valid Images:</span>
          <strong style={{ color: '#34d399' }}>{validCount} / {textures.length}</strong>
        </div>
        <span style={{ color: 'rgba(255,255,255,0.1)' }}>|</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ color: '#94a3b8' }}>Embedded GLB:</span>
          <strong style={{ color: '#60a5fa' }}>{embeddedCount}</strong>
        </div>
        <span style={{ color: 'rgba(255,255,255,0.1)' }}>|</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ color: '#94a3b8' }}>Decoded:</span>
          <strong style={{ color: '#a78bfa' }}>{decodedCount} / {textures.length}</strong>
        </div>
        {warningCount > 0 && (
          <>
            <span style={{ color: 'rgba(255,255,255,0.1)' }}>|</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <AlertTriangle size={16} color="#fbbf24" />
              <span style={{ color: '#94a3b8' }}>Warnings:</span>
              <strong style={{ color: '#fbbf24' }}>{warningCount}</strong>
            </div>
          </>
        )}
        {errorCount > 0 ? (
          <>
            <span style={{ color: 'rgba(255,255,255,0.1)' }}>|</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <XCircle size={16} color="#f87171" />
              <span style={{ color: '#94a3b8' }}>Broken / Corrupt:</span>
              <strong style={{ color: '#f87171' }}>{errorCount}</strong>
            </div>
          </>
        ) : (
          <>
            <span style={{ color: 'rgba(255,255,255,0.1)' }}>|</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#34d399' }}>
              <span>0 broken binary references</span>
            </div>
          </>
        )}
      </div>

      {textures.length === 0 ? (
        <div className="empty-notice-card">No textures found in file. Model uses flat vertex colors or uniform PBR factors.</div>
      ) : viewMode === 'table' ? (
        /* PART 6: Detailed Validation Table */
        <div className="table-responsive" style={{ overflowX: 'auto', background: 'rgba(15, 23, 42, 0.4)', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: 'rgba(30, 41, 59, 0.7)', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.75rem' }}>
                <th style={{ padding: '0.75rem 1rem' }}>Texture</th>
                <th style={{ padding: '0.75rem 1rem' }}>Image</th>
                <th style={{ padding: '0.75rem 1rem' }}>Storage</th>
                <th style={{ padding: '0.75rem 1rem' }}>Format</th>
                <th style={{ padding: '0.75rem 1rem' }}>Size</th>
                <th style={{ padding: '0.75rem 1rem' }}>BufferView</th>
                <th style={{ padding: '0.75rem 1rem' }}>Decode</th>
                <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Inspect</th>
              </tr>
            </thead>
            <tbody>
              {textures.map((tex) => {
                const isExpanded = expandedIndex === tex.index;
                const statusColor =
                  tex.validationStatus === 'VALID'
                    ? '#34d399'
                    : tex.validationStatus === 'WARNING'
                    ? '#fbbf24'
                    : '#f87171';

                const decodeColor =
                  tex.decodeStatus === 'PASS'
                    ? '#34d399'
                    : tex.decodeStatus === 'FAIL'
                    ? '#f87171'
                    : '#94a3b8';

                return (
                  <React.Fragment key={tex.index}>
                    <tr
                      onClick={() => setExpandedIndex(isExpanded ? null : tex.index)}
                      style={{
                        borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                        cursor: 'pointer',
                        background: isExpanded ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
                        transition: 'background 0.15s ease',
                      }}
                      className="texture-table-row"
                    >
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#f8fafc' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {tex.previewUrl ? (
                            <img
                              src={tex.previewUrl}
                              alt=""
                              style={{ width: 28, height: 28, borderRadius: 4, objectFit: 'cover', background: '#000' }}
                            />
                          ) : (
                            <div style={{ width: 28, height: 28, borderRadius: 4, background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <ImageIcon size={14} color="#64748b" />
                            </div>
                          )}
                          <span>{tex.name}</span>
                        </div>
                      </td>

                      <td style={{ padding: '0.75rem 1rem', color: '#94a3b8' }}>
                        #{tex.imageIndex} <span style={{ color: '#cbd5e1' }}>{tex.imageName}</span>
                      </td>

                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span
                          style={{
                            padding: '0.2rem 0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 500,
                            background: tex.storage === 'Embedded GLB' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                            color: tex.storage === 'Embedded GLB' ? '#93c5fd' : '#fcd34d',
                            border: `1px solid ${tex.storage === 'Embedded GLB' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
                          }}
                        >
                          {tex.storage}
                        </span>
                      </td>

                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span
                          style={{
                            padding: '0.2rem 0.45rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            background: 'rgba(255, 255, 255, 0.06)',
                            color: '#e2e8f0',
                          }}
                        >
                          {tex.format}
                        </span>
                      </td>

                      <td style={{ padding: '0.75rem 1rem', color: '#cbd5e1', fontFamily: 'monospace' }}>
                        {tex.byteSizeFormatted}
                      </td>

                      <td style={{ padding: '0.75rem 1rem', color: '#94a3b8', fontFamily: 'monospace' }}>
                        {tex.bufferViewIndex !== undefined ? tex.bufferViewIndex : '—'}
                      </td>

                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span
                          style={{
                            padding: '0.15rem 0.45rem',
                            borderRadius: '4px',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            background: `rgba(${tex.decodeStatus === 'PASS' ? '52, 211, 153' : '248, 113, 113'}, 0.12)`,
                            color: decodeColor,
                          }}
                        >
                          {tex.decodeStatus}
                        </span>
                      </td>

                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            padding: '0.2rem 0.55rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            background: `rgba(${tex.validationStatus === 'VALID' ? '52, 211, 153' : tex.validationStatus === 'WARNING' ? '251, 191, 36' : '248, 113, 113'}, 0.15)`,
                            color: statusColor,
                          }}
                        >
                          {tex.validationStatus === 'VALID' && <CheckCircle2 size={12} />}
                          {tex.validationStatus === 'WARNING' && <AlertTriangle size={12} />}
                          {tex.validationStatus === 'ERROR' && <XCircle size={12} />}
                          {tex.validationStatus}
                        </span>
                      </td>

                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center', color: '#64748b' }}>
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </td>
                    </tr>

                    {/* Detailed Validation Drawer */}
                    {isExpanded && (
                      <tr style={{ background: 'rgba(30, 41, 59, 0.45)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                        <td colSpan={9} style={{ padding: '1rem 1.25rem' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '1.5rem', alignItems: 'flex-start' }}>
                            {/* Preview box */}
                            <div style={{ width: 140, height: 140, background: '#090d16', borderRadius: '6px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                              {tex.previewUrl ? (
                                <img
                                  src={tex.previewUrl}
                                  alt={tex.name}
                                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                                />
                              ) : (
                                <div style={{ textAlign: 'center', color: '#64748b', fontSize: '0.75rem', padding: '0.5rem' }}>
                                  <ImageIcon size={28} opacity={0.4} style={{ margin: '0 auto 0.25rem' }} />
                                  <span>{tex.validationStatus === 'ERROR' ? 'Decode Error' : 'No Preview'}</span>
                                </div>
                              )}
                            </div>

                            {/* Detailed Diagnostics Info */}
                            <div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                <h4 style={{ margin: 0, fontSize: '0.95rem', color: '#f8fafc' }}>
                                  Validation Report: <span style={{ color: '#60a5fa' }}>{tex.name}</span>
                                </h4>
                                <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#94a3b8' }}>
                                  Classification: <strong style={{ color: statusColor }}>{tex.validationClassification}</strong>
                                </span>
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
                                <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '0.4rem 0.6rem', borderRadius: '4px' }}>
                                  <span style={{ color: '#94a3b8' }}>Storage: </span>
                                  <strong>{tex.storage}</strong>
                                </div>
                                <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '0.4rem 0.6rem', borderRadius: '4px' }}>
                                  <span style={{ color: '#94a3b8' }}>Detected Format: </span>
                                  <strong>{tex.format} ({tex.mimeType})</strong>
                                </div>
                                <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '0.4rem 0.6rem', borderRadius: '4px' }}>
                                  <span style={{ color: '#94a3b8' }}>Dimensions: </span>
                                  <strong>{tex.width ? `${tex.width} × ${tex.height} px` : 'Pending decode'}</strong>
                                  {tex.isNPOT && <span style={{ color: '#fbbf24', marginLeft: '0.3rem' }}>(NPOT)</span>}
                                </div>
                                <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '0.4rem 0.6rem', borderRadius: '4px' }}>
                                  <span style={{ color: '#94a3b8' }}>BufferView: </span>
                                  <strong>{tex.bufferViewIndex !== undefined ? `#${tex.bufferViewIndex}` : 'None (URI)'}</strong>
                                </div>
                                <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '0.4rem 0.6rem', borderRadius: '4px' }}>
                                  <span style={{ color: '#94a3b8' }}>Decoded: </span>
                                  <strong style={{ color: decodeColor }}>{tex.decodeStatus === 'PASS' ? 'Yes (Pass)' : tex.decodeStatus}</strong>
                                </div>
                                <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '0.4rem 0.6rem', borderRadius: '4px' }}>
                                  <span style={{ color: '#94a3b8' }}>Material Channels: </span>
                                  <strong>{tex.detectedPurposes.length > 0 ? tex.detectedPurposes.join(', ') : 'Unused'}</strong>
                                </div>
                              </div>

                              {/* Exact reason if error */}
                              {tex.validationDetails && (
                                <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '4px', padding: '0.5rem 0.75rem', marginBottom: '0.5rem', color: '#fca5a5', fontSize: '0.8rem' }}>
                                  <strong>Validation Failure Reason:</strong> {tex.validationDetails}
                                </div>
                              )}

                              {/* Sampler configuration */}
                              <div style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                                <span>Min Filter: <code>{tex.sampler.minFilterName}</code></span>
                                <span>Mag Filter: <code>{tex.sampler.magFilterName}</code></span>
                                <span>Wrap U: <code>{tex.sampler.wrapSName}</code></span>
                                <span>Wrap V: <code>{tex.sampler.wrapTName}</code></span>
                              </div>

                              {/* Diagnostics items */}
                              {tex.diagnostics.length > 0 && (
                                <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                  {tex.diagnostics.map((d, i) => (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#fbbf24', fontSize: '0.75rem' }}>
                                      <Info size={12} />
                                      <span>{d}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* Card Grid View */
        <div className="textures-grid">
          {textures.map((tex) => {
            const hasIssues = tex.diagnostics.length > 0;
            const statusColor =
              tex.validationStatus === 'VALID'
                ? '#34d399'
                : tex.validationStatus === 'WARNING'
                ? '#fbbf24'
                : '#f87171';

            return (
              <div
                key={tex.index}
                className={`texture-card ${tex.isUnused ? 'is-unused' : ''} ${tex.isMissing ? 'is-missing' : ''}`}
              >
                {/* Thumbnail Preview */}
                <div className="texture-preview-box">
                  {tex.previewUrl ? (
                    <img src={tex.previewUrl} alt={tex.name} className="texture-thumbnail" />
                  ) : (
                    <div className="texture-placeholder">
                      <ImageIcon size={32} opacity={0.3} />
                      <span>{tex.isMissing ? 'Missing Image' : 'No Preview'}</span>
                    </div>
                  )}

                  <div className="preview-overlay-badges">
                    <span className="tex-id-pill">#{tex.index}</span>
                    <span className="tex-fmt-pill">{tex.format}</span>
                    <span className={`tex-embed-pill ${tex.storage !== 'Embedded GLB' ? 'external' : ''}`}>
                      {tex.storage}
                    </span>
                  </div>
                </div>

                {/* Content */}
                <div className="texture-card-body">
                  <div className="tex-name-header">
                    <h4 className="tex-name" title={tex.name}>
                      {tex.name}
                    </h4>
                    <span className="tex-image-ref" title={tex.imageName}>
                      Image #{tex.imageIndex}: {tex.imageName}
                    </span>
                  </div>

                  {/* Dimensions & Size & Status */}
                  <div className="tex-meta-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="meta-val">
                      {tex.width ? `${tex.width} × ${tex.height} px` : 'Dimensions Unknown'}
                    </span>
                    <span className="meta-val">{tex.byteSizeFormatted}</span>
                  </div>

                  <div style={{ display: 'flex', gap: '0.4rem', margin: '0.4rem 0', fontSize: '0.75rem' }}>
                    <span style={{ color: '#94a3b8' }}>Status:</span>
                    <strong style={{ color: statusColor }}>{tex.validationStatus}</strong>
                    <span style={{ color: 'rgba(255,255,255,0.2)' }}>•</span>
                    <span style={{ color: '#94a3b8' }}>Decode:</span>
                    <strong style={{ color: tex.decodeStatus === 'PASS' ? '#34d399' : '#f87171' }}>{tex.decodeStatus}</strong>
                  </div>

                  {/* Detected Purposes */}
                  <div className="tex-purposes">
                    <span className="purposes-label">Bound to:</span>
                    {tex.detectedPurposes.length > 0 ? (
                      <div className="purposes-tags">
                        {tex.detectedPurposes.map((p) => (
                          <span key={p} className="purpose-tag">
                            {p}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="unused-tag">
                        <EyeOff size={11} /> Unused (Not bound to any material)
                      </span>
                    )}
                  </div>

                  {/* Sampler Settings */}
                  <div className="sampler-details">
                    <div className="sampler-row">
                      <span className="sampler-lbl">Filters:</span>
                      <span className="sampler-val">
                        Min: <code>{tex.sampler.minFilterName}</code> | Mag: <code>{tex.sampler.magFilterName}</code>
                      </span>
                    </div>
                    <div className="sampler-row">
                      <span className="sampler-lbl">Wrapping:</span>
                      <span className="sampler-val">
                        U: <code>{tex.sampler.wrapSName}</code> | V: <code>{tex.sampler.wrapTName}</code>
                      </span>
                    </div>
                  </div>

                  {/* Diagnostics / Warnings */}
                  {hasIssues && (
                    <div className="tex-diagnostics">
                      {tex.diagnostics.map((d, i) => (
                        <div key={i} className="tex-diag-item">
                          <AlertTriangle size={12} color="#f59e0b" />
                          <span>{d}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
