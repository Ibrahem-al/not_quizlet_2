import { create } from 'zustand';
import type { StudySet, Folder } from '@/types';
import {
  prepareSetForAutoSync,
  upsertSetContent,
  upsertFolderContents,
} from '@/lib/cloudSync';
import { isSupabaseConfigured } from '@/lib/supabase';

// ============================================================
// Cloud-first sync engine.
//
// When a user is signed in, every set/folder write is pushed to
// Supabase (coalesced per item, serialized per item so pushes can
// never land out of order, retried with backoff, flushed on
// reconnect). IndexedDB remains the offline cache and the
// pull-merge in cloudSync reconciles anything a failed push
// leaves behind on the next app load.
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
/** Keys with a push currently awaiting the network — used to serialize
 *  per-item pushes so an older payload can never land after a newer one. */
const inFlight = new Set<string>();
/** Keys whose retries were exhausted; they stay in `queue` so a manual
 *  flush (or the next edit) can retry them instead of dropping the write. */
const exhausted = new Set<string>();

const COALESCE_MS = 2000;
const MAX_RETRIES = 4;

function recomputeStatus(): void {
  const { lastError } = useSyncStatusStore.getState();
  const active = queue.size > 0 || inFlight.size > 0;
  reportStatus({
    pending: queue.size + inFlight.size,
    state: exhausted.size > 0 ? 'error' : active ? 'syncing' : lastError ? 'error' : 'idle',
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

/** Folder rows must reach Postgres parent-first (parent_folder_id FK), so a
 *  folder push includes any local ancestors in the same ordered upsert. */
async function collectFolderChain(folder: Folder, userId: string): Promise<Folder[]> {
  const { useFolderStore } = await import('@/stores/useFolderStore');
  const all = useFolderStore.getState().folders;
  const chain: Folder[] = [];
  const seen = new Set<string>([folder.id]);
  let parentId = folder.parentFolderId;
  while (parentId && !seen.has(parentId)) {
    const parent = all.find((f) => f.id === parentId);
    if (!parent) break;
    seen.add(parent.id);
    chain.unshift({ ...parent, userId });
    parentId = parent.parentFolderId;
  }
  chain.push({ ...folder, userId });
  return chain;
}

async function pushItem(item: QueueItem): Promise<void> {
  if (item.kind === 'set') {
    const withOwner = { ...item.payload, userId: item.userId };
    // Preparation failures (image upload, oversized media) abort the push —
    // the retry loop re-runs preparation rather than uploading raw base64.
    const prepared = await prepareSetForAutoSync(withOwner);
    await upsertSetContent(prepared);
    await persistPreparedSet(withOwner, prepared);
  } else {
    await upsertFolderContents(await collectFolderChain(item.payload, item.userId));
  }
}

async function processKey(key: string): Promise<void> {
  // Serialize per item: if a push for this key is already awaiting the
  // network, run again after it finishes instead of racing it.
  if (inFlight.has(key)) {
    scheduleKey(key, COALESCE_MS);
    return;
  }

  const item = queue.get(key);
  if (!item) return;

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    reportStatus({ state: 'offline' });
    return; // flushed by the 'online' listener
  }

  queue.delete(key);
  exhausted.delete(key);
  inFlight.add(key);
  recomputeStatus();

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
      // Keep the item so "click to retry" (flushSyncQueue) and later edits
      // can still push it — never silently drop a write.
      retryCounts.delete(key);
      exhausted.add(key);
      reportStatus({
        lastError: error instanceof Error ? error.message : 'Sync failed',
      });
    }
  } finally {
    inFlight.delete(key);
    recomputeStatus();
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
  exhausted.delete(key);
  recomputeStatus();
  scheduleKey(key, COALESCE_MS);
}

export function queueSetSync(set: StudySet, userId: string): void {
  enqueue({ kind: 'set', payload: set, userId });
}

export function queueFolderSync(folder: Folder, userId: string): void {
  enqueue({ kind: 'folder', payload: folder, userId });
}

/** Drop any queued (not yet in-flight) push for a deleted item so the
 *  pending upsert cannot re-create the row the delete just removed. */
export function cancelSync(kind: 'set' | 'folder', id: string): void {
  const key = `${kind}:${id}`;
  queue.delete(key);
  exhausted.delete(key);
  retryCounts.delete(key);
  const timer = timers.get(key);
  if (timer) {
    clearTimeout(timer);
    timers.delete(key);
  }
  recomputeStatus();
}

/** Push everything still queued now — including retry-exhausted items
 *  (used by the header indicator's click-to-retry and the reconnect flush). */
export function flushSyncQueue(): void {
  reportStatus({ lastError: null });
  for (const key of [...queue.keys()]) {
    retryCounts.delete(key);
    scheduleKey(key, 0);
  }
  recomputeStatus();
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    flushSyncQueue();
  });
  window.addEventListener('offline', () => {
    reportStatus({ state: 'offline' });
  });
}
