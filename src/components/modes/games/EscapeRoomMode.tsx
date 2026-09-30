import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Check, Clock, Delete, Hourglass, Lightbulb, Lock, LockOpen } from 'lucide-react';
import type { AnswerDirection, Card } from '@/types';
import type { ModeProps } from '@/components/modes/registry';
import { normalizeAnswer, shuffleArray, stripHtml } from '@/lib/utils';
import { buildEquivalenceGroups, getEquivalentAnswers, getWrongOptionPool, gradeWrittenAnswer } from '@/lib/equivalence';
import { buildGameQuestion, gradeGameAnswer, type GameQuestion } from '@/lib/gameQuestions';
import { getBest, submitScore } from '@/lib/gameRecords';
import { playSound } from '@/lib/gameSounds';
import { Button } from '@/components/ui/Button';
import StudyContent from '@/components/StudyContent';
import { Mascot, type MascotMood } from '@/components/games/Mascot';
import { ScorePopups } from '@/components/games/ScorePopup';
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
import { celebrate, useAnswerKeys, useEscToQuit, usePopups } from '@/components/games/gameLogic';
import './EscapeRoomMode.css';

// ============================================================
// Escape Room — three drawn rooms, each door held by 2–3 locks.
// Every lock is a different puzzle built from the cards; wrong
// answers and hints cost clock time. Escaping the vault is the
// payoff moment.
// ============================================================

const GAME_ID = 'escape-room';
const WRONG_PENALTY = 15;
const HINT_PENALTY = 10;
const CODE_PENALTY = 10;
const DOOR_MS = 1900;
const ESCAPE_MS = 2600;

type LockKind = 'code' | 'word' | 'odd' | 'match';
type RoomId = 'library' | 'lab' | 'vault';

const LOCK_NAMES: Record<LockKind, string> = {
  code: 'Code lock',
  word: 'Word lock',
  odd: 'Odd one out',
  match: 'Matching dial',
};

const ROOMS: { id: RoomId; name: string; locks: LockKind[] }[] = [
  { id: 'library', name: 'The library', locks: ['word', 'code'] },
  { id: 'lab', name: 'The lab', locks: ['odd', 'match', 'word'] },
  { id: 'vault', name: 'The vault', locks: ['code', 'match'] },
];

// Fixed scene palettes (theme-independent).
const ROOM_ART: Record<RoomId, { door: string; doorEdge: string; accent: string }> = {
  library: { door: '#8a5a34', doorEdge: '#5e3a1f', accent: '#d9822b' },
  lab: { door: '#5a7a8c', doorEdge: '#3d5666', accent: '#2f9e8f' },
  vault: { door: '#9aa3ae', doorEdge: '#636b76', accent: '#c99a0a' },
};
const LIGHT = '#fff3c4';
const MASCOT_COLOR = '#8b6cf0';

// ---------- Lock data ----------

interface CodeLockData {
  kind: 'code';
  questions: GameQuestion[];
  digits: number[];
}
interface WordLockData {
  kind: 'word';
  card: Card;
  answers: string[];
}
interface OddLockData {
  kind: 'odd';
  pairs: { card: Card; definition: string; wrong: boolean }[];
}
interface MatchLockData {
  kind: 'match';
  cards: Card[];
  /** Display order of the definitions (indices into `cards`). */
  order: number[];
}
type LockData = CodeLockData | WordLockData | OddLockData | MatchLockData;

/** Build every lock for the run. Cards are drawn least-used first, so small
 *  sets repeat fairly; each lock gets distinct cards where the set allows. */
function buildRun(cards: Card[], groups: Map<string, Card[]>, direction: AnswerDirection): LockData[][] {
  const usage = new Map<string, number>();
  const draw = (k: number, pred?: (c: Card) => boolean): Card[] => {
    const pool = shuffleArray(cards.filter((c) => !pred || pred(c))).sort(
      (a, b) => (usage.get(a.id) ?? 0) - (usage.get(b.id) ?? 0),
    );
    const picked: Card[] = [];
    const terms = new Set<string>();
    const defs = new Set<string>();
    for (const c of pool) {
      if (picked.length >= k) break;
      const t = normalizeAnswer(c.term);
      const d = normalizeAnswer(c.definition);
      if (terms.has(t) || defs.has(d)) continue;
      picked.push(c);
      terms.add(t);
      defs.add(d);
    }
    for (const c of pool) {
      if (picked.length >= k) break;
      if (!picked.includes(c)) picked.push(c);
    }
    picked.forEach((c) => usage.set(c.id, (usage.get(c.id) ?? 0) + 1));
    return picked;
  };

  let qIndex = 0;
  const makeCode = (): CodeLockData => ({
    kind: 'code',
    questions: draw(3).map((c) => buildGameQuestion(c, cards, groups, 'multiple-choice', direction, qIndex++)),
    digits: Array.from({ length: 3 }, () => Math.floor(Math.random() * 10)),
  });

  return ROOMS.map((room) =>
    room.locks.map((kind): LockData => {
      if (kind === 'word') {
        const [card] = draw(1, (c) => !!stripHtml(c.term) && !!stripHtml(c.definition));
        if (!card) return makeCode();
        return { kind: 'word', card, answers: getEquivalentAnswers(card, 'term', groups) };
      }
      if (kind === 'odd') {
        const four = draw(4);
        const wrongAt = Math.floor(Math.random() * four.length);
        const shown = new Set(four.map((c) => normalizeAnswer(c.definition)));
        const pool = getWrongOptionPool(four[wrongAt], cards, groups);
        const fresh = pool.filter((d) => !shown.has(normalizeAnswer(d)));
        const swap = shuffleArray(fresh.length > 0 ? fresh : pool)[0];
        if (!swap) return makeCode();
        return {
          kind: 'odd',
          pairs: four.map((card, i) => ({ card, definition: i === wrongAt ? swap : card.definition, wrong: i === wrongAt })),
        };
      }
      if (kind === 'match') {
        const three = draw(3);
        let order = shuffleArray(three.map((_, i) => i));
        for (let t = 0; t < 5 && order.every((v, i) => v === i); t++) order = shuffleArray(order);
        return { kind: 'match', cards: three, order };
      }
      return makeCode();
    }),
  );
}

// ---------- Shared hooks / bits ----------

function useLater() {
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);
  return useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  }, []);
}

interface LockApi {
  right: () => void;
  wrong: (seconds: number, missed: Card[]) => void;
  hint: () => void;
  solved: () => void;
}

function HintButton({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="er-key inline-flex shrink-0 whitespace-nowrap items-center gap-1.5 min-h-9 px-3 rounded-xl text-sm font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ background: 'var(--color-muted)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
    >
      <Lightbulb size={15} />
      {children ?? 'Hint'}
      <span className="font-extrabold" style={{ color: 'var(--color-danger)' }}>−{HINT_PENALTY}s</span>
    </button>
  );
}

function LockHeader({ kind, help, right }: { kind: LockKind; help: string; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
      <div className="flex-1 min-w-24">
        <h3 className="text-xl font-extrabold flex items-center gap-2" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
          <Lock size={18} /> {LOCK_NAMES[kind]}
        </h3>
        <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>{help}</p>
      </div>
      {right}
    </div>
  );
}

// ---------- Code lock ----------

function CodeLock({ lock, api, active }: { lock: CodeLockData; api: LockApi; active: boolean }) {
  const reduce = useReducedMotion();
  const later = useLater();
  const [step, setStep] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<('earned' | 'bought' | null)[]>([null, null, null]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [entry, setEntry] = useState('');
  const [shake, setShake] = useState(0);
  const [open, setOpen] = useState(false);

  const keypad = step >= lock.questions.length;
  const raw = keypad ? null : lock.questions[step];
  const question = useMemo(
    () => (raw && raw.options ? { ...raw, options: raw.options.filter((o) => !removed.includes(o)) } : raw),
    [raw, removed],
  );

  const next = useCallback(() => {
    setStep((s) => s + 1);
    setFeedback(null);
    setSelected(null);
    setRemoved([]);
  }, []);

  const grade = useCallback(
    (right: boolean) => {
      if (!question || feedback || !active) return;
      setFeedback(right ? 'correct' : 'wrong');
      setRevealed((r) => r.map((v, i) => (i === step ? (right ? 'earned' : 'bought') : v)));
      if (right) {
        api.right();
        playSound('correct');
        later(next, reduce ? 450 : 850);
      } else {
        api.wrong(WRONG_PENALTY, [question.card]);
      }
    },
    [question, feedback, active, step, api, later, next, reduce],
  );

  const onOption = useCallback(
    (option: string) => {
      if (!question || feedback) return;
      setSelected(option);
      grade(gradeGameAnswer(question, { option }));
    },
    [question, feedback, grade],
  );
  const onTrueFalse = useCallback((tf: boolean) => question && grade(gradeGameAnswer(question, { tf })), [question, grade]);
  const onWritten = useCallback((text: string) => question && grade(gradeGameAnswer(question, { written: text })), [question, grade]);
  useAnswerKeys(question, active && !keypad && !feedback, onOption, onTrueFalse);

  const hint = () => {
    if (!question?.options || feedback) return;
    const wrongs = question.options.filter((o) => !gradeGameAnswer(question, { option: o }));
    if (wrongs.length < 2) return;
    setRemoved((r) => [...r, wrongs[Math.floor(Math.random() * wrongs.length)]]);
    api.hint();
  };

  const press = useCallback(
    (key: string) => {
      if (!keypad || open || !active) return;
      if (key === 'back') {
        setEntry((e) => e.slice(0, -1));
        return;
      }
      if (key === 'enter') {
        if (entry.length < 3) return;
        if (entry === lock.digits.join('')) {
          setOpen(true);
          api.right();
          later(api.solved, reduce ? 300 : 700);
        } else {
          setEntry('');
          setShake((s) => s + 1);
          api.wrong(CODE_PENALTY, []);
        }
        return;
      }
      playSound('click');
      setEntry((e) => (e.length >= 3 ? e : e + key));
    },
    [keypad, open, active, entry, lock.digits, api, later, reduce],
  );

  useEffect(() => {
    if (!keypad || !active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('back');
      else if (e.key === 'Enter') press('enter');
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keypad, active, press]);

  // Enter moves on after reading the correction for a wrong answer.
  useEffect(() => {
    if (keypad || feedback !== 'wrong' || !active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keypad, feedback, active, next]);

  return (
    <div>
      <LockHeader
        kind="code"
        help={keypad ? 'Enter the combination you uncovered.' : 'Each right answer reveals one digit of the combination.'}
        right={!keypad && question?.options && question.options.length > 2 && !feedback ? <HintButton onClick={hint} /> : undefined}
      />
      <div className="flex justify-center gap-2 mb-5" aria-label="Combination digits">
        {lock.digits.map((d, i) => {
          const state = revealed[i];
          return (
            <motion.div
              key={i}
              initial={false}
              animate={state && !reduce ? { rotateX: [90, 0] } : {}}
              className="w-14 h-16 rounded-xl flex flex-col items-center justify-center"
              style={{
                background: state ? '#1f2430' : 'var(--color-muted)',
                color: state ? '#ffd23e' : 'var(--color-text-tertiary)',
                border: '2px solid var(--color-border)',
                fontFamily: 'var(--font-display)',
              }}
              aria-label={state ? `Digit ${i + 1}: ${d}` : `Digit ${i + 1}: hidden`}
            >
              <span className="text-3xl font-extrabold tabular-nums leading-none">{state ? d : '?'}</span>
              {state === 'bought' && (
                <span className="text-[0.625rem] font-bold mt-1 flex items-center gap-0.5" style={{ color: '#ff8a8a' }}>
                  <Hourglass size={10} /> −{WRONG_PENALTY}s
                </span>
              )}
            </motion.div>
          );
        })}
      </div>

      {!keypad && question && (
        <div key={step}>
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-text-tertiary)' }}>
            Digit {step + 1} of 3
          </p>
          <QuestionPanel
            question={question}
            feedback={feedback}
            selectedOption={selected}
            disabled={!active}
            onWritten={onWritten}
            onOption={onOption}
            onTrueFalse={onTrueFalse}
            footer={
              feedback === 'wrong' ? (
                <Button variant="primary" className="w-full mt-3" onClick={next}>
                  Digit decoded for {WRONG_PENALTY}s, continue
                </Button>
              ) : null
            }
          />
        </div>
      )}

      {keypad && (
        <div className="max-w-[17.5rem] mx-auto">
          <div
            key={shake}
            className={`${shake ? 'er-shake ' : ''}h-14 mb-3 rounded-xl flex items-center justify-center gap-3 text-3xl font-extrabold tabular-nums`}
            style={{
              background: '#1f2430',
              color: open ? '#3ccf7a' : '#ffd23e',
              fontFamily: 'var(--font-display)',
              letterSpacing: '0.2em',
            }}
            aria-live="polite"
            aria-label={`Entered ${entry.split('').join(' ') || 'nothing'}`}
          >
            {open ? <LockOpen size={26} /> : [0, 1, 2].map((i) => <span key={i}>{entry[i] ?? '_'}</span>)}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'enter'].map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => press(k)}
                disabled={open || (k === 'enter' && entry.length < 3)}
                aria-label={k === 'back' ? 'Delete digit' : k === 'enter' ? 'Try the code' : k}
                className="er-key h-14 rounded-xl text-xl font-extrabold cursor-pointer flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: k === 'enter' ? '#23875a' : 'var(--color-surface)',
                  color: k === 'enter' ? '#fff' : 'var(--color-text)',
                  border: k === 'enter' ? 'none' : '1px solid var(--color-border)',
                  boxShadow: k === 'enter' ? 'inset 0 -4px 0 #17623f' : 'inset 0 -3px 0 var(--color-border)',
                  fontFamily: 'var(--font-display)',
                }}
              >
                {k === 'back' ? <Delete size={20} /> : k === 'enter' ? <Check size={22} strokeWidth={3} /> : k}
              </button>
            ))}
          </div>
          <p className="hidden md:block mt-2 text-xs text-center" style={{ color: 'var(--color-text-tertiary)' }}>
            Type the digits, Enter to try. A wrong code costs {CODE_PENALTY}s.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------- Word lock ----------

function WordLock({ lock, api, active }: { lock: WordLockData; api: LockApi; active: boolean }) {
  const later = useLater();
  const reduce = useReducedMotion();
  const [text, setText] = useState('');
  const [hints, setHints] = useState(0);
  const [shake, setShake] = useState(0);
  const [open, setOpen] = useState(false);
  const term = stripHtml(lock.card.term);
  const letters = term.replace(/\s/g, '').length;

  const masked = useMemo(() => {
    const out: string[] = [];
    let shown = 0;
    for (const ch of term) {
      if (/\s/.test(ch)) {
        out.push('  ');
        continue;
      }
      shown += 1;
      out.push(shown <= hints ? ch : '_');
    }
    return out.join(' ');
  }, [term, hints]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || open || !active) return;
    if (gradeWrittenAnswer(text, lock.answers)) {
      setOpen(true);
      api.right();
      later(api.solved, reduce ? 300 : 700);
    } else {
      setShake((s) => s + 1);
      api.wrong(WRONG_PENALTY, [lock.card]);
    }
  };

  return (
    <div>
      <LockHeader
        kind="word"
        help="Spell the term that matches this clue."
        right={!open && hints < letters ? <HintButton onClick={() => { setHints((h) => h + 1); api.hint(); }}>Letter</HintButton> : undefined}
      />
      <div className="rounded-2xl p-4 mb-4" style={{ background: 'var(--color-muted)' }}>
        <StudyContent html={lock.card.definition} className="text-lg font-semibold leading-snug" />
      </div>
      <p
        className="mb-3 text-lg font-extrabold tabular-nums break-all"
        style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)', letterSpacing: '0.08em', whiteSpace: 'pre-wrap' }}
        aria-label={hints > 0 ? `Starts with ${term.replace(/\s/g, '').slice(0, hints)}` : `${letters} letters`}
      >
        {masked}
      </p>
      <form onSubmit={submit} className="flex gap-2">
        <input
          key={shake}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={open || !active}
          autoFocus
          aria-label="Your answer"
          placeholder="Type the term"
          className={`${shake ? 'er-shake ' : ''}flex-1 min-w-0 h-14 px-4 text-lg rounded-2xl outline-none focus-visible:ring-4`}
          style={{
            background: 'var(--color-surface)',
            color: 'var(--color-text)',
            border: `2px solid ${open ? 'var(--color-success)' : 'var(--color-border)'}`,
            ['--tw-ring-color' as string]: 'var(--color-primary-ring)',
          }}
        />
        <button
          type="submit"
          disabled={!text.trim() || open || !active}
          className="er-key h-14 px-5 rounded-2xl font-extrabold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
          style={{ background: open ? '#23875a' : 'var(--color-primary)', color: '#fff', border: 'none', boxShadow: 'inset 0 -4px 0 rgba(0,0,0,0.2)', fontFamily: 'var(--font-display)' }}
        >
          {open ? <LockOpen size={18} /> : <Lock size={18} />}
          {open ? 'Open' : 'Try'}
        </button>
      </form>
    </div>
  );
}

// ---------- Odd one out ----------

function OddLock({ lock, api, active }: { lock: OddLockData; api: LockApi; active: boolean }) {
  const later = useLater();
  const reduce = useReducedMotion();
  const [cleared, setCleared] = useState<number[]>([]);
  const [found, setFound] = useState(false);
  const [shakeAt, setShakeAt] = useState<{ i: number; n: number } | null>(null);

  const pick = (i: number) => {
    if (found || cleared.includes(i) || !active) return;
    if (lock.pairs[i].wrong) {
      setFound(true);
      api.right();
      later(api.solved, reduce ? 500 : 1100);
    } else {
      setCleared((c) => [...c, i]);
      setShakeAt((s) => ({ i, n: (s?.n ?? 0) + 1 }));
      api.wrong(WRONG_PENALTY, [lock.pairs[i].card]);
    }
  };

  const hint = () => {
    const left = lock.pairs.map((p, i) => (!p.wrong && !cleared.includes(i) ? i : -1)).filter((i) => i >= 0);
    if (left.length === 0) return;
    setCleared((c) => [...c, left[Math.floor(Math.random() * left.length)]]);
    api.hint();
  };

  return (
    <div>
      <LockHeader
        kind="odd"
        help="Three pairs are right. Pick the one that is mismatched."
        right={!found && cleared.length < 2 ? <HintButton onClick={hint}>Clear one</HintButton> : undefined}
      />
      <div className="@container">
        <div className="grid grid-cols-1 @md:grid-cols-2 gap-2.5">
          {lock.pairs.map((p, i) => {
            const ok = cleared.includes(i);
            const isFound = found && p.wrong;
            return (
              <button
                key={shakeAt?.i === i ? `${i}-${shakeAt.n}` : i}
                type="button"
                onClick={() => pick(i)}
                disabled={found || ok || !active}
                className={`${shakeAt?.i === i ? 'er-shake ' : ''}er-key text-left rounded-2xl p-3.5 cursor-pointer disabled:cursor-default`}
                style={{
                  background: isFound ? '#d93843' : ok ? 'var(--color-success-light)' : 'var(--color-surface)',
                  color: isFound ? '#fff' : 'var(--color-text)',
                  border: `2px solid ${isFound ? '#a8202a' : ok ? 'var(--color-success)' : 'var(--color-border)'}`,
                  boxShadow: ok || isFound ? 'none' : 'inset 0 -4px 0 var(--color-border)',
                  opacity: found && !p.wrong ? 0.55 : 1,
                }}
                aria-label={`Pair ${i + 1}${ok ? ', checked: correct' : ''}${isFound ? ', mismatched' : ''}`}
              >
                <StudyContent html={p.card.term} className="font-bold" />
                <div className="my-1.5 h-px" style={{ background: 'currentColor', opacity: 0.2 }} />
                <StudyContent html={p.definition} className="text-sm" />
                {ok && (
                  <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-bold" style={{ color: 'var(--color-success)' }}>
                    <Check size={13} strokeWidth={3} /> This pair is right
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      {found && (
        <p className="mt-3 text-sm font-semibold" role="status" style={{ color: 'var(--color-success)' }}>
          Got it. That definition belongs to a different card.
        </p>
      )}
    </div>
  );
}

// ---------- Matching dial ----------

const DIAL_LETTERS = ['A', 'B', 'C', 'D'];

function MatchLock({ lock, api, active }: { lock: MatchLockData; api: LockApi; active: boolean }) {
  const later = useLater();
  const reduce = useReducedMotion();
  const n = lock.cards.length;
  const [dial, setDial] = useState<(number | null)[]>(() => lock.cards.map(() => null));
  const [locked, setLocked] = useState<boolean[]>(() => lock.cards.map(() => false));
  const [open, setOpen] = useState(false);
  const [shake, setShake] = useState(0);

  /** Is dial position `pos` (index into display order) right for term i? */
  const fits = (i: number, pos: number | null) =>
    pos !== null && normalizeAnswer(lock.cards[lock.order[pos]].definition) === normalizeAnswer(lock.cards[i].definition);

  const turn = (i: number, dir: 1 | -1 = 1) => {
    if (locked[i] || open || !active) return;
    playSound('click');
    setDial((d) => d.map((v, j) => (j === i ? (v === null ? (dir === 1 ? 0 : n - 1) : (v + dir + n) % n) : v)));
  };

  const tryDial = () => {
    if (open || !active || dial.some((v) => v === null)) return;
    const results = lock.cards.map((_, i) => fits(i, dial[i]));
    if (results.every(Boolean)) {
      setLocked(lock.cards.map(() => true));
      setOpen(true);
      api.right();
      later(api.solved, reduce ? 400 : 900);
    } else {
      setLocked(results);
      setDial((d) => d.map((v, i) => (results[i] ? v : null)));
      setShake((s) => s + 1);
      api.wrong(WRONG_PENALTY, lock.cards.filter((_, i) => !results[i]));
    }
  };

  const hint = () => {
    const free = locked.map((l, i) => (l ? -1 : i)).filter((i) => i >= 0);
    if (free.length < 2) return;
    const i = free[Math.floor(Math.random() * free.length)];
    const pos = lock.order.findIndex((_, p) => fits(i, p));
    setDial((d) => d.map((v, j) => (j === i ? pos : v)));
    setLocked((l) => l.map((v, j) => (j === i ? true : v)));
    api.hint();
  };

  return (
    <div>
      <LockHeader
        kind="match"
        help="Turn each dial to the letter of its definition, then pull the handle."
        right={!open && locked.filter((l) => !l).length >= 2 ? <HintButton onClick={hint}>Set one</HintButton> : undefined}
      />
      <ol className="grid gap-2 mb-4 list-none p-0 m-0">
        {lock.order.map((cardIdx, pos) => (
          <li key={pos} className="flex items-start gap-3 rounded-2xl p-3" style={{ background: 'var(--color-muted)' }}>
            <span
              className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center font-extrabold"
              style={{ background: '#1f2430', color: '#ffd23e', fontFamily: 'var(--font-display)' }}
            >
              {DIAL_LETTERS[pos]}
            </span>
            <StudyContent html={lock.cards[cardIdx].definition} className="text-sm min-w-0 break-words pt-1" />
          </li>
        ))}
      </ol>
      <div key={shake} className={`${shake ? 'er-shake ' : ''}grid gap-2`}>
        {lock.cards.map((card, i) => {
          const v = dial[i];
          return (
            <div key={card.id + i} className="flex items-center gap-3 rounded-2xl p-2.5" style={{ border: `2px solid ${locked[i] ? 'var(--color-success)' : 'var(--color-border)'}`, background: 'var(--color-surface)' }}>
              <StudyContent html={card.term} className="flex-1 min-w-0 font-bold break-words" />
              <button
                type="button"
                onClick={() => turn(i)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
                    e.preventDefault();
                    turn(i, 1);
                  } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
                    e.preventDefault();
                    turn(i, -1);
                  }
                }}
                disabled={locked[i] || open || !active}
                aria-label={`Dial for term ${i + 1}: ${v === null ? 'not set' : DIAL_LETTERS[v]}. Press to turn.`}
                className="er-key relative w-14 h-14 shrink-0 rounded-full cursor-pointer disabled:cursor-default flex items-center justify-center text-2xl font-extrabold"
                style={{
                  background: locked[i] ? '#23875a' : '#2b3040',
                  color: locked[i] ? '#fff' : '#ffd23e',
                  border: '4px solid #8a93a3',
                  boxShadow: 'inset 0 -4px 0 rgba(0,0,0,0.35)',
                  fontFamily: 'var(--font-display)',
                }}
              >
                <motion.span
                  aria-hidden
                  className="absolute inset-0"
                  animate={{ rotate: v === null ? 0 : (v + 1) * (360 / (n + 1)) }}
                  transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 300, damping: 18 }}
                >
                  <span className="absolute left-1/2 top-0.5 -translate-x-1/2 w-1.5 h-2.5 rounded-full" style={{ background: '#ffd23e' }} />
                </motion.span>
                {v === null ? '?' : DIAL_LETTERS[v]}
              </button>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={tryDial}
        disabled={open || !active || dial.some((v) => v === null)}
        className="er-key mt-4 w-full h-12 rounded-2xl font-extrabold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        style={{ background: '#23875a', color: '#fff', border: 'none', boxShadow: 'inset 0 -5px 0 #17623f', fontFamily: 'var(--font-display)' }}
      >
        {open ? <LockOpen size={18} /> : <Lock size={18} />}
        {open ? 'Unlocked' : 'Pull the handle'}
      </button>
    </div>
  );
}

// ---------- Scenes ----------

function LibraryArt() {
  const bookColors = ['#c0392b', '#2f6db3', '#e0a526', '#3f8f5a', '#7b4fa0', '#d9822b'];
  return (
    <>
      <rect width="400" height="220" fill="#7a4a32" />
      <rect y="150" width="400" height="22" fill="#5c3522" />
      <rect y="172" width="400" height="48" fill="#3f2618" />
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <line key={i} x1={i * 55} x2={i * 55 + 30} y1="172" y2="220" stroke="#2f1c11" strokeWidth="2" />
      ))}
      <rect x="18" y="36" width="140" height="136" rx="4" fill="#4a2a1a" />
      {[0, 1, 2].map((row) => (
        <g key={row}>
          <rect x="24" y={42 + row * 42} width="128" height="36" fill="#2e1a10" />
          {Array.from({ length: 11 }, (_, b) => {
            const w = 8 + ((b * 7 + row * 3) % 5);
            const h = 24 + ((b * 5 + row * 11) % 10);
            const x = 27 + b * 11.4;
            return <rect key={b} x={x} y={78 + row * 42 - h} width={w} height={h} rx="1.5" fill={bookColors[(b + row * 2) % bookColors.length]} />;
          })}
          <rect x="22" y={78 + row * 42} width="132" height="4" fill="#6b4029" />
        </g>
      ))}
      <line x1="215" y1="0" x2="215" y2="36" stroke="#2e1a10" strokeWidth="2" />
      <circle className="er-lamp" cx="215" cy="56" r="34" fill="#ffd27a" opacity="0.4" />
      <path d="M202 36 H228 L236 52 H194 Z" fill="#e0a526" />
      <ellipse cx="215" cy="190" rx="70" ry="12" fill="#8c2f39" />
      <ellipse cx="215" cy="190" rx="56" ry="8" fill="none" stroke="#e0a526" strokeWidth="2" />
    </>
  );
}

function LabArt() {
  return (
    <>
      <rect width="400" height="220" fill="#cfe8df" />
      {Array.from({ length: 9 }, (_, i) => (
        <line key={`h${i}`} x1="0" x2="400" y1={i * 20} y2={i * 20} stroke="#b5d6ca" strokeWidth="1.5" />
      ))}
      {Array.from({ length: 20 }, (_, i) => (
        <line key={`v${i}`} x1={i * 20} x2={i * 20} y1="0" y2="172" stroke="#b5d6ca" strokeWidth="1.5" />
      ))}
      <rect y="172" width="400" height="48" fill="#5e7f78" />
      <rect x="150" y="30" width="90" height="56" rx="4" fill="#f7fbf9" stroke="#8fb5a8" strokeWidth="2" />
      {Array.from({ length: 12 }, (_, i) => (
        <rect key={i} x={157 + (i % 6) * 13} y={38 + Math.floor(i / 6) * 20} width="10" height="14" rx="2" fill={['#7de07a', '#b58cf0', '#ff8a5c', '#6cc3f0'][i % 4]} />
      ))}
      <rect x="16" y="118" width="190" height="12" rx="3" fill="#4f5d6b" />
      <rect x="26" y="130" width="8" height="42" fill="#3b4652" />
      <rect x="188" y="130" width="8" height="42" fill="#3b4652" />
      <path d="M40 118 L40 96 L34 96 L34 92 L52 92 L52 96 L46 96 L46 118 Z" fill="#e8f4ff" opacity="0.9" />
      <path d="M64 118 L72 94 L72 80 L80 80 L80 94 L88 118 Z" fill="#e8f4ff" opacity="0.9" />
      <path d="M67 118 L73 102 L79 102 L85 118 Z" fill="#7de07a" />
      <path d="M104 118 C98 112 98 100 108 96 L108 84 L116 84 L116 96 C126 100 126 112 120 118 Z" fill="#e8f4ff" opacity="0.9" />
      <path d="M103 116 C101 110 104 106 112 106 C120 106 123 110 121 116 Z" fill="#b58cf0" />
      <rect x="140" y="98" width="8" height="20" rx="3" fill="#ff8a5c" />
      <rect x="152" y="94" width="8" height="24" rx="3" fill="#6cc3f0" />
      <rect x="164" y="102" width="8" height="16" rx="3" fill="#7de07a" />
    </>
  );
}

function VaultArt() {
  return (
    <>
      <rect width="400" height="220" fill="#3a4250" />
      {Array.from({ length: 4 }, (_, r) => (
        <g key={r}>
          <line x1="0" x2="400" y1={40 * r + 20} y2={40 * r + 20} stroke="#2e3542" strokeWidth="3" />
          {Array.from({ length: 14 }, (_, c) => (
            <circle key={c} cx={c * 30 + 12} cy={40 * r + 28} r="2" fill="#566070" />
          ))}
        </g>
      ))}
      <rect y="172" width="400" height="48" fill="#20252e" />
      <path d="M0 172 L400 172" stroke="#566070" strokeWidth="3" />
      {[0, 1, 2].map((row) =>
        Array.from({ length: 4 - row }, (_, i) => (
          <path
            key={`${row}-${i}`}
            d={`M${30 + row * 14 + i * 28} ${172 - row * 14} l4 -12 h20 l4 12 Z`}
            fill="#f2c14e"
            stroke="#b8871a"
            strokeWidth="1.5"
          />
        )),
      )}
      <rect x="150" y="60" width="70" height="60" rx="4" fill="#2b313c" stroke="#566070" strokeWidth="3" />
      <circle cx="185" cy="90" r="16" fill="none" stroke="#c99a0a" strokeWidth="3" />
      <line x1="185" y1="74" x2="185" y2="106" stroke="#c99a0a" strokeWidth="3" />
      <line x1="169" y1="90" x2="201" y2="90" stroke="#c99a0a" strokeWidth="3" />
    </>
  );
}

// Door placement in the 400×220 scene, as percentages for the HTML overlay.
const DOOR = { left: (290 / 400) * 100, top: (58 / 220) * 100, width: (80 / 400) * 100, height: (114 / 220) * 100 };
const VAULT_DOOR = { left: (278 / 400) * 100, top: (63 / 220) * 100, width: (104 / 400) * 100, height: (104 / 220) * 100 };

function RoomScene({
  room,
  locksOpen,
  locksTotal,
  doorOpen,
  escaping,
  mood,
  flash,
  popups,
  onPopupDone,
}: {
  room: RoomId;
  locksOpen: number;
  locksTotal: number;
  doorOpen: boolean;
  escaping: boolean;
  mood: MascotMood;
  flash: number;
  popups: ReturnType<typeof usePopups>['popups'];
  onPopupDone: (id: number) => void;
}) {
  const reduce = useReducedMotion();
  const art = ROOM_ART[room];
  const vault = room === 'vault';
  const door = vault ? VAULT_DOOR : DOOR;
  return (
    <div className="relative w-full overflow-hidden rounded-3xl" style={{ aspectRatio: '400 / 220', boxShadow: '0 16px 40px rgba(0,0,0,0.2)' }}>
      <svg aria-hidden viewBox="0 0 400 220" className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid slice">
        {room === 'library' ? <LibraryArt /> : room === 'lab' ? <LabArt /> : <VaultArt />}
        {/* door frame */}
        {vault ? (
          <circle cx="330" cy="115" r="60" fill="#1b1f27" stroke="#566070" strokeWidth="6" />
        ) : (
          <rect x="284" y="52" width="92" height="122" rx="4" fill={art.doorEdge} />
        )}
      </svg>

      {/* Door overlay: light behind, a panel that swings open */}
      <div
        className="absolute"
        style={{
          left: `${door.left}%`,
          top: `${door.top}%`,
          width: `${door.width}%`,
          height: `${door.height}%`,
          perspective: 600,
        }}
      >
        <div className="absolute inset-0" style={{ background: LIGHT, borderRadius: vault ? '50%' : 3 }} />
        <motion.div
          className="absolute inset-0 flex flex-col items-center justify-center gap-1.5"
          initial={false}
          animate={doorOpen ? { rotateY: reduce ? 0 : -105, opacity: reduce ? 0 : 1 } : { rotateY: 0, opacity: 1 }}
          transition={{ duration: reduce ? 0.2 : 0.9, ease: [0.3, 0.7, 0.4, 1], delay: doorOpen && !reduce && vault ? 0.5 : 0 }}
          style={{
            transformOrigin: 'left center',
            background: art.door,
            borderRadius: vault ? '50%' : 3,
            boxShadow: `inset 0 -6px 0 ${art.doorEdge}, inset 0 0 0 3px ${art.doorEdge}`,
          }}
        >
          {vault && (
            <motion.svg
              aria-hidden
              viewBox="0 0 40 40"
              width="42%"
              className="absolute"
              animate={doorOpen && !reduce ? { rotate: 270 } : { rotate: 0 }}
              transition={{ duration: 0.6 }}
            >
              <circle cx="20" cy="20" r="6" fill="#636b76" />
              {[0, 60, 120].map((a) => (
                <rect key={a} x="18.5" y="2" width="3" height="36" rx="1.5" fill="#636b76" transform={`rotate(${a} 20 20)`} />
              ))}
            </motion.svg>
          )}
          <div className="relative flex flex-col gap-[4px]" style={{ zIndex: 1 }}>
            {Array.from({ length: locksTotal }, (_, i) => {
              const isOpen = i < locksOpen;
              return (
                <motion.span
                  key={i}
                  initial={false}
                  animate={isOpen && !reduce ? { y: [0, -4, 0] } : {}}
                  className="flex items-center justify-center w-[28px] h-[28px] rounded-md"
                  style={{ background: isOpen ? '#23875a' : '#1f2430', color: isOpen ? '#fff' : '#ffd23e' }}
                  aria-label={isOpen ? 'Lock open' : 'Lock closed'}
                >
                  {isOpen ? <LockOpen size={15} /> : <Lock size={15} />}
                </motion.span>
              );
            })}
          </div>
        </motion.div>
      </div>

      {/* Hero */}
      <motion.div
        className="absolute"
        style={{ bottom: '6%', x: '-50%' }}
        initial={false}
        animate={
          escaping
            ? { left: `${door.left + door.width / 2}%`, scale: 0.55, opacity: 0, bottom: '24%' }
            : { left: '44%', scale: 1, opacity: 1, bottom: '6%' }
        }
        transition={escaping ? { duration: reduce ? 0.3 : 1.2, delay: reduce ? 0 : 0.9, ease: 'easeIn' } : { duration: 0 }}
      >
        <Mascot mood={mood} color={MASCOT_COLOR} accessory="headband" size={72} />
      </motion.div>

      {/* Escape light flood */}
      <AnimatePresence>
        {escaping && (
          <motion.div
            aria-hidden
            className="absolute inset-0"
            style={{ background: LIGHT, transformOrigin: `${door.left + door.width / 2}% 50%` }}
            initial={{ opacity: 0, scale: reduce ? 1 : 0.2 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: reduce ? 0.3 : 0.8, delay: reduce ? 0.2 : 1.8, ease: 'easeOut' }}
          />
        )}
      </AnimatePresence>

      {flash > 0 && (
        <div key={flash} aria-hidden className="er-flash absolute inset-0 pointer-events-none" style={{ boxShadow: 'inset 0 0 0 6px #ff4d57, inset 0 0 60px rgba(255,40,50,0.55)', opacity: 0 }} />
      )}
      <ScorePopups popups={popups} onDone={onPopupDone} />
    </div>
  );
}

function TimerChip({ ms, flash }: { ms: number; flash: number }) {
  const reduce = useReducedMotion();
  const total = Math.max(0, Math.ceil(ms / 1000));
  const low = total <= 60;
  const label = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  return (
    <motion.div
      key={flash}
      initial={flash && !reduce ? { x: -6, scale: 1.1 } : false}
      animate={{ x: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 700, damping: 12 }}
      className="flex items-center gap-2 px-3.5 h-10 rounded-xl"
      style={{
        background: low ? 'var(--color-danger)' : 'var(--color-surface)',
        color: low ? '#fff' : 'var(--color-text)',
        border: low ? 'none' : '1px solid var(--color-border)',
      }}
      role="timer"
      aria-label={`${Math.floor(total / 60)} minutes ${total % 60} seconds left`}
    >
      <Clock size={17} />
      <span className="text-xl font-extrabold tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>{label}</span>
    </motion.div>
  );
}

// ---------- Setup ----------

interface RunConfig {
  minutes: number;
  direction: AnswerDirection;
}

function ConfigScreen({ onStart, setId }: { onStart: (c: RunConfig) => void; setId: string }) {
  const [minutes, setMinutes] = useState(8);
  const [direction, setDirection] = useState<AnswerDirection>('term-to-def');
  const [bests] = useState(() => ({ 5: getBest(GAME_ID, setId, '5m'), 8: getBest(GAME_ID, setId, '8m'), 12: getBest(GAME_ID, setId, '12m') }));
  const best = bests[minutes as 5 | 8 | 12];
  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <div className="rounded-3xl overflow-hidden" style={{ boxShadow: '0 20px 50px rgba(0,0,0,0.18)' }}>
        <div className="relative flex items-end px-4 pb-3" style={{ aspectRatio: '400 / 150' }}>
          <svg aria-hidden viewBox="0 30 400 150" className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid slice">
            <LibraryArt />
            <rect x="284" y="52" width="92" height="122" rx="4" fill={ROOM_ART.library.doorEdge} />
            <rect x="290" y="58" width="80" height="114" rx="3" fill={ROOM_ART.library.door} />
            <circle cx="356" cy="118" r="5" fill="#e0a526" />
          </svg>
          <div className="relative flex items-end gap-2 min-w-0">
            <Mascot mood="happy" color={MASCOT_COLOR} accessory="headband" size={72} />
            <div className="pb-1 rounded-2xl px-3 py-2" style={{ background: 'rgba(31,20,12,0.72)' }}>
              <h2 className="text-2xl sm:text-3xl font-extrabold" style={{ color: '#fff6e5', fontFamily: 'var(--font-display)' }}>
                Escape Room
              </h2>
              <p className="text-sm font-semibold" style={{ color: '#f1d9b8' }}>
                Three rooms, seven locks, one clock.
              </p>
            </div>
          </div>
        </div>
        <div className="p-6 flex flex-col gap-6" style={{ background: 'var(--color-surface)' }}>
          <SetupSection label="Clock">
            <ChoicePills
              options={[
                { value: 5, label: '5 minutes' },
                { value: 8, label: '8 minutes' },
                { value: 12, label: '12 minutes' },
              ]}
              isSelected={(v) => v === minutes}
              onToggle={setMinutes}
              accent={ROOM_ART.library.accent}
            />
            <p className="text-sm mt-2" style={{ color: 'var(--color-text-secondary)' }}>
              Wrong answers cost {WRONG_PENALTY}s, hints {HINT_PENALTY}s.
              {best !== null ? ` Your best here: ${best.toLocaleString()}.` : ''}
            </p>
          </SetupSection>
          <SetupSection label="Code lock questions answer with">
            <ChoicePills
              options={[
                { value: 'term-to-def', label: 'Definitions' },
                { value: 'def-to-term', label: 'Terms' },
                { value: 'both', label: 'Both' },
              ]}
              isSelected={(v) => v === direction}
              onToggle={setDirection}
              accent={ROOM_ART.library.accent}
            />
          </SetupSection>
          <PlayButton color={ROOM_ART.library.accent} onClick={() => onStart({ minutes, direction })}>
            Lock me in
          </PlayButton>
        </div>
      </div>
    </div>
  );
}

// ---------- Game ----------

interface RunResult {
  won: boolean;
  score: number;
  stars: number;
  secondsLeft: number;
  accuracy: number;
  locksOpened: number;
  hints: number;
  missed: Card[];
}

const TOTAL_LOCKS = ROOMS.reduce((n, r) => n + r.locks.length, 0);

export default function EscapeRoomMode({ cards, setId, exitUrl }: ModeProps) {
  const navigate = useNavigate();
  const reduce = !!useReducedMotion();
  const exitTo = exitUrl ?? `/sets/${setId}`;
  const exit = useCallback(() => navigate(exitTo), [navigate, exitTo]);
  const groups = useMemo(() => buildEquivalenceGroups(cards), [cards]);
  const later = useLater();

  const [phase, setPhase] = useState<'config' | 'countdown' | 'game' | 'door' | 'won' | 'lost'>('config');
  const [config, setConfig] = useState<RunConfig | null>(null);
  const [run, setRun] = useState<LockData[][]>([]);
  const [roomIdx, setRoomIdx] = useState(0);
  const [lockIdx, setLockIdx] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [doorOpen, setDoorOpen] = useState(false);
  const [escaping, setEscaping] = useState(false);
  const [mood, setMood] = useState<MascotMood>('idle');
  const [flash, setFlash] = useState(0);
  const [result, setResult] = useState<RunResult | null>(null);
  const [best, setBest] = useState<ReturnType<typeof submitScore> | undefined>();
  const { popups, push, remove } = usePopups();

  // Handler-only bookkeeping.
  const deadline = useRef(0);
  const pausedLeft = useRef(0);
  const totalMs = useRef(0);
  const pos = useRef({ room: 0, lock: 0 });
  const stats = useRef({ attempts: 0, correct: 0, hints: 0, opened: 0 });
  const missed = useRef(new Map<string, Card>());
  const finished = useRef(false);

  const playing = phase === 'game';
  const escArmed = useEscToQuit(phase !== 'config', playing || phase === 'door', exit);

  const finish = useCallback(
    (won: boolean, leftMs: number) => {
      if (finished.current || !config) return;
      finished.current = true;
      const s = stats.current;
      const accuracy = s.attempts > 0 ? s.correct / s.attempts : 0;
      const secondsLeft = won ? Math.max(0, Math.ceil(leftMs / 1000)) : 0;
      const score = won
        ? secondsLeft * 10 + Math.round(accuracy * 500) + 500
        : s.opened * 100 + Math.round(accuracy * 200);
      const stars = won ? (leftMs >= totalMs.current * 0.5 ? 3 : leftMs >= totalMs.current * 0.25 ? 2 : 1) : 0;
      setResult({ won, score, stars, secondsLeft, accuracy, locksOpened: s.opened, hints: s.hints, missed: [...missed.current.values()] });
      setBest(submitScore(GAME_ID, setId, score, `${config.minutes}m`));
      setPhase(won ? 'won' : 'lost');
      playSound(won ? 'win' : 'lose');
    },
    [config, setId],
  );
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  });

  useEffect(() => {
    if (phase === 'won') return celebrate(['#ffd23e', '#fff3c4', MASCOT_COLOR, '#3ccf7a'], 1400);
  }, [phase]);

  // The clock.
  useEffect(() => {
    if (phase !== 'game') return;
    let lastWhole = -1;
    const id = setInterval(() => {
      const left = deadline.current - Date.now();
      if (left <= 0) {
        setTimeLeft(0);
        finishRef.current(false, 0);
        return;
      }
      setTimeLeft(left);
      const whole = Math.ceil(left / 1000);
      if (whole <= 10 && whole !== lastWhole) playSound('tick');
      lastWhole = whole;
    }, 200);
    return () => clearInterval(id);
  }, [phase]);

  const start = useCallback(
    (cfg: RunConfig) => {
      finished.current = false;
      stats.current = { attempts: 0, correct: 0, hints: 0, opened: 0 };
      missed.current = new Map();
      pos.current = { room: 0, lock: 0 };
      totalMs.current = cfg.minutes * 60_000;
      setConfig(cfg);
      setRun(buildRun(cards, groups, cfg.direction));
      setRoomIdx(0);
      setLockIdx(0);
      setTimeLeft(totalMs.current);
      setDoorOpen(false);
      setEscaping(false);
      setMood('idle');
      setResult(null);
      setBest(undefined);
      setPhase('countdown');
    },
    [cards, groups],
  );

  const penalize = useCallback(
    (seconds: number) => {
      deadline.current -= seconds * 1000;
      const left = deadline.current - Date.now();
      setFlash((f) => f + 1);
      push({ text: `−${seconds}s`, color: '#ff4d57', x: 42, y: 8 });
      if (left <= 0) {
        setTimeLeft(0);
        finishRef.current(false, 0);
      } else {
        setTimeLeft(left);
      }
    },
    [push],
  );

  const api = useMemo<LockApi>(
    () => ({
      right: () => {
        if (finished.current) return;
        stats.current.attempts += 1;
        stats.current.correct += 1;
        setMood('happy');
      },
      wrong: (seconds, cardsMissed) => {
        if (finished.current) return;
        stats.current.attempts += 1;
        cardsMissed.forEach((c) => missed.current.set(c.id, c));
        playSound('wrong');
        setMood('worried');
        penalize(seconds);
      },
      hint: () => {
        if (finished.current) return;
        stats.current.hints += 1;
        playSound('flip');
        penalize(HINT_PENALTY);
      },
      solved: () => {
        if (finished.current) return;
        stats.current.opened += 1;
        const { room, lock } = pos.current;
        playSound('match');
        if (lock + 1 < ROOMS[room].locks.length) {
          pos.current = { room, lock: lock + 1 };
          setLockIdx(lock + 1);
          setMood('idle');
          return;
        }
        // Door opens: pause the clock for the walk through.
        pausedLeft.current = Math.max(0, deadline.current - Date.now());
        setLockIdx(lock + 1);
        setDoorOpen(true);
        setMood('celebrate');
        setPhase('door');
        later(() => playSound('boost'), reduce ? 0 : 300);
        if (room + 1 >= ROOMS.length) {
          setEscaping(true);
          later(() => finishRef.current(true, pausedLeft.current), reduce ? 900 : ESCAPE_MS + 300);
          return;
        }
        later(() => {
          pos.current = { room: room + 1, lock: 0 };
          deadline.current = Date.now() + pausedLeft.current;
          setRoomIdx(room + 1);
          setLockIdx(0);
          setDoorOpen(false);
          setMood('idle');
          setPhase('game');
        }, reduce ? 600 : DOOR_MS);
      },
    }),
    [penalize, later, reduce],
  );

  if (phase === 'config') return <ConfigScreen onStart={start} setId={setId} />;

  if ((phase === 'won' || phase === 'lost') && result) {
    return (
      <div className="relative min-h-[calc(100dvh-8rem)] flex flex-col items-center px-4 pt-24 pb-10">
        <ResultsPanel
          mascot={<Mascot mood={result.won ? 'celebrate' : 'sad'} color={MASCOT_COLOR} accessory="headband" size={112} />}
          title={result.won ? 'You escaped' : "Time's up"}
          subtitle={
            result.won
              ? `Out of the vault with ${Math.floor(result.secondsLeft / 60)}:${String(result.secondsLeft % 60).padStart(2, '0')} to spare.`
              : `${result.locksOpened} of ${TOTAL_LOCKS} locks opened. The cards below held you up.`
          }
          stars={result.stars}
          score={result.score}
          best={best}
          stats={[
            { label: 'Accuracy', value: `${Math.round(result.accuracy * 100)}%` },
            { label: 'Locks', value: `${result.locksOpened}/${TOTAL_LOCKS}` },
            { label: 'Hints', value: result.hints },
            { label: 'Time left', value: `${Math.floor(result.secondsLeft / 60)}:${String(result.secondsLeft % 60).padStart(2, '0')}` },
          ]}
          actions={
            <>
              <Button variant="primary" onClick={() => config && start(config)}>Play again</Button>
              <Button variant="outline" onClick={() => setPhase('config')}>Change clock</Button>
              <Button variant="ghost" onClick={exit}>Exit</Button>
            </>
          }
        />
        {result.missed.length > 0 && (
          <div className="w-full max-w-md mt-4 rounded-2xl p-4" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            <h3 className="font-extrabold mb-2" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
              Cards that cost you time
            </h3>
            <ul className="flex flex-col gap-2 list-none p-0 m-0">
              {result.missed.map((c) => (
                <li key={c.id} className="rounded-xl p-2.5 text-sm" style={{ background: 'var(--color-muted)', color: 'var(--color-text)' }}>
                  <StudyContent html={c.term} className="font-bold" />
                  <StudyContent html={c.definition} className="opacity-80" />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  const room = ROOMS[roomIdx];
  const lock = run[roomIdx]?.[lockIdx];

  return (
    <div className="max-w-3xl mx-auto px-4 py-4">
      <EscBanner show={escArmed} />
      {phase === 'countdown' && (
        <Countdown
          accent="#ffd23e"
          onDone={() => {
            deadline.current = Date.now() + totalMs.current;
            setPhase('game');
          }}
        />
      )}

      <GameTopBar onExit={exit}>
        <span className="text-sm font-bold" style={{ color: 'var(--color-text-secondary)' }}>
          Room {roomIdx + 1} of {ROOMS.length}
        </span>
        <TimerChip ms={timeLeft} flash={flash} />
      </GameTopBar>

      <div className="mt-3 max-w-[620px] mx-auto">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={room.id}
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: 60 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: -60 }}
            transition={{ duration: reduce ? 0.15 : 0.4 }}
          >
            <RoomScene
              room={room.id}
              locksOpen={lockIdx}
              locksTotal={room.locks.length}
              doorOpen={doorOpen}
              escaping={escaping}
              mood={mood}
              flash={flash}
              popups={popups}
              onPopupDone={remove}
            />
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <h2 className="text-lg font-extrabold mr-1" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
          {room.name}
        </h2>
        {room.locks.map((_, i) => {
          const kind = run[roomIdx]?.[i]?.kind ?? room.locks[i];
          const done = i < lockIdx;
          const current = i === lockIdx;
          return (
            <span
              key={i}
              className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-xs font-bold"
              style={{
                background: done ? 'var(--color-success-light)' : current ? 'var(--color-text)' : 'var(--color-muted)',
                color: done ? 'var(--color-success)' : current ? 'var(--color-surface)' : 'var(--color-text-secondary)',
              }}
            >
              {done ? <LockOpen size={12} /> : <Lock size={12} />}
              {LOCK_NAMES[kind]}
            </span>
          );
        })}
      </div>

      <div className="mt-3 rounded-3xl p-5 sm:p-6" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' }}>
        {phase === 'door' ? (
          <p className="text-center text-lg font-extrabold py-6" role="status" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
            {escaping ? 'The vault door swings open…' : 'The door creaks open. On to the next room.'}
          </p>
        ) : lock ? (
          <AnimatePresence mode="wait">
            <motion.div
              key={`${roomIdx}-${lockIdx}`}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0.1 : 0.25 }}
            >
              {lock.kind === 'code' && <CodeLock lock={lock} api={api} active={playing} />}
              {lock.kind === 'word' && <WordLock lock={lock} api={api} active={playing} />}
              {lock.kind === 'odd' && <OddLock lock={lock} api={api} active={playing} />}
              {lock.kind === 'match' && <MatchLock lock={lock} api={api} active={playing} />}
            </motion.div>
          </AnimatePresence>
        ) : null}
      </div>
    </div>
  );
}
