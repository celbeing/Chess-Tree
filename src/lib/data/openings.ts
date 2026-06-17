import type { OpeningEntry } from "@/lib/chess-tree/types";

export const OPENING_BOOK: OpeningEntry[] = [
  {
    eco: "C20",
    name: "King's Pawn Game",
    moves: ["e4"],
  },
  {
    eco: "D00",
    name: "Queen's Pawn Game",
    moves: ["d4"],
  },
  {
    eco: "C60",
    name: "Ruy Lopez",
    moves: ["e4", "e5", "Nf3", "Nc6", "Bb5"],
  },
  {
    eco: "C65",
    name: "Ruy Lopez: Berlin Defense",
    moves: ["e4", "e5", "Nf3", "Nc6", "Bb5", "Nf6"],
  },
  {
    eco: "C50",
    name: "Italian Game",
    moves: ["e4", "e5", "Nf3", "Nc6", "Bc4"],
  },
  {
    eco: "B20",
    name: "Sicilian Defense",
    moves: ["e4", "c5"],
  },
  {
    eco: "B30",
    name: "Sicilian Defense: Old Sicilian",
    moves: ["e4", "c5", "Nf3", "Nc6"],
  },
  {
    eco: "B90",
    name: "Sicilian Defense: Najdorf Variation",
    moves: ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "a6"],
  },
  {
    eco: "B10",
    name: "Caro-Kann Defense",
    moves: ["e4", "c6"],
  },
  {
    eco: "C00",
    name: "French Defense",
    moves: ["e4", "e6"],
  },
  {
    eco: "D06",
    name: "Queen's Gambit",
    moves: ["d4", "d5", "c4"],
  },
  {
    eco: "D30",
    name: "Queen's Gambit Declined",
    moves: ["d4", "d5", "c4", "e6"],
  },
  {
    eco: "D85",
    name: "Grunfeld Defense",
    moves: ["d4", "Nf6", "c4", "g6", "Nc3", "d5"],
  },
  {
    eco: "E60",
    name: "King's Indian Defense",
    moves: ["d4", "Nf6", "c4", "g6"],
  },
  {
    eco: "A45",
    name: "Indian Game",
    moves: ["d4", "Nf6"],
  },
  {
    eco: "A40",
    name: "English Defense",
    moves: ["d4", "e6"],
  },
  {
    eco: "A10",
    name: "English Opening",
    moves: ["c4"],
  },
  {
    eco: "A04",
    name: "Zukertort Opening",
    moves: ["Nf3"],
  },
];
