import { useState, useEffect, useMemo, useCallback, Suspense, type ComponentType } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import type { StudySet, Card } from '@/types';
import { fetchSharedFolder } from '@/lib/cloudSync';
import { isSupabaseConfigured } from '@/lib/supabase';
import { hasTermContent, hasDefinitionContent } from '@/lib/utils';
import PageTransition from '@/components/layout/PageTransition';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { MODE_COMPONENTS, isStudyMode, type ModeProps } from '@/components/modes/registry';

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

  const [reloadNonce, setReloadNonce] = useState(0);

  const handleRefresh = useCallback(() => {
    setReloadNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    // On first render, if we already have the set from navigation state, skip
    // the fetch. A refresh (reloadNonce > 0) always re-fetches with a fresh copy.
    if (stateSet && reloadNonce === 0) return;

    let active = true;

    const load = async () => {
      if (!token || !setId) {
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
        const result = await fetchSharedFolder(
          token,
          reloadNonce > 0 ? { bypassCache: true } : undefined,
        );
        if (!active) return;
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
      } catch {
        if (!active) return;
        setError('Failed to load shared folder. Check your connection and try again.');
        setErrorType('network');
        setLoading(false);
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [token, setId, stateSet, reloadNonce]);

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

  // exitUrl keeps in-session Exit/Escape/Complete on the public shared-folder
  // route instead of ejecting anonymous viewers to a private /sets/:id page (H7).
  const props = { cards: validCards, setId: set.id, exitUrl: backUrl };

  const Mode = isStudyMode(mode)
    ? (MODE_COMPONENTS[mode] as unknown as ComponentType<ModeProps>)
    : null;
  const renderMode = () =>
    Mode ? (
      <Mode {...props} />
    ) : (
      <div className="text-center py-16">
        <p style={{ color: 'var(--color-text-secondary)' }}>Unknown study mode: {mode}</p>
        <Button variant="primary" className="mt-4" onClick={() => navigate(backUrl)}>
          Back to Folder
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

export default SharedFolderStudyPage;
