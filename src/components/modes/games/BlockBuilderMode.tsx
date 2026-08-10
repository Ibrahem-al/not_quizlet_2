import { useState, useCallback, useRef, useEffect, type ReactNode } from 'react';
import {
  motion,
  AnimatePresence,
  useReducedMotion,
  useAnimationControls,
} from 'framer-motion';
import confetti from 'canvas-confetti';
import type { Card, QuestionType, AnswerDirection } from '@/types';
import { useNavigate } from 'react-router-dom';
import { shuffleArray, stripHtml, normalizeAnswer, fairRepeatCards } from '@/lib/utils';
import {
  buildEquivalenceGroups,
  getEquivalentAnswers,
  getWrongOptionPool,
  getWrongTermPool,
  gradeWrittenAnswer,
} from '@/lib/equivalence';
import { Button } from '@/components/ui/Button';
import StudyContent from '@/components/StudyContent';

interface BlockBuilderModeProps {
  cards: Card[];
  setId: string;
  exitUrl?: string;
}

type Difficulty = 'easy' | 'medium' | 'hard';
type GameState = 'playing' | 'won' | 'lost';

interface DifficultySettings {
  blockPenalty: number;
  lavaRise: number;
  scoreMultiplier: number;
}

const DIFFICULTY_MAP: Record<Difficulty, DifficultySettings> = {
  easy: { blockPenalty: 0, lavaRise: 20, scoreMultiplier: 1 },
  medium: { blockPenalty: 1, lavaRise: 30, scoreMultiplier: 1.5 },
  hard: { blockPenalty: 2, lavaRise: 40, scoreMultiplier: 2 },
};

interface GameConfig {
  difficulty: Difficulty;
  questionTypes: QuestionType[];
  direction: AnswerDirection;
  questionCount: number;
  isInfinite: boolean;
}

interface GameQuestion {
  card: Card;
  type: QuestionType;
  promptHtml: string;
  correctAnswers: string[];
  options?: string[];
  tfPair?: { term: string; definition: string; isCorrect: boolean };
}

function buildGameQuestions(
  cards: Card[],
  config: GameConfig,
): GameQuestion[] {
  const groups = buildEquivalenceGroups(cards);
  const count = config.isInfinite ? cards.length * 3 : config.questionCount;
  const selected = fairRepeatCards(cards, count);
  const questions: GameQuestion[] = [];
  const types = config.questionTypes;

  for (let i = 0; i < selected.length; i++) {
    const card = selected[i];
    const type = types[i % types.length];
    const isReverse =
      config.direction === 'def-to-term' ||
      (config.direction === 'both' && i % 2 === 1);

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
        questions.push({ card, type: 'written', promptHtml, correctAnswers });
        continue;
      }
      const correctDef = isReverse ? card.term : card.definition;
      const options = shuffleArray([correctDef, ...wrongs]);
      questions.push({ card, type: 'multiple-choice', promptHtml, correctAnswers, options });
    } else if (type === 'true-false') {
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
      questions.push({
        card,
        type: 'true-false',
        promptHtml,
        correctAnswers,
        tfPair: {
          term: isReverse ? card.definition : card.term,
          definition: shownDef,
          isCorrect: isCorrect || correctAnswers.some((a) => normalizeAnswer(a) === normalizeAnswer(shownDef)),
        },
      });
    } else {
      questions.push({ card, type: 'written', promptHtml, correctAnswers });
    }
  }

  return questions;
}

// --- Shared presentation helpers (suite art direction) ---

/** Soft aurora blobs — GPU-friendly, low-opacity, token-driven background. */
function AuroraBackground({ reduce }: { reduce: boolean }) {
  const blobs = [
    { tone: 'var(--color-primary)', top: '-10%', left: '-8%', size: 380 },
    { tone: 'var(--color-warning)', top: '35%', left: '65%', size: 320 },
    { tone: 'var(--color-success)', top: '70%', left: '10%', size: 300 },
  ];
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ zIndex: 0, borderRadius: 'inherit' }}
    >
      {blobs.map((b, i) => (
        <motion.div
          key={i}
          className="absolute"
          style={{
            top: b.top,
            left: b.left,
            width: b.size,
            height: b.size,
            borderRadius: 'var(--radius-full)',
            background: `radial-gradient(circle at 50% 50%, ${b.tone} 0%, transparent 70%)`,
            opacity: 0.14,
            filter: 'blur(48px)',
            willChange: 'transform',
          }}
          animate={
            reduce
              ? undefined
              : {
                  x: [0, i % 2 === 0 ? 30 : -30, 0],
                  y: [0, i % 2 === 0 ? -24 : 24, 0],
                  scale: [1, 1.08, 1],
                }
          }
          transition={
            reduce
              ? undefined
              : { duration: 14 + i * 3, repeat: Infinity, ease: 'easeInOut' }
          }
        />
      ))}
    </div>
  );
}

/** Rounded stat chip used across the suite header. */
function Pill({
  children,
  tone = 'default',
}: {
  children: ReactNode;
  tone?: 'primary' | 'success' | 'warning' | 'default';
}) {
  const color =
    tone === 'primary'
      ? 'var(--color-primary)'
      : tone === 'success'
        ? 'var(--color-success)'
        : tone === 'warning'
          ? 'var(--color-warning)'
          : 'var(--color-text-secondary)';
  return (
    <div
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold"
      style={{
        background: 'var(--color-surface-raised)',
        color,
        borderRadius: 'var(--radius-full)',
        boxShadow: 'var(--shadow-xs)',
        border: '1px solid var(--color-border-light)',
      }}
    >
      {children}
    </div>
  );
}

// --- Config Screen ---

function ConfigScreen({
  onStart,
  reduce,
}: {
  onStart: (config: GameConfig) => void;
  reduce: boolean;
}) {
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [types, setTypes] = useState<QuestionType[]>(['written', 'multiple-choice', 'true-false']);
  const [direction, setDirection] = useState<AnswerDirection>('term-to-def');
  const [questionCount, setQuestionCount] = useState(10);
  const [isInfinite, setIsInfinite] = useState(false);

  const toggleType = (type: QuestionType) => {
    setTypes((prev) =>
      prev.includes(type)
        ? prev.length > 1 ? prev.filter((t) => t !== type) : prev
        : [...prev, type],
    );
  };

  return (
    <div className="relative max-w-lg mx-auto px-4 py-8">
      <AuroraBackground reduce={reduce} />
      <motion.div
        className="relative"
        style={{ zIndex: 10 }}
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 18 }}
        animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
        transition={reduce ? { duration: 0.2 } : { type: 'spring', stiffness: 260, damping: 26 }}
      >
        <div className="flex flex-col items-center mb-6">
          <div className="text-4xl mb-1" aria-hidden>🧱</div>
          <h2 className="text-2xl font-bold text-center" style={{ color: 'var(--color-text)' }}>
            Block Builder
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
            Stack blocks above the rising lava and reach the summit.
          </p>
        </div>

        <div
          className="p-6 space-y-6"
          style={{
            background: 'var(--color-surface)',
            boxShadow: 'var(--shadow-card)',
            borderRadius: 'var(--radius-xl)',
            border: '1px solid var(--color-border-light)',
          }}
        >
          {/* Difficulty */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>
              Difficulty
            </label>
            <div className="flex gap-2">
              {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
                <motion.button
                  key={d}
                  onClick={() => setDifficulty(d)}
                  whileTap={reduce ? undefined : { scale: 0.96 }}
                  whileHover={reduce ? undefined : { scale: 1.03 }}
                  className="flex-1 px-4 py-2 text-sm font-medium cursor-pointer capitalize"
                  style={{
                    background: difficulty === d ? 'var(--color-primary)' : 'var(--color-muted)',
                    color: difficulty === d ? '#ffffff' : 'var(--color-text)',
                    borderRadius: 'var(--radius-md)',
                    border: 'none',
                  }}
                >
                  {d}
                </motion.button>
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

          {/* Question count */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>
              Question Count
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setQuestionCount((c) => Math.max(1, c - 1))}
                disabled={isInfinite}
                className="w-8 h-8 text-lg font-bold cursor-pointer"
                style={{
                  background: 'var(--color-muted)',
                  color: 'var(--color-text)',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  opacity: isInfinite ? 0.4 : 1,
                }}
              >
                -
              </button>
              <input
                type="number"
                min={1}
                max={999}
                value={isInfinite ? '' : questionCount}
                onChange={(e) => setQuestionCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                disabled={isInfinite}
                placeholder={isInfinite ? '∞' : ''}
                className="w-20 px-3 py-2 text-sm text-center outline-none"
                style={{
                  background: 'var(--color-muted)',
                  color: 'var(--color-text)',
                  border: '2px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  opacity: isInfinite ? 0.4 : 1,
                }}
              />
              <button
                onClick={() => setQuestionCount((c) => c + 1)}
                disabled={isInfinite}
                className="w-8 h-8 text-lg font-bold cursor-pointer"
                style={{
                  background: 'var(--color-muted)',
                  color: 'var(--color-text)',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  opacity: isInfinite ? 0.4 : 1,
                }}
              >
                +
              </button>
              <label className="flex items-center gap-2 cursor-pointer text-sm ml-2" style={{ color: 'var(--color-text)' }}>
                <input
                  type="checkbox"
                  checked={isInfinite}
                  onChange={() => setIsInfinite((v) => !v)}
                  style={{ accentColor: 'var(--color-primary)' }}
                />
                Infinity
              </label>
            </div>
          </div>

          <Button
            variant="primary"
            className="w-full"
            onClick={() => onStart({ difficulty, questionTypes: types, direction, questionCount, isInfinite })}
          >
            Start Game
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

// --- Main Game ---

function BlockBuilderMode({ cards, setId, exitUrl }: BlockBuilderModeProps) {
  const navigate = useNavigate();
  const reduce = !!useReducedMotion();
  const shakeControls = useAnimationControls();

  // CONTRACT A: exit to the caller-provided URL when present, else the private set page.
  const exitTo = exitUrl ?? `/sets/${setId}`;

  const [phase, setPhase] = useState<'config' | 'game' | 'results'>('config');
  const [config, setConfig] = useState<GameConfig | null>(null);
  const [questions, setQuestions] = useState<GameQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [gameState, setGameState] = useState<GameState>('playing');

  // Tower & lava state
  const [towerHeight, setTowerHeight] = useState(0);
  const [lavaHeight, setLavaHeight] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [totalAnswered, setTotalAnswered] = useState(0);

  // Question UI state
  const [userAnswer, setUserAnswer] = useState('');
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);

  const questionStartTimeRef = useRef(0);

  const settings = config ? DIFFICULTY_MAP[config.difficulty] : DIFFICULTY_MAP.medium;
  // M7 fix: the win target scales with the real question count so counts 1-4 are
  // winnable. Each correct answer adds one 40px block, so summitHeight must be
  // reachable within questionCount blocks. The 200 floor is kept ONLY for the
  // visual container height (maxVisualHeight below), never for the win target.
  const summitHeight = config
    ? (config.isInfinite ? 400 : config.questionCount * 40)
    : 400;

  const currentQuestion = questions[currentIndex] ?? null;

  // Confetti celebration on a win (reduced-motion aware).
  useEffect(() => {
    if (gameState !== 'won' || reduce) return;
    const colors = ['#fbbf24', '#f97316', '#7c5cff', '#22c55e'];
    const end = Date.now() + 900;
    let raf = 0;
    const frame = () => {
      confetti({ particleCount: 4, angle: 60, spread: 60, startVelocity: 45, origin: { x: 0, y: 0.7 }, colors });
      confetti({ particleCount: 4, angle: 120, spread: 60, startVelocity: 45, origin: { x: 1, y: 0.7 }, colors });
      if (Date.now() < end) raf = requestAnimationFrame(frame);
    };
    frame();
    return () => cancelAnimationFrame(raf);
  }, [gameState, reduce]);

  // CONTRACT A: Escape exits to exitTo (viewer-safe) once the game has started.
  useEffect(() => {
    if (phase === 'config') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') navigate(exitTo);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, navigate, exitTo]);

  const resetQuestionState = () => {
    setUserAnswer('');
    setSelectedOption(null);
    setFeedback(null);
  };

  const handleStart = useCallback((cfg: GameConfig) => {
    const q = buildGameQuestions(cards, cfg);
    setConfig(cfg);
    setQuestions(q);
    setCurrentIndex(0);
    setGameState('playing');
    setTowerHeight(0);
    setLavaHeight(0);
    setScore(0);
    setStreak(0);
    setMaxStreak(0);
    setCorrectCount(0);
    setTotalAnswered(0);
    resetQuestionState();
    questionStartTimeRef.current = Date.now();
    setPhase('game');
  }, [cards]);

  const processAnswer = useCallback((isCorrect: boolean) => {
    const timeSpent = (Date.now() - questionStartTimeRef.current) / 1000;
    setTotalAnswered((t) => t + 1);

    if (isCorrect) {
      setCorrectCount((c) => c + 1);
      const newStreak = streak + 1;
      setStreak(newStreak);
      setMaxStreak((m) => Math.max(m, newStreak));

      // Score calculation
      const speedBonus = Math.max(0, Math.min(50, 50 * (1 - timeSpent / 15)));
      const streakMult = Math.min(2, 1 + (newStreak - 1) * 0.1);
      const points = Math.round((100 + speedBonus) * streakMult * settings.scoreMultiplier);
      setScore((s) => s + points);

      // Add block
      const newHeight = towerHeight + 40;
      setTowerHeight(newHeight);

      // Check win
      if (newHeight >= summitHeight) {
        setGameState('won');
        return;
      }
    } else {
      setStreak(0);
      // Block penalty — remove blocks on medium/hard
      const penalty = settings.blockPenalty * 40;
      const newTower = Math.max(0, towerHeight - penalty);
      setTowerHeight(newTower);

      // Lava rises on wrong answers
      const newLava = lavaHeight + settings.lavaRise;
      setLavaHeight(newLava);

      // Subtle screen shake on a wrong answer (reduced-motion aware).
      if (!reduce) {
        shakeControls.start({
          x: [0, -8, 8, -6, 6, -3, 3, 0],
          transition: { duration: 0.42, ease: 'easeInOut' },
        });
      }

      // Check lose: lava overtakes tower.
      // L7 fix: an emptied tower under risen lava is a loss too — the previous
      // `&& newTower > 0` guard made the loss impossible once the tower hit 0.
      // This branch only runs on an answer, so "at least one answer" always holds.
      if (newLava >= newTower) {
        setGameState('lost');
        return;
      }
    }

    setFeedback(isCorrect ? 'correct' : 'wrong');
  }, [streak, towerHeight, lavaHeight, summitHeight, settings, reduce, shakeControls]);

  const advance = useCallback(() => {
    if (currentIndex + 1 >= questions.length) {
      if (config?.isInfinite) {
        // Generate more questions, trim old ones to prevent unbounded growth
        const more = buildGameQuestions(cards, config);
        const keepCount = 20;
        setQuestions((prev) => {
          if (prev.length > keepCount) {
            const trimmed = prev.slice(-keepCount);
            setCurrentIndex(keepCount - 1);
            return [...trimmed, ...more];
          }
          return [...prev, ...more];
        });
      } else {
        // Out of questions but didn't reach summit = lose
        setGameState('lost');
        return;
      }
    }
    setCurrentIndex((i) => i + 1);
    resetQuestionState();
    questionStartTimeRef.current = Date.now();
  }, [currentIndex, questions.length, config, cards]);

  const checkWritten = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (feedback || !userAnswer.trim() || !currentQuestion) return;
    const isCorrect = gradeWrittenAnswer(userAnswer, currentQuestion.correctAnswers);
    processAnswer(isCorrect);
  }, [feedback, userAnswer, currentQuestion, processAnswer]);

  const checkMC = useCallback((option: string) => {
    if (feedback || !currentQuestion) return;
    setSelectedOption(option);
    const isCorrect = currentQuestion.correctAnswers.some(
      (a) => normalizeAnswer(a) === normalizeAnswer(option),
    );
    processAnswer(isCorrect);
  }, [feedback, currentQuestion, processAnswer]);

  const checkTF = useCallback((answer: boolean) => {
    if (feedback || !currentQuestion) return;
    const isCorrect = answer === currentQuestion.tfPair?.isCorrect;
    processAnswer(isCorrect);
  }, [feedback, currentQuestion, processAnswer]);

  const focusRing = useCallback((e: React.FocusEvent<HTMLElement>) => {
    if (e.currentTarget.matches(':focus-visible')) {
      e.currentTarget.style.boxShadow = 'var(--shadow-focus)';
    }
  }, []);
  const clearRing = useCallback((e: React.FocusEvent<HTMLElement>) => {
    e.currentTarget.style.boxShadow = '';
  }, []);

  if (phase === 'config') {
    return <ConfigScreen onStart={handleStart} reduce={reduce} />;
  }

  // Results screen
  if (gameState === 'won' || gameState === 'lost') {
    const accuracy = totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0;
    const won = gameState === 'won';

    return (
      <div className="relative max-w-2xl mx-auto px-4 py-8">
        <AuroraBackground reduce={reduce} />
        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          transition={reduce ? { duration: 0.2 } : { type: 'spring', stiffness: 240, damping: 24 }}
          className="relative overflow-hidden p-8 text-center"
          style={{
            zIndex: 10,
            background: 'var(--color-surface)',
            boxShadow: 'var(--shadow-modal)',
            borderRadius: 'var(--radius-xl)',
            border: '1px solid var(--color-border-light)',
          }}
        >
          {/* Loss: lava overtakes the card. Win: nothing behind the content. */}
          {!won && (
            <motion.div
              aria-hidden
              className="absolute left-0 right-0 bottom-0"
              style={{
                height: '100%',
                background:
                  'linear-gradient(0deg, #b91c1c 0%, #ef4444 45%, #f97316 80%, rgba(251,191,36,0) 100%)',
                opacity: 0.16,
                zIndex: 0,
                willChange: 'transform',
              }}
              initial={reduce ? { y: '55%' } : { y: '100%' }}
              animate={{ y: '55%' }}
              transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 60, damping: 16, delay: 0.15 }}
            />
          )}

          <div className="relative" style={{ zIndex: 1 }}>
            <motion.div
              className="text-6xl mb-2"
              aria-hidden
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0, rotate: won ? -35 : 0, y: won ? 10 : 0 }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, rotate: 0, y: 0 }}
              transition={reduce ? { duration: 0.2 } : { type: 'spring', stiffness: 260, damping: 14, delay: 0.1 }}
            >
              {won ? '🚩' : '🌋'}
            </motion.div>

            <h2 className="text-3xl font-bold mb-2" style={{ color: 'var(--color-text)' }}>
              {won ? 'Tower Complete!' : 'Lava Wins!'}
            </h2>
            <p className="text-lg mb-6" style={{ color: 'var(--color-text-secondary)' }}>
              {won
                ? 'You built your tower to the summit!'
                : 'The lava overtook your tower.'}
            </p>

            <div className="grid grid-cols-2 gap-4 mb-6">
              {[
                { value: score, label: 'Score', color: 'var(--color-primary)' },
                { value: `${accuracy}%`, label: 'Accuracy', color: 'var(--color-success)' },
                { value: maxStreak, label: 'Best Streak', color: 'var(--color-warning)' },
                { value: totalAnswered, label: 'Questions', color: 'var(--color-text)' },
              ].map((stat, i) => (
                <motion.div
                  key={stat.label}
                  className="p-4"
                  style={{ background: 'var(--color-muted)', borderRadius: 'var(--radius-lg)' }}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
                  animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
                  transition={reduce ? { duration: 0.2 } : { delay: 0.2 + i * 0.07, type: 'spring', stiffness: 300, damping: 24 }}
                >
                  <div className="text-2xl font-bold" style={{ color: stat.color }}>{stat.value}</div>
                  <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{stat.label}</div>
                </motion.div>
              ))}
            </div>

            <div className="flex gap-3 justify-center">
              <Button variant="primary" onClick={() => setPhase('config')}>
                Play Again
              </Button>
              <Button variant="outline" onClick={() => navigate(exitTo)}>
                Exit
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!currentQuestion) return null;

  const towerBlocks = Math.floor(towerHeight / 40);
  // 200 floor lives here (visual only, via the 400 container) — never in summitHeight.
  const maxVisualHeight = Math.max(summitHeight, 400);
  const lavaPercent = (lavaHeight / maxVisualHeight) * 100;
  const summitPercent = Math.min(95, (summitHeight / maxVisualHeight) * 100);
  const progressPct = Math.min(100, Math.round((towerHeight / summitHeight) * 100));
  const nearSummit = summitHeight > 0 && towerHeight >= summitHeight * 0.7;

  const totalLabel = config?.isInfinite ? '∞' : config?.questionCount ?? questions.length;

  return (
    <div className="relative max-w-4xl mx-auto px-4 py-8">
      <AuroraBackground reduce={reduce} />

      <div className="relative" style={{ zIndex: 10 }}>
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => navigate(exitTo)}>
            Exit
          </Button>
          <div className="flex items-center gap-2 flex-wrap">
            <Pill tone="primary">
              <motion.span
                key={score}
                initial={reduce ? undefined : { scale: 1.3 }}
                animate={reduce ? undefined : { scale: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 18 }}
              >
                {score}
              </motion.span>
              <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 500 }}>pts</span>
            </Pill>
            <Pill tone="warning">
              <span aria-hidden>🔥</span>
              <motion.span
                key={streak}
                initial={reduce || streak === 0 ? undefined : { scale: 1.35 }}
                animate={reduce ? undefined : { scale: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 16 }}
              >
                {streak}
              </motion.span>
            </Pill>
            <Pill>
              Q{currentIndex + 1}
              <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 500 }}>/ {totalLabel}</span>
            </Pill>
          </div>
        </div>

        <motion.div className="flex flex-col md:flex-row gap-6" animate={shakeControls}>
          {/* Question panel */}
          <div className="flex-1">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentIndex}
                initial={reduce ? { opacity: 0 } : { opacity: 0, x: 24 }}
                animate={reduce ? { opacity: 1 } : { opacity: 1, x: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, x: -24 }}
                transition={reduce ? { duration: 0.15 } : { type: 'spring', stiffness: 320, damping: 30 }}
                className="p-6"
                style={{
                  background: 'var(--color-surface)',
                  boxShadow: 'var(--shadow-card)',
                  borderRadius: 'var(--radius-xl)',
                  border: '1px solid var(--color-border-light)',
                  borderLeft: feedback === 'correct'
                    ? '4px solid var(--color-success)'
                    : feedback === 'wrong'
                      ? '4px solid var(--color-danger)'
                      : '4px solid transparent',
                }}
              >
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
                      <Button variant="primary" type="submit" className="mt-3 w-full">Submit</Button>
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
                          disabled={feedback !== null}
                          whileTap={feedback || reduce ? undefined : { scale: 0.96 }}
                          whileHover={feedback || reduce ? undefined : { scale: 1.01, y: -2 }}
                          onFocus={focusRing}
                          onBlur={clearRing}
                          className="w-full text-left p-4 cursor-pointer"
                          style={{
                            background: bg,
                            border: `2px solid ${borderColor}`,
                            borderRadius: 'var(--radius-md)',
                            color: 'var(--color-text)',
                            outline: 'none',
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
                        <Button key={label} variant="outline" className="flex-1" onClick={() => checkTF(val)} disabled={feedback !== null}>
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

                {/* Feedback + next */}
                {feedback && (
                  <motion.div
                    initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
                    animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
                    className="mt-4"
                  >
                    {feedback === 'correct' ? (
                      <div className="p-3" style={{ background: 'var(--color-success-light)', borderRadius: 'var(--radius-md)' }}>
                        <p className="font-semibold" style={{ color: 'var(--color-success)' }}>Correct!</p>
                      </div>
                    ) : (
                      <div className="p-3" style={{ background: 'var(--color-danger-light)', borderRadius: 'var(--radius-md)' }}>
                        <p className="font-semibold mb-1" style={{ color: 'var(--color-danger)' }}>Incorrect</p>
                        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                          Correct: <span className="font-medium" style={{ color: 'var(--color-text)' }}>{stripHtml(currentQuestion.correctAnswers[0])}</span>
                        </p>
                      </div>
                    )}
                    <Button variant="primary" className="w-full mt-3" onClick={advance}>Next</Button>
                  </motion.div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Tower visualization */}
          <div
            className="w-full md:w-48 flex-shrink-0 relative overflow-hidden"
            style={{
              height: 400,
              background: 'linear-gradient(180deg, var(--color-surface-raised), var(--color-muted))',
              borderRadius: 'var(--radius-xl)',
              border: '1px solid var(--color-border-light)',
              boxShadow: 'var(--shadow-xs)',
            }}
          >
            {/* Summit marker — glows and pulses as you near it */}
            <motion.div
              className="absolute left-0 right-0"
              style={{ bottom: `${summitPercent}%`, zIndex: 3 }}
              animate={nearSummit && !reduce ? { opacity: [0.55, 1, 0.55] } : { opacity: 0.7 }}
              transition={nearSummit && !reduce ? { duration: 1.4, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
            >
              <div
                className="border-t-2 border-dashed"
                style={{
                  borderColor: 'var(--color-warning)',
                  boxShadow: nearSummit ? '0 0 12px 1px var(--color-warning)' : 'none',
                }}
              />
              <span className="absolute right-1 -top-4 text-xs font-semibold" style={{ color: 'var(--color-warning)' }}>
                Summit
              </span>
            </motion.div>

            {/* Tower blocks — spring/drop into place with a settle wobble */}
            <div className="absolute bottom-0 left-0 right-0 flex flex-col-reverse items-center" style={{ zIndex: 2 }}>
              <AnimatePresence>
                {Array.from({ length: towerBlocks }).map((_, i) => {
                  const hue = (210 + i * 24) % 360;
                  return (
                    <motion.div
                      key={i}
                      initial={reduce ? { opacity: 0 } : { opacity: 0, y: -80, scale: 0.5 }}
                      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                      exit={reduce ? { opacity: 0 } : { opacity: 0, y: -40, scale: 0.6, transition: { duration: 0.22 } }}
                      transition={reduce ? { duration: 0.15 } : { type: 'spring', stiffness: 500, damping: 12, mass: 0.8 }}
                      style={{
                        width: '75%',
                        height: 38,
                        marginTop: 2,
                        background: `linear-gradient(180deg, hsl(${hue}, 78%, 62%), hsl(${hue}, 72%, 48%))`,
                        borderRadius: 4,
                        boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.35), 0 2px 5px rgba(0,0,0,0.22)',
                        willChange: 'transform',
                      }}
                    />
                  );
                })}
              </AnimatePresence>
            </div>

            {/* Lava — full-height layer revealed via transform (GPU-friendly) */}
            <motion.div
              aria-hidden
              className="absolute left-0 right-0 bottom-0"
              style={{
                height: '100%',
                background: 'linear-gradient(0deg, #7f1d1d 0%, #dc2626 35%, #f97316 70%, #fbbf24 100%)',
                backgroundSize: '100% 240%',
                zIndex: 4,
                willChange: 'transform',
                animation: reduce ? 'none' : 'bbLavaChurn 3.2s ease-in-out infinite',
              }}
              animate={{ y: `${100 - Math.min(100, lavaPercent)}%` }}
              transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 90, damping: 18 }}
            >
              {/* Glowing bubbling surface at the lava line */}
              <div
                className="absolute top-0 left-0 right-0"
                style={{
                  height: 6,
                  background: 'linear-gradient(90deg, transparent, rgba(255,240,200,0.85), transparent)',
                  boxShadow: '0 -6px 22px 4px rgba(249,115,22,0.65)',
                  animation: reduce ? 'none' : 'bbLavaWave 2s ease-in-out infinite',
                }}
              />
            </motion.div>

            {/* Progress overlay */}
            <div className="absolute top-2 left-2 right-2 text-center" style={{ zIndex: 5 }}>
              <div
                className="inline-block px-2 py-0.5 text-xs font-bold"
                style={{
                  background: 'var(--color-surface)',
                  color: nearSummit ? 'var(--color-warning)' : 'var(--color-text-secondary)',
                  borderRadius: 'var(--radius-full)',
                  boxShadow: 'var(--shadow-xs)',
                }}
              >
                {progressPct}%
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Inline keyframes for lava churn / bubbling surface */}
      <style>{`
        @keyframes bbLavaWave {
          0%, 100% { transform: translateX(-100%); }
          50% { transform: translateX(100%); }
        }
        @keyframes bbLavaChurn {
          0%, 100% { background-position: 0% 0%; }
          50% { background-position: 0% 100%; }
        }
      `}</style>
    </div>
  );
}

export default BlockBuilderMode;
