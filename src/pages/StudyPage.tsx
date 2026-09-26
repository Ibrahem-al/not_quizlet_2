import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState, useRef, Suspense, type ComponentType } from 'react';
import type { Card } from '@/types';
import { useSetStore } from '@/stores/useSetStore';
import { useFilterStore } from '@/stores/useFilterStore';
import { hasTermContent, hasDefinitionContent } from '@/lib/utils';
import PageTransition from '@/components/layout/PageTransition';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { MODE_COMPONENTS, MIN_CARDS, isStudyMode, type ModeProps } from '@/components/modes/registry';

function StudyPage() {
  const { id, mode } = useParams<{ id: string; mode: string }>();
  const navigate = useNavigate();
  const sets = useSetStore((s) => s.sets);
  const loadSets = useSetStore((s) => s.loadSets);
  const [loading, setLoading] = useState(true);

  // Snapshot the filter once on mount, then clear the store so stale filters
  // don't leak into future sessions (fixes games ending after 1 question).
  const snapshotRef = useRef<{ ids: string[] | null; setId: string | null }>({
    ids: useFilterStore.getState().filteredCardIds,
    setId: useFilterStore.getState().filterSetId,
  });
  useEffect(() => {
    useFilterStore.getState().setFilteredCardIds(null);
  }, []);
  const filteredCardIds = snapshotRef.current.ids;
  const filterSetId = snapshotRef.current.setId;

  // Deduped/throttled in the store; resolves after the cloud pull, but the
  // set renders as soon as it is available locally.
  useEffect(() => {
    void loadSets().finally(() => setLoading(false));
  }, [loadSets]);

  const studySet = sets.find((s) => s.id === id);

  if (loading && !studySet) {
    return (
      <PageTransition>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Spinner size="lg" />
        </div>
      </PageTransition>
    );
  }

  if (!studySet) {
    return (
      <PageTransition>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <h2 className="text-xl font-semibold" style={{ color: 'var(--color-text)' }}>
            Set not found
          </h2>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            The study set you're looking for doesn't exist or has been deleted.
          </p>
          <Button variant="primary" onClick={() => navigate('/')}>
            Go Home
          </Button>
        </div>
      </PageTransition>
    );
  }

  // Filter out blank/incomplete cards
  let validCards: Card[] = studySet.cards.filter(
    (card) => hasTermContent(card) && hasDefinitionContent(card),
  );

  // Apply active card filter from store, but only when it was created for THIS
  // set (filterSetId match) AND at least one filtered id maps to a valid card.
  // If the intersection is empty, fall back to all valid cards so we never block
  // the mode to zero on a leaked/stale filter (H5 / M10).
  if (filterSetId === id && filteredCardIds && filteredCardIds.length > 0) {
    const idSet = new Set(filteredCardIds);
    const filtered = validCards.filter((c) => idSet.has(c.id));
    if (filtered.length > 0) {
      validCards = filtered;
    }
  }

  const minRequired = isStudyMode(mode) ? MIN_CARDS[mode] : 2;

  if (validCards.length < minRequired) {
    return (
      <PageTransition>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <h2 className="text-xl font-semibold" style={{ color: 'var(--color-text)' }}>
            Not enough cards
          </h2>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            This mode requires at least {minRequired} valid card{minRequired !== 1 ? 's' : ''} with
            both a term and definition. Currently there {validCards.length === 1 ? 'is' : 'are'}{' '}
            {validCards.length} valid card{validCards.length !== 1 ? 's' : ''}.
          </p>
          <Button variant="primary" onClick={() => navigate(`/sets/${id}`)}>
            Back to Set
          </Button>
        </div>
      </PageTransition>
    );
  }

  if (!isStudyMode(mode)) {
    return (
      <PageTransition>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <h2 className="text-xl font-semibold" style={{ color: 'var(--color-text)' }}>
            Unknown study mode
          </h2>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            "{mode}" is not a recognized study mode.
          </p>
          <Button variant="primary" onClick={() => navigate(`/sets/${id}`)}>
            Back to Set
          </Button>
        </div>
      </PageTransition>
    );
  }

  const Mode = MODE_COMPONENTS[mode] as unknown as ComponentType<ModeProps>;

  return (
    <PageTransition>
      <Suspense
        fallback={
          <div className="flex items-center justify-center min-h-[60vh]">
            <Spinner size="lg" />
          </div>
        }
      >
        <Mode cards={validCards} setId={id!} />
      </Suspense>
    </PageTransition>
  );
}

export default StudyPage;
