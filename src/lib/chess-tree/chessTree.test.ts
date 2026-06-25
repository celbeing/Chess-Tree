import { describe, expect, it } from "vitest";
import {
  addSanMove,
  buildCompressedTreeLayout,
  buildTreeLayout,
  createInitialTree,
  createSequentialIdFactory,
  createTreeFromNotation,
  deleteSubtree,
  formatMoveLabel,
  formatSegmentLabel,
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

  it("uses the bundled Lichess ECO data for deeper Sicilian variations", () => {
    const sicilian = createTreeFromNotation("1. e4 c5", {
      idFactory: createSequentialIdFactory("eco-a"),
      now: () => "now",
    });
    const delayedAlapin = createTreeFromNotation("1. e4 c5 2. Nf3 e6 3. c3", {
      idFactory: createSequentialIdFactory("eco-b"),
      now: () => "now",
    });

    expect(sicilian.nodes[sicilian.selectedNodeId].ecoCode).toBe("B20");
    expect(sicilian.nodes[sicilian.selectedNodeId].openingName).toBe("Sicilian Defense");
    expect(delayedAlapin.nodes[delayedAlapin.selectedNodeId].ecoCode).toBe("B40");
    expect(delayedAlapin.nodes[delayedAlapin.selectedNodeId].openingName).toBe(
      "Sicilian Defense: Delayed Alapin Variation, with e6",
    );
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

  it("compresses a straight main line into one segment after the root", () => {
    const tree = createTreeFromNotation("1. e4 e5 2. Nf3 Nc6 3. Bc4", {
      idFactory: createSequentialIdFactory("s"),
      now: () => "now",
    });
    const layout = buildCompressedTreeLayout(tree);
    const nonRootSegments = Object.values(layout.segments).filter((segment) => segment.id !== layout.rootSegmentId);

    expect(nonRootSegments).toHaveLength(1);
    expect(nonRootSegments[0].nodeIds.map((nodeId) => tree.nodes[nodeId].san)).toEqual([
      "e4",
      "e5",
      "Nf3",
      "Nc6",
      "Bc4",
    ]);
    expect(formatSegmentLabel(tree, nonRootSegments[0])).toBe("1. e4 ... 3. Bc4");
  });

  it("keeps the common line compressed and splits child segments at the branch point", () => {
    const idFactory = createSequentialIdFactory("i");
    let tree = createTreeFromNotation("1. e4 e5 2. Nf3 Nc6 3. Bc4", {
      idFactory,
      now: () => "now",
    });
    const italianPositionId = tree.selectedNodeId;

    let result = addSanMove(tree, italianPositionId, "Nf6", { idFactory, now: () => "now" });
    tree = result.tree;
    result = addSanMove(tree, italianPositionId, "Bc5", { idFactory, now: () => "now" });
    tree = result.tree;

    const layout = buildCompressedTreeLayout(tree);
    const commonSegment = Object.values(layout.segments).find((segment) =>
      segment.nodeIds.some((nodeId) => tree.nodes[nodeId].san === "Bc4"),
    );

    expect(commonSegment?.nodeIds.map((nodeId) => tree.nodes[nodeId].san)).toEqual([
      "e4",
      "e5",
      "Nf3",
      "Nc6",
      "Bc4",
    ]);
    expect(commonSegment?.childSegmentIds).toHaveLength(2);
    expect(commonSegment?.childSegmentIds.map((segmentId) => {
      const segment = layout.segments[segmentId];

      return tree.nodes[segment.nodeIds[0]].san;
    })).toEqual(["Nf6", "Bc5"]);
  });

  it("splits an existing compressed segment when branching from an internal move", () => {
    const idFactory = createSequentialIdFactory("m");
    let tree = createTreeFromNotation("1. e4 e5 2. Nf3 Nc6 3. Bc4", {
      idFactory,
      now: () => "now",
    });
    const e4NodeId = Object.values(tree.nodes).find((node) => node.san === "e4")?.id;

    expect(e4NodeId).toBeDefined();

    const result = addSanMove(tree, e4NodeId as string, "c5", { idFactory, now: () => "now" });
    tree = result.tree;

    const layout = buildCompressedTreeLayout(tree);
    const e4Segment = Object.values(layout.segments).find((segment) =>
      segment.nodeIds.some((nodeId) => tree.nodes[nodeId].san === "e4"),
    );

    expect(e4Segment?.nodeIds.map((nodeId) => tree.nodes[nodeId].san)).toEqual(["e4"]);
    expect(e4Segment?.childSegmentIds).toHaveLength(2);

    const childSegments = e4Segment?.childSegmentIds.map((segmentId) => layout.segments[segmentId]) ?? [];

    expect(childSegments.map((segment) => tree.nodes[segment.nodeIds[0]].san)).toEqual(["e5", "c5"]);
    expect(childSegments.map((segment) => layout.positions[segment.id].column)).toEqual([2, 2]);
    expect(childSegments.find((segment) => tree.nodes[segment.nodeIds[0]].san === "e5")?.nodeIds.map(
      (nodeId) => tree.nodes[nodeId].san,
    )).toEqual(["e5", "Nf3", "Nc6", "Bc4"]);
  });

  it("keeps every child subtree at or below its parent row", () => {
    const idFactory = createSequentialIdFactory("r");
    let tree = createTreeFromNotation("1. e4 e5 2. Nf3 Nc6 3. Bc4", {
      idFactory,
      now: () => "now",
    });
    const e4NodeId = Object.values(tree.nodes).find((node) => node.san === "e4")?.id as string;
    const e5NodeId = Object.values(tree.nodes).find((node) => node.san === "e5")?.id as string;
    let result = addSanMove(tree, e4NodeId, "c5", { idFactory, now: () => "now" });
    tree = result.tree;
    result = addSanMove(tree, e5NodeId, "Bc4", { idFactory, now: () => "now" });
    tree = result.tree;

    const layout = buildCompressedTreeLayout(tree);

    for (const segment of Object.values(layout.segments)) {
      const parentPosition = layout.positions[segment.id];

      for (const childSegmentId of segment.childSegmentIds) {
        expect(layout.positions[childSegmentId].row).toBeGreaterThanOrEqual(parentPosition.row);
      }
    }
  });

  it("deletes a selected subtree and compacts the remaining rows", () => {
    const idFactory = createSequentialIdFactory("x");
    let tree = createTreeFromNotation("1. e4 e5 2. Nf3 Nc6 3. Bc4", {
      idFactory,
      now: () => "now",
    });
    const e4NodeId = Object.values(tree.nodes).find((node) => node.san === "e4")?.id as string;
    let result = addSanMove(tree, e4NodeId, "c5", { idFactory, now: () => "now" });
    tree = result.tree;
    const c5NodeId = result.nodeId;
    result = addSanMove(tree, c5NodeId, "Nf3", { idFactory, now: () => "now" });
    tree = result.tree;

    const before = buildCompressedTreeLayout(tree);
    const beforeRows = new Set(Object.values(before.positions).map((position) => position.row));

    expect(beforeRows.size).toBeGreaterThan(1);

    const deleted = deleteSubtree(tree, c5NodeId, () => "deleted");
    const after = buildCompressedTreeLayout(deleted);
    const afterRows = new Set(Object.values(after.positions).map((position) => position.row));

    expect(Object.values(deleted.nodes).map((node) => node.san)).not.toContain("c5");
    expect(Object.values(deleted.nodes).map((node) => node.san)).toContain("e5");
    expect(deleted.selectedNodeId).toBe(e4NodeId);
    expect(Math.max(...afterRows)).toBeLessThan(Math.max(...beforeRows));
  });
});
