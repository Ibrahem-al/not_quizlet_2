import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, Flame, LogOut, WifiOff, X } from 'lucide-react';
import StudyContent from '@/components/StudyContent';
import { TILE_COLORS } from '@/components/games/gameLogic';
import { playSound } from '@/lib/gameSounds';
import {
  BuzzerPlayer,
  OPTION_SHAPES,
  initialOf,
  isLiveAvailable,
  isValidCode,
  normalizeCode,
  ordinal,
  sanitizeNickname,
  type PlayerQuestion,
  type PlayerSnapshot,
} from '@/lib/liveBuzzer';
import './LiveBuzzer.css';

// ============================================================
// Buzzer Battle — player's phone. The host screen shows the question
// too, but it's repeated here so nobody depends on reading a projector.
// ============================================================

const STAGE = {
  panel: '#241f58',
  panelEdge: '#0d0b24',
  sub: '#c3bdf0',
  gold: '#ffc53d',
  good: '#3ecf8e',
  goodEdge: '#1f8f5c',
  bad: '#e5484d',
  badEdge: '#9e1f25',
  buzzer: '#e5484d',
  buzzerEdge: '#9e1f25',
};

const NO_HOST_AFTER_MS = 6000;
const HOST_LOST_GRACE_MS = 2500;

export default function LivePlayPage() {
  const [params] = useSearchParams();
  const code = normalizeCode(params.get('code') ?? '');
  const name = sanitizeNickname(params.get('name') ?? '');

  if (!isLiveAvailable()) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-extrabold mb-2" style={{ color: 'var(--color-text)' }}>
          Live games aren't available
        </h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>This copy of StudyFlow isn't connected to the cloud.</p>
      </div>
    );
  }
  if (!isValidCode(code) || !name) {
    return <Navigate to={code ? `/live?code=${code}` : '/live'} replace />;
  }
  return <PlayerRoom key={`${code}|${name}`} code={code} name={name} />;
}

function Avatar({ name, color, size = 40 }: { name: string; color: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex items-center justify-center rounded-full font-extrabold shrink-0"
      style={{
        width: size,
        height: size,
        background: color,
        color: '#fff',
        fontFamily: 'var(--font-display)',
        fontSize: size * 0.45,
        boxShadow: 'inset 0 -3px 0 rgba(0,0,0,0.25)',
      }}
    >
      {initialOf(name)}
    </span>
  );
}

function WaitDots() {
  return (
    <span aria-hidden className="inline-flex items-center ml-1">
      <span className="bz-wait-dot" />
      <span className="bz-wait-dot" />
      <span className="bz-wait-dot" />
    </span>
  );
}

function Center({ children }: { children: ReactNode }) {
  return <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 py-8">{children}</div>;
}

function Title({ children }: { children: ReactNode }) {
  return (
    <h1 className="text-3xl font-extrabold" style={{ fontFamily: 'var(--font-display)', color: '#fff' }}>
      {children}
    </h1>
  );
}

function Sub({ children }: { children: ReactNode }) {
  return (
    <p className="text-base font-semibold max-w-xs" style={{ color: STAGE.sub }}>
      {children}
    </p>
  );
}

function StageLinkButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 h-12 px-6 rounded-2xl font-extrabold cursor-pointer focus-visible:outline-3 focus-visible:outline-offset-2"
      style={{
        background: STAGE.gold,
        color: '#2b1a00',
        border: 'none',
        boxShadow: 'inset 0 -5px 0 #b3820f',
        fontFamily: 'var(--font-display)',
        outlineColor: '#fff',
      }}
    >
      {children}
    </button>
  );
}

// ---------- Room ----------

function PlayerRoom({ code, name }: { code: string; name: string }) {
  const navigate = useNavigate();
  const [engine] = useState(() => new BuzzerPlayer(code, name));
  const snap = useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  const [noHost, setNoHost] = useState(false);
  const [lostShownFor, setLostShownFor] = useState<number | null>(null);

  useEffect(() => {
    void engine.connect();
    return () => engine.dispose();
  }, [engine]);

  // No host after a few seconds → the code is probably wrong.
  useEffect(() => {
    if (snap.status !== 'connected' || snap.hostSeen) return;
    const t = setTimeout(() => setNoHost(true), NO_HOST_AFTER_MS);
    return () => clearTimeout(t);
  }, [snap.status, snap.hostSeen]);

  // Short host blips (a projector laptop switching Wi-Fi) don't flash a banner.
  useEffect(() => {
    const lostAt = snap.hostLostAt;
    if (lostAt === null) return;
    const t = setTimeout(() => setLostShownFor(lostAt), HOST_LOST_GRACE_MS);
    return () => clearTimeout(t);
  }, [snap.hostLostAt]);

  const hostGone = snap.hostSeen && !snap.hostOnline && lostShownFor === snap.hostLostAt;
  const finished = snap.view === 'kicked' || snap.view === 'ended';

  const leave = () => {
    engine.dispose();
    navigate(`/live?code=${code}`);
  };

  return (
    <div className="max-w-lg mx-auto px-3 sm:px-4 py-3 sm:py-6">
      <div className="bz-stage rounded-3xl p-4 sm:p-6 min-h-[78vh] flex flex-col">
        <svg aria-hidden className="bz-stage-beams" viewBox="0 0 400 200" preserveAspectRatio="none">
          <polygon points="60,0 110,0 200,200 -20,200" fill="rgba(255,236,170,0.05)" />
          <polygon points="290,0 340,0 420,200 210,200" fill="rgba(255,236,170,0.05)" />
        </svg>
        <div className="relative flex flex-col flex-1">
          <header className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <Avatar name={name} color={engine.color} size={34} />
              <div className="min-w-0">
                <div className="font-extrabold truncate" style={{ color: '#fff' }}>
                  {name}
                </div>
                <div className="text-xs font-semibold" style={{ color: STAGE.sub }}>
                  Game {code}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {(snap.view === 'question' || snap.view === 'reveal') && (
                <span
                  className="h-9 px-3 inline-flex items-center rounded-xl font-extrabold tabular-nums"
                  style={{ background: STAGE.panel, color: '#fff', fontFamily: 'var(--font-display)' }}
                  aria-label={`Score ${snap.score}`}
                >
                  {snap.score.toLocaleString()}
                </span>
              )}
              {!finished && (
                <button
                  type="button"
                  onClick={leave}
                  aria-label="Leave game"
                  className="w-9 h-9 flex items-center justify-center rounded-xl cursor-pointer hover:bg-white/10 focus-visible:outline-2"
                  style={{ background: 'transparent', border: 'none', color: STAGE.sub, outlineColor: '#fff' }}
                >
                  <LogOut size={18} />
                </button>
              )}
            </div>
          </header>

          {(hostGone || snap.status === 'reconnecting') && !finished && (
            <div
              role="status"
              className="mb-3 flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold"
              style={{ background: 'rgba(255,197,61,0.15)', color: '#ffe7a8' }}
            >
              <WifiOff size={16} className="shrink-0" />
              {snap.status === 'reconnecting'
                ? 'Connection dropped. Reconnecting…'
                : 'Lost the host. Hang tight, you will rejoin automatically when they are back.'}
            </div>
          )}

          <PlayerBody snap={snap} engine={engine} noHost={noHost} name={name} code={code} onLeave={leave} />
        </div>
      </div>
    </div>
  );
}

function PlayerBody({
  snap,
  engine,
  noHost,
  name,
  code,
  onLeave,
}: {
  snap: PlayerSnapshot;
  engine: BuzzerPlayer;
  noHost: boolean;
  name: string;
  code: string;
  onLeave: () => void;
}) {
  const navigate = useNavigate();

  switch (snap.view) {
    case 'connecting':
      if (snap.status === 'error') {
        return (
          <Center>
            <Title>Can't connect</Title>
            <Sub>We couldn't reach the live game server. Check your connection and try again.</Sub>
            <StageLinkButton onClick={() => window.location.reload()}>Try again</StageLinkButton>
          </Center>
        );
      }
      if (noHost && !snap.hostSeen) {
        return (
          <Center>
            <Title>No game with that code</Title>
            <Sub>Check the code on the big screen. We'll keep looking in case the host is still setting up.</Sub>
            <StageLinkButton onClick={onLeave}>Change code</StageLinkButton>
          </Center>
        );
      }
      return (
        <Center>
          <Title>Joining</Title>
          <Sub>
            Looking for game {code}
            <WaitDots />
          </Sub>
        </Center>
      );
    case 'lobby':
      return <LobbyView name={name} color={engine.color} title={snap.title} />;
    case 'starting':
      return (
        <Center>
          <Title>Get ready</Title>
          <Sub>
            Eyes on the big screen
            <WaitDots />
          </Sub>
        </Center>
      );
    case 'question':
      return snap.question ? (
        <QuestionView key={snap.question.q} question={snap.question} choice={snap.choice} acked={snap.acked} onAnswer={(i) => engine.answer(i)} />
      ) : null;
    case 'reveal':
      return <RevealView snap={snap} />;
    case 'final':
      return <FinalView snap={snap} />;
    case 'kicked':
      return (
        <Center>
          <Title>You were removed</Title>
          <Sub>The host took you out of this game.</Sub>
          <StageLinkButton onClick={() => navigate('/live')}>Back to join</StageLinkButton>
        </Center>
      );
    case 'ended':
      return (
        <Center>
          <Title>Game closed</Title>
          <Sub>The host ended this game. Thanks for playing!</Sub>
          <StageLinkButton onClick={() => navigate('/live')}>Join another game</StageLinkButton>
        </Center>
      );
  }
}

// ---------- Views ----------

function LobbyView({ name, color, title }: { name: string; color: string; title: string }) {
  const reduce = useReducedMotion();
  return (
    <Center>
      <motion.div
        initial={reduce ? { opacity: 0 } : { scale: 0.3, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 18 }}
      >
        <Avatar name={name} color={color} size={96} />
      </motion.div>
      <Title>You're in!</Title>
      <Sub>Find your name on the big screen. The game starts when your teacher is ready.</Sub>
      {title && (
        <p className="text-sm font-bold mt-2 px-3 py-1.5 rounded-full max-w-full truncate" style={{ background: STAGE.panel, color: '#fff' }}>
          {title}
        </p>
      )}
      <p className="mt-2 text-sm font-semibold" style={{ color: STAGE.sub }}>
        Waiting
        <WaitDots />
      </p>
    </Center>
  );
}

function useDeadline(deadline: number): number {
  const [left, setLeft] = useState(() => Math.max(0, deadline - performance.now()));
  useEffect(() => {
    const id = setInterval(() => setLeft(Math.max(0, deadline - performance.now())), 150);
    return () => clearInterval(id);
  }, [deadline]);
  return left;
}

function OptionShape({ index, size = 22 }: { index: number; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d={OPTION_SHAPES[index % OPTION_SHAPES.length]} fill="currentColor" />
    </svg>
  );
}

function tileColor(question: { kind: 'mc' | 'tf' }, i: number) {
  if (question.kind === 'tf') return i === 0 ? TILE_COLORS[3] : TILE_COLORS[0];
  return TILE_COLORS[i % TILE_COLORS.length];
}

function QuestionView({
  question,
  choice,
  acked,
  onAnswer,
}: {
  question: PlayerQuestion;
  choice: number | null;
  acked: boolean;
  onAnswer: (i: number) => void;
}) {
  const reduce = useReducedMotion();
  const left = useDeadline(question.deadline);
  const secs = Math.ceil(left / 1000);
  const open = left > 0 && choice === null;
  const tf = question.kind === 'tf';

  const pick = (i: number) => {
    if (!open) return;
    playSound('click');
    try {
      navigator.vibrate?.(25);
    } catch {
      // not supported
    }
    onAnswer(i);
  };

  // 1–4 (or T/F) from a keyboard, e.g. a laptop player.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      let i = -1;
      if (tf && (k === 't' || k === 'f')) i = k === 't' ? 0 : 1;
      else {
        const n = parseInt(k, 10);
        if (n >= 1 && n <= question.options.length) i = n - 1;
      }
      if (i < 0) return;
      e.preventDefault();
      playSound('click');
      onAnswer(i);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, tf, question.options.length, onAnswer]);

  return (
    <div className="flex flex-col flex-1 gap-3">
      <div className="flex items-center gap-3">
        <span className="text-sm font-bold whitespace-nowrap" style={{ color: STAGE.sub }}>
          {question.q + 1} of {question.total}
        </span>
        <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.12)' }} aria-hidden>
          <div
            className="bz-timer-bar h-full rounded-full"
            style={{
              background: secs <= 5 ? STAGE.bad : STAGE.gold,
              transform: `scaleX(${question.durationMs > 0 ? Math.min(1, left / question.durationMs) : 0})`,
            }}
          />
        </div>
        <span
          role="timer"
          aria-label={`${secs} seconds left`}
          className="w-8 text-right text-xl font-extrabold tabular-nums"
          style={{ fontFamily: 'var(--font-display)', color: '#fff' }}
        >
          {secs}
        </span>
      </div>

      <div className="rounded-2xl p-3.5" style={{ background: STAGE.panel, boxShadow: `inset 0 -4px 0 ${STAGE.panelEdge}`, color: '#fff' }}>
        {tf && question.tf ? (
          <>
            <p className="text-xs font-bold mb-1" style={{ color: STAGE.sub }}>
              Does this pair match?
            </p>
            <StudyContent html={question.tf.term} className="text-lg font-extrabold leading-snug break-words" />
            <div className="my-2 h-px" style={{ background: 'rgba(255,255,255,0.18)' }} />
            <StudyContent html={question.tf.def} className="text-base font-semibold leading-snug break-words" />
          </>
        ) : (
          <StudyContent html={question.prompt} className="text-lg font-extrabold leading-snug break-words" />
        )}
      </div>

      {choice === null && left > 0 ? (
        <div className={`grid gap-2.5 flex-1 ${tf ? 'grid-cols-2' : 'grid-cols-1 min-[420px]:grid-cols-2'}`}>
          {question.options.map((opt, i) => {
            const c = tileColor(question, i);
            return (
              <motion.button
                key={i}
                type="button"
                onClick={() => pick(i)}
                whileTap={reduce ? undefined : { scale: 0.96, y: 3 }}
                className="bz-tile flex items-center gap-3 text-left min-h-[76px] px-3.5 py-3 rounded-2xl cursor-pointer focus-visible:outline-3 focus-visible:outline-offset-2"
                style={{ background: c.bg, color: c.text, border: 'none', boxShadow: `inset 0 -6px 0 ${c.edge}`, outlineColor: '#fff' }}
                aria-label={tf ? opt : undefined}
              >
                <span className="flex items-center justify-center w-9 h-9 rounded-xl shrink-0" style={{ background: 'rgba(0,0,0,0.18)' }} aria-hidden>
                  {tf ? (i === 0 ? <Check size={22} strokeWidth={3} /> : <X size={22} strokeWidth={3} />) : <OptionShape index={i} />}
                </span>
                {tf ? (
                  <span className="text-2xl font-extrabold" style={{ fontFamily: 'var(--font-display)' }}>
                    {opt}
                  </span>
                ) : (
                  <StudyContent html={opt} className="text-base font-bold leading-snug min-w-0 break-words" />
                )}
              </motion.button>
            );
          })}
        </div>
      ) : (
        <Center>
          {choice !== null ? (
            <>
              <motion.span
                initial={reduce ? { opacity: 0 } : { scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                className="flex items-center justify-center w-24 h-24 rounded-3xl"
                style={{
                  background: tileColor(question, choice).bg,
                  color: tileColor(question, choice).text,
                  boxShadow: `inset 0 -6px 0 ${tileColor(question, choice).edge}`,
                }}
                aria-hidden
              >
                {tf ? (choice === 0 ? <Check size={48} strokeWidth={3} /> : <X size={48} strokeWidth={3} />) : <OptionShape index={choice} size={48} />}
              </motion.span>
              <Title>Locked in</Title>
              <Sub>
                {acked ? 'Answer received. ' : 'Sending your answer. '}
                Waiting for the others
                <WaitDots />
              </Sub>
            </>
          ) : (
            <>
              <Title>Time's up</Title>
              <Sub>No answer this round. The next one is coming.</Sub>
            </>
          )}
        </Center>
      )}
    </div>
  );
}

function RevealView({ snap }: { snap: PlayerSnapshot }) {
  const reduce = useReducedMotion();
  const reveal = snap.reveal;
  const r = reveal?.result ?? null;
  const ok = r?.ok ?? false;
  const answered = r?.a ?? false;

  useEffect(() => {
    if (!r) return;
    playSound(r.ok ? 'correct' : 'wrong');
    if (r.ok && r.streak >= 3) playSound('combo');
  }, [r]);

  if (!reveal) return null;
  const q = snap.question && snap.question.q === reveal.q ? snap.question : null;
  const correctIdx = reveal.correct[0];
  const color = ok ? STAGE.good : STAGE.bad;
  const edge = ok ? STAGE.goodEdge : STAGE.badEdge;

  return (
    <Center>
      <motion.span
        initial={reduce ? { opacity: 0 } : { scale: 0.2, rotate: -20, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 420, damping: 16 }}
        className="flex items-center justify-center w-28 h-28 rounded-full"
        style={{ background: answered ? color : STAGE.panel, boxShadow: `inset 0 -7px 0 ${answered ? edge : STAGE.panelEdge}`, color: '#fff' }}
        aria-hidden
      >
        {ok ? <Check size={60} strokeWidth={3.5} /> : <X size={60} strokeWidth={3.5} />}
      </motion.span>
      <div role="status">
        <Title>{!r ? 'Round over' : ok ? 'Correct!' : answered ? 'Not this time' : 'No answer'}</Title>
        {r && (
          <p className="text-2xl font-extrabold tabular-nums mt-1" style={{ fontFamily: 'var(--font-display)', color: ok ? STAGE.good : STAGE.sub }}>
            +{r.pts.toLocaleString()}
          </p>
        )}
      </div>
      <AnimatePresence>
        {r && r.ok && r.streak >= 2 && (
          <motion.span
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-1 px-3 h-9 rounded-xl font-extrabold"
            style={{ background: '#ff8a1f', color: '#fff', fontFamily: 'var(--font-display)' }}
          >
            <Flame size={18} fill="currentColor" /> {r.streak} in a row
          </motion.span>
        )}
      </AnimatePresence>
      {r && r.rank > 0 && (
        <Sub>
          You're {ordinal(r.rank)} of {reveal.players} with {r.score.toLocaleString()} points.
        </Sub>
      )}
      {!ok && q && correctIdx !== undefined && q.options[correctIdx] !== undefined && (
        <div className="mt-2 w-full rounded-2xl px-4 py-3 text-left" style={{ background: STAGE.panel, color: '#fff' }}>
          <p className="text-xs font-bold mb-1" style={{ color: STAGE.sub }}>
            Right answer
          </p>
          {q.kind === 'tf' ? (
            <p className="font-extrabold">{q.options[correctIdx]}</p>
          ) : (
            <StudyContent html={q.options[correctIdx]} className="font-bold break-words" />
          )}
        </div>
      )}
      <p className="mt-2 text-sm font-semibold" style={{ color: STAGE.sub }}>
        Next question soon
        <WaitDots />
      </p>
    </Center>
  );
}

function FinalView({ snap }: { snap: PlayerSnapshot }) {
  const reduce = useReducedMotion();
  const f = snap.final;
  const rank = f?.rank ?? null;
  useEffect(() => {
    if (rank !== null && rank <= 3) playSound('win');
  }, [rank]);
  if (!f) return null;
  const medal = rank === 1 ? STAGE.gold : rank === 2 ? '#c9d1e0' : rank === 3 ? '#d98b52' : STAGE.panel;
  return (
    <Center>
      <motion.div
        initial={reduce ? { opacity: 0 } : { scale: 0.3, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 16 }}
        className="flex items-center justify-center w-32 h-32 rounded-full"
        style={{ background: medal, boxShadow: 'inset 0 -8px 0 rgba(0,0,0,0.25)' }}
        aria-hidden
      >
        <span
          className="text-5xl font-extrabold"
          style={{ fontFamily: 'var(--font-display)', color: rank !== null && rank <= 3 ? '#2b1a00' : '#fff' }}
        >
          {rank ?? '–'}
        </span>
      </motion.div>
      <Title>{rank ? `You finished ${ordinal(rank)}` : 'Game over'}</Title>
      <Sub>
        {f.score.toLocaleString()} points{f.players > 0 ? `, out of ${f.players} players` : ''}.
      </Sub>
      {f.podium.length > 0 && (
        <ol className="mt-3 w-full list-none p-0 flex flex-col gap-2">
          {f.podium.map((p, i) => (
            <li key={i} className="flex items-center gap-3 px-3 h-12 rounded-2xl" style={{ background: STAGE.panel }}>
              <span className="w-6 font-extrabold tabular-nums" style={{ color: STAGE.gold, fontFamily: 'var(--font-display)' }}>
                {p.rank}
              </span>
              <Avatar name={p.name} color={p.color} size={30} />
              <span className="flex-1 min-w-0 truncate text-left font-bold" style={{ color: '#fff' }}>
                {p.name}
              </span>
              <span className="font-extrabold tabular-nums" style={{ color: '#fff', fontFamily: 'var(--font-display)' }}>
                {p.score.toLocaleString()}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Center>
  );
}
