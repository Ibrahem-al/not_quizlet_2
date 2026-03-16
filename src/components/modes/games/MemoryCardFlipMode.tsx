import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Card } from '@/types';
import { useNavigate } from 'react-router-dom';
import { shuffleArray, stripHtml, normalizeAnswer, cn } from '@/lib/utils';
import { buildEquivalenceGroups } from '@/lib/equivalence';
import { Button } from '@/components/ui/Button';
import StudyContent from '@/components/StudyContent';

interface MemoryCardFlipModeProps {
  cards: Card[];
  setId: string;
}

interface MemoryCard {
  id: string;
  pairId: string;
  type: 'term' | 'definition';
  content: string;
  isFlipped: boolean;
  isMatched: boolean;
}

function MemoryCardFlipMode({ cards, setId }: MemoryCardFlipModeProps) {
  const navigate = useNavigate();

  const maxPairs = Math.min(12, cards.length);
  const [pairCount, setPairCount] = useState(Math.min(6, maxPairs));
  const [phase, setPhase] = useState<'setup' | 'playing' | 'results'>('setup');
  const [memoryCards, setMemoryCards] = useState<MemoryCard[]>([]);
  const [flippedIds, setFlippedIds] = useState<string[]>([]);
  const [moves, setMoves] = useState(0);
  const [matchedPairs, setMatchedPairs] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isLocked, setIsLocked] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lockTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const equivalenceGroups = useMemo(() => buildEquivalenceGroups(cards), [cards]);

  // Timer
  useEffect(() => {
    if (phase === 'playing') {
      timerRef.current = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase, startTime]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (lockTimeoutRef.current) clearTimeout(lockTimeoutRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startGame = useCallback(() => {
    const selected = shuffleArray(cards).slice(0, pairCount);
    const pairs: MemoryCard[] = [];

    selected.forEach((card) => {
      pairs.push({
        id: `t-${card.id}`,
        pairId: card.id,
        type: 'term',
        content: card.term,
        isFlipped: false,
        isMatched: false,
      });
      pairs.push({
        id: `d-${card.id}`,
        pairId: card.id,
        type: 'definition',
        content: card.definition,
        isFlipped: false,
        isMatched: false,
      });
    });

    setMemoryCards(shuffleArray(pairs));
    setFlippedIds([]);
    setMoves(0);
    setMatchedPairs(0);
    setIsLocked(false);
    setStartTime(Date.now());
    setElapsedTime(0);
    setPhase('playing');
  }, [cards, pairCount]);

  const checkMatch = useCallback((id1: string, id2: string, currentCards: MemoryCard[]) => {
    const card1 = currentCards.find((c) => c.id === id1);
    const card2 = currentCards.find((c) => c.id === id2);
    if (!card1 || !card2) return false;

    // Must be different types (term + definition)
    if (card1.type === card2.type) return false;

    // Same pair ID is a direct match
    if (card1.pairId === card2.pairId) return true;

    // Equivalence-aware matching: check if normalized content matches
    const termCard = card1.type === 'term' ? card1 : card2;
    const defCard = card1.type === 'definition' ? card1 : card2;

    // Find the original card for the term card
    const originalCard = cards.find((c) => c.id === termCard.pairId);
    if (!originalCard) return false;

    const key = normalizeAnswer(originalCard.term);
    const group = equivalenceGroups.get(key) ?? [originalCard];
    const validDefIds = new Set(group.map((c) => c.id));

    return validDefIds.has(defCard.pairId);
  }, [cards, equivalenceGroups]);

  const handleCardClick = useCallback((cardId: string) => {
    if (isLocked) return;

    setMemoryCards((prev) => {
      const card = prev.find((c) => c.id === cardId);
      if (!card || card.isMatched || card.isFlipped) return prev;

      const currentFlipped = prev.filter((c) => c.isFlipped && !c.isMatched);
      if (currentFlipped.length >= 2) return prev;

      const updated = prev.map((c) =>
        c.id === cardId ? { ...c, isFlipped: true } : c,
      );

      const newFlipped = updated.filter((c) => c.isFlipped && !c.isMatched);

      if (newFlipped.length === 2) {
        setMoves((m) => m + 1);
        setIsLocked(true);

        const isMatch = checkMatch(newFlipped[0].id, newFlipped[1].id, updated);

        if (isMatch) {
          // Match found
          lockTimeoutRef.current = setTimeout(() => {
            setMemoryCards((curr) => {
              const updated = curr.map((c) =>
                c.id === newFlipped[0].id || c.id === newFlipped[1].id
                  ? { ...c, isMatched: true }
                  : c,
              );
              // Check if ALL cards are matched (not just a counter)
              if (updated.every((c) => c.isMatched)) {
                if (timerRef.current) clearInterval(timerRef.current);
                setTimeout(() => setPhase('results'), 600);
              }
              return updated;
            });
            setMatchedPairs((mp) => mp + 1);
            setIsLocked(false);
          }, 600);
        } else {
          // No match, flip back
          lockTimeoutRef.current = setTimeout(() => {
            setMemoryCards((curr) =>
              curr.map((c) =>
                (c.id === newFlipped[0].id || c.id === newFlipped[1].id) && !c.isMatched
                  ? { ...c, isFlipped: false }
                  : c,
              ),
            );
            setIsLocked(false);
          }, 800);
        }
      }

      return updated;
    });
  }, [isLocked, checkMatch, pairCount]);

  const formatElapsed = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  // Setup screen
  if (phase === 'setup') {
    return (
      <div className="max-w-lg mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold mb-6 text-center" style={{ color: 'var(--color-text)' }}>
          Memory Card Flip
        </h2>

        <div
          className="rounded-2xl p-6 space-y-6"
          style={{
            background: 'var(--color-surface)',
            boxShadow: 'var(--shadow-card)',
            borderRadius: 'var(--radius-xl)',
          }}
        >
          <div>
            <label className="block text-sm font-medium mb-3" style={{ color: 'var(--color-text-secondary)' }}>
              Number of Pairs
            </label>
            <div className="flex items-center gap-4 justify-center">
              <button
                onClick={() => setPairCount((c) => Math.max(2, c - 1))}
                className="w-10 h-10 rounded-lg text-xl font-bold cursor-pointer"
                style={{
                  background: 'var(--color-muted)',
                  color: 'var(--color-text)',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                -
              </button>
              <span className="text-3xl font-bold w-12 text-center" style={{ color: 'var(--color-primary)' }}>
                {pairCount}
              </span>
              <button
                onClick={() => setPairCount((c) => Math.min(maxPairs, c + 1))}
                className="w-10 h-10 rounded-lg text-xl font-bold cursor-pointer"
                style={{
                  background: 'var(--color-muted)',
                  color: 'var(--color-text)',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                +
              </button>
            </div>
            <p className="text-sm text-center mt-2" style={{ color: 'var(--color-text-tertiary)' }}>
              {pairCount * 2} cards total
            </p>
          </div>

          <Button variant="primary" className="w-full" onClick={startGame}>
            Start Game
          </Button>
        </div>
      </div>
    );
  }

  // Results screen
  if (phase === 'results') {
    const perfectMoves = pairCount;
    const accuracy = moves > 0 ? Math.round((pairCount / moves) * 100) : 100;
    const emoji = accuracy >= 90 ? '🏆' : accuracy >= 70 ? '⭐' : accuracy >= 50 ? '👍' : '💪';

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
          {/* Confetti effect */}
          <div className="relative">
            {Array.from({ length: 20 }).map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-2 h-2 rounded-full"
                style={{
                  background: `hsl(${i * 18}, 80%, 60%)`,
                  left: `${10 + Math.random() * 80}%`,
                  top: -20,
                }}
                initial={{ y: -20, opacity: 1, scale: 1 }}
                animate={{
                  y: [0, -80 - Math.random() * 100, 200],
                  x: [(Math.random() - 0.5) * 100, (Math.random() - 0.5) * 200],
                  opacity: [1, 1, 0],
                  scale: [1, 1.2, 0.5],
                }}
                transition={{ duration: 2 + Math.random(), delay: Math.random() * 0.5, ease: 'easeOut' }}
              />
            ))}
          </div>

          <div className="text-5xl mb-4">{emoji}</div>
          <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--color-text)' }}>
            {accuracy >= 90 ? 'Amazing Memory!' : accuracy >= 70 ? 'Great Job!' : 'Good Effort!'}
          </h2>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="p-4 rounded-xl" style={{ background: 'var(--color-muted)' }}>
              <div className="text-2xl font-bold" style={{ color: 'var(--color-primary)' }}>{moves}</div>
              <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Moves</div>
            </div>
            <div className="p-4 rounded-xl" style={{ background: 'var(--color-muted)' }}>
              <div className="text-2xl font-bold" style={{ color: 'var(--color-success)' }}>{formatElapsed(elapsedTime)}</div>
              <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Time</div>
            </div>
            <div className="p-4 rounded-xl" style={{ background: 'var(--color-muted)' }}>
              <div className="text-2xl font-bold" style={{ color: 'var(--color-warning)' }}>{pairCount}</div>
              <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Pairs</div>
            </div>
            <div className="p-4 rounded-xl" style={{ background: 'var(--color-muted)' }}>
              <div className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>{accuracy}%</div>
              <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Accuracy</div>
            </div>
          </div>

          <div className="flex gap-3 justify-center">
            <Button variant="primary" onClick={() => { setPhase('setup'); }}>
              Play Again
            </Button>
            <Button variant="outline" onClick={() => navigate(`/sets/${setId}`)}>
              Exit
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  // Game grid — pick columns so rows fit on screen
  const totalCards = pairCount * 2;
  const columns = totalCards <= 6 ? 3 : totalCards <= 12 ? 4 : totalCards <= 20 ? 5 : 6;
  const rows = Math.ceil(totalCards / columns);

  return (
    <div className="max-w-5xl mx-auto px-4 py-4 flex flex-col" style={{ height: 'calc(100vh - 80px)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/sets/${setId}`)}>
          Exit
        </Button>
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            Moves: {moves}
          </span>
          <span className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            Time: {formatElapsed(elapsedTime)}
          </span>
          <span className="text-sm font-medium" style={{ color: 'var(--color-success)' }}>
            {matchedPairs}/{pairCount}
          </span>
        </div>
        <div className="w-12" />
      </div>

      {/* Card grid */}
      <div
        className="grid gap-2 flex-1 min-h-0"
        style={{
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
        }}
      >
        {memoryCards.map((card) => (
          <motion.div
            key={card.id}
            className="relative cursor-pointer select-none min-h-0"
            style={{
              perspective: 800,
            }}
            onClick={() => handleCardClick(card.id)}
            whileTap={card.isMatched || card.isFlipped ? undefined : { scale: 0.95 }}
          >
            {/* Matched fade out */}
            <motion.div
              className="w-full h-full"
              style={{ transformStyle: 'preserve-3d' }}
              animate={card.isMatched ? { opacity: 0.3, scale: 0.9 } : { opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
            >
              {/* Face down */}
              <motion.div
                className="absolute inset-0 flex items-center justify-center rounded-xl"
                style={{
                  background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                  backfaceVisibility: 'hidden',
                  borderRadius: 'var(--radius-lg)',
                }}
                animate={{ rotateY: card.isFlipped ? 180 : 0 }}
                transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
              >
                <span className="text-3xl font-bold text-white/80">?</span>
              </motion.div>

              {/* Face up */}
              <motion.div
                className="absolute inset-0 flex flex-col items-center justify-center p-2 rounded-xl overflow-hidden"
                style={{
                  background: 'var(--color-surface)',
                  border: '2px solid var(--color-border)',
                  backfaceVisibility: 'hidden',
                  borderRadius: 'var(--radius-lg)',
                }}
                animate={{ rotateY: card.isFlipped ? 0 : -180 }}
                transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
              >
                <span
                  className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded shrink-0"
                  style={{
                    background: card.type === 'term' ? 'var(--color-primary-light)' : 'var(--color-success-light)',
                    color: card.type === 'term' ? 'var(--color-primary)' : 'var(--color-success)',
                  }}
                >
                  {card.type === 'term' ? 'T' : 'D'}
                </span>
                <div className="flex-1 flex items-center justify-center w-full overflow-hidden memory-card-content" style={{ color: 'var(--color-text)' }}>
                  <StudyContent html={card.content} className="text-base leading-snug text-center" />
                </div>
              </motion.div>
            </motion.div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export default MemoryCardFlipMode;
