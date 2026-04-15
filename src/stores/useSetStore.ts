import { create } from 'zustand';
import type { StudySet, Folder } from '@/types';
import { getAllSets, getSet, saveSet, deleteSet } from '@/db';
import { syncSetContentToCloud, deleteSetFromCloud, pullSetsFromCloud } from '@/lib/cloudSync';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useFolderStore } from '@/stores/useFolderStore';
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

/** Check if a folder (or any ancestor) is shared */
function isInSharedTree(folderId: string | undefined): boolean {
  if (!folderId) return false;
  const folders = useFolderStore.getState().folders;
  let currentId: string | undefined = folderId;
  while (currentId) {
    const folder = folders.find((f: Folder) => f.id === currentId);
    if (!folder) break;
    if (folder.shareToken) return true;
    currentId = folder.parentFolderId;
  }
  return false;
}

/** Fire-and-forget cloud sync for a set in a shared folder */
function autoSyncSet(s: StudySet): void {
  if (!isSupabaseConfigured()) return;
  const user = useAuthStore.getState().user;
  if (user) {
    syncSetContentToCloud({ ...s, userId: user.id }).catch(() => {});
  }
}

interface SetStore {
  sets: StudySet[];
  loading: boolean;
  searchQuery: string;

  loadSets: () => Promise<void>;
  addSet: (set: StudySet) => Promise<void>;
  updateSet: (set: StudySet) => Promise<void>;
  hideLegacyOriginal: (id: string, replacementId: string) => Promise<void>;
  restoreHiddenSet: (id: string) => Promise<void>;
  removeSet: (id: string) => Promise<void>;
  setSearchQuery: (query: string) => void;
}

export const useSetStore = create<SetStore>((set, get) => ({
  sets: [],
  loading: false,
  searchQuery: '',

  loadSets: async () => {
    set({ loading: true });
    try {
      const localSets = await getAllSets();
      const hydratedSets = backfillLegacyHiddenSets(localSets);

      await Promise.all(
        hydratedSets
          .filter((candidate, index) => candidate !== localSets[index])
          .map((candidate) => saveSet(candidate)),
      );

      set({ sets: sortSets(hydratedSets.filter(isSetVisible)) });
    } finally {
      set({ loading: false });
    }

    // Background cloud pull — non-blocking, offline-first
    // Wait for auth to finish initializing if it hasn't yet
    if (isSupabaseConfigured()) {
      let user = useAuthStore.getState().user;
      if (!user && useAuthStore.getState().loading) {
        user = await new Promise<ReturnType<typeof useAuthStore.getState>['user']>((resolve) => {
          const unsub = useAuthStore.subscribe((state) => {
            if (!state.loading) {
              unsub();
              resolve(state.user);
            }
          });
        });
      }
      if (user) {
        try {
          const merged = await pullSetsFromCloud(user.id, get().sets);
          // Merge cloud results into current store instead of replacing.
          // This prevents overwriting sets that were added or edited
          // (via debounce save) during the async cloud pull.
          const currentSets = get().sets;
          const currentMap = new Map(currentSets.map((s) => [s.id, s]));
          const newSets = [...currentSets];

          for (const s of merged) {
            const existing = currentMap.get(s.id);
            if (!existing) {
              // Cloud-only set not yet in store — add it
              newSets.push(s);
              await saveSet(s);
            } else if (s.updatedAt > existing.updatedAt || s.userId !== existing.userId) {
              // Cloud version is newer, or it carries ownership metadata
              // that the local offline-first copy never persisted.
              const idx = newSets.findIndex((x) => x.id === s.id);
              if (idx !== -1) newSets[idx] = s;
              await saveSet(s);
            }
            // If local is newer or equal, skip — don't overwrite
          }

          set({ sets: sortSets(newSets.filter(isSetVisible)) });
        } catch {
          // Silent — offline-first, local sets already displayed
        }
      }
    }
  },

  addSet: async (newSet: StudySet) => {
    await saveSet(newSet);
    const sets = sortSets([...get().sets, newSet].filter(isSetVisible));
    set({ sets });

    // Auto-sync if added to a shared folder
    if (isInSharedTree(newSet.folderId)) {
      autoSyncSet(newSet);
    }
  },

  updateSet: async (updated: StudySet) => {
    const oldSet = get().sets.find((s) => s.id === updated.id);
    await saveSet(updated);
    const remaining = get().sets.filter((s) => s.id !== updated.id);
    const sets = sortSets(
      (isSetVisible(updated) ? [...remaining, updated] : remaining).filter(isSetVisible),
    );
    set({ sets });

    // Auto-sync if set is in (or was in) a shared folder
    if (isInSharedTree(updated.folderId) || isInSharedTree(oldSet?.folderId)) {
      autoSyncSet(updated);
    }
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
