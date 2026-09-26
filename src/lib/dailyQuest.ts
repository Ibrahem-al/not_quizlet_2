import type { Card, StudySet } from '@/types';
import { hasDefinitionContent, hasTermContent, shuffleArray } from '@/lib/utils';

// ============================================================
// Daily Quest — a once-a-day review across every set.
// Streak and calendar live on this device (localStorage, 'sf_daily_').
// Day boundaries use LOCAL dates, never UTC.
// ============================================================

export const QUEST_SIZE = 15;
const STATE_KEY = 'sf_daily_state_v1';

export interface DailyState {
  /** Local date keys (YYYY-MM-DD) with a completed quest. */
  days: string[];
  best: number;
  /** Reward earned per completed day. */
  rewards: Record<string, string>;
}

// ---------- Local dates ----------

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayKey(): string {
  return dateKey(new Date());
}

export function keyToDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Calendar-day arithmetic via the Date constructor, so DST days stay one day. */
export function addDays(key: string, n: number): string {
  const d = keyToDate(key);
  return dateKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
}

// ---------- Storage ----------

export function readDailyState(): DailyState {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<DailyState>;
      return {
        days: Array.isArray(s.days) ? s.days.filter((d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) : [],
        best: typeof s.best === 'number' ? s.best : 0,
        rewards: s.rewards && typeof s.rewards === 'object' ? s.rewards : {},
      };
    }
  } catch {
    // fall through
  }
  return { days: [], best: 0, rewards: {} };
}

function writeDailyState(s: DailyState): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(s));
  } catch {
    // storage unavailable — the streak just won't persist
  }
}

/** Current streak: consecutive completed days ending today, or ending
 *  yesterday when today's quest isn't done yet (the streak is still alive). */
export function currentStreak(days: string[], today: string): number {
  const set = new Set(days);
  let cursor = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(cursor)) {
    n += 1;
    cursor = addDays(cursor, -1);
  }
  return n;
}

export function longestStreak(days: string[]): number {
  const sorted = [...new Set(days)].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    run = prev !== null && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

export function completeToday(rewardId: string): DailyState {
  const s = readDailyState();
  const today = todayKey();
  const days = s.days.includes(today) ? s.days : [...s.days, today];
  const next: DailyState = {
    days,
    best: Math.max(s.best, longestStreak(days)),
    rewards: { ...s.rewards, [today]: s.rewards[today] ?? rewardId },
  };
  writeDailyState(next);
  return next;
}

// ---------- Rewards (purely cosmetic, local) ----------

export interface DailyReward {
  id: string;
  name: string;
  blurb: string;
  color: string;
  edge: string;
}

export const DAILY_REWARDS: DailyReward[] = [
  { id: 'comet', name: 'Comet badge', blurb: 'For showing up and shooting through.', color: '#3e63dd', edge: '#2544a8' },
  { id: 'quill', name: 'Golden quill', blurb: 'Your notes have never looked sharper.', color: '#e0a100', edge: '#9c6f00' },
  { id: 'owl', name: 'Night owl badge', blurb: 'Wise, patient and a little bit nocturnal.', color: '#8e4ec6', edge: '#63318f' },
  { id: 'leaf', name: 'Evergreen leaf', blurb: 'Memory that stays green all year.', color: '#23875a', edge: '#17623f' },
  { id: 'flame', name: 'Ember crest', blurb: 'Keep the fire going tomorrow.', color: '#e5484d', edge: '#9e1f25' },
  { id: 'gem', name: 'Focus gem', blurb: 'Rare, clear and hard to scratch.', color: '#0e7c86', edge: '#08565d' },
  { id: 'crown', name: 'Tiny crown', blurb: 'Royalty of the review pile.', color: '#d6409f', edge: '#992a70' },
  { id: 'bolt', name: 'Quick bolt', blurb: 'Fast recall, faster streaks.', color: '#c2410c', edge: '#8a2d07' },
];

export function pickReward(): DailyReward {
  return DAILY_REWARDS[Math.floor(Math.random() * DAILY_REWARDS.length)];
}

export function rewardById(id: string | undefined): DailyReward | null {
  return DAILY_REWARDS.find((r) => r.id === id) ?? null;
}

// ---------- Card selection ----------

export interface QuestPick {
  setId: string;
  cardId: string;
}

export interface QuestPlan {
  picks: QuestPick[];
  due: number;
  fresh: number;
  extra: number;
  setCount: number;
}

/** Both sides need content (text or image) to make a question. */
export function isQuizzable(card: Card): boolean {
  return hasTermContent(card) && hasDefinitionContent(card);
}

function studied(card: Card): boolean {
  return card.history.length > 0 || card.repetition > 0;
}

/** Round-robin across sets so new cards come mixed, not set by set. */
function interleave(lists: QuestPick[][]): QuestPick[] {
  const out: QuestPick[] = [];
  const queues = lists.map((l) => [...l]).filter((l) => l.length > 0);
  while (queues.some((q) => q.length > 0)) {
    for (const q of queues) {
      const next = q.shift();
      if (next) out.push(next);
    }
  }
  return out;
}

/**
 * Up to `max` cards: studied cards that are due (most overdue first), then
 * never-studied cards interleaved across sets. `fillWithAny` (bonus rounds,
 * or when nothing is due or new) tops up with the studied cards that are
 * due soonest, so there is always something to review.
 */
export function planQuest(sets: StudySet[], now: number, max = QUEST_SIZE, fillWithAny = true): QuestPlan {
  const due: { pick: QuestPick; at: number }[] = [];
  const freshBySet: QuestPick[][] = [];
  const later: { pick: QuestPick; at: number }[] = [];
  const usableSets = sets.filter((s) => s.cards.some(isQuizzable));

  for (const set of usableSets) {
    const fresh: QuestPick[] = [];
    for (const card of set.cards) {
      if (!isQuizzable(card)) continue;
      const pick = { setId: set.id, cardId: card.id };
      if (studied(card)) {
        if (card.nextReviewDate <= now) due.push({ pick, at: card.nextReviewDate });
        else later.push({ pick, at: card.nextReviewDate });
      } else {
        fresh.push(pick);
      }
    }
    freshBySet.push(shuffleArray(fresh));
  }

  due.sort((a, b) => a.at - b.at);
  const picks = due.slice(0, max).map((d) => d.pick);
  const dueCount = picks.length;
  for (const p of interleave(freshBySet)) {
    if (picks.length >= max) break;
    picks.push(p);
  }
  const freshCount = picks.length - dueCount;
  let extra = 0;
  if (fillWithAny && picks.length < max) {
    later.sort((a, b) => a.at - b.at);
    for (const l of later) {
      if (picks.length >= max) break;
      picks.push(l.pick);
      extra += 1;
    }
  }
  return { picks, due: dueCount, fresh: freshCount, extra, setCount: usableSets.length };
}

export function countUsableCards(sets: StudySet[]): number {
  return sets.reduce((n, s) => n + s.cards.filter(isQuizzable).length, 0);
}
