import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Crown, Zap } from 'lucide-react';
import type { Card, QuestionType, AnswerDirection } from '@/types';
import { useNavigate } from 'react-router-dom';
import { shuffleArray } from '@/lib/utils';
import { buildEquivalenceGroups } from '@/lib/equivalence';
import { buildGameQuestion, gradeGameAnswer, type GameQuestion } from '@/lib/gameQuestions';
import { playSound } from '@/lib/gameSounds';
import { Button } from '@/components/ui/Button';
import {
  ChoicePills,
  Countdown,
  EscBanner,
  GameTopBar,
  PlayButton,
  QuestionPanel,
  ResultsPanel,
  SetupSection,
  type Feedback,
} from '@/components/games/GameKit';
import {
  celebrate,
  useAnswerKeys,
  useEscToQuit,
} from '@/components/games/gameLogic';

interface RaceToFinishModeProps {
  cards: Card[];
  setId: string;
  exitUrl?: string;
}

type BotLevel = 'chill' | 'pro' | 'ace';

interface RaceConfig {
  playerCount: number;
  pathLength: number;
  direction: AnswerDirection;
  questionTypes: QuestionType[];
  bot: BotLevel | null;
}

interface Racer {
  id: number;
  name: string;
  color: string;
  position: number;
  correctCount: number;
  totalCount: number;
  isBot?: boolean;
}

const BOT_ACCURACY: Record<BotLevel, number> = { chill: 0.5, pro: 0.68, ace: 0.85 };
/** Answering within this many seconds earns one extra space. */
const QUICK_SECONDS = 6;

// Track art — fixed colors, identical in light and dark themes.
const TRACK = {
  grass: '#4f9d52',
  grassDark: '#3f8a45',
  asphalt: '#2f3542',
  lane: 'rgba(255,255,255,0.35)',
  nitro: '#22d3ee',
  bot: '#d946ef',
};
const RACER_COLORS = ['#ef4444', '#3b82f6', '#f59e0b', '#22c55e'];
const CONFETTI = ['#ef4444', '#3b82f6', '#f59e0b', '#22c55e', '#ffffff'];

// ---------- Art ----------

function Kart({ color, bot, size = 56 }: { color: string; bot?: boolean; size?: number }) {
  return (
    <svg width={size} height={size * 0.62} viewBox="0 0 64 40" aria-hidden style={{ overflow: 'visible' }}>
      <ellipse cx="32" cy="37" rx="26" ry="3" fill="rgba(0,0,0,0.35)" />
      {/* rear wing */}
      <rect x="2" y="9" width="6" height="14" rx="2" fill={color} />
      <rect x="2" y="7" width="12" height="4" rx="2" fill="#1f2430" />
      {/* body */}
      <path d="M6 26 Q6 16 18 16 L40 16 Q50 16 56 22 L60 26 Q62 30 58 30 L8 30 Q6 30 6 26 Z" fill={color} />
      <path d="M18 16 L40 16 Q48 16 53 20 L20 20 Z" fill="rgba(255,255,255,0.35)" />
      {/* driver */}
      <circle cx="30" cy="12" r="8" fill={bot ? '#e5e7eb' : '#ffffff'} stroke="#1f2430" strokeWidth="1.5" />
      <path d="M31 9 Q38 9 38 13 L31 14 Z" fill="#1f2430" />
      {bot && <line x1="26" y1="4" x2="24" y2="-2" stroke="#1f2430" strokeWidth="1.5" />}
      {bot && <circle cx="24" cy="-2.5" r="2" fill={TRACK.bot} />}
      {/* wheels */}
      <circle cx="16" cy="30" r="6.5" fill="#1f2430" />
      <circle cx="16" cy="30" r="2.5" fill="#9ca3af" />
      <circle cx="50" cy="30" r="6.5" fill="#1f2430" />
      <circle cx="50" cy="30" r="2.5" fill="#9ca3af" />
    </svg>
  );
}

const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
};

/** A die that tumbles through random faces while `rolling`, then shows `value`. */
function Die({ value, rolling }: { value: number; rolling: boolean }) {
  const reduce = useReducedMotion();
  const tumbling = rolling && !reduce;
  const [tumbleFace, setTumbleFace] = useState(value);
  useEffect(() => {
    if (!tumbling) return;
    const t = setInterval(() => setTumbleFace(1 + Math.floor(Math.random() * 6)), 70);
    return () => clearInterval(t);
  }, [tumbling]);
  const face = tumbling ? tumbleFace : value;

  return (
    <motion.div
      animate={rolling && !reduce ? { rotate: [0, 90, 180, 270, 360] } : { rotate: 0, scale: [1.25, 1] }}
      transition={rolling ? { duration: 0.5, repeat: Infinity, ease: 'linear' } : { type: 'spring', stiffness: 400, damping: 12 }}
      className="grid grid-cols-3 grid-rows-3 p-1.5 rounded-xl shrink-0"
      style={{ width: 44, height: 44, background: '#fff', boxShadow: 'inset 0 -4px 0 #d1d5db, 0 4px 10px rgba(0,0,0,0.2)' }}
      role="img"
      aria-label={rolling ? 'Rolling' : `Rolled ${value}`}
    >
      {Array.from({ length: 9 }, (_, i) => {
        const on = PIPS[face].some(([c, r]) => c === i % 3 && r === Math.floor(i / 3));
        return (
          <span key={i} className="flex items-center justify-center">
            {on && <span className="block rounded-full" style={{ width: 7, height: 7, background: '#1f2430' }} />}
          </span>
        );
      })}
    </motion.div>
  );
}

function Track({
  racers,
  pathLength,
  shortcuts,
  activeId,
  moving,
}: {
  racers: Racer[];
  pathLength: number;
  shortcuts: Map<number, number>;
  activeId: number;
  moving: boolean;
}) {
  const reduce = useReducedMotion();
  // Left 13% is the name gutter + grid box; the finish line sits at 93%.
  const x = (pos: number) => 13 + (pos / pathLength) * 80;
  const leader = Math.max(...racers.map((r) => r.position));
  const laneH = racers.length > 2 ? 46 : 56;

  return (
    <div
      className="relative rounded-3xl overflow-hidden select-none"
      style={{
        background: `repeating-linear-gradient(90deg, ${TRACK.grass} 0 24px, ${TRACK.grassDark} 24px 48px)`,
        padding: '14px 0',
        boxShadow: '0 16px 40px rgba(0,0,0,0.18)',
      }}
    >
      <div className="relative mx-2" style={{ background: TRACK.asphalt, borderRadius: 14, borderTop: '4px solid #fff', borderBottom: '4px solid #fff' }}>
        {/* Start and finish lines */}
        <div className="absolute top-0 bottom-0" style={{ left: `calc(${x(0)}% + 26px)`, width: 4, background: '#fff', opacity: 0.8 }} />
        <div
          className="absolute top-0 bottom-0"
          style={{
            left: `${x(pathLength)}%`,
            width: 16,
            backgroundImage: 'conic-gradient(#fff 25%, #111 0 50%, #fff 0 75%, #111 0)',
            backgroundSize: '8px 8px',
          }}
        />
        {/* Cell ticks */}
        {Array.from({ length: pathLength - 1 }, (_, i) => (
          <div
            key={i}
            className="absolute bottom-0"
            style={{ left: `${x(i + 1)}%`, width: 2, height: 6, background: 'rgba(255,255,255,0.25)' }}
          />
        ))}
        {/* Nitro pads */}
        {[...shortcuts.entries()].map(([from, to]) => (
          <div
            key={from}
            className="absolute top-1 bottom-1 flex items-center justify-center rounded-md"
            style={{
              left: `${x(from)}%`,
              width: `max(18px, ${80 / pathLength}%)`,
              transform: 'translateX(-50%)',
              background: 'rgba(34,211,238,0.22)',
              border: `2px solid ${TRACK.nitro}`,
            }}
            title={`Nitro: jump to ${to}`}
          >
            <span className="flex flex-col items-center text-[10px] font-extrabold leading-none" style={{ color: TRACK.nitro }}>
              <Zap size={12} fill="currentColor" />+{to - from}
            </span>
          </div>
        ))}

        {racers.map((r, lane) => {
          const active = r.id === activeId;
          const isLeader = r.position === leader && leader > 0;
          return (
            <div
              key={r.id}
              className="relative"
              style={{
                height: laneH,
                borderTop: lane > 0 ? `2px dashed ${TRACK.lane}` : undefined,
              }}
            >
              <motion.div
                className="absolute top-1/2"
                initial={false}
                animate={{ left: `${x(r.position)}%` }}
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 220, damping: 22 }}
                style={{ y: '-55%', x: '-50%', zIndex: active ? 3 : 2 }}
              >
                {active && moving && !reduce && (
                  <div aria-hidden className="absolute right-full top-1/2 -translate-y-1/2 flex flex-col gap-1 mr-0.5">
                    <span className="rtf-speed" style={{ width: 22 }} />
                    <span className="rtf-speed" style={{ width: 14, animationDelay: '0.1s' }} />
                  </div>
                )}
                <div className={active && !reduce ? 'rtf-idle' : undefined}>
                  <Kart color={r.color} bot={r.isBot} size={laneH > 50 ? 58 : 50} />
                </div>
                {isLeader && (
                  <Crown
                    size={16}
                    className="absolute -top-2 left-1/2 -translate-x-1/2"
                    fill="#ffc53d"
                    stroke="#b7791f"
                    aria-label="Leader"
                  />
                )}
              </motion.div>
              <span
                className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[11px] font-extrabold px-1.5 py-0.5 rounded"
                style={{ background: r.color, color: '#fff', opacity: active ? 1 : 0.75 }}
              >
                {r.name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Setup ----------

function ConfigScreen({ onStart }: { onStart: (config: RaceConfig) => void }) {
  const [playerCount, setPlayerCount] = useState(1);
  const [bot, setBot] = useState<BotLevel | 'none'>('pro');
  const [pathLength, setPathLength] = useState(15);
  const [direction, setDirection] = useState<AnswerDirection>('term-to-def');
  const [types, setTypes] = useState<QuestionType[]>(['multiple-choice', 'written']);
  const toggleType = (type: QuestionType) =>
    setTypes((prev) => (prev.includes(type) ? (prev.length > 1 ? prev.filter((t) => t !== type) : prev) : [...prev, type]));

  const preview: Racer[] = [
    { id: 0, name: 'You', color: RACER_COLORS[0], position: 0, correctCount: 0, totalCount: 0 },
    { id: 1, name: 'Bot', color: TRACK.bot, position: 0, correctCount: 0, totalCount: 0, isBot: true },
  ];

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <h2 className="text-3xl font-extrabold mb-1" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
        Race to Finish
      </h2>
      <p className="mb-5" style={{ color: 'var(--color-text-secondary)' }}>
        Answer right to roll the die and drive. Fast answers get an extra space.
      </p>
      <Track racers={preview} pathLength={10} shortcuts={new Map([[5, 7]])} activeId={0} moving={false} />
      <div
        className="mt-5 p-6 rounded-3xl flex flex-col gap-6"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' }}
      >
        <SetupSection label="Racers on this device">
          <ChoicePills
            options={[1, 2, 3, 4].map((n) => ({ value: n, label: n === 1 ? 'Just me' : `${n} players` }))}
            isSelected={(v) => v === playerCount}
            onToggle={setPlayerCount}
            accent={RACER_COLORS[0]}
          />
        </SetupSection>
        {playerCount === 1 && (
          <SetupSection label="Race against">
            <ChoicePills
              options={[
                { value: 'chill', label: 'Chill bot' },
                { value: 'pro', label: 'Pro bot' },
                { value: 'ace', label: 'Ace bot' },
                { value: 'none', label: 'Nobody' },
              ]}
              isSelected={(v) => v === bot}
              onToggle={setBot}
              accent={RACER_COLORS[0]}
            />
          </SetupSection>
        )}
        <SetupSection label="Track length">
          <ChoicePills
            options={[10, 15, 20, 30].map((n) => ({ value: n, label: `${n} spaces` }))}
            isSelected={(v) => v === pathLength}
            onToggle={setPathLength}
            accent={RACER_COLORS[0]}
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
            accent={RACER_COLORS[0]}
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
            accent={RACER_COLORS[0]}
          />
        </SetupSection>
        <PlayButton
          color={RACER_COLORS[0]}
          onClick={() =>
            onStart({
              playerCount,
              pathLength,
              direction,
              questionTypes: types,
              bot: playerCount === 1 && bot !== 'none' ? bot : null,
            })
          }
        >
          Start the race
        </PlayButton>
      </div>
    </div>
  );
}

// ---------- Game ----------

function generateShortcuts(pathLen: number): Map<number, number> {
  const sc = new Map<number, number>();
  const count = Math.max(1, Math.floor(pathLen / 8));
  const used = new Set<number>();
  for (let i = 0; i < count; i++) {
    let from: number;
    let guard = 0;
    do {
      from = 3 + Math.floor(Math.random() * (pathLen - 6));
    } while ((used.has(from) || used.has(from - 1) || used.has(from + 1)) && ++guard < 20);
    used.add(from);
    sc.set(from, Math.min(pathLen - 1, from + 2 + Math.floor(Math.random() * 3)));
  }
  return sc;
}

function RaceToFinishMode({ cards, setId, exitUrl }: RaceToFinishModeProps) {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const exitTo = exitUrl ?? `/sets/${setId}`;
  const exit = useCallback(() => navigate(exitTo), [navigate, exitTo]);
  const groups = useMemo(() => buildEquivalenceGroups(cards), [cards]);

  const [phase, setPhase] = useState<'config' | 'countdown' | 'playing' | 'results'>('config');
  const [config, setConfig] = useState<RaceConfig | null>(null);
  const [racers, setRacers] = useState<Racer[]>([]);
  const [turn, setTurn] = useState(0);
  const [question, setQuestion] = useState<GameQuestion | null>(null);
  const [questionSerial, setQuestionSerial] = useState(0);
  const [winner, setWinner] = useState<Racer | null>(null);
  const [shortcuts, setShortcuts] = useState<Map<number, number>>(new Map());

  const [feedback, setFeedback] = useState<Feedback>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [roll, setRoll] = useState<{ value: number; rolling: boolean; quick: boolean } | null>(null);
  const [moving, setMoving] = useState(false);
  const [nitro, setNitro] = useState(false);
  const [botStatus, setBotStatus] = useState<'thinking' | 'right' | 'wrong' | null>(null);

  const deckRef = useRef<Card[]>([]);
  const questionIndexRef = useRef(0);
  const questionStartRef = useRef(0);
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const moveTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const later = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  }, []);
  const clearAll = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current.clear();
    if (moveTimer.current) clearInterval(moveTimer.current);
    moveTimer.current = null;
  }, []);
  useEffect(() => clearAll, [clearAll]);

  const escArmed = useEscToQuit(phase !== 'config', phase === 'playing' || phase === 'countdown', exit);

  useEffect(() => {
    if (phase === 'results' && winner && !winner.isBot) return celebrate(CONFETTI, 1400);
  }, [phase, winner]);

  /** Next card from a shuffled deck, so cards don't repeat until all are used. */
  const nextQuestion = useCallback(
    (cfg: RaceConfig): GameQuestion => {
      if (deckRef.current.length === 0) deckRef.current = shuffleArray(cards);
      const card = deckRef.current.pop()!;
      const i = questionIndexRef.current++;
      return buildGameQuestion(card, cards, groups, cfg.questionTypes[i % cfg.questionTypes.length], cfg.direction, i);
    },
    [cards, groups],
  );

  const start = useCallback(
    (cfg: RaceConfig) => {
      clearAll();
      const list: Racer[] = Array.from({ length: cfg.playerCount }, (_, i) => ({
        id: i,
        name: cfg.playerCount === 1 ? 'You' : `P${i + 1}`,
        color: RACER_COLORS[i],
        position: 0,
        correctCount: 0,
        totalCount: 0,
      }));
      if (cfg.bot) {
        list.push({ id: 1, name: 'Bot', color: TRACK.bot, position: 0, correctCount: 0, totalCount: 0, isBot: true });
      }
      deckRef.current = [];
      questionIndexRef.current = 0;
      setConfig(cfg);
      setRacers(list);
      setTurn(0);
      setWinner(null);
      setBotStatus(null);
      setShortcuts(generateShortcuts(cfg.pathLength));
      setQuestion(nextQuestion(cfg));
      setQuestionSerial((s) => s + 1);
      setFeedback(null);
      setSelected(null);
      setRoll(null);
      setMoving(false);
      setNitro(false);
      setPhase('countdown');
    },
    [clearAll, nextQuestion],
  );

  // The turn flow below is plain hoisted functions: the bot turn forms a
  // cycle (drive → finishTurn → nextTurn → botTurn → drive) that useCallback
  // ordering can't express. Each step threads the freshly computed racers
  // array through so async steps never read stale state.

  function animateMove(idx: number, from: number, to: number, onDone: () => void) {
    if (from >= to) {
      onDone();
      return;
    }
    if (moveTimer.current) clearInterval(moveTimer.current);
    setMoving(true);
    let step = from;
    moveTimer.current = setInterval(() => {
      step++;
      playSound('move');
      setRacers((prev) => prev.map((r, i) => (i === idx ? { ...r, position: step } : r)));
      if (step >= to) {
        if (moveTimer.current) clearInterval(moveTimer.current);
        moveTimer.current = null;
        setMoving(false);
        onDone();
      }
    }, reduce ? 60 : 200);
  }

  function drive(idx: number, list: Racer[], quick: boolean) {
    if (!config) return;
    const value = 1 + Math.floor(Math.random() * 6);
    setRoll({ value, rolling: true, quick });
    later(() => {
      setRoll({ value, rolling: false, quick });
      playSound('land');
      later(() => {
        const from = list[idx].position;
        const to = Math.min(config.pathLength, from + value + (quick ? 1 : 0));
        animateMove(idx, from, to, () => {
          const jump = shortcuts.get(to);
          if (jump !== undefined) {
            playSound('boost');
            setNitro(true);
            later(() => {
              animateMove(idx, to, jump, () => {
                setNitro(false);
                finishTurn(idx, jump, list);
              });
            }, 500);
          } else {
            finishTurn(idx, to, list);
          }
        });
      }, 350);
    }, reduce ? 150 : 650);
  }

  function finishTurn(idx: number, finalPos: number, list: Racer[]) {
    if (!config) return;
    const moved = list.map((r, i) => (i === idx ? { ...r, position: finalPos } : r));
    if (finalPos >= config.pathLength) {
      playSound(moved[idx].isBot ? 'lose' : 'win');
      setRacers(moved);
      setWinner(moved[idx]);
      later(() => setPhase('results'), 700);
      return;
    }
    later(() => nextTurn(moved, idx), 450);
  }

  function nextTurn(list: Racer[], fromIdx: number) {
    if (!config) return;
    const next = (fromIdx + 1) % list.length;
    setTurn(next);
    setRoll(null);
    setFeedback(null);
    setSelected(null);
    if (list[next]?.isBot) {
      botTurn(list, next);
      return;
    }
    setBotStatus(null);
    setQuestion(nextQuestion(config));
    setQuestionSerial((s) => s + 1);
    questionStartRef.current = Date.now();
  }

  function botTurn(list: Racer[], idx: number) {
    if (!config?.bot) return;
    const accuracy = BOT_ACCURACY[config.bot];
    setBotStatus('thinking');
    later(() => {
      const right = Math.random() < accuracy;
      const next = list.map((r, i) =>
        i === idx ? { ...r, totalCount: r.totalCount + 1, correctCount: r.correctCount + (right ? 1 : 0) } : r,
      );
      setRacers(next);
      setBotStatus(right ? 'right' : 'wrong');
      if (right) {
        drive(idx, next, false);
      } else {
        playSound('wrong');
        later(() => nextTurn(next, idx), 1100);
      }
    }, 900 + Math.random() * 700);
  }

  function answer(isRight: boolean) {
    if (feedback || !config) return;
    const idx = turn;
    const quick = isRight && (Date.now() - questionStartRef.current) / 1000 <= QUICK_SECONDS;
    const next = racers.map((r, i) =>
      i === idx ? { ...r, totalCount: r.totalCount + 1, correctCount: r.correctCount + (isRight ? 1 : 0) } : r,
    );
    setRacers(next);
    setFeedback(isRight ? 'correct' : 'wrong');
    if (isRight) {
      playSound('correct');
      drive(idx, next, quick);
    } else {
      playSound('wrong');
      later(() => nextTurn(next, idx), 1800);
    }
  }

  const answerRef = useRef(answer);
  answerRef.current = answer;
  const onWritten = useCallback(
    (text: string) => question && answerRef.current(gradeGameAnswer(question, { written: text })),
    [question],
  );
  const onOption = useCallback(
    (option: string) => {
      if (!question || feedback) return;
      setSelected(option);
      answerRef.current(gradeGameAnswer(question, { option }));
    },
    [question, feedback],
  );
  const onTrueFalse = useCallback(
    (tf: boolean) => question && answerRef.current(gradeGameAnswer(question, { tf })),
    [question],
  );
  const current = racers[turn];
  useAnswerKeys(question, phase === 'playing' && !feedback && !current?.isBot, onOption, onTrueFalse);

  if (phase === 'config') return <ConfigScreen onStart={start} />;

  if (phase === 'results' && config) {
    const standings = [...racers].sort((a, b) => b.position - a.position);
    const you = racers.find((r) => !r.isBot)!;
    const solo = racers.filter((r) => !r.isBot).length === 1;
    const accuracy = you.totalCount > 0 ? Math.round((you.correctCount / you.totalCount) * 100) : 0;
    const youWon = !!winner && !winner.isBot;
    const stars = solo ? (youWon ? (accuracy >= 90 ? 3 : accuracy >= 70 ? 2 : 1) : 0) : undefined;
    return (
      <div className="relative min-h-[calc(100dvh-8rem)] flex items-center px-4 pt-16 pb-10">
        <ResultsPanel
          mascot={winner ? <div className="-mb-2"><Kart color={winner.color} bot={winner.isBot} size={120} /></div> : undefined}
          title={winner ? (winner.isBot ? 'The bot takes it' : solo ? 'You win the race' : `${winner.name} wins`) : 'Race over'}
          subtitle={winner?.isBot ? 'So close. A rematch is one click away.' : 'Crossed the finish line first.'}
          stars={stars}
          stats={standings.map((r, i) => ({
            label: `${r.name} (${i + 1}${['st', 'nd', 'rd', 'th'][Math.min(i, 3)]})`,
            value: `${r.totalCount > 0 ? Math.round((r.correctCount / r.totalCount) * 100) : 0}%`,
          }))}
          actions={
            <>
              <Button variant="primary" onClick={() => start(config)}>Rematch</Button>
              <Button variant="outline" onClick={() => setPhase('config')}>Change settings</Button>
              <Button variant="ghost" onClick={exit}>Exit</Button>
            </>
          }
        />
      </div>
    );
  }

  if (!config || !current) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-4">
      <EscBanner show={escArmed} />
      {phase === 'countdown' && (
        <Countdown
          accent="#22c55e"
          onDone={() => {
            questionStartRef.current = Date.now();
            setPhase('playing');
          }}
        />
      )}

      <GameTopBar onExit={exit}>
        <span className="text-sm font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
          First to {config.pathLength} wins
        </span>
      </GameTopBar>

      <div className="mt-3 relative">
        <Track racers={racers} pathLength={config.pathLength} shortcuts={shortcuts} activeId={current.id} moving={moving} />
        <AnimatePresence>
          {nitro && (
            <motion.div
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.4, rotate: -8 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 0.6 }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              <span
                className="flex items-center gap-2 px-5 py-2 rounded-full text-2xl font-extrabold"
                style={{ background: TRACK.nitro, color: '#083344', fontFamily: 'var(--font-display)', boxShadow: '0 8px 24px rgba(34,211,238,0.5)' }}
              >
                <Zap size={24} fill="currentColor" /> Nitro!
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Turn banner + die */}
      <div className="mt-4 flex items-center gap-3">
        <div
          className="flex-1 flex items-center gap-2 h-12 px-4 rounded-2xl font-extrabold"
          style={{ background: current.color, color: '#fff', fontFamily: 'var(--font-display)', boxShadow: 'inset 0 -4px 0 rgba(0,0,0,0.2)' }}
        >
          <Kart color="#ffffff" bot={current.isBot} size={34} />
          {current.isBot ? 'Bot’s turn' : racers.filter((r) => !r.isBot).length === 1 ? 'Your turn' : `${current.name}, your turn`}
          {roll?.quick && !roll.rolling && (
            <motion.span
              initial={reduce ? false : { scale: 0 }}
              animate={{ scale: 1 }}
              className="ml-auto flex items-center gap-1 text-sm px-2.5 py-1 rounded-full"
              style={{ background: 'rgba(255,255,255,0.25)' }}
            >
              <Zap size={14} fill="currentColor" /> Quick +1
            </motion.span>
          )}
        </div>
        {roll && <Die value={roll.value} rolling={roll.rolling} />}
      </div>

      <AnimatePresence mode="wait">
        {current.isBot ? (
          <motion.div
            key={`bot-${questionSerial}-${turn}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-4 rounded-3xl p-6 text-center font-semibold"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
            role="status"
          >
            {botStatus === 'right' ? (
              <span style={{ color: 'var(--color-success)' }}>The bot got it right and rolls.</span>
            ) : botStatus === 'wrong' ? (
              <span style={{ color: 'var(--color-danger)' }}>The bot missed. Its turn is over.</span>
            ) : (
              <span className="inline-flex items-center gap-2">
                Bot is thinking
                <span className="rtf-dots" aria-hidden><i /><i /><i /></span>
              </span>
            )}
          </motion.div>
        ) : (
          question && (
            <motion.div
              key={questionSerial}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -10 }}
              transition={{ type: 'spring', stiffness: 360, damping: 32 }}
              className="mt-4 rounded-3xl p-5 sm:p-6"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' }}
            >
              <QuestionPanel
                question={question}
                feedback={feedback}
                selectedOption={selected}
                disabled={phase !== 'playing' || moving}
                onWritten={onWritten}
                onOption={onOption}
                onTrueFalse={onTrueFalse}
              />
            </motion.div>
          )
        )}
      </AnimatePresence>
    </div>
  );
}

export default RaceToFinishMode;
