import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import type { Card } from '@/types';
import type { ModeProps } from '@/components/modes/registry';
import { hasDefinitionContent, shuffleArray, stripHtml } from '@/lib/utils';
import { buildEquivalenceGroups, getEquivalentAnswers, gradeWrittenAnswer } from '@/lib/equivalence';
import { submitScore } from '@/lib/gameRecords';
import { playSound } from '@/lib/gameSounds';
import StudyContent from '@/components/StudyContent';
import { Button } from '@/components/ui/Button';
import { Mascot } from '@/components/games/Mascot';
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
import { celebrate, comboMultiplier, formatMultiplier, useEscToQuit, usePopups } from '@/components/games/gameLogic';

// ============================================================
// Letter Lock — read the definition, crack the term. The term sits
// on a padlock as hidden letter tiles. Reveal letters (each one
// lowers what the lock is worth) or type the whole term to open it.
// Three wrong tries lock you out and show the answer.
// ============================================================

const GAME_ID = 'letter-lock';

// Lock art — fixed colors, independent of the app theme.
const ART = {
  brass: '#e3ab3f',
  brassLight: '#f7d582',
  brassEdge: '#a6721a',
  brassDeep: '#7d5410',
  steel: '#2b3040',
  steelEdge: '#161a25',
  shackle: '#c3c9d4',
  shackleDark: '#858d9c',
  tileHidden: '#3a4155',
  tileHiddenEdge: '#232838',
  slot: '#61697f',
  hint: '#fff3d1',
  hintEdge: '#d4b56a',
  hintText: '#4a3200',
  open: '#2fbf71',
  openEdge: '#1d8a4f',
  fail: '#e5484d',
  failEdge: '#a82a2f',
};

const MAX_POINTS = 300;
const ATTEMPTS = 3;
const MAX_TERM_LENGTH = 40;
const MIN_POOL = 3;

const LETTER = /[\p{L}\p{N}]/u;

interface Glyph {
  ch: string;
  letter: boolean;
  /** Position within the whole term (stable key). */
  index: number;
  /** Order among letters only, for staggered flips. */
  order: number;
}

interface LockCard {
  key: string;
  definitionHtml: string;
  text: string;
  words: Glyph[][];
  letterIndexes: number[];
  answers: string[];
}

function buildLockCard(card: Card, groups: Map<string, Card[]>): LockCard | null {
  const text = stripHtml(card.term).replace(/\s+/g, ' ').trim();
  if (!text || text.length > MAX_TERM_LENGTH) return null;
  if (!hasDefinitionContent(card)) return null;
  const words: Glyph[][] = [[]];
  const letterIndexes: number[] = [];
  let index = 0;
  for (const ch of Array.from(text)) {
    if (ch === ' ') {
      words.push([]);
    } else {
      const letter = LETTER.test(ch);
      words[words.length - 1].push({ ch, letter, index, order: letter ? letterIndexes.length : -1 });
      if (letter) letterIndexes.push(index);
    }
    index += 1;
  }
  if (letterIndexes.length < 2) return null;
  const answers = getEquivalentAnswers(card, 'term', groups).filter((a) => stripHtml(a));
  return {
    key: card.id,
    definitionHtml: card.definition,
    text,
    words: words.filter((w) => w.length > 0),
    letterIndexes,
    answers: answers.length > 0 ? answers : [card.term],
  };
}

type RoundSize = '5' | '10' | 'all';
type Status = 'playing' | 'solved' | 'failed';
type TileTone = 'hidden' | 'hint' | 'solved' | 'failed';

interface Totals {
  score: number;
  played: number;
  solved: number;
  lettersRevealed: number;
  lockouts: number;
  bestStreak: number;
}

const EMPTY_TOTALS: Totals = { score: 0, played: 0, solved: 0, lettersRevealed: 0, lockouts: 0, bestStreak: 0 };

// ---------- Lock art ----------

const rem = (px: number) => `${px / 16}rem`;

function Tile({ glyph, tone, size, delay, reduce }: { glyph: Glyph; tone: TileTone; size: number; delay: number; reduce: boolean }) {
  const colors =
    tone === 'hidden'
      ? { bg: ART.tileHidden, edge: ART.tileHiddenEdge, fg: ART.slot }
      : tone === 'hint'
        ? { bg: ART.hint, edge: ART.hintEdge, fg: ART.hintText }
        : tone === 'solved'
          ? { bg: ART.open, edge: ART.openEdge, fg: '#ffffff' }
          : { bg: ART.fail, edge: ART.failEdge, fg: '#ffffff' };
  return (
    <span className="inline-flex" style={{ perspective: 400 }}>
      <motion.span
        key={tone}
        initial={tone === 'hidden' ? false : reduce ? { opacity: 0 } : { rotateX: -90 }}
        animate={reduce ? { opacity: 1 } : { rotateX: 0 }}
        transition={reduce ? { duration: 0.15, delay: delay / 3 } : { type: 'spring', stiffness: 420, damping: 22, delay }}
        className="inline-flex items-center justify-center rounded-md font-extrabold"
        style={{
          width: rem(size),
          height: rem(size * 1.2),
          background: colors.bg,
          color: colors.fg,
          boxShadow: `inset 0 -4px 0 ${colors.edge}`,
          fontFamily: 'var(--font-display)',
          fontSize: rem(size * 0.58),
          lineHeight: 1,
        }}
      >
        {tone === 'hidden' ? (
          <span aria-hidden style={{ width: rem(size * 0.42), height: 3, borderRadius: 2, background: colors.fg, marginTop: rem(size * 0.2) }} />
        ) : (
          glyph.ch
        )}
      </motion.span>
    </span>
  );
}

function LockFace({
  lock,
  revealed,
  status,
  attemptsLeft,
  worth,
  reduce,
}: {
  lock: LockCard;
  revealed: number[];
  status: Status;
  attemptsLeft: number;
  worth: number;
  reduce: boolean;
}) {
  const open = status === 'solved';
  const letters = lock.letterIndexes.length;
  const size = letters <= 10 ? 38 : letters <= 18 ? 31 : 25;
  const shown = new Set(revealed);
  const hiddenCount = letters - revealed.length;
  const label =
    status === 'solved'
      ? `Unlocked. The term is ${lock.text}.`
      : status === 'failed'
        ? `Locked out. The term was ${lock.text}.`
        : `Locked term, ${letters} letters, ${hiddenCount} hidden.`;

  return (
    <div className="relative mx-auto w-full" style={{ maxWidth: '35rem', paddingTop: '17%' }}>
      {/* Shackle sits behind the body; it pops up and swings open on a solve. */}
      <motion.svg
        aria-hidden
        viewBox="0 0 200 130"
        className="absolute left-1/2 top-0"
        style={{ width: '40%', x: '-50%', originX: 0.78, originY: 1, zIndex: 0, overflow: 'visible' }}
        initial={false}
        animate={open && !reduce ? { y: -30, rotate: -16 } : { y: open ? -18 : 0, rotate: 0 }}
        transition={reduce ? { duration: 0.2 } : { type: 'spring', stiffness: 260, damping: 11 }}
      >
        <path d="M44 132 V80 A56 56 0 0 1 156 80 V132" fill="none" stroke={ART.shackleDark} strokeWidth="26" />
        <path d="M44 132 V80 A56 56 0 0 1 156 80 V132" fill="none" stroke={ART.shackle} strokeWidth="18" />
        <path d="M52 110 V82 A48 48 0 0 1 100 32" fill="none" stroke="#eef1f6" strokeWidth="4" strokeLinecap="round" opacity="0.8" />
      </motion.svg>

      <div
        className="relative rounded-[28px] px-3 sm:px-6 pt-5 pb-4"
        style={{
          zIndex: 1,
          background: `linear-gradient(180deg, ${ART.brassLight} 0%, ${ART.brass} 22%, ${ART.brass} 78%, ${ART.brassEdge} 100%)`,
          boxShadow: `inset 0 -8px 0 ${ART.brassDeep}, 0 18px 36px rgba(0,0,0,0.22)`,
        }}
      >
        {[
          { left: 12, top: 12 },
          { right: 12, top: 12 },
          { left: 12, bottom: 16 },
          { right: 12, bottom: 16 },
        ].map((pos, i) => (
          <span
            key={i}
            aria-hidden
            className="absolute rounded-full"
            style={{ ...pos, width: 9, height: 9, background: ART.brassEdge, boxShadow: `inset 1px 1px 0 ${ART.brassLight}` }}
          />
        ))}

        <div
          role="img"
          aria-label={label}
          className="rounded-2xl px-2.5 py-4 flex flex-wrap justify-center"
          style={{
            background: ART.steel,
            boxShadow: `inset 0 4px 0 ${ART.steelEdge}`,
            columnGap: rem(Math.round(size * 0.55)),
            rowGap: '0.5rem',
          }}
        >
          {lock.words.map((word, wi) => (
            <span key={wi} className="inline-flex flex-wrap justify-center gap-1">
              {word.map((g) =>
                g.letter ? (
                  <Tile
                    key={g.index}
                    glyph={g}
                    size={size}
                    reduce={reduce}
                    tone={status === 'solved' ? 'solved' : status === 'failed' ? (shown.has(g.index) ? 'hint' : 'failed') : shown.has(g.index) ? 'hint' : 'hidden'}
                    delay={status === 'playing' ? 0 : g.order * 0.045}
                  />
                ) : (
                  <span
                    key={g.index}
                    className="inline-flex items-end justify-center font-extrabold"
                    style={{ height: rem(size * 1.2), minWidth: rem(size * 0.4), color: ART.hint, fontSize: rem(size * 0.58), fontFamily: 'var(--font-display)' }}
                  >
                    {g.ch}
                  </span>
                ),
              )}
            </span>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5" role="img" aria-label={`${attemptsLeft} of ${ATTEMPTS} tries left`}>
            {Array.from({ length: ATTEMPTS }, (_, i) => {
              const left = i < attemptsLeft;
              return (
                <svg key={i} width="20" height="26" viewBox="0 0 20 26" aria-hidden>
                  <circle cx="10" cy="8" r="7" fill={left ? ART.steel : ART.brassEdge} />
                  <path d="M6 12 L14 12 L12 24 L8 24 Z" fill={left ? ART.steel : ART.brassEdge} />
                </svg>
              );
            })}
          </div>
          <span
            className="px-3 py-1 rounded-lg text-sm font-extrabold tabular-nums"
            style={{ background: 'rgba(0,0,0,0.16)', color: ART.steelEdge, fontFamily: 'var(--font-display)' }}
          >
            {status === 'playing' ? `Worth ${worth}` : status === 'solved' ? 'Open' : 'Locked out'}
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------- Setup ----------

function SetupScreen({ poolSize, onStart, onExit }: { poolSize: number; onStart: (size: RoundSize) => void; onExit: () => void }) {
  const [size, setSize] = useState<RoundSize>(poolSize >= 10 ? '10' : 'all');
  const tooFew = poolSize < MIN_POOL;
  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <div className="rounded-3xl overflow-hidden" style={{ boxShadow: '0 20px 50px rgba(0,0,0,0.18)' }}>
        <div className="relative px-6 pt-6 pb-5 flex items-center gap-4" style={{ background: ART.steel }}>
          <svg aria-hidden width="72" height="84" viewBox="0 0 72 84" className="shrink-0">
            <path d="M18 40 V26 A18 18 0 0 1 54 26 V40" fill="none" stroke={ART.shackle} strokeWidth="8" />
            <rect x="6" y="36" width="60" height="46" rx="12" fill={ART.brass} />
            <rect x="6" y="72" width="60" height="10" rx="5" fill={ART.brassEdge} />
            <circle cx="36" cy="54" r="6" fill={ART.steel} />
            <path d="M33 57 L39 57 L38 68 L34 68 Z" fill={ART.steel} />
          </svg>
          <div>
            <h2 className="text-3xl font-extrabold" style={{ color: '#fff', fontFamily: 'var(--font-display)' }}>
              Letter Lock
            </h2>
            <p className="text-sm font-semibold" style={{ color: '#c9cfdc' }}>
              Read the definition and type the hidden term. Fewer letters revealed means more points.
            </p>
          </div>
        </div>
        <div className="p-6 flex flex-col gap-6" style={{ background: 'var(--color-surface)' }}>
          {tooFew ? (
            <div className="text-center">
              <p className="font-semibold" style={{ color: 'var(--color-text)' }}>
                Letter Lock needs at least {MIN_POOL} cards with a short text term (up to {MAX_TERM_LENGTH} characters) and a definition.
              </p>
              <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                This set has {poolSize === 0 ? 'none' : poolSize}. Try another game for now.
              </p>
              <Button variant="primary" className="mt-4" onClick={onExit}>
                Exit
              </Button>
            </div>
          ) : (
            <>
              <SetupSection label="Locks per round">
                <ChoicePills
                  options={[
                    ...(poolSize > 5 ? [{ value: '5' as RoundSize, label: '5' }] : []),
                    ...(poolSize > 10 ? [{ value: '10' as RoundSize, label: '10' }] : []),
                    { value: 'all' as RoundSize, label: `All ${poolSize}` },
                  ]}
                  isSelected={(v) => v === size}
                  onToggle={setSize}
                  accent={ART.brassEdge}
                />
              </SetupSection>
              <ul className="text-sm flex flex-col gap-1.5 m-0 pl-5" style={{ color: 'var(--color-text-secondary)' }}>
                <li>Each lock is worth up to {MAX_POINTS} points. Every letter you reveal lowers that.</li>
                <li>Open locks in a row with one reveal or fewer to build a combo.</li>
                <li>You get {ATTEMPTS} tries per lock before it jams and shows the answer.</li>
              </ul>
              <PlayButton color={ART.brassEdge} onClick={() => onStart(size)}>
                Start cracking
              </PlayButton>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Game ----------

export default function LetterLockMode({ cards, setId, exitUrl }: ModeProps) {
  const navigate = useNavigate();
  const reduce = !!useReducedMotion();
  const lockShake = useAnimationControls();
  const exitTo = exitUrl ?? `/sets/${setId}`;
  const exit = useCallback(() => navigate(exitTo), [navigate, exitTo]);
  const groups = useMemo(() => buildEquivalenceGroups(cards), [cards]);
  const pool = useMemo(
    () => cards.map((c) => buildLockCard(c, groups)).filter((c): c is LockCard => c !== null),
    [cards, groups],
  );

  const [phase, setPhase] = useState<'config' | 'game' | 'over'>('config');
  const [roundSize, setRoundSize] = useState<RoundSize>('10');
  const [deck, setDeck] = useState<LockCard[]>([]);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState<number[]>([]);
  const [attemptsLeft, setAttemptsLeft] = useState(ATTEMPTS);
  const [status, setStatus] = useState<Status>('playing');
  const [text, setText] = useState('');
  const [streak, setStreak] = useState(0);
  const [totals, setTotals] = useState<Totals>(EMPTY_TOTALS);
  const [lastPoints, setLastPoints] = useState<number | null>(null);
  const [wrongFlash, setWrongFlash] = useState(false);
  const [best, setBest] = useState<ReturnType<typeof submitScore> | undefined>();
  const { popups, push, remove } = usePopups();

  // Delayed callbacks (auto-advance, finish) read the latest totals here.
  const totalsRef = useRef<Totals>(EMPTY_TOTALS);
  const inputRef = useRef<HTMLInputElement>(null);
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

  const playing = phase === 'game';
  const escArmed = useEscToQuit(phase !== 'config', playing, exit);

  const lock = deck[idx] ?? null;
  const letters = lock ? lock.letterIndexes.length : 0;
  const hidden = letters - revealed.length;
  const worth = letters > 0 ? Math.round((MAX_POINTS * hidden) / letters) : 0;

  const updateTotals = (fn: (t: Totals) => Totals) => {
    totalsRef.current = fn(totalsRef.current);
    setTotals(totalsRef.current);
  };

  const resetCard = () => {
    setRevealed([]);
    setAttemptsLeft(ATTEMPTS);
    setStatus('playing');
    setText('');
    setLastPoints(null);
    setWrongFlash(false);
  };

  const start = (size: RoundSize) => {
    clearTimers();
    const count = size === 'all' ? pool.length : Math.min(pool.length, Number(size));
    setRoundSize(size);
    setDeck(shuffleArray(pool).slice(0, count));
    setIdx(0);
    resetCard();
    setStreak(0);
    totalsRef.current = EMPTY_TOTALS;
    setTotals(EMPTY_TOTALS);
    setBest(undefined);
    setPhase('game');
  };

  const finish = () => {
    const t = totalsRef.current;
    setBest(submitScore(GAME_ID, setId, t.score, `round-${roundSize}`));
    playSound(t.solved > 0 ? 'win' : 'lose');
    setPhase('over');
  };

  const advance = () => {
    clearTimers();
    if (idx + 1 >= deck.length) {
      finish();
      return;
    }
    setIdx(idx + 1);
    resetCard();
  };

  const revealLetter = () => {
    if (!lock || status !== 'playing' || hidden <= 1) return;
    const next = lock.letterIndexes.find((i) => !revealed.includes(i));
    if (next === undefined) return;
    setRevealed([...revealed, next]);
    playSound('flip');
    inputRef.current?.focus();
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!lock || status !== 'playing' || !text.trim()) return;

    if (gradeWrittenAnswer(text, lock.answers)) {
      const used = revealed.length;
      const clean = used <= 1;
      const nextStreak = clean ? streak + 1 : 0;
      const mult = clean ? comboMultiplier(nextStreak) : 1;
      const points = Math.round(worth * mult);
      setStreak(nextStreak);
      setStatus('solved');
      setLastPoints(points);
      updateTotals((t) => ({
        ...t,
        score: t.score + points,
        played: t.played + 1,
        solved: t.solved + 1,
        lettersRevealed: t.lettersRevealed + used,
        bestStreak: Math.max(t.bestStreak, nextStreak),
      }));
      playSound('correct');
      later(() => playSound('match'), 180);
      push({ text: `+${points}`, color: ART.openEdge, x: 44, y: 8 });
      if (clean && mult > comboMultiplier(streak)) {
        playSound('combo');
        push({ text: `${formatMultiplier(mult)} combo`, color: '#e5484d', x: 30, y: 28 });
      }
      later(advance, reduce ? 1200 : 1900);
      return;
    }

    const left = attemptsLeft - 1;
    setAttemptsLeft(left);
    setWrongFlash(true);
    later(() => setWrongFlash(false), 500);
    if (!reduce) void lockShake.start({ x: [0, -12, 12, -7, 7, 0], rotate: [0, -2, 2, -1, 0], transition: { duration: 0.42 } });
    if (left <= 0) {
      setStatus('failed');
      setStreak(0);
      updateTotals((t) => ({
        ...t,
        played: t.played + 1,
        lettersRevealed: t.lettersRevealed + letters,
        lockouts: t.lockouts + 1,
      }));
      playSound('crumble');
    } else {
      playSound('wrong');
      inputRef.current?.select();
    }
  };

  // Focus the input for each new lock.
  useEffect(() => {
    if (phase === 'game' && status === 'playing') inputRef.current?.focus();
  }, [phase, idx, status]);

  // Enter moves on once a lock is open or jammed.
  const advanceRef = useRef(advance);
  useEffect(() => {
    advanceRef.current = advance;
  });
  useEffect(() => {
    if (phase !== 'game' || status === 'playing') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        advanceRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, status]);

  const avgRevealed = totals.played > 0 ? totals.lettersRevealed / totals.played : 0;
  const solvedShare = totals.played > 0 ? totals.solved / totals.played : 0;
  const stars = solvedShare < 0.5 ? 0 : avgRevealed <= 0.75 ? 3 : avgRevealed <= 2 ? 2 : 1;

  useEffect(() => {
    if (phase === 'over' && stars >= 2) return celebrate([ART.brass, ART.open, ART.brassLight, '#ffffff']);
  }, [phase, stars]);

  if (phase === 'config') {
    return <SetupScreen poolSize={pool.length} onStart={start} onExit={exit} />;
  }

  if (phase === 'over') {
    return (
      <div className="relative min-h-[calc(100dvh-8rem)] flex items-center px-4 pt-24 pb-10">
        <ResultsPanel
          mascot={<Mascot mood={stars >= 2 ? 'celebrate' : stars === 1 ? 'happy' : 'sad'} color={ART.brass} size={112} />}
          title={totals.solved === totals.played ? 'Every lock opened' : `${totals.solved} of ${totals.played} locks opened`}
          subtitle={`You revealed ${avgRevealed.toFixed(1)} letters per lock on average.`}
          stars={stars}
          score={totals.score}
          best={best}
          stats={[
            { label: 'Opened', value: `${totals.solved}/${totals.played}` },
            { label: 'Letters per lock', value: avgRevealed.toFixed(1) },
            { label: 'Best combo', value: totals.bestStreak },
            { label: 'Jammed', value: totals.lockouts },
          ]}
          actions={
            <>
              <Button variant="primary" onClick={() => start(roundSize)}>
                Play again
              </Button>
              <Button variant="outline" onClick={() => setPhase('config')}>
                Change settings
              </Button>
              <Button variant="ghost" onClick={exit}>
                Exit
              </Button>
            </>
          }
        />
      </div>
    );
  }

  if (!lock) return null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-4">
      <EscBanner show={escArmed} />
      <GameTopBar onExit={exit}>
        <ComboMeter streak={streak} />
        <ScoreCounter value={totals.score} />
      </GameTopBar>

      <div className="mt-3 flex items-center justify-between text-sm font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
        <span>
          Lock {idx + 1} of {deck.length}
        </span>
        <span>{letters} letters</span>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={lock.key + idx}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -16 }}
          transition={{ duration: reduce ? 0.12 : 0.25 }}
        >
          <div
            className="mt-2 rounded-3xl p-5"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' }}
          >
            <p className="text-sm font-semibold mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
              Which term matches this definition?
            </p>
            <StudyContent html={lock.definitionHtml} className="text-xl font-bold leading-snug break-words" />
          </div>

          <motion.div animate={lockShake} className="relative mt-5">
            <LockFace lock={lock} revealed={revealed} status={status} attemptsLeft={attemptsLeft} worth={worth} reduce={reduce} />
            <ScorePopups popups={popups} onDone={remove} />
          </motion.div>
        </motion.div>
      </AnimatePresence>

      <div className="mt-5" aria-live="polite">
        {status === 'playing' ? (
          <>
            <form onSubmit={submit} className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type the term"
                aria-label="Type the term to open the lock"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                className="flex-1 min-w-0 h-14 px-4 text-lg rounded-2xl outline-none focus-visible:ring-4"
                style={{
                  background: 'var(--color-surface)',
                  color: 'var(--color-text)',
                  border: `2px solid ${wrongFlash ? 'var(--color-danger)' : 'var(--color-border)'}`,
                  ['--tw-ring-color' as string]: 'var(--color-primary-ring)',
                }}
              />
              <button
                type="submit"
                disabled={!text.trim()}
                className="h-14 px-5 rounded-2xl font-extrabold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-3 focus-visible:outline-offset-2"
                style={{
                  background: ART.open,
                  color: '#fff',
                  border: 'none',
                  boxShadow: `inset 0 -5px 0 ${ART.openEdge}`,
                  fontFamily: 'var(--font-display)',
                  outlineColor: ART.openEdge,
                }}
              >
                Open
              </button>
            </form>
            <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
              <button
                type="button"
                onClick={revealLetter}
                disabled={hidden <= 1}
                className="inline-flex items-center gap-2 h-11 px-4 rounded-xl font-bold cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline-3 focus-visible:outline-offset-2"
                style={{
                  background: ART.brass,
                  color: ART.hintText,
                  border: 'none',
                  boxShadow: `inset 0 -4px 0 ${ART.brassEdge}`,
                  fontFamily: 'var(--font-display)',
                  outlineColor: ART.brassEdge,
                }}
              >
                <KeyRound size={17} strokeWidth={2.5} />
                Reveal a letter
                {hidden > 1 && (
                  <span className="text-sm font-semibold opacity-80">
                    −{worth - Math.round((MAX_POINTS * (hidden - 1)) / letters)}
                  </span>
                )}
              </button>
              <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                {attemptsLeft === ATTEMPTS ? `${ATTEMPTS} tries on this lock` : `${attemptsLeft} ${attemptsLeft === 1 ? 'try' : 'tries'} left`}
              </span>
            </div>
          </>
        ) : (
          <div
            className="rounded-2xl px-4 py-3 flex items-center gap-3 flex-wrap"
            style={{ background: status === 'solved' ? 'var(--color-success-light)' : 'var(--color-danger-light)' }}
          >
            <div className="flex-1 min-w-0">
              <p
                className="font-extrabold"
                style={{ color: status === 'solved' ? 'var(--color-success)' : 'var(--color-danger)', fontFamily: 'var(--font-display)' }}
              >
                {status === 'solved' ? `Unlocked${lastPoints ? ` +${lastPoints}` : ''}` : 'The lock jammed'}
              </p>
              <p className="text-sm break-words" style={{ color: 'var(--color-text-secondary)' }}>
                {status === 'solved' ? 'On to the next one.' : (
                  <>
                    The term was <span className="font-semibold" style={{ color: 'var(--color-text)' }}>{lock.text}</span>
                  </>
                )}
              </p>
            </div>
            <Button variant="primary" onClick={advance}>
              {idx + 1 >= deck.length ? 'See results' : 'Next lock'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
