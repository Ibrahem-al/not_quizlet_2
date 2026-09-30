import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowDown, ArrowUp, Check, Radio, SkipForward, Users, WifiOff, X } from 'lucide-react';
import type { AnswerDirection, QuestionType, StudySet } from '@/types';
import { useSetStore } from '@/stores/useSetStore';
import { useAuthStore } from '@/stores/useAuthStore';
import StudyContent from '@/components/StudyContent';
import { Spinner } from '@/components/ui/Spinner';
import { SoundToggle } from '@/components/SoundToggle';
import { ChoicePills, Countdown, PlayButton, SetupSection } from '@/components/games/GameKit';
import { TILE_COLORS, celebrate } from '@/components/games/gameLogic';
import { playSound } from '@/lib/gameSounds';
import { hasContent } from '@/lib/utils';
import {
  BuzzerHost,
  MAX_PLAYERS,
  OPTION_SHAPES,
  SECONDS_OPTIONS,
  buildLiveQuestions,
  initialOf,
  isLiveAvailable,
  ordinal,
  type HostPlayer,
  type HostSnapshot,
  type LiveQuestion,
} from '@/lib/liveBuzzer';
import './LiveBuzzer.css';

// ============================================================
// Buzzer Battle — host screen (the teacher's projector).
// ============================================================

// Stage art — fixed so the projector looks the same in either theme.
const STAGE = {
  panel: '#241f58',
  panelEdge: '#0d0b24',
  text: '#ffffff',
  sub: '#c3bdf0',
  gold: '#ffc53d',
  goldEdge: '#b3820f',
  silver: '#c9d1e0',
  silverEdge: '#8792a8',
  bronze: '#d98b52',
  bronzeEdge: '#98582a',
  buzzer: '#e5484d',
  buzzerEdge: '#9e1f25',
  good: '#3ecf8e',
};

const COUNT_OPTIONS = [5, 10, 15, 20];

// ---------- Small shared pieces ----------

function Notice({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div
        className="w-full max-w-md p-8 rounded-2xl text-center"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <div
          className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-4"
          style={{ background: 'var(--color-muted)', color: 'var(--color-text-secondary)' }}
        >
          {icon}
        </div>
        <h1 className="text-2xl font-extrabold mb-2" style={{ color: 'var(--color-text)' }}>
          {title}
        </h1>
        <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function StageBeams() {
  return (
    <svg aria-hidden className="bz-stage-beams" viewBox="0 0 400 200" preserveAspectRatio="none">
      <polygon points="40,0 90,0 170,200 -40,200" fill="rgba(255,236,170,0.06)" />
      <polygon points="310,0 360,0 440,200 230,200" fill="rgba(255,236,170,0.06)" />
      <rect x="0" y="186" width="400" height="14" fill="rgba(0,0,0,0.25)" />
    </svg>
  );
}

function BuzzerIcon({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <ellipse cx="32" cy="54" rx="26" ry="7" fill="#0d0b24" />
      <rect x="8" y="40" width="48" height="14" rx="4" fill="#3a2f7a" />
      <rect x="8" y="48" width="48" height="6" rx="3" fill="#2a2266" />
      <path d="M14 42 C14 22 50 22 50 42 Z" fill={STAGE.buzzer} />
      <path d="M14 42 C14 36 50 36 50 42 Z" fill={STAGE.buzzerEdge} />
      <ellipse cx="25" cy="30" rx="5" ry="3" fill="rgba(255,255,255,0.45)" transform="rotate(-25 25 30)" />
    </svg>
  );
}

function Avatar({ name, color, size = 40, className = 'inline-flex' }: { name: string; color: string; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={`${className} items-center justify-center rounded-full font-extrabold shrink-0`}
      style={{
        width: `${size / 16}rem`,
        height: `${size / 16}rem`,
        background: color,
        color: '#fff',
        fontFamily: 'var(--font-display)',
        fontSize: `${(size * 0.45) / 16}rem`,
        boxShadow: 'inset 0 -3px 0 rgba(0,0,0,0.25)',
      }}
    >
      {initialOf(name)}
    </span>
  );
}

function OptionShape({ index, size = 18 }: { index: number; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ width: `${size / 16}rem`, height: `${size / 16}rem` }} aria-hidden>
      <path d={OPTION_SHAPES[index % OPTION_SHAPES.length]} fill="currentColor" />
    </svg>
  );
}

function StageButton({
  onClick,
  children,
  color = STAGE.gold,
  edge = STAGE.goldEdge,
  text = '#2b1a00',
  autoFocus,
  disabled,
}: {
  onClick: () => void;
  children: ReactNode;
  color?: string;
  edge?: string;
  text?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      autoFocus={autoFocus}
      disabled={disabled}
      className="inline-flex items-center justify-center gap-2 h-12 px-5 rounded-2xl font-extrabold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-3 focus-visible:outline-offset-2 active:translate-y-0.5"
      style={{
        background: color,
        color: text,
        border: 'none',
        boxShadow: `inset 0 -5px 0 ${edge}`,
        fontFamily: 'var(--font-display)',
        outlineColor: '#ffffff',
      }}
    >
      {children}
    </button>
  );
}

// ---------- Page ----------

export default function LiveHostPage() {
  const { sessionId } = useParams();
  const user = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.loading);
  const sets = useSetStore((s) => s.sets);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    void useSetStore
      .getState()
      .loadSets()
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const set = sets.find((s) => s.id === sessionId);

  if (!isLiveAvailable()) {
    return (
      <Notice icon={<Radio size={28} />} title="Live games need the cloud">
        This copy of StudyFlow isn't connected to Supabase, so there's no way to reach
        players' phones. Add the Supabase URL and anon key to enable live games.
      </Notice>
    );
  }
  if (authLoading || (!set && !loaded)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }
  if (!user) {
    return (
      <Notice icon={<Radio size={28} />} title="Sign in to host">
        Hosting a live game needs an account. Players can join without one.
        <div className="mt-4">
          <Link to="/signin" className="font-bold underline" style={{ color: 'var(--color-primary)' }}>
            Sign in
          </Link>
        </div>
      </Notice>
    );
  }
  if (!set) {
    return (
      <Notice icon={<Radio size={28} />} title="Set not found">
        We couldn't find that set.{' '}
        <Link to="/" className="font-bold underline" style={{ color: 'var(--color-primary)' }}>
          Back to your sets
        </Link>
      </Notice>
    );
  }
  return <HostRoom key={set.id} set={set} />;
}

// ---------- Room ----------

function HostRoom({ set }: { set: StudySet }) {
  const navigate = useNavigate();
  const [engine] = useState(() => new BuzzerHost(set.id, set.title));
  const snap = useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    void engine.connect();
    return () => engine.dispose();
  }, [engine]);

  const usableCount = useMemo(() => set.cards.filter(hasContent).length, [set.cards]);

  const inGame = snap.phase !== 'lobby' && snap.phase !== 'final';

  const endGame = async () => {
    setClosing(true);
    await engine.closeRoom();
    navigate(`/sets/${set.id}`);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-5">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div className="flex items-center gap-2 min-w-0">
          {confirmEnd ? (
            <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Confirm ending the game">
              <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                End the game for everyone?
              </span>
              <button
                type="button"
                onClick={() => void endGame()}
                disabled={closing}
                autoFocus
                className="h-9 px-3 rounded-lg text-sm font-bold cursor-pointer focus-visible:outline-2"
                style={{ background: 'var(--color-danger)', color: '#fff', border: 'none' }}
              >
                End game
              </button>
              <button
                type="button"
                onClick={() => setConfirmEnd(false)}
                className="h-9 px-3 rounded-lg text-sm font-semibold cursor-pointer focus-visible:outline-2"
                style={{ background: 'var(--color-muted)', color: 'var(--color-text)', border: 'none' }}
              >
                Keep playing
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => (inGame ? setConfirmEnd(true) : void endGame())}
              className="flex items-center gap-1.5 h-9 px-2.5 rounded-lg text-sm font-semibold cursor-pointer hover:bg-black/10 focus-visible:outline-2"
              style={{ background: 'transparent', border: 'none', color: 'var(--color-text-secondary)' }}
            >
              <X size={16} /> {snap.phase === 'lobby' ? 'Close room' : 'End game'}
            </button>
          )}
          <SoundToggle color="var(--color-text-secondary)" />
        </div>
        <div className="flex items-center gap-2 text-sm font-semibold min-w-0" style={{ color: 'var(--color-text-secondary)' }}>
          <span className="truncate max-w-[40vw]">{set.title}</span>
          <ConnectionPill status={snap.status} />
        </div>
      </div>

      {snap.status === 'error' && (
        <div
          role="alert"
          className="mb-4 rounded-2xl px-4 py-3 text-sm"
          style={{ background: 'var(--color-danger-light)', color: 'var(--color-text)' }}
        >
          Couldn't open the live room. Realtime may be turned off for this Supabase project, or the
          network is blocking WebSockets. Players won't be able to join until this connects.
        </div>
      )}

      {snap.phase === 'lobby' && <Lobby snap={snap} engine={engine} usableCount={usableCount} set={set} />}
      {snap.phase === 'countdown' && (
        <>
          <Lobby snap={snap} engine={engine} usableCount={usableCount} set={set} locked />
          <Countdown accent={STAGE.gold} onDone={() => engine.openQuestion(0)} />
        </>
      )}
      {snap.phase === 'question' && snap.question && <QuestionStage snap={snap} question={snap.question} engine={engine} />}
      {snap.phase === 'reveal' && snap.question && <RevealStage snap={snap} question={snap.question} engine={engine} />}
      {snap.phase === 'leaderboard' && <LeaderboardStage snap={snap} engine={engine} />}
      {snap.phase === 'final' && <FinalStage snap={snap} engine={engine} onClose={() => void endGame()} />}
    </div>
  );
}

function ConnectionPill({ status }: { status: HostSnapshot['status'] }) {
  const map = {
    connecting: { label: 'Connecting', color: 'var(--color-warning)' },
    connected: { label: 'Live', color: 'var(--color-success)' },
    reconnecting: { label: 'Reconnecting', color: 'var(--color-warning)' },
    error: { label: 'Offline', color: 'var(--color-danger)' },
  } as const;
  const m = map[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-bold shrink-0"
      style={{ background: 'var(--color-muted)', color: 'var(--color-text)' }}
      role="status"
    >
      <span className="w-2 h-2 rounded-full" style={{ background: m.color }} aria-hidden />
      {m.label}
    </span>
  );
}

// ---------- Lobby ----------

function CodeMarquee({ code }: { code: string }) {
  // Bulbs around the frame; every other one breathes (off under reduced motion).
  const bulbs = useMemo(() => {
    const out: { left: string; top: string }[] = [];
    const n = 12;
    for (let i = 0; i <= n; i++) {
      out.push({ left: `${(i / n) * 100}%`, top: '0%' });
      out.push({ left: `${(i / n) * 100}%`, top: '100%' });
    }
    for (let i = 1; i < 4; i++) {
      out.push({ left: '0%', top: `${(i / 4) * 100}%` });
      out.push({ left: '100%', top: `${(i / 4) * 100}%` });
    }
    return out;
  }, []);
  return (
    <div className="bz-marquee px-6 sm:px-10 py-5 sm:py-7 inline-block max-w-full">
      {bulbs.map((b, i) => (
        <span
          key={i}
          aria-hidden
          className={`bz-bulb ${i % 2 ? 'bz-bulb-off' : ''}`}
          style={{ left: b.left, top: b.top, transform: 'translate(-50%, -50%)' }}
        />
      ))}
      <div className="text-sm font-bold mb-1 text-center" style={{ color: STAGE.sub }}>
        Game code
      </div>
      <div
        className="bz-code text-center"
        style={{ fontSize: 'clamp(1.75rem, 11vw, 6.5rem)', color: STAGE.gold }}
        aria-label={`Game code ${code.split('').join(' ')}`}
      >
        {code}
      </div>
    </div>
  );
}

function Lobby({
  snap,
  engine,
  usableCount,
  set,
  locked,
}: {
  snap: HostSnapshot;
  engine: BuzzerHost;
  usableCount: number;
  set: StudySet;
  locked?: boolean;
}) {
  const reduce = useReducedMotion();
  const [origin] = useState(() => window.location.origin);
  const [count, setCount] = useState(() => Math.min(10, Math.max(5, usableCount)));
  const [seconds, setSeconds] = useState<number>(20);
  const [types, setTypes] = useState<QuestionType[]>(['multiple-choice', 'true-false']);
  const [direction, setDirection] = useState<AnswerDirection>('term-to-def');
  const [error, setError] = useState<string | null>(null);

  const online = snap.players.filter((p) => p.online);

  const toggleType = (t: QuestionType) =>
    setTypes((prev) => (prev.includes(t) ? (prev.length > 1 ? prev.filter((x) => x !== t) : prev) : [...prev, t]));

  const start = () => {
    if (online.length === 0) return;
    const questions = buildLiveQuestions(set.cards, count, types, direction);
    if (questions.length === 0) {
      setError('This set needs at least two cards with content to make questions.');
      return;
    }
    setError(null);
    playSound('click');
    engine.start(questions, seconds);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_21.25rem]">
      <section className="bz-stage rounded-3xl p-5 sm:p-8 min-h-[26.25rem]" aria-label="Lobby">
        <StageBeams />
        <div className="relative flex flex-col items-center text-center">
          <div className="flex items-center gap-3 mb-4">
            <BuzzerIcon size={56} />
            <div className="text-left min-w-0">
              <h1 className="text-2xl sm:text-3xl font-extrabold" style={{ fontFamily: 'var(--font-display)', color: STAGE.text }}>
                Buzzer Battle
              </h1>
              <p className="text-sm sm:text-base font-semibold" style={{ color: STAGE.sub }}>
                Join at <span className="[overflow-wrap:anywhere]" style={{ color: STAGE.text }}>{origin.replace(/^https?:\/\//, '')}/live</span>
              </p>
            </div>
          </div>
          <CodeMarquee code={snap.code} />
          <div className="mt-6 flex items-center gap-2 font-bold" style={{ color: STAGE.sub }} aria-live="polite">
            <Users size={18} />
            <span className="tabular-nums">
              {online.length} {online.length === 1 ? 'player' : 'players'}
            </span>
            {snap.full && <span>(room full, max {MAX_PLAYERS})</span>}
          </div>
          {online.length === 0 ? (
            <p className="mt-6 font-semibold" style={{ color: STAGE.sub }}>
              Waiting for players
              <span className="ml-1" aria-hidden>
                <span className="bz-wait-dot" />
                <span className="bz-wait-dot" />
                <span className="bz-wait-dot" />
              </span>
            </p>
          ) : (
            <ul className="mt-5 flex flex-wrap justify-center gap-2 max-w-3xl list-none p-0">
              <AnimatePresence initial={false}>
                {online.map((p) => (
                  <motion.li
                    key={p.id}
                    layout={!reduce}
                    initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.4, y: 12 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: reduce ? 1 : 0.6 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 26 }}
                    className="flex items-center gap-2 pl-1.5 pr-1 h-11 rounded-full"
                    style={{ background: STAGE.panel, boxShadow: `inset 0 -3px 0 ${STAGE.panelEdge}` }}
                  >
                    <Avatar name={p.name} color={p.color} size={32} />
                    <span className="font-bold max-w-[12rem] truncate" style={{ color: STAGE.text }}>
                      {p.name}
                    </span>
                    {!locked && (
                      <button
                        type="button"
                        onClick={() => engine.kick(p.id)}
                        aria-label={`Remove ${p.name}`}
                        className="flex items-center justify-center w-8 h-8 rounded-full cursor-pointer hover:bg-white/15 focus-visible:outline-2"
                        style={{ background: 'transparent', border: 'none', color: STAGE.sub, outlineColor: '#fff' }}
                      >
                        <X size={15} />
                      </button>
                    )}
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </section>

      <section
        className="rounded-3xl p-5 flex flex-col gap-5 self-start"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        aria-label="Game settings"
      >
        <SetupSection label="Questions">
          <ChoicePills
            options={COUNT_OPTIONS.map((n) => ({ value: n, label: String(n) }))}
            isSelected={(v) => v === count}
            onToggle={setCount}
            accent={STAGE.buzzer}
          />
        </SetupSection>
        <SetupSection label="Seconds per question">
          <ChoicePills
            options={SECONDS_OPTIONS.map((n) => ({ value: n, label: `${n}s` }))}
            isSelected={(v) => v === seconds}
            onToggle={setSeconds}
            accent={STAGE.buzzer}
          />
        </SetupSection>
        <SetupSection label="Question types">
          <ChoicePills
            options={[
              { value: 'multiple-choice' as QuestionType, label: 'Multiple choice' },
              { value: 'true-false' as QuestionType, label: 'True or false' },
            ]}
            isSelected={(v) => types.includes(v)}
            onToggle={toggleType}
            accent={STAGE.buzzer}
          />
        </SetupSection>
        <SetupSection label="Answer with">
          <ChoicePills
            options={[
              { value: 'term-to-def' as AnswerDirection, label: 'Definitions' },
              { value: 'def-to-term' as AnswerDirection, label: 'Terms' },
              { value: 'both' as AnswerDirection, label: 'Both' },
            ]}
            isSelected={(v) => v === direction}
            onToggle={setDirection}
            accent={STAGE.buzzer}
          />
        </SetupSection>
        {usableCount < 2 && (
          <p className="text-sm" style={{ color: 'var(--color-danger)' }}>
            This set needs at least two cards to play.
          </p>
        )}
        {error && (
          <p className="text-sm" role="alert" style={{ color: 'var(--color-danger)' }}>
            {error}
          </p>
        )}
        {online.length === 0 || usableCount < 2 || locked ? (
          <button
            type="button"
            disabled
            className="w-full h-14 rounded-2xl text-lg font-extrabold cursor-not-allowed"
            style={{ background: 'var(--color-muted)', color: 'var(--color-text-tertiary)', border: 'none', fontFamily: 'var(--font-display)' }}
          >
            {locked ? 'Starting' : 'Waiting for players'}
          </button>
        ) : (
          <PlayButton color={STAGE.buzzer} onClick={start}>
            Start with {online.length} {online.length === 1 ? 'player' : 'players'}
          </PlayButton>
        )}
        <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
          Right answers earn 500 points plus up to 500 for speed, and answer streaks add a bonus.
        </p>
      </section>
    </div>
  );
}

// ---------- Question ----------

function useRemaining(endsAt: number): number {
  const [left, setLeft] = useState(() => Math.max(0, endsAt - Date.now()));
  useEffect(() => {
    const id = setInterval(() => setLeft(Math.max(0, endsAt - Date.now())), 200);
    return () => clearInterval(id);
  }, [endsAt]);
  return left;
}

function TimerRing({ endsAt, durationMs }: { endsAt: number; durationMs: number }) {
  const left = useRemaining(endsAt);
  const secs = Math.ceil(left / 1000);
  useEffect(() => {
    if (secs > 0 && secs <= 3) playSound('tick');
  }, [secs]);
  const frac = durationMs > 0 ? left / durationMs : 0;
  const r = 26;
  const c = 2 * Math.PI * r;
  const low = secs <= 5;
  return (
    <div className="relative w-20 h-20 shrink-0" role="timer" aria-label={`${secs} seconds left`}>
      <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90" aria-hidden>
        <circle cx="32" cy="32" r={r} fill={STAGE.panel} stroke="rgba(255,255,255,0.12)" strokeWidth="6" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke={low ? STAGE.buzzer : STAGE.gold}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          style={{ transition: 'stroke-dashoffset 0.2s linear' }}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center text-3xl font-extrabold tabular-nums"
        style={{ fontFamily: 'var(--font-display)', color: low ? '#ffb3b5' : STAGE.text }}
      >
        {secs}
      </span>
    </div>
  );
}

function PromptBlock({ question }: { question: LiveQuestion }) {
  if (question.kind === 'tf' && question.tf) {
    return (
      <div>
        <p className="text-base font-bold mb-2" style={{ color: STAGE.sub }}>
          True or false: does this pair match?
        </p>
        <div className="rounded-2xl p-4 sm:p-5" style={{ background: STAGE.panel, boxShadow: `inset 0 -5px 0 ${STAGE.panelEdge}` }}>
          <StudyContent html={question.tf.term} className="text-2xl sm:text-4xl font-extrabold leading-tight" />
          <div className="my-3 h-px" style={{ background: 'rgba(255,255,255,0.18)' }} />
          <StudyContent html={question.tf.def} className="text-xl sm:text-3xl font-semibold leading-snug" />
        </div>
      </div>
    );
  }
  return (
    <StudyContent
      html={question.prompt}
      className="text-2xl sm:text-4xl font-extrabold leading-tight break-words"
    />
  );
}

function HostTiles({
  question,
  reveal,
  counts,
}: {
  question: LiveQuestion;
  reveal?: boolean;
  counts?: number[];
}) {
  const reduce = useReducedMotion();
  const tf = question.kind === 'tf';
  return (
    <ul className={`grid gap-3 list-none p-0 m-0 ${tf ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'}`}>
      {question.options.map((opt, i) => {
        const c = tf ? (i === 0 ? TILE_COLORS[3] : TILE_COLORS[0]) : TILE_COLORS[i % TILE_COLORS.length];
        const right = question.correct.includes(i);
        const faded = reveal && !right;
        return (
          <motion.li
            key={i}
            animate={{ opacity: faded ? 0.35 : 1, scale: reveal && right && !reduce ? [1, 1.04, 1] : 1 }}
            transition={{ duration: 0.4 }}
            className="bz-tile flex items-center gap-3 min-h-[72px] px-4 py-3 rounded-2xl"
            style={{ background: c.bg, color: c.text, boxShadow: `inset 0 -5px 0 ${c.edge}` }}
          >
            <span
              className="flex items-center justify-center w-9 h-9 rounded-xl shrink-0"
              style={{ background: 'rgba(0,0,0,0.18)' }}
              aria-hidden
            >
              {reveal && right ? (
                <Check size={20} strokeWidth={3} />
              ) : tf ? (
                i === 0 ? <Check size={20} strokeWidth={3} /> : <X size={20} strokeWidth={3} />
              ) : (
                <OptionShape index={i} />
              )}
            </span>
            {tf ? (
              <span className="text-2xl font-extrabold min-w-0 break-words" style={{ fontFamily: 'var(--font-display)' }}>
                {opt}
              </span>
            ) : (
              <StudyContent html={opt} className="text-lg sm:text-xl font-bold leading-snug min-w-0 break-words flex-1" />
            )}
            {counts && (
              <span className="ml-auto text-xl font-extrabold tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>
                {counts[i] ?? 0}
              </span>
            )}
            {reveal && right && <span className="sr-only">(correct answer)</span>}
          </motion.li>
        );
      })}
    </ul>
  );
}

function QuestionStage({ snap, question, engine }: { snap: HostSnapshot; question: LiveQuestion; engine: BuzzerHost }) {
  const online = snap.players.filter((p) => p.online);
  const answered = new Set(snap.answered);
  return (
    <section className="bz-stage rounded-3xl p-5 sm:p-8" aria-label={`Question ${snap.qIndex + 1} of ${snap.total}`}>
      <StageBeams />
      <div className="relative">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
          <div className="text-lg font-extrabold" style={{ fontFamily: 'var(--font-display)', color: STAGE.sub }}>
            Question {snap.qIndex + 1} <span className="opacity-70">of {snap.total}</span>
          </div>
          <div className="flex items-center gap-2">
            <StageButton onClick={() => engine.skip()} color={STAGE.panel} edge={STAGE.panelEdge} text={STAGE.text}>
              <SkipForward size={18} /> Skip
            </StageButton>
            <StageButton onClick={() => engine.finishQuestion()}>Reveal now</StageButton>
          </div>
        </div>
        <div className="flex items-start gap-5 mb-6">
          <div className="flex-1 min-w-0">
            <PromptBlock question={question} />
          </div>
          <TimerRing key={snap.qIndex} endsAt={snap.endsAt} durationMs={snap.durationMs} />
        </div>
        <HostTiles question={question} />
        <div className="mt-6 flex items-center gap-3 flex-wrap" aria-live="polite">
          <span className="text-lg font-extrabold tabular-nums" style={{ fontFamily: 'var(--font-display)', color: STAGE.text }}>
            {snap.answeredCount} of {online.length} answered
          </span>
          <div className="flex flex-wrap gap-1" aria-hidden>
            {online.map((p) => (
              <span
                key={p.id}
                title={p.name}
                className="w-3.5 h-3.5 rounded-full transition-colors"
                style={{ background: answered.has(p.id) ? p.color : 'rgba(255,255,255,0.15)' }}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------- Reveal ----------

function Distribution({ question, counts }: { question: LiveQuestion; counts: number[] }) {
  const reduce = useReducedMotion();
  const max = Math.max(1, ...counts);
  const total = counts.reduce((a, b) => a + b, 0);
  const tf = question.kind === 'tf';
  return (
    <figure className="m-0">
      <figcaption className="text-sm font-bold mb-3" style={{ color: STAGE.sub }}>
        How the room answered ({total} {total === 1 ? 'answer' : 'answers'})
      </figcaption>
      <div className="flex items-end justify-center gap-3 sm:gap-6 h-44" role="list">
        {counts.map((n, i) => {
          const c = tf ? (i === 0 ? TILE_COLORS[3] : TILE_COLORS[0]) : TILE_COLORS[i % TILE_COLORS.length];
          const right = question.correct.includes(i);
          const label = tf ? question.options[i] : `Answer ${i + 1}`;
          return (
            <div key={i} role="listitem" aria-label={`${label}: ${n}${right ? ', correct' : ''}`} className="flex flex-col items-center gap-1.5 w-14 sm:w-20 h-full justify-end">
              <span className="text-xl font-extrabold tabular-nums" style={{ fontFamily: 'var(--font-display)', color: STAGE.text }}>
                {n}
              </span>
              <motion.div
                className="w-full rounded-t-xl"
                style={{ background: c.bg, boxShadow: `inset 0 -4px 0 ${c.edge}`, opacity: right ? 1 : 0.55 }}
                initial={reduce ? false : { height: 6 }}
                animate={{ height: `${Math.max(6, (n / max) * 100)}%` }}
                transition={{ type: 'spring', stiffness: 160, damping: 22, delay: reduce ? 0 : 0.1 + i * 0.08 }}
              />
              <span
                className="flex items-center justify-center w-9 h-9 rounded-xl"
                style={{ background: c.bg, color: c.text }}
                aria-hidden
              >
                {right ? <Check size={18} strokeWidth={3} /> : tf ? (i === 0 ? <Check size={18} /> : <X size={18} />) : <OptionShape index={i} />}
              </span>
            </div>
          );
        })}
      </div>
    </figure>
  );
}

function RevealStage({ snap, question, engine }: { snap: HostSnapshot; question: LiveQuestion; engine: BuzzerHost }) {
  useEffect(() => {
    playSound('match');
  }, []);
  const online = snap.players.length;
  const correct = snap.players.filter((p) => p.lastCorrect === true).length;
  return (
    <section className="bz-stage rounded-3xl p-5 sm:p-8" aria-label="Answer reveal">
      <StageBeams />
      <div className="relative">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
          <div className="text-lg font-extrabold" style={{ fontFamily: 'var(--font-display)', color: STAGE.sub }}>
            Question {snap.qIndex + 1} <span className="opacity-70">of {snap.total}</span>
          </div>
          <StageButton onClick={() => engine.showLeaderboard()} autoFocus>
            Leaderboard
          </StageButton>
        </div>
        <div className="mb-5">
          <PromptBlock question={question} />
        </div>
        <div className="grid gap-6 lg:grid-cols-[1fr_minmax(260px,380px)] items-end">
          <HostTiles question={question} reveal counts={snap.counts} />
          <Distribution question={question} counts={snap.counts} />
        </div>
        <p className="mt-5 text-lg font-extrabold" role="status" style={{ fontFamily: 'var(--font-display)', color: STAGE.good }}>
          {correct} of {online} got it right
        </p>
      </div>
    </section>
  );
}

// ---------- Leaderboard ----------

function sortByRank(players: HostPlayer[], key: 'rank' | 'prevRank'): HostPlayer[] {
  return [...players].sort((a, b) => {
    const ra = a[key] ?? Number.MAX_SAFE_INTEGER;
    const rb = b[key] ?? Number.MAX_SAFE_INTEGER;
    return ra - rb || a.name.localeCompare(b.name);
  });
}

function LeaderboardStage({ snap, engine }: { snap: HostSnapshot; engine: BuzzerHost }) {
  const reduce = useReducedMotion();
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      setSettled(true);
      playSound('move');
    }, reduce ? 0 : 900);
    return () => clearTimeout(t);
  }, [reduce]);

  const order = sortByRank(snap.players, settled ? 'rank' : 'prevRank').slice(0, 5);
  const last = snap.qIndex + 1 >= snap.total;

  return (
    <section className="bz-stage rounded-3xl p-5 sm:p-8" aria-label="Leaderboard">
      <StageBeams />
      <div className="relative max-w-3xl mx-auto">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-6">
          <h2 className="text-3xl font-extrabold" style={{ fontFamily: 'var(--font-display)', color: STAGE.text }}>
            Leaderboard
          </h2>
          <StageButton onClick={() => engine.next()} autoFocus>
            {last ? 'Final results' : 'Next question'}
          </StageButton>
        </div>
        {order.length === 0 ? (
          <p style={{ color: STAGE.sub }}>No players yet.</p>
        ) : (
          <ol className="list-none p-0 m-0 flex flex-col gap-2.5">
            {order.map((p) => {
              const rank = settled ? p.rank : p.prevRank;
              const moved = settled && p.prevRank !== null && p.rank !== null ? p.prevRank - p.rank : 0;
              return (
                <motion.li
                  key={p.id}
                  layout={!reduce}
                  transition={{ type: 'spring', stiffness: 260, damping: 28 }}
                  className="flex items-center gap-2 sm:gap-3 min-h-16 px-3 sm:px-4 rounded-2xl"
                  style={{ background: STAGE.panel, boxShadow: `inset 0 -4px 0 ${STAGE.panelEdge}` }}
                >
                  <span className="w-6 sm:w-8 shrink-0 text-2xl font-extrabold tabular-nums text-center" style={{ fontFamily: 'var(--font-display)', color: STAGE.gold }}>
                    {rank ?? '–'}
                  </span>
                  <Avatar name={p.name} color={p.color} size={38} className="hidden min-[400px]:inline-flex" />
                  <span className="font-bold text-lg truncate min-w-0 flex-1" style={{ color: STAGE.text }}>
                    {p.name}
                    {!p.online && <WifiOff size={14} className="inline ml-2 opacity-60" aria-label="offline" />}
                  </span>
                  <AnimatePresence>
                    {settled && moved !== 0 && (
                      <motion.span
                        initial={reduce ? { opacity: 0 } : { opacity: 0, y: moved > 0 ? 8 : -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center text-sm font-extrabold"
                        style={{ color: moved > 0 ? STAGE.good : '#ff8f93' }}
                        aria-label={moved > 0 ? `up ${moved}` : `down ${-moved}`}
                      >
                        {moved > 0 ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
                        {Math.abs(moved)}
                      </motion.span>
                    )}
                  </AnimatePresence>
                  {p.lastPoints > 0 && (
                    <span className="hidden sm:inline text-sm font-bold tabular-nums" style={{ color: STAGE.good }}>
                      +{p.lastPoints}
                    </span>
                  )}
                  <span className="text-xl font-extrabold tabular-nums sm:w-20 shrink-0 text-right" style={{ fontFamily: 'var(--font-display)', color: STAGE.text }}>
                    {p.score.toLocaleString()}
                  </span>
                  <button
                    type="button"
                    onClick={() => engine.kick(p.id)}
                    aria-label={`Remove ${p.name}`}
                    className="flex items-center justify-center w-8 h-8 rounded-full cursor-pointer hover:bg-white/15 focus-visible:outline-2 shrink-0"
                    style={{ background: 'transparent', border: 'none', color: STAGE.sub, outlineColor: '#fff' }}
                  >
                    <X size={15} />
                  </button>
                </motion.li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}

// ---------- Final ----------

function FinalStage({ snap, engine, onClose }: { snap: HostSnapshot; engine: BuzzerHost; onClose: () => void }) {
  const reduce = useReducedMotion();
  const ranked = sortByRank(snap.players, 'rank');
  const podium = ranked.slice(0, 3);

  useEffect(() => {
    playSound('win');
    let stop: (() => void) | undefined;
    const t = setTimeout(() => {
      stop = celebrate([STAGE.gold, STAGE.buzzer, '#ffffff', '#0b74d6'], 1400);
    }, reduce ? 0 : 1500);
    return () => {
      clearTimeout(t);
      stop?.();
    };
  }, [reduce]);

  const steps = [
    { place: 2, p: podium[1], h: '7.5rem', color: STAGE.silver, edge: STAGE.silverEdge, delay: 0.5 },
    { place: 1, p: podium[0], h: '10.625rem', color: STAGE.gold, edge: STAGE.goldEdge, delay: 1.0 },
    { place: 3, p: podium[2], h: '5.3125rem', color: STAGE.bronze, edge: STAGE.bronzeEdge, delay: 0.1 },
  ];

  return (
    <div className="flex flex-col gap-4">
      <section className="bz-stage rounded-3xl p-5 sm:p-8" aria-label="Podium">
        <StageBeams />
        <div className="relative">
          <h2 className="text-center text-3xl sm:text-4xl font-extrabold mb-6" style={{ fontFamily: 'var(--font-display)', color: STAGE.text }}>
            {podium[0] ? `${podium[0].name} wins!` : 'Game over'}
          </h2>
          <ol className="list-none p-0 m-0 flex items-end justify-center gap-2 sm:gap-4" style={{ minHeight: '18.125rem' }}>
            {steps.map(({ place, p, h, color, edge, delay }) => (
              <li key={place} className="flex flex-col items-center w-24 sm:w-40 min-w-0" aria-label={p ? `${ordinal(place)} place: ${p.name}, ${p.score} points` : `${ordinal(place)} place: empty`}>
                {p && (
                  <motion.div
                    initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: reduce ? 0 : delay + 0.45, duration: 0.35 }}
                    className="flex flex-col items-center mb-2 min-w-0 max-w-full"
                  >
                    <Avatar name={p.name} color={p.color} size={place === 1 ? 60 : 48} />
                    <span className="mt-1 font-extrabold text-sm sm:text-lg truncate max-w-full" style={{ color: STAGE.text }}>
                      {p.name}
                    </span>
                    <span className="text-xs sm:text-sm font-bold tabular-nums" style={{ color: STAGE.sub }}>
                      {p.score.toLocaleString()}
                    </span>
                  </motion.div>
                )}
                <motion.div
                  className="w-full rounded-t-2xl flex items-start justify-center pt-2"
                  style={{ background: color, boxShadow: `inset 0 -6px 0 ${edge}`, originY: 1 }}
                  initial={reduce ? false : { height: '0rem' }}
                  animate={{ height: h }}
                  transition={{ type: 'spring', stiffness: 120, damping: 16, delay: reduce ? 0 : delay }}
                  aria-hidden
                >
                  <span className="text-3xl sm:text-4xl font-extrabold" style={{ fontFamily: 'var(--font-display)', color: '#2b1a00' }}>
                    {place}
                  </span>
                </motion.div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section
        className="rounded-3xl p-5"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        aria-label="Full standings"
      >
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <h3 className="text-xl font-extrabold" style={{ color: 'var(--color-text)' }}>
            Standings
          </h3>
          <div className="flex gap-2 flex-wrap">
            <StageButton onClick={() => engine.playAgain()} color={STAGE.buzzer} edge={STAGE.buzzerEdge} text="#ffffff" autoFocus>
              Play again
            </StageButton>
            <StageButton onClick={onClose} color="var(--color-muted)" edge="rgba(0,0,0,0.15)" text="var(--color-text)">
              Close room
            </StageButton>
          </div>
        </div>
        <ol className="list-none p-0 m-0 divide-y" style={{ borderColor: 'var(--color-border)' }}>
          {ranked.map((p) => (
            <li key={p.id} className="flex items-center gap-2 sm:gap-3 py-2.5" style={{ borderColor: 'var(--color-border)' }}>
              <span className="w-8 text-center font-extrabold tabular-nums" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-display)' }}>
                {p.rank ?? '–'}
              </span>
              <Avatar name={p.name} color={p.color} size={30} />
              <span className="flex-1 min-w-0 truncate font-semibold" style={{ color: 'var(--color-text)' }}>
                {p.name}
              </span>
              <span className="text-sm tabular-nums hidden sm:inline" style={{ color: 'var(--color-text-secondary)' }}>
                {p.correctCount} of {snap.total} right
              </span>
              <span className="sm:w-20 shrink-0 text-right font-extrabold tabular-nums" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
                {p.score.toLocaleString()}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
