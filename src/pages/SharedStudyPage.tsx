import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';
import type { StudySet, Card } from '@/types';
import { fetchSharedSet } from '@/lib/cloudSync';
import { isSupabaseConfigured } from '@/lib/supabase';
import { hasTermContent, hasDefinitionContent } from '@/lib/utils';
import PageTransition from '@/components/layout/PageTransition';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import FlashcardMode from '@/components/modes/FlashcardMode';
import LearnMode from '@/components/modes/LearnMode';
import MatchMode from '@/components/modes/MatchMode';
import TestMode from '@/components/modes/TestMode';

const SpinnerMode = lazy(() => import('@/components/modes/games/SpinnerMode'));
const BlockBuilderMode = lazy(() => import('@/components/modes/games/BlockBuilderMode'));
const MemoryCardFlipMode = lazy(() => import('@/components/modes/games/MemoryCardFlipMode'));
const RaceToFinishMode = lazy(() => import('@/components/modes/games/RaceToFinishMode'));

function SharedStudyPage() {
  const { token, mode } = useParams<{ token: string; mode: string }>();
  const navigate = useNavigate();
  const [set, setSet] = useState<StudySet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('Invalid share link.');
      setLoading(false);
      return;
    }
    if (!isSupabaseConfigured()) {
      setError('Cloud features are not configured.');
      setLoading(false);
      return;
    }

    let cancelled = false;
    fetchSharedSet(token).then((result) => {
      if (cancelled) return;
      if (result) {
        setSet(result);
      } else {
        setError('Shared set not found.');
      }
      setLoading(false);
    }).catch(() => {
      if (!cancelled) {
        setError('Failed to load shared set.');
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [token]);

  const validCards: Card[] = useMemo(() => {
    if (!set) return [];
    return set.cards.filter(c => hasTermContent(c) || hasDefinitionContent(c));
  }, [set]);

  if (loading) {
    return (
      <PageTransition>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 size={32} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
        </div>
      </PageTransition>
    );
  }

  if (error || !set) {
    return (
      <PageTransition>
        <div className="max-w-lg mx-auto px-4 py-16 text-center">
          <AlertCircle size={48} className="mx-auto mb-4" style={{ color: 'var(--color-danger)' }} />
          <p className="mb-4" style={{ color: 'var(--color-text-secondary)' }}>{error}</p>
          <Button variant="primary" onClick={() => navigate('/')}>Go to Home</Button>
        </div>
      </PageTransition>
    );
  }

  if (validCards.length === 0) {
    return (
      <PageTransition>
        <div className="max-w-lg mx-auto px-4 py-16 text-center">
          <p className="mb-4" style={{ color: 'var(--color-text-secondary)' }}>
            This set has no valid cards to study.
          </p>
          <Button variant="primary" onClick={() => navigate(`/shared/${token}`)}>
            Back to Set
          </Button>
        </div>
      </PageTransition>
    );
  }

  // Note: setId is passed as set.id but spaced repetition recording
  // will be a no-op for shared sets since there's no local copy.
  const setId = set.id;
  const props = { cards: validCards, setId };

  const renderMode = () => {
    switch (mode) {
      case 'flashcards': return <FlashcardMode {...props} />;
      case 'learn': return <LearnMode {...props} />;
      case 'match': return <MatchMode {...props} />;
      case 'test': return <TestMode {...props} />;
      case 'spinner': return <SpinnerMode {...props} />;
      case 'block-builder': return <BlockBuilderMode {...props} />;
      case 'memory-card-flip': return <MemoryCardFlipMode {...props} />;
      case 'race-to-finish': return <RaceToFinishMode {...props} />;
      default:
        return (
          <div className="text-center py-16">
            <p style={{ color: 'var(--color-text-secondary)' }}>Unknown study mode: {mode}</p>
            <Button variant="primary" className="mt-4" onClick={() => navigate(`/shared/${token}`)}>
              Back to Set
            </Button>
          </div>
        );
    }
  };

  return (
    <PageTransition>
      <Suspense
        fallback={
          <div className="flex items-center justify-center min-h-[50vh]">
            <Spinner size="lg" />
          </div>
        }
      >
        {renderMode()}
      </Suspense>
    </PageTransition>
  );
}

export default SharedStudyPage;
