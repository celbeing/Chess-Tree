import { describe, expect, it } from "vitest";
import {
  addSanMove,
  buildTreeLayout,
  createInitialTree,
  createSequentialIdFactory,
  createTreeFromNotation,
  formatMoveLabel,
  parseMainLineNotation,
  updateCaption,
} from "./chessTree";

describe("parseMainLineNotation", () => {
  it("keeps the main line and strips PGN metadata", () => {
    expect(
      parseMainLineNotation(`
        [Event "Sample"]
        1. e4 e5 2. Nf3 Nc6 (2... d6) 3. Bb5 a6 {comment} 1-0
      `),
    ).toEqual(["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"]);
  });
});

describe("chess tree", () => {
  it("creates a main line with SAN, FEN, and opening metadata", () => {
    const tree = createTreeFromNotation("1. e4 e5 2. Nf3 Nc6 3. Bb5", {
      idFactory: createSequentialIdFactory("t"),
      now: () => "2026-01-01T00:00:00.000Z",
    });

    const selected = tree.nodes[tree.selectedNodeId];

    expect(Object.values(tree.nodes)).toHaveLength(6);
    expect(selected.san).toBe("Bb5");
    expect(selected.fen).toContain(" b ");
    expect(selected.ecoCode).toBe("C60");
    expect(selected.openingName).toBe("Ruy Lopez");
    expect(formatMoveLabel(selected)).toBe("3. Bb5");
  });

  it("adds alternate branches at the same ply column", () => {
    const idFactory = createSequentialIdFactory("b");
    let tree = createInitialTree({ idFactory, now: () => "now" });
    let result = addSanMove(tree, tree.rootId, "e4", { idFactory, now: () => "now" });
    tree = result.tree;
    const afterE4 = result.nodeId;
    result = addSanMove(tree, afterE4, "e5", { idFactory, now: () => "now" });
    tree = result.tree;
    result = addSanMove(tree, afterE4, "c5", { idFactory, now: () => "now" });
    tree = result.tree;

    const layout = buildTreeLayout(tree);
    const blackReplies = layout.columns.find((column) => column.ply === 2);

    expect(blackReplies?.nodeIds).toHaveLength(2);
    expect(blackReplies?.nodeIds.map((id) => tree.nodes[id].san)).toEqual(["e5", "c5"]);
  });

  it("does not duplicate the same move under one parent", () => {
    const idFactory = createSequentialIdFactory("d");
    let tree = createInitialTree({ idFactory, now: () => "now" });
    const first = addSanMove(tree, tree.rootId, "e4", { idFactory, now: () => "now" });
    tree = first.tree;
    const second = addSanMove(tree, tree.rootId, "e4", { idFactory, now: () => "now" });

    expect(Object.values(second.tree.nodes)).toHaveLength(2);
    expect(second.nodeId).toBe(first.nodeId);
  });

  it("updates captions on the targeted node only", () => {
    const tree = createTreeFromNotation("e4 e5", {
      idFactory: createSequentialIdFactory("c"),
      now: () => "now",
    });
    const updated = updateCaption(tree, tree.selectedNodeId, "Critical reply", () => "later");

    expect(updated.nodes[tree.selectedNodeId].caption).toBe("Critical reply");
    expect(updated.updatedAt).toBe("later");
    expect(updated.nodes[tree.rootId].caption).toBe("");
  });
});
