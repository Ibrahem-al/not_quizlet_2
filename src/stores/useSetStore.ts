import { create } from 'zustand';
import type { StudySet } from '@/types';
import { getAllSets, getSet, saveSet, deleteSet } from '@/db';
import { deleteSetFromCloud, pullSetsFromCloud } from '@/lib/cloudSync';
import { queueSetSync, cancelSync, type QueueOptions } from '@/lib/syncEngine';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';

const LEGACY_SHARED_COPY_SUFFIX = ' (Shared copy)';

function isSetVisible(set: StudySet): boolean {
  return !set.hiddenReason;
}

function sortSets(sets: StudySet[]): StudySet[] {
  return [...sets].sort((a, b) => b.updatedAt - a.updatedAt);
}

function getLegacySharedCopyBaseTitle(title: string): string | null {
  return title.endsWith(LEGACY_SHARED_COPY_SUFFIX)
    ? title.slice(0, -LEGACY_SHARED_COPY_SUFFIX.length)
    : null;
}

export function backfillLegacyHiddenSets(allSets: StudySet[]): StudySet[] {
  const copiesByBaseTitle = new Map<string, StudySet[]>();

  for (const set of allSets) {
    if (set.hiddenReason || !set.shareToken) continue;
    const baseTitle = getLegacySharedCopyBaseTitle(set.title);
    if (!baseTitle) continue;

    const matches = copiesByBaseTitle.get(baseTitle) ?? [];
    matches.push(set);
    copiesByBaseTitle.set(baseTitle, matches);
  }

  if (copiesByBaseTitle.size === 0) return allSets;

  return allSets.map((set) => {
    if (set.hiddenReason || set.shareToken) return set;

    const matchingCopies = copiesByBaseTitle.get(set.title);
    if (!matchingCopies || matchingCopies.length !== 1) return set;

    const candidateOriginals = allSets.filter((candidate) =>
      !candidate.hiddenReason
      && !candidate.shareToken
      && candidate.title === set.title,
    );

    if (candidateOriginals.length !== 1 || candidateOriginals[0].id !== set.id) {
      return set;
    }

    const replacement = matchingCopies[0];
    return {
      ...set,
      hiddenReason: 'legacy-share-replaced',
      hiddenAt: set.hiddenAt ?? replacement.updatedAt ?? Date.now(),
      replacedBySetId: replacement.id,
    };
  });
}

/** Cloud-first: push every write to Supabase immediately when signed in.
 *  The syncEngine coalesces rapid edits, retries with backoff, and flushes
 *  on reconnect; IndexedDB remains the offline cache. */
function cloudSyncSet(s: StudySet, options?: QueueOptions): void {
  if (!isSupabaseConfigured()) return;
  const user = useAuthStore.getState().user;
  if (user) queueSetSync(s, user.id, options);
}

/** Resolve the signed-in user, waiting for auth initialization if needed. */
export async function resolveAuthUser(): Promise<ReturnType<typeof useAuthStore.getState>['user']> {
  const auth = useAuthStore.getState();
  if (auth.user || !auth.loading) return auth.user;
  return new Promise((resolve) => {
    const unsub = useAuthStore.subscribe((state) => {
      if (!state.loading) {
        unsub();
        resolve(state.user);
      }
    });
  });
}

/** Pages call loadSets() on mount; without this every navigation to Home or
 *  Stats re-ran a full cloud pull. Pulls are deduped while in flight and
 *  skipped when the same user pulled within this window (force overrides). */
const CLOUD_PULL_TTL_MS = 60_000;
let setsHydrated = false;
let localLoadInFlight: Promise<void> | null = null;
let cloudPullInFlight: Promise<void> | null = null;
let lastCloudPull: { userId: string; at: number } | null = null;

export interface LoadOptions {
  /** Pull from the cloud even if a recent pull happened (still deduped). */
  force?: boolean;
}

interface SetStore {
  sets: StudySet[];
  loading: boolean;
  searchQuery: string;

  loadSets: (options?: LoadOptions) => Promise<void>;
  addSet: (set: StudySet) => Promise<void>;
  /** `background: true` marks a study-progress write, which the sync engine
   *  coalesces for longer since it re-uploads the whole set row. */
  updateSet: (set: StudySet, options?: QueueOptions) => Promise<void>;
  hideLegacyOriginal: (id: string, replacementId: string) => Promise<void>;
  restoreHiddenSet: (id: string) => Promise<void>;
  removeSet: (id: string) => Promise<void>;
  setSearchQuery: (query: string) => void;
}

export const useSetStore = create<SetStore>((set, get) => ({
  sets: [],
  loading: false,
  searchQuery: '',

  loadSets: async (options?: LoadOptions) => {
    // Local hydration happens once per session: after it, every write goes
    // through this store, so re-reading IndexedDB on each page visit only
    // cost a structured clone of every set (and a new `sets` identity).
    if (!setsHydrated) {
      localLoadInFlight ??= (async () => {
        set({ loading: true });
        try {
          const localSets = await getAllSets();
          const hydratedSets = backfillLegacyHiddenSets(localSets);

          await Promise.all(
            hydratedSets
              .filter((candidate, index) => candidate !== localSets[index])
              .map((candidate) => saveSet(candidate)),
          );

          // Merge rather than replace, so a set added while IndexedDB was
          // being read is kept.
          const loadedIds = new Set(hydratedSets.map((s) => s.id));
          const addedMeanwhile = get().sets.filter((s) => !loadedIds.has(s.id));
          set({ sets: sortSets([...hydratedSets.filter(isSetVisible), ...addedMeanwhile]) });
          setsHydrated = true;
        } finally {
          set({ loading: false });
          localLoadInFlight = null;
        }
      })();
      await localLoadInFlight;
    }

    // Background cloud pull — non-blocking, offline-first
    if (!isSupabaseConfigured()) return;
    const user = await resolveAuthUser();
    if (!user) return;

    if (cloudPullInFlight) return cloudPullInFlight;
    const fresh =
      lastCloudPull?.userId === user.id && Date.now() - lastCloudPull.at < CLOUD_PULL_TTL_MS;
    if (fresh && !options?.force) return;

    cloudPullInFlight = (async () => {
      try {
        // Pass ALL local sets — including hidden legacy-share duplicates —
        // so the sync merge can preserve their hidden markers instead of
        // resurrecting them (they are absent from get().sets).
        const localForPull = await getAllSets();
        const { merged, toUpload } = await pullSetsFromCloud(user.id, localForPull);
        lastCloudPull = { userId: user.id, at: Date.now() };

        // Recompute the merge against the freshest store state at commit
        // time (no awaits between read and commit) so sets added or edited
        // via debounce save during the async pull are not clobbered.
        const currentSets = get().sets;
        const currentMap = new Map(currentSets.map((s) => [s.id, s]));
        const nextById = new Map(currentSets.map((s) => [s.id, s]));
        const writes: StudySet[] = [];

        for (const s of merged) {
          const existing = currentMap.get(s.id);
          if (!existing) {
            // Not currently in the visible store (new cloud set, or a hidden
            // set that lives only in IndexedDB). Adopt it — hidden ones are
            // filtered out below but their markers are persisted via saveSet.
            nextById.set(s.id, s);
            writes.push(s);
          } else if (s.updatedAt > existing.updatedAt) {
            // Merged copy is strictly newer → adopt it (last-writer-wins).
            nextById.set(s.id, s);
            writes.push(s);
          } else if (s.userId && existing.userId !== s.userId) {
            // Only ownership metadata differs and the local copy is
            // newer/equal: keep the newer local content (so a concurrent card
            // edit is preserved instead of overwritten) but adopt the cloud
            // userId, and the cloud share token when local has none (H1).
            const patched = {
              ...existing,
              userId: s.userId,
              shareToken: existing.shareToken ?? s.shareToken,
            };
            nextById.set(s.id, patched);
            writes.push(patched);
          }
          // Otherwise local is newer/equal with matching userId → keep as-is.
        }

        set({ sets: sortSets([...nextById.values()].filter(isSetVisible)) });

        // Persist to IndexedDB outside the state-commit critical section.
        await Promise.all(writes.map((s) => saveSet(s)));

        // Locally-newer and local-only sets go through the sync queue, which
        // moves inline images to Storage before upserting. Queue the freshest
        // copy: an edit made during the pull must not be replaced in the
        // queue by the older snapshot the merge started from.
        for (const s of toUpload) queueSetSync(nextById.get(s.id) ?? s, user.id);
      } catch {
        // Silent — offline-first, local sets already displayed
      } finally {
        cloudPullInFlight = null;
      }
    })();
    return cloudPullInFlight;
  },

  addSet: async (newSet: StudySet) => {
    await saveSet(newSet);
    const sets = sortSets([...get().sets, newSet].filter(isSetVisible));
    set({ sets });

    cloudSyncSet(newSet);
  },

  updateSet: async (updated: StudySet, options?: QueueOptions) => {
    await saveSet(updated);
    const remaining = get().sets.filter((s) => s.id !== updated.id);
    const sets = sortSets(
      (isSetVisible(updated) ? [...remaining, updated] : remaining).filter(isSetVisible),
    );
    set({ sets });

    cloudSyncSet(updated, options);
  },

  hideLegacyOriginal: async (id: string, replacementId: string) => {
    const target = get().sets.find((s) => s.id === id);
    if (!target) return;

    const hiddenSet: StudySet = {
      ...target,
      hiddenReason: 'legacy-share-replaced',
      hiddenAt: Date.now(),
      replacedBySetId: replacementId,
    };

    await saveSet(hiddenSet);
    set({ sets: get().sets.filter((s) => s.id !== id) });
  },

  restoreHiddenSet: async (id: string) => {
    const target = await getSet(id);
    if (!target) return;

    const restored: StudySet = {
      ...target,
      hiddenReason: undefined,
      hiddenAt: undefined,
      replacedBySetId: undefined,
    };

    await saveSet(restored);
    set({ sets: sortSets([...get().sets, restored].filter(isSetVisible)) });
  },

  removeSet: async (id: string) => {
    // Drop any queued cloud push first so it cannot re-create the row
    // after the delete lands.
    cancelSync('set', id);
    await deleteSet(id);
    set({ sets: get().sets.filter((s) => s.id !== id) });

    // Delete from cloud so pullSetsFromCloud won't resurrect it
    if (isSupabaseConfigured()) {
      deleteSetFromCloud(id).catch(() => {});
    }
  },

  setSearchQuery: (query: string) => {
    set({ searchQuery: query });
  },
}));
