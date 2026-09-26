import { useState, useEffect, useMemo, Suspense, type ComponentType } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import type { StudySet, Card } from '@/types';
import { fetchSharedSet } from '@/lib/cloudSync';
import { isSupabaseConfigured } from '@/lib/supabase';
import { hasTermContent, hasDefinitionContent } from '@/lib/utils';
import PageTransition from '@/components/layout/PageTransition';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { MODE_COMPONENTS, isStudyMode, type ModeProps } from '@/components/modes/registry';

function SharedStudyPage() {
  const { token, mode } = useParams<{ token: string; mode: string }>();
  const navigate = useNavigate();
  const [set, setSet] = useState<StudySet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<'not_found' | 'network' | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!token) {
        if (active) {
          setError('Invalid share link.');
          setErrorType('not_found');
          setLoading(false);
        }
        return;
      }
      if (!isSupabaseConfigured()) {
        if (active) {
          setError('Cloud features are not configured.');
          setErrorType('not_found');
          setLoading(false);
        }
        return;
      }

      if (active) {
        setError(null);
        setErrorType(null);
        setLoading(true);
      }

      try {
        const result = await fetchSharedSet(token);
        if (!active) return;
        if (result) {
          setSet(result);
        } else {
          setError('Shared set not found.');
          setErrorType('not_found');
        }
        setLoading(false);
      } catch {
        if (!active) return;
        setError('Failed to load shared set. Check your connection and try again.');
        setErrorType('network');
        setLoading(false);
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [token, reloadNonce]);

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
          <div className="flex items-center justify-center gap-3">
            {errorType === 'network' && (
              <Button
                variant="primary"
                icon={<RefreshCw size={16} />}
                onClick={() => setReloadNonce((n) => n + 1)}
              >
                Try Again
              </Button>
            )}
            <Button variant={errorType === 'network' ? 'outline' : 'primary'} onClick={() => navigate('/')}>
              Go to Home
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
          <Button variant="primary" onClick={() => navigate(`/shared/${token}`)}>
            Back to Set
          </Button>
        </div>
      </PageTransition>
    );
  }

  // Note: setId is passed as set.id but spaced repetition recording
  // will be a no-op for shared sets since there's no local copy.
  // exitUrl keeps in-session Exit/Escape/Complete on the public /shared route
  // instead of dumping anonymous viewers on a private /sets/:id page (H6).
  const setId = set.id;
  const exitUrl = `/shared/${token}`;
  const props = { cards: validCards, setId, exitUrl };

  const Mode = isStudyMode(mode)
    ? (MODE_COMPONENTS[mode] as unknown as ComponentType<ModeProps>)
    : null;
  const renderMode = () =>
    Mode ? (
      <Mode {...props} />
    ) : (
      <div className="text-center py-16">
        <p style={{ color: 'var(--color-text-secondary)' }}>Unknown study mode: {mode}</p>
        <Button variant="primary" className="mt-4" onClick={() => navigate(`/shared/${token}`)}>
          Back to Set
        </Button>
      </div>
    );

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
