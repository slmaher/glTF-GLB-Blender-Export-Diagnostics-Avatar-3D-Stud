import React from 'react';
import type { FileInfo } from '../types/diagnostic';
import { FileCode, CheckCircle2, XCircle, AlertTriangle, Clock, HardDrive, Hash, Layers } from 'lucide-react';

interface FileInfoCardProps {
  fileInfo: FileInfo;
}

export const FileInfoCard: React.FC<FileInfoCardProps> = ({ fileInfo }) => {
  return (
    <section className="section-block file-info-section" id="file-information">
      <div className="section-header">
        <div className="section-title-wrap">
          <h2 className="section-title">File Information</h2>
          <p className="section-subtitle">
            Core metadata, container specification, binary chunk integrity, and parser performance.
          </p>
        </div>

        <div className="file-validity-badge-wrap">
          {fileInfo.isValid ? (
            <span className="validity-badge valid">
              <CheckCircle2 size={16} /> Valid & Readable glTF Container
            </span>
          ) : (
            <span className="validity-badge invalid">
              <XCircle size={16} /> Corrupt or Invalid Structure
            </span>
          )}
        </div>
      </div>

      <div className="file-meta-grid">
        <div className="file-meta-cell">
          <span className="meta-cell-lbl">
            <FileCode size={14} color="#60a5fa" /> File Name
          </span>
          <span className="meta-cell-val font-mono" title={fileInfo.name}>
            {fileInfo.name}
          </span>
        </div>

        <div className="file-meta-cell">
          <span className="meta-cell-lbl">
            <HardDrive size={14} color="#34d399" /> File Size
          </span>
          <span className="meta-cell-val">
            {fileInfo.sizeFormatted} <span className="sub-val">({fileInfo.sizeBytes.toLocaleString()} bytes)</span>
          </span>
        </div>

        <div className="file-meta-cell">
          <span className="meta-cell-lbl">
            <Hash size={14} color="#a78bfa" /> Format & Version
          </span>
          <span className="meta-cell-val">
            <span className="fmt-tag">{fileInfo.format}</span> {fileInfo.version}
          </span>
        </div>

        <div className="file-meta-cell">
          <span className="meta-cell-lbl">
            <Layers size={14} color="#fbbf24" /> Exporter / Generator
          </span>
          <span className="meta-cell-val font-mono generator-text" title={fileInfo.generator}>
            {fileInfo.generator || 'Not specified in asset metadata'}
          </span>
        </div>

        <div className="file-meta-cell">
          <span className="meta-cell-lbl">
            <Clock size={14} color="#38bdf8" /> In-Browser Parse Time
          </span>
          <span className="meta-cell-val">
            {fileInfo.parseTimeMs} ms <span className="sub-val">(Local client-side execution)</span>
          </span>
        </div>

        {fileInfo.copyright && (
          <div className="file-meta-cell">
            <span className="meta-cell-lbl">Copyright</span>
            <span className="meta-cell-val">{fileInfo.copyright}</span>
          </div>
        )}
      </div>

      {fileInfo.parsingErrors.length > 0 && (
        <div className="file-parsing-alert error">
          <div className="alert-head">
            <XCircle size={16} color="#ef4444" />
            <span>Container Parsing Errors Detected:</span>
          </div>
          <ul className="alert-list">
            {fileInfo.parsingErrors.map((err, idx) => (
              <li key={idx}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {fileInfo.parserNotices && fileInfo.parserNotices.length > 0 && (
        <div className="file-parsing-alert notice" style={{ marginTop: '1rem', background: 'rgba(59, 130, 246, 0.08)', borderColor: 'rgba(59, 130, 246, 0.3)' }}>
          <div className="alert-head" style={{ color: '#60a5fa' }}>
            <AlertTriangle size={16} color="#60a5fa" />
            <span style={{ fontWeight: 600 }}>glTF-Transform Parser Notices:</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginTop: '0.5rem' }}>
            {fileInfo.parserNotices.map((notice, idx) => (
              <div
                key={idx}
                style={{
                  background: 'rgba(15, 23, 42, 0.6)',
                  padding: '0.75rem',
                  borderRadius: '6px',
                  border: '1px solid rgba(255, 255, 255, 0.07)',
                  fontSize: '0.825rem',
                }}
              >
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.35rem', fontWeight: 600 }}>
                  <span style={{ color: '#93c5fd' }}>Source: <code style={{ color: '#bfdbfe' }}>{notice.source}</code></span>
                  <span style={{ color: '#fbbf24' }}>Severity: <code style={{ color: '#fef08a' }}>{notice.severity}</code></span>
                  <span style={{ color: '#a7f3d0' }}>Impact: <code style={{ color: '#6ee7b7' }}>{notice.impact}</code></span>
                </div>
                <div style={{ color: '#e2e8f0', marginBottom: notice.details ? '0.25rem' : 0 }}>
                  {notice.message}
                </div>
                {notice.details && (
                  <div style={{ color: '#94a3b8', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                    API Trace: {notice.details}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {fileInfo.parsingWarnings.length > 0 && !fileInfo.parserNotices?.length && (
        <div className="file-parsing-alert warning">
          <div className="alert-head">
            <AlertTriangle size={16} color="#f59e0b" />
            <span>Parser Notices & Warnings:</span>
          </div>
          <ul className="alert-list">
            {fileInfo.parsingWarnings.map((warn, idx) => (
              <li key={idx}>{warn}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};
