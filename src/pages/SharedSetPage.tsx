import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { BookOpen, GraduationCap, Puzzle, ClipboardCheck, Gamepad2, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import type { StudySet } from '@/types';
import { fetchSharedSet } from '@/lib/cloudSync';
import { isSupabaseConfigured } from '@/lib/supabase';
import PageTransition from '@/components/layout/PageTransition';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import StudyContent from '@/components/StudyContent';
import { GameBrowserModal } from '@/components/GameBrowserModal';

function SharedSetPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [set, setSet] = useState<StudySet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<'not_found' | 'network' | null>(null);
  const [gameBrowserOpen, setGameBrowserOpen] = useState(false);

  const fetchSet = useCallback(() => {
    if (!token) {
      setError('Invalid share link.');
      setErrorType('not_found');
      setLoading(false);
      return;
    }

    if (!isSupabaseConfigured()) {
      setError('Cloud features are not configured. This share link cannot be loaded.');
      setErrorType('not_found');
      setLoading(false);
      return;
    }

    setError(null);
    setErrorType(null);
    setLoading(true);

    let cancelled = false;
    fetchSharedSet(token).then((result) => {
      if (cancelled) return;
      if (result) {
        setSet(result);
      } else {
        setError('This study set was not found. The share link may have expired or been removed.');
        setErrorType('not_found');
      }
      setLoading(false);
    }).catch(() => {
      if (!cancelled) {
        setError('Failed to load shared set. Check your connection and try again.');
        setErrorType('network');
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    return fetchSet();
  }, [fetchSet]);

  const validCards = useMemo(() => {
    if (!set) return [];
    return set.cards.filter(c => {
      const termText = c.term?.replace(/<[^>]*>/g, '').trim();
      const defText = c.definition?.replace(/<[^>]*>/g, '').trim();
      return (termText && termText.length > 0) || (defText && defText.length > 0);
    });
  }, [set]);

  const studyModes = useMemo(() => [
    { id: 'flashcards', label: 'Flashcards', icon: <BookOpen size={16} />, minCards: 1 },
    { id: 'learn', label: 'Learn', icon: <GraduationCap size={16} />, minCards: 2 },
    { id: 'match', label: 'Match', icon: <Puzzle size={16} />, minCards: 2 },
    { id: 'test', label: 'Test', icon: <ClipboardCheck size={16} />, minCards: 2 },
  ], []);

  // Loading state
  if (loading) {
    return (
      <PageTransition>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
          <Loader2
            size={32}
            className="animate-spin"
            style={{ color: 'var(--color-primary)' }}
          />
          <p style={{ color: 'var(--color-text-secondary)' }}>Loading shared set...</p>
        </div>
      </PageTransition>
    );
  }

  // Error state
  if (error || !set) {
    return (
      <PageTransition>
        <div className="max-w-lg mx-auto px-4 py-16 text-center">
          <AlertCircle
            size={48}
            className="mx-auto mb-4"
            style={{ color: 'var(--color-danger)' }}
          />
          <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--color-text)' }}>
            Unable to load set
          </h1>
          <p className="mb-6" style={{ color: 'var(--color-text-secondary)' }}>
            {error}
          </p>
          <div className="flex items-center justify-center gap-3">
            {errorType === 'network' && (
              <Button variant="primary" icon={<RefreshCw size={16} />} onClick={fetchSet}>
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

  return (
    <PageTransition>
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Shared banner */}
        <div
          className="flex items-center gap-2 px-4 py-2 rounded-lg mb-4 text-sm"
          style={{
            background: 'var(--color-primary-light)',
            color: 'var(--color-primary)',
            border: '1px solid var(--color-primary)',
            borderColor: 'color-mix(in srgb, var(--color-primary) 30%, transparent)',
          }}
        >
          <BookOpen size={16} />
          <span className="font-medium">Shared Set</span>
          <span style={{ color: 'var(--color-text-secondary)' }}>— view only</span>
        </div>

        {/* Title */}
        <h1
          className="text-2xl font-bold mb-1"
          style={{ color: 'var(--color-text)', fontFamily: 'var(--font-sans)' }}
        >
          {set.title}
        </h1>

        {/* Description */}
        {set.description && (
          <p className="text-sm mb-3" style={{ color: 'var(--color-text-secondary)' }}>
            {set.description}
          </p>
        )}

        {/* Tags */}
        {set.tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {set.tags.map((tag) => (
              <Badge key={tag} variant="info">{tag}</Badge>
            ))}
          </div>
        )}

        {/* Card count */}
        <p className="text-sm mb-4" style={{ color: 'var(--color-text-tertiary)' }}>
          {validCards.length} card{validCards.length !== 1 ? 's' : ''}
        </p>

        {/* Study mode buttons */}
        {validCards.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-6">
            {studyModes.map((mode) => (
              <Button
                key={mode.id}
                variant="outline"
                size="sm"
                icon={mode.icon}
                disabled={validCards.length < mode.minCards}
                onClick={() => navigate(`/shared/${token}/study/${mode.id}`)}
              >
                {mode.label}
              </Button>
            ))}
            <Button
              variant="outline"
              size="sm"
              icon={<Gamepad2 size={16} />}
              onClick={() => setGameBrowserOpen(true)}
              disabled={validCards.length < 2}
            >
              Games
            </Button>
          </div>
        )}

        <GameBrowserModal
          isOpen={gameBrowserOpen}
          onClose={() => setGameBrowserOpen(false)}
          setId={set.id}
          cardCount={validCards.length}
          onNavigate={(url) => {
            const gameId = url.split('/study/')[1];
            navigate(`/shared/${token}/study/${gameId}`);
          }}
        />

        {/* Card preview list */}
        <div className="space-y-3">
          <h2
            className="text-lg font-semibold mb-3"
            style={{ color: 'var(--color-text)' }}
          >
            Cards
          </h2>
          {set.cards.map((card, i) => (
            <div
              key={card.id}
              className="flex gap-4 p-4 rounded-xl"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
              }}
            >
              <span
                className="text-sm font-medium shrink-0 w-8 text-center"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                {i + 1}
              </span>
              <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p
                    className="text-xs font-medium mb-1"
                    style={{ color: 'var(--color-text-tertiary)' }}
                  >
                    Term
                  </p>
                  <StudyContent html={card.term} className="text-sm" />
                </div>
                <div>
                  <p
                    className="text-xs font-medium mb-1"
                    style={{ color: 'var(--color-text-tertiary)' }}
                  >
                    Definition
                  </p>
                  <StudyContent html={card.definition} className="text-sm" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageTransition>
  );
}

export default SharedSetPage;
