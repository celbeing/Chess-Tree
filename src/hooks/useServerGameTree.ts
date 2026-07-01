"use client";

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { onAuthStateChanged, signInWithPopup, signOut as signOutOfFirebase, type User } from "firebase/auth";
import { createInitialTree } from "@/lib/chess-tree/chessTree";
import type { GameTree } from "@/lib/chess-tree/types";
import { loadAnalysis, listAnalyses, saveAnalysis } from "@/lib/firebase/analyses";
import { getFirebaseConfigError, getFirebaseServices } from "@/lib/firebase/client";
import type { AnalysisSummary } from "@/lib/firebase/analysisRecords";

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "loading" | "error";

export function useServerGameTree() {
  const [tree, setTreeState] = useState<GameTree>(() => createInitialTree());
  const [user, setUser] = useState<User | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [analyses, setAnalyses] = useState<AnalysisSummary[]>([]);
  const [analysisToLoadId, setAnalysisToLoadId] = useState("");
  const [currentAnalysisId, setCurrentAnalysisId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [serverError, setServerError] = useState("");
  const configError = getFirebaseConfigError();

  useEffect(() => {
    if (configError) {
      setLoaded(true);
      setServerError(configError);

      return;
    }

    const { auth } = getFirebaseServices();

    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoaded(true);

      if (!nextUser) {
        setAnalyses([]);
        setAnalysisToLoadId("");
        setCurrentAnalysisId(null);
        setTreeState(createInitialTree());
        setDirty(false);
        setSaveStatus("idle");
      }
    });
  }, [configError]);

  const refreshAnalyses = useCallback(async (uid: string) => {
    const { db } = getFirebaseServices();
    const nextAnalyses = await listAnalyses(db, uid);

    setAnalyses(nextAnalyses);
    setAnalysisToLoadId((current) => {
      if (current && nextAnalyses.some((analysis) => analysis.id === current)) {
        return current;
      }

      return nextAnalyses[0]?.id ?? "";
    });
  }, []);

  useEffect(() => {
    if (!user || configError) {
      return;
    }

    void refreshAnalyses(user.uid).catch((caught: unknown) => {
      setServerError(toErrorMessage(caught, "저장된 분석을 불러올 수 없습니다."));
      setSaveStatus("error");
    });
  }, [configError, refreshAnalyses, user]);

  const setTree: Dispatch<SetStateAction<GameTree>> = useCallback((nextTree) => {
    setTreeState((current) => {
      const resolved = typeof nextTree === "function" ? nextTree(current) : nextTree;

      if (!isSelectionOnlyChange(current, resolved)) {
        setDirty(true);
        setSaveStatus("dirty");
      }

      return resolved;
    });
  }, []);

  const resetTree = useCallback((nextTree = createInitialTree()) => {
    setTreeState(nextTree);
    setDirty(true);
    setSaveStatus("dirty");
  }, []);

  const createNewAnalysis = useCallback(() => {
    setTreeState(createInitialTree());
    setCurrentAnalysisId(null);
    setDirty(false);
    setSaveStatus("idle");
    setServerError("");
  }, []);

  const signIn = useCallback(async () => {
    try {
      setServerError("");
      const { auth, googleProvider } = getFirebaseServices();

      await signInWithPopup(auth, googleProvider);
    } catch (caught) {
      setServerError(toErrorMessage(caught, "로그인할 수 없습니다."));
      setSaveStatus("error");
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      setServerError("");
      const { auth } = getFirebaseServices();

      await signOutOfFirebase(auth);
    } catch (caught) {
      setServerError(toErrorMessage(caught, "로그아웃할 수 없습니다."));
      setSaveStatus("error");
    }
  }, []);

  const loadSelectedAnalysis = useCallback(async () => {
    if (!user || !analysisToLoadId) {
      return;
    }

    try {
      setServerError("");
      setSaveStatus("loading");

      const { db } = getFirebaseServices();
      const loadedTree = await loadAnalysis(db, user.uid, analysisToLoadId);

      setTreeState(loadedTree);
      setCurrentAnalysisId(analysisToLoadId);
      setDirty(false);
      setSaveStatus("saved");
    } catch (caught) {
      setServerError(toErrorMessage(caught, "분석을 불러올 수 없습니다."));
      setSaveStatus("error");
    }
  }, [analysisToLoadId, user]);

  const saveCurrentAnalysis = useCallback(async () => {
    if (!user) {
      setServerError("분석을 저장하려면 먼저 로그인하세요.");
      setSaveStatus("error");

      return;
    }

    try {
      setServerError("");
      setSaveStatus("saving");

      const { db } = getFirebaseServices();
      const savedAnalysisId = await saveAnalysis(db, user.uid, tree, currentAnalysisId);

      setCurrentAnalysisId(savedAnalysisId);
      setAnalysisToLoadId(savedAnalysisId);
      setDirty(false);
      setSaveStatus("saved");
      await refreshAnalyses(user.uid);
    } catch (caught) {
      setServerError(toErrorMessage(caught, "분석을 저장할 수 없습니다."));
      setSaveStatus("error");
    }
  }, [currentAnalysisId, refreshAnalyses, tree, user]);

  return {
    tree,
    setTree,
    resetTree,
    loaded,
    user,
    analyses,
    analysisToLoadId,
    setAnalysisToLoadId,
    currentAnalysisId,
    dirty,
    saveStatus,
    serverError,
    configError,
    createNewAnalysis,
    loadSelectedAnalysis,
    refreshAnalyses,
    saveCurrentAnalysis,
    signIn,
    signOut,
  };
}

function isSelectionOnlyChange(previous: GameTree, next: GameTree) {
  return (
    previous.selectedNodeId !== next.selectedNodeId &&
    previous.rootId === next.rootId &&
    previous.title === next.title &&
    previous.updatedAt === next.updatedAt &&
    previous.nodes === next.nodes
  );
}

function toErrorMessage(caught: unknown, fallback: string) {
  return caught instanceof Error ? caught.message : fallback;
}
