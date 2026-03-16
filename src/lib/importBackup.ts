/**
 * TEMPORARY FEATURE: Import backup from previous StudyFlow version.
 *
 * To remove this feature, see structure/features/import-backup.md
 */

import type { StudySet, Card, ReviewLog, StudyStats, FSRSState } from '@/types';

interface BackupCard {
  id?: string;
  term?: string;
  definition?: string;
  imageData?: string;
  audioData?: string;
  difficulty?: number;
  repetition?: number;
  interval?: number;
  efFactor?: number;
  nextReviewDate?: number;
  history?: Array<{
    date?: number;
    quality?: number;
    timeSpent?: number;
    mode?: string;
  }>;
  fsrs?: {
    stability?: number;
    difficulty?: number;
    state?: number;
    lastReview?: number;
  };
}

interface BackupSet {
  id?: string;
  title?: string;
  description?: string;
  createdAt?: number;
  updatedAt?: number;
  tags?: string[];
  cards?: BackupCard[];
  lastStudied?: number;
  studyStats?: {
    totalSessions?: number;
    averageAccuracy?: number;
    streakDays?: number;
  };
  visibility?: string;
  sharingMode?: string;          // old field — dropped
  effectivePermissions?: string; // old field — dropped
  userId?: string;
  folderId?: string;
  cardCount?: number;
}

export interface ImportResult {
  total: number;
  imported: number;
  skipped: number;
  errors: string[];
}

const VALID_REVIEW_MODES = new Set(['flashcards', 'learn', 'match', 'test', 'game']);

function mapReviewLog(raw: BackupCard['history'][0] & {}): ReviewLog {
  return {
    date: typeof raw.date === 'number' ? raw.date : 0,
    quality: typeof raw.quality === 'number' ? Math.max(0, Math.min(5, raw.quality)) : 0,
    timeSpent: typeof raw.timeSpent === 'number' ? raw.timeSpent : 0,
    mode: VALID_REVIEW_MODES.has(raw.mode as string)
      ? (raw.mode as ReviewLog['mode'])
      : 'flashcards',
  };
}

function mapFSRS(raw: BackupCard['fsrs']): FSRSState | undefined {
  if (!raw) return undefined;
  return {
    stability: typeof raw.stability === 'number' ? raw.stability : 0,
    difficulty: typeof raw.difficulty === 'number' ? raw.difficulty : 0,
    state: ([0, 1, 2, 3] as const).includes(raw.state as 0 | 1 | 2 | 3)
      ? (raw.state as 0 | 1 | 2 | 3)
      : 0,
    lastReview: typeof raw.lastReview === 'number' ? raw.lastReview : 0,
  };
}

function mapCard(raw: BackupCard): Card {
  return {
    id: raw.id || crypto.randomUUID(),
    term: typeof raw.term === 'string' ? raw.term : '',
    definition: typeof raw.definition === 'string' ? raw.definition : '',
    imageData: raw.imageData,
    audioData: raw.audioData,
    difficulty: typeof raw.difficulty === 'number' ? raw.difficulty : 0,
    repetition: typeof raw.repetition === 'number' ? raw.repetition : 0,
    interval: typeof raw.interval === 'number' ? raw.interval : 0,
    efFactor: typeof raw.efFactor === 'number' ? Math.max(1.3, raw.efFactor) : 2.5,
    nextReviewDate: typeof raw.nextReviewDate === 'number' ? raw.nextReviewDate : 0,
    history: Array.isArray(raw.history) ? raw.history.map(mapReviewLog) : [],
    fsrs: mapFSRS(raw.fsrs),
  };
}

function mapStudyStats(raw: BackupSet['studyStats']): StudyStats {
  return {
    totalSessions: raw?.totalSessions ?? 0,
    averageAccuracy: raw?.averageAccuracy ?? 0,
    streakDays: raw?.streakDays ?? 0,
  };
}

function mapSet(raw: BackupSet): StudySet {
  const now = Date.now();
  return {
    id: raw.id!,
    title: raw.title!,
    description: typeof raw.description === 'string' ? raw.description : '',
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : now,
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t) => typeof t === 'string') : [],
    cards: Array.isArray(raw.cards) ? raw.cards.map(mapCard) : [],
    lastStudied: typeof raw.lastStudied === 'number' ? raw.lastStudied : 0,
    studyStats: mapStudyStats(raw.studyStats),
    visibility: raw.visibility === 'public' ? 'public' : 'private',
    // sharingMode and effectivePermissions are intentionally dropped
    folderId: raw.folderId,
    userId: raw.userId,
    cardCount: raw.cardCount,
  };
}

function isValidBackupSet(obj: unknown): obj is BackupSet {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return Boolean(o.id) && Boolean(o.title) && Array.isArray(o.cards);
}

export function parseBackupFile(jsonText: string): { sets: StudySet[]; result: ImportResult } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return {
      sets: [],
      result: { total: 0, imported: 0, skipped: 0, errors: ['Invalid JSON file'] },
    };
  }

  if (!Array.isArray(parsed)) {
    return {
      sets: [],
      result: { total: 0, imported: 0, skipped: 0, errors: ['File must contain a JSON array'] },
    };
  }

  const result: ImportResult = { total: parsed.length, imported: 0, skipped: 0, errors: [] };
  const sets: StudySet[] = [];

  for (let i = 0; i < parsed.length; i++) {
    const raw = parsed[i];
    if (!isValidBackupSet(raw)) {
      result.skipped++;
      result.errors.push(`Item ${i + 1}: missing id, title, or cards array`);
      continue;
    }
    try {
      sets.push(mapSet(raw));
      result.imported++;
    } catch (e) {
      result.skipped++;
      result.errors.push(`Item ${i + 1} ("${raw.title}"): ${e instanceof Error ? e.message : 'unknown error'}`);
    }
  }

  return { sets, result };
}
