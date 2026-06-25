"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { ChessBoard } from "@/components/ChessBoard";
import {
  buildCompressedTreeLayout,
  formatEngineScore,
  formatMoveLabel,
  formatSegmentLabel,
} from "@/lib/chess-tree/chessTree";
import type { GameTree, NodeId } from "@/lib/chess-tree/types";

type TreeCanvasProps = {
  tree: GameTree;
  onSelectNode: (nodeId: NodeId) => void;
};

const COLUMN_WIDTH = 280;
const ROW_HEIGHT = 292;
const NODE_WIDTH = 230;
const COLLAPSED_NODE_HEIGHT = 132;
const EXPANDED_NODE_HEIGHT = 260;

export function TreeCanvas({ tree, onSelectNode }: TreeCanvasProps) {
  const [expandedSegmentIds, setExpandedSegmentIds] = useState<Set<string>>(() => new Set());
  const layout = buildCompressedTreeLayout(tree);
  const maxRow = Math.max(0, ...Object.values(layout.positions).map((position) => position.row));
  const width = Math.max(520, layout.columns.length * COLUMN_WIDTH);
  const height = Math.max(340, (maxRow + 1) * ROW_HEIGHT);

  return (
    <div className="tree-scroll">
      <div className="tree-canvas" style={{ width, height }}>
        <svg className="tree-edges" height={height} width={width} aria-hidden="true">
          {layout.edges.map((edge) => {
            const from = toCanvasPosition(layout.positions[edge.from]);
            const to = toCanvasPosition(layout.positions[edge.to]);

            if (!from || !to) {
              return null;
            }

            const x1 = from.left + NODE_WIDTH;
            const y1 = from.top + nodeHeight(edge.from, expandedSegmentIds) / 2;
            const x2 = to.left;
            const y2 = to.top + nodeHeight(edge.to, expandedSegmentIds) / 2;
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
        {Object.values(layout.segments).map((segment) => {
          const position = toCanvasPosition(layout.positions[segment.id]);

          if (!position) {
            return null;
          }

          const selected = segment.nodeIds.includes(tree.selectedNodeId);
          const expanded = expandedSegmentIds.has(segment.id);
          const lastNode = tree.nodes[segment.nodeIds[segment.nodeIds.length - 1]];
          const infoNode = selected ? tree.nodes[tree.selectedNodeId] : lastNode;

          if (!lastNode || !infoNode) {
            return null;
          }

          return (
            <div
              className={selected ? "tree-node selected" : "tree-node"}
              key={segment.id}
              style={{
                left: position.left,
                top: position.top,
                width: NODE_WIDTH,
                height: expanded ? EXPANDED_NODE_HEIGHT : COLLAPSED_NODE_HEIGHT,
              }}
            >
              <div className="tree-node-topline">
                <button className="tree-node-main" onClick={() => onSelectNode(lastNode.id)} type="button">
                  <span className="tree-node-label">{formatSegmentLabel(tree, segment)}</span>
                </button>
                <button
                  className="tree-node-expand"
                  onClick={() => toggleSegment(expandedSegmentIds, setExpandedSegmentIds, segment.id)}
                  title={expanded ? "Hide board" : "Show board"}
                  type="button"
                >
                  {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                </button>
              </div>
              {segment.nodeIds.length > 1 ? (
                <div className="tree-node-moves">
                  {segment.nodeIds.map((nodeId) => {
                    const node = tree.nodes[nodeId];

                    return (
                      <button
                        className={tree.selectedNodeId === nodeId ? "tree-node-move active" : "tree-node-move"}
                        key={nodeId}
                        onClick={() => onSelectNode(nodeId)}
                        title={formatMoveLabel(node)}
                        type="button"
                      >
                        {node.san}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              {infoNode.ecoCode && infoNode.openingName ? (
                <span className="tree-node-opening">
                  {infoNode.ecoCode} {infoNode.openingName}
                </span>
              ) : null}
              {infoNode.caption ? <span className="tree-node-caption">{infoNode.caption}</span> : null}
              {infoNode.eval ? <span className="tree-node-eval">{formatEngineScore(infoNode.eval)}</span> : null}
              {expanded ? (
                <ChessBoard
                  arrows={infoNode.arrows}
                  fen={infoNode.fen}
                  lastMoveUci={infoNode.uci}
                  marks={infoNode.marks}
                  size={150}
                  variant="mini"
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function nodeHeight(segmentId: string, expandedSegmentIds: Set<string>) {
  return expandedSegmentIds.has(segmentId) ? EXPANDED_NODE_HEIGHT : COLLAPSED_NODE_HEIGHT;
}

function toggleSegment(
  expandedSegmentIds: Set<string>,
  setExpandedSegmentIds: (value: Set<string>) => void,
  segmentId: string,
) {
  const next = new Set(expandedSegmentIds);

  if (next.has(segmentId)) {
    next.delete(segmentId);
  } else {
    next.add(segmentId);
  }

  setExpandedSegmentIds(next);
}

function toCanvasPosition(position?: { column: number; row: number }) {
  if (!position) {
    return null;
  }

  return {
    left: position.column * COLUMN_WIDTH + 18,
    top: position.row * ROW_HEIGHT + 20,
  };
}
