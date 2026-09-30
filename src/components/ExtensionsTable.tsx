import React from 'react';
import type { ExtensionAnalysis } from '../types/diagnostic';
import { Cpu, CheckCircle2, Info } from 'lucide-react';

interface ExtensionsTableProps {
  extensions: ExtensionAnalysis[];
}

export const ExtensionsTable: React.FC<ExtensionsTableProps> = ({ extensions }) => {
  return (
    <section className="section-block extensions-section" id="extensions-and-compression">
      <div className="section-header">
        <div className="section-title-wrap">
          <h2 className="section-title">Extensions & Compression ({extensions.length})</h2>
          <p className="section-subtitle">
            glTF specifications & extensions declared in <code>extensionsUsed</code> and <code>extensionsRequired</code>.
          </p>
        </div>
      </div>

      {extensions.length === 0 ? (
        <div className="clean-extensions-card">
          <CheckCircle2 size={24} color="#10b981" />
          <div>
            <h4 className="clean-title">Pure glTF 2.0 Core Specification</h4>
            <p className="clean-desc">
              No optional extensions used. This asset has maximum universal compatibility across every WebGL, Three.js, Babylon.js, and mobile engine without requiring extra loader plugins or WebAssembly decoders.
            </p>
          </div>
        </div>
      ) : (
        <div className="extensions-table-container">
          <table className="extensions-table">
            <thead>
              <tr>
                <th>Extension Name</th>
                <th>Requirement</th>
                <th>What It Does</th>
                <th>Three.js Support Status</th>
                <th>Visual & Rendering Impact</th>
              </tr>
            </thead>
            <tbody>
              {extensions.map((ext) => (
                <tr key={ext.name} className={ext.isRequired ? 'row-required' : ''}>
                  <td className="ext-name-cell">
                    <code>{ext.name}</code>
                    {ext.isCompression && (
                      <span className="compression-badge">
                        <Cpu size={10} /> Compression
                      </span>
                    )}
                  </td>
                  <td className="ext-req-cell">
                    {ext.isRequired ? (
                      <span className="req-pill required" title="Loader will fail if this extension is not implemented">
                        Required
                      </span>
                    ) : (
                      <span className="req-pill optional" title="Optional extension, fallback behavior available">
                        Optional
                      </span>
                    )}
                  </td>
                  <td className="ext-desc-cell">{ext.description}</td>
                  <td className="ext-three-cell">
                    <span className="three-status-text">{ext.threeJsSupport}</span>
                  </td>
                  <td className="ext-impact-cell">{ext.renderingImpact}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="extension-note-footer">
            <Info size={14} color="#60a5fa" />
            <span>
              <strong>Note on Extensions:</strong> Having extensions is not an error! glTF extensions provide modern features like physical sheen, clearcoat, and compression. However, loaders like Three.js require specific setups (e.g. <code>DRACOLoader</code> or <code>MeshPhysicalMaterial</code>) to render them accurately.
            </span>
          </div>
        </div>
      )}
    </section>
  );
};
