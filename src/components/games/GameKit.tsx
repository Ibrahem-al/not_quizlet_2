import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'framer-motion';
import { ArrowLeft, Check, Flame, Star, Trophy, X } from 'lucide-react';
import { stripHtml, cn } from '@/lib/utils';
import StudyContent from '@/components/StudyContent';
import { SoundToggle } from '@/components/SoundToggle';
import { playSound } from '@/lib/gameSounds';
import { isCorrectOption, type GameQuestion } from '@/lib/gameQuestions';
import { TILE_COLORS, comboMultiplier, formatMultiplier } from '@/components/games/gameLogic';

// ============================================================
// Shared game kit: the HUD, answer controls, countdown, combo
// scoring and results screen every game uses, so the games feel
// like one family while each keeps its own scene.
// ============================================================

// ---------- HUD ----------

export function GameTopBar({
  onExit,
  children,
  tone = 'light',
}: {
  onExit: () => void;
  children?: ReactNode;
  /** 'dark' when the bar sits on a dark scene. */
  tone?: 'light' | 'dark';
}) {
  const color = tone === 'dark' ? 'rgba(255,255,255,0.85)' : 'var(--color-text-secondary)';
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-1" style={{ color }}>
        <button
          onClick={onExit}
          className="flex items-center gap-1.5 h-9 px-2.5 rounded-lg text-sm font-semibold cursor-pointer transition-colors hover:bg-black/10 focus-visible:outline-2"
          style={{ background: 'transparent', border: 'none', color }}
        >
          <ArrowLeft size={16} /> Exit
        </button>
        <SoundToggle color={color} />
      </div>
      <div className="flex items-center gap-2 flex-wrap justify-end">{children}</div>
    </div>
  );
}

/** Rolling score readout; pops when points land. */
export function ScoreCounter({ value, tone = 'light' }: { value: number; tone?: 'light' | 'dark' }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(value);
  const rounded = useTransform(mv, (v) => Math.round(v).toLocaleString());
  useEffect(() => {
    if (reduce) {
      mv.set(value);
      return;
    }
    const controls = animate(mv, value, { duration: 0.6, ease: 'easeOut' });
    return () => controls.stop();
  }, [value, mv, reduce]);

  return (
    <motion.div
      key={value}
      initial={reduce ? false : { scale: 1.18 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 20 }}
      className="flex items-baseline gap-1.5 px-3.5 h-10 rounded-xl"
      style={{
        background: tone === 'dark' ? 'rgba(255,255,255,0.12)' : 'var(--color-surface)',
        border: tone === 'dark' ? '1px solid rgba(255,255,255,0.18)' : '1px solid var(--color-border)',
        color: tone === 'dark' ? '#fff' : 'var(--color-text)',
        alignItems: 'center',
      }}
      aria-label={`Score ${value}`}
    >
      <motion.span
        className="text-xl font-extrabold tabular-nums leading-none"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {rounded}
      </motion.span>
      <span className="text-xs font-semibold opacity-70">pts</span>
    </motion.div>
  );
}

/** Streak flame with the live multiplier. Hidden until a streak starts. */
export function ComboMeter({ streak, tone = 'light' }: { streak: number; tone?: 'light' | 'dark' }) {
  const reduce = useReducedMotion();
  const mult = comboMultiplier(streak);
  const hot = mult > 1;
  return (
    <AnimatePresence initial={false}>
      {streak >= 2 && (
        <motion.div
          key="combo"
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
          transition={{ type: 'spring', stiffness: 500, damping: 24 }}
          className="flex items-center gap-1 px-3 h-10 rounded-xl font-extrabold"
          style={{
            background: hot ? 'linear-gradient(180deg, #ff8a1f, #e5484d)' : tone === 'dark' ? 'rgba(255,255,255,0.12)' : 'var(--color-surface)',
            color: '#fff',
            fontFamily: 'var(--font-display)',
            boxShadow: hot ? '0 4px 14px rgba(229,72,77,0.35)' : undefined,
          }}
          aria-label={`${streak} in a row, ${formatMultiplier(mult)} points`}
        >
          <motion.span
            key={streak}
            initial={reduce ? false : { scale: 1.5, rotate: -12 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 600, damping: 14 }}
            className="flex"
          >
            <Flame size={18} fill="currentColor" />
          </motion.span>
          <span className="tabular-nums">{streak}</span>
          <span className="text-sm opacity-90 ml-0.5">{formatMultiplier(mult)}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function EscBanner({ show }: { show: boolean }) {
  return (
    <div className="fixed top-4 left-0 right-0 flex justify-center pointer-events-none" style={{ zIndex: 60 }}>
      <AnimatePresence>
        {show && (
          <motion.div
            role="status"
            className="px-4 py-2 text-sm font-semibold rounded-full"
            style={{
              background: 'var(--color-surface-raised)',
              color: 'var(--color-text)',
              border: '1px solid var(--color-border-light)',
              boxShadow: 'var(--shadow-modal)',
            }}
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
          >
            Press Esc again to quit
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------- Countdown ----------

/** 3-2-1-Go overlay. Calls onDone when "Go" finishes. */
export function Countdown({ onDone, accent = '#ffd23e' }: { onDone: () => void; accent?: string }) {
  const reduce = useReducedMotion();
  const [step, setStep] = useState(3);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });

  useEffect(() => {
    if (step > 0) playSound('countdown');
    else playSound('go');
    const t = setTimeout(
      () => {
        if (step > 0) setStep(step - 1);
        else doneRef.current();
      },
      reduce ? 250 : step > 0 ? 650 : 450,
    );
    return () => clearTimeout(t);
  }, [step, reduce]);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 70, background: 'rgba(10,12,24,0.45)', backdropFilter: 'blur(2px)' }}
      aria-live="assertive"
    >
      <AnimatePresence mode="popLayout">
        <motion.div
          key={step}
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 2.2 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.5 }}
          transition={{ type: 'spring', stiffness: 380, damping: 22 }}
          className="font-extrabold select-none"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: step > 0 ? 'clamp(6rem, 22vw, 11rem)' : 'clamp(4.5rem, 16vw, 8rem)',
            color: step > 0 ? '#fff' : accent,
            WebkitTextStroke: '3px rgba(0,0,0,0.25)',
            textShadow: '0 8px 0 rgba(0,0,0,0.25)',
            lineHeight: 1,
          }}
        >
          {step > 0 ? step : 'Go!'}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ---------- Answer controls ----------

export type Feedback = 'correct' | 'wrong' | null;

export function AnswerTiles({
  question,
  selected,
  feedback,
  disabled,
  onPick,
}: {
  question: GameQuestion;
  selected: string | null;
  feedback: Feedback;
  disabled?: boolean;
  onPick: (option: string) => void;
}) {
  const reduce = useReducedMotion();
  const options = question.options ?? [];
  return (
    <div className="@container">
      <div className="grid grid-cols-1 @md:grid-cols-2 gap-2.5">
        {options.map((option, i) => {
          const c = TILE_COLORS[i % TILE_COLORS.length];
          const right = feedback !== null && isCorrectOption(question, option);
          const pickedWrong = feedback !== null && selected === option && !right;
          const faded = feedback !== null && !right && !pickedWrong;
          return (
            <motion.button
              key={`${i}-${option}`}
              onClick={() => onPick(option)}
              disabled={disabled || feedback !== null}
              whileHover={feedback || disabled || reduce ? undefined : { y: -3 }}
              whileTap={feedback || disabled || reduce ? undefined : { y: 2, scale: 0.98 }}
              animate={
                pickedWrong && !reduce
                  ? { x: [0, -8, 8, -5, 5, 0], opacity: 1 }
                  : { opacity: faded ? 0.35 : 1, scale: right && !reduce ? [1, 1.04, 1] : 1 }
              }
              transition={{ duration: 0.35 }}
              className="answer-tile relative flex items-center gap-3 text-left min-h-16 pl-3 pr-4 py-3 rounded-2xl cursor-pointer focus-visible:outline-3 focus-visible:outline-offset-2"
              style={{
                background: c.bg,
                color: c.text,
                border: 'none',
                boxShadow: `inset 0 -5px 0 ${c.edge}`,
                outlineColor: 'var(--color-primary)',
                fontWeight: 600,
              }}
            >
              <span
                className="flex items-center justify-center w-7 h-7 rounded-lg text-sm font-extrabold shrink-0"
                style={{ background: 'rgba(0,0,0,0.18)', fontFamily: 'var(--font-display)' }}
                aria-hidden
              >
                {right ? <Check size={16} strokeWidth={3} /> : pickedWrong ? <X size={16} strokeWidth={3} /> : i + 1}
              </span>
              <StudyContent html={option} className="text-base leading-snug min-w-0 break-words" />
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

export function TrueFalseButtons({
  answer,
  feedback,
  disabled,
  onPick,
}: {
  /** The correct value, used to color buttons after answering. */
  answer: boolean | undefined;
  feedback: Feedback;
  disabled?: boolean;
  onPick: (value: boolean) => void;
}) {
  const reduce = useReducedMotion();
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {[true, false].map((value) => {
        const c = value ? TILE_COLORS[3] : TILE_COLORS[0];
        const faded = feedback !== null && value !== answer;
        return (
          <motion.button
            key={String(value)}
            onClick={() => onPick(value)}
            disabled={disabled || feedback !== null}
            whileHover={feedback || disabled || reduce ? undefined : { y: -3 }}
            whileTap={feedback || disabled || reduce ? undefined : { y: 2, scale: 0.98 }}
            animate={{ opacity: faded ? 0.35 : 1 }}
            className="flex items-center justify-center gap-2 h-16 rounded-2xl text-lg font-extrabold cursor-pointer focus-visible:outline-3 focus-visible:outline-offset-2"
            style={{
              background: c.bg,
              color: c.text,
              border: 'none',
              boxShadow: `inset 0 -5px 0 ${c.edge}`,
              fontFamily: 'var(--font-display)',
              outlineColor: 'var(--color-primary)',
            }}
          >
            {value ? <Check size={20} strokeWidth={3} /> : <X size={20} strokeWidth={3} />}
            {value ? 'True' : 'False'}
            <span aria-hidden className="hidden md:inline text-xs font-bold opacity-70 ml-1">{value ? 'T' : 'F'}</span>
          </motion.button>
        );
      })}
    </div>
  );
}

/** Prompt + the right answer control for its type + result feedback. */
export function QuestionPanel({
  question,
  feedback,
  selectedOption,
  disabled,
  onWritten,
  onOption,
  onTrueFalse,
  footer,
  points,
}: {
  question: GameQuestion;
  feedback: Feedback;
  selectedOption: string | null;
  disabled?: boolean;
  onWritten: (text: string) => void;
  onOption: (option: string) => void;
  onTrueFalse: (value: boolean) => void;
  /** Rendered under the feedback (e.g. a Next button). */
  footer?: ReactNode;
  /** Points earned for the last answer, shown in the feedback strip. */
  points?: number | null;
}) {
  const reduce = useReducedMotion();
  const [text, setText] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (feedback || !text.trim() || disabled) return;
    onWritten(text);
  };

  return (
    <div>
      {question.type === 'true-false' && question.tfPair ? (
        <div className="mb-5">
          <p className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text-secondary)' }}>
            Is this pair right?
          </p>
          <div className="rounded-2xl p-4" style={{ background: 'var(--color-muted)' }}>
            <StudyContent html={question.tfPair.term} className="text-xl font-bold" />
            <div className="my-2 h-px" style={{ background: 'var(--color-border)' }} />
            <StudyContent html={question.tfPair.definition} className="text-lg" />
          </div>
        </div>
      ) : (
        <div className="mb-5">
          <p className="text-sm font-semibold mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
            {question.type === 'written' ? 'Type the answer' : 'Pick the answer'}
          </p>
          <StudyContent html={question.promptHtml} className="text-2xl font-bold leading-snug" />
        </div>
      )}

      {question.type === 'written' && (
        <form onSubmit={submit} className="flex gap-2">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Your answer"
            disabled={feedback !== null || disabled}
            autoFocus
            aria-label="Your answer"
            className="flex-1 min-w-0 h-14 px-4 text-lg rounded-2xl outline-none focus-visible:ring-4"
            style={{
              background: 'var(--color-surface)',
              color: 'var(--color-text)',
              border: `2px solid ${
                feedback === 'correct' ? 'var(--color-success)' : feedback === 'wrong' ? 'var(--color-danger)' : 'var(--color-border)'
              }`,
              // ring color for keyboard focus
              ['--tw-ring-color' as string]: 'var(--color-primary-ring)',
            }}
          />
          {!feedback && (
            <button
              type="submit"
              disabled={!text.trim() || disabled}
              className="h-14 px-5 rounded-2xl font-extrabold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-3 focus-visible:outline-offset-2"
              style={{
                background: 'var(--color-primary)',
                color: '#fff',
                border: 'none',
                boxShadow: 'inset 0 -4px 0 rgba(0,0,0,0.2)',
                fontFamily: 'var(--font-display)',
              }}
            >
              Check
            </button>
          )}
        </form>
      )}

      {question.type === 'multiple-choice' && question.options && (
        <AnswerTiles
          question={question}
          selected={selectedOption}
          feedback={feedback}
          disabled={disabled}
          onPick={onOption}
        />
      )}

      {question.type === 'true-false' && (
        <TrueFalseButtons
          answer={question.tfPair?.isCorrect}
          feedback={feedback}
          disabled={disabled}
          onPick={onTrueFalse}
        />
      )}

      {!feedback && question.type !== 'written' && (
        <p className="hidden md:block mt-3 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
          {question.type === 'multiple-choice'
            ? `Keys 1–${question.options?.length ?? 4} answer`
            : 'Keys T and F answer'}
        </p>
      )}

      <AnimatePresence>
        {feedback && (
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4"
            role="status"
          >
            <div
              className="flex items-center gap-3 rounded-2xl px-4 py-3"
              style={{
                background: feedback === 'correct' ? 'var(--color-success-light)' : 'var(--color-danger-light)',
              }}
            >
              <span
                className="flex items-center justify-center w-8 h-8 rounded-full shrink-0"
                style={{ background: feedback === 'correct' ? 'var(--color-success)' : 'var(--color-danger)', color: '#fff' }}
              >
                {feedback === 'correct' ? <Check size={18} strokeWidth={3} /> : <X size={18} strokeWidth={3} />}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className="font-extrabold"
                  style={{
                    color: feedback === 'correct' ? 'var(--color-success)' : 'var(--color-danger)',
                    fontFamily: 'var(--font-display)',
                  }}
                >
                  {feedback === 'correct' ? 'Correct' : 'Not quite'}
                  {feedback === 'correct' && points ? ` +${points}` : ''}
                </p>
                {feedback === 'wrong' && (
                  <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                    Answer: <span className="font-semibold" style={{ color: 'var(--color-text)' }}>{stripHtml(question.correctAnswers[0])}</span>
                  </p>
                )}
              </div>
            </div>
            {footer}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------- Setup controls ----------

export function SetupSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <fieldset className="border-0 p-0 m-0">
      <legend className="text-sm font-bold mb-2" style={{ color: 'var(--color-text)' }}>
        {label}
      </legend>
      {children}
    </fieldset>
  );
}

/** Pill-style single or multi select. */
export function ChoicePills<T extends string | number>({
  options,
  isSelected,
  onToggle,
  accent = 'var(--color-primary)',
}: {
  options: { value: T; label: ReactNode }[];
  isSelected: (value: T) => boolean;
  onToggle: (value: T) => void;
  accent?: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = isSelected(o.value);
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(o.value)}
            className="min-h-10 py-2 leading-tight px-4 rounded-xl text-sm font-semibold cursor-pointer transition-[background-color,color,transform] active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              background: on ? accent : 'var(--color-muted)',
              color: on ? '#fff' : 'var(--color-text)',
              border: 'none',
              outlineColor: accent,
              boxShadow: on ? 'inset 0 -3px 0 rgba(0,0,0,0.2)' : 'none',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function PlayButton({ onClick, children, color = 'var(--color-primary)' }: { onClick: () => void; children: ReactNode; color?: string }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -2 }}
      whileTap={{ y: 2 }}
      className="w-full h-14 rounded-2xl text-xl font-extrabold cursor-pointer focus-visible:outline-3 focus-visible:outline-offset-2"
      style={{
        background: color,
        color: '#fff',
        border: 'none',
        boxShadow: 'inset 0 -6px 0 rgba(0,0,0,0.22), 0 8px 20px rgba(0,0,0,0.15)',
        fontFamily: 'var(--font-display)',
        outlineColor: color,
      }}
    >
      {children}
    </motion.button>
  );
}

// ---------- Results ----------

/** Three stars that pop in one by one. */
export function StarRating({ stars, size = 52 }: { stars: number; size?: number }) {
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) return;
    const timers = Array.from({ length: stars }, (_, i) => setTimeout(() => playSound('star'), 350 + i * 280));
    return () => timers.forEach(clearTimeout);
  }, [stars, reduce]);

  return (
    <div className="flex items-end justify-center gap-2" role="img" aria-label={`${stars} of 3 stars`}>
      {[0, 1, 2].map((i) => {
        const earned = i < stars;
        return (
          <motion.span
            key={i}
            initial={reduce ? false : { scale: 0, rotate: -40 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 13, delay: reduce ? 0 : 0.35 + i * 0.28 }}
            style={{ marginBottom: i === 1 ? 10 : 0 }}
          >
            <Star
              size={i === 1 ? size * 1.2 : size}
              fill={earned ? '#ffc53d' : 'var(--color-muted)'}
              stroke={earned ? '#d89614' : 'var(--color-border)'}
              strokeWidth={1.5}
            />
          </motion.span>
        );
      })}
    </div>
  );
}

export interface ResultStat {
  label: string;
  value: ReactNode;
}

export function ResultsPanel({
  mascot,
  title,
  subtitle,
  stars,
  score,
  best,
  stats,
  actions,
}: {
  mascot?: ReactNode;
  title: string;
  subtitle?: ReactNode;
  stars?: number;
  score?: number;
  /** Personal best info from submitScore(). */
  best?: { previousBest: number | null; isNewBest: boolean };
  stats: ResultStat[];
  actions: ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 30, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 240, damping: 24 }}
      className="relative w-full max-w-md mx-auto rounded-3xl p-6 sm:p-8 text-center"
      style={{
        background: 'var(--color-surface)',
        boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
        border: '1px solid var(--color-border-light)',
      }}
    >
      {mascot && <div className="flex justify-center -mt-20 mb-1">{mascot}</div>}
      <h2 className="text-3xl font-extrabold" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
        {title}
      </h2>
      {subtitle && (
        <p className="mt-1" style={{ color: 'var(--color-text-secondary)' }}>
          {subtitle}
        </p>
      )}
      {stars !== undefined && (
        <div className="mt-5">
          <StarRating stars={stars} />
        </div>
      )}
      {score !== undefined && (
        <div className="mt-5">
          <div className="text-5xl font-extrabold tabular-nums" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
            {score.toLocaleString()}
          </div>
          <div className="text-sm font-semibold" style={{ color: 'var(--color-text-tertiary)' }}>points</div>
          {best && (
            <div className="mt-3 flex justify-center">
              {best.isNewBest && best.previousBest !== null ? (
                <motion.span
                  initial={reduce ? false : { scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 12, delay: reduce ? 0 : 1.2 }}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-extrabold"
                  style={{ background: '#ffc53d', color: '#3d2600' }}
                >
                  <Trophy size={15} /> New best! Beat {best.previousBest.toLocaleString()}
                </motion.span>
              ) : best.previousBest !== null ? (
                <span className="text-sm font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                  Your best: {best.previousBest.toLocaleString()}
                </span>
              ) : (
                <span className="text-sm font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                  First score on this set. Play again to beat it.
                </span>
              )}
            </div>
          )}
        </div>
      )}
      <dl className={cn('grid gap-2 mt-6', stats.length >= 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3')}>
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col-reverse rounded-2xl py-3 px-2" style={{ background: 'var(--color-muted)' }}>
            <dt className="text-xs font-semibold mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
              {s.label}
            </dt>
            <dd className="m-0 text-xl font-extrabold tabular-nums" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
              {s.value}
            </dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap gap-2 justify-center mt-6">{actions}</div>
    </motion.div>
  );
}
