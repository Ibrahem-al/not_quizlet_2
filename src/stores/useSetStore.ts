import { create } from 'zustand';
import type { StudySet, Folder } from '@/types';
import { getAllSets, saveSet, deleteSet } from '@/db';
import { syncSetContentToCloud, deleteSetFromCloud } from '@/lib/cloudSync';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useFolderStore } from '@/stores/useFolderStore';
import { useAuthStore } from '@/stores/useAuthStore';

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
      const sets = await getAllSets();
      sets.sort((a, b) => b.updatedAt - a.updatedAt);
      set({ sets });
    } finally {
      set({ loading: false });
    }
  },

  addSet: async (newSet: StudySet) => {
    await saveSet(newSet);
    const sets = [...get().sets, newSet].sort(
      (a, b) => b.updatedAt - a.updatedAt,
    );
    set({ sets });

    // Auto-sync if added to a shared folder
    if (isInSharedTree(newSet.folderId)) {
      autoSyncSet(newSet);
    }
  },

  updateSet: async (updated: StudySet) => {
    const oldSet = get().sets.find((s) => s.id === updated.id);
    await saveSet(updated);
    const sets = get()
      .sets.map((s) => (s.id === updated.id ? updated : s))
      .sort((a, b) => b.updatedAt - a.updatedAt);
    set({ sets });

    // Auto-sync if set is in (or was in) a shared folder
    if (isInSharedTree(updated.folderId) || isInSharedTree(oldSet?.folderId)) {
      autoSyncSet(updated);
    }
  },

  removeSet: async (id: string) => {
    const removedSet = get().sets.find((s) => s.id === id);
    await deleteSet(id);
    set({ sets: get().sets.filter((s) => s.id !== id) });

    // Auto-sync deletion if set was in a shared folder
    if (removedSet && isInSharedTree(removedSet.folderId)) {
      if (isSupabaseConfigured()) {
        deleteSetFromCloud(id).catch(() => {});
      }
    }
  },

  setSearchQuery: (query: string) => {
    set({ searchQuery: query });
  },
}));
