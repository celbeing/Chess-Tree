"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  Copy,
  Download,
  Eye,
  EyeOff,
  FilePlus,
  LogIn,
  LogOut,
  Pencil,
  RotateCcw,
  Save,
  Scissors,
  Upload,
  Zap,
} from "lucide-react";
import { ChessBoard, type BoardMove } from "@/components/ChessBoard";
import { TreeCanvas } from "@/components/TreeCanvas";
import { useServerGameTree, type SaveStatus } from "@/hooks/useServerGameTree";
import {
  addArrow,
  addSanMove,
  addSquareMark,
  createInitialTree,
  createTreeFromNotation,
  deleteSubtree,
  formatEngineScore,
  formatMoveLabel,
  getCompressedSegmentForNode,
  getNextMoveNavigation,
  getPreviousMoveNodeId,
  getSegmentCaptionNodeId,
  getSegmentEndNodeId,
  getSelectedNode,
  getTopMoveNodeId,
  selectNode,
  setNodeEval,
  splitNodeBefore,
  type MoveNavigationChoice,
  type MoveNavigationTarget,
  updateCaption,
  updateTitle,
} from "@/lib/chess-tree/chessTree";
import { StockfishBrowserEngine } from "@/lib/engine/stockfish";

const SAMPLE_LINE = "1. e4 e5 2. Nf3 Nc6 3. Bc4";

export function ChessTreeApp() {
  const {
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
    saveCurrentAnalysis,
    signIn,
    signOut,
  } = useServerGameTree();
  const selectedNode = getSelectedNode(tree);
  const [notationInput, setNotationInput] = useState(SAMPLE_LINE);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [error, setError] = useState("");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(tree.title);
  const [boardVisible, setBoardVisible] = useState(true);
  const [boardSize, setBoardSize] = useState(380);
  const [selectedSquare, setSelectedSquare] = useState("");
  const [fenCopyState, setFenCopyState] = useState<"idle" | "copied">("idle");
  const [nextMoveDialog, setNextMoveDialog] = useState<{
    choices: MoveNavigationChoice[];
    selectedNodeId: string;
  } | null>(null);
  const [engineDepth, setEngineDepth] = useState(12);
  const [engineState, setEngineState] = useState<"idle" | "running" | "error">("idle");
  const engineRef = useRef<StockfishBrowserEngine | null>(null);

  useEffect(() => {
    return () => {
      engineRef.current?.dispose();
    };
  }, []);

  useEffect(() => {
    if (!isEditingTitle) {
      setTitleDraft(tree.title);
    }
  }, [isEditingTitle, tree.title]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isEditingText = isTextEditingTarget(event.target);

      if (nextMoveDialog && event.key === "Escape") {
        setNextMoveDialog(null);

        return;
      }

      if (importDialogOpen || nextMoveDialog) {
        return;
      }

      if (event.key !== "Delete" || isEditingText || selectedNode.id === tree.rootId) {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
          return;
        }

        if (isEditingText || importDialogOpen || nextMoveDialog || event.altKey || event.metaKey) {
          return;
        }

        event.preventDefault();

        if (event.key === "ArrowLeft") {
          const previousNodeId = event.ctrlKey ? getTopMoveNodeId(tree) : getPreviousMoveNodeId(tree, selectedNode.id);

          if (previousNodeId) {
            setTree((current) => selectNode(current, previousNodeId));
          }

          return;
        }

        if (event.ctrlKey) {
          const segmentEndNodeId = getSegmentEndNodeId(tree, selectedNode.id);

          if (segmentEndNodeId !== selectedNode.id) {
            setTree((current) => selectNode(current, segmentEndNodeId));

            return;
          }
        }

        handleMoveNavigationTarget(getNextMoveNavigation(tree, selectedNode.id));

        return;
      }

      event.preventDefault();

      const confirmed = window.confirm(`${formatMoveLabel(selectedNode)} 및 이후 모든 수를 삭제할까요?`);

      if (!confirmed) {
        return;
      }

      setTree((current) => deleteSubtree(current, selectedNode.id));
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleMoveNavigationTarget, importDialogOpen, nextMoveDialog, selectedNode, setTree, tree]);

  function handleImport() {
    try {
      setError("");
      resetTree(createTreeFromNotation(notationInput));
      setImportDialogOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "기보를 불러올 수 없습니다.");
    }
  }

  function handleTitleCommit() {
    const nextTitle = titleDraft.trim() || "제목 없는 분석";

    setTree((current) => updateTitle(current, nextTitle));
    setTitleDraft(nextTitle);
    setIsEditingTitle(false);
  }

  async function handleCopyFen() {
    try {
      setError("");
      await navigator.clipboard.writeText(selectedNode.fen);
      setFenCopyState("copied");
      window.setTimeout(() => setFenCopyState("idle"), 1400);
    } catch (caught) {
      setFenCopyState("idle");
      setError(caught instanceof Error ? caught.message : "FEN을 복사할 수 없습니다.");
    }
  }

  async function handleEvaluate() {
    const nodeId = selectedNode.id;

    try {
      setError("");
      setEngineState("running");

      if (!engineRef.current) {
        engineRef.current = new StockfishBrowserEngine();
      }

      const evaluation = await engineRef.current.evaluateFen(selectedNode.fen, {
        depth: engineDepth,
      });
      setTree((current) => setNodeEval(current, nodeId, evaluation));
      setEngineState("idle");
    } catch (caught) {
      setEngineState("error");
      setError(caught instanceof Error ? caught.message : "Stockfish 평가에 실패했습니다.");
    }
  }

  function handleSquareClick(square: string) {
    setSelectedSquare(square);
    setTree((current) => addSquareMark(current, selectedNode.id, square));
  }

  function handleBoardMove(move: BoardMove) {
    try {
      setError("");
      const result = addSanMove(tree, selectedNode.id, move.san);
      setTree(result.tree);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "보드 수를 추가할 수 없습니다.");
    }
  }

  function handleBoardArrow(from: string, to: string) {
    setTree((current) => addArrow(current, selectedNode.id, from, to));
  }

  function handleSplitBeforeSelectedNode() {
    setError("");
    setTree((current) => splitNodeBefore(current, current.selectedNodeId));
  }

  function handleMoveNavigationTarget(target: MoveNavigationTarget) {
    if (target.kind === "none") {
      return;
    }

    if (target.kind === "node") {
      setNextMoveDialog(null);
      setTree((current) => selectNode(current, target.nodeId));

      return;
    }

    if (target.choices.length === 1) {
      setNextMoveDialog(null);
      setTree((current) => selectNode(current, target.choices[0].nodeId));

      return;
    }

    if (target.choices.length > 1) {
      setNextMoveDialog({
        choices: target.choices,
        selectedNodeId: target.choices[0].nodeId,
      });
    }
  }

  function handleChooseNextMove() {
    if (!nextMoveDialog) {
      return;
    }

    setTree((current) => selectNode(current, nextMoveDialog.selectedNodeId));
    setNextMoveDialog(null);
  }

  const engineLabel = engineState === "running" ? "평가 중" : selectedNode.eval ? formatEngineScore(selectedNode.eval) : "평가";
  const analysisPanelWidth = Math.max(360, boardSize + 54);
  const selectedSegment = getCompressedSegmentForNode(tree, selectedNode.id);
  const segmentCaptionNodeId = getSegmentCaptionNodeId(tree, selectedNode.id);
  const segmentCaptionNode = tree.nodes[segmentCaptionNodeId] ?? selectedNode;
  const canSplitSelectedNode = selectedNode.id !== tree.rootId && selectedSegment?.nodeIds[0] !== selectedNode.id;
  const statusLabel = formatSaveStatus({
    configError,
    currentAnalysisId,
    dirty,
    loaded,
    saveStatus,
    signedIn: Boolean(user),
  });
  const visibleError = error || serverError;

  return (
    <main className="app-shell">
      <section
        className="workspace"
        style={{ "--analysis-panel-width": `${analysisPanelWidth}px` } as CSSProperties}
      >
        <section className="tree-panel">
          <header className="tree-header">
            <div className="tree-title-block">
              <div className="title-row">
                {isEditingTitle ? (
                  <input
                    aria-label="제목"
                    autoFocus
                    className="title-input"
                    onBlur={handleTitleCommit}
                    onChange={(event) => setTitleDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        handleTitleCommit();
                      }
                    }}
                    value={titleDraft}
                  />
                ) : (
                  <h1>{tree.title}</h1>
                )}
                <button
                  className="icon-button title-edit-button"
                  onClick={() => {
                    setTitleDraft(tree.title);
                    setIsEditingTitle(true);
                  }}
                  title="제목 수정"
                  type="button"
                >
                  <Pencil size={16} />
                </button>
              </div>
              <p>
                {Object.keys(tree.nodes).length}개 노드 | {statusLabel}
              </p>
            </div>
            <div className="header-actions">
              {user ? (
                <div className="server-controls">
                  <span className="account-label">{user.displayName || user.email || "로그인됨"}</span>
                  <select
                    className="select-input analysis-select"
                    disabled={analyses.length === 0 || saveStatus === "loading" || saveStatus === "saving"}
                    onChange={(event) => setAnalysisToLoadId(event.target.value)}
                    value={analysisToLoadId}
                  >
                    {analyses.length > 0 ? (
                      analyses.map((analysis) => (
                        <option key={analysis.id} value={analysis.id}>
                          {analysis.title}
                        </option>
                      ))
                    ) : (
                      <option value="">저장된 분석 없음</option>
                    )}
                  </select>
                  <button
                    className="secondary-button"
                    disabled={!analysisToLoadId || saveStatus === "loading" || saveStatus === "saving"}
                    onClick={loadSelectedAnalysis}
                    type="button"
                  >
                    <Download size={16} />
                    불러오기
                  </button>
                  <button
                    className="secondary-button"
                    disabled={saveStatus === "loading" || saveStatus === "saving"}
                    onClick={createNewAnalysis}
                    type="button"
                  >
                    <FilePlus size={16} />
                    새 분석
                  </button>
                  <button
                    className="primary-button"
                    disabled={saveStatus === "loading" || saveStatus === "saving"}
                    onClick={saveCurrentAnalysis}
                    type="button"
                  >
                    <Save size={16} />
                    저장
                  </button>
                  <button className="icon-button" onClick={signOut} title="로그아웃" type="button">
                    <LogOut size={17} />
                  </button>
                </div>
              ) : (
                <button
                  className="primary-button"
                  disabled={!loaded || Boolean(configError)}
                  onClick={signIn}
                  type="button"
                >
                  <LogIn size={16} />
                  로그인
                </button>
              )}
              <button className="secondary-button import-button" onClick={() => setImportDialogOpen(true)} type="button">
                <Upload size={16} />
                PGN 불러오기
              </button>
            </div>
          </header>
          <TreeCanvas tree={tree} onSelectNode={(nodeId) => setTree((current) => selectNode(current, nodeId))} />
        </section>

        <aside className="analysis-panel">
          <div className="board-toolbar">
            <button className="secondary-button" onClick={() => setBoardVisible((current) => !current)} type="button">
              {boardVisible ? <EyeOff size={16} /> : <Eye size={16} />}
              {boardVisible ? "숨기기" : "보이기"}
            </button>
            <label className="range-field" htmlFor="board-size">
              크기
              <input
                id="board-size"
                max={560}
                min={260}
                onChange={(event) => setBoardSize(Number(event.target.value))}
                type="range"
                value={boardSize}
              />
            </label>
          </div>

          {boardVisible ? (
            <ChessBoard
              arrows={selectedNode.arrows}
              fen={selectedNode.fen}
              lastMoveUci={selectedNode.uci}
              marks={selectedNode.marks}
              onArrow={handleBoardArrow}
              onMove={handleBoardMove}
              onSquareMark={handleSquareClick}
              selectedSquare={selectedSquare}
              size={boardSize}
            />
          ) : null}

          <div className="node-summary node-summary-header">
            <div>
              <h2>{formatMoveLabel(selectedNode)}</h2>
              {selectedNode.ecoCode && selectedNode.openingName ? (
                <p>
                  {selectedNode.ecoCode} {selectedNode.openingName}
                </p>
              ) : null}
            </div>
            <button className="secondary-button fen-copy-button" onClick={handleCopyFen} type="button">
              <Copy size={16} />
              {fenCopyState === "copied" ? "복사됨" : "FEN 복사"}
            </button>
          </div>

          <div className="node-action-row">
            <button
              className="secondary-button"
              disabled={!canSplitSelectedNode}
              onClick={handleSplitBeforeSelectedNode}
              title="선택한 수부터 별도 노드로 분리"
              type="button"
            >
              <Scissors size={16} />
              노드 분리
            </button>
          </div>

          <div className="panel-block">
            <label className="field-label" htmlFor="caption">
              노드 캡션
            </label>
            <textarea
              className="textarea"
              id="caption"
              onChange={(event) => {
                const caption = event.target.value;

                setTree((current) => {
                  const captionNodeId = getSegmentCaptionNodeId(current, current.selectedNodeId);

                  return updateCaption(current, captionNodeId, caption);
                });
              }}
              rows={4}
              value={segmentCaptionNode.caption}
            />
          </div>

          <div className="engine-panel">
            <label className="range-field" htmlFor="engine-depth">
              깊이
              <input
                id="engine-depth"
                max={18}
                min={6}
                onChange={(event) => setEngineDepth(Number(event.target.value))}
                type="range"
                value={engineDepth}
              />
              <span>{engineDepth}</span>
            </label>
            <button
              className="primary-button"
              disabled
              onClick={handleEvaluate}
              type="button"
            >
              <Zap size={16} />
              {engineLabel}
            </button>
          </div>

          <div className="analysis-panel-footer">
            <button className="secondary-button" onClick={() => resetTree(createInitialTree())} type="button">
              <RotateCcw size={16} />
              초기화
            </button>
          </div>

          {visibleError ? <p className="error-text">{visibleError}</p> : null}
        </aside>
      </section>

      {importDialogOpen ? (
        <div className="modal-backdrop">
          <section aria-labelledby="import-pgn-title" aria-modal="true" className="modal-panel" role="dialog">
            <header className="modal-header">
              <h2 id="import-pgn-title">PGN 불러오기</h2>
            </header>
            <textarea
              autoFocus
              className="textarea import-textarea"
              id="notation"
              onChange={(event) => setNotationInput(event.target.value)}
              rows={10}
              value={notationInput}
            />
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setImportDialogOpen(false)} type="button">
                취소
              </button>
              <button className="primary-button" onClick={handleImport} type="button">
                <Upload size={16} />
                불러오기
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {nextMoveDialog ? (
        <div className="modal-backdrop">
          <section
            aria-labelledby="next-move-title"
            aria-modal="true"
            className="modal-panel move-choice-panel"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setNextMoveDialog(null);
              }

              if (event.key === "Enter") {
                event.preventDefault();
                handleChooseNextMove();
              }
            }}
            role="dialog"
          >
            <header className="modal-header">
              <h2 id="next-move-title">다음 수 선택</h2>
            </header>
            <label className="field-label" htmlFor="next-move-choice">
              다음 수
            </label>
            <select
              autoFocus
              className="select-input"
              id="next-move-choice"
              onChange={(event) => setNextMoveDialog({
                choices: nextMoveDialog.choices,
                selectedNodeId: event.target.value,
              })}
              value={nextMoveDialog.selectedNodeId}
            >
              {nextMoveDialog.choices.map((choice) => (
                <option key={choice.nodeId} value={choice.nodeId}>
                  {choice.label}
                </option>
              ))}
            </select>
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setNextMoveDialog(null)} type="button">
                취소
              </button>
              <button className="primary-button" onClick={handleChooseNextMove} type="button">
                이동
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function isTextEditingTarget(target: EventTarget | null) {
  const element = target instanceof HTMLElement ? target : null;
  const tagName = element?.tagName;

  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT" || Boolean(element?.isContentEditable);
}

function formatSaveStatus({
  configError,
  currentAnalysisId,
  dirty,
  loaded,
  saveStatus,
  signedIn,
}: {
  configError: string;
  currentAnalysisId: string | null;
  dirty: boolean;
  loaded: boolean;
  saveStatus: SaveStatus;
  signedIn: boolean;
}) {
  if (!loaded) {
    return "불러오는 중";
  }

  if (configError) {
    return "Firebase 설정 누락";
  }

  if (!signedIn) {
    return "로그아웃됨";
  }

  if (saveStatus === "saving") {
    return "저장 중";
  }

  if (saveStatus === "loading") {
    return "분석 불러오는 중";
  }

  if (saveStatus === "error") {
    return "저장 실패";
  }

  if (dirty || !currentAnalysisId) {
    return "저장되지 않음";
  }

  return "저장됨";
}
