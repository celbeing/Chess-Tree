"use client";

import { formatEngineScore, formatMoveLabel } from "@/lib/chess-tree/chessTree";
import type { GameTree, NodeId } from "@/lib/chess-tree/types";

type TreeCanvasProps = {
  tree: GameTree;
  onSelectNode: (nodeId: NodeId) => void;
};

const COLUMN_WIDTH = 190;
const ROW_HEIGHT = 116;
const NODE_WIDTH = 150;
const NODE_HEIGHT = 82;

export function TreeCanvas({ tree, onSelectNode }: TreeCanvasProps) {
  const layout = buildCanvasLayout(tree);
  const width = Math.max(520, layout.columnCount * COLUMN_WIDTH);
  const height = Math.max(340, layout.rowCount * ROW_HEIGHT);

  return (
    <div className="tree-scroll">
      <div className="tree-canvas" style={{ width, height }}>
        <svg className="tree-edges" height={height} width={width} aria-hidden="true">
          {layout.edges.map((edge) => {
            const from = layout.positions[edge.from];
            const to = layout.positions[edge.to];

            if (!from || !to) {
              return null;
            }

            const x1 = from.left + NODE_WIDTH;
            const y1 = from.top + NODE_HEIGHT / 2;
            const x2 = to.left;
            const y2 = to.top + NODE_HEIGHT / 2;
            const midX = (x1 + x2) / 2;

            return (
              <path
                className="tree-edge"
                d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                key={`${edge.from}-${edge.to}`}
              />
            );
          })}
        </svg>
        {Object.values(tree.nodes).map((node) => {
          const position = layout.positions[node.id];

          if (!position) {
            return null;
          }

          const selected = tree.selectedNodeId === node.id;

          return (
            <button
              className={selected ? "tree-node selected" : "tree-node"}
              key={node.id}
              onClick={() => onSelectNode(node.id)}
              style={{ left: position.left, top: position.top, width: NODE_WIDTH, height: NODE_HEIGHT }}
              type="button"
            >
              <span className="tree-node-label">{formatMoveLabel(node)}</span>
              {node.ecoCode && node.openingName ? (
                <span className="tree-node-opening">
                  {node.ecoCode} {node.openingName}
                </span>
              ) : null}
              {node.caption ? <span className="tree-node-caption">{node.caption}</span> : null}
              {node.eval ? <span className="tree-node-eval">{formatEngineScore(node.eval)}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function buildCanvasLayout(tree: GameTree) {
  const nodesByPly = new Map<number, NodeId[]>();
  const edges = Object.values(tree.nodes)
    .filter((node) => node.parentId)
    .map((node) => ({
      from: node.parentId as NodeId,
      to: node.id,
    }));

  function visit(nodeId: NodeId) {
    const node = tree.nodes[nodeId];

    if (!node) {
      return;
    }

    nodesByPly.set(node.ply, [...(nodesByPly.get(node.ply) ?? []), nodeId]);
    node.childrenIds.forEach(visit);
  }

  visit(tree.rootId);

  const columns = [...nodesByPly.entries()].sort(([a], [b]) => a - b);
  const positions: Record<NodeId, { left: number; top: number }> = {};

  columns.forEach(([_, nodeIds], columnIndex) => {
    nodeIds.forEach((nodeId, row) => {
      positions[nodeId] = {
        left: columnIndex * COLUMN_WIDTH + 18,
        top: row * ROW_HEIGHT + 20,
      };
    });
  });

  return {
    edges,
    positions,
    columnCount: columns.length,
    rowCount: Math.max(1, ...columns.map(([, nodeIds]) => nodeIds.length)),
  };
}
