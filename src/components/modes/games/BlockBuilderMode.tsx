import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion, useAnimationControls } from 'framer-motion';
import type { Card, QuestionType, AnswerDirection } from '@/types';
import { useNavigate } from 'react-router-dom';
import { fairRepeatCards } from '@/lib/utils';
import { buildEquivalenceGroups } from '@/lib/equivalence';
import { buildGameQuestion, gradeGameAnswer, type GameQuestion } from '@/lib/gameQuestions';
import { submitScore } from '@/lib/gameRecords';
import { playSound } from '@/lib/gameSounds';
import { Button } from '@/components/ui/Button';
import { Mascot, type MascotMood } from '@/components/games/Mascot';
import { ScorePopups } from '@/components/games/ScorePopup';
import {
  ChoicePills,
  ComboMeter,
  Countdown,
  EscBanner,
  GameTopBar,
  PlayButton,
  QuestionPanel,
  ResultsPanel,
  ScoreCounter,
  SetupSection,
  type Feedback,
} from '@/components/games/GameKit';
import {
  celebrate,
  comboMultiplier,
  formatMultiplier,
  useAnswerKeys,
  useEscToQuit,
  usePopups,
} from '@/components/games/gameLogic';

interface BlockBuilderModeProps {
  cards: Card[];
  setId: string;
  exitUrl?: string;
}

type Difficulty = 'easy' | 'medium' | 'hard';

interface DifficultySettings {
  /** Blocks knocked off the top by a wrong answer. */
  blockPenalty: number;
  /** Lava rise per wrong answer, in block units. */
  lavaRise: number;
  scoreMultiplier: number;
}

const DIFFICULTY_MAP: Record<Difficulty, DifficultySettings> = {
  easy: { blockPenalty: 0, lavaRise: 0.5, scoreMultiplier: 1 },
  medium: { blockPenalty: 1, lavaRise: 0.75, scoreMultiplier: 1.5 },
  hard: { blockPenalty: 2, lavaRise: 1, scoreMultiplier: 2 },
};

/** You lose once lava reaches the tower top plus this many blocks. Without a
 *  buffer the first wrong answer on an empty tower would end every game. */
const LAVA_GRACE = 2;
/** Block units visible in the scene; the camera follows taller towers. */
const VISIBLE_UNITS = 11;
/** Share of the questions you must stack to reach the summit. */
const SUMMIT_SHARE = 0.7;

const BRICK_COLORS = ['#e8804a', '#f2b33d', '#4fa3e0', '#6cbf73', '#a98be0', '#e86f8a'];

// Scene art — fixed colors so the sky/volcano read the same in both themes.
const SCENE = {
  skyTop: '#7cc8f6',
  skyBottom: '#dff3ff',
  far: '#9cc4dd',
  near: '#6f98b3',
  rock: '#4a3b35',
  lava: ['#fff1b8', '#ffb020', '#f0592a', '#b3201d'],
};

interface GameConfig {
  difficulty: Difficulty;
  questionTypes: QuestionType[];
  direction: AnswerDirection;
  questionCount: number;
  endless: boolean;
}

function buildQuestions(cards: Card[], groups: Map<string, Card[]>, config: GameConfig, offset = 0): GameQuestion[] {
  const count = config.endless ? Math.max(20, cards.length) : config.questionCount;
  return fairRepeatCards(cards, count).map((card, i) =>
    buildGameQuestion(card, cards, groups, config.questionTypes[(offset + i) % config.questionTypes.length], config.direction, offset + i),
  );
}

// ---------- Setup ----------

function ConfigScreen({ onStart, cardCount }: { onStart: (config: GameConfig) => void; cardCount: number }) {
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [types, setTypes] = useState<QuestionType[]>(['multiple-choice', 'true-false', 'written']);
  const [direction, setDirection] = useState<AnswerDirection>('term-to-def');
  const [length, setLength] = useState<number | 'endless'>(Math.min(10, Math.max(5, cardCount)));

  const toggleType = (type: QuestionType) =>
    setTypes((prev) => (prev.includes(type) ? (prev.length > 1 ? prev.filter((t) => t !== type) : prev) : [...prev, type]));

  const lengths: (number | 'endless')[] = [5, 10, 15, 20, 'endless'];

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <div className="rounded-3xl overflow-hidden" style={{ boxShadow: '0 20px 50px rgba(0,0,0,0.18)' }}>
        <SceneBackdrop compact>
          <div className="flex items-end justify-center gap-3 h-full pb-4">
            <Mascot mood="happy" color="#f2b33d" accessory="hardhat" size={84} />
            <div className="pb-3 text-left">
              <h2 className="text-3xl font-extrabold" style={{ color: '#17324a', fontFamily: 'var(--font-display)' }}>
                Block Builder
              </h2>
              <p className="text-sm font-semibold" style={{ color: '#2d5575' }}>
                Every right answer stacks a brick. Wrong ones raise the lava.
              </p>
            </div>
          </div>
        </SceneBackdrop>
        <div className="p-6 flex flex-col gap-6" style={{ background: 'var(--color-surface)' }}>
          <SetupSection label="Difficulty">
            <ChoicePills
              options={[
                { value: 'easy', label: 'Easy' },
                { value: 'medium', label: 'Medium ×1.5' },
                { value: 'hard', label: 'Hard ×2' },
              ]}
              isSelected={(v) => v === difficulty}
              onToggle={setDifficulty}
              accent="#e8804a"
            />
          </SetupSection>
          <SetupSection label="Questions">
            <ChoicePills
              options={lengths.map((l) => ({ value: String(l), label: l === 'endless' ? 'Endless' : String(l) }))}
              isSelected={(v) => v === String(length)}
              onToggle={(v) => setLength(v === 'endless' ? 'endless' : Number(v))}
              accent="#e8804a"
            />
          </SetupSection>
          <SetupSection label="Question types">
            <ChoicePills
              options={[
                { value: 'multiple-choice', label: 'Multiple choice' },
                { value: 'true-false', label: 'True or false' },
                { value: 'written', label: 'Written' },
              ]}
              isSelected={(v) => types.includes(v)}
              onToggle={toggleType}
              accent="#e8804a"
            />
          </SetupSection>
          <SetupSection label="Answer with">
            <ChoicePills
              options={[
                { value: 'term-to-def', label: 'Definitions' },
                { value: 'def-to-term', label: 'Terms' },
                { value: 'both', label: 'Both' },
              ]}
              isSelected={(v) => v === direction}
              onToggle={setDirection}
              accent="#e8804a"
            />
          </SetupSection>
          <PlayButton
            color="#e8804a"
            onClick={() =>
              onStart({
                difficulty,
                questionTypes: types,
                direction,
                questionCount: length === 'endless' ? 0 : length,
                endless: length === 'endless',
              })
            }
          >
            Start building
          </PlayButton>
        </div>
      </div>
    </div>
  );
}

// ---------- Scene ----------

function SceneBackdrop({ children, compact, danger }: { children?: React.ReactNode; compact?: boolean; danger?: boolean }) {
  return (
    <div
      className="relative overflow-hidden"
      style={{
        height: compact ? 150 : '100%',
        background: `linear-gradient(180deg, ${SCENE.skyTop}, ${SCENE.skyBottom})`,
      }}
    >
      <div aria-hidden className="bb-cloud" style={{ top: '14%', animationDuration: '38s' }} />
      <div aria-hidden className="bb-cloud" style={{ top: '34%', animationDuration: '52s', animationDelay: '-20s', transform: 'scale(0.7)' }} />
      <svg aria-hidden className="absolute bottom-0 left-0 w-full" viewBox="0 0 400 120" preserveAspectRatio="none" style={{ height: '45%' }}>
        <path d="M0 120 L0 70 L60 30 L110 62 L170 18 L230 60 L290 26 L350 66 L400 40 L400 120 Z" fill={SCENE.far} />
        <path d="M0 120 L0 92 L80 58 L150 88 L220 50 L300 90 L360 70 L400 84 L400 120 Z" fill={SCENE.near} />
      </svg>
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none transition-opacity duration-500"
        style={{ boxShadow: 'inset 0 0 80px 10px rgba(229,56,40,0.55)', opacity: danger ? 1 : 0 }}
      />
      <div className="absolute inset-0">{children}</div>
    </div>
  );
}

function TowerScene({
  blocks,
  lavaUnits,
  summitUnits,
  mood,
  popups,
  onPopupDone,
}: {
  blocks: number[];
  lavaUnits: number;
  summitUnits: number | null;
  mood: MascotMood;
  popups: ReturnType<typeof usePopups>['popups'];
  onPopupDone: (id: number) => void;
}) {
  const reduce = useReducedMotion();
  const tower = blocks.length;
  // Camera: once the tower passes 7 blocks, scroll so its top stays in view.
  const camBase = Math.max(0, tower - 7);
  const unitPct = 100 / VISIBLE_UNITS;
  const toPct = (units: number) => (units - camBase) * unitPct;
  const danger = lavaUnits >= tower + LAVA_GRACE - 1;
  const lavaPct = Math.max(0, Math.min(100, toPct(Math.min(lavaUnits, tower + LAVA_GRACE))));

  return (
    <SceneBackdrop danger={danger}>
      {/* Summit flag */}
      {summitUnits !== null && toPct(summitUnits) <= 100 && (
        <div className="absolute left-0 right-0" style={{ bottom: `${toPct(summitUnits)}%`, zIndex: 2 }}>
          <div className="border-t-[3px] border-dashed" style={{ borderColor: 'rgba(23,50,74,0.55)' }} />
          <div className="absolute right-3 bottom-0 flex items-end">
            <div style={{ width: 3, height: 34, background: '#17324a' }} />
            <motion.div
              className="origin-left"
              animate={reduce ? undefined : { skewY: [0, -8, 0] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
              style={{ width: 26, height: 18, background: '#e5484d', marginBottom: 16, clipPath: 'polygon(0 0, 100% 50%, 0 100%)' }}
            />
          </div>
          <span className="absolute left-3 -top-6 text-xs font-extrabold" style={{ color: '#17324a', fontFamily: 'var(--font-display)' }}>
            Summit
          </span>
        </div>
      )}

      {/* Rock base (only when the camera is at ground level) */}
      {camBase === 0 && (
        <div className="absolute left-0 right-0 bottom-0" style={{ height: `${unitPct * 0.35}%`, background: SCENE.rock, zIndex: 1 }} />
      )}

      {/* Tower */}
      <div className="absolute inset-0" style={{ zIndex: 3 }}>
        <AnimatePresence>
          {blocks.map((id, i) => {
            if (i < camBase - 1) return null;
            const color = BRICK_COLORS[id % BRICK_COLORS.length];
            const jitter = ((id * 37) % 9) - 4;
            return (
              <motion.div
                key={id}
                className="absolute rounded-md"
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: -160, rotate: jitter * 2 }}
                animate={{ opacity: 1, y: 0, rotate: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: 40, rotate: jitter * 6, transition: { duration: 0.35 } }}
                transition={reduce ? { duration: 0.15 } : { type: 'spring', stiffness: 520, damping: 16, mass: 0.9 }}
                style={{
                  left: `calc(50% - 26% + ${jitter}px)`,
                  width: '52%',
                  bottom: `calc(${toPct(i + 0.35)}% + 1px)`,
                  height: `calc(${unitPct}% - 3px)`,
                  boxShadow: 'inset 0 -4px 0 rgba(0,0,0,0.18), 0 2px 0 rgba(0,0,0,0.15)',
                  // top highlight + a center mortar joint
                  backgroundImage: `linear-gradient(90deg, transparent 49%, rgba(0,0,0,0.12) 49% 51%, transparent 51%), linear-gradient(180deg, color-mix(in srgb, ${color} 75%, white) 0 18%, ${color} 18% 100%)`,
                }}
              />
            );
          })}
        </AnimatePresence>

        {/* Mascot rides the top of the tower */}
        <motion.div
          className="absolute left-1/2"
          style={{ x: '-50%', zIndex: 4 }}
          initial={false}
          animate={{ bottom: `calc(${toPct(tower + 0.35)}% - 6px)` }}
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 20 }}
        >
          <Mascot mood={mood} color="#f2b33d" accessory="hardhat" size={66} />
        </motion.div>
      </div>

      {/* Lava */}
      <motion.div
        aria-hidden
        className="absolute left-0 right-0 bottom-0 overflow-visible"
        style={{
          zIndex: 5,
          background: `linear-gradient(180deg, ${SCENE.lava[1]} 0%, ${SCENE.lava[2]} 35%, ${SCENE.lava[3]} 100%)`,
        }}
        initial={false}
        animate={{ height: `${lavaPct}%` }}
        transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 80, damping: 16 }}
      >
        {lavaPct > 0 && (
          <>
            <div className="bb-lava-surface" />
            <span className="bb-bubble" style={{ left: '18%', animationDelay: '0s' }} />
            <span className="bb-bubble" style={{ left: '52%', animationDelay: '0.9s' }} />
            <span className="bb-bubble" style={{ left: '78%', animationDelay: '1.6s' }} />
          </>
        )}
      </motion.div>

      <ScorePopups popups={popups} onDone={onPopupDone} />

      {/* Height readout */}
      <div
        className="absolute top-3 left-3 px-2.5 py-1 rounded-lg text-sm font-extrabold tabular-nums"
        style={{ background: 'rgba(255,255,255,0.8)', color: '#17324a', fontFamily: 'var(--font-display)', zIndex: 6 }}
      >
        {tower}
        {summitUnits !== null ? ` / ${summitUnits}` : ''} blocks
      </div>
    </SceneBackdrop>
  );
}

// ---------- Game ----------

function BlockBuilderMode({ cards, setId, exitUrl }: BlockBuilderModeProps) {
  const navigate = useNavigate();
  const reduce = !!useReducedMotion();
  const shake = useAnimationControls();
  const exitTo = exitUrl ?? `/sets/${setId}`;
  const exit = useCallback(() => navigate(exitTo), [navigate, exitTo]);
  const groups = useMemo(() => buildEquivalenceGroups(cards), [cards]);

  const [phase, setPhase] = useState<'config' | 'countdown' | 'game' | 'won' | 'lost'>('config');
  const [config, setConfig] = useState<GameConfig | null>(null);
  const [questions, setQuestions] = useState<GameQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [asked, setAsked] = useState(0);

  const [blocks, setBlocks] = useState<number[]>([]);
  const blockIdRef = useRef(0);
  const [lavaUnits, setLavaUnits] = useState(0);
  const [score, setScore] = useState(0);
  // Read by delayed callbacks (auto-advance), which would otherwise see the
  // score from before the answer that scheduled them.
  const scoreRef = useRef(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [lastPoints, setLastPoints] = useState<number | null>(null);
  const [ending, setEnding] = useState(false);
  const [mood, setMood] = useState<MascotMood>('idle');
  const [best, setBest] = useState<ReturnType<typeof submitScore> | undefined>();
  const { popups, push, remove } = usePopups();

  const questionStart = useRef(0);
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const later = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  }, []);
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const settings = config ? DIFFICULTY_MAP[config.difficulty] : DIFFICULTY_MAP.medium;
  const summitUnits = config && !config.endless ? Math.max(1, Math.ceil(config.questionCount * SUMMIT_SHARE)) : null;
  const question = questions[index] ?? null;
  const playing = phase === 'game';

  const escArmed = useEscToQuit(phase !== 'config', playing, exit);

  const start = useCallback(
    (cfg: GameConfig) => {
      timers.current.forEach(clearTimeout);
      timers.current.clear();
      setConfig(cfg);
      setQuestions(buildQuestions(cards, groups, cfg));
      setIndex(0);
      setAsked(1);
      setBlocks([]);
      blockIdRef.current = 0;
      setLavaUnits(0);
      setScore(0);
      scoreRef.current = 0;
      setStreak(0);
      setMaxStreak(0);
      setCorrect(0);
      setAnswered(0);
      setFeedback(null);
      setSelected(null);
      setLastPoints(null);
      setEnding(false);
      setMood('idle');
      setBest(undefined);
      setPhase('countdown');
    },
    [cards, groups],
  );

  const finish = useCallback(
    (result: 'won' | 'lost', finalScore: number) => {
      if (!config) return;
      const variant = `${config.difficulty}-${config.endless ? 'endless' : config.questionCount}`;
      setBest(submitScore('block-builder', setId, finalScore, variant));
      setMood(result === 'won' ? 'celebrate' : 'sad');
      setPhase(result);
      playSound(result === 'won' ? 'win' : 'lose');
    },
    [config, setId],
  );

  useEffect(() => {
    if (phase === 'won' || (phase === 'lost' && config?.endless && blocks.length >= 10)) {
      return celebrate(['#e8804a', '#f2b33d', '#4fa3e0', '#6cbf73']);
    }
  }, [phase, config?.endless, blocks.length]);

  const advance = useCallback(() => {
    if (!config) return;
    let next = index + 1;
    if (next >= questions.length) {
      if (!config.endless) {
        finish('lost', scoreRef.current);
        return;
      }
      // Endless: append a fresh batch, keeping only a short tail.
      const more = buildQuestions(cards, groups, config, asked);
      const tail = questions.slice(-10);
      setQuestions([...tail, ...more]);
      next = tail.length;
    }
    setIndex(next);
    setAsked((a) => a + 1);
    setFeedback(null);
    setSelected(null);
    setLastPoints(null);
    setMood('idle');
    questionStart.current = Date.now();
  }, [config, index, questions, asked, cards, groups, finish]);

  const answer = useCallback(
    (isRight: boolean) => {
      if (!config || feedback) return;
      const seconds = (Date.now() - questionStart.current) / 1000;
      setAnswered((a) => a + 1);

      if (isRight) {
        playSound('correct');
        const nextStreak = streak + 1;
        const mult = comboMultiplier(nextStreak);
        if (mult > comboMultiplier(streak)) {
          playSound('combo');
          push({ text: `${formatMultiplier(mult)} combo!`, color: '#e5484d', x: 38, y: 22 });
        }
        const speed = Math.round(Math.max(0, 50 * (1 - seconds / 12)));
        const points = Math.round((100 + speed) * mult * settings.scoreMultiplier);
        const newScore = score + points;
        const newBlocks = [...blocks, blockIdRef.current++];
        setStreak(nextStreak);
        setMaxStreak((m) => Math.max(m, nextStreak));
        setCorrect((c) => c + 1);
        setScore(newScore);
        scoreRef.current = newScore;
        setBlocks(newBlocks);
        setLastPoints(points);
        setFeedback('correct');
        setMood(nextStreak >= 3 ? 'celebrate' : 'happy');
        push({ text: `+${points}`, color: '#17324a', x: 56, y: 40 });

        if (summitUnits !== null && newBlocks.length >= summitUnits) {
          setEnding(true);
          later(() => finish('won', newScore), 1100);
        } else {
          // Right answers keep the pace up: move on automatically.
          later(() => advance(), reduce ? 500 : 950);
        }
      } else {
        playSound('wrong');
        const kept = settings.blockPenalty > 0 ? blocks.slice(0, Math.max(0, blocks.length - settings.blockPenalty)) : blocks;
        if (kept.length < blocks.length) later(() => playSound('crumble'), 120);
        const newLava = lavaUnits + settings.lavaRise;
        setStreak(0);
        setBlocks(kept);
        setLavaUnits(newLava);
        setFeedback('wrong');
        setLastPoints(null);
        setMood(newLava >= kept.length + LAVA_GRACE - 1 ? 'worried' : 'sad');
        if (!reduce) shake.start({ x: [0, -10, 10, -6, 6, 0], transition: { duration: 0.4 } });

        if (newLava >= kept.length + LAVA_GRACE) {
          setEnding(true);
          later(() => finish('lost', scoreRef.current), 1300);
        }
      }
    },
    [config, feedback, streak, settings, score, blocks, lavaUnits, summitUnits, push, later, finish, advance, reduce, shake],
  );

  const onWritten = useCallback((text: string) => question && answer(gradeGameAnswer(question, { written: text })), [question, answer]);
  const onOption = useCallback(
    (option: string) => {
      if (!question || feedback) return;
      setSelected(option);
      answer(gradeGameAnswer(question, { option }));
    },
    [question, feedback, answer],
  );
  const onTrueFalse = useCallback((tf: boolean) => question && answer(gradeGameAnswer(question, { tf })), [question, answer]);
  useAnswerKeys(question, playing && !feedback, onOption, onTrueFalse);

  // Enter moves on after reading a wrong-answer correction.
  useEffect(() => {
    if (!playing || feedback !== 'wrong' || ending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        advance();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing, feedback, ending, advance]);

  if (phase === 'config') return <ConfigScreen onStart={start} cardCount={cards.length} />;

  if (phase === 'won' || phase === 'lost') {
    const accuracy = answered > 0 ? Math.round((correct / answered) * 100) : 0;
    const endless = !!config?.endless;
    const stars = endless
      ? blocks.length >= 30 ? 3 : blocks.length >= 18 ? 2 : blocks.length >= 8 ? 1 : 0
      : phase === 'won' ? (accuracy >= 95 ? 3 : accuracy >= 80 ? 2 : 1) : 0;
    return (
      <div className="relative min-h-[calc(100dvh-8rem)] flex items-center px-4 pt-24 pb-10">
        <ResultsPanel
          mascot={<Mascot mood={phase === 'won' || stars > 0 ? 'celebrate' : 'sad'} color="#f2b33d" accessory="hardhat" size={112} />}
          title={endless ? `${blocks.length} blocks high` : phase === 'won' ? 'You reached the summit' : 'The lava caught up'}
          subtitle={
            endless
              ? 'Endless run over.'
              : phase === 'won'
                ? `${correct} of ${answered} right on the way up.`
                : 'Review the cards you missed and climb again.'
          }
          stars={stars}
          score={score}
          best={best}
          stats={[
            { label: 'Accuracy', value: `${accuracy}%` },
            { label: 'Best streak', value: maxStreak },
            { label: 'Answered', value: answered },
          ]}
          actions={
            <>
              <Button variant="primary" onClick={() => config && start(config)}>Play again</Button>
              <Button variant="outline" onClick={() => setPhase('config')}>Change settings</Button>
              <Button variant="ghost" onClick={exit}>Exit</Button>
            </>
          }
        />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-4">
      <EscBanner show={escArmed} />
      {phase === 'countdown' && (
        <Countdown
          accent="#f2b33d"
          onDone={() => {
            questionStart.current = Date.now();
            setPhase('game');
          }}
        />
      )}

      <GameTopBar onExit={exit}>
        <ComboMeter streak={streak} />
        <ScoreCounter value={score} />
      </GameTopBar>

      <motion.div animate={shake} className="mt-4 flex flex-col md:flex-row gap-4 md:gap-6 items-stretch">
        <div
          className="w-full md:w-[340px] shrink-0 rounded-3xl overflow-hidden relative h-[34dvh] min-h-[220px] md:h-[min(560px,calc(100dvh-10rem))]"
          style={{ boxShadow: '0 16px 40px rgba(0,0,0,0.15)' }}
        >
          <TowerScene
            blocks={blocks}
            lavaUnits={lavaUnits}
            summitUnits={summitUnits}
            mood={mood}
            popups={popups}
            onPopupDone={remove}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2 text-sm font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
            <span>
              Question {asked}
              {config && !config.endless ? ` of ${config.questionCount}` : ''}
            </span>
            <span>{settings.blockPenalty > 0 ? `Wrong answers knock off ${settings.blockPenalty}` : 'No knock-offs on Easy'}</span>
          </div>
          <AnimatePresence mode="wait">
            {question && (
              <motion.div
                key={`${asked}`}
                initial={reduce ? { opacity: 0 } : { opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, x: -30 }}
                transition={{ type: 'spring', stiffness: 360, damping: 32 }}
                className="rounded-3xl p-5 sm:p-6"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' }}
              >
                <QuestionPanel
                  question={question}
                  feedback={feedback}
                  selectedOption={selected}
                  disabled={!playing}
                  onWritten={onWritten}
                  onOption={onOption}
                  onTrueFalse={onTrueFalse}
                  points={lastPoints}
                  footer={
                    feedback === 'wrong' && !ending ? (
                      <Button variant="primary" className="w-full mt-3" onClick={advance}>
                        Next question
                      </Button>
                    ) : null
                  }
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}

export default BlockBuilderMode;
