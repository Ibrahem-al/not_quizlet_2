import { create } from 'zustand';

type CardFilter = 'all' | 'due' | 'new' | 'difficult';

interface FilterStore {
  cardFilter: CardFilter;
  filteredCardIds: string[] | null;
  /**
   * The set the current `filteredCardIds` belong to. Consumers must only apply
   * the stored filter when this matches the set they are rendering — a global
   * filter must never leak across sets.
   */
  filterSetId: string | null;

  setFilter: (filter: CardFilter) => void;
  setFilteredCardIds: (ids: string[] | null, setId?: string | null) => void;
  resetFilter: () => void;
}

export const useFilterStore = create<FilterStore>((set) => ({
  cardFilter: 'all',
  filteredCardIds: null,
  filterSetId: null,

  setFilter: (filter: CardFilter) => {
    set({ cardFilter: filter });
  },

  setFilteredCardIds: (ids: string[] | null, setId: string | null = null) => {
    // Clearing the ids also clears the owning set id so a stale scope can't linger.
    set({ filteredCardIds: ids, filterSetId: ids === null ? null : setId });
  },

  resetFilter: () => {
    set({ cardFilter: 'all', filteredCardIds: null, filterSetId: null });
  },
}));
