import React, { useState } from 'react';
import type { SceneStructure, HierarchyNode, MaterialAnalysis } from '../types/diagnostic';
import { ChevronRight, ChevronDown, Layers, Box, Palette, Camera, AlertTriangle, Lightbulb, Clapperboard, Minimize2, Maximize2 } from 'lucide-react';

interface SceneHierarchyViewProps {
  structure: SceneStructure;
  materials: MaterialAnalysis[];
}

const TreeNodeItem: React.FC<{
  node: HierarchyNode;
  level: number;
  expandedNodes: Set<number>;
  toggleNode: (index: number) => void;
  materials: MaterialAnalysis[];
}> = ({ node, level, expandedNodes, toggleNode, materials }) => {
  const isExpanded = expandedNodes.has(node.index);
  const hasChildren = node.children.length > 0 || node.meshIndex !== undefined;

  return (
    <div className="tree-node-wrapper" style={{ marginLeft: `${level * 16}px` }}>
      <div className={`tree-node-row ${node.hasNegativeScale ? 'has-negative' : ''} ${node.hasNonUniformScale ? 'has-nonuniform' : ''}`}>
        <button
          type="button"
          className={`tree-toggle-btn ${hasChildren ? '' : 'disabled'}`}
          onClick={() => hasChildren && toggleNode(node.index)}
          disabled={!hasChildren}
        >
          {hasChildren ? (
            isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
          ) : (
            <span className="tree-leaf-bullet" />
          )}
        </button>

        <span className="tree-node-icon">
          <Layers size={14} color="#60a5fa" />
        </span>

        <span className="tree-node-name">
          {node.name}
          <span className="tree-node-index">#{node.index}</span>
        </span>

        {node.scale && (
          <span className="tree-node-transform" title={`Scale: [${node.scale.map((v) => v.toFixed(2)).join(', ')}]`}>
            s:[{node.scale.map((v) => v.toFixed(1)).join(',')}]
          </span>
        )}

        {node.hasNegativeScale && (
          <span className="tree-tag tag-warning" title="Negative scale detected. Polygons may have inverted culling!">
            <AlertTriangle size={11} /> Inverted Scale
          </span>
        )}

        {node.hasNonUniformScale && !node.hasNegativeScale && (
          <span className="tree-tag tag-notice" title="Non-uniform scale can cause distorted normal vectors">
            Non-uniform Scale
          </span>
        )}
      </div>

      {isExpanded && (
        <div className="tree-children">
          {/* If node points to a Mesh */}
          {node.meshIndex !== undefined && (
            <div className="tree-mesh-item" style={{ marginLeft: '24px' }}>
              <span className="tree-mesh-icon">
                <Box size={13} color="#34d399" />
              </span>
              <span className="tree-mesh-name">
                Mesh #{node.meshIndex}: {node.meshName || `Mesh_${node.meshIndex}`}
              </span>

              {/* Show materials linked to this mesh */}
              <div className="tree-mesh-materials">
                {materials
                  .filter((m) => m.name !== undefined)
                  .slice(0, 3)
                  .map((mat) => (
                    <span key={mat.index} className="tree-mat-pill">
                      <Palette size={10} color="#f472b6" />
                      {mat.name}
                    </span>
                  ))}
              </div>
            </div>
          )}

          {/* Child nodes */}
          {node.children.map((child) => (
            <TreeNodeItem
              key={child.index}
              node={child}
              level={level + 1}
              expandedNodes={expandedNodes}
              toggleNode={toggleNode}
              materials={materials}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const SceneHierarchyView: React.FC<SceneHierarchyViewProps> = ({ structure, materials }) => {
  // Collect all node indices for expand/collapse all
  const allNodeIndices = React.useMemo(() => {
    const indices: number[] = [];
    function collect(nodes: HierarchyNode[]) {
      for (const n of nodes) {
        indices.push(n.index);
        collect(n.children);
      }
    }
    structure.scenes.forEach((s) => collect(s.rootNodes));
    return indices;
  }, [structure]);

  const [expandedNodes, setExpandedNodes] = useState<Set<number>>(
    new Set(allNodeIndices.slice(0, 15)) // expand first 15 by default
  );

  const toggleNode = (idx: number) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  const expandAll = () => setExpandedNodes(new Set(allNodeIndices));
  const collapseAll = () => setExpandedNodes(new Set());

  return (
    <section className="section-block scene-hierarchy-section" id="scene-structure">
      <div className="section-header">
        <div className="section-title-wrap">
          <h2 className="section-title">Scene Structure & Hierarchy</h2>
          <p className="section-subtitle">
            Inspect the glTF scene graph hierarchy: Scene → Nodes → Meshes → Materials
          </p>
        </div>

        <div className="hierarchy-controls">
          <button type="button" className="tool-btn small" onClick={expandAll}>
            <Maximize2 size={13} /> Expand All
          </button>
          <button type="button" className="tool-btn small" onClick={collapseAll}>
            <Minimize2 size={13} /> Collapse All
          </button>
        </div>
      </div>

      {/* Counts Bar */}
      <div className="stats-metric-strip">
        <div className="strip-item">
          <span className="strip-val">{structure.scenesCount}</span>
          <span className="strip-lbl">Scenes</span>
        </div>
        <div className="strip-item">
          <span className="strip-val">{structure.nodesCount}</span>
          <span className="strip-lbl">Nodes</span>
        </div>
        <div className="strip-item">
          <span className="strip-val">{structure.meshesCount}</span>
          <span className="strip-lbl">Meshes</span>
        </div>
        <div className="strip-item">
          <span className="strip-val">{structure.primitivesCount}</span>
          <span className="strip-lbl">Primitives</span>
        </div>
        <div className="strip-item">
          <span className="strip-val">{structure.materialsCount}</span>
          <span className="strip-lbl">Materials</span>
        </div>
        <div className="strip-item">
          <span className="strip-val">{structure.texturesCount}</span>
          <span className="strip-lbl">Textures</span>
        </div>
        <div className="strip-item">
          <span className="strip-val">{structure.imagesCount}</span>
          <span className="strip-lbl">Images</span>
        </div>
        {structure.camerasCount > 0 && (
          <div className="strip-item">
            <span className="strip-val">{structure.camerasCount}</span>
            <span className="strip-lbl"><Camera size={12} /> Cameras</span>
          </div>
        )}
        {structure.lightsCount > 0 && (
          <div className="strip-item">
            <span className="strip-val">{structure.lightsCount}</span>
            <span className="strip-lbl"><Lightbulb size={12} /> Lights</span>
          </div>
        )}
        {structure.animationsCount > 0 && (
          <div className="strip-item">
            <span className="strip-val">{structure.animationsCount}</span>
            <span className="strip-lbl"><Clapperboard size={12} /> Animations</span>
          </div>
        )}
      </div>

      {/* Tree container */}
      <div className="tree-container">
        {structure.scenes.length === 0 ? (
          <p className="empty-notice">No scenes defined in file.</p>
        ) : (
          structure.scenes.map((scene) => (
            <div key={scene.index} className="scene-tree-block">
              <div className="scene-tree-header">
                <Layers size={16} color="#a78bfa" />
                <span className="scene-name">
                  Scene #{scene.index}: {scene.name}
                </span>
                <span className="scene-roots-count">
                  ({scene.rootNodes.length} root node{scene.rootNodes.length === 1 ? '' : 's'})
                </span>
              </div>

              <div className="scene-nodes-list">
                {scene.rootNodes.map((rootNode) => (
                  <TreeNodeItem
                    key={rootNode.index}
                    node={rootNode}
                    level={0}
                    expandedNodes={expandedNodes}
                    toggleNode={toggleNode}
                    materials={materials}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
};
