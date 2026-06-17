import type { EngineScore } from "@/lib/chess-tree/types";

type EvaluationOptions = {
  depth?: number;
  timeoutMs?: number;
};

type PendingWaiter = {
  matcher: (line: string) => boolean;
  resolve: (line: string) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

type PendingEvaluation = {
  resolve: (score: EngineScore) => void;
  reject: (error: Error) => void;
  score?: EngineScore;
  timeoutId: ReturnType<typeof setTimeout>;
};

export class StockfishBrowserEngine {
  private worker: Worker | null = null;
  private waiters: PendingWaiter[] = [];
  private evaluation: PendingEvaluation | null = null;
  private readyPromise: Promise<void> | null = null;

  async evaluateFen(fen: string, options: EvaluationOptions = {}): Promise<EngineScore> {
    const depth = options.depth ?? 12;
    const timeoutMs = options.timeoutMs ?? 20_000;

    if (this.evaluation) {
      throw new Error("Engine is already evaluating.");
    }

    await this.ensureReady(timeoutMs);
    await this.sendAndWait("ucinewgame", (line) => line === "readyok", timeoutMs, "isready");
    this.send(`position fen ${fen}`);

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.evaluation = null;
        this.send("stop");
        reject(new Error("Stockfish evaluation timed out."));
      }, timeoutMs);

      this.evaluation = {
        resolve,
        reject,
        timeoutId,
      };
      this.send(`go depth ${depth}`);
    });
  }

  dispose() {
    this.waiters.forEach((waiter) => {
      clearTimeout(waiter.timeoutId);
      waiter.reject(new Error("Stockfish engine disposed."));
    });
    this.waiters = [];

    if (this.evaluation) {
      clearTimeout(this.evaluation.timeoutId);
      this.evaluation.reject(new Error("Stockfish engine disposed."));
      this.evaluation = null;
    }

    this.worker?.terminate();
    this.worker = null;
    this.readyPromise = null;
  }

  private ensureReady(timeoutMs: number) {
    if (!this.readyPromise) {
      this.readyPromise = this.createWorker()
        .then(() => this.sendAndWait("uci", (line) => line === "uciok", timeoutMs))
        .then(() => this.sendAndWait("isready", (line) => line === "readyok", timeoutMs))
        .then(() => undefined);
    }

    return this.readyPromise;
  }

  private async createWorker() {
    if (typeof window === "undefined") {
      throw new Error("Stockfish can only run in the browser.");
    }

    if (this.worker) {
      return;
    }

    const engineUrl = new URL(
      "/stockfish/stockfish-18-lite-single.js#/stockfish/stockfish-18-lite-single.wasm,worker",
      window.location.origin,
    );
    this.worker = new Worker(engineUrl);
    this.worker.onmessage = (event: MessageEvent<string>) => {
      this.handleLine(String(event.data));
    };
    this.worker.onerror = () => {
      this.failAll(new Error("Stockfish worker failed to load."));
    };
  }

  private sendAndWait(
    command: string,
    matcher: (line: string) => boolean,
    timeoutMs: number,
    trailingCommand?: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.waiters = this.waiters.filter((waiter) => waiter.timeoutId !== timeoutId);
        reject(new Error(`Stockfish did not answer "${command}".`));
      }, timeoutMs);

      this.waiters.push({
        matcher,
        resolve,
        reject,
        timeoutId,
      });
      this.send(command);

      if (trailingCommand) {
        this.send(trailingCommand);
      }
    });
  }

  private send(command: string) {
    this.worker?.postMessage(command);
  }

  private handleLine(rawLine: string) {
    const line = rawLine.trim();

    this.waiters = this.waiters.filter((waiter) => {
      if (!waiter.matcher(line)) {
        return true;
      }

      clearTimeout(waiter.timeoutId);
      waiter.resolve(line);

      return false;
    });

    if (line.startsWith("info ")) {
      const score = parseInfoScore(line);

      if (score && this.evaluation) {
        this.evaluation.score = score;
      }
    }

    if (line.startsWith("bestmove ") && this.evaluation) {
      const bestMove = line.split(/\s+/)[1];
      const fallback: EngineScore = {
        kind: "cp",
        value: 0,
      };
      const score = this.evaluation.score ?? fallback;
      clearTimeout(this.evaluation.timeoutId);
      this.evaluation.resolve({
        ...score,
        bestMove: bestMove && bestMove !== "(none)" ? bestMove : score.bestMove,
      });
      this.evaluation = null;
    }
  }

  private failAll(error: Error) {
    this.waiters.forEach((waiter) => {
      clearTimeout(waiter.timeoutId);
      waiter.reject(error);
    });
    this.waiters = [];

    if (this.evaluation) {
      clearTimeout(this.evaluation.timeoutId);
      this.evaluation.reject(error);
      this.evaluation = null;
    }
  }
}

export function parseInfoScore(line: string): EngineScore | null {
  const scoreMatch = line.match(/\bscore\s+(cp|mate)\s+(-?\d+)/);

  if (!scoreMatch) {
    return null;
  }

  const depthMatch = line.match(/\bdepth\s+(\d+)/);
  const pvMatch = line.match(/\bpv\s+([a-h][1-8][a-h][1-8][qrbn]?)/);

  return {
    kind: scoreMatch[1] === "mate" ? "mate" : "cp",
    value: Number(scoreMatch[2]),
    depth: depthMatch ? Number(depthMatch[1]) : undefined,
    bestMove: pvMatch?.[1],
  };
}
