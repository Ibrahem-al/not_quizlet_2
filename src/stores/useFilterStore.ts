import { create } from 'zustand';

type CardFilter = 'all' | 'due' | 'new' | 'difficult';

interface FilterStore {
  cardFilter: CardFilter;
  filteredCardIds: string[] | null;

  setFilter: (filter: CardFilter) => void;
  setFilteredCardIds: (ids: string[] | null) => void;
  resetFilter: () => void;
}

export const useFilterStore = create<FilterStore>((set) => ({
  cardFilter: 'all',
  filteredCardIds: null,

  setFilter: (filter: CardFilter) => {
    set({ cardFilter: filter });
  },

  setFilteredCardIds: (ids: string[] | null) => {
    set({ filteredCardIds: ids });
  },

  resetFilter: () => {
    set({ cardFilter: 'all', filteredCardIds: null });
  },
}));
