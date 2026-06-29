"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Copy, Eye, EyeOff, Pencil, RotateCcw, Scissors, Upload, Zap } from "lucide-react";
import { ChessBoard, type BoardMove } from "@/components/ChessBoard";
import { TreeCanvas } from "@/components/TreeCanvas";
import { usePersistentGameTree } from "@/hooks/usePersistentGameTree";
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
  const { tree, setTree, resetTree, loaded } = usePersistentGameTree();
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

      const confirmed = window.confirm(`Delete ${formatMoveLabel(selectedNode)} and all following moves?`);

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
      setError(caught instanceof Error ? caught.message : "Could not import notation.");
    }
  }

  function handleTitleCommit() {
    const nextTitle = titleDraft.trim() || "Untitled analysis";

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
      setError(caught instanceof Error ? caught.message : "Could not copy FEN.");
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
      setError(caught instanceof Error ? caught.message : "Stockfish evaluation failed.");
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
      setError(caught instanceof Error ? caught.message : "Could not add board move.");
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

  const engineLabel = engineState === "running" ? "Evaluating" : selectedNode.eval ? formatEngineScore(selectedNode.eval) : "Evaluate";
  const analysisPanelWidth = Math.max(360, boardSize + 54);
  const selectedSegment = getCompressedSegmentForNode(tree, selectedNode.id);
  const segmentCaptionNodeId = getSegmentCaptionNodeId(tree, selectedNode.id);
  const segmentCaptionNode = tree.nodes[segmentCaptionNodeId] ?? selectedNode;
  const canSplitSelectedNode = selectedNode.id !== tree.rootId && selectedSegment?.nodeIds[0] !== selectedNode.id;

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
                    aria-label="Title"
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
                  title="Edit title"
                  type="button"
                >
                  <Pencil size={16} />
                </button>
              </div>
              <p>
                {Object.keys(tree.nodes).length} nodes | {loaded ? "Saved" : "Loading"}
              </p>
            </div>
            <button className="secondary-button import-button" onClick={() => setImportDialogOpen(true)} type="button">
              <Upload size={16} />
              Import PGN
            </button>
          </header>
          <TreeCanvas tree={tree} onSelectNode={(nodeId) => setTree((current) => selectNode(current, nodeId))} />
        </section>

        <aside className="analysis-panel">
          <div className="board-toolbar">
            <button className="secondary-button" onClick={() => setBoardVisible((current) => !current)} type="button">
              {boardVisible ? <EyeOff size={16} /> : <Eye size={16} />}
              {boardVisible ? "Hide" : "Show"}
            </button>
            <label className="range-field" htmlFor="board-size">
              Size
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
              {fenCopyState === "copied" ? "Copied" : "Paste FEN"}
            </button>
          </div>

          <div className="node-action-row">
            <button
              className="secondary-button"
              disabled={!canSplitSelectedNode}
              onClick={handleSplitBeforeSelectedNode}
              title="Start a separate tree node at the selected move"
              type="button"
            >
              <Scissors size={16} />
              Split node
            </button>
          </div>

          <div className="panel-block">
            <label className="field-label" htmlFor="caption">
              Node caption
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
              Depth
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
              Reset
            </button>
          </div>

          {error ? <p className="error-text">{error}</p> : null}
        </aside>
      </section>

      {importDialogOpen ? (
        <div className="modal-backdrop">
          <section aria-labelledby="import-pgn-title" aria-modal="true" className="modal-panel" role="dialog">
            <header className="modal-header">
              <h2 id="import-pgn-title">Import PGN</h2>
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
                Cancel
              </button>
              <button className="primary-button" onClick={handleImport} type="button">
                <Upload size={16} />
                Import
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
              <h2 id="next-move-title">Choose next move</h2>
            </header>
            <label className="field-label" htmlFor="next-move-choice">
              Next move
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
                Cancel
              </button>
              <button className="primary-button" onClick={handleChooseNextMove} type="button">
                Move
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
