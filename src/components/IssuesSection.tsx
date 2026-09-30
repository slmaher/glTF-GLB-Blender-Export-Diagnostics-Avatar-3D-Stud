import React, { useState } from 'react';
import type { CompatibilityIssue, IssueSeverity } from '../types/diagnostic';
import { AlertCircle, AlertTriangle, Info, CheckCircle, Wrench, FileSearch, HelpCircle } from 'lucide-react';

interface IssuesSectionProps {
  issues: CompatibilityIssue[];
}

export const IssuesSection: React.FC<IssuesSectionProps> = ({ issues }) => {
  const [filter, setFilter] = useState<'ALL' | IssueSeverity>('ALL');

  const highIssues = issues.filter((i) => i.severity === 'HIGH');
  const medIssues = issues.filter((i) => i.severity === 'MEDIUM');
  const lowIssues = issues.filter((i) => i.severity === 'LOW');

  const filteredIssues = filter === 'ALL' ? issues : issues.filter((i) => i.severity === filter);

  const getCategoryBadge = (category: CompatibilityIssue['category']) => {
    if (category === 'Confirmed issue') {
      return <span className="cat-badge confirmed">Confirmed Issue</span>;
    }
    if (category === 'Potential issue') {
      return <span className="cat-badge potential">Potential Issue</span>;
    }
    return <span className="cat-badge info">Informational</span>;
  };

  const getSeverityIcon = (sev: IssueSeverity) => {
    switch (sev) {
      case 'HIGH':
        return <AlertCircle className="sev-icon high" size={20} />;
      case 'MEDIUM':
        return <AlertTriangle className="sev-icon medium" size={20} />;
      case 'LOW':
        return <Info className="sev-icon low" size={20} />;
    }
  };

  return (
    <section className="section-block issues-section" id="blender-compatibility-issues">
      <div className="section-header">
        <div className="section-title-wrap">
          <h2 className="section-title">Potential Blender → glTF / Three.js Issues</h2>
          <p className="section-subtitle">
            Diagnostics answering: <em>"Why does the model look right in Blender, but wrong in glTF Viewer and Three.js?"</em>
          </p>
        </div>

        <div className="filter-pill-group">
          <button
            type="button"
            className={`filter-btn ${filter === 'ALL' ? 'active' : ''}`}
            onClick={() => setFilter('ALL')}
          >
            All Issues ({issues.length})
          </button>
          <button
            type="button"
            className={`filter-btn high ${filter === 'HIGH' ? 'active' : ''}`}
            onClick={() => setFilter('HIGH')}
          >
            High Priority ({highIssues.length})
          </button>
          <button
            type="button"
            className={`filter-btn med ${filter === 'MEDIUM' ? 'active' : ''}`}
            onClick={() => setFilter('MEDIUM')}
          >
            Medium ({medIssues.length})
          </button>
          <button
            type="button"
            className={`filter-btn low ${filter === 'LOW' ? 'active' : ''}`}
            onClick={() => setFilter('LOW')}
          >
            Low / Advisory ({lowIssues.length})
          </button>
        </div>
      </div>

      {issues.length === 0 ? (
        <div className="empty-issues-card">
          <CheckCircle size={40} color="#10b981" />
          <h3>No Blender Export Issues Detected!</h3>
          <p>
            The glTF file structure meets standard PBR specifications. Normals, tangents, UV coordinates, and material configurations appear consistent.
          </p>
        </div>
      ) : (
        <div className="issues-list">
          {filteredIssues.map((issue) => (
            <div key={issue.id} className={`issue-card sev-${issue.severity.toLowerCase()}`}>
              <div className="issue-card-header">
                <div className="issue-title-group">
                  {getSeverityIcon(issue.severity)}
                  <h3 className="issue-title">{issue.title}</h3>
                </div>
                <div className="issue-badges">
                  <span className={`sev-badge ${issue.severity.toLowerCase()}`}>
                    {issue.severity} PRIORITY
                  </span>
                  {getCategoryBadge(issue.category)}
                </div>
              </div>

              <div className="issue-body">
                {/* Evidence section */}
                <div className="issue-block evidence-block">
                  <div className="block-title">
                    <FileSearch size={14} /> Exact Evidence in GLB Structure:
                  </div>
                  <div className="evidence-code">
                    <code>{issue.evidence}</code>
                  </div>
                </div>

                {/* Explanation section */}
                <div className="issue-block explanation-block">
                  <div className="block-title">
                    <HelpCircle size={14} /> Why this causes visual differences in glTF Viewer / Three.js:
                  </div>
                  <p className="block-text">{issue.explanation}</p>
                </div>

                {/* Actionable Blender Fix */}
                <div className="issue-block fix-block">
                  <div className="block-title">
                    <Wrench size={14} /> Actionable Fix in Blender:
                  </div>
                  <div className="fix-content">
                    <p>{issue.blenderFix}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
