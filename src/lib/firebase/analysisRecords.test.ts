import { describe, expect, it } from "vitest";
import { createInitialTree, updateTitle } from "@/lib/chess-tree/chessTree";
import {
  ANALYSIS_RECORD_VERSION,
  createAnalysisRecord,
  createAnalysisUpdateRecord,
  parseAnalysisRecord,
  toAnalysisSummary,
} from "./analysisRecords";

describe("analysis records", () => {
  it("creates a new analysis record with title, tree, version, and timestamps", () => {
    const tree = updateTitle(createInitialTree(), "Scotch prep", () => "tree-now");
    const record = createAnalysisRecord(tree, "record-now");

    expect(record).toEqual({
      version: ANALYSIS_RECORD_VERSION,
      title: "Scotch prep",
      tree,
      createdAt: "record-now",
      updatedAt: "record-now",
    });
  });

  it("creates an update record without overwriting createdAt", () => {
    const tree = updateTitle(createInitialTree(), "Updated line", () => "tree-now");
    const record = createAnalysisUpdateRecord(tree, "update-now");

    expect(record).toEqual({
      version: ANALYSIS_RECORD_VERSION,
      title: "Updated line",
      tree,
      updatedAt: "update-now",
    });
  });

  it("parses summaries and rejects unsupported records", () => {
    const tree = createInitialTree();
    const record = createAnalysisRecord(tree, "now");

    expect(parseAnalysisRecord(record)?.tree).toBe(tree);
    expect(toAnalysisSummary("analysis-1", record)).toEqual({
      id: "analysis-1",
      title: "제목 없는 분석",
      updatedAt: "now",
    });
    expect(parseAnalysisRecord({ ...record, version: 999 })).toBeNull();
    expect(toAnalysisSummary("bad", { title: "Missing tree" })).toBeNull();
  });
});
