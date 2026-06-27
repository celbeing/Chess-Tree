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
import type { CompressedTreeSegment, GameTree, NodeId } from "@/lib/chess-tree/types";

type TreeCanvasProps = {
  tree: GameTree;
  onSelectNode: (nodeId: NodeId) => void;
};

const COLUMN_WIDTH = 250;
const NODE_WIDTH = 205;
const COLLAPSED_NODE_HEIGHT = 104;
const BASE_EXPANDED_NODE_HEIGHT = 238;
const MOVE_BUTTONS_PER_ROW = 5;
const MOVE_ROW_HEIGHT = 26;
const ROW_GAP = 24;
const CANVAS_PADDING = 20;

export function TreeCanvas({ tree, onSelectNode }: TreeCanvasProps) {
  const [expandedSegmentIds, setExpandedSegmentIds] = useState<Set<string>>(() => new Set());
  const layout = buildCompressedTreeLayout(tree);
  const metrics = buildCanvasMetrics(layout.positions, layout.segments, expandedSegmentIds);
  const width = Math.max(520, layout.columns.length * COLUMN_WIDTH);
  const height = Math.max(340, metrics.height);

  return (
    <div className="tree-scroll">
      <div className="tree-canvas" style={{ width, height }}>
        <svg className="tree-edges" height={height} width={width} aria-hidden="true">
          {layout.edges.map((edge) => {
            const from = toCanvasPosition(layout.positions[edge.from], metrics.rowOffsets);
            const to = toCanvasPosition(layout.positions[edge.to], metrics.rowOffsets);

            if (!from || !to) {
              return null;
            }

            const x1 = from.left + NODE_WIDTH;
            const y1 = from.top + nodeHeight(layout.segments[edge.from], expandedSegmentIds) / 2;
            const x2 = to.left;
            const y2 = to.top + nodeHeight(layout.segments[edge.to], expandedSegmentIds) / 2;
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
          const position = toCanvasPosition(layout.positions[segment.id], metrics.rowOffsets);

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
              className={[
                "tree-node",
                selected ? "selected" : "",
                expanded ? "expanded" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              key={segment.id}
              style={{
                left: position.left,
                top: position.top,
                width: NODE_WIDTH,
                height: nodeHeight(segment, expandedSegmentIds),
              }}
            >
              <div className="tree-node-topline">
                <button className="tree-node-main" onClick={() => onSelectNode(lastNode.id)} type="button">
                  <span className="tree-node-label">{formatSegmentLabel(tree, segment)}</span>
                </button>
                <button
                  className="tree-node-expand"
                  onClick={() => toggleSegment(expandedSegmentIds, setExpandedSegmentIds, segment.id)}
                  title={expanded ? "Hide moves and board" : "Show moves and board"}
                  type="button"
                >
                  {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                </button>
              </div>
              {segment.nodeIds.length > 1 ? (
                <div className="tree-node-moves">
                  {getVisibleMoveItems(segment.nodeIds, expanded, tree.selectedNodeId).map((item) => {
                    if (item.kind === "ellipsis") {
                      return (
                        <button
                          className={item.selected ? "tree-node-move ellipsis active" : "tree-node-move ellipsis"}
                          key="ellipsis"
                          onClick={() => toggleSegment(expandedSegmentIds, setExpandedSegmentIds, segment.id)}
                          title="Show all moves"
                          type="button"
                        >
                          ...
                        </button>
                      );
                    }

                    const node = tree.nodes[item.nodeId];

                    return (
                      <button
                        className={tree.selectedNodeId === item.nodeId ? "tree-node-move active" : "tree-node-move"}
                        key={item.nodeId}
                        onClick={() => onSelectNode(item.nodeId)}
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
                  size={128}
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

function nodeHeight(segment: CompressedTreeSegment | undefined, expandedSegmentIds: Set<string>) {
  if (!segment || !expandedSegmentIds.has(segment.id)) {
    return COLLAPSED_NODE_HEIGHT;
  }

  const moveRows = Math.max(1, Math.ceil(segment.nodeIds.length / MOVE_BUTTONS_PER_ROW));

  return BASE_EXPANDED_NODE_HEIGHT + Math.max(0, moveRows - 1) * MOVE_ROW_HEIGHT;
}

function getVisibleMoveItems(nodeIds: NodeId[], expanded: boolean, selectedNodeId: NodeId) {
  if (expanded || nodeIds.length <= 2) {
    return nodeIds.map((nodeId) => ({
      kind: "node" as const,
      nodeId,
    }));
  }

  return [
    {
      kind: "node" as const,
      nodeId: nodeIds[0],
    },
    {
      kind: "ellipsis" as const,
      selected: nodeIds.slice(1, -1).includes(selectedNodeId),
    },
    {
      kind: "node" as const,
      nodeId: nodeIds[nodeIds.length - 1],
    },
  ];
}

function buildCanvasMetrics(
  positions: Record<string, { column: number; row: number }>,
  segments: Record<string, CompressedTreeSegment>,
  expandedSegmentIds: Set<string>,
) {
  const maxRow = Math.max(0, ...Object.values(positions).map((position) => position.row));
  const rowHeights = Array.from({ length: maxRow + 1 }, () => COLLAPSED_NODE_HEIGHT);

  for (const [segmentId, position] of Object.entries(positions)) {
    rowHeights[position.row] = Math.max(rowHeights[position.row], nodeHeight(segments[segmentId], expandedSegmentIds));
  }

  const rowOffsets: number[] = [];
  let nextTop = CANVAS_PADDING;

  for (const rowHeight of rowHeights) {
    rowOffsets.push(nextTop);
    nextTop += rowHeight + ROW_GAP;
  }

  return {
    height: nextTop + CANVAS_PADDING - ROW_GAP,
    rowOffsets,
  };
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

function toCanvasPosition(position: { column: number; row: number } | undefined, rowOffsets: number[]) {
  if (!position) {
    return null;
  }

  return {
    left: position.column * COLUMN_WIDTH + 18,
    top: rowOffsets[position.row] ?? CANVAS_PADDING,
  };
}
