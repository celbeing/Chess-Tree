import type { GameTree } from "@/lib/chess-tree/types";

export const ANALYSIS_RECORD_VERSION = 1;

export type AnalysisRecord = {
  version: typeof ANALYSIS_RECORD_VERSION;
  title: string;
  tree: GameTree;
  createdAt: string;
  updatedAt: string;
};

export type AnalysisUpdateRecord = Omit<AnalysisRecord, "createdAt">;

export type AnalysisSummary = {
  id: string;
  title: string;
  updatedAt: string;
};

export function createAnalysisRecord(tree: GameTree, now = new Date().toISOString()): AnalysisRecord {
  return {
    version: ANALYSIS_RECORD_VERSION,
    title: getAnalysisTitle(tree),
    tree,
    createdAt: now,
    updatedAt: now,
  };
}

export function createAnalysisUpdateRecord(tree: GameTree, now = new Date().toISOString()): AnalysisUpdateRecord {
  return {
    version: ANALYSIS_RECORD_VERSION,
    title: getAnalysisTitle(tree),
    tree,
    updatedAt: now,
  };
}

export function getAnalysisTitle(tree: GameTree) {
  return tree.title.trim() || "제목 없는 분석";
}

export function parseAnalysisRecord(value: unknown): AnalysisRecord | null {
  if (!isRecord(value) || value.version !== ANALYSIS_RECORD_VERSION || typeof value.title !== "string") {
    return null;
  }

  if (typeof value.createdAt !== "string" || typeof value.updatedAt !== "string" || !isGameTree(value.tree)) {
    return null;
  }

  return value as AnalysisRecord;
}

export function toAnalysisSummary(id: string, value: unknown): AnalysisSummary | null {
  const record = parseAnalysisRecord(value);

  if (!record) {
    return null;
  }

  return {
    id,
    title: record.title,
    updatedAt: record.updatedAt,
  };
}

function isGameTree(value: unknown): value is GameTree {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.rootId === "string" &&
    typeof value.selectedNodeId === "string" &&
    isRecord(value.nodes) &&
    typeof value.title === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
