import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import type { StudySet, Card } from '@/types';
import { fetchSharedFolder } from '@/lib/cloudSync';
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

function SharedFolderStudyPage() {
  const { token, setId, mode } = useParams<{ token: string; setId: string; mode: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  // Try to read set from navigation state first (avoids re-fetch)
  const stateSet = (location.state as { set?: StudySet } | null)?.set ?? null;

  const [set, setSet] = useState<StudySet | null>(stateSet);
  const [loading, setLoading] = useState(!stateSet);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<'not_found' | 'network' | null>(null);

  const fetchData = useCallback((options?: { bypassCache?: boolean }) => {
    if (!token || !setId) {
      setError('Invalid share link.');
      setErrorType('not_found');
      setLoading(false);
      return;
    }
    if (!isSupabaseConfigured()) {
      setError('Cloud features are not configured.');
      setErrorType('not_found');
      setLoading(false);
      return;
    }

    setError(null);
    setErrorType(null);
    setLoading(true);

    let cancelled = false;
    fetchSharedFolder(token, options)
      .then((result) => {
        if (cancelled) return;
        if (result) {
          const found = result.sets.find((s) => s.id === setId);
          if (found) {
            setSet(found);
          } else {
            setError('This set was not found in the shared folder.');
            setErrorType('not_found');
          }
        } else {
          setError('Shared folder not found.');
          setErrorType('not_found');
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setError('Failed to load shared folder. Check your connection and try again.');
          setErrorType('network');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token, setId]);

  const handleRefresh = useCallback(() => {
    void fetchData({ bypassCache: true });
  }, [fetchData]);

  useEffect(() => {
    // Already have the set from navigation state
    if (set) return;
    return fetchData();
  }, [set, fetchData]);

  const validCards: Card[] = useMemo(() => {
    if (!set) return [];
    return set.cards.filter((c) => hasTermContent(c) || hasDefinitionContent(c));
  }, [set]);

  const backUrl = `/shared/folder/${token}`;

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
          <p className="mb-4" style={{ color: 'var(--color-text-secondary)' }}>
            {error}
          </p>
          <div className="flex items-center justify-center gap-3">
            <Button variant="primary" icon={<RefreshCw size={16} />} onClick={handleRefresh}>
              Try Again
            </Button>
            <Button variant={errorType === 'network' ? 'outline' : 'primary'} onClick={() => navigate(backUrl)}>
              Back to Folder
            </Button>
          </div>
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
          <Button variant="primary" onClick={() => navigate(backUrl)}>
            Back to Folder
          </Button>
        </div>
      </PageTransition>
    );
  }

  const props = { cards: validCards, setId: set.id };

  const renderMode = () => {
    switch (mode) {
      case 'flashcards':
        return <FlashcardMode {...props} />;
      case 'learn':
        return <LearnMode {...props} />;
      case 'match':
        return <MatchMode {...props} />;
      case 'test':
        return <TestMode {...props} />;
      case 'spinner':
        return <SpinnerMode {...props} />;
      case 'block-builder':
        return <BlockBuilderMode {...props} />;
      case 'memory-card-flip':
        return <MemoryCardFlipMode {...props} />;
      case 'race-to-finish':
        return <RaceToFinishMode {...props} />;
      default:
        return (
          <div className="text-center py-16">
            <p style={{ color: 'var(--color-text-secondary)' }}>Unknown study mode: {mode}</p>
            <Button variant="primary" className="mt-4" onClick={() => navigate(backUrl)}>
              Back to Folder
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

export default SharedFolderStudyPage;
