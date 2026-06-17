"use client";

import { useEffect, useState } from "react";
import { createInitialTree } from "@/lib/chess-tree/chessTree";
import type { GameTree } from "@/lib/chess-tree/types";

const STORAGE_KEY = "chess-tree:v1";

export function usePersistentGameTree() {
  const [tree, setTree] = useState<GameTree>(() => createInitialTree());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);

      if (stored) {
        const parsed = JSON.parse(stored) as GameTree;

        if (parsed.rootId && parsed.selectedNodeId && parsed.nodes) {
          setTree(parsed);
        }
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!loaded) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tree));
  }, [loaded, tree]);

  function resetTree(nextTree = createInitialTree()) {
    setTree(nextTree);
  }

  return {
    tree,
    setTree,
    resetTree,
    loaded,
  };
}
