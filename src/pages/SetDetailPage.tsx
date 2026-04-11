import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Plus,
  BookOpen,
  GraduationCap,
  Puzzle,
  ClipboardCheck,
  Gamepad2,
  Printer,
  Radio,
  FolderInput,
  Filter,
  X,
  Check,
  Loader2,
  Save,
  Share2,
  Link2,
  Link2Off,
  Copy,
} from 'lucide-react';
import type { Card, StudySet } from '@/types';
import { generateId, stripHtml } from '@/lib/utils';
import { useSetStore } from '@/stores/useSetStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { useFilterStore } from '@/stores/useFilterStore';
import { useToastStore } from '@/stores/useToastStore';
import { isSupabaseConfigured } from '@/lib/supabase';
import {
  createLegacyShareConflictError,
  generateShareToken,
  getShareLinkErrorMessage,
  isLegacyShareConflict,
  removeShareToken,
  syncSetToCloud,
} from '@/lib/cloudSync';
import PageTransition from '@/components/layout/PageTransition';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { CardList } from '@/components/CardList';
import { GameBrowserModal } from '@/components/GameBrowserModal';
import { PrintDialog } from '@/components/PrintDialog';
import MoveToFolderModal from '@/components/MoveToFolderModal';

type SaveStatus = 'saved' | 'saving' | 'unsaved';

function createEmptyCard(): Card {
  return {
    id: generateId(),
    term: '',
    definition: '',
    difficulty: 0,
    repetition: 0,
    interval: 0,
    efFactor: 2.5,
    nextReviewDate: 0,
    history: [],
  };
}

function normalizeSetForShare(set: StudySet, userId: string): StudySet {
  if (set.userId === userId) return set;
  return {
    ...set,
    userId,
    updatedAt: Date.now(),
  };
}

function getLegacyShareCopyTitle(title: string): string {
  return title.endsWith(' (Shared copy)') ? title : `${title} (Shared copy)`;
}

function createLegacyShareCopy(set: StudySet, userId: string): StudySet {
  const now = Date.now();
  return {
    ...set,
    id: generateId(),
    title: getLegacyShareCopyTitle(set.title),
    createdAt: now,
    updatedAt: now,
    userId,
    shareToken: undefined,
  };
}

function SetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const sets = useSetStore((s) => s.sets);
  const addSet = useSetStore((s) => s.addSet);
  const updateSet = useSetStore((s) => s.updateSet);
  const loadSets = useSetStore((s) => s.loadSets);
  const user = useAuthStore((s) => s.user);

  const [localSet, setLocalSet] = useState<StudySet | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [gameBrowserOpen, setGameBrowserOpen] = useState(false);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const storedFilterIds = useFilterStore((s) => s.filteredCardIds);
  const setFilteredCardIds = useFilterStore((s) => s.setFilteredCardIds);
  const addToast = useToastStore((s) => s.addToast);

  // Restore filter visual state from store on mount
  const [excludedCardIds, setExcludedCardIds] = useState<Set<string>>(() => {
    if (!storedFilterIds) return new Set();
    // We'll rebuild excludedCardIds once we have localSet — handled below
    return new Set();
  });
  const [filterApplied, setFilterApplied] = useState(!!storedFilterIds);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localSetRef = useRef<StudySet | null>(null);
  localSetRef.current = localSet;

  // Load sets on mount if needed
  useEffect(() => {
    if (sets.length === 0) {
      void loadSets().then(() => setLoaded(true));
    } else {
      setLoaded(true);
    }
  }, [sets.length, loadSets]);

  // Restore excluded card IDs from filter store when set loads
  useEffect(() => {
    if (!localSet || !storedFilterIds) return;
    const includedSet = new Set(storedFilterIds);
    const excluded = new Set(localSet.cards.filter((c) => !includedSet.has(c.id)).map((c) => c.id));
    if (excluded.size > 0) {
      setExcludedCardIds(excluded);
      setFilterApplied(true);
    }
  }, [localSet?.id, storedFilterIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // Find set from store
  useEffect(() => {
    if (!loaded) return;
    const found = sets.find((s) => s.id === id);
    if (found && !localSet) {
      setLocalSet(found);
    }
  }, [id, sets, loaded, localSet]);

  const toggleCardExclusion = useCallback((cardId: string) => {
    setExcludedCardIds((prev) => {
      const totalCards = localSet?.cards.length ?? 0;
      const currentIncluded = totalCards - prev.size;
      const isCurrentlyExcluded = prev.has(cardId);

      // Prevent going below 2 selected cards
      if (!isCurrentlyExcluded && currentIncluded <= 2) return prev;

      const next = new Set(prev);
      if (isCurrentlyExcluded) {
        next.delete(cardId);
      } else {
        next.add(cardId);
      }
      return next;
    });
  }, [localSet]);

  const activeCardCount = localSet
    ? localSet.cards.length - excludedCardIds.size
    : 0;

  const applyFilter = useCallback(() => {
    if (!localSet) return;
    const selectedIds = localSet.cards
      .filter((c) => !excludedCardIds.has(c.id))
      .map((c) => c.id);
    setFilteredCardIds(selectedIds);
    setFilterApplied(true);
    setFilterOpen(false);
    addToast('success', `Filter applied: ${selectedIds.length} of ${localSet.cards.length} cards selected`);
  }, [localSet, excludedCardIds, setFilteredCardIds, addToast]);

  const clearFilter = useCallback(() => {
    setExcludedCardIds(new Set());
    setFilteredCardIds(null);
    setFilterApplied(false);
    setFilterOpen(false);
  }, [setFilteredCardIds]);

  // Debounced auto-save (5 seconds)
  const scheduleSave = useCallback(() => {
    setSaveStatus('unsaved');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const current = localSetRef.current;
      if (current) {
        setSaveStatus('saving');
        void updateSet({ ...current, updatedAt: Date.now() }).then(() => {
          setSaveStatus('saved');
        });
      }
    }, 5000);
  }, [updateSet]);

  const handleManualSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const current = localSetRef.current;
    if (current) {
      setSaveStatus('saving');
      void updateSet({ ...current, updatedAt: Date.now() }).then(() => {
        setSaveStatus('saved');
      });
    }
  }, [updateSet]);

  // Clean up timer on unmount; save immediately if unsaved
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        const current = localSetRef.current;
        if (current) {
          void updateSet({ ...current, updatedAt: Date.now() });
        }
      }
    };
  }, [updateSet]);

  const handleTitleBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      setEditingTitle(false);
      if (!localSet) return;
      const val = e.target.value.trim() || localSet.title;
      setLocalSet((prev) => (prev ? { ...prev, title: val } : prev));
      scheduleSave();
    },
    [localSet, scheduleSave],
  );

  const handleDescBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      setEditingDesc(false);
      if (!localSet) return;
      setLocalSet((prev) =>
        prev ? { ...prev, description: e.target.value.trim() } : prev,
      );
      scheduleSave();
    },
    [localSet, scheduleSave],
  );

  const handleAddTag = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== 'Enter' || !tagInput.trim() || !localSet) return;
      const tag = tagInput.trim().toLowerCase();
      if (localSet.tags.includes(tag)) {
        setTagInput('');
        return;
      }
      setLocalSet((prev) =>
        prev ? { ...prev, tags: [...prev.tags, tag] } : prev,
      );
      setTagInput('');
      scheduleSave();
    },
    [tagInput, localSet, scheduleSave],
  );

  const handleRemoveTag = useCallback(
    (tag: string) => {
      setLocalSet((prev) =>
        prev ? { ...prev, tags: prev.tags.filter((t) => t !== tag) } : prev,
      );
      scheduleSave();
    },
    [scheduleSave],
  );

  const handleUpdateCard = useCallback(
    (cardId: string, field: 'term' | 'definition', value: string) => {
      setLocalSet((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          cards: prev.cards.map((c) =>
            c.id === cardId ? { ...c, [field]: value } : c,
          ),
        };
      });
      scheduleSave();
    },
    [scheduleSave],
  );

  const handleDeleteCard = useCallback(
    (cardId: string) => {
      setLocalSet((prev) => {
        if (!prev) return prev;
        return { ...prev, cards: prev.cards.filter((c) => c.id !== cardId) };
      });
      scheduleSave();
    },
    [scheduleSave],
  );

  const handleReorderCards = useCallback(
    (cards: Card[]) => {
      setLocalSet((prev) => (prev ? { ...prev, cards } : prev));
      scheduleSave();
    },
    [scheduleSave],
  );

  const handleAddCard = useCallback(() => {
    setLocalSet((prev) => {
      if (!prev) return prev;
      return { ...prev, cards: [...prev.cards, createEmptyCard()] };
    });
    scheduleSave();
  }, [scheduleSave]);

  const shareUrl = localSet?.shareToken
    ? `${window.location.origin}/shared/${localSet.shareToken}`
    : null;

  const handleShareToggle = useCallback(async () => {
    if (!localSet || !isSupabaseConfigured()) {
      addToast('warning', 'Connect Supabase to share sets via link.');
      return;
    }
    if (!user) {
      addToast('warning', 'Sign in to share sets via link.');
      return;
    }
    setSharing(true);

    try {
      if (localSet.shareToken) {
        await removeShareToken(localSet.id);
        const nextSet = { ...localSet, shareToken: undefined };
        await updateSet(nextSet);
        setLocalSet(nextSet);
        addToast('info', 'Share link removed.');
      } else {
        const normalizedSet = normalizeSetForShare(localSet, user.id);
        if (normalizedSet !== localSet) {
          await updateSet(normalizedSet);
          setLocalSet(normalizedSet);
        }

        try {
          const syncedSet = await syncSetToCloud(normalizedSet);
          const token = await generateShareToken(syncedSet);
          const nextSet = { ...syncedSet, shareToken: token };
          await updateSet(nextSet);
          setLocalSet(nextSet);

          const url = `${window.location.origin}/shared/${token}`;
          await navigator.clipboard.writeText(url).catch(() => {});
          addToast('success', 'Share link created and copied to clipboard!');
        } catch (error) {
          if (!isLegacyShareConflict(error)) {
            throw error;
          }

          console.warn('Legacy share conflict detected; creating repaired copy.', {
            setId: normalizedSet.id,
            userId: user.id,
            error,
          });

          const repairedCopy = createLegacyShareCopy(normalizedSet, user.id);

          try {
            const syncedCopy = await syncSetToCloud(repairedCopy);
            const token = await generateShareToken(syncedCopy);
            const sharedCopy = { ...syncedCopy, shareToken: token };
            await addSet(sharedCopy);
            setLocalSet(sharedCopy);

            const url = `${window.location.origin}/shared/${token}`;
            await navigator.clipboard.writeText(url).catch(() => {});
            navigate(`/sets/${sharedCopy.id}`);
            addToast('success', 'Created and shared a repaired copy of this legacy set.');
          } catch (repairError) {
            console.error('Legacy share repair failed.', repairError);
            throw createLegacyShareConflictError(
              repairError instanceof Error ? repairError.message : String(repairError),
            );
          }
        }
      }
    } catch (error) {
      addToast('error', getShareLinkErrorMessage(error));
    } finally {
      setSharing(false);
    }
  }, [localSet, user, addToast, addSet, navigate, updateSet]);

  const handleCopyShareLink = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      addToast('success', 'Link copied to clipboard!');
    } catch {
      addToast('error', 'Failed to copy link.');
    }
  }, [shareUrl, addToast]);

  const studyModes = useMemo(
    () => [
      { id: 'flashcards', label: 'Flashcards', icon: <BookOpen size={16} /> },
      { id: 'learn', label: 'Learn', icon: <GraduationCap size={16} /> },
      { id: 'match', label: 'Match', icon: <Puzzle size={16} /> },
      { id: 'test', label: 'Test', icon: <ClipboardCheck size={16} /> },
    ],
    [],
  );

  // Not found state
  if (loaded && !localSet) {
    return (
      <PageTransition>
        <div className="max-w-3xl mx-auto px-4 py-16 text-center">
          <h1
            className="text-2xl font-bold mb-4"
            style={{ color: 'var(--color-text)' }}
          >
            Set not found
          </h1>
          <p
            className="mb-6"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            The study set you are looking for does not exist or has been deleted.
          </p>
          <Link
            to="/"
            className="font-medium"
            style={{ color: 'var(--color-primary)' }}
          >
            Back to Home
          </Link>
        </div>
      </PageTransition>
    );
  }

  if (!localSet) {
    return (
      <PageTransition>
        <div className="flex items-center justify-center min-h-[50vh]">
          <Loader2
            size={32}
            className="animate-spin"
            style={{ color: 'var(--color-primary)' }}
          />
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Save status indicator */}
        <div className="flex items-center justify-end mb-2 gap-2">
          {saveStatus === 'saving' && (
            <span
              className="flex items-center gap-1 text-sm"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              <Loader2 size={14} className="animate-spin" />
              Saving...
            </span>
          )}
          {saveStatus === 'saved' && (
            <span
              className="flex items-center gap-1 text-sm"
              style={{ color: 'var(--color-success)' }}
            >
              <Check size={14} />
              Saved
            </span>
          )}
          {saveStatus === 'unsaved' && (
            <span
              className="text-sm"
              style={{ color: 'var(--color-warning)' }}
            >
              Unsaved changes
            </span>
          )}
        </div>

        {/* Header: Title */}
        <div className="mb-1">
          {editingTitle ? (
            <input
              autoFocus
              defaultValue={localSet.title}
              onBlur={handleTitleBlur}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
              className="text-2xl font-bold w-full bg-transparent outline-none"
              style={{
                color: 'var(--color-text)',
                fontFamily: 'var(--font-sans)',
                border: 'none',
                borderBottom: '2px solid var(--color-primary)',
                padding: '2px 0',
              }}
            />
          ) : (
            <h1
              className="text-2xl font-bold cursor-pointer"
              style={{
                color: 'var(--color-text)',
                fontFamily: 'var(--font-sans)',
              }}
              onClick={() => setEditingTitle(true)}
              title="Click to edit title"
            >
              {localSet.title}
            </h1>
          )}
        </div>

        {/* Description */}
        <div className="mb-3">
          {editingDesc ? (
            <input
              autoFocus
              defaultValue={localSet.description}
              onBlur={handleDescBlur}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
              placeholder="Add a description"
              className="text-sm w-full bg-transparent outline-none"
              style={{
                color: 'var(--color-text-secondary)',
                fontFamily: 'var(--font-sans)',
                border: 'none',
                borderBottom: '1px solid var(--color-primary)',
                padding: '2px 0',
              }}
            />
          ) : (
            <p
              className="text-sm cursor-pointer"
              style={{ color: 'var(--color-text-secondary)' }}
              onClick={() => setEditingDesc(true)}
              title="Click to edit description"
            >
              {localSet.description || 'Add a description...'}
            </p>
          )}
        </div>

        {/* Tags */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {localSet.tags.map((tag) => (
            <Badge key={tag} variant="info">
              {tag}
              <button
                type="button"
                className="ml-1 cursor-pointer"
                style={{ background: 'none', border: 'none', padding: 0 }}
                onClick={() => handleRemoveTag(tag)}
              >
                <X size={12} />
              </button>
            </Badge>
          ))}
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleAddTag}
            placeholder="Add tag..."
            className="text-sm bg-transparent outline-none w-24"
            style={{
              color: 'var(--color-text)',
              border: 'none',
              fontFamily: 'var(--font-sans)',
            }}
          />
        </div>

        {/* Action bar */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          {studyModes.map((mode) => (
            <Button
              key={mode.id}
              variant="outline"
              size="sm"
              icon={mode.icon}
              onClick={() => navigate(`/sets/${localSet.id}/study/${mode.id}`)}
            >
              {mode.label}
            </Button>
          ))}
          <Button
            variant="outline"
            size="sm"
            icon={<Gamepad2 size={16} />}
            onClick={() => setGameBrowserOpen(true)}
          >
            Games
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<Printer size={16} />}
            onClick={() => setPrintDialogOpen(true)}
          >
            Print
          </Button>
          {user && (
            <Button
              variant="ghost"
              size="sm"
              icon={<Radio size={16} />}
              onClick={() => navigate(`/live/host/${localSet.id}`)}
            >
              Live Game
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            icon={<FolderInput size={16} />}
            onClick={() => setFolderModalOpen(true)}
          >
            Move to Folder
          </Button>

          {/* Share button */}
          {user && isSupabaseConfigured() && (
            <>
              <Button
                variant={localSet.shareToken ? 'secondary' : 'ghost'}
                size="sm"
                icon={sharing ? <Loader2 size={16} className="animate-spin" /> : localSet.shareToken ? <Link2Off size={16} /> : <Share2 size={16} />}
                onClick={handleShareToggle}
                disabled={sharing}
              >
                {localSet.shareToken ? 'Stop Sharing' : 'Share Link'}
              </Button>
              {localSet.shareToken && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Copy size={16} />}
                  onClick={handleCopyShareLink}
                >
                  Copy Link
                </Button>
              )}
            </>
          )}
        </div>

        {/* Share link banner */}
        {shareUrl && (
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-xl mb-4 text-sm"
            style={{
              background: 'var(--color-primary-light)',
              border: '1px solid color-mix(in srgb, var(--color-primary) 20%, transparent)',
            }}
          >
            <Link2 size={16} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
            <span className="truncate" style={{ color: 'var(--color-text-secondary)' }}>
              {shareUrl}
            </span>
            <button
              onClick={handleCopyShareLink}
              className="shrink-0 px-3 py-1 rounded-md text-xs font-medium cursor-pointer"
              style={{
                background: 'var(--color-primary)',
                color: 'white',
                border: 'none',
              }}
            >
              Copy
            </button>
          </div>
        )}

        {/* Card list */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2
              className="text-lg font-semibold"
              style={{ color: 'var(--color-text)' }}
            >
              Cards ({localSet.cards.length})
            </h2>
            <div className="flex items-center gap-2">
              {filterApplied && (
                <span
                  className="text-xs font-medium px-2 py-1 rounded-full"
                  style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}
                >
                  {activeCardCount} of {localSet.cards.length} cards active
                </span>
              )}
              <Button
                variant={filterOpen || filterApplied ? 'primary' : 'ghost'}
                size="sm"
                icon={<Filter size={16} />}
                onClick={() => setFilterOpen((v) => !v)}
              >
                {filterOpen ? 'Close' : 'Filter Cards'}
              </Button>
              {filterApplied && !filterOpen && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<X size={14} />}
                  onClick={clearFilter}
                >
                  Clear
                </Button>
              )}
            </div>
          </div>

          {/* Card filter panel */}
          {filterOpen && (
            <div
              className="rounded-xl p-4 mb-4"
              style={{
                background: 'var(--color-surface-raised)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                  Select which cards to study
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setExcludedCardIds(new Set())}
                    className="text-xs font-medium px-2 py-1 rounded cursor-pointer"
                    style={{
                      background: 'var(--color-muted)',
                      color: 'var(--color-primary)',
                      border: 'none',
                    }}
                  >
                    Select All
                  </button>
                  <button
                    onClick={() => setExcludedCardIds(new Set(localSet.cards.map((c) => c.id)))}
                    className="text-xs font-medium px-2 py-1 rounded cursor-pointer"
                    style={{
                      background: 'var(--color-muted)',
                      color: 'var(--color-text-secondary)',
                      border: 'none',
                    }}
                  >
                    Deselect All
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
                {localSet.cards.map((card, i) => {
                  const isIncluded = !excludedCardIds.has(card.id);
                  const termText = stripHtml(card.term) || '(empty term)';
                  const defText = stripHtml(card.definition) || '(empty definition)';
                  return (
                    <label
                      key={card.id}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors"
                      style={{
                        background: isIncluded ? 'var(--color-surface)' : 'transparent',
                        opacity: isIncluded ? 1 : 0.5,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isIncluded}
                        onChange={() => toggleCardExclusion(card.id)}
                        className="shrink-0"
                        style={{ accentColor: 'var(--color-primary)' }}
                      />
                      <span className="text-sm font-medium shrink-0 w-6" style={{ color: 'var(--color-text-tertiary)' }}>
                        {i + 1}
                      </span>
                      <span className="text-sm truncate flex-1" style={{ color: 'var(--color-text)' }}>
                        {termText}
                      </span>
                      <span className="text-sm truncate flex-1" style={{ color: 'var(--color-text-secondary)' }}>
                        {defText}
                      </span>
                    </label>
                  );
                })}
              </div>

              {/* Footer: count + Apply/Clear */}
              <div className="flex items-center justify-between mt-4 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                <span className="text-sm" style={{ color: activeCardCount <= 2 ? 'var(--color-warning)' : 'var(--color-text-secondary)' }}>
                  {activeCardCount} of {localSet.cards.length} cards selected
                  {activeCardCount <= 2 && ' (minimum 2)'}
                </span>
                <div className="flex gap-2">
                  {filterApplied && (
                    <Button variant="ghost" size="sm" onClick={clearFilter}>
                      Clear Filter
                    </Button>
                  )}
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={applyFilter}
                    disabled={activeCardCount < 2 || (excludedCardIds.size === 0 && !filterApplied)}
                  >
                    Apply Filter
                  </Button>
                </div>
              </div>
            </div>
          )}

          <CardList
            setId={localSet.id}
            userId={user?.id}
            cards={localSet.cards}
            onUpdateCard={handleUpdateCard}
            onDeleteCard={handleDeleteCard}
            onReorderCards={handleReorderCards}
            excludedCardIds={excludedCardIds.size > 0 ? excludedCardIds : undefined}
          />
        </div>

        {/* Add card + Save buttons */}
        <div className="flex justify-center gap-3 py-4">
          <Button
            variant="secondary"
            icon={<Save size={18} />}
            onClick={handleManualSave}
            disabled={saveStatus !== 'unsaved'}
          >
            {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : 'Save'}
          </Button>
          <Button
            variant="primary"
            icon={<Plus size={18} />}
            onClick={handleAddCard}
          >
            Add Card
          </Button>
        </div>

        {/* Game browser modal */}
        <GameBrowserModal
          isOpen={gameBrowserOpen}
          onClose={() => setGameBrowserOpen(false)}
          setId={localSet.id}
          cardCount={filterApplied ? activeCardCount : localSet.cards.length}
        />

        {/* Print dialog */}
        <PrintDialog
          isOpen={printDialogOpen}
          onClose={() => setPrintDialogOpen(false)}
          set={localSet}
        />

        {/* Move to folder modal */}
        <MoveToFolderModal
          isOpen={folderModalOpen}
          onClose={() => setFolderModalOpen(false)}
          setId={localSet.id}
          currentFolderId={localSet.folderId}
        />
      </div>
    </PageTransition>
  );
}

export default SetDetailPage;
