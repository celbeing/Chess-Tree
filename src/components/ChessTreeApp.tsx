"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, GitBranch, Plus, RotateCcw, Trash2, Upload, Zap } from "lucide-react";
import { ChessBoard } from "@/components/ChessBoard";
import { TreeCanvas } from "@/components/TreeCanvas";
import { usePersistentGameTree } from "@/hooks/usePersistentGameTree";
import {
  addArrow,
  addSanMove,
  addSquareMark,
  clearBoardAnnotations,
  createInitialTree,
  createTreeFromNotation,
  deleteSubtree,
  formatEngineScore,
  formatMoveLabel,
  getSelectedNode,
  selectNode,
  setNodeEval,
  updateCaption,
  updateTitle,
} from "@/lib/chess-tree/chessTree";
import { StockfishBrowserEngine } from "@/lib/engine/stockfish";

const SAMPLE_LINE = "1. e4 e5 2. Nf3 Nc6 3. Bc4";

export function ChessTreeApp() {
  const { tree, setTree, resetTree, loaded } = usePersistentGameTree();
  const selectedNode = getSelectedNode(tree);
  const [notationInput, setNotationInput] = useState(SAMPLE_LINE);
  const [sanInput, setSanInput] = useState("");
  const [error, setError] = useState("");
  const [boardVisible, setBoardVisible] = useState(true);
  const [boardSize, setBoardSize] = useState(380);
  const [selectedSquare, setSelectedSquare] = useState("");
  const [arrowFrom, setArrowFrom] = useState("");
  const [arrowTo, setArrowTo] = useState("");
  const [engineDepth, setEngineDepth] = useState(12);
  const [engineState, setEngineState] = useState<"idle" | "running" | "error">("idle");
  const engineRef = useRef<StockfishBrowserEngine | null>(null);

  useEffect(() => {
    return () => {
      engineRef.current?.dispose();
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target;
      const tagName = target instanceof HTMLElement ? target.tagName : "";
      const isEditingText =
        tagName === "INPUT" || tagName === "TEXTAREA" || (target instanceof HTMLElement && target.isContentEditable);

      if (event.key !== "Delete" || isEditingText || selectedNode.id === tree.rootId) {
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
  }, [selectedNode, setTree, tree.rootId]);

  function handleImport() {
    try {
      setError("");
      resetTree(createTreeFromNotation(notationInput));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not import notation.");
    }
  }

  function handleAddMove() {
    try {
      setError("");
      const result = addSanMove(tree, selectedNode.id, sanInput);
      setTree(result.tree);
      setSanInput("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add move.");
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

  function handleAddArrow() {
    if (!arrowFrom || !arrowTo) {
      return;
    }

    setTree((current) => addArrow(current, selectedNode.id, arrowFrom, arrowTo));
    setArrowFrom("");
    setArrowTo("");
  }

  const engineLabel = engineState === "running" ? "Evaluating" : selectedNode.eval ? formatEngineScore(selectedNode.eval) : "Evaluate";

  return (
    <main className="app-shell">
      <section className="workspace">
        <aside className="side-panel">
          <div className="panel-block">
            <label className="field-label" htmlFor="title">
              Title
            </label>
            <input
              className="text-input"
              id="title"
              onChange={(event) => setTree((current) => updateTitle(current, event.target.value))}
              value={tree.title}
            />
          </div>

          <div className="panel-block">
            <label className="field-label" htmlFor="notation">
              PGN / SAN
            </label>
            <textarea
              className="textarea"
              id="notation"
              onChange={(event) => setNotationInput(event.target.value)}
              rows={7}
              value={notationInput}
            />
            <button className="primary-button" onClick={handleImport} type="button">
              <Upload size={16} />
              Import
            </button>
          </div>

          <div className="panel-block">
            <label className="field-label" htmlFor="san">
              Branch from {formatMoveLabel(selectedNode)}
            </label>
            <div className="inline-row">
              <input
                className="text-input"
                id="san"
                onChange={(event) => setSanInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    handleAddMove();
                  }
                }}
                placeholder="Nf3"
                value={sanInput}
              />
              <button className="icon-button" onClick={handleAddMove} title="Add move" type="button">
                <Plus size={17} />
              </button>
            </div>
          </div>

          <div className="panel-block">
            <label className="field-label" htmlFor="caption">
              Caption
            </label>
            <textarea
              className="textarea"
              id="caption"
              onChange={(event) => setTree((current) => updateCaption(current, selectedNode.id, event.target.value))}
              rows={4}
              value={selectedNode.caption}
            />
          </div>

          <div className="button-row">
            <button className="secondary-button" onClick={() => resetTree(createInitialTree())} type="button">
              <RotateCcw size={16} />
              Reset
            </button>
            <span className="save-state">{loaded ? "Saved" : "Loading"}</span>
          </div>

          {error ? <p className="error-text">{error}</p> : null}
        </aside>

        <section className="tree-panel">
          <header className="tree-header">
            <div>
              <h1>{tree.title}</h1>
              <p>{Object.keys(tree.nodes).length} nodes</p>
            </div>
            <GitBranch size={20} />
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
              onSquareClick={handleSquareClick}
              selectedSquare={selectedSquare}
              size={boardSize}
            />
          ) : null}

          <div className="node-summary">
            <h2>{formatMoveLabel(selectedNode)}</h2>
            {selectedNode.ecoCode && selectedNode.openingName ? (
              <p>
                {selectedNode.ecoCode} {selectedNode.openingName}
              </p>
            ) : null}
            <code>{selectedNode.fen}</code>
          </div>

          <div className="panel-block compact">
            <div className="inline-row">
              <input
                className="text-input"
                maxLength={2}
                onChange={(event) => setArrowFrom(event.target.value)}
                placeholder="e2"
                value={arrowFrom}
              />
              <input
                className="text-input"
                maxLength={2}
                onChange={(event) => setArrowTo(event.target.value)}
                placeholder="e4"
                value={arrowTo}
              />
              <button className="icon-button" onClick={handleAddArrow} title="Add arrow" type="button">
                <Plus size={17} />
              </button>
              <button
                className="icon-button danger"
                onClick={() => setTree((current) => clearBoardAnnotations(current, selectedNode.id))}
                title="Clear annotations"
                type="button"
              >
                <Trash2 size={17} />
              </button>
            </div>
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
              disabled={engineState === "running"}
              onClick={handleEvaluate}
              type="button"
            >
              <Zap size={16} />
              {engineLabel}
            </button>
          </div>
        </aside>
      </section>
    </main>
  );
}
