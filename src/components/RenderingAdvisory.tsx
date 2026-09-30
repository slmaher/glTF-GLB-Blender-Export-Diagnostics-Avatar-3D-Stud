import React from 'react';
import type { RenderingDiagnostics } from '../types/diagnostic';
import { AlertOctagon, SunMedium, Orbit, Layers, Sparkles, Sliders } from 'lucide-react';

interface RenderingAdvisoryProps {
  diagnostics: RenderingDiagnostics;
}

export const RenderingAdvisory: React.FC<RenderingAdvisoryProps> = ({ diagnostics }) => {
  return (
    <section className="section-block advisory-section" id="rendering-diagnostics">
      <div className="section-header">
        <div className="section-title-wrap">
          <h2 className="section-title">Rendering-Related Diagnostics & Blender Limitations</h2>
          <p className="section-subtitle">
            Essential architectural principles explaining real-time WebGL rendering differences vs Blender Cycles/EEVEE.
          </p>
        </div>
      </div>

      {/* Crucial Blender Limitation Disclaimer */}
      <div className="blender-limitation-banner">
        <div className="banner-icon">
          <AlertOctagon size={28} color="#ef4444" />
        </div>
        <div className="banner-content">
          <h3 className="banner-title">Blender Shader Node Pipeline Limitation</h3>
          <p className="banner-text">{diagnostics.blenderShaderNodeDisclaimer}</p>
        </div>
      </div>

      <div className="advisory-grid">
        {/* Lighting & Environment IBL */}
        <div className="advisory-card">
          <div className="advisory-card-header">
            <SunMedium size={18} color="#f59e0b" />
            <h4>1. Environment Map (IBL) vs Viewport HDRI</h4>
          </div>
          <ul className="advisory-list">
            {diagnostics.lightingAndEnvironmentNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
        </div>

        {/* Tangents & MikkTSpace */}
        <div className="advisory-card">
          <div className="advisory-card-header">
            <Orbit size={18} color="#3b82f6" />
            <h4>2. Tangent Space & MikkTSpace Seams</h4>
          </div>
          <ul className="advisory-list">
            {diagnostics.tangentSpaceNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
        </div>

        {/* Alpha & Transparency */}
        <div className="advisory-card">
          <div className="advisory-card-header">
            <Layers size={18} color="#a855f7" />
            <h4>3. Alpha Blending & Depth Sorting</h4>
          </div>
          <ul className="advisory-list">
            {diagnostics.alphaBlendingNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
        </div>

        {/* Color Space & sRGB */}
        <div className="advisory-card">
          <div className="advisory-card-header">
            <Sliders size={18} color="#10b981" />
            <h4>4. Texture Color Spaces & Linear Pipeline</h4>
          </div>
          <ul className="advisory-list">
            {diagnostics.colorSpaceNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
        </div>

        {/* Double Sided & Backface Culling */}
        <div className="advisory-card full-width">
          <div className="advisory-card-header">
            <Sparkles size={18} color="#ec4899" />
            <h4>5. Backface Culling Discrepancy</h4>
          </div>
          <ul className="advisory-list">
            {diagnostics.doubleSidedNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
};
