import { Chess } from "chess.js";
import { OPENING_BOOK } from "@/lib/data/openings";
import type {
  BoardArrow,
  BoardMark,
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
  const opening = findOpeningForPath(sanPath, options.openings ?? OPENING_BOOK);
  const nodeId = nextId();
  const node: MoveNode = {
    id: nodeId,
    parentId,
    childrenIds: [],
    ply: parent.ply + 1,
    san: move.san,
    uci,
    fen: chess.fen(),
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
  return openings.find((opening) => sameMovePath(opening.moves, sanPath));
}

function sameMovePath(left: string[], right: string[]) {
  return left.length === right.length && left.every((move, index) => move === right[index]);
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
