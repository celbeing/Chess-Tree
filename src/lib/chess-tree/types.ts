export type NodeId = string;

export type EngineScore =
  | {
      kind: "cp";
      value: number;
      depth?: number;
      bestMove?: string;
    }
  | {
      kind: "mate";
      value: number;
      depth?: number;
      bestMove?: string;
    };

export type BoardArrow = {
  id: string;
  from: string;
  to: string;
  color: string;
};

export type BoardMark = {
  id: string;
  square: string;
  color: string;
};

export type MoveNode = {
  id: NodeId;
  parentId: NodeId | null;
  childrenIds: NodeId[];
  ply: number;
  san: string;
  uci: string;
  fen: string;
  caption: string;
  splitBefore?: boolean;
  ecoCode?: string;
  openingName?: string;
  eval?: EngineScore;
  marks: BoardMark[];
  arrows: BoardArrow[];
  sanPath: string[];
};

export type GameTree = {
  rootId: NodeId;
  selectedNodeId: NodeId;
  nodes: Record<NodeId, MoveNode>;
  title: string;
  updatedAt: string;
};

export type OpeningEntry = {
  eco: string;
  name: string;
  moves: string[];
};

export type TreeColumn = {
  ply: number;
  nodeIds: NodeId[];
};

export type TreeEdge = {
  from: NodeId;
  to: NodeId;
};

export type TreeLayout = {
  columns: TreeColumn[];
  edges: TreeEdge[];
  positions: Record<NodeId, { column: number; row: number }>;
};

export type CompressedTreeSegment = {
  id: string;
  parentSegmentId: string | null;
  childSegmentIds: string[];
  nodeIds: NodeId[];
  startPly: number;
  endPly: number;
};

export type CompressedTreeEdge = {
  from: string;
  to: string;
};

export type CompressedTreeLayout = {
  rootSegmentId: string;
  segments: Record<string, CompressedTreeSegment>;
  columns: Array<{
    ply: number;
    segmentIds: string[];
  }>;
  edges: CompressedTreeEdge[];
  positions: Record<string, { column: number; row: number }>;
};
