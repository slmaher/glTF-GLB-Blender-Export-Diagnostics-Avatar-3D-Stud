import React from 'react';
import type { DiagnosticSummary, SectionStatus } from '../types/diagnostic';
import { CheckCircle2, AlertTriangle, XCircle, ShieldAlert, Cpu, Box, Palette, Image as ImageIcon } from 'lucide-react';

interface DiagnosticSummaryCardsProps {
  summary: DiagnosticSummary;
}

export const DiagnosticSummaryCards: React.FC<DiagnosticSummaryCardsProps> = ({ summary }) => {
  const getStatusBadge = (status: SectionStatus | 'Valid' | 'Invalid') => {
    if (status === 'OK' || status === 'Valid') {
      return (
        <span className="status-badge ok">
          <CheckCircle2 size={13} /> {status}
        </span>
      );
    }
    if (status === 'Warning') {
      return (
        <span className="status-badge warning">
          <AlertTriangle size={13} /> Warning
        </span>
      );
    }
    return (
      <span className="status-badge error">
        <XCircle size={13} /> Error
      </span>
    );
  };

  const getCompatBadge = (compat: DiagnosticSummary['threeJsCompatibility']) => {
    if (compat === 'No obvious issue') {
      return (
        <span className="status-badge ok">
          <CheckCircle2 size={14} /> No obvious issue
        </span>
      );
    }
    if (compat === 'Potential compatibility issue') {
      return (
        <span className="status-badge warning">
          <AlertTriangle size={14} /> Potential compatibility issue
        </span>
      );
    }
    return (
      <span className="status-badge error">
        <ShieldAlert size={14} /> Significant compatibility issue
      </span>
    );
  };

  return (
    <div className="summary-cards-container" id="diagnostic-summary">
      <div className="summary-card compat-hero-card">
        <div className="card-header">
          <span className="card-label">Three.js Compatibility Assessment</span>
          {getCompatBadge(summary.threeJsCompatibility)}
        </div>
        <div className="card-compat-stats">
          <div className="stat-pill high">
            <span className="stat-count">{summary.highPriorityCount}</span>
            <span className="stat-name">High Priority Issues</span>
          </div>
          <div className="stat-pill medium">
            <span className="stat-count">{summary.mediumPriorityCount}</span>
            <span className="stat-name">Medium Priority</span>
          </div>
          <div className="stat-pill low">
            <span className="stat-count">{summary.lowPriorityCount}</span>
            <span className="stat-name">Low / Advisory</span>
          </div>
        </div>
      </div>

      <div className="summary-grid">
        <div className="summary-metric-card">
          <div className="metric-header">
            <div className="metric-icon file-icon">
              <Cpu size={16} />
            </div>
            <span className="metric-title">File Structure</span>
          </div>
          <div className="metric-value">{getStatusBadge(summary.fileStatus)}</div>
          <span className="metric-desc">Header & binary chunk validity</span>
        </div>

        <div className="summary-metric-card">
          <div className="metric-header">
            <div className="metric-icon mat-icon">
              <Palette size={16} />
            </div>
            <span className="metric-title">Materials</span>
          </div>
          <div className="metric-value">{getStatusBadge(summary.materialsStatus)}</div>
          <span className="metric-desc">PBR factors, alpha modes & emission</span>
        </div>

        <div className="summary-metric-card">
          <div className="metric-header">
            <div className="metric-icon tex-icon">
              <ImageIcon size={16} />
            </div>
            <span className="metric-title">Textures</span>
          </div>
          <div className="metric-value">{getStatusBadge(summary.texturesStatus)}</div>
          <span className="metric-desc">MIME types, NPOT dims & bindings</span>
        </div>

        <div className="summary-metric-card">
          <div className="metric-header">
            <div className="metric-icon geom-icon">
              <Box size={16} />
            </div>
            <span className="metric-title">Geometry</span>
          </div>
          <div className="metric-value">{getStatusBadge(summary.geometryStatus)}</div>
          <span className="metric-desc">Normals, tangents & UV attributes</span>
        </div>

        <div className="summary-metric-card">
          <div className="metric-header">
            <div className="metric-icon ext-icon">
              <ShieldAlert size={16} />
            </div>
            <span className="metric-title">Extensions</span>
          </div>
          <div className="metric-value">{getStatusBadge(summary.extensionsStatus)}</div>
          <span className="metric-desc">Draco, BasisU & PBR next support</span>
        </div>
      </div>
    </div>
  );
};
