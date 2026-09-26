import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useTransform, type PanInfo } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';
import type { Card } from '@/types';
import type { ModeProps } from '@/components/modes/registry';
import { hasDefinitionContent, hasTermContent, normalizeAnswer, shuffleArray, stripHtml } from '@/lib/utils';
import { buildEquivalenceGroups, getEquivalentAnswers, getWrongOptionPool } from '@/lib/equivalence';
import { submitScore } from '@/lib/gameRecords';
import { playSound } from '@/lib/gameSounds';
import StudyContent from '@/components/StudyContent';
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
  ResultsPanel,
  ScoreCounter,
  SetupSection,
} from '@/components/games/GameKit';
import { celebrate, comboMultiplier, formatMultiplier, useEscToQuit, usePopups } from '@/components/games/gameLogic';
import './SwipeBlitzMode.css';

// ============================================================
// Swipe Blitz — a timed arcade round. A term and a definition
// share one card; swipe right if they belong together, left if
// they don't. Fast, right answers build the combo.
// ============================================================

const GAME_ID = 'swipe-blitz';

// Scene art: fixed so the arcade stage reads the same in both themes.
const ART = {
  stageTop: '#1a1040',
  stageBottom: '#34197a',
  floor: '#140b33',
  grid: 'rgba(255, 210, 62, 0.22)',
  match: '#1fbf6a',
  matchEdge: '#12834a',
  miss: '#ff4d5e',
  missEdge: '#bf2536',
  gold: '#ffd23e',
  goldEdge: '#c79a10',
  card: '#fffaf0',
  ink: '#1a1040',
  inkSoft: '#5a4c8a',
  mascot: '#ff8a3d',
};

const DURATIONS = [30, 60, 90] as const;
type Duration = (typeof DURATIONS)[number];

/** How far (px) or fast (px/s) a drag must go to count as a swipe. */
const SWIPE_DISTANCE = 110;
const SWIPE_VELOCITY = 650;
/** How long the correct pairing stays up after a wrong swipe. */
const REVEAL_MS = 700;

interface Pair {
  id: number;
  card: Card;
  /** The definition shown on the card; the card's own when isMatch. */
  defHtml: string;
  isMatch: boolean;
}

interface Miss {
  id: number;
  term: string;
  shown: string;
  correct: string;
  isMatch: boolean;
}

interface Flash {
  n: number;
  right: boolean;
  /** Which lane the card went to: 1 = match (right), -1 = no match (left). */
  dir: 1 | -1;
}

// ---------- Setup ----------

function ConfigScreen({
  onStart,
  initial,
  onExit,
}: {
  onStart: (d: Duration) => void;
  initial: Duration;
  onExit: () => void;
}) {
  const [duration, setDuration] = useState<Duration>(initial);
  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <div className="rounded-3xl overflow-hidden" style={{ boxShadow: '0 20px 50px rgba(0,0,0,0.18)' }}>
        <div
          className="relative overflow-hidden flex items-end gap-3 px-5 pb-4"
          style={{ height: 160, background: `linear-gradient(180deg, ${ART.stageTop}, ${ART.stageBottom})` }}
        >
          <StageFloor />
          <div className="relative flex items-end gap-3">
            <Mascot mood="happy" color={ART.mascot} accessory="headband" size={84} />
            <div className="pb-3">
              <h2 className="text-3xl font-extrabold" style={{ color: '#fff', fontFamily: 'var(--font-display)' }}>
                Swipe Blitz
              </h2>
              <p className="text-sm font-semibold" style={{ color: '#d9ccff' }}>
                Right if the pair matches, left if it doesn't. Beat the clock.
              </p>
            </div>
          </div>
        </div>
        <div className="p-6 flex flex-col gap-6" style={{ background: 'var(--color-surface)' }}>
          <SetupSection label="Round length">
            <ChoicePills
              options={DURATIONS.map((d) => ({ value: d, label: `${d} seconds` }))}
              isSelected={(v) => v === duration}
              onToggle={setDuration}
              accent="#6b3fd6"
            />
          </SetupSection>
          <p className="text-sm m-0" style={{ color: 'var(--color-text-secondary)' }}>
            Drag the card, tap the buttons, or use the left and right arrow keys. Quick answers earn a speed bonus.
          </p>
          <PlayButton color="#6b3fd6" onClick={() => onStart(duration)}>
            Start the blitz
          </PlayButton>
          <Button variant="ghost" onClick={onExit}>
            Back to set
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------- Scene ----------

/** Perspective grid floor, drawn once. */
function StageFloor() {
  const verticals = [-300, -180, -90, -30, 30, 90, 180, 300];
  return (
    <svg
      aria-hidden
      className="absolute left-0 bottom-0 w-full pointer-events-none"
      viewBox="0 0 400 120"
      preserveAspectRatio="none"
      style={{ height: '42%' }}
    >
      <rect x="0" y="0" width="400" height="120" fill={ART.floor} />
      <line x1="0" y1="0.5" x2="400" y2="0.5" stroke={ART.gold} strokeOpacity="0.55" strokeWidth="1.5" />
      {[14, 32, 56, 86].map((y) => (
        <line key={y} x1="0" y1={y} x2="400" y2={y} stroke={ART.grid} strokeWidth="1" />
      ))}
      {verticals.map((dx) => (
        <line key={dx} x1={200 + dx / 6} y1="0" x2={200 + dx * 1.6} y2="120" stroke={ART.grid} strokeWidth="1" />
      ))}
    </svg>
  );
}

function Lane({ side, lit }: { side: 'left' | 'right'; lit: Flash | null }) {
  const isRight = side === 'right';
  const color = isRight ? ART.match : ART.miss;
  const on = lit !== null && lit.dir === (isRight ? 1 : -1);
  return (
    <div
      aria-hidden
      className="absolute top-8 bottom-4 flex flex-col items-center justify-center gap-2 w-11 sm:w-20 rounded-2xl transition-[background-color,box-shadow] duration-200"
      style={{
        [isRight ? 'right' : 'left']: 8,
        background: on ? color : 'rgba(255,255,255,0.05)',
        border: `2px solid ${color}`,
        boxShadow: on ? `0 0 28px ${color}` : 'none',
        zIndex: 1,
      }}
    >
      <span
        className="flex items-center justify-center w-9 h-9 rounded-full"
        style={{ background: on ? '#fff' : color, color: on ? color : '#fff' }}
      >
        {isRight ? <Check size={20} strokeWidth={3} /> : <X size={20} strokeWidth={3} />}
      </span>
      <span
        className="hidden sm:block text-xs font-extrabold text-center leading-tight"
        style={{ color: on ? '#fff' : color, fontFamily: 'var(--font-display)' }}
      >
        {isRight ? 'Match' : 'No match'}
      </span>
      <span className={`sb-lane-arrow ${isRight ? '' : 'sb-left'}`} style={{ color }}>
        {isRight ? <ArrowRight size={18} strokeWidth={3} /> : <ArrowLeft size={18} strokeWidth={3} />}
      </span>
    </div>
  );
}

function SwipeCard({
  pair,
  enabled,
  onSwipe,
}: {
  pair: Pair;
  enabled: boolean;
  onSwipe: (saysMatch: boolean) => void;
}) {
  const reduce = !!useReducedMotion();
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-260, 260], [-16, 16]);
  const matchStamp = useTransform(x, [25, SWIPE_DISTANCE], [0, 1]);
  const missStamp = useTransform(x, [-SWIPE_DISTANCE, -25], [1, 0]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (!enabled) return;
    const d = info.offset.x;
    const v = info.velocity.x;
    if (d > SWIPE_DISTANCE || (d > 30 && v > SWIPE_VELOCITY)) onSwipe(true);
    else if (d < -SWIPE_DISTANCE || (d < -30 && v < -SWIPE_VELOCITY)) onSwipe(false);
  };

  return (
    <motion.div
      className="sb-card absolute inset-0 flex flex-col rounded-3xl p-5 select-none touch-pan-y"
      style={{
        x,
        rotate: reduce ? 0 : rotate,
        background: ART.card,
        color: ART.ink,
        boxShadow: `inset 0 -6px 0 #e7dcc4, 0 18px 40px rgba(0,0,0,0.45)`,
        cursor: enabled ? 'grab' : 'default',
      }}
      drag={enabled ? 'x' : false}
      dragSnapToOrigin
      dragElastic={0.85}
      whileDrag={{ cursor: 'grabbing', scale: 1.02 }}
      onDragEnd={onDragEnd}
      variants={{
        enter: reduce ? { opacity: 0 } : { opacity: 0, scale: 0.8, y: 24 },
        center: { opacity: 1, scale: 1, y: 0, transition: reduce ? { duration: 0.1 } : { type: 'spring', stiffness: 520, damping: 30 } },
        exit: (dir: number) =>
          reduce
            ? { opacity: 0, transition: { duration: 0.1 } }
            : { x: dir * 720, rotate: dir * 30, opacity: 0, transition: { duration: 0.32, ease: 'easeIn' } },
      }}
      initial="enter"
      animate="center"
      exit="exit"
    >
      {/* Stamps that fade in as the card is dragged */}
      <motion.span
        aria-hidden
        className="absolute top-4 left-4 px-2.5 py-1 rounded-lg text-lg font-extrabold"
        style={{ opacity: matchStamp, color: ART.match, border: `3px solid ${ART.match}`, rotate: -12, fontFamily: 'var(--font-display)' }}
      >
        Match
      </motion.span>
      <motion.span
        aria-hidden
        className="absolute top-4 right-4 px-2.5 py-1 rounded-lg text-lg font-extrabold"
        style={{ opacity: missStamp, color: ART.miss, border: `3px solid ${ART.miss}`, rotate: 12, fontFamily: 'var(--font-display)' }}
      >
        Nope
      </motion.span>

      <div className="flex-1 min-h-0 flex flex-col justify-center text-center">
        <StudyContent html={pair.card.term} className="sb-card-body sb-term text-2xl sm:text-3xl font-extrabold leading-tight break-words" />
      </div>
      <div className="flex items-center gap-3 my-3" aria-hidden>
        <span className="flex-1 h-0.5 rounded" style={{ background: '#e7dcc4' }} />
        <span
          className="px-2.5 py-0.5 rounded-full text-sm font-extrabold"
          style={{ background: ART.gold, color: ART.ink, fontFamily: 'var(--font-display)' }}
        >
          =?
        </span>
        <span className="flex-1 h-0.5 rounded" style={{ background: '#e7dcc4' }} />
      </div>
      <div className="flex-1 min-h-0 flex flex-col justify-center text-center">
        <StudyContent html={pair.defHtml} className="sb-card-body sb-def text-base sm:text-lg font-semibold leading-snug break-words" />
      </div>
    </motion.div>
  );
}

function RevealCard({ miss }: { miss: Miss }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      role="status"
      className="sb-card absolute inset-0 flex flex-col justify-center rounded-3xl p-5 text-center"
      style={{ background: ART.miss, color: '#fff', boxShadow: `inset 0 -6px 0 ${ART.missEdge}` }}
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.1 } }}
      transition={{ duration: 0.12 }}
    >
      <p className="m-0 text-sm font-extrabold" style={{ fontFamily: 'var(--font-display)' }}>
        {miss.isMatch ? 'That was a match' : 'Not a match. It goes with'}
      </p>
      <div className="mt-3 rounded-2xl p-3" style={{ background: 'rgba(255,255,255,0.95)', color: ART.ink }}>
        <StudyContent html={miss.term} className="sb-card-body sb-term text-lg font-extrabold" />
        <div className="my-1.5 h-px" style={{ background: '#e7dcc4' }} />
        <StudyContent html={miss.correct} className="sb-card-body sb-def text-base font-semibold" />
      </div>
    </motion.div>
  );
}

// ---------- Game ----------

export default function SwipeBlitzMode({ cards, setId, exitUrl }: ModeProps) {
  const navigate = useNavigate();
  const reduce = !!useReducedMotion();
  const exitTo = exitUrl ?? `/sets/${setId}`;
  const exit = useCallback(() => navigate(exitTo), [navigate, exitTo]);

  const playable = useMemo(() => cards.filter((c) => hasTermContent(c) && hasDefinitionContent(c)), [cards]);
  const groups = useMemo(() => buildEquivalenceGroups(playable), [playable]);

  const [phase, setPhase] = useState<'config' | 'countdown' | 'play' | 'done'>('config');
  const [duration, setDuration] = useState<Duration>(60);
  const [msLeft, setMsLeft] = useState(60_000);
  const [pair, setPair] = useState<Pair | null>(null);
  const [reveal, setReveal] = useState<Miss | null>(null);
  const [exitDir, setExitDir] = useState<1 | -1>(1);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [right, setRight] = useState(0);
  const [misses, setMisses] = useState<Miss[]>([]);
  const [mood, setMood] = useState<MascotMood>('idle');
  const [best, setBest] = useState<ReturnType<typeof submitScore> | undefined>();
  const { popups, push, remove } = usePopups();

  const deckRef = useRef<Card[]>([]);
  const pairIdRef = useRef(0);
  const pairStartRef = useRef(0);
  const endAtRef = useRef(0);
  const flashN = useRef(0);

  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const later = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  }, []);
  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current.clear();
  }, []);
  useEffect(() => clearTimers, [clearTimers]);

  const playing = phase === 'play';
  const escArmed = useEscToQuit(phase !== 'config', playing || phase === 'countdown', exit);

  /** Next pair from a shuffled deck; about half are deliberately wrong. */
  const makePair = useCallback((): Pair => {
    if (deckRef.current.length === 0) deckRef.current = shuffleArray(playable);
    const card = deckRef.current.pop()!;
    pairIdRef.current += 1;
    // Anything that is a valid definition for this term (same-term cards) is
    // excluded, so a "wrong" pair is never actually right.
    const valid = new Set(getEquivalentAnswers(card, 'definition', groups).map(normalizeAnswer));
    const pool = getWrongOptionPool(card, playable, groups, 'definition').filter((d) => !valid.has(normalizeAnswer(d)));
    if (pool.length > 0 && Math.random() < 0.5) {
      return { id: pairIdRef.current, card, defHtml: pool[Math.floor(Math.random() * pool.length)], isMatch: false };
    }
    return { id: pairIdRef.current, card, defHtml: card.definition, isMatch: true };
  }, [playable, groups]);

  const start = useCallback(
    (d: Duration) => {
      clearTimers();
      deckRef.current = [];
      setDuration(d);
      setMsLeft(d * 1000);
      setPair(makePair());
      setReveal(null);
      setFlash(null);
      setScore(0);
      setStreak(0);
      setBestStreak(0);
      setRight(0);
      setMisses([]);
      setMood('idle');
      setBest(undefined);
      setPhase('countdown');
    },
    [clearTimers, makePair],
  );

  const finish = useCallback(() => {
    clearTimers();
    setBest(submitScore(GAME_ID, setId, score, `${duration}s`));
    setMsLeft(0);
    setPhase('done');
    playSound('win');
  }, [clearTimers, setId, score, duration]);

  // The clock runs from an interval; it reads the latest finish() via a ref.
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  });

  useEffect(() => {
    if (!playing) return;
    let lastSec = Math.ceil((endAtRef.current - performance.now()) / 1000);
    const id = setInterval(() => {
      const left = Math.max(0, endAtRef.current - performance.now());
      setMsLeft(left);
      const sec = Math.ceil(left / 1000);
      if (sec !== lastSec) {
        lastSec = sec;
        if (sec > 0 && sec <= 5) playSound('tick');
      }
      if (left <= 0) {
        clearInterval(id);
        finishRef.current();
      }
    }, 100);
    return () => clearInterval(id);
  }, [playing]);

  const answered = right + misses.length;
  const accuracy = answered > 0 ? right / answered : 0;
  const perMinute = Math.round(answered / (duration / 60));

  useEffect(() => {
    if (phase === 'done' && accuracy >= 0.8 && answered >= 10) return celebrate([ART.gold, ART.match, '#8f6bff', '#ffffff']);
  }, [phase, accuracy, answered]);

  const answer = useCallback(
    (saysMatch: boolean) => {
      if (!playing || !pair || reveal) return;
      const isRight = saysMatch === pair.isMatch;
      const seconds = (performance.now() - pairStartRef.current) / 1000;
      const dir: 1 | -1 = saysMatch ? 1 : -1;
      setExitDir(dir);
      flashN.current += 1;
      setFlash({ n: flashN.current, right: isRight, dir });

      if (isRight) {
        const next = streak + 1;
        const mult = comboMultiplier(next);
        const speed = Math.round(Math.max(0, 40 * (1 - seconds / 3)));
        const points = Math.round(100 * mult) + speed;
        playSound('correct');
        if (mult > comboMultiplier(streak)) {
          playSound('combo');
          push({ text: `${formatMultiplier(mult)} combo!`, color: ART.gold, x: 34, y: 14 });
        }
        push({ text: `+${points}`, color: '#ffffff', x: dir === 1 ? 62 : 22, y: 40 });
        setScore((s) => s + points);
        setStreak(next);
        setBestStreak((b) => Math.max(b, next));
        setRight((r) => r + 1);
        setMood(next >= 4 ? 'celebrate' : 'happy');
        setPair(makePair());
        pairStartRef.current = performance.now();
      } else {
        playSound('wrong');
        const miss: Miss = {
          id: pair.id,
          term: pair.card.term,
          shown: pair.defHtml,
          correct: pair.card.definition,
          isMatch: pair.isMatch,
        };
        setStreak(0);
        setMisses((m) => [...m, miss]);
        setMood('sad');
        setPair(null);
        setReveal(miss);
        later(() => {
          setReveal(null);
          setPair(makePair());
          setMood('idle');
          pairStartRef.current = performance.now();
        }, REVEAL_MS);
      }
    },
    [playing, pair, reveal, streak, push, makePair, later],
  );

  // Arrow keys swipe.
  useEffect(() => {
    if (!playing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        answer(true);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        answer(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing, answer]);

  if (playable.length < 2) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <p className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>
          Swipe Blitz needs at least two cards with both a term and a definition.
        </p>
        <Button variant="primary" className="mt-4" onClick={exit}>
          Back to set
        </Button>
      </div>
    );
  }

  if (phase === 'config') return <ConfigScreen initial={duration} onStart={start} onExit={exit} />;

  if (phase === 'done') {
    const pct = Math.round(accuracy * 100);
    const stars =
      pct >= 90 && perMinute >= 20 ? 3 : pct >= 75 && perMinute >= 12 ? 2 : pct >= 50 && answered >= 5 ? 1 : 0;
    return (
      <div className="relative min-h-[calc(100dvh-8rem)] flex flex-col items-center px-4 pt-24 pb-10 gap-6">
        <ResultsPanel
          mascot={<Mascot mood={stars >= 2 ? 'celebrate' : stars === 1 ? 'happy' : 'sad'} color={ART.mascot} accessory="headband" size={112} />}
          title={stars === 3 ? 'Lightning hands' : stars >= 1 ? 'Time!' : 'Keep swiping'}
          subtitle={`${answered} cards in ${duration} seconds, ${pct}% right.`}
          stars={stars}
          score={score}
          best={best}
          stats={[
            { label: 'Correct', value: right },
            { label: 'Wrong', value: misses.length },
            { label: 'Best streak', value: bestStreak },
            { label: 'Cards/min', value: perMinute },
          ]}
          actions={
            <>
              <Button variant="primary" onClick={() => start(duration)}>
                Play again
              </Button>
              <Button variant="outline" onClick={() => setPhase('config')}>
                Change length
              </Button>
              <Button variant="ghost" onClick={exit}>
                Exit
              </Button>
            </>
          }
        />
        {misses.length > 0 && (
          <section
            className="sb-review w-full max-w-md rounded-3xl p-5"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
            aria-labelledby="sb-review-title"
          >
            <h3 id="sb-review-title" className="text-lg font-extrabold m-0" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
              Pairs to review
            </h3>
            <ul className="list-none p-0 m-0 mt-3 flex flex-col gap-2">
              {misses.map((m) => (
                <li key={m.id} className="rounded-2xl p-3" style={{ background: 'var(--color-muted)', color: 'var(--color-text)' }}>
                  <StudyContent html={m.term} className="font-bold break-words" />
                  <div className="mt-1 text-sm break-words" style={{ color: 'var(--color-text-secondary)' }}>
                    {m.isMatch ? 'You said no, but it matches:' : `You matched it with "${truncate(stripHtml(m.shown) || 'an image', 60)}". It goes with:`}
                  </div>
                  <StudyContent html={m.correct} className="text-sm font-semibold break-words" />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  }

  const total = duration * 1000;
  const urgent = msLeft <= 10_000;
  const secondsLeft = Math.ceil(msLeft / 1000);

  return (
    <div className="max-w-3xl mx-auto px-4 py-4">
      <EscBanner show={escArmed} />
      {phase === 'countdown' && (
        <Countdown
          accent={ART.gold}
          onDone={() => {
            endAtRef.current = performance.now() + duration * 1000;
            pairStartRef.current = performance.now();
            setPhase('play');
          }}
        />
      )}

      <GameTopBar onExit={exit}>
        <div
          className="flex items-center px-3 h-10 rounded-xl text-lg font-extrabold tabular-nums"
          style={{
            background: urgent ? ART.miss : 'var(--color-surface)',
            color: urgent ? '#fff' : 'var(--color-text)',
            border: urgent ? 'none' : '1px solid var(--color-border)',
            fontFamily: 'var(--font-display)',
          }}
          aria-label={`${secondsLeft} seconds left`}
        >
          {secondsLeft}s
        </div>
        <ComboMeter streak={streak} />
        <ScoreCounter value={score} />
      </GameTopBar>

      <div
        className="relative mt-4 rounded-3xl overflow-hidden"
        style={{
          height: 'clamp(380px, 58dvh, 520px)',
          background: `linear-gradient(180deg, ${ART.stageTop}, ${ART.stageBottom})`,
          boxShadow: '0 16px 40px rgba(0,0,0,0.25)',
        }}
      >
        <StageFloor />

        {/* Timer bar */}
        <div className="absolute top-3 left-4 right-4 h-3 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.12)', zIndex: 3 }}>
          <div
            className={urgent ? 'sb-urgent h-full rounded-full' : 'h-full rounded-full'}
            style={{
              width: `${(msLeft / total) * 100}%`,
              background: urgent ? ART.miss : ART.gold,
              transition: 'width 100ms linear, background-color 300ms',
            }}
          />
        </div>

        <Lane side="left" lit={flash} />
        <Lane side="right" lit={flash} />

        {/* Answer flash over the whole stage */}
        <AnimatePresence>
          {flash && (
            <motion.div
              key={flash.n}
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              style={{ boxShadow: `inset 0 0 0 6px ${flash.right ? ART.match : ART.miss}, inset 0 0 90px ${flash.right ? ART.match : ART.miss}`, zIndex: 4 }}
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              transition={{ duration: reduce ? 0.3 : 0.55 }}
            />
          )}
        </AnimatePresence>

        {/* Card slot */}
        <div
          className="absolute left-1/2 -translate-x-1/2 top-10 bottom-16"
          style={{ width: 'min(420px, calc(100% - 120px))', zIndex: 2 }}
        >
          <AnimatePresence custom={exitDir} initial={false}>
            {reveal ? (
              <RevealCard key={`r${reveal.id}`} miss={reveal} />
            ) : pair ? (
              <SwipeCard key={pair.id} pair={pair} enabled={playing} onSwipe={answer} />
            ) : null}
          </AnimatePresence>
        </div>

        {/* Host */}
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 pointer-events-none" style={{ zIndex: 3 }}>
          <Mascot mood={mood} color={ART.mascot} accessory="headband" size={58} />
        </div>

        <div style={{ zIndex: 5 }} className="absolute inset-0 pointer-events-none">
          <ScorePopups popups={popups} onDone={remove} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-4">
        <GameButton color={ART.miss} edge={ART.missEdge} onClick={() => answer(false)} disabled={!playing || !!reveal}>
          <ArrowLeft size={20} strokeWidth={3} /> No match
        </GameButton>
        <GameButton color={ART.match} edge={ART.matchEdge} onClick={() => answer(true)} disabled={!playing || !!reveal}>
          Match <ArrowRight size={20} strokeWidth={3} />
        </GameButton>
      </div>
      <p className="hidden md:block mt-2 text-xs text-center" style={{ color: 'var(--color-text-tertiary)' }}>
        Left and right arrow keys swipe
      </p>
    </div>
  );
}

function GameButton({
  color,
  edge,
  onClick,
  disabled,
  children,
}: {
  color: string;
  edge: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="sb-btn flex items-center justify-center gap-2 h-14 rounded-2xl text-lg font-extrabold cursor-pointer active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
      style={{ background: color, color: '#fff', border: 'none', boxShadow: `inset 0 -5px 0 ${edge}`, fontFamily: 'var(--font-display)' }}
    >
      {children}
    </button>
  );
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
