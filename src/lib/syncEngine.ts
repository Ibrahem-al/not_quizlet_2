import { create } from 'zustand';
import type { StudySet, Folder } from '@/types';
import {
  prepareSetForAutoSync,
  upsertSetContent,
  upsertFolderContent,
} from '@/lib/cloudSync';
import { isSupabaseConfigured } from '@/lib/supabase';

// ============================================================
// Cloud-first sync engine.
//
// When a user is signed in, every set/folder write is pushed to
// Supabase immediately (coalesced per item, retried with backoff,
// flushed on reconnect). IndexedDB remains the offline cache and
// the pull-merge in cloudSync reconciles anything a failed push
// leaves behind.
// ============================================================

export type SyncState = 'idle' | 'syncing' | 'error' | 'offline';

interface SyncStatusStore {
  state: SyncState;
  pending: number;
  lastSyncedAt: number | null;
  lastError: string | null;
}

export const useSyncStatusStore = create<SyncStatusStore>(() => ({
  state: 'idle',
  pending: 0,
  lastSyncedAt: null,
  lastError: null,
}));

function reportStatus(partial: Partial<SyncStatusStore>): void {
  useSyncStatusStore.setState(partial);
}

type QueueItem =
  | { kind: 'set'; payload: StudySet; userId: string }
  | { kind: 'folder'; payload: Folder; userId: string };

/** Latest write wins per item id — rapid edits coalesce into one push. */
const queue = new Map<string, QueueItem>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const retryCounts = new Map<string, number>();

const COALESCE_MS = 500;
const MAX_RETRIES = 4;

function recomputePending(): void {
  reportStatus({
    pending: queue.size,
    state: queue.size === 0
      ? (useSyncStatusStore.getState().lastError ? 'error' : 'idle')
      : useSyncStatusStore.getState().state,
  });
}

/** After a sync migrates card images to storage URLs, persist the slimmer
 *  copy locally so IndexedDB matches the cloud (only if the set was not
 *  edited again while the sync was in flight). */
async function persistPreparedSet(original: StudySet, prepared: StudySet): Promise<void> {
  if (prepared === original) return;
  const { getSet, saveSet } = await import('@/db');
  const current = await getSet(original.id);
  if (!current || current.updatedAt !== original.updatedAt) return;
  await saveSet(prepared);

  const { useSetStore } = await import('@/stores/useSetStore');
  useSetStore.setState((s) => ({
    sets: s.sets.map((x) =>
      x.id === prepared.id && x.updatedAt === original.updatedAt ? prepared : x,
    ),
  }));
}

async function pushItem(item: QueueItem): Promise<void> {
  if (item.kind === 'set') {
    const withOwner = { ...item.payload, userId: item.userId };
    const prepared = await prepareSetForAutoSync(withOwner);
    await upsertSetContent(prepared);
    await persistPreparedSet(withOwner, prepared);
  } else {
    await upsertFolderContent({ ...item.payload, userId: item.userId });
  }
}

async function processKey(key: string): Promise<void> {
  const item = queue.get(key);
  if (!item) return;

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    reportStatus({ state: 'offline' });
    return; // flushed by the 'online' listener
  }

  queue.delete(key);
  reportStatus({ state: 'syncing' });

  try {
    await pushItem(item);
    retryCounts.delete(key);
    reportStatus({ lastSyncedAt: Date.now(), lastError: null });
  } catch (error) {
    const attempt = (retryCounts.get(key) ?? 0) + 1;
    // Requeue unless a newer write already replaced this item.
    if (!queue.has(key)) queue.set(key, item);

    if (attempt <= MAX_RETRIES) {
      retryCounts.set(key, attempt);
      const delay = Math.min(30_000, 1000 * 2 ** attempt);
      scheduleKey(key, delay);
    } else {
      retryCounts.delete(key);
      queue.delete(key);
      reportStatus({
        lastError: error instanceof Error ? error.message : 'Sync failed',
      });
    }
  } finally {
    recomputePending();
  }
}

function scheduleKey(key: string, delay: number): void {
  const existing = timers.get(key);
  if (existing) clearTimeout(existing);
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      void processKey(key);
    }, delay),
  );
}

function enqueue(item: QueueItem): void {
  if (!isSupabaseConfigured()) return;
  const key = `${item.kind}:${item.payload.id}`;
  queue.set(key, item);
  retryCounts.delete(key); // fresh content resets the backoff
  recomputePending();
  scheduleKey(key, COALESCE_MS);
}

export function queueSetSync(set: StudySet, userId: string): void {
  enqueue({ kind: 'set', payload: set, userId });
}

export function queueFolderSync(folder: Folder, userId: string): void {
  enqueue({ kind: 'folder', payload: folder, userId });
}

/** Push everything still queued (used on reconnect and before unload). */
export function flushSyncQueue(): void {
  for (const key of [...queue.keys()]) {
    scheduleKey(key, 0);
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    reportStatus({ state: queue.size > 0 ? 'syncing' : 'idle' });
    flushSyncQueue();
  });
  window.addEventListener('offline', () => {
    reportStatus({ state: 'offline' });
  });
}
