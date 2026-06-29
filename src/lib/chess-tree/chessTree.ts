import { Chess } from "chess.js";
import { OPENING_BOOK, findOpeningForPosition } from "@/lib/data/openings";
import type {
  BoardArrow,
  BoardMark,
  CompressedTreeLayout,
  CompressedTreeSegment,
  EngineScore,
  GameTree,
  MoveNode,
  NodeId,
  OpeningEntry,
  TreeLayout,
} from "./types";

export const START_FEN = new Chess().fen();

type TreeOptions = {
  idFactory?: () => NodeId;
  now?: () => string;
  openings?: OpeningEntry[];
};

type ParsedMoveResult = {
  tree: GameTree;
  nodeId: NodeId;
};

export type MoveNavigationChoice = {
  nodeId: NodeId;
  label: string;
};

export type MoveNavigationTarget =
  | {
      kind: "none";
    }
  | {
      kind: "node";
      nodeId: NodeId;
    }
  | {
      kind: "choices";
      choices: MoveNavigationChoice[];
    };

const RESULT_TOKENS = new Set(["1-0", "0-1", "1/2-1/2", "*"]);

export function createDefaultIdFactory() {
  return globalThis.crypto?.randomUUID?.bind(globalThis.crypto) ?? (() => `node-${Date.now()}-${Math.random()}`);
}

export function createSequentialIdFactory(prefix = "node") {
  let nextId = 0;

  return () => `${prefix}-${nextId++}`;
}

export function createInitialTree(options: TreeOptions = {}): GameTree {
  const nextId = options.idFactory ?? createDefaultIdFactory();
  const now = options.now?.() ?? new Date().toISOString();
  const rootId = nextId();
  const root: MoveNode = {
    id: rootId,
    parentId: null,
    childrenIds: [],
    ply: 0,
    san: "Start",
    uci: "",
    fen: START_FEN,
    caption: "",
    marks: [],
    arrows: [],
    sanPath: [],
  };

  return {
    rootId,
    selectedNodeId: rootId,
    nodes: {
      [rootId]: root,
    },
    title: "Untitled analysis",
    updatedAt: now,
  };
}

export function createTreeFromNotation(input: string, options: TreeOptions = {}): GameTree {
  const idFactory = options.idFactory ?? createDefaultIdFactory();
  let tree = createInitialTree({
    ...options,
    idFactory,
  });
  let parentId = tree.rootId;

  for (const san of parseMainLineNotation(input)) {
    const result = addSanMove(tree, parentId, san, {
      ...options,
      idFactory,
    });
    tree = result.tree;
    parentId = result.nodeId;
  }

  return {
    ...tree,
    selectedNodeId: parentId,
  };
}

export function addSanMove(tree: GameTree, parentId: NodeId, san: string, options: TreeOptions = {}): ParsedMoveResult {
  const parent = tree.nodes[parentId];

  if (!parent) {
    throw new Error(`Unknown parent node: ${parentId}`);
  }

  const chess = new Chess(parent.fen);
  const move = chess.move(cleanSanToken(san), { strict: false });

  if (!move) {
    throw new Error(`Illegal SAN move "${san}" from selected position.`);
  }

  const uci = `${move.from}${move.to}${move.promotion ?? ""}`;
  const existingChildId = parent.childrenIds.find((childId) => {
    const child = tree.nodes[childId];

    return child.uci === uci;
  });

  if (existingChildId) {
    return {
      tree: touchTree({
        ...tree,
        selectedNodeId: existingChildId,
      }, options.now),
      nodeId: existingChildId,
    };
  }

  const nextId = options.idFactory ?? createDefaultIdFactory();
  const sanPath = [...parent.sanPath, move.san];
  const fen = chess.fen();
  const opening = findOpeningForPosition(fen, sanPath, options.openings ?? OPENING_BOOK);
  const nodeId = nextId();
  const node: MoveNode = {
    id: nodeId,
    parentId,
    childrenIds: [],
    ply: parent.ply + 1,
    san: move.san,
    uci,
    fen,
    caption: "",
    marks: [],
    arrows: [],
    sanPath,
    ecoCode: opening?.eco,
    openingName: opening?.name,
  };
  const nextParent: MoveNode = {
    ...parent,
    childrenIds: [...parent.childrenIds, nodeId],
  };

  return {
    tree: touchTree({
      ...tree,
      selectedNodeId: nodeId,
      nodes: {
        ...tree.nodes,
        [parentId]: nextParent,
        [nodeId]: node,
      },
    }, options.now),
    nodeId,
  };
}

export function updateCaption(tree: GameTree, nodeId: NodeId, caption: string, now?: () => string): GameTree {
  const node = tree.nodes[nodeId];

  if (!node) {
    return tree;
  }

  return touchTree({
    ...tree,
    nodes: {
      ...tree.nodes,
      [nodeId]: {
        ...node,
        caption,
      },
    },
  }, now);
}

export function splitNodeBefore(tree: GameTree, nodeId: NodeId, now?: () => string): GameTree {
  const node = tree.nodes[nodeId];

  if (!node || node.parentId === null || node.splitBefore) {
    return tree;
  }

  return replaceNode(tree, {
    ...node,
    splitBefore: true,
  }, now);
}

export function updateTitle(tree: GameTree, title: string, now?: () => string): GameTree {
  return touchTree({
    ...tree,
    title,
  }, now);
}

export function selectNode(tree: GameTree, nodeId: NodeId): GameTree {
  if (!tree.nodes[nodeId]) {
    return tree;
  }

  return {
    ...tree,
    selectedNodeId: nodeId,
  };
}

export function setNodeEval(tree: GameTree, nodeId: NodeId, evaluation: EngineScore, now?: () => string): GameTree {
  const node = tree.nodes[nodeId];

  if (!node) {
    return tree;
  }

  return touchTree({
    ...tree,
    nodes: {
      ...tree.nodes,
      [nodeId]: {
        ...node,
        eval: evaluation,
      },
    },
  }, now);
}

export function addSquareMark(tree: GameTree, nodeId: NodeId, square: string, color = "#f4d35e", now?: () => string): GameTree {
  const node = tree.nodes[nodeId];

  if (!node) {
    return tree;
  }

  const normalized = square.toLowerCase();
  const existing = node.marks.find((mark) => mark.square === normalized);
  const marks = existing
    ? node.marks.filter((mark) => mark.square !== normalized)
    : [...node.marks, createBoardMark(normalized, color)];

  return replaceNode(tree, {
    ...node,
    marks,
  }, now);
}

export function addArrow(
  tree: GameTree,
  nodeId: NodeId,
  from: string,
  to: string,
  color = "#ef476f",
  now?: () => string,
): GameTree {
  const node = tree.nodes[nodeId];

  if (!node) {
    return tree;
  }

  const normalizedFrom = from.toLowerCase();
  const normalizedTo = to.toLowerCase();
  const existing = node.arrows.find((arrow) => arrow.from === normalizedFrom && arrow.to === normalizedTo);
  const arrows = existing
    ? node.arrows.filter((arrow) => arrow.id !== existing.id)
    : [...node.arrows, createBoardArrow(normalizedFrom, normalizedTo, color)];

  return replaceNode(tree, {
    ...node,
    arrows,
  }, now);
}

export function clearBoardAnnotations(tree: GameTree, nodeId: NodeId, now?: () => string): GameTree {
  const node = tree.nodes[nodeId];

  if (!node) {
    return tree;
  }

  return replaceNode(tree, {
    ...node,
    marks: [],
    arrows: [],
  }, now);
}

export function deleteSubtree(tree: GameTree, nodeId: NodeId, now?: () => string): GameTree {
  const node = tree.nodes[nodeId];

  if (!node || nodeId === tree.rootId) {
    return tree;
  }

  const idsToDelete = collectSubtreeNodeIds(tree, nodeId);
  const nodes = { ...tree.nodes };

  for (const id of idsToDelete) {
    delete nodes[id];
  }

  if (node.parentId && nodes[node.parentId]) {
    nodes[node.parentId] = {
      ...nodes[node.parentId],
      childrenIds: nodes[node.parentId].childrenIds.filter((childId) => !idsToDelete.has(childId)),
    };
  }

  return touchTree({
    ...tree,
    selectedNodeId: node.parentId ?? tree.rootId,
    nodes,
  }, now);
}

export function buildTreeLayout(tree: GameTree): TreeLayout {
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

  const columns = [...nodesByPly.entries()]
    .sort(([a], [b]) => a - b)
    .map(([ply, nodeIds]) => ({
      ply,
      nodeIds,
    }));
  const positions: TreeLayout["positions"] = {};

  columns.forEach((column, columnIndex) => {
    column.nodeIds.forEach((nodeId, row) => {
      positions[nodeId] = {
        column: columnIndex,
        row,
      };
    });
  });

  return {
    columns,
    edges,
    positions,
  };
}

export function buildCompressedTreeLayout(tree: GameTree): CompressedTreeLayout {
  const segments: Record<string, CompressedTreeSegment> = {};
  const traversalOrder: string[] = [];
  const rootSegmentId = createSegmentId([tree.rootId]);
  const rootNode = tree.nodes[tree.rootId];
  const rootSegment: CompressedTreeSegment = {
    id: rootSegmentId,
    parentSegmentId: null,
    childSegmentIds: [],
    nodeIds: [tree.rootId],
    startPly: rootNode?.ply ?? 0,
    endPly: rootNode?.ply ?? 0,
  };

  segments[rootSegmentId] = rootSegment;
  traversalOrder.push(rootSegmentId);

  function createLineSegment(startNodeId: NodeId, parentSegmentId: string): string {
    const nodeIds: NodeId[] = [];
    let current = tree.nodes[startNodeId];

    while (current) {
      nodeIds.push(current.id);

      if (current.childrenIds.length !== 1) {
        break;
      }

      const child = tree.nodes[current.childrenIds[0]];

      if (!child || child.splitBefore) {
        break;
      }

      current = child;
    }

    const firstNode = tree.nodes[nodeIds[0]];
    const lastNode = tree.nodes[nodeIds[nodeIds.length - 1]];
    const segmentId = createSegmentId(nodeIds);
    const segment: CompressedTreeSegment = {
      id: segmentId,
      parentSegmentId,
      childSegmentIds: [],
      nodeIds,
      startPly: firstNode.ply,
      endPly: lastNode.ply,
    };

    segments[segmentId] = segment;
    traversalOrder.push(segmentId);
    segment.childSegmentIds = lastNode.childrenIds.map((childId) => createLineSegment(childId, segmentId));

    return segmentId;
  }

  rootSegment.childSegmentIds = rootNode?.childrenIds.map((childId) => createLineSegment(childId, rootSegmentId)) ?? [];

  const positions: CompressedTreeLayout["positions"] = {};
  const startPlyValues = [...new Set(traversalOrder.map((segmentId) => segments[segmentId].startPly))].sort(
    (a, b) => a - b,
  );
  const columnByStartPly = new Map(startPlyValues.map((ply, index) => [ply, index]));
  const subtreeHeights = new Map<string, number>();

  function getSubtreeHeight(segmentId: string): number {
    const segment = segments[segmentId];

    if (!segment || segment.childSegmentIds.length === 0) {
      subtreeHeights.set(segmentId, 1);

      return 1;
    }

    const height = segment.childSegmentIds.reduce((sum, childSegmentId) => sum + getSubtreeHeight(childSegmentId), 0);
    subtreeHeights.set(segmentId, Math.max(1, height));

    return subtreeHeights.get(segmentId) as number;
  }

  function placeSegment(segmentId: string, row: number) {
    const segment = segments[segmentId];

    if (!segment) {
      return;
    }

    positions[segmentId] = {
      column: columnByStartPly.get(segment.startPly) ?? 0,
      row,
    };

    let nextChildRow = row;

    for (const childSegmentId of segment.childSegmentIds) {
      placeSegment(childSegmentId, nextChildRow);
      nextChildRow += subtreeHeights.get(childSegmentId) ?? 1;
    }
  }

  getSubtreeHeight(rootSegmentId);
  placeSegment(rootSegmentId, 0);

  const segmentsByColumn = new Map<number, string[]>();

  for (const segmentId of traversalOrder) {
    const position = positions[segmentId];

    if (!position) {
      continue;
    }

    segmentsByColumn.set(position.column, [...(segmentsByColumn.get(position.column) ?? []), segmentId]);
  }

  const columns = startPlyValues.map((ply, columnIndex) => ({
    ply,
    segmentIds: (segmentsByColumn.get(columnIndex) ?? []).sort(
      (left, right) => positions[left].row - positions[right].row,
    ),
  }));

  const edges = Object.values(segments)
    .filter((segment) => segment.parentSegmentId)
    .map((segment) => ({
      from: segment.parentSegmentId as string,
      to: segment.id,
    }));

  return {
    rootSegmentId,
    segments,
    columns,
    edges,
    positions,
  };
}

export function formatSegmentLabel(tree: GameTree, segment: CompressedTreeSegment): string {
  const firstNode = tree.nodes[segment.nodeIds[0]];
  const lastNode = tree.nodes[segment.nodeIds[segment.nodeIds.length - 1]];

  if (!firstNode || !lastNode) {
    return "";
  }

  if (segment.nodeIds.length === 1) {
    return formatMoveLabel(firstNode);
  }

  return `${formatMoveLabel(firstNode)} ... ${formatMoveLabel(lastNode)}`;
}

export function getCompressedSegmentForNode(tree: GameTree, nodeId: NodeId): CompressedTreeSegment | undefined {
  const layout = buildCompressedTreeLayout(tree);

  return Object.values(layout.segments).find((segment) => segment.nodeIds.includes(nodeId));
}

export function getSegmentCaptionNodeId(tree: GameTree, nodeId: NodeId): NodeId {
  const segment = getCompressedSegmentForNode(tree, nodeId);

  return segment?.nodeIds[segment.nodeIds.length - 1] ?? nodeId;
}

export function getPreviousMoveNodeId(tree: GameTree, nodeId: NodeId): NodeId | null {
  const context = getCompressedSegmentContext(tree, nodeId);

  if (!context) {
    return null;
  }

  const { layout, segment, nodeIndex } = context;

  if (nodeIndex > 0) {
    return segment.nodeIds[nodeIndex - 1];
  }

  if (!segment.parentSegmentId) {
    return null;
  }

  const parentSegment = layout.segments[segment.parentSegmentId];

  return parentSegment?.nodeIds[parentSegment.nodeIds.length - 1] ?? null;
}

export function getNextMoveNavigation(tree: GameTree, nodeId: NodeId): MoveNavigationTarget {
  const context = getCompressedSegmentContext(tree, nodeId);

  if (!context) {
    return {
      kind: "none",
    };
  }

  const { layout, segment, nodeIndex } = context;

  if (nodeIndex < segment.nodeIds.length - 1) {
    return {
      kind: "node",
      nodeId: segment.nodeIds[nodeIndex + 1],
    };
  }

  if (segment.childSegmentIds.length === 0) {
    return {
      kind: "none",
    };
  }

  if (segment.childSegmentIds.length === 1) {
    const childSegment = layout.segments[segment.childSegmentIds[0]];

    return childSegment
      ? {
          kind: "node",
          nodeId: childSegment.nodeIds[0],
        }
      : {
          kind: "none",
        };
  }

  return {
    kind: "choices",
    choices: segment.childSegmentIds
      .map((segmentId) => layout.segments[segmentId])
      .filter(Boolean)
      .map((childSegment) => ({
        nodeId: childSegment.nodeIds[0],
        label: formatSegmentLabel(tree, childSegment),
      })),
  };
}

export function getTopMoveNodeId(tree: GameTree): NodeId {
  const layout = buildCompressedTreeLayout(tree);
  const rootSegment = layout.segments[layout.rootSegmentId];
  const firstChildSegment = rootSegment?.childSegmentIds
    .map((segmentId) => layout.segments[segmentId])
    .filter(Boolean)
    .sort((left, right) => {
      const leftPosition = layout.positions[left.id];
      const rightPosition = layout.positions[right.id];

      return (leftPosition?.row ?? 0) - (rightPosition?.row ?? 0);
    })[0];

  return firstChildSegment?.nodeIds[0] ?? tree.rootId;
}

export function getSegmentEndNodeId(tree: GameTree, nodeId: NodeId): NodeId {
  return getSegmentCaptionNodeId(tree, nodeId);
}

export function getSelectedNode(tree: GameTree): MoveNode {
  return tree.nodes[tree.selectedNodeId] ?? tree.nodes[tree.rootId];
}

export function formatMoveLabel(node: MoveNode): string {
  if (node.ply === 0) {
    return "Start";
  }

  const moveNumber = Math.ceil(node.ply / 2);

  return node.ply % 2 === 1 ? `${moveNumber}. ${node.san}` : `${moveNumber}... ${node.san}`;
}

export function formatEngineScore(score?: EngineScore): string {
  if (!score) {
    return "";
  }

  const depth = score.depth ? ` d${score.depth}` : "";
  const bestMove = score.bestMove ? ` ${score.bestMove}` : "";

  if (score.kind === "mate") {
    return `M${score.value}${depth}${bestMove}`;
  }

  const pawnScore = (score.value / 100).toFixed(2);

  return `${score.value > 0 ? "+" : ""}${pawnScore}${depth}${bestMove}`;
}

export function parseMainLineNotation(input: string): string[] {
  return stripPgnVariations(input)
    .replace(/^\s*\[[^\]]+\]\s*$/gm, " ")
    .replace(/\{[^}]*\}/g, " ")
    .replace(/;[^\n\r]*/g, " ")
    .replace(/\$\d+/g, " ")
    .replace(/\d+\.(\.\.)?/g, " ")
    .split(/\s+/)
    .map(cleanSanToken)
    .filter(Boolean)
    .filter((token) => !RESULT_TOKENS.has(token));
}

export function findOpeningForPath(sanPath: string[], openings: OpeningEntry[] = OPENING_BOOK) {
  return findOpeningForPosition("", sanPath, openings);
}

function cleanSanToken(token: string) {
  return token
    .trim()
    .replace(/^\d+\.(\.\.)?/, "")
    .replace(/[!?]+$/g, "");
}

function stripPgnVariations(input: string) {
  let depth = 0;
  let output = "";

  for (const char of input) {
    if (char === "(") {
      depth += 1;
      output += " ";
      continue;
    }

    if (char === ")") {
      depth = Math.max(0, depth - 1);
      output += " ";
      continue;
    }

    if (depth === 0) {
      output += char;
    }
  }

  return output;
}

function replaceNode(tree: GameTree, node: MoveNode, now?: () => string): GameTree {
  return touchTree({
    ...tree,
    nodes: {
      ...tree.nodes,
      [node.id]: node,
    },
  }, now);
}

function getCompressedSegmentContext(tree: GameTree, nodeId: NodeId) {
  const layout = buildCompressedTreeLayout(tree);
  const segment = Object.values(layout.segments).find((candidate) => candidate.nodeIds.includes(nodeId));

  if (!segment) {
    return null;
  }

  return {
    layout,
    segment,
    nodeIndex: segment.nodeIds.indexOf(nodeId),
  };
}

function collectSubtreeNodeIds(tree: GameTree, nodeId: NodeId): Set<NodeId> {
  const node = tree.nodes[nodeId];
  const ids = new Set<NodeId>();

  if (!node) {
    return ids;
  }

  ids.add(nodeId);

  for (const childId of node.childrenIds) {
    for (const descendantId of collectSubtreeNodeIds(tree, childId)) {
      ids.add(descendantId);
    }
  }

  return ids;
}

function createBoardMark(square: string, color: string): BoardMark {
  return {
    id: `mark-${square}-${Date.now()}`,
    square,
    color,
  };
}

function createBoardArrow(from: string, to: string, color: string): BoardArrow {
  return {
    id: `arrow-${from}-${to}-${Date.now()}`,
    from,
    to,
    color,
  };
}

function touchTree(tree: GameTree, now?: () => string): GameTree {
  return {
    ...tree,
    updatedAt: now?.() ?? new Date().toISOString(),
  };
}

function createSegmentId(nodeIds: NodeId[]) {
  return `segment-${nodeIds[0]}-${nodeIds[nodeIds.length - 1]}`;
}
