import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState, lazy, Suspense } from 'react';
import type { Card, StudyMode } from '@/types';
import { useSetStore } from '@/stores/useSetStore';
import { useFilterStore } from '@/stores/useFilterStore';
import { hasTermContent, hasDefinitionContent } from '@/lib/utils';
import PageTransition from '@/components/layout/PageTransition';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import FlashcardMode from '@/components/modes/FlashcardMode';
import LearnMode from '@/components/modes/LearnMode';
import MatchMode from '@/components/modes/MatchMode';
import TestMode from '@/components/modes/TestMode';

const SpinnerMode = lazy(() => import('@/components/modes/games/SpinnerMode'));
const BlockBuilderMode = lazy(() => import('@/components/modes/games/BlockBuilderMode'));
const MemoryCardFlipMode = lazy(() => import('@/components/modes/games/MemoryCardFlipMode'));
const RaceToFinishMode = lazy(() => import('@/components/modes/games/RaceToFinishMode'));

const MIN_CARDS: Record<string, number> = {
  flashcards: 1,
  learn: 2,
  match: 2,
  test: 2,
  spinner: 2,
  'block-builder': 2,
  'memory-card-flip': 4,
  'race-to-finish': 2,
};

function StudyPage() {
  const { id, mode } = useParams<{ id: string; mode: string }>();
  const navigate = useNavigate();
  const sets = useSetStore((s) => s.sets);
  const loadSets = useSetStore((s) => s.loadSets);
  const filteredCardIds = useFilterStore((s) => s.filteredCardIds);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (sets.length === 0) {
      loadSets().finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [sets.length, loadSets]);

  if (loading) {
    return (
      <PageTransition>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Spinner size="lg" />
        </div>
      </PageTransition>
    );
  }

  const studySet = sets.find((s) => s.id === id);

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

  // Apply active card filters
  if (filteredCardIds) {
    const idSet = new Set(filteredCardIds);
    validCards = validCards.filter((c) => idSet.has(c.id));
  }

  const studyMode = mode as StudyMode;
  const minRequired = MIN_CARDS[studyMode] ?? 2;

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

  function renderMode() {
    const props = { cards: validCards, setId: id! };

    switch (studyMode) {
      case 'flashcards':
        return <FlashcardMode {...props} />;
      case 'learn':
        return <LearnMode {...props} />;
      case 'match':
        return <MatchMode {...props} />;
      case 'test':
        return <TestMode {...props} />;
      case 'spinner':
        return (
          <Suspense fallback={<Spinner size="lg" />}>
            <SpinnerMode {...props} />
          </Suspense>
        );
      case 'block-builder':
        return (
          <Suspense fallback={<Spinner size="lg" />}>
            <BlockBuilderMode {...props} />
          </Suspense>
        );
      case 'memory-card-flip':
        return (
          <Suspense fallback={<Spinner size="lg" />}>
            <MemoryCardFlipMode {...props} />
          </Suspense>
        );
      case 'race-to-finish':
        return (
          <Suspense fallback={<Spinner size="lg" />}>
            <RaceToFinishMode {...props} />
          </Suspense>
        );
      default:
        return (
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
        );
    }
  }

  return <PageTransition>{renderMode()}</PageTransition>;
}

export default StudyPage;
