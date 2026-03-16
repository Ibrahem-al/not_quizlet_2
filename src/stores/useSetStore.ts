import { create } from 'zustand';
import type { StudySet } from '@/types';
import { getAllSets, saveSet, deleteSet } from '@/db';

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
  },

  updateSet: async (updated: StudySet) => {
    await saveSet(updated);
    const sets = get()
      .sets.map((s) => (s.id === updated.id ? updated : s))
      .sort((a, b) => b.updatedAt - a.updatedAt);
    set({ sets });
  },

  removeSet: async (id: string) => {
    await deleteSet(id);
    set({ sets: get().sets.filter((s) => s.id !== id) });
  },

  setSearchQuery: (query: string) => {
    set({ searchQuery: query });
  },
}));
