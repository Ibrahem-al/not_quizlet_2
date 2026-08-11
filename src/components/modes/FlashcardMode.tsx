import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Shuffle } from 'lucide-react';
import type { Card } from '@/types';
import { useNavigate } from 'react-router-dom';
import { stripHtml, shuffleArray } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import StudyContent from '@/components/StudyContent';

interface FlashcardModeProps {
  cards: Card[];
  setId: string;
  exitUrl?: string;
}

function FlashcardMode({ cards, setId, exitUrl }: FlashcardModeProps) {
  const navigate = useNavigate();
  const exitTo = exitUrl ?? `/sets/${setId}`;

  const [deck, setDeck] = useState<Card[]>(cards);
  const [isShuffled, setIsShuffled] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [revealedWords, setRevealedWords] = useState(0);
  const [isRevealing, setIsRevealing] = useState(false);

  const currentCard = deck[currentIndex];

  const toggleShuffle = useCallback(() => {
    setDeck(isShuffled ? cards : shuffleArray(cards));
    setIsShuffled((prev) => !prev);
    setCurrentIndex(0);
    setIsFlipped(false);
    setRevealedWords(0);
    setIsRevealing(false);
  }, [cards, isShuffled]);

  const getDefinitionWords = useCallback(() => {
    if (!currentCard) return [];
    return stripHtml(currentCard.definition).split(/\s+/).filter(Boolean);
  }, [currentCard]);

  const handleFlip = useCallback(() => {
    setIsFlipped((prev) => !prev);
    setRevealedWords(0);
    setIsRevealing(false);
  }, []);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      setIsFlipped(false);
      setRevealedWords(0);
      setIsRevealing(false);
    }
  }, [currentIndex]);

  const handleNext = useCallback(() => {
    if (currentIndex < deck.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setIsFlipped(false);
      setRevealedWords(0);
      setIsRevealing(false);
    } else {
      setSessionComplete(true);
    }
  }, [currentIndex, deck.length]);

  const handleProgressiveReveal = useCallback(() => {
    const words = getDefinitionWords();

    if (!isFlipped) {
      // Flip first so image-only / empty-definition cards still flip on Space.
      setIsFlipped(true);
      if (words.length > 0) {
        setIsRevealing(true);
        setRevealedWords(1);
      }
      return;
    }

    if (words.length === 0) return;

    if (isRevealing) {
      setRevealedWords((prev) => Math.min(prev + 1, words.length));
    } else {
      setIsRevealing(true);
      setRevealedWords(1);
    }
  }, [getDefinitionWords, isFlipped, isRevealing]);

  // Keyboard shortcuts
  useEffect(() => {
    if (sessionComplete) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          handleProgressiveReveal();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          handlePrev();
          break;
        case 'ArrowRight':
          e.preventDefault();
          handleNext();
          break;
        case 'Escape':
          navigate(exitTo);
          break;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sessionComplete, handleProgressiveReveal, handlePrev, handleNext, navigate, exitTo]);

  const getRevealedContent = useCallback(() => {
    if (!isRevealing) return currentCard?.definition ?? '';

    const words = getDefinitionWords();
    const visible = words.slice(0, revealedWords);
    const hidden = words.slice(revealedWords);

    return (
      visible.join(' ') +
      (hidden.length > 0 ? ' ' + hidden.map(() => '___').join(' ') : '')
    );
  }, [isRevealing, currentCard, getDefinitionWords, revealedWords]);

  if (sessionComplete) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-8 text-center"
          style={{
            background: 'var(--color-surface)',
            boxShadow: 'var(--shadow-card)',
            borderRadius: 'var(--radius-xl)',
          }}
        >
          <h2
            className="text-2xl font-bold mb-4"
            style={{ color: 'var(--color-text)' }}
          >
            Session Complete
          </h2>
          <p className="text-lg mb-6" style={{ color: 'var(--color-text-secondary)' }}>
            You reviewed all {cards.length} cards
          </p>

          <div className="flex gap-3 justify-center">
            <Button
              variant="primary"
              onClick={() => {
                setCurrentIndex(0);
                setIsFlipped(false);
                setRevealedWords(0);
                setIsRevealing(false);
                setSessionComplete(false);
              }}
            >
              Restart
            </Button>
            <Button variant="outline" onClick={() => navigate(exitTo)}>
              Exit
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!currentCard) return null;

  const progressText = `${currentIndex + 1} / ${deck.length}`;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate(exitTo)}>
          Exit
        </Button>
        <span
          className="text-sm font-medium"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {progressText}
        </span>
        <div className="w-16 flex justify-end">
          <button
            onClick={toggleShuffle}
            className="flex items-center justify-center w-9 h-9 rounded-lg cursor-pointer transition-colors"
            style={{
              background: isShuffled ? 'var(--color-primary-light)' : 'transparent',
              border: 'none',
              color: isShuffled ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            }}
            title={isShuffled ? 'Restore original order' : 'Shuffle deck'}
            aria-label={isShuffled ? 'Restore original order' : 'Shuffle deck'}
            aria-pressed={isShuffled}
          >
            <Shuffle size={18} />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div
        className="w-full h-1.5 rounded-full mb-8 overflow-hidden"
        style={{ background: 'var(--color-muted)' }}
      >
        <motion.div
          className="h-full rounded-full"
          style={{ background: 'var(--color-primary)' }}
          animate={{ width: `${((currentIndex + 1) / deck.length) * 100}%` }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        />
      </div>

      {/* Card */}
      <motion.div
        className="relative cursor-pointer select-none"
        style={{
          perspective: 1000,
          minHeight: 320,
        }}
        onClick={handleFlip}
        whileTap={{ scale: 0.98 }}
      >
        <div style={{ transformStyle: 'preserve-3d', position: 'relative', minHeight: 320 }}>
          {/* Front face */}
          <motion.div
            className="absolute inset-0 flex items-center justify-center p-8 rounded-2xl"
            style={{
              background: 'var(--color-surface)',
              boxShadow: 'var(--shadow-card)',
              borderRadius: 'var(--radius-xl)',
              backfaceVisibility: 'hidden',
              minHeight: 320,
            }}
            animate={{ rotateY: isFlipped ? 180 : 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 26 }}
          >
            <div className="text-center w-full">
              <div
                className="text-xs uppercase tracking-wider mb-4 font-medium"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                Term
              </div>
              <StudyContent html={currentCard.term} className="text-2xl font-semibold" />
            </div>
          </motion.div>

          {/* Back face */}
          <motion.div
            className="absolute inset-0 flex items-center justify-center p-8 rounded-2xl"
            style={{
              background: 'var(--color-surface)',
              boxShadow: 'var(--shadow-card)',
              borderRadius: 'var(--radius-xl)',
              backfaceVisibility: 'hidden',
              minHeight: 320,
            }}
            animate={{ rotateY: isFlipped ? 0 : -180 }}
            transition={{ type: 'spring', stiffness: 280, damping: 26 }}
          >
            <div className="text-center w-full">
              <div
                className="text-xs uppercase tracking-wider mb-4 font-medium"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                Definition
              </div>
              {isRevealing ? (
                <p className="text-xl" style={{ color: 'var(--color-text)' }}>
                  {getRevealedContent()}
                </p>
              ) : (
                <StudyContent html={currentCard.definition} className="text-xl" />
              )}
            </div>
          </motion.div>
        </div>
      </motion.div>

      {/* Controls */}
      <div className="mt-8">
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" onClick={handlePrev} disabled={currentIndex === 0}>
            Prev
          </Button>
          <Button variant="ghost" size="sm" onClick={handleFlip}>
            Flip
          </Button>
          <Button variant="primary" size="sm" onClick={handleNext}>
            {currentIndex >= cards.length - 1 ? 'Finish' : 'Next'}
          </Button>
        </div>

        <div
          className="text-center text-xs mt-3"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          Space: reveal words | Arrows: prev/next | Esc: exit
        </div>
      </div>
    </div>
  );
}

export default FlashcardMode;
