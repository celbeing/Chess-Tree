"use client";

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Chess, type Move, type Square } from "chess.js";
import type { BoardArrow, BoardMark } from "@/lib/chess-tree/types";

export type BoardMove = {
  from: string;
  to: string;
  promotion?: string;
  san: string;
};

type ChessBoardProps = {
  fen: string;
  lastMoveUci?: string;
  marks: BoardMark[];
  arrows: BoardArrow[];
  size: number;
  variant?: "main" | "mini";
  selectedSquare?: string;
  onSquareMark?: (square: string) => void;
  onArrow?: (from: string, to: string) => void;
  onMove?: (move: BoardMove) => void;
};

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1];
const PIECES: Record<string, string> = {
  P: "♙",
  N: "♘",
  B: "♗",
  R: "♖",
  Q: "♕",
  K: "♔",
  p: "♟",
  n: "♞",
  b: "♝",
  r: "♜",
  q: "♛",
  k: "♚",
};

export function ChessBoard({
  fen,
  lastMoveUci,
  marks,
  arrows,
  size,
  variant = "main",
  selectedSquare,
  onSquareMark,
  onArrow,
  onMove,
}: ChessBoardProps) {
  const chess = useMemo(() => new Chess(fen), [fen]);
  const pieces = parseFenPieces(fen);
  const lastMoveSquares = lastMoveUci ? [lastMoveUci.slice(0, 2), lastMoveUci.slice(2, 4)] : [];
  const markBySquare = new Map(marks.map((mark) => [mark.square, mark]));
  const boardSize = variant === "mini" ? Math.max(120, Math.min(size, 220)) : Math.max(260, Math.min(size, 560));
  const interactive = variant !== "mini" && Boolean(onSquareMark || onArrow || onMove);
  const [selectedFrom, setSelectedFrom] = useState("");
  const [legalMoves, setLegalMoves] = useState<Move[]>([]);
  const [dragState, setDragState] = useState<
    | {
        kind: "piece";
        from: string;
        piece: string;
        moves: Move[];
        x: number;
        y: number;
      }
    | {
        kind: "arrow";
        from: string;
        button: "right";
      }
    | null
  >(null);
  const legalTargets = new Set<string>(legalMoves.map((move) => move.to));

  return (
    <div
      className={variant === "mini" ? "board-shell mini-board-shell" : "board-shell"}
      style={{ "--board-size": `${boardSize}px` } as CSSProperties}
    >
      <div className="board-with-coordinates">
        <div className="chess-board">
          {RANKS.map((rank) =>
            FILES.map((file) => {
              const square = `${file}${rank}`;
              const isLight = (FILES.indexOf(file) + rank) % 2 === 1;
              const mark = markBySquare.get(square);
              const isLastMove = lastMoveSquares.includes(square);
              const isSelected = selectedSquare === square;
              const isSelectedFrom = selectedFrom === square;
              const isLegalTarget = legalTargets.has(square);
              const piece = pieces[square];

              return (
                <button
                  data-square={square}
                  className={[
                    "board-square",
                    isLight ? "light" : "dark",
                    isLastMove ? "last-move" : "",
                    isSelected ? "selected-square" : "",
                    isSelectedFrom ? "selected-from" : "",
                    isLegalTarget ? "legal-target" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  disabled={!interactive}
                  key={square}
                  onContextMenu={(event) => {
                    event.preventDefault();
                  }}
                  onPointerDown={(event) => {
                    if (!interactive || (event.button !== 0 && event.button !== 2)) {
                      return;
                    }

                    event.preventDefault();
                    event.currentTarget.setPointerCapture(event.pointerId);

                    if (event.button === 2) {
                      clearMoveSelection(setSelectedFrom, setLegalMoves);
                      setDragState({
                        kind: "arrow",
                        from: square,
                        button: "right",
                      });
                      return;
                    }

                    handlePointerStart({
                      chess,
                      event,
                      legalMoves,
                      onMove,
                      onSelectFrom: (from, moves) => {
                        setSelectedFrom(from);
                        setLegalMoves(moves);
                      },
                      onClear: () => clearMoveSelection(setSelectedFrom, setLegalMoves),
                      onPieceDrag: setDragState,
                      piece,
                      square,
                    });
                  }}
                  onPointerMove={(event) => {
                    if (dragState?.kind !== "piece") {
                      return;
                    }

                    setDragState({
                      ...dragState,
                      x: event.clientX,
                      y: event.clientY,
                    });
                  }}
                  onPointerUp={(event) => {
                    if (!interactive || !dragState) {
                      return;
                    }

                    const targetSquare = getSquareFromPoint(event.clientX, event.clientY);

                    if (dragState.kind === "arrow") {
                      if (targetSquare && targetSquare !== dragState.from) {
                        onArrow?.(dragState.from, targetSquare);
                      } else if (targetSquare === dragState.from) {
                        onSquareMark?.(dragState.from);
                      }
                      clearMoveSelection(setSelectedFrom, setLegalMoves);
                      setDragState(null);
                      return;
                    }

                    const move = findPreferredMove(dragState.moves, targetSquare);

                    if (move) {
                      onMove?.({
                        from: move.from,
                        to: move.to,
                        promotion: move.promotion,
                        san: move.san,
                      });
                      clearMoveSelection(setSelectedFrom, setLegalMoves);
                      setDragState(null);
                      return;
                    }

                    if (targetSquare === dragState.from) {
                      setDragState(null);
                      return;
                    }

                    clearMoveSelection(setSelectedFrom, setLegalMoves);
                    setDragState(null);
                  }}
                  onPointerCancel={() => {
                    clearMoveSelection(setSelectedFrom, setLegalMoves);
                    setDragState(null);
                  }}
                  style={{ "--mark-color": mark?.color ?? "transparent" } as CSSProperties}
                  type="button"
                >
                  <span className={dragState?.kind === "piece" && dragState.from === square ? "piece dragging-source" : "piece"}>
                    {piece ? PIECES[piece] : ""}
                  </span>
                </button>
              );
            }),
          )}
          <svg className="board-arrows" viewBox="0 0 100 100" aria-hidden="true">
            <defs>
              <marker id="arrowhead" markerHeight="3.125" markerWidth="3.125" orient="auto" refX="2.75" refY="1.5625">
                <path d="M0,0 L3.125,1.5625 L0,3.125 Z" fill="#ef476f" />
              </marker>
            </defs>
            {arrows.map((arrow) => {
              const from = squareCenter(arrow.from);
              const to = squareCenter(arrow.to);

              if (!from || !to) {
                return null;
              }

              return (
                <line
                  className="board-arrow"
                  key={arrow.id}
                  markerEnd="url(#arrowhead)"
                  stroke={arrow.color}
                  x1={from.x}
                  x2={to.x}
                  y1={from.y}
                  y2={to.y}
                />
              );
            })}
          </svg>
          {dragState?.kind === "piece" ? (
            <span
              className="dragging-piece"
              style={
                {
                  "--drag-x": `${dragState.x}px`,
                  "--drag-y": `${dragState.y}px`,
                  "--board-size": `${boardSize}px`,
                } as CSSProperties
              }
            >
              {PIECES[dragState.piece]}
            </span>
          ) : null}
        </div>
        <div className="file-coordinates" aria-hidden="true">
          {FILES.map((file) => (
            <span key={file}>{file}</span>
          ))}
        </div>
        <div className="rank-coordinates" aria-hidden="true">
          {RANKS.map((rank) => (
            <span key={rank}>{rank}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function handlePointerStart({
  chess,
  event,
  legalMoves,
  onMove,
  onSelectFrom,
  onClear,
  onPieceDrag,
  piece,
  square,
}: {
  chess: Chess;
  event: React.PointerEvent<HTMLButtonElement>;
  legalMoves: Move[];
  onMove?: (move: BoardMove) => void;
  onSelectFrom: (from: string, moves: Move[]) => void;
  onClear: () => void;
  onPieceDrag: (state: {
    kind: "piece";
    from: string;
    piece: string;
    moves: Move[];
    x: number;
    y: number;
  }) => void;
  piece?: string;
  square: string;
}) {
  const pendingMove = findPreferredMove(legalMoves, square);

  if (pendingMove) {
    onMove?.({
      from: pendingMove.from,
      to: pendingMove.to,
      promotion: pendingMove.promotion,
      san: pendingMove.san,
    });
    onClear();
    return;
  }

  const moves = getLegalMovesFromSquare(chess, square);

  if (piece && moves.length > 0) {
    onSelectFrom(square, moves);
    onPieceDrag({
      kind: "piece",
      from: square,
      piece,
      moves,
      x: event.clientX,
      y: event.clientY,
    });
    return;
  }

  onClear();
}

function getLegalMovesFromSquare(chess: Chess, square: string) {
  if (!isSquare(square)) {
    return [];
  }

  return chess.moves({
    square,
    verbose: true,
  });
}

function findPreferredMove(moves: Move[], targetSquare: string | null) {
  if (!targetSquare) {
    return undefined;
  }

  const targetMoves = moves.filter((move) => move.to === targetSquare);

  return targetMoves.find((move) => move.promotion === "q") ?? targetMoves.find((move) => !move.promotion) ?? targetMoves[0];
}

function clearMoveSelection(setSelectedFrom: (square: string) => void, setLegalMoves: (moves: Move[]) => void) {
  setSelectedFrom("");
  setLegalMoves([]);
}

function getSquareFromPoint(x: number, y: number) {
  const target = document.elementFromPoint(x, y);
  const squareElement = target instanceof HTMLElement ? target.closest<HTMLElement>("[data-square]") : null;

  return squareElement?.dataset.square ?? null;
}

function isSquare(square: string): square is Square {
  return /^[a-h][1-8]$/.test(square);
}

function parseFenPieces(fen: string) {
  const board = fen.split(" ")[0];
  const pieces: Record<string, string> = {};
  const ranks = board.split("/");

  ranks.forEach((rankText, rankIndex) => {
    let fileIndex = 0;
    const rank = 8 - rankIndex;

    for (const char of rankText) {
      const emptySquares = Number(char);

      if (Number.isInteger(emptySquares)) {
        fileIndex += emptySquares;
      } else {
        pieces[`${FILES[fileIndex]}${rank}`] = char;
        fileIndex += 1;
      }
    }
  });

  return pieces;
}

function squareCenter(square: string) {
  const file = square[0];
  const rank = Number(square[1]);
  const fileIndex = FILES.indexOf(file);

  if (fileIndex < 0 || !rank) {
    return null;
  }

  return {
    x: ((fileIndex + 0.5) / 8) * 100,
    y: (((8 - rank) + 0.5) / 8) * 100,
  };
}
