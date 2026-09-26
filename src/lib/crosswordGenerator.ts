// ============================================================
// Crossword generator: greedy criss-cross placement. Longest words
// first, each new word must cross at least one placed word, no two
// words may touch side by side. Several shuffled attempts run and
// the one with the most words (then the densest grid) wins.
// ============================================================

export type Direction = 'across' | 'down';

export interface CrosswordEntry {
  id: string;
  /** Letters only, uppercase (A–Z). */
  answer: string;
  /** Letter count of each word in the original term, e.g. [5, 4]. */
  lengths: number[];
  clueText: string;
  clueHtml: string;
}

export interface PlacedWord extends CrosswordEntry {
  row: number;
  col: number;
  dir: Direction;
  num: number;
  /** Flat cell indexes (row * width + col) in reading order. */
  cells: number[];
}

export interface CrosswordCell {
  letter: string;
  num?: number;
  across?: string;
  down?: string;
}

export interface Crossword {
  width: number;
  height: number;
  /** Flat array, null where there is no square. */
  cells: (CrosswordCell | null)[];
  words: PlacedWord[];
}

export const MIN_WORD = 2;
export const MAX_WORD = 15;
const MAX_SIDE = 15;

/** Uppercase letters only, accents folded (é → E). */
export function toAnswer(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
}

/** Letter counts per word of a term: "Hello world" → [5, 5]. */
export function wordLengths(text: string): number[] {
  return text
    .split(/[\s\-–—/]+/)
    .map((w) => toAnswer(w).length)
    .filter((n) => n > 0);
}

interface Placement {
  entry: CrosswordEntry;
  row: number;
  col: number;
  dir: Direction;
}

class Board {
  letters = new Map<string, string>();
  /** Which directions already run through each cell. */
  dirs = new Map<string, Set<Direction>>();
  minR = 0;
  maxR = -1;
  minC = 0;
  maxC = -1;
  placements: Placement[] = [];

  get(r: number, c: number): string | undefined {
    return this.letters.get(`${r},${c}`);
  }

  place(p: Placement) {
    const { entry, row, col, dir } = p;
    for (let i = 0; i < entry.answer.length; i++) {
      const r = dir === 'down' ? row + i : row;
      const c = dir === 'across' ? col + i : col;
      const k = `${r},${c}`;
      this.letters.set(k, entry.answer[i]);
      const s = this.dirs.get(k) ?? new Set<Direction>();
      s.add(dir);
      this.dirs.set(k, s);
      if (this.placements.length === 0 && i === 0) {
        this.minR = this.maxR = r;
        this.minC = this.maxC = c;
      }
      this.minR = Math.min(this.minR, r);
      this.maxR = Math.max(this.maxR, r);
      this.minC = Math.min(this.minC, c);
      this.maxC = Math.max(this.maxC, c);
    }
    this.placements.push(p);
  }

  /** Crossings count if the word fits here, else -1. */
  fits(word: string, row: number, col: number, dir: Direction): number {
    const dr = dir === 'down' ? 1 : 0;
    const dc = dir === 'across' ? 1 : 0;
    const len = word.length;
    // Grid stays within MAX_SIDE squares each way.
    const endR = row + dr * (len - 1);
    const endC = col + dc * (len - 1);
    if (Math.max(this.maxR, endR) - Math.min(this.minR, row) + 1 > MAX_SIDE) return -1;
    if (Math.max(this.maxC, endC) - Math.min(this.minC, col) + 1 > MAX_SIDE) return -1;
    // Squares right before and after the word must be empty.
    if (this.get(row - dr, col - dc) !== undefined) return -1;
    if (this.get(endR + dr, endC + dc) !== undefined) return -1;
    let crossings = 0;
    for (let i = 0; i < len; i++) {
      const r = row + dr * i;
      const c = col + dc * i;
      const existing = this.get(r, c);
      if (existing !== undefined) {
        if (existing !== word[i]) return -1;
        if (this.dirs.get(`${r},${c}`)?.has(dir)) return -1;
        crossings++;
      } else {
        // An empty square may not sit beside another word's letter.
        if (this.get(r + dc, c + dr) !== undefined) return -1;
        if (this.get(r - dc, c - dr) !== undefined) return -1;
      }
    }
    return crossings;
  }
}

function shuffled<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function attempt(entries: CrosswordEntry[], maxWords: number): Board {
  // Longest first, with a little shuffle among similar lengths.
  const order = shuffled(entries).sort((a, b) => b.answer.length - a.answer.length + (Math.random() - 0.5) * 2.2);
  const board = new Board();
  const [first, ...rest] = order;
  board.place({ entry: first, row: 0, col: 0, dir: Math.random() < 0.5 ? 'across' : 'down' });

  let pending = rest;
  // Words that failed early can fit once the grid has grown, so sweep twice.
  for (let pass = 0; pass < 2 && board.placements.length < maxWords; pass++) {
    const skipped: CrosswordEntry[] = [];
    for (const entry of pending) {
      if (board.placements.length >= maxWords) break;
      let best: { p: Placement; score: number } | null = null;
      for (const [key, letter] of board.letters) {
        const [r0, c0] = key.split(',').map(Number);
        for (let i = 0; i < entry.answer.length; i++) {
          if (entry.answer[i] !== letter) continue;
          for (const dir of ['across', 'down'] as Direction[]) {
            const row = dir === 'down' ? r0 - i : r0;
            const col = dir === 'across' ? c0 - i : c0;
            const crossings = board.fits(entry.answer, row, col, dir);
            if (crossings < 1) continue;
            const w = Math.max(board.maxC, col + (dir === 'across' ? entry.answer.length - 1 : 0)) - Math.min(board.minC, col) + 1;
            const h = Math.max(board.maxR, row + (dir === 'down' ? entry.answer.length - 1 : 0)) - Math.min(board.minR, row) + 1;
            // Favor more crossings, a compact and roughly square grid.
            const score = crossings * 10 - (w * h) / 12 - Math.abs(w - h) + Math.random();
            if (!best || score > best.score) best = { p: { entry, row, col, dir }, score };
          }
        }
      }
      if (best) board.place(best.p);
      else skipped.push(entry);
    }
    pending = skipped;
  }
  return board;
}

function finalize(board: Board): Crossword {
  const width = board.maxC - board.minC + 1;
  const height = board.maxR - board.minR + 1;
  const cells: (CrosswordCell | null)[] = Array.from({ length: width * height }, () => null);
  const placed = board.placements.map((p) => ({
    ...p,
    row: p.row - board.minR,
    col: p.col - board.minC,
  }));

  for (const p of placed) {
    for (let i = 0; i < p.entry.answer.length; i++) {
      const r = p.dir === 'down' ? p.row + i : p.row;
      const c = p.dir === 'across' ? p.col + i : p.col;
      const idx = r * width + c;
      const cell = cells[idx] ?? { letter: p.entry.answer[i] };
      cell[p.dir] = p.entry.id;
      cells[idx] = cell;
    }
  }

  // Number the starting squares in reading order.
  const starts = new Map<number, number>();
  let n = 0;
  for (let idx = 0; idx < cells.length; idx++) {
    if (placed.some((p) => p.row * width + p.col === idx)) {
      n += 1;
      starts.set(idx, n);
      const cell = cells[idx];
      if (cell) cell.num = n;
    }
  }

  const words: PlacedWord[] = placed
    .map((p) => {
      const start = p.row * width + p.col;
      const cellsIdx = Array.from({ length: p.entry.answer.length }, (_, i) =>
        p.dir === 'across' ? start + i : start + i * width,
      );
      return { ...p.entry, row: p.row, col: p.col, dir: p.dir, num: starts.get(start) ?? 0, cells: cellsIdx };
    })
    .sort((a, b) => (a.dir === b.dir ? a.num - b.num : a.dir === 'across' ? -1 : 1));

  return { width, height, cells, words };
}

/** Build the best of `attempts` random layouts. Call from an event handler. */
export function generateCrossword(entries: CrosswordEntry[], maxWords = 14, attempts = 40): Crossword | null {
  const usable = entries.filter((e) => e.answer.length >= MIN_WORD && e.answer.length <= MAX_WORD);
  // One entry per answer so the same word never appears twice.
  const seen = new Set<string>();
  const unique = usable.filter((e) => (seen.has(e.answer) ? false : (seen.add(e.answer), true)));
  if (unique.length === 0) return null;

  let best: { board: Board; score: number } | null = null;
  for (let i = 0; i < attempts; i++) {
    const board = attempt(unique, maxWords);
    const w = board.maxC - board.minC + 1;
    const h = board.maxR - board.minR + 1;
    const filled = board.letters.size;
    const score = board.placements.length * 1000 + (filled / (w * h)) * 100;
    if (!best || score > best.score) best = { board, score };
    if (board.placements.length >= Math.min(maxWords, unique.length) && filled / (w * h) > 0.45) break;
  }
  return best ? finalize(best.board) : null;
}
