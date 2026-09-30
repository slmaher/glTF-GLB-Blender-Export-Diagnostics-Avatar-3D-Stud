import React from 'react';
import type { MeshAnalysis } from '../types/diagnostic';
import { Box, AlertTriangle, Check, X, Compass } from 'lucide-react';

interface MeshesTableProps {
  meshes: MeshAnalysis[];
}

export const MeshesTable: React.FC<MeshesTableProps> = ({ meshes }) => {
  const renderAttrBadge = (exists: boolean, name: string, isCrucial = false) => {
    if (exists) {
      return (
        <span className="attr-pill exists" title={`${name} attribute present`}>
          <Check size={11} /> {name}
        </span>
      );
    }
    return (
      <span className={`attr-pill missing ${isCrucial ? 'crucial' : ''}`} title={`${name} attribute missing`}>
        <X size={11} /> {name}
      </span>
    );
  };

  return (
    <section className="section-block meshes-section" id="mesh-analysis">
      <div className="section-header">
        <div className="section-title-wrap">
          <h2 className="section-title">Mesh & Geometry Analysis ({meshes.length})</h2>
          <p className="section-subtitle">
            Inspect vertex buffers, triangle counts, bounding boxes, and mandatory shader vertex attributes.
          </p>
        </div>
      </div>

      {meshes.length === 0 ? (
        <div className="empty-notice-card">No meshes found in file.</div>
      ) : (
        <div className="meshes-list">
          {meshes.map((mesh) => (
            <div key={mesh.index} className="mesh-card">
              <div className="mesh-card-header">
                <div className="mesh-title-wrap">
                  <Box size={18} color="#34d399" />
                  <h3 className="mesh-name">{mesh.name}</h3>
                  <span className="mesh-idx">Index #{mesh.index}</span>
                </div>

                <div className="mesh-stats-summary">
                  <span className="stat-pill">
                    {mesh.totalVertices.toLocaleString()} Vertices
                  </span>
                  <span className="stat-pill">
                    {mesh.totalTriangles.toLocaleString()} Triangles
                  </span>
                  <span className="stat-pill">
                    {mesh.primitivesCount} Primitive{mesh.primitivesCount === 1 ? '' : 's'}
                  </span>
                </div>
              </div>

              {/* Bounding Box Information */}
              {mesh.boundingBox && (
                <div className="bbox-banner">
                  <div className="bbox-item">
                    <Compass size={13} color="#94a3b8" />
                    <span className="bbox-lbl">Bounding Box Dimensions:</span>
                    <code>
                      W: {mesh.boundingBox.size[0].toFixed(2)}m × H: {mesh.boundingBox.size[1].toFixed(2)}m × D: {mesh.boundingBox.size[2].toFixed(2)}m
                    </code>
                  </div>
                  <div className="bbox-item">
                    <span className="bbox-lbl">Min Bounds:</span>
                    <code>[{mesh.boundingBox.min.map((v) => v.toFixed(2)).join(', ')}]</code>
                    <span className="bbox-lbl">Max Bounds:</span>
                    <code>[{mesh.boundingBox.max.map((v) => v.toFixed(2)).join(', ')}]</code>
                  </div>
                </div>
              )}

              {/* Primitives Table */}
              <div className="primitives-container">
                <h4 className="prims-title">Geometry Primitives ({mesh.primitives.length})</h4>
                <div className="prims-table-wrap">
                  <table className="prims-table">
                    <thead>
                      <tr>
                        <th>Primitive</th>
                        <th>Material</th>
                        <th>Topology</th>
                        <th>Vertices</th>
                        <th>Triangles</th>
                        <th>Vertex Attributes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mesh.primitives.map((prim) => {
                        const a = prim.attributes;
                        const hasErrors = prim.diagnostics.length > 0;

                        return (
                          <React.Fragment key={prim.primitiveIndex}>
                            <tr className={hasErrors ? 'row-has-issues' : ''}>
                              <td className="prim-index-cell">
                                Prim #{prim.primitiveIndex}
                              </td>
                              <td className="prim-mat-cell">
                                {prim.materialName ? (
                                  <span className="mat-badge">
                                    {prim.materialName}
                                  </span>
                                ) : (
                                  <span className="no-mat">Default Material</span>
                                )}
                              </td>
                              <td className="prim-mode-cell">
                                <code>{prim.mode}</code>
                                {prim.hasIndices ? <span className="indexed-pill">Indexed</span> : <span className="non-indexed-pill">Non-Indexed</span>}
                              </td>
                              <td>{prim.vertexCount.toLocaleString()}</td>
                              <td>{prim.triangleCount.toLocaleString()}</td>
                              <td className="attrs-cell">
                                <div className="attr-pills-row">
                                  {renderAttrBadge(a.hasPosition, 'POSITION', true)}
                                  {renderAttrBadge(a.hasNormal, 'NORMAL', true)}
                                  {renderAttrBadge(a.hasTangent, 'TANGENT', false)}
                                  {renderAttrBadge(a.hasTexCoord0, 'TEXCOORD_0', false)}
                                  {renderAttrBadge(a.hasTexCoord1, 'TEXCOORD_1', false)}
                                  {renderAttrBadge(a.hasColor0, 'COLOR_0', false)}
                                  {renderAttrBadge(a.hasJoints0, 'JOINTS_0', false)}
                                  {renderAttrBadge(a.hasWeights0, 'WEIGHTS_0', false)}
                                </div>
                              </td>
                            </tr>

                            {prim.diagnostics.length > 0 && (
                              <tr className="prim-diag-row">
                                <td colSpan={6}>
                                  <div className="prim-diag-box">
                                    {prim.diagnostics.map((d, i) => (
                                      <div key={i} className="prim-diag-msg">
                                        <AlertTriangle size={13} color="#ef4444" />
                                        <span>{d}</span>
                                      </div>
                                    ))}
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
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
