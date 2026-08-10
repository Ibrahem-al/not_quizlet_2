import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion, type Variants } from 'framer-motion';
import confetti from 'canvas-confetti';
import type { Card, QuestionType, AnswerDirection } from '@/types';
import { useNavigate } from 'react-router-dom';
import { shuffleArray, stripHtml, normalizeAnswer, cn } from '@/lib/utils';
import {
  buildEquivalenceGroups,
  getEquivalentAnswers,
  getWrongOptionPool,
  getWrongTermPool,
  gradeWrittenAnswer,
} from '@/lib/equivalence';
import { Button } from '@/components/ui/Button';
import StudyContent from '@/components/StudyContent';

interface RaceToFinishModeProps {
  cards: Card[];
  setId: string;
  exitUrl?: string;
}

interface RaceConfig {
  playerCount: number;
  pathLength: number;
  direction: AnswerDirection;
  questionTypes: QuestionType[];
}

interface Player {
  id: number;
  emoji: string;
  color: string;
  position: number;
  correctCount: number;
  totalCount: number;
}

interface RaceQuestion {
  card: Card;
  type: QuestionType;
  promptHtml: string;
  correctAnswers: string[];
  options?: string[];
  tfPair?: { term: string; definition: string; isCorrect: boolean };
}

const PLAYER_EMOJIS = ['🚀', '🔥', '🌿', '⚡'];
const PLAYER_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b'];

// Confetti celebration colors (canvas particles — fixed hues are intentional).
const CONFETTI_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#ffffff'];

// Decorative, GPU-friendly animations. All continuous motion is disabled under
// prefers-reduced-motion via the media query at the bottom.
const RACE_STYLES = `
@keyframes rtf-aurora-a {
  0%   { transform: translate3d(0,0,0) scale(1); }
  50%  { transform: translate3d(4%, -3%, 0) scale(1.15); }
  100% { transform: translate3d(0,0,0) scale(1); }
}
@keyframes rtf-aurora-b {
  0%   { transform: translate3d(0,0,0) scale(1.1); }
  50%  { transform: translate3d(-5%, 4%, 0) scale(1); }
  100% { transform: translate3d(0,0,0) scale(1.1); }
}
@keyframes rtf-bob {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-2px); }
}
@keyframes rtf-dash {
  to { stroke-dashoffset: -48; }
}
@keyframes rtf-speed {
  0%   { transform: translateX(20%); opacity: 0; }
  25%  { opacity: 0.95; }
  100% { transform: translateX(-160%); opacity: 0; }
}
.rtf-aurora-a { animation: rtf-aurora-a 15s ease-in-out infinite; }
.rtf-aurora-b { animation: rtf-aurora-b 19s ease-in-out infinite; }
.rtf-active-racer { animation: rtf-bob 0.9s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
.rtf-lane-dash { animation: rtf-dash 1.1s linear infinite; }
.rtf-speed-line { animation: rtf-speed 0.65s ease-out forwards; }
.rtf-focusable:focus-visible { outline: none; box-shadow: var(--shadow-focus); }
@media (prefers-reduced-motion: reduce) {
  .rtf-aurora-a, .rtf-aurora-b, .rtf-active-racer, .rtf-lane-dash, .rtf-speed-line { animation: none !important; }
}
`;

function RaceBackground({ reduce }: { reduce: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <style>{RACE_STYLES}</style>
      <div
        className={cn('absolute rounded-full', !reduce && 'rtf-aurora-a')}
        style={{
          top: '-18%',
          left: '-12%',
          width: '58vw',
          height: '58vw',
          background: 'radial-gradient(circle, var(--color-primary), transparent 70%)',
          opacity: 0.16,
          filter: 'blur(64px)',
        }}
      />
      <div
        className={cn('absolute rounded-full', !reduce && 'rtf-aurora-b')}
        style={{
          bottom: '-22%',
          right: '-12%',
          width: '52vw',
          height: '52vw',
          background: 'radial-gradient(circle, var(--color-warning), transparent 70%)',
          opacity: 0.12,
          filter: 'blur(64px)',
        }}
      />
    </div>
  );
}

function buildRaceQuestion(
  card: Card,
  cards: Card[],
  groups: Map<string, Card[]>,
  type: QuestionType,
  direction: AnswerDirection,
  questionIndex: number,
): RaceQuestion {
  const isReverse =
    direction === 'def-to-term' ||
    (direction === 'both' && questionIndex % 2 === 1);

  const promptHtml = isReverse ? card.definition : card.term;
  const correctAnswers = isReverse
    ? [card.term]
    : getEquivalentAnswers(card, 'definition', groups);

  if (type === 'multiple-choice') {
    const wrongPool = isReverse
      ? getWrongTermPool(card, cards, groups)
      : getWrongOptionPool(card, cards, groups);
    const wrongs = shuffleArray(wrongPool).slice(0, 3);
    if (wrongs.length < 1) {
      return { card, type: 'written', promptHtml, correctAnswers };
    }
    const correctDef = isReverse ? card.term : card.definition;
    const options = shuffleArray([correctDef, ...wrongs]);
    return { card, type: 'multiple-choice', promptHtml, correctAnswers, options };
  }

  if (type === 'true-false') {
    const isCorrect = Math.random() > 0.5;
    let shownDef = isReverse ? card.term : card.definition;
    if (!isCorrect) {
      const wrongPool = isReverse
        ? getWrongTermPool(card, cards, groups)
        : getWrongOptionPool(card, cards, groups);
      if (wrongPool.length > 0) {
        shownDef = shuffleArray(wrongPool)[0];
      }
    }
    return {
      card,
      type: 'true-false',
      promptHtml,
      correctAnswers,
      tfPair: {
        term: isReverse ? card.definition : card.term,
        definition: shownDef,
        isCorrect: isCorrect || correctAnswers.some((a) => normalizeAnswer(a) === normalizeAnswer(shownDef)),
      },
    };
  }

  return { card, type: 'written', promptHtml, correctAnswers };
}

// --- Config Screen ---

function ConfigScreen({
  cardCount,
  onStart,
}: {
  cardCount: number;
  onStart: (config: RaceConfig) => void;
}) {
  const reduce = useReducedMotion();
  const [playerCount, setPlayerCount] = useState(1);
  const [pathLength, setPathLength] = useState(15);
  const [direction, setDirection] = useState<AnswerDirection>('term-to-def');
  const [types, setTypes] = useState<QuestionType[]>(['multiple-choice', 'written']);

  const pathPresets = [10, 15, 20, 30, 50, 75, 100];

  const tap = reduce ? {} : { whileTap: { scale: 0.95 }, whileHover: { y: -1 } };

  const toggleType = (type: QuestionType) => {
    setTypes((prev) =>
      prev.includes(type)
        ? prev.length > 1 ? prev.filter((t) => t !== type) : prev
        : [...prev, type],
    );
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      <RaceBackground reduce={!!reduce} />
      <div className="relative z-10 max-w-lg mx-auto px-4 py-10">
        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 text-center"
        >
          <div className="text-5xl mb-2">{'🏁'}</div>
          <h2 className="text-3xl font-black tracking-tight" style={{ color: 'var(--color-text)' }}>
            Race to Finish
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
            Answer correctly to roll and speed down the track {'—'} {cardCount} cards ready
          </p>
        </motion.div>

        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduce ? { duration: 0.2 } : { type: 'spring', stiffness: 220, damping: 24 }}
          className="p-6 space-y-6"
          style={{
            background: 'var(--color-surface)',
            boxShadow: 'var(--shadow-card)',
            borderRadius: 'var(--radius-xl)',
            border: '1px solid var(--color-border)',
          }}
        >
          {/* Player count */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>
              Players
            </label>
            <div className="flex gap-2">
              {[1, 2, 3, 4].map((n) => (
                <motion.button
                  key={n}
                  {...tap}
                  onClick={() => setPlayerCount(n)}
                  className="rtf-focusable flex-1 py-3 text-center cursor-pointer font-semibold"
                  style={{
                    background: playerCount === n ? PLAYER_COLORS[n - 1] : 'var(--color-muted)',
                    color: playerCount === n ? '#ffffff' : 'var(--color-text)',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '1.15rem',
                    boxShadow: playerCount === n ? 'var(--shadow-sm)' : 'none',
                  }}
                >
                  {PLAYER_EMOJIS[n - 1]} {n}
                </motion.button>
              ))}
            </div>
          </div>

          {/* Path length */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>
              Track Length
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              <motion.button
                {...tap}
                onClick={() => setPathLength((l) => Math.max(5, l - 5))}
                className="rtf-focusable w-8 h-8 text-lg font-bold cursor-pointer"
                style={{ background: 'var(--color-muted)', color: 'var(--color-text)', border: 'none', borderRadius: 'var(--radius-md)' }}
              >
                -
              </motion.button>
              {pathPresets.map((p) => (
                <motion.button
                  key={p}
                  {...tap}
                  onClick={() => setPathLength(p)}
                  className="rtf-focusable px-3 py-1.5 text-sm font-medium cursor-pointer"
                  style={{
                    background: pathLength === p ? 'var(--color-primary)' : 'var(--color-muted)',
                    color: pathLength === p ? '#ffffff' : 'var(--color-text)',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  {p}
                </motion.button>
              ))}
              <motion.button
                {...tap}
                onClick={() => setPathLength((l) => l + 5)}
                className="rtf-focusable w-8 h-8 text-lg font-bold cursor-pointer"
                style={{ background: 'var(--color-muted)', color: 'var(--color-text)', border: 'none', borderRadius: 'var(--radius-md)' }}
              >
                +
              </motion.button>
            </div>
          </div>

          {/* Direction */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>
              Direction
            </label>
            <div className="flex flex-col gap-2">
              {([
                ['term-to-def', 'Term → Definition'],
                ['def-to-term', 'Definition → Term'],
                ['both', 'Both'],
              ] as [AnswerDirection, string][]).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: 'var(--color-text)' }}>
                  <input
                    type="radio"
                    name="direction"
                    checked={direction === value}
                    onChange={() => setDirection(value)}
                    style={{ accentColor: 'var(--color-primary)' }}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {/* Question types */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>
              Question Types
            </label>
            <div className="flex flex-col gap-2">
              {([
                ['written', 'Written'],
                ['multiple-choice', 'Multiple Choice'],
                ['true-false', 'True / False'],
              ] as [QuestionType, string][]).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: 'var(--color-text)' }}>
                  <input
                    type="checkbox"
                    checked={types.includes(value)}
                    onChange={() => toggleType(value)}
                    style={{ accentColor: 'var(--color-primary)' }}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <Button variant="primary" className="w-full rtf-focusable" onClick={() => onStart({ playerCount, pathLength, direction, questionTypes: types })}>
            {'🚦'} Start Race
          </Button>
        </motion.div>
      </div>
    </div>
  );
}

// --- Main Game ---

function RaceToFinishMode({ cards, setId, exitUrl }: RaceToFinishModeProps) {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const exitTo = exitUrl ?? `/sets/${setId}`;

  const [phase, setPhase] = useState<'config' | 'playing' | 'results'>('config');
  const [config, setConfig] = useState<RaceConfig | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState<RaceQuestion | null>(null);
  const [winner, setWinner] = useState<Player | null>(null);
  const [shortcuts, setShortcuts] = useState<Map<number, number>>(new Map());

  // Question UI state
  const [userAnswer, setUserAnswer] = useState('');
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [diceRoll, setDiceRoll] = useState<number | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showShortcut, setShowShortcut] = useState(false);

  const questionIndexRef = useRef(0);
  const boardRef = useRef<HTMLDivElement>(null);
  const moveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const moveTimeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const groups = useMemo(() => buildEquivalenceGroups(cards), [cards]);

  // Cleanup intervals and timeouts on unmount
  useEffect(() => {
    return () => {
      if (moveIntervalRef.current) clearInterval(moveIntervalRef.current);
      for (const t of moveTimeoutsRef.current) clearTimeout(t);
      moveTimeoutsRef.current.clear();
      confetti.reset();
    };
  }, []);

  // Celebratory confetti on the results screen (reduced-motion aware).
  useEffect(() => {
    if (phase !== 'results' || !winner || reduce) return;
    let cancelled = false;
    const end = Date.now() + 1400;
    confetti({ particleCount: 90, spread: 95, startVelocity: 42, origin: { y: 0.6 }, colors: CONFETTI_COLORS, disableForReducedMotion: true });
    const frame = () => {
      if (cancelled) return;
      confetti({ particleCount: 3, angle: 60, spread: 60, startVelocity: 45, origin: { x: 0, y: 0.9 }, colors: CONFETTI_COLORS, disableForReducedMotion: true });
      confetti({ particleCount: 3, angle: 120, spread: 60, startVelocity: 45, origin: { x: 1, y: 0.9 }, colors: CONFETTI_COLORS, disableForReducedMotion: true });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    frame();
    return () => { cancelled = true; };
  }, [phase, winner, reduce]);

  // Generate shortcuts for paths >= 15
  const generateShortcuts = useCallback((pathLen: number) => {
    const sc = new Map<number, number>();
    if (pathLen < 15) return sc;
    const shortcutCount = Math.max(1, Math.floor(pathLen / 10));
    const used = new Set<number>();
    for (let i = 0; i < shortcutCount; i++) {
      let from: number;
      do {
        from = 3 + Math.floor(Math.random() * (pathLen - 6));
      } while (used.has(from));
      used.add(from);
      const jump = 2 + Math.floor(Math.random() * 3);
      const to = Math.min(pathLen - 1, from + jump);
      sc.set(from, to);
    }
    return sc;
  }, []);

  const generateQuestion = useCallback(() => {
    if (!config) return null;
    const card = cards[Math.floor(Math.random() * cards.length)];
    const type = config.questionTypes[questionIndexRef.current % config.questionTypes.length];
    questionIndexRef.current++;
    return buildRaceQuestion(card, cards, groups, type, config.direction, questionIndexRef.current);
  }, [cards, config, groups]);

  const handleStart = useCallback((cfg: RaceConfig) => {
    const newPlayers: Player[] = [];
    for (let i = 0; i < cfg.playerCount; i++) {
      newPlayers.push({
        id: i,
        emoji: PLAYER_EMOJIS[i],
        color: PLAYER_COLORS[i],
        position: 0,
        correctCount: 0,
        totalCount: 0,
      });
    }
    setConfig(cfg);
    setPlayers(newPlayers);
    setCurrentPlayerIndex(0);
    setWinner(null);
    setShortcuts(generateShortcuts(cfg.pathLength));
    questionIndexRef.current = 0;
    setPhase('playing');

    // Generate first question
    const card = cards[Math.floor(Math.random() * cards.length)];
    const type = cfg.questionTypes[0];
    const q = buildRaceQuestion(card, cards, groups, type, cfg.direction, 0);
    setCurrentQuestion(q);
    resetQuestionState();
  }, [cards, groups, generateShortcuts]);

  const resetQuestionState = () => {
    setUserAnswer('');
    setSelectedOption(null);
    setFeedback(null);
    setDiceRoll(null);
    setShowShortcut(false);
  };

  const animateMove = useCallback((playerIdx: number, from: number, to: number, onDone: () => void) => {
    if (from >= to) { onDone(); return; }
    // Clear any previous move interval
    if (moveIntervalRef.current) clearInterval(moveIntervalRef.current);
    setIsAnimating(true);
    let step = from;
    const interval = setInterval(() => {
      step++;
      setPlayers((prev) =>
        prev.map((p, i) => i === playerIdx ? { ...p, position: step } : p),
      );
      // Auto-scroll to current player position
      if (boardRef.current) {
        const node = boardRef.current.querySelector(`[data-cell="${step}"]`);
        if (node) {
          node.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
      if (step >= to) {
        clearInterval(interval);
        moveIntervalRef.current = null;
        setIsAnimating(false);
        onDone();
      }
    }, 350);
    moveIntervalRef.current = interval;
  }, []);

  const processCorrectAnswer = useCallback((playerIdx: number) => {
    if (!config) return;

    // Dice roll animation
    const roll = 1 + Math.floor(Math.random() * 6);
    setDiceRoll(roll);

    const t1 = setTimeout(() => {
      moveTimeoutsRef.current.delete(t1);
      const player = players[playerIdx];
      const newPos = Math.min(config.pathLength, player.position + roll);

      animateMove(playerIdx, player.position, newPos, () => {
        // Check shortcut
        if (shortcuts.has(newPos)) {
          const dest = shortcuts.get(newPos)!;
          setShowShortcut(true);
          const t2 = setTimeout(() => {
            moveTimeoutsRef.current.delete(t2);
            animateMove(playerIdx, newPos, dest, () => {
              setShowShortcut(false);
              checkWinAndAdvance(playerIdx, dest);
            });
          }, 800);
          moveTimeoutsRef.current.add(t2);
        } else {
          checkWinAndAdvance(playerIdx, newPos);
        }
      });
    }, 600);
    moveTimeoutsRef.current.add(t1);
  }, [config, players, shortcuts, animateMove]);

  const checkWinAndAdvance = useCallback((playerIdx: number, finalPos: number) => {
    if (!config) return;

    if (finalPos >= config.pathLength) {
      const winningPlayer = { ...players[playerIdx], position: finalPos };
      setWinner(winningPlayer);
      setPhase('results');
      return;
    }

    // Next player
    const nextPlayer = (playerIdx + 1) % (config?.playerCount ?? 1);
    setCurrentPlayerIndex(nextPlayer);
    setCurrentQuestion(generateQuestion());
    resetQuestionState();
  }, [config, players, generateQuestion]);

  const handleAnswer = useCallback((isCorrect: boolean) => {
    const playerIdx = currentPlayerIndex;
    setPlayers((prev) =>
      prev.map((p, i) =>
        i === playerIdx
          ? { ...p, totalCount: p.totalCount + 1, correctCount: p.correctCount + (isCorrect ? 1 : 0) }
          : p,
      ),
    );

    if (isCorrect) {
      setFeedback('correct');
      processCorrectAnswer(playerIdx);
    } else {
      setFeedback('wrong');
      // Skip turn after delay (registered so unmount cleanup can clear it)
      const t = setTimeout(() => {
        moveTimeoutsRef.current.delete(t);
        const nextPlayer = (playerIdx + 1) % (config?.playerCount ?? 1);
        setCurrentPlayerIndex(nextPlayer);
        setCurrentQuestion(generateQuestion());
        resetQuestionState();
      }, 1500);
      moveTimeoutsRef.current.add(t);
    }
  }, [currentPlayerIndex, config, processCorrectAnswer, generateQuestion]);

  const checkWritten = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (feedback || !userAnswer.trim() || !currentQuestion) return;
    const isCorrect = gradeWrittenAnswer(userAnswer, currentQuestion.correctAnswers);
    handleAnswer(isCorrect);
  }, [feedback, userAnswer, currentQuestion, handleAnswer]);

  const checkMC = useCallback((option: string) => {
    if (feedback || !currentQuestion) return;
    setSelectedOption(option);
    const isCorrect = currentQuestion.correctAnswers.some(
      (a) => normalizeAnswer(a) === normalizeAnswer(option),
    );
    handleAnswer(isCorrect);
  }, [feedback, currentQuestion, handleAnswer]);

  const checkTF = useCallback((answer: boolean) => {
    if (feedback || !currentQuestion) return;
    const isCorrect = answer === currentQuestion.tfPair?.isCorrect;
    handleAnswer(isCorrect);
  }, [feedback, currentQuestion, handleAnswer]);

  if (phase === 'config') {
    return <ConfigScreen cardCount={cards.length} onStart={handleStart} />;
  }

  // Results
  if (phase === 'results' && config) {
    const sortedPlayers = [...players].sort((a, b) => b.position - a.position);

    return (
      <div className="relative min-h-screen overflow-hidden">
        <RaceBackground reduce={!!reduce} />
        <div className="relative z-10 max-w-2xl mx-auto px-4 py-10">
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={reduce ? { duration: 0.2 } : { type: 'spring', stiffness: 220, damping: 22 }}
            className="p-8 text-center relative overflow-hidden"
            style={{
              background: 'var(--color-surface)',
              boxShadow: 'var(--shadow-modal)',
              borderRadius: 'var(--radius-xl)',
              border: '1px solid var(--color-border)',
            }}
          >
            {/* Checkered finish strip */}
            <div
              aria-hidden
              className="absolute inset-x-0 top-0 h-3"
              style={{
                backgroundImage: 'repeating-linear-gradient(45deg, var(--color-text) 0 8px, var(--color-surface) 8px 16px)',
                opacity: 0.16,
              }}
            />

            <motion.div
              initial={reduce ? undefined : { scale: 0, rotate: -20 }}
              animate={reduce ? undefined : { scale: 1, rotate: 0 }}
              transition={reduce ? undefined : { type: 'spring', stiffness: 260, damping: 14, delay: 0.1 }}
              className="text-6xl mb-2"
            >
              {winner ? '🏁' : '🏆'}
            </motion.div>
            <h2 className="text-3xl font-black mb-1" style={{ color: 'var(--color-text)' }}>
              {winner ? `Player ${winner.id + 1} Wins!` : 'Race Over!'}
            </h2>
            <p className="text-base mb-6" style={{ color: 'var(--color-text-secondary)' }}>
              {winner ? `${winner.emoji} crossed the finish line first!` : 'Great racing!'}
            </p>

            {/* Standings */}
            <div className="mb-6 flex flex-col gap-2 text-left">
              {sortedPlayers.map((player, rank) => {
                const accuracy = player.totalCount > 0
                  ? Math.round((player.correctCount / player.totalCount) * 100)
                  : 0;
                const medal = rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : `${rank + 1}`;
                const pct = config.pathLength > 0 ? player.position / config.pathLength : 0;
                return (
                  <motion.div
                    key={player.id}
                    initial={reduce ? { opacity: 0 } : { opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: reduce ? 0 : 0.15 + rank * 0.07 }}
                    className="flex items-center gap-3 p-3"
                    style={{
                      background: 'var(--color-muted)',
                      borderRadius: 'var(--radius-lg)',
                      border: rank === 0 ? `1px solid ${player.color}` : '1px solid var(--color-border)',
                    }}
                  >
                    <span className="text-xl w-7 text-center font-bold">{medal}</span>
                    <span className="text-xl">{player.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                        <span>Player {player.id + 1}</span>
                        <span style={{ color: 'var(--color-text-secondary)' }}>{player.position}/{config.pathLength}</span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full rounded-full overflow-hidden" style={{ background: 'var(--color-border)' }}>
                        <motion.div
                          initial={reduce ? undefined : { scaleX: 0 }}
                          animate={reduce ? undefined : { scaleX: pct }}
                          transition={{ delay: reduce ? 0 : 0.3 + rank * 0.07, duration: 0.6, ease: 'easeOut' }}
                          style={{
                            height: '100%',
                            width: '100%',
                            transformOrigin: 'left',
                            transform: reduce ? `scaleX(${pct})` : undefined,
                            background: player.color,
                            borderRadius: 'inherit',
                          }}
                        />
                      </div>
                    </div>
                    <span className="text-sm font-bold w-12 text-right" style={{ color: 'var(--color-text-secondary)' }}>{accuracy}%</span>
                  </motion.div>
                );
              })}
            </div>

            <div className="flex gap-3 justify-center">
              <Button variant="primary" className="rtf-focusable" onClick={() => setPhase('config')}>
                Play Again
              </Button>
              <Button variant="outline" className="rtf-focusable" onClick={() => navigate(exitTo)}>
                Exit
              </Button>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  if (!currentQuestion || !config) return null;

  const currentPlayer = players[currentPlayerIndex];
  const pathLen = config.pathLength;

  // Lane layout for racer tokens (purely presentational — position is vertical).
  const laneGap = config.playerCount <= 1 ? 0 : Math.min(22, 66 / config.playerCount);
  const laneX = (id: number) => 62 + (id - (config.playerCount - 1) / 2) * laneGap;

  const containerV: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: reduce ? 0 : 0.08 } },
  };
  const itemV: Variants = reduce
    ? { hidden: { opacity: 0 }, show: { opacity: 1 } }
    : { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 240, damping: 22 } } };

  return (
    <div className="relative min-h-screen overflow-hidden">
      <RaceBackground reduce={!!reduce} />

      {/* Shortcut / nitro flash overlay */}
      <AnimatePresence>
        {showShortcut && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }}
          >
            <motion.div
              initial={reduce ? { opacity: 0 } : { scale: 0.4, rotate: -8, opacity: 0 }}
              animate={reduce ? { opacity: 1 } : { scale: 1, rotate: 0, opacity: 1 }}
              exit={reduce ? { opacity: 0 } : { scale: 0, opacity: 0 }}
              transition={reduce ? { duration: 0.15 } : { type: 'spring', stiffness: 300, damping: 18 }}
              className="flex flex-col items-center gap-3"
            >
              <div className="text-7xl">{'⚡'}</div>
              <div
                className="px-5 py-2 text-2xl font-black"
                style={{ background: '#06b6d4', color: '#ffffff', borderRadius: 'var(--radius-full)', boxShadow: 'var(--shadow-lg)' }}
              >
                NITRO BOOST!
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        variants={containerV}
        initial="hidden"
        animate="show"
        className="relative z-10 max-w-4xl mx-auto px-4 py-6"
      >
        {/* Header: exit + racer chips */}
        <motion.div variants={itemV} className="flex items-center justify-between gap-3 mb-5 flex-wrap">
          <Button variant="ghost" size="sm" className="rtf-focusable" onClick={() => navigate(exitTo)}>
            {'←'} Exit
          </Button>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {players.map((p) => {
              const active = p.id === currentPlayerIndex;
              const pct = pathLen > 0 ? p.position / pathLen : 0;
              return (
                <motion.div
                  key={p.id}
                  animate={reduce ? undefined : { scale: active ? 1.06 : 1 }}
                  className={cn('flex items-center gap-2 px-3 py-1.5', active && 'ring-2')}
                  style={{
                    background: active ? p.color : 'var(--color-surface)',
                    color: active ? '#ffffff' : 'var(--color-text)',
                    borderRadius: 'var(--radius-full)',
                    boxShadow: active ? 'var(--shadow-sm)' : 'none',
                    border: active ? 'none' : '1px solid var(--color-border)',
                  }}
                >
                  <span style={{ fontSize: '1.05rem', lineHeight: 1 }}>{p.emoji}</span>
                  <div className="flex flex-col leading-none">
                    <span className="text-xs font-bold">{p.position}/{pathLen}</span>
                    <div
                      className="mt-1 h-1 w-12 rounded-full overflow-hidden"
                      style={{ background: active ? 'rgba(255,255,255,0.35)' : 'var(--color-border)' }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: '100%',
                          transformOrigin: 'left',
                          transform: `scaleX(${pct})`,
                          background: active ? '#ffffff' : p.color,
                          borderRadius: 'inherit',
                          transition: reduce ? 'none' : 'transform 0.4s var(--ease-out)',
                        }}
                      />
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        <div className="flex flex-col md:flex-row gap-6">
          {/* Question column */}
          <motion.div variants={itemV} className="flex-1 min-w-0">
            <div
              className="mb-4 flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-bold"
              style={{
                background: currentPlayer.color,
                color: '#ffffff',
                borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>{currentPlayer.emoji}</span>
              Player {currentPlayer.id + 1}'s turn {'—'} go go go!
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={`${currentPlayerIndex}-${questionIndexRef.current}`}
                initial={reduce ? { opacity: 0 } : { opacity: 0, x: 24 }}
                animate={
                  feedback === 'wrong' && !reduce
                    ? { opacity: 1, x: [0, -10, 10, -7, 7, 0] }
                    : feedback === 'correct' && !reduce
                    ? { opacity: 1, x: 0, scale: [1, 1.02, 1] }
                    : { opacity: 1, x: 0 }
                }
                exit={reduce ? { opacity: 0 } : { opacity: 0, x: -24 }}
                transition={{ duration: reduce ? 0.15 : 0.28 }}
                className="relative p-6 overflow-hidden"
                style={{
                  background: 'var(--color-surface)',
                  boxShadow: 'var(--shadow-card)',
                  borderRadius: 'var(--radius-xl)',
                  border: '1px solid var(--color-border)',
                }}
              >
                {/* Boost speed-lines on a correct answer */}
                {feedback === 'correct' && !reduce && (
                  <div aria-hidden className="pointer-events-none absolute inset-0">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="rtf-speed-line absolute"
                        style={{
                          top: `${12 + i * 18}%`,
                          right: 0,
                          width: '60%',
                          height: '3px',
                          borderRadius: '999px',
                          background: 'linear-gradient(90deg, transparent, var(--color-success))',
                          animationDelay: `${i * 0.05}s`,
                        }}
                      />
                    ))}
                  </div>
                )}

                <div className="relative">
                  <div className="text-xs uppercase tracking-wider mb-2 font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
                    {currentQuestion.type === 'true-false' ? 'True or False?' : 'What is the answer?'}
                  </div>

                  {currentQuestion.type === 'true-false' && currentQuestion.tfPair ? (
                    <div className="mb-6">
                      <div className="mb-3">
                        <span className="text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>Term:</span>
                        <StudyContent html={currentQuestion.tfPair.term} className="text-xl font-semibold mt-1" />
                      </div>
                      <div>
                        <span className="text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>Definition:</span>
                        <StudyContent html={currentQuestion.tfPair.definition} className="text-xl mt-1" />
                      </div>
                    </div>
                  ) : (
                    <StudyContent html={currentQuestion.promptHtml} className="text-2xl font-semibold mb-6" />
                  )}

                  {/* Written */}
                  {currentQuestion.type === 'written' && (
                    <form onSubmit={checkWritten}>
                      <input
                        type="text"
                        value={userAnswer}
                        onChange={(e) => setUserAnswer(e.target.value)}
                        placeholder="Type your answer..."
                        disabled={feedback !== null}
                        autoFocus
                        className="w-full h-12 px-4 text-base outline-none"
                        style={{
                          background: 'var(--color-muted)',
                          color: 'var(--color-text)',
                          border: `2px solid ${
                            feedback === 'correct' ? 'var(--color-success)'
                              : feedback === 'wrong' ? 'var(--color-danger)'
                              : 'var(--color-border)'
                          }`,
                          borderRadius: 'var(--radius-md)',
                        }}
                      />
                      {!feedback && (
                        <Button variant="primary" type="submit" className="mt-3 w-full rtf-focusable">Submit</Button>
                      )}
                    </form>
                  )}

                  {/* MC */}
                  {currentQuestion.type === 'multiple-choice' && currentQuestion.options && (
                    <div className="grid gap-3">
                      {currentQuestion.options.map((option, i) => {
                        const isSelected = selectedOption === option;
                        const isCorrectOption = currentQuestion.correctAnswers.some(
                          (a) => normalizeAnswer(a) === normalizeAnswer(option),
                        );
                        let borderColor = 'var(--color-border)';
                        let bg = 'var(--color-surface-raised)';
                        if (feedback) {
                          if (isCorrectOption) { borderColor = 'var(--color-success)'; bg = 'var(--color-success-light)'; }
                          else if (isSelected) { borderColor = 'var(--color-danger)'; bg = 'var(--color-danger-light)'; }
                        }
                        return (
                          <motion.button
                            key={i}
                            onClick={() => checkMC(option)}
                            disabled={feedback !== null || isAnimating}
                            whileHover={feedback || isAnimating || reduce ? undefined : { y: -2 }}
                            whileTap={feedback || reduce ? undefined : { scale: 0.98 }}
                            className="rtf-focusable w-full text-left p-4 cursor-pointer"
                            style={{
                              background: bg,
                              border: `2px solid ${borderColor}`,
                              borderRadius: 'var(--radius-md)',
                              color: 'var(--color-text)',
                              opacity: feedback && !isCorrectOption && !isSelected ? 0.5 : 1,
                            }}
                          >
                            <StudyContent html={option} />
                          </motion.button>
                        );
                      })}
                    </div>
                  )}

                  {/* T/F */}
                  {currentQuestion.type === 'true-false' && (
                    <div className="flex gap-3">
                      {['True', 'False'].map((label) => {
                        const val = label === 'True';
                        const isCorrectBtn = feedback && val === currentQuestion.tfPair?.isCorrect;
                        const isWrongBtn = feedback && val !== currentQuestion.tfPair?.isCorrect;
                        return (
                          <Button key={label} variant="outline" className="flex-1 rtf-focusable" onClick={() => checkTF(val)} disabled={feedback !== null || isAnimating}>
                            <span style={{
                              color: isCorrectBtn ? 'var(--color-success)' : isWrongBtn ? 'var(--color-danger)' : undefined,
                              fontWeight: isCorrectBtn ? 700 : undefined,
                            }}>
                              {label}
                            </span>
                          </Button>
                        );
                      })}
                    </div>
                  )}

                  {/* Feedback */}
                  {feedback && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4">
                      {feedback === 'correct' ? (
                        <div className="p-3 flex items-center gap-2" style={{ background: 'var(--color-success-light)', borderRadius: 'var(--radius-md)' }}>
                          {diceRoll !== null && (
                            <motion.span
                              initial={reduce ? undefined : { scale: 0, rotate: -30 }}
                              animate={reduce ? undefined : { scale: 1, rotate: 0 }}
                              transition={reduce ? undefined : { type: 'spring', stiffness: 300, damping: 14 }}
                              className="flex items-center justify-center font-black"
                              style={{ width: 32, height: 32, background: 'var(--color-success)', color: '#ffffff', borderRadius: 'var(--radius-md)', fontSize: '1.05rem' }}
                            >
                              {diceRoll}
                            </motion.span>
                          )}
                          <p className="font-semibold" style={{ color: 'var(--color-success)' }}>
                            Correct! {diceRoll !== null && `Boost ${diceRoll} spaces!`}
                          </p>
                        </div>
                      ) : (
                        <div className="p-3" style={{ background: 'var(--color-danger-light)', borderRadius: 'var(--radius-md)' }}>
                          <p className="font-semibold mb-1" style={{ color: 'var(--color-danger)' }}>Spun out {'—'} skip turn</p>
                          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                            Correct: <span className="font-medium" style={{ color: 'var(--color-text)' }}>{stripHtml(currentQuestion.correctAnswers[0])}</span>
                          </p>
                        </div>
                      )}
                    </motion.div>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>
          </motion.div>

          {/* Racetrack board */}
          <motion.div variants={itemV} className="w-full md:w-56 flex-shrink-0">
            <div className="mb-2 flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>
              {'🏁'} Racetrack
            </div>
            <div
              ref={boardRef}
              className="overflow-y-auto"
              style={{
                maxHeight: 500,
                background: 'var(--color-muted)',
                borderRadius: 'var(--radius-xl)',
                boxShadow: 'var(--shadow-card)',
                border: '1px solid var(--color-border)',
              }}
            >
              <svg
                width="100%"
                viewBox={`0 0 124 ${(pathLen + 1) * 60 + 40}`}
                className="block"
              >
                <defs>
                  <linearGradient id="rtf-road" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#3a4658" />
                    <stop offset="0.5" stopColor="#273244" />
                    <stop offset="1" stopColor="#1b2433" />
                  </linearGradient>
                  <filter id="rtf-shadow" x="-60%" y="-60%" width="220%" height="220%">
                    <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodColor="#000000" floodOpacity="0.4" />
                  </filter>
                  <pattern id="rtf-checker" width="12" height="12" patternUnits="userSpaceOnUse">
                    <rect width="12" height="12" fill="#ffffff" />
                    <rect width="6" height="6" fill="#0f172a" />
                    <rect x="6" y="6" width="6" height="6" fill="#0f172a" />
                  </pattern>
                  <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto">
                    <polygon points="0 0, 6 2, 0 4" fill="#06b6d4" />
                  </marker>
                </defs>

                {/* Road surface */}
                <rect x={16} y={10} width={92} height={pathLen * 60 + 60} rx={12} fill="url(#rtf-road)" />
                {/* Edge lines */}
                <line x1={20} y1={16} x2={20} y2={pathLen * 60 + 64} stroke="#ffffff" strokeWidth="2" opacity="0.22" />
                <line x1={104} y1={16} x2={104} y2={pathLen * 60 + 64} stroke="#ffffff" strokeWidth="2" opacity="0.22" />
                {/* Center dashed lane line */}
                <line
                  x1={62}
                  y1={16}
                  x2={62}
                  y2={pathLen * 60 + 64}
                  stroke="#ffffff"
                  strokeWidth="3"
                  strokeDasharray="10 14"
                  opacity="0.5"
                  className={reduce ? undefined : 'rtf-lane-dash'}
                />

                {/* Rows (bottom = start, top = finish) */}
                {Array.from({ length: pathLen + 1 }).map((_, idx) => {
                  const cellIdx = idx;
                  const cy = (pathLen - idx) * 60 + 40;
                  const isStart = idx === 0;
                  const isFinish = idx === pathLen;
                  const isShortcut = shortcuts.has(idx);
                  const destCy = isShortcut ? (pathLen - shortcuts.get(idx)!) * 60 + 40 : 0;
                  const playersHere = players.filter((p) => p.position === cellIdx);

                  return (
                    <g key={idx} data-cell={cellIdx}>
                      {isFinish ? (
                        <>
                          <rect x={16} y={cy - 15} width={92} height={30} fill="url(#rtf-checker)" opacity="0.95" />
                          <rect x={16} y={cy - 15} width={92} height={30} fill="none" stroke="#ffffff" strokeWidth="1.5" opacity="0.4" />
                        </>
                      ) : isStart ? (
                        <>
                          <rect x={16} y={cy - 13} width={92} height={26} rx={6} fill="#16a34a" opacity="0.9" />
                          <text x={62} y={cy} textAnchor="middle" dominantBaseline="central" fill="#ffffff" fontSize="12" fontWeight="800" fontFamily="var(--font-sans)">GO</text>
                        </>
                      ) : isShortcut ? (
                        <>
                          <rect x={16} y={cy - 12} width={92} height={24} rx={6} fill="#06b6d4" opacity="0.18" />
                          <line x1={20} y1={cy} x2={104} y2={cy} stroke="#22d3ee" strokeWidth="2" strokeDasharray="5 4" />
                          <text x={62} y={cy} textAnchor="middle" dominantBaseline="central" fontSize="12">{'⚡'}</text>
                          {/* Boost arrow to destination */}
                          <line x1={112} y1={cy} x2={112} y2={destCy + 6} stroke="#06b6d4" strokeWidth="2" strokeDasharray="4 3" markerEnd="url(#arrowhead)" />
                        </>
                      ) : (
                        <>
                          <line x1={22} y1={cy} x2={102} y2={cy} stroke="#ffffff" strokeWidth="1" opacity="0.07" />
                          <text x={117} y={cy} textAnchor="middle" dominantBaseline="central" fill="var(--color-text-tertiary)" fontSize="8" fontFamily="var(--font-sans)">{idx}</text>
                        </>
                      )}

                      {/* Racer tokens (own lanes) */}
                      {playersHere.map((p) => {
                        const active = p.id === currentPlayerIndex;
                        const x = laneX(p.id);
                        return (
                          <g key={p.id}>
                            {/* Dust / speed trail while this racer is moving */}
                            {active && isAnimating && !reduce && (
                              <g>
                                <line x1={x} y1={cy + 12} x2={x} y2={cy + 24} stroke={p.color} strokeWidth="3" strokeLinecap="round" opacity="0.6" />
                                <line x1={x - 5} y1={cy + 13} x2={x - 5} y2={cy + 21} stroke={p.color} strokeWidth="2" strokeLinecap="round" opacity="0.4" />
                                <line x1={x + 5} y1={cy + 13} x2={x + 5} y2={cy + 21} stroke={p.color} strokeWidth="2" strokeLinecap="round" opacity="0.4" />
                              </g>
                            )}
                            <g className={active && !reduce ? 'rtf-active-racer' : undefined} filter="url(#rtf-shadow)">
                              {active && <circle cx={x} cy={cy} r="15" fill={p.color} opacity="0.25" />}
                              <circle cx={x} cy={cy} r="11" fill={p.color} stroke="#ffffff" strokeWidth="2" />
                              <text x={x} y={cy} textAnchor="middle" dominantBaseline="central" fontSize="11">{p.emoji}</text>
                            </g>
                          </g>
                        );
                      })}
                    </g>
                  );
                })}
              </svg>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}

export default RaceToFinishMode;
