// ============================================================
// Personal bests per (game, set, variant), kept on this device.
// Beating your own score is the main replay hook for solo study
// games, so results screens show the best and flag a new one.
// ============================================================

const KEY = 'sf_game_bests_v1';

type Records = Record<string, number>;

function read(): Records {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') as Records;
  } catch {
    return {};
  }
}

function recordKey(game: string, setId: string, variant?: string): string {
  return [game, setId, variant ?? ''].join('|');
}

export function getBest(game: string, setId: string, variant?: string): number | null {
  return read()[recordKey(game, setId, variant)] ?? null;
}

/** Store `score` if it beats the previous best. Returns the previous best
 *  (null when this is the first recorded game) and whether it is a new best. */
export function submitScore(
  game: string,
  setId: string,
  score: number,
  variant?: string,
): { previousBest: number | null; isNewBest: boolean } {
  const records = read();
  const key = recordKey(game, setId, variant);
  const previousBest = records[key] ?? null;
  const isNewBest = previousBest === null || score > previousBest;
  if (isNewBest) {
    records[key] = score;
    try {
      localStorage.setItem(KEY, JSON.stringify(records));
    } catch {
      // storage full/unavailable — the best just won't persist
    }
  }
  return { previousBest, isNewBest };
}
