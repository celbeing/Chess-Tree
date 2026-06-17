"use client";

import type { CSSProperties } from "react";
import type { BoardArrow, BoardMark } from "@/lib/chess-tree/types";

type ChessBoardProps = {
  fen: string;
  lastMoveUci?: string;
  marks: BoardMark[];
  arrows: BoardArrow[];
  size: number;
  selectedSquare?: string;
  onSquareClick?: (square: string) => void;
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
  selectedSquare,
  onSquareClick,
}: ChessBoardProps) {
  const pieces = parseFenPieces(fen);
  const lastMoveSquares = lastMoveUci ? [lastMoveUci.slice(0, 2), lastMoveUci.slice(2, 4)] : [];
  const markBySquare = new Map(marks.map((mark) => [mark.square, mark]));
  const boardSize = Math.max(260, Math.min(size, 560));

  return (
    <div className="board-shell" style={{ "--board-size": `${boardSize}px` } as CSSProperties}>
      <div className="chess-board">
        {RANKS.map((rank) =>
          FILES.map((file) => {
            const square = `${file}${rank}`;
            const isLight = (FILES.indexOf(file) + rank) % 2 === 1;
            const mark = markBySquare.get(square);
            const isLastMove = lastMoveSquares.includes(square);
            const isSelected = selectedSquare === square;

            return (
              <button
                className={[
                  "board-square",
                  isLight ? "light" : "dark",
                  isLastMove ? "last-move" : "",
                  isSelected ? "selected-square" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={square}
                onClick={() => onSquareClick?.(square)}
                style={{ "--mark-color": mark?.color ?? "transparent" } as CSSProperties}
                type="button"
              >
                <span className="piece">{pieces[square] ? PIECES[pieces[square]] : ""}</span>
                <span className="square-label">{square}</span>
              </button>
            );
          }),
        )}
        <svg className="board-arrows" viewBox="0 0 100 100" aria-hidden="true">
          <defs>
            <marker id="arrowhead" markerHeight="5" markerWidth="5" orient="auto" refX="4" refY="2.5">
              <path d="M0,0 L5,2.5 L0,5 Z" fill="#ef476f" />
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
      </div>
    </div>
  );
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
