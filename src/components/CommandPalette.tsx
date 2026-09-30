import { useMemo, useCallback, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Command } from 'cmdk';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Home, PlusCircle, BarChart3 } from 'lucide-react';
import Fuse from 'fuse.js';
import { useSetStore } from '@/stores/useSetStore';
import { stripHtml } from '@/lib/utils';
import type { StudySet } from '@/types';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

interface FlattenedSet {
  id: string;
  title: string;
  tags: string;
  terms: string;
}

const MAX_RESULTS = 8;
const MAX_SEARCH_RESULTS = 20;

function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { sets } = useSetStore();
  const [query, setQuery] = useState('');

  // Reset the search when the palette closes so it reopens clean.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentionally clear the query when the controlled palette closes
    if (!isOpen) setQuery('');
  }, [isOpen]);

  const flatSets = useMemo<FlattenedSet[]>(
    () =>
      sets.map((s) => ({
        id: s.id,
        title: s.title,
        tags: s.tags.join(' '),
        terms: s.cards
          .slice(0, 20)
          .map((c) => stripHtml(c.term))
          .join(' '),
      })),
    [sets],
  );

  const fuse = useMemo(
    () =>
      new Fuse(flatSets, {
        keys: [
          { name: 'title', weight: 0.5 },
          { name: 'tags', weight: 0.3 },
          { name: 'terms', weight: 0.2 },
        ],
        threshold: 0.4,
        includeScore: true,
      }),
    [flatSets],
  );

  const recentSets = useMemo(
    () =>
      [...sets]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, MAX_RESULTS),
    [sets],
  );

  const setById = useMemo(
    () => new Map(sets.map((s) => [s.id, s] as const)),
    [sets],
  );

  // When searching, cmdk can only score items that are actually rendered, so
  // drive the visible list from Fuse (which indexes the WHOLE library) rather
  // than the 8 recents. Fall back to recents when the query is empty.
  const trimmedQuery = query.trim();
  const displayedSets = useMemo(() => {
    if (!trimmedQuery) return recentSets;
    return fuse
      .search(trimmedQuery)
      .slice(0, MAX_SEARCH_RESULTS)
      .map((r) => setById.get(r.item.id))
      .filter((s): s is StudySet => s != null);
  }, [trimmedQuery, fuse, recentSets, setById]);

  const handleSelect = useCallback(
    (setId: string) => {
      navigate(`/sets/${setId}`);
      onClose();
    },
    [navigate, onClose],
  );

  const handleAction = useCallback(
    (path: string) => {
      navigate(path);
      onClose();
    },
    [navigate, onClose],
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[min(15vh,4rem)]">
          <motion.div
            className="absolute inset-0"
            style={{ background: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(4px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
          />

          <motion.div
            className="relative w-full max-w-lg mx-4"
            style={{
              background: 'var(--color-surface)',
              borderRadius: 'var(--radius-xl)',
              boxShadow: 'var(--shadow-modal)',
              overflow: 'hidden',
            }}
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
          >
            <Command
              label="Search study sets"
              shouldFilter={false}
              onKeyDown={(e) => {
                if (e.key === 'Escape') onClose();
              }}
            >
              <div
                className="flex items-center gap-2 px-4"
                style={{ borderBottom: '1px solid var(--color-border)' }}
              >
                <Search size={18} style={{ color: 'var(--color-text-tertiary)' }} />
                <Command.Input
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Search sets, tags, terms..."
                  className="flex-1 h-12 text-base bg-transparent outline-none"
                  style={{
                    color: 'var(--color-text)',
                    fontFamily: 'var(--font-sans)',
                    border: 'none',
                  }}
                />
                <kbd
                  className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-xs font-mono rounded"
                  style={{
                    background: 'var(--color-muted)',
                    color: 'var(--color-text-tertiary)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  Esc
                </kbd>
              </div>

              <Command.List
                className="max-h-[min(20rem,calc(85dvh-4.5rem))] overflow-y-auto p-2"
                style={{ scrollbarWidth: 'thin' }}
              >
                <Command.Empty>
                  <p
                    className="text-sm text-center py-6"
                    style={{ color: 'var(--color-text-tertiary)' }}
                  >
                    No results found.
                  </p>
                </Command.Empty>

                {!trimmedQuery && (
                <Command.Group
                  heading={
                    <span
                      className="text-xs font-semibold uppercase tracking-wider px-2"
                      style={{ color: 'var(--color-text-tertiary)' }}
                    >
                      Quick Actions
                    </span>
                  }
                >
                  <Command.Item
                    value="__action_home"
                    onSelect={() => handleAction('/')}
                    className="flex items-center gap-3 px-3 py-2 text-sm rounded-md cursor-pointer"
                    style={{ color: 'var(--color-text)' }}
                  >
                    <Home size={16} style={{ color: 'var(--color-text-tertiary)' }} />
                    <span className="flex-1">Home</span>
                    <kbd
                      className="text-xs font-mono px-1.5 py-0.5 rounded"
                      style={{
                        background: 'var(--color-muted)',
                        color: 'var(--color-text-tertiary)',
                      }}
                    >
                      H
                    </kbd>
                  </Command.Item>
                  <Command.Item
                    value="__action_new_set"
                    onSelect={() => handleAction('/sets/new')}
                    className="flex items-center gap-3 px-3 py-2 text-sm rounded-md cursor-pointer"
                    style={{ color: 'var(--color-text)' }}
                  >
                    <PlusCircle size={16} style={{ color: 'var(--color-text-tertiary)' }} />
                    <span className="flex-1">New Set</span>
                    <kbd
                      className="text-xs font-mono px-1.5 py-0.5 rounded"
                      style={{
                        background: 'var(--color-muted)',
                        color: 'var(--color-text-tertiary)',
                      }}
                    >
                      N
                    </kbd>
                  </Command.Item>
                  <Command.Item
                    value="__action_stats"
                    onSelect={() => handleAction('/stats')}
                    className="flex items-center gap-3 px-3 py-2 text-sm rounded-md cursor-pointer"
                    style={{ color: 'var(--color-text)' }}
                  >
                    <BarChart3 size={16} style={{ color: 'var(--color-text-tertiary)' }} />
                    <span className="flex-1">Stats</span>
                    <kbd
                      className="text-xs font-mono px-1.5 py-0.5 rounded"
                      style={{
                        background: 'var(--color-muted)',
                        color: 'var(--color-text-tertiary)',
                      }}
                    >
                      S
                    </kbd>
                  </Command.Item>
                </Command.Group>
                )}

                {displayedSets.length > 0 && (
                  <Command.Group
                    heading={
                      <span
                        className="text-xs font-semibold uppercase tracking-wider px-2"
                        style={{ color: 'var(--color-text-tertiary)' }}
                      >
                        {trimmedQuery ? 'Search Results' : 'Study Sets'}
                      </span>
                    }
                  >
                    {displayedSets.map((set: StudySet) => (
                      <Command.Item
                        key={set.id}
                        value={set.id}
                        onSelect={() => handleSelect(set.id)}
                        className="flex items-center gap-3 px-3 py-2 text-sm rounded-md cursor-pointer"
                        style={{ color: 'var(--color-text)' }}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="line-clamp-2 break-words font-medium">{set.title}</p>
                          <p
                            className="text-xs truncate"
                            style={{ color: 'var(--color-text-tertiary)' }}
                          >
                            {set.cards.length} {set.cards.length === 1 ? 'card' : 'cards'}
                            {set.tags.length > 0 && ` · ${set.tags.slice(0, 3).join(', ')}`}
                          </p>
                        </div>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}
              </Command.List>
            </Command>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export default CommandPalette;
