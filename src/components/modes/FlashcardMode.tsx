import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import type { Card } from '@/types';
import { useNavigate } from 'react-router-dom';
import { recordReview } from '@/lib/spaced-repetition';
import { useSetStore } from '@/stores/useSetStore';
import { stripHtml } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import StudyContent from '@/components/StudyContent';

interface FlashcardModeProps {
  cards: Card[];
  setId: string;
}

interface CardResult {
  card: Card;
  quality: number;
}

function FlashcardMode({ cards, setId }: FlashcardModeProps) {
  const navigate = useNavigate();
  const updateSet = useSetStore((s) => s.updateSet);
  const sets = useSetStore((s) => s.sets);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [results, setResults] = useState<CardResult[]>([]);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [revealedWords, setRevealedWords] = useState(0);
  const [isRevealing, setIsRevealing] = useState(false);
  const exitConfirmRef = useRef(false);

  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-15, 15]);
  const swipeOpacity = useTransform(x, [-200, -80, 0, 80, 200], [1, 1, 0, 1, 1]);
  const swipeLabelX = useTransform(x, [-200, 0, 200], [1, 0, 1]);

  const currentCard = cards[currentIndex];

  const getDefinitionWords = useCallback(() => {
    if (!currentCard) return [];
    return stripHtml(currentCard.definition).split(/\s+/).filter(Boolean);
  }, [currentCard]);

  const recordAndAdvance = useCallback(
    (quality: number) => {
      if (!currentCard) return;

      setResults((prev) => [...prev, { card: currentCard, quality }]);

      // Fire-and-forget spaced repetition update
      const studySet = sets.find((s) => s.id === setId);
      if (studySet) {
        const updatedCard = recordReview(currentCard, quality, 'flashcards');
        const updatedCards = studySet.cards.map((c) =>
          c.id === updatedCard.id ? updatedCard : c,
        );
        updateSet({ ...studySet, cards: updatedCards, updatedAt: Date.now() });
      }

      // Advance
      if (currentIndex + 1 >= cards.length) {
        setSessionComplete(true);
      } else {
        setCurrentIndex((prev) => prev + 1);
        setIsFlipped(false);
        setRevealedWords(0);
        setIsRevealing(false);
      }
    },
    [currentCard, currentIndex, cards.length, sets, setId, updateSet],
  );

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
    if (currentIndex < cards.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setIsFlipped(false);
      setRevealedWords(0);
      setIsRevealing(false);
    }
  }, [currentIndex, cards.length]);

  const handleProgressiveReveal = useCallback(() => {
    const words = getDefinitionWords();
    if (words.length === 0) return;

    if (!isFlipped) {
      setIsFlipped(true);
      setIsRevealing(true);
      setRevealedWords(1);
    } else if (isRevealing) {
      setRevealedWords((prev) => Math.min(prev + 1, words.length));
    } else {
      setIsRevealing(true);
      setRevealedWords(1);
    }
  }, [getDefinitionWords, isFlipped, isRevealing]);

  const handleExit = useCallback(() => {
    if (exitConfirmRef.current) {
      navigate(`/sets/${setId}`);
      return;
    }
    exitConfirmRef.current = true;
    setTimeout(() => {
      exitConfirmRef.current = false;
    }, 2000);
  }, [navigate, setId]);

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
        case '1':
          recordAndAdvance(2);
          break;
        case '2':
          recordAndAdvance(3);
          break;
        case '3':
          recordAndAdvance(5);
          break;
        case 'Escape':
          handleExit();
          break;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sessionComplete, handleProgressiveReveal, handlePrev, handleNext, recordAndAdvance, handleExit]);

  const handleDragEnd = useCallback(
    (_: unknown, info: { offset: { x: number; y: number } }) => {
      const { x: offsetX, y: offsetY } = info.offset;

      if (Math.abs(offsetY) > 100 && Math.abs(offsetY) > Math.abs(offsetX)) {
        // Swipe down: skip
        handleNext();
      } else if (offsetX > 100) {
        // Swipe right: know it
        recordAndAdvance(5);
      } else if (offsetX < -100) {
        // Swipe left: study again
        recordAndAdvance(2);
      }
    },
    [handleNext, recordAndAdvance],
  );

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
    const knownCount = results.filter((r) => r.quality >= 4).length;
    const learningCount = results.filter((r) => r.quality === 3).length;
    const againCount = results.filter((r) => r.quality < 3).length;

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
            className="text-2xl font-bold mb-6"
            style={{ color: 'var(--color-text)' }}
          >
            Session Complete
          </h2>

          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="p-4 rounded-xl" style={{ background: 'var(--color-success-light)' }}>
              <div className="text-2xl font-bold" style={{ color: 'var(--color-success)' }}>
                {knownCount}
              </div>
              <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                Know it
              </div>
            </div>
            <div className="p-4 rounded-xl" style={{ background: 'var(--color-warning-light)' }}>
              <div className="text-2xl font-bold" style={{ color: 'var(--color-warning)' }}>
                {learningCount}
              </div>
              <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                Learning
              </div>
            </div>
            <div className="p-4 rounded-xl" style={{ background: 'var(--color-danger-light)' }}>
              <div className="text-2xl font-bold" style={{ color: 'var(--color-danger)' }}>
                {againCount}
              </div>
              <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                Study again
              </div>
            </div>
          </div>

          <div className="flex gap-3 justify-center">
            <Button
              variant="primary"
              onClick={() => {
                setCurrentIndex(0);
                setIsFlipped(false);
                setRevealedWords(0);
                setIsRevealing(false);
                setResults([]);
                setSessionComplete(false);
              }}
            >
              Restart
            </Button>
            <Button variant="outline" onClick={() => navigate(`/sets/${setId}`)}>
              Exit
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!currentCard) return null;

  const progressText = `${currentIndex + 1} / ${cards.length}`;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Button variant="ghost" size="sm" onClick={handleExit}>
          {exitConfirmRef.current ? 'Press again to exit' : 'Exit'}
        </Button>
        <span
          className="text-sm font-medium"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {progressText}
        </span>
        <div className="w-16" />
      </div>

      {/* Progress bar */}
      <div
        className="w-full h-1.5 rounded-full mb-8 overflow-hidden"
        style={{ background: 'var(--color-muted)' }}
      >
        <motion.div
          className="h-full rounded-full"
          style={{ background: 'var(--color-primary)' }}
          animate={{ width: `${((currentIndex + 1) / cards.length) * 100}%` }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        />
      </div>

      {/* Card */}
      <motion.div
        className="relative cursor-pointer select-none"
        style={{
          perspective: 1000,
          x,
          rotate,
          minHeight: 320,
        }}
        drag="x"
        dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
        dragElastic={0.8}
        onDragEnd={handleDragEnd}
        onClick={handleFlip}
        whileTap={{ scale: 0.98 }}
      >
        {/* Swipe indicators */}
        <motion.div
          className="absolute top-4 left-4 z-10 px-3 py-1 rounded-lg font-bold text-sm"
          style={{
            background: 'var(--color-danger)',
            color: '#ffffff',
            opacity: useTransform(x, [-200, -60, 0], [1, 0.6, 0]),
          }}
        >
          Study Again
        </motion.div>
        <motion.div
          className="absolute top-4 right-4 z-10 px-3 py-1 rounded-lg font-bold text-sm"
          style={{
            background: 'var(--color-success)',
            color: '#ffffff',
            opacity: useTransform(x, [0, 60, 200], [0, 0.6, 1]),
          }}
        >
          Know It
        </motion.div>

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
              <StudyContent html={currentCard.term} className="text-xl font-semibold" />
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
                <p className="text-lg" style={{ color: 'var(--color-text)' }}>
                  {getRevealedContent()}
                </p>
              ) : (
                <StudyContent html={currentCard.definition} className="text-lg" />
              )}
            </div>
          </motion.div>
        </div>
      </motion.div>

      {/* Controls */}
      <div className="mt-8 space-y-4">
        {/* Navigation */}
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" onClick={handlePrev} disabled={currentIndex === 0}>
            Prev
          </Button>
          <Button variant="ghost" size="sm" onClick={handleFlip}>
            Flip
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleNext}
            disabled={currentIndex >= cards.length - 1}
          >
            Next
          </Button>
        </div>

        {/* Rating buttons */}
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => recordAndAdvance(2)}
            className="border-red-400 text-red-500"
          >
            1 - Again
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => recordAndAdvance(3)}
            className="border-yellow-400 text-yellow-500"
          >
            2 - Hard
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => recordAndAdvance(5)}
            className="border-green-400 text-green-500"
          >
            3 - Easy
          </Button>
        </div>

        {/* Keyboard hints */}
        <div
          className="text-center text-xs"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          Space: reveal words | Arrows: prev/next | 1/2/3: rate | Esc: exit
        </div>
      </div>
    </div>
  );
}

export default FlashcardMode;
