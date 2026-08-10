import { useState, useCallback, useRef, useEffect, useMemo, type ReactNode } from 'react';
import { motion, AnimatePresence, useReducedMotion, type Variants } from 'framer-motion';
import confetti from 'canvas-confetti';
import type { Card } from '@/types';
import { useNavigate } from 'react-router-dom';
import { shuffleArray, normalizeAnswer, fairRepeatCards } from '@/lib/utils';
import { buildEquivalenceGroups } from '@/lib/equivalence';
import { Button } from '@/components/ui/Button';
import StudyContent from '@/components/StudyContent';

interface MemoryCardFlipModeProps {
  cards: Card[];
  setId: string;
  exitUrl?: string;
}

interface MemoryCard {
  id: string;
  pairId: string;
  originalCardId: string;
  type: 'term' | 'definition';
  content: string;
  isFlipped: boolean;
  isMatched: boolean;
}

/** Precomputed sparkle offsets for the matched-pair burst (transform/opacity only). */
const SPARKLES = [
  { x: -26, y: -22 },
  { x: 24, y: -26 },
  { x: 30, y: 18 },
  { x: -28, y: 20 },
  { x: 0, y: -32 },
  { x: 0, y: 30 },
];

type Blob = {
  c: string;
  size: number;
  delay: number;
  top?: string;
  left?: string;
  right?: string;
  bottom?: string;
};

/** Soft aurora blobs behind the whole game — GPU-friendly (transform/opacity only). */
function GameBackground({ reduce }: { reduce: boolean | null }) {
  const blobs: Blob[] = [
    { c: 'var(--color-primary)', size: 460, top: '-12%', left: '-8%', delay: 0 },
    { c: 'var(--color-success)', size: 400, top: '28%', right: '-14%', delay: 1.6 },
    { c: 'var(--color-warning)', size: 340, bottom: '-16%', left: '18%', delay: 3.2 },
  ];
  return (
    <div aria-hidden className="fixed inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
      {blobs.map((b, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            width: b.size,
            height: b.size,
            top: b.top,
            left: b.left,
            right: b.right,
            bottom: b.bottom,
            background: b.c,
            filter: 'blur(90px)',
            opacity: 0.16,
            willChange: 'transform',
          }}
          animate={reduce ? undefined : { x: [0, 40, -24, 0], y: [0, -30, 22, 0], scale: [1, 1.12, 0.94, 1] }}
          transition={reduce ? undefined : { duration: 18 + i * 4, repeat: Infinity, ease: 'easeInOut', delay: b.delay }}
        />
      ))}
    </div>
  );
}

/** Rounded stat chip used in the game header. */
function StatPill({ label, value, accent }: { label: string; value: ReactNode; accent?: string }) {
  return (
    <div
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-xs)' }}
    >
      <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--color-text-tertiary)' }}>
        {label}
      </span>
      <span className="text-sm font-bold tabular-nums" style={{ color: accent ?? 'var(--color-text)' }}>
        {value}
      </span>
    </div>
  );
}

function MemoryCardFlipMode({ cards, setId, exitUrl }: MemoryCardFlipModeProps) {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const exitTo = exitUrl ?? `/sets/${setId}`;

  const [pairCount, setPairCount] = useState(Math.min(6, cards.length));
  const [phase, setPhase] = useState<'setup' | 'playing' | 'results'>('setup');
  const [memoryCards, setMemoryCards] = useState<MemoryCard[]>([]);
  const [moves, setMoves] = useState(0);
  const [matchedPairs, setMatchedPairs] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [mismatchIds, setMismatchIds] = useState<string[]>([]);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lockTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  // Celebratory confetti on completion (reduced-motion aware)
  useEffect(() => {
    if (phase !== 'results' || reduce) return;
    const styles = getComputedStyle(document.documentElement);
    const colors = ['--color-primary', '--color-success', '--color-warning', '--color-primary-hover']
      .map((v) => styles.getPropertyValue(v).trim())
      .filter(Boolean);

    let cancelled = false;
    confetti({ particleCount: 90, spread: 75, startVelocity: 42, origin: { y: 0.6 }, colors, disableForReducedMotion: true });
    const end = Date.now() + 900;
    const frame = () => {
      if (cancelled) return;
      confetti({ particleCount: 4, angle: 60, spread: 55, origin: { x: 0 }, colors, disableForReducedMotion: true });
      confetti({ particleCount: 4, angle: 120, spread: 55, origin: { x: 1 }, colors, disableForReducedMotion: true });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    frame();
    return () => {
      cancelled = true;
    };
  }, [phase, reduce]);

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      if (lockTimeoutRef.current) clearTimeout(lockTimeoutRef.current);
      if (completeTimeoutRef.current) clearTimeout(completeTimeoutRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startGame = useCallback(() => {
    if (lockTimeoutRef.current) clearTimeout(lockTimeoutRef.current);
    if (completeTimeoutRef.current) clearTimeout(completeTimeoutRef.current);

    const selected = fairRepeatCards(cards, pairCount);
    const pairs: MemoryCard[] = [];

    selected.forEach((card, i) => {
      const uid = `${card.id}-${i}`;
      pairs.push({
        id: `t-${uid}`,
        pairId: uid,
        originalCardId: card.id,
        type: 'term',
        content: card.term,
        isFlipped: false,
        isMatched: false,
      });
      pairs.push({
        id: `d-${uid}`,
        pairId: uid,
        originalCardId: card.id,
        type: 'definition',
        content: card.definition,
        isFlipped: false,
        isMatched: false,
      });
    });

    setMemoryCards(shuffleArray(pairs));
    setMoves(0);
    setMatchedPairs(0);
    setStreak(0);
    setBestStreak(0);
    setMismatchIds([]);
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
    const originalCard = cards.find((c) => c.id === termCard.originalCardId);
    if (!originalCard) return false;

    const key = normalizeAnswer(originalCard.term);
    const group = equivalenceGroups.get(key) ?? [originalCard];
    const validDefIds = new Set(group.map((c) => c.id));

    return validDefIds.has(defCard.originalCardId);
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
          // Match found — clear any pending timeout first
          if (lockTimeoutRef.current) clearTimeout(lockTimeoutRef.current);
          lockTimeoutRef.current = setTimeout(() => {
            setMemoryCards((curr) => {
              const settled = curr.map((c) =>
                c.id === newFlipped[0].id || c.id === newFlipped[1].id
                  ? { ...c, isMatched: true }
                  : c,
              );
              // Check if ALL cards are matched (not just a counter)
              if (settled.every((c) => c.isMatched)) {
                if (timerRef.current) clearInterval(timerRef.current);
                if (completeTimeoutRef.current) clearTimeout(completeTimeoutRef.current);
                completeTimeoutRef.current = setTimeout(() => setPhase('results'), 600);
              }
              return settled;
            });
            setMatchedPairs((mp) => mp + 1);
            // Update streak and the running best streak from the functional
            // updater (not from a closed-over `streak`), so the handler never
            // captures a stale value and we never setState-in-effect.
            setStreak((s) => {
              const next = s + 1;
              setBestStreak((b) => Math.max(b, next));
              return next;
            });
            setIsLocked(false);
          }, 600);
        } else {
          // No match — reset streak, flag the pair for shake feedback, then flip back
          setStreak(0);
          setMismatchIds([newFlipped[0].id, newFlipped[1].id]);
          if (lockTimeoutRef.current) clearTimeout(lockTimeoutRef.current);
          lockTimeoutRef.current = setTimeout(() => {
            setMemoryCards((curr) =>
              curr.map((c) =>
                (c.id === newFlipped[0].id || c.id === newFlipped[1].id) && !c.isMatched
                  ? { ...c, isFlipped: false }
                  : c,
              ),
            );
            setMismatchIds([]);
            setIsLocked(false);
          }, 800);
        }
      }

      return updated;
    });
  }, [isLocked, checkMatch]);

  const formatElapsed = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  // ===== Setup screen =====
  if (phase === 'setup') {
    return (
      <>
        <GameBackground reduce={reduce} />
        <div className="max-w-lg mx-auto px-4 py-8 relative" style={{ zIndex: 1 }}>
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
          >
            <div className="text-center mb-6">
              <motion.div
                className="text-4xl mb-2"
                animate={reduce ? undefined : { rotateY: [0, 180, 360] }}
                transition={reduce ? undefined : { duration: 3, repeat: Infinity, ease: 'easeInOut', repeatDelay: 1 }}
                style={{ display: 'inline-block' }}
              >
                🃏
              </motion.div>
              <h2 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>
                Memory Card Flip
              </h2>
              <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                Match every term to its definition
              </p>
            </div>

            <div
              className="p-6 space-y-6"
              style={{
                background: 'var(--color-surface)',
                boxShadow: 'var(--shadow-card)',
                borderRadius: 'var(--radius-xl)',
                border: '1px solid var(--color-border)',
              }}
            >
              <div>
                <label className="block text-sm font-medium mb-3 text-center" style={{ color: 'var(--color-text-secondary)' }}>
                  Number of Pairs
                </label>
                <div className="flex items-center gap-4 justify-center">
                  <motion.button
                    onClick={() => setPairCount((c) => Math.max(2, c - 1))}
                    whileTap={{ scale: 0.92 }}
                    whileHover={{ scale: 1.06 }}
                    className="w-11 h-11 rounded-full text-xl font-bold cursor-pointer flex items-center justify-center"
                    style={{ background: 'var(--color-muted)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                    aria-label="Fewer pairs"
                  >
                    −
                  </motion.button>
                  <div className="w-16 text-center">
                    <AnimatePresence mode="popLayout" initial={false}>
                      <motion.span
                        key={pairCount}
                        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.8 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.8 }}
                        transition={{ duration: 0.18 }}
                        className="text-4xl font-bold inline-block"
                        style={{ color: 'var(--color-primary)' }}
                      >
                        {pairCount}
                      </motion.span>
                    </AnimatePresence>
                  </div>
                  <motion.button
                    onClick={() => setPairCount((c) => c + 1)}
                    whileTap={{ scale: 0.92 }}
                    whileHover={{ scale: 1.06 }}
                    className="w-11 h-11 rounded-full text-xl font-bold cursor-pointer flex items-center justify-center"
                    style={{ background: 'var(--color-muted)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                    aria-label="More pairs"
                  >
                    +
                  </motion.button>
                </div>
                <p className="text-sm text-center mt-3" style={{ color: 'var(--color-text-tertiary)' }}>
                  {pairCount * 2} cards on the board
                </p>
              </div>

              <Button variant="primary" className="w-full" onClick={startGame}>
                Start Game
              </Button>
            </div>
          </motion.div>
        </div>
      </>
    );
  }

  // ===== Results screen =====
  if (phase === 'results') {
    const accuracy = moves > 0 ? Math.round((pairCount / moves) * 100) : 100;
    const emoji = accuracy >= 90 ? '🏆' : accuracy >= 70 ? '⭐' : accuracy >= 50 ? '👍' : '💪';
    const title = accuracy >= 90 ? 'Amazing Memory!' : accuracy >= 70 ? 'Great Job!' : 'Good Effort!';

    const stats: { value: ReactNode; label: string; color: string }[] = [
      { value: moves, label: 'Moves', color: 'var(--color-primary)' },
      { value: formatElapsed(elapsedTime), label: 'Time', color: 'var(--color-success)' },
      { value: pairCount, label: 'Pairs', color: 'var(--color-warning)' },
      { value: `${accuracy}%`, label: 'Accuracy', color: 'var(--color-text)' },
    ];

    return (
      <>
        <GameBackground reduce={reduce} />
        <div className="max-w-2xl mx-auto px-4 py-8 relative" style={{ zIndex: 1 }}>
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            className="p-8 text-center"
            style={{
              background: 'var(--color-surface)',
              boxShadow: 'var(--shadow-modal)',
              borderRadius: 'var(--radius-xl)',
              border: '1px solid var(--color-border)',
            }}
          >
            <motion.div
              className="text-6xl mb-3 inline-block"
              initial={reduce ? { opacity: 0 } : { scale: 0, rotate: -30 }}
              animate={reduce ? { opacity: 1 } : { scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 14, delay: 0.1 }}
            >
              {emoji}
            </motion.div>
            <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--color-text)' }}>
              {title}
            </h2>

            {bestStreak >= 2 && (
              <div
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full mb-6"
                style={{ background: 'var(--color-warning-light)', border: '1px solid var(--color-warning)' }}
              >
                <span>🔥</span>
                <span className="text-sm font-bold" style={{ color: 'var(--color-warning)' }}>
                  Best streak: {bestStreak}
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 mb-6 mt-4">
              {stats.map((s, i) => (
                <motion.div
                  key={s.label}
                  className="p-4 rounded-xl"
                  style={{ background: 'var(--color-muted)', borderRadius: 'var(--radius-lg)' }}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: reduce ? 0 : 0.2 + i * 0.06 }}
                >
                  <div className="text-2xl font-bold tabular-nums" style={{ color: s.color }}>
                    {s.value}
                  </div>
                  <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                    {s.label}
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="flex gap-3 justify-center">
              <Button variant="primary" onClick={() => setPhase('setup')}>
                Play Again
              </Button>
              <Button variant="outline" onClick={() => navigate(exitTo)}>
                Exit
              </Button>
            </div>
          </motion.div>
        </div>
      </>
    );
  }

  // ===== Game board =====
  const totalCards = pairCount * 2;
  const columns = totalCards <= 6 ? 3 : totalCards <= 12 ? 4 : totalCards <= 20 ? 5 : 6;
  const rows = Math.ceil(totalCards / columns);
  const progress = pairCount > 0 ? matchedPairs / pairCount : 0;

  const gridVariants: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: reduce ? 0 : 0.025 } },
  };
  const itemVariants: Variants = reduce
    ? { hidden: { opacity: 0 }, show: { opacity: 1 } }
    : {
        hidden: { opacity: 0, scale: 0.7, y: 12 },
        show: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 420, damping: 26 } },
      };

  return (
    <>
      <GameBackground reduce={reduce} />
      <div
        className="max-w-5xl mx-auto px-4 py-4 flex flex-col relative"
        style={{ height: 'calc(100vh - 80px)', zIndex: 1 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 mb-2 shrink-0">
          <Button variant="ghost" size="sm" onClick={() => navigate(exitTo)}>
            Exit
          </Button>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <AnimatePresence>
              {streak >= 2 && (
                <motion.div
                  key="streak"
                  initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6, y: -4 }}
                  animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
                  transition={reduce ? { duration: 0.15 } : { type: 'spring', stiffness: 500, damping: 22 }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-full"
                  style={{ background: 'var(--color-warning-light)', border: '1px solid var(--color-warning)' }}
                >
                  <span className="text-sm">🔥</span>
                  <span className="text-sm font-bold" style={{ color: 'var(--color-warning)' }}>
                    {streak}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
            <StatPill label="Moves" value={moves} />
            <StatPill label="Time" value={formatElapsed(elapsedTime)} />
            <StatPill label="Pairs" value={`${matchedPairs}/${pairCount}`} accent="var(--color-success)" />
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 rounded-full overflow-hidden mb-3 shrink-0" style={{ background: 'var(--color-muted)' }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: 'linear-gradient(90deg, var(--color-primary), var(--color-success))', transformOrigin: 'left' }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: progress }}
            transition={reduce ? { duration: 0.15 } : { type: 'spring', stiffness: 200, damping: 28 }}
          />
        </div>

        {/* Card grid */}
        <motion.div
          className="grid gap-2 flex-1 min-h-0"
          style={{
            gridTemplateColumns: `repeat(${columns}, 1fr)`,
            gridTemplateRows: `repeat(${rows}, 1fr)`,
          }}
          variants={gridVariants}
          initial="hidden"
          animate="show"
        >
          {memoryCards.map((card) => {
            const clickable = !card.isMatched && !card.isFlipped && !isLocked;
            const isMismatch = mismatchIds.includes(card.id);
            const isTerm = card.type === 'term';
            return (
              <motion.div
                key={card.id}
                variants={itemVariants}
                className="relative select-none min-h-0"
                style={{ cursor: clickable ? 'pointer' : 'default' }}
                role="button"
                tabIndex={card.isMatched ? -1 : 0}
                aria-label={
                  card.isMatched
                    ? 'Matched card'
                    : card.isFlipped
                      ? 'Revealed card'
                      : 'Hidden card, activate to flip'
                }
                onClick={() => handleCardClick(card.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleCardClick(card.id);
                  }
                }}
                whileHover={clickable && !reduce ? { y: -5, scale: 1.04 } : undefined}
                whileTap={clickable ? { scale: 0.95 } : undefined}
              >
                {/* Perspective + matched fade/lift layer */}
                <motion.div
                  className="w-full h-full"
                  style={{ perspective: 900 }}
                  animate={
                    card.isMatched
                      ? { scale: reduce ? 1 : 0.92, opacity: 0.4, y: reduce ? 0 : -2 }
                      : { scale: 1, opacity: 1, y: 0 }
                  }
                  transition={reduce ? { duration: 0.15 } : { type: 'spring', stiffness: 300, damping: 20 }}
                >
                  {/* Flip container */}
                  <motion.div
                    className="relative w-full h-full"
                    style={{ transformStyle: 'preserve-3d' }}
                    animate={{
                      rotateY: card.isFlipped ? 180 : 0,
                      x: isMismatch && !reduce ? [0, -6, 6, -5, 5, -3, 3, 0] : 0,
                    }}
                    transition={{
                      rotateY: { duration: reduce ? 0 : 0.45, ease: [0.4, 0, 0.2, 1] },
                      x: { duration: 0.45, ease: 'easeInOut' },
                    }}
                  >
                    {/* Face down */}
                    <div
                      className="absolute inset-0 flex items-center justify-center overflow-hidden"
                      style={{
                        background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-hover))',
                        backfaceVisibility: 'hidden',
                        WebkitBackfaceVisibility: 'hidden',
                        transform: 'rotateY(0deg)',
                        borderRadius: 'var(--radius-lg)',
                        boxShadow: 'var(--shadow-sm)',
                      }}
                    >
                      <div
                        className="absolute inset-0"
                        style={{ background: 'radial-gradient(circle at 30% 25%, rgba(255,255,255,0.25), transparent 55%)' }}
                      />
                      <span className="text-3xl font-bold relative" style={{ color: 'rgba(255,255,255,0.85)' }}>
                        ?
                      </span>
                    </div>

                    {/* Face up */}
                    <div
                      className="absolute inset-0 flex flex-col items-center justify-center p-2 overflow-hidden"
                      style={{
                        background: 'var(--color-surface)',
                        border: `2px solid ${card.isMatched ? 'var(--color-success)' : isMismatch ? 'var(--color-danger)' : 'var(--color-border)'}`,
                        backfaceVisibility: 'hidden',
                        WebkitBackfaceVisibility: 'hidden',
                        transform: 'rotateY(180deg)',
                        borderRadius: 'var(--radius-lg)',
                      }}
                    >
                      <span
                        className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded shrink-0"
                        style={{
                          background: isTerm ? 'var(--color-primary-light)' : 'var(--color-success-light)',
                          color: isTerm ? 'var(--color-primary)' : 'var(--color-success)',
                        }}
                      >
                        {isTerm ? 'T' : 'D'}
                      </span>
                      <div
                        className="flex-1 flex items-center justify-center w-full overflow-hidden memory-card-content"
                        style={{ color: 'var(--color-text)' }}
                      >
                        <StudyContent html={card.content} className="text-base leading-snug text-center" />
                      </div>

                      {/* Mismatch shimmer sweep */}
                      {isMismatch && !reduce && (
                        <motion.div
                          className="absolute inset-0 pointer-events-none"
                          style={{
                            background:
                              'linear-gradient(105deg, transparent 35%, var(--color-danger-light) 50%, transparent 65%)',
                          }}
                          initial={{ x: '-120%' }}
                          animate={{ x: '120%' }}
                          transition={{ duration: 0.55, ease: 'easeInOut' }}
                        />
                      )}
                    </div>
                  </motion.div>

                  {/* Matched glow ring (opacity only) */}
                  <motion.div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      borderRadius: 'var(--radius-lg)',
                      boxShadow: '0 0 0 2px var(--color-success), 0 0 22px var(--color-success)',
                    }}
                    initial={false}
                    animate={{ opacity: card.isMatched ? 0.7 : 0 }}
                    transition={{ duration: 0.4 }}
                  />
                </motion.div>

                {/* Matched sparkle burst (plays once on match) */}
                {card.isMatched && !reduce && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    {SPARKLES.map((s, i) => (
                      <motion.span
                        key={i}
                        className="absolute rounded-full"
                        style={{ width: 5, height: 5, background: 'var(--color-success)' }}
                        initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
                        animate={{ x: s.x, y: s.y, scale: [0, 1, 0], opacity: [1, 1, 0] }}
                        transition={{ duration: 0.6, ease: 'easeOut' }}
                      />
                    ))}
                  </div>
                )}
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </>
  );
}

export default MemoryCardFlipMode;
