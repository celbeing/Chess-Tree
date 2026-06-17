import { describe, expect, it } from "vitest";
import { parseInfoScore } from "./stockfish";

describe("parseInfoScore", () => {
  it("parses centipawn scores", () => {
    expect(parseInfoScore("info depth 12 score cp 34 nodes 200 pv e2e4 e7e5")).toEqual({
      kind: "cp",
      value: 34,
      depth: 12,
      bestMove: "e2e4",
    });
  });

  it("parses mate scores", () => {
    expect(parseInfoScore("info depth 9 score mate -2 pv h7h8q")).toEqual({
      kind: "mate",
      value: -2,
      depth: 9,
      bestMove: "h7h8q",
    });
  });
});
