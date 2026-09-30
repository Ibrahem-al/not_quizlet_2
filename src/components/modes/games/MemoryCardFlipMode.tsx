import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import type { Card } from '@/types';
import { useNavigate } from 'react-router-dom';
import { shuffleArray, normalizeAnswer, fairRepeatCards } from '@/lib/utils';
import { buildEquivalenceGroups } from '@/lib/equivalence';
import { submitScore } from '@/lib/gameRecords';
import { playSound } from '@/lib/gameSounds';
import { Button } from '@/components/ui/Button';
import StudyContent from '@/components/StudyContent';
import { Mascot, type MascotMood } from '@/components/games/Mascot';
import { ScorePopups } from '@/components/games/ScorePopup';
import {
  ChoicePills,
  ComboMeter,
  EscBanner,
  GameTopBar,
  PlayButton,
  ResultsPanel,
  ScoreCounter,
  SetupSection,
} from '@/components/games/GameKit';
import {
  celebrate,
  comboMultiplier,
  formatMultiplier,
  useEscToQuit,
  usePopups,
} from '@/components/games/gameLogic';

/** Hard ceiling on pairs — beyond this the tiles become unreadably small. */
const MAX_PAIRS = 18;
const MATCH_POINTS = 100;
/** Seconds per pair allowed before the time bonus runs out. */
const PAR_SECONDS_PER_PAIR = 6;

// Table art (theme-independent).
const TABLE = {
  felt: '#1d5c47',
  feltLight: '#2a7a5e',
  back: '#22335c',
  backLine: '#e8b64c',
  face: '#fffaf0',
  mascot: '#3fb8a9',
};

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

function formatTime(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function MemoryCardFlipMode({ cards, setId, exitUrl }: MemoryCardFlipModeProps) {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const exitTo = exitUrl ?? `/sets/${setId}`;
  const exit = useCallback(() => navigate(exitTo), [navigate, exitTo]);

  const maxPairs = Math.max(2, Math.min(MAX_PAIRS, cards.length));
  const [pairCount, setPairCount] = useState(Math.min(6, Math.max(2, cards.length)));
  const [phase, setPhase] = useState<'setup' | 'playing' | 'results'>('setup');
  const [memoryCards, setMemoryCards] = useState<MemoryCard[]>([]);
  const [moves, setMoves] = useState(0);
  const [matchedPairs, setMatchedPairs] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [score, setScore] = useState(0);
  const [mismatchIds, setMismatchIds] = useState<string[]>([]);
  const [mood, setMood] = useState<MascotMood>('idle');
  const [result, setResult] = useState<{ timeBonus: number; total: number; best: ReturnType<typeof submitScore> } | null>(null);
  const { popups, push, remove } = usePopups();

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lockTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const equivalenceGroups = useMemo(() => buildEquivalenceGroups(cards), [cards]);
  const [boardEl, setBoardEl] = useState<HTMLDivElement | null>(null);
  const [boardWidth, setBoardWidth] = useState(0);

  useEffect(() => {
    if (!boardEl) return;
    const ro = new ResizeObserver(([entry]) => setBoardWidth(entry.contentRect.width));
    ro.observe(boardEl);
    return () => ro.disconnect();
  }, [boardEl]);

  const escArmed = useEscToQuit(phase !== 'setup', phase === 'playing', exit);

  useEffect(() => {
    if (phase !== 'playing') return;
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase, startTime]);

  useEffect(() => {
    if (phase === 'results') return celebrate(['#e8b64c', '#3fb8a9', '#ffffff', '#e5484d']);
  }, [phase]);

  useEffect(
    () => () => {
      if (lockTimeoutRef.current) clearTimeout(lockTimeoutRef.current);
      if (completeTimeoutRef.current) clearTimeout(completeTimeoutRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    },
    [],
  );

  const startGame = useCallback(() => {
    if (lockTimeoutRef.current) clearTimeout(lockTimeoutRef.current);
    if (completeTimeoutRef.current) clearTimeout(completeTimeoutRef.current);
    const count = Math.min(pairCount, maxPairs);
    if (count !== pairCount) setPairCount(count);

    const pairs: MemoryCard[] = [];
    fairRepeatCards(cards, count).forEach((card, i) => {
      const uid = `${card.id}-${i}`;
      pairs.push(
        { id: `t-${uid}`, pairId: uid, originalCardId: card.id, type: 'term', content: card.term, isFlipped: false, isMatched: false },
        { id: `d-${uid}`, pairId: uid, originalCardId: card.id, type: 'definition', content: card.definition, isFlipped: false, isMatched: false },
      );
    });

    setMemoryCards(shuffleArray(pairs));
    setMoves(0);
    setMatchedPairs(0);
    setStreak(0);
    setBestStreak(0);
    setScore(0);
    setMismatchIds([]);
    setIsLocked(false);
    setMood('idle');
    setResult(null);
    setStartTime(Date.now());
    setElapsed(0);
    setPhase('playing');
    playSound('go');
  }, [cards, pairCount, maxPairs]);

  const checkMatch = useCallback(
    (a: MemoryCard, b: MemoryCard) => {
      if (a.type === b.type) return false;
      if (a.pairId === b.pairId) return true;
      // Equivalence-aware: any card sharing the term's normalized text matches.
      const termCard = a.type === 'term' ? a : b;
      const defCard = a.type === 'definition' ? a : b;
      const original = cards.find((c) => c.id === termCard.originalCardId);
      if (!original) return false;
      const group = equivalenceGroups.get(normalizeAnswer(original.term)) ?? [original];
      return group.some((c) => c.id === defCard.originalCardId);
    },
    [cards, equivalenceGroups],
  );

  const finish = useCallback(
    (finalScore: number, seconds: number) => {
      const timeBonus = Math.max(0, pairCount * PAR_SECONDS_PER_PAIR - seconds) * 10;
      const total = finalScore + timeBonus;
      setResult({ timeBonus, total, best: submitScore('memory', setId, total, String(pairCount)) });
      setPhase('results');
    },
    [pairCount, setId],
  );

  // Resolution is computed outside setState updaters (StrictMode-safe). While
  // two cards resolve, isLocked guarantees memoryCards can't change.
  const handleCardClick = useCallback(
    (cardId: string, index: number) => {
      if (isLocked) return;
      const card = memoryCards.find((c) => c.id === cardId);
      if (!card || card.isMatched || card.isFlipped) return;
      if (memoryCards.filter((c) => c.isFlipped && !c.isMatched).length >= 2) return;

      const updated = memoryCards.map((c) => (c.id === cardId ? { ...c, isFlipped: true } : c));
      setMemoryCards(updated);
      playSound('flip');

      const open = updated.filter((c) => c.isFlipped && !c.isMatched);
      if (open.length !== 2) return;

      setMoves((m) => m + 1);
      setIsLocked(true);
      if (lockTimeoutRef.current) clearTimeout(lockTimeoutRef.current);

      if (checkMatch(open[0], open[1])) {
        const settled = updated.map((c) => (c.id === open[0].id || c.id === open[1].id ? { ...c, isMatched: true } : c));
        const complete = settled.every((c) => c.isMatched);
        const nextStreak = streak + 1;
        const mult = comboMultiplier(nextStreak);
        const points = Math.round(MATCH_POINTS * mult);
        const newScore = score + points;
        const columns = columnsFor(settled.length);
        const col = index % columns;
        const row = Math.floor(index / columns);
        const rows = Math.ceil(settled.length / columns);

        lockTimeoutRef.current = setTimeout(() => {
          setMemoryCards(settled);
          setMatchedPairs((mp) => mp + 1);
          setStreak(nextStreak);
          setBestStreak((b) => Math.max(b, nextStreak));
          setScore(newScore);
          setIsLocked(false);
          setMood(nextStreak >= 3 ? 'celebrate' : 'happy');
          playSound(mult > comboMultiplier(nextStreak - 1) ? 'combo' : 'match');
          push({
            text: mult > 1 ? `+${points} ${formatMultiplier(mult)}` : `+${points}`,
            color: '#e8b64c',
            x: ((col + 0.3) / columns) * 100,
            y: ((row + 0.2) / rows) * 100,
          });
          if (complete) {
            if (timerRef.current) clearInterval(timerRef.current);
            const seconds = Math.floor((Date.now() - startTime) / 1000);
            playSound('win');
            completeTimeoutRef.current = setTimeout(() => finish(newScore, seconds), 700);
          }
        }, 450);
      } else {
        setStreak(0);
        setMismatchIds([open[0].id, open[1].id]);
        setMood('worried');
        playSound('wrong');
        lockTimeoutRef.current = setTimeout(() => {
          setMemoryCards((curr) =>
            curr.map((c) => ((c.id === open[0].id || c.id === open[1].id) && !c.isMatched ? { ...c, isFlipped: false } : c)),
          );
          setMismatchIds([]);
          setIsLocked(false);
          setMood('idle');
        }, 850);
      }
    },
    [isLocked, memoryCards, streak, score, checkMatch, push, startTime, finish],
  );

  // ===== Setup =====
  if (phase === 'setup') {
    const sizes = [2, 4, 6, 8, 10, 12, 15, 18].filter((n) => n <= maxPairs);
    if (!sizes.includes(maxPairs)) sizes.push(maxPairs);
    return (
      <div className="max-w-xl mx-auto px-4 py-8">
        <div className="rounded-3xl overflow-hidden" style={{ boxShadow: '0 20px 50px rgba(0,0,0,0.18)' }}>
          <div
            className="relative flex items-center justify-center gap-4 h-44"
            style={{ background: `radial-gradient(ellipse at 50% 30%, ${TABLE.feltLight}, ${TABLE.felt} 70%)` }}
          >
            {[-10, 4].map((r, i) => (
              <div
                key={i}
                className="mem-back w-20 h-28 rounded-xl"
                style={{ transform: `rotate(${r}deg) translateY(${i * 6}px)`, boxShadow: '0 8px 16px rgba(0,0,0,0.35)' }}
              />
            ))}
            <Mascot mood="happy" color={TABLE.mascot} accessory="tufts" size={92} />
          </div>
          <div className="p-6 flex flex-col gap-6" style={{ background: 'var(--color-surface)' }}>
            <div>
              <h2 className="text-3xl font-extrabold" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
                Memory Match
              </h2>
              <p style={{ color: 'var(--color-text-secondary)' }}>
                Flip two cards to find each term and its definition. Matches in a row multiply your points.
              </p>
            </div>
            <SetupSection label="Board size">
              <ChoicePills
                options={sizes.map((n) => ({ value: n, label: `${n} pairs` }))}
                isSelected={(v) => v === pairCount}
                onToggle={setPairCount}
                accent={TABLE.felt}
              />
            </SetupSection>
            <PlayButton color={TABLE.felt} onClick={startGame}>
              Deal the cards
            </PlayButton>
          </div>
        </div>
      </div>
    );
  }

  // ===== Results =====
  if (phase === 'results' && result) {
    const stars = moves <= pairCount * 1.4 ? 3 : moves <= pairCount * 2 ? 2 : 1;
    return (
      <div className="relative min-h-[calc(100dvh-8rem)] flex items-center px-4 pt-24 pb-10">
        <EscBanner show={escArmed} />
        <ResultsPanel
          mascot={<Mascot mood="celebrate" color={TABLE.mascot} accessory="tufts" size={112} />}
          title={stars === 3 ? 'Sharp memory' : stars === 2 ? 'Board cleared' : 'All pairs found'}
          subtitle={`${pairCount} pairs in ${moves} moves and ${formatTime(elapsed)}.`}
          stars={stars}
          score={result.total}
          best={result.best}
          stats={[
            { label: 'Match points', value: score },
            { label: 'Time bonus', value: `+${result.timeBonus}` },
            { label: 'Best streak', value: bestStreak },
          ]}
          actions={
            <>
              <Button variant="primary" onClick={startGame}>Play again</Button>
              <Button variant="outline" onClick={() => setPhase('setup')}>Change board</Button>
              <Button variant="ghost" onClick={exit}>Exit</Button>
            </>
          }
        />
      </div>
    );
  }

  // ===== Board =====
  const columns = fitColumns(columnsFor(memoryCards.length), boardWidth);
  const rows = Math.ceil(memoryCards.length / columns);
  const gridVariants: Variants = { hidden: {}, show: { transition: { staggerChildren: reduce ? 0 : 0.035 } } };
  const itemVariants: Variants = reduce
    ? { hidden: { opacity: 0 }, show: { opacity: 1 } }
    : {
        hidden: { opacity: 0, y: -40, rotate: -8, scale: 0.8 },
        show: { opacity: 1, y: 0, rotate: 0, scale: 1, transition: { type: 'spring', stiffness: 380, damping: 24 } },
      };

  return (
    <div className="max-w-5xl mx-auto px-4 py-4 flex flex-col" style={{ height: 'calc(100dvh - 8.5rem)', minHeight: '26.25rem' }}>
      <EscBanner show={escArmed} />
      <GameTopBar onExit={exit}>
        <span className="flex gap-3 text-sm font-semibold tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
          <span>{matchedPairs}/{pairCount} pairs</span>
          <span>{moves} moves</span>
          <span>{formatTime(elapsed)}</span>
        </span>
        <ComboMeter streak={streak} />
        <ScoreCounter value={score} />
      </GameTopBar>

      <div
        className="relative mt-3 flex-1 min-h-0 rounded-3xl p-3 sm:p-4"
        style={{
          background: `radial-gradient(ellipse at 50% 20%, ${TABLE.feltLight}, ${TABLE.felt} 75%)`,
          boxShadow: 'inset 0 0 0 6px #6b4226, inset 0 0 0 9px #8a5a36, 0 16px 40px rgba(0,0,0,0.2)',
        }}
      >
        <div className="absolute -top-3 right-4 hidden sm:block" style={{ zIndex: 3 }}>
          <Mascot mood={mood} color={TABLE.mascot} accessory="tufts" size={60} />
        </div>
        <motion.div
          ref={setBoardEl}
          // -m-2/p-2 leaves room for the hover lift, shake and focus ring inside the scroll clip
          className="grid gap-2 sm:gap-2.5 -m-2 p-2 h-[calc(100%+1rem)] overflow-y-auto"
          style={{
            // capped tracks keep small boards from blowing cards up to poster size
            gridTemplateColumns: `repeat(${columns}, minmax(0, 12.5rem))`,
            gridTemplateRows: `repeat(${rows}, minmax(6rem, 15.625rem))`,
            justifyContent: 'center',
            alignContent: 'safe center',
          }}
          variants={gridVariants}
          initial="hidden"
          animate="show"
        >
          {memoryCards.map((card, index) => {
            const clickable = !card.isMatched && !card.isFlipped && !isLocked;
            const isMismatch = mismatchIds.includes(card.id);
            const isTerm = card.type === 'term';
            return (
              <motion.div
                key={card.id}
                variants={itemVariants}
                className="relative select-none min-h-0 rounded-xl focus-visible:outline-3 focus-visible:outline-offset-2"
                style={{ cursor: clickable ? 'pointer' : 'default', outlineColor: TABLE.backLine }}
                role="button"
                tabIndex={card.isMatched ? -1 : 0}
                aria-label={card.isMatched ? 'Matched' : card.isFlipped ? `${isTerm ? 'Term' : 'Definition'}, face up` : 'Face-down card'}
                onClick={() => handleCardClick(card.id, index)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleCardClick(card.id, index);
                  }
                }}
                whileHover={clickable && !reduce ? { y: -4 } : undefined}
                whileTap={clickable ? { scale: 0.95 } : undefined}
              >
                {/* Matched fade lives on this plain wrapper: opacity on the
                    preserve-3d flipper would flatten it and show the card back. */}
                <div
                  className="w-full h-full"
                  style={{ opacity: card.isMatched ? 0.6 : 1, transition: 'opacity 0.4s 0.3s', perspective: 900 }}
                >
                <motion.div
                  className="relative w-full h-full"
                  style={{ transformStyle: 'preserve-3d' }}
                  animate={{
                    rotateY: card.isFlipped ? 180 : 0,
                    x: isMismatch && !reduce ? [0, -6, 6, -5, 5, 0] : 0,
                    scale: card.isMatched && !reduce ? [1, 1.08, 0.94] : 1,
                  }}
                  transition={{
                    rotateY: { duration: reduce ? 0 : 0.42, ease: [0.4, 0, 0.2, 1] },
                    x: { duration: 0.4 },
                    scale: { duration: 0.45 },
                  }}
                >
                  {/* Back */}
                  <div
                    className="mem-back absolute inset-0 rounded-xl"
                    style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', boxShadow: '0 4px 0 rgba(0,0,0,0.3)' }}
                  />
                  {/* Face */}
                  <div
                    className="absolute inset-0 flex flex-col items-center p-2 rounded-xl overflow-hidden"
                    style={{
                      background: TABLE.face,
                      color: '#1f2430',
                      backfaceVisibility: 'hidden',
                      WebkitBackfaceVisibility: 'hidden',
                      transform: 'rotateY(180deg)',
                      boxShadow: card.isMatched
                        ? `0 0 0 3px ${TABLE.backLine}, 0 4px 0 rgba(0,0,0,0.25)`
                        : isMismatch
                          ? '0 0 0 3px #e5484d, 0 4px 0 rgba(0,0,0,0.25)'
                          : '0 4px 0 rgba(0,0,0,0.25)',
                    }}
                  >
                    <span
                      className="self-start text-[0.625rem] font-bold px-1.5 py-0.5 rounded shrink-0"
                      style={{ background: isTerm ? '#dbe9ff' : '#fdebc8', color: isTerm ? '#1d4ed8' : '#92400e' }}
                    >
                      {isTerm ? 'Term' : 'Definition'}
                    </span>
                    <div className="flex-1 flex items-center justify-center w-full overflow-hidden memory-card-content">
                      <StudyContent html={card.content} className="text-sm sm:text-base leading-snug text-center font-medium" />
                    </div>
                  </div>
                </motion.div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
        <ScorePopups popups={popups} onDone={remove} />
      </div>
    </div>
  );
}

/**
 * With a larger text size, drop columns once cards would be narrower than 6.5rem,
 * but never below columns / scale, so the default size keeps its layout.
 */
function fitColumns(columns: number, boardWidth: number): number {
  if (boardWidth <= 0) return columns;
  const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const byWidth = Math.floor(boardWidth / (6.5 * rootPx));
  const byScale = Math.floor(columns / Math.max(1, rootPx / 16));
  return Math.max(1, Math.min(columns, Math.max(byWidth, byScale)));
}

function columnsFor(total: number): number {
  return total <= 6 ? 3 : total <= 12 ? 4 : total <= 20 ? 5 : 6;
}

export default MemoryCardFlipMode;
