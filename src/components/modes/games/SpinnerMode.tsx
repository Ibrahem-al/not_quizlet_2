import { useState, useCallback, useRef, useEffect, useId, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Eye, RotateCcw, Sparkles } from 'lucide-react';
import type { Card } from '@/types';
import { useNavigate } from 'react-router-dom';
import { stripHtml } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import StudyContent from '@/components/StudyContent';
import { playSound } from '@/lib/gameSounds';
import { submitScore } from '@/lib/gameRecords';
import { Mascot, type MascotMood } from '@/components/games/Mascot';
import { ScorePopups } from '@/components/games/ScorePopup';
import {
  ComboMeter,
  GameTopBar,
  ResultsPanel,
  ScoreCounter,
} from '@/components/games/GameKit';
import {
  celebrate,
  comboMultiplier,
  formatMultiplier,
  usePopups,
} from '@/components/games/gameLogic';

interface SpinnerModeProps {
  cards: Card[];
  setId: string;
  exitUrl?: string;
}

/** Max segments drawn on the wheel; larger sets are randomly sampled each spin. */
const WHEEL_MAX_SEGMENTS = 24;
const SPIN_SECONDS = 2.8;
/** The wheel's deceleration curve; also used to time the peg ticks. */
const SPIN_EASE: [number, number, number, number] = [0.17, 0.67, 0.12, 0.99];
const BONUS_CHANCE = 0.2;
const POINTS = 100;

// Stage art (theme-independent).
const STAGE = {
  back: '#2b1650',
  backLight: '#4a2585',
  floor: '#1c0e36',
  bulb: '#ffd23e',
  rim: '#f5f0ff',
  host: '#8b5cf6',
};
const SEGMENT_COLORS = ['#e5484d', '#f5a623', '#30a46c', '#0090ff', '#8e4ec6', '#e54d9a'];

function extractImageSrc(html: string): string | null {
  const match = html.match(/<img[^>]+src="([^"]+)"/);
  return match ? match[1] : null;
}

/** Pick the side to draw on a segment: an image-only side, else any image, else the term text. */
function getDisplaySide(card: Card): { imageSrc: string | null; text: string } {
  const termImg = /<img\s/.test(card.term);
  const defImg = /<img\s/.test(card.definition);
  const termText = stripHtml(card.term);
  const defText = stripHtml(card.definition);
  if (termImg && !termText) return { imageSrc: extractImageSrc(card.term), text: '' };
  if (defImg && !defText) return { imageSrc: extractImageSrc(card.definition), text: '' };
  if (termImg) return { imageSrc: extractImageSrc(card.term), text: termText };
  if (defImg) return { imageSrc: extractImageSrc(card.definition), text: defText };
  return { imageSrc: null, text: termText || defText };
}

function sampleWheelCards(pool: Card[]): Card[] {
  if (pool.length <= WHEEL_MAX_SEGMENTS) return pool;
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, WHEEL_MAX_SEGMENTS);
}

/** Times (ms) at which a segment border passes the pointer during a spin,
 *  found by sampling the same cubic-bezier the wheel animates with. */
function pegTickTimes(fromDeg: number, toDeg: number, segmentDeg: number): number[] {
  const [x1, y1, x2, y2] = SPIN_EASE;
  const bez = (s: number, a: number, b: number) => 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3;
  const times: number[] = [];
  let lastIndex = Math.floor(fromDeg / segmentDeg);
  let lastTime = -Infinity;
  for (let i = 1; i <= 400; i++) {
    const s = i / 400;
    const deg = fromDeg + (toDeg - fromDeg) * bez(s, y1, y2);
    const idx = Math.floor(deg / segmentDeg);
    if (idx !== lastIndex) {
      const t = bez(s, x1, x2) * SPIN_SECONDS * 1000;
      if (t - lastTime > 45) {
        times.push(t);
        lastTime = t;
      }
      lastIndex = idx;
    }
  }
  return times;
}

function SpinnerMode({ cards, setId, exitUrl }: SpinnerModeProps) {
  const navigate = useNavigate();
  const reduce = useReducedMotion() ?? false;
  const exitTo = exitUrl ?? `/sets/${setId}`;
  const exit = useCallback(() => navigate(exitTo), [navigate, exitTo]);
  const clipIdPrefix = useId().replace(/[^a-zA-Z0-9_-]/g, '');

  const [remaining, setRemaining] = useState<Card[]>(() => [...cards]);
  const [wheelCards, setWheelCards] = useState<Card[]>(() => sampleWheelCards(cards));
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [selected, setSelected] = useState<Card | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [bonus, setBonus] = useState(false);
  const [landedIndex, setLandedIndex] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [spins, setSpins] = useState(0);
  const [notYet, setNotYet] = useState(0);
  /** Distinct cards answered "not yet" at least once (not first-try). */
  const [missedCount, setMissedCount] = useState(0);
  const [mood, setMood] = useState<MascotMood>('idle');
  const [best, setBest] = useState<ReturnType<typeof submitScore> | undefined>();
  const { popups, push, remove } = usePopups();

  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const pendingOpen = useRef(false);
  const prevRotation = useRef(0);
  const lastMissedId = useRef<string | null>(null);
  const settleRef = useRef<(() => void) | null>(null);
  /** Cards answered "not yet" at least once — they don't count as first-try. */
  const missedIds = useRef<Set<string>>(new Set());

  const total = cards.length;
  const done = total - remaining.length;
  const finished = remaining.length === 0 && total > 0;

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current.clear();
  }, []);
  const later = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
    return t;
  }, []);
  useEffect(() => clearTimers, [clearTimers]);

  useEffect(() => {
    if (!finished) return;
    playSound('win');
    return celebrate(SEGMENT_COLORS, 1200);
  }, [finished]);

  // Escape closes the card (not the game); outside a card, Escape exits.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (selected) setSelected(null);
      else if (!spinning) exit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, spinning, exit]);

  const spin = useCallback(() => {
    if (spinning || pendingOpen.current || remaining.length === 0) return;
    clearTimers();

    const wheel = sampleWheelCards(remaining);
    setWheelCards(wheel);
    const segment = 360 / wheel.length;

    // The card marked "not yet" last time can't come straight back.
    let candidates = wheel.map((_, i) => i);
    if (remaining.length > 1 && lastMissedId.current) {
      const filtered = candidates.filter((i) => wheel[i].id !== lastMissedId.current);
      if (filtered.length > 0) candidates = filtered;
    }
    lastMissedId.current = null;
    const target = candidates[Math.floor(Math.random() * candidates.length)];
    const landing = 360 - (target * segment + segment / 2);
    const from = prevRotation.current;
    const to = from + (5 + Math.floor(Math.random() * 3)) * 360 + landing + (360 - (from % 360));
    const isBonus = Math.random() < BONUS_CHANCE;

    setLandedIndex(null);
    setSpinning(true);
    setRotation(to);
    setSpins((n) => n + 1);
    setMood('worried');
    prevRotation.current = to;
    playSound('spin');
    if (!reduce) {
      for (const t of pegTickTimes(from, to, segment)) later(() => playSound('tick'), t);
    }

    const settle = () => {
      settleRef.current = null;
      clearTimers();
      setSpinning(false);
      setLandedIndex(target);
      setBonus(isBonus);
      setMood(isBonus ? 'celebrate' : 'happy');
      playSound(isBonus ? 'combo' : 'land');
      pendingOpen.current = true;
      later(() => {
        pendingOpen.current = false;
        setSelected(wheel[target]);
        setRevealed(false);
      }, reduce ? 150 : 600);
    };
    settleRef.current = settle;
    later(settle, reduce ? 300 : SPIN_SECONDS * 1000);
  }, [spinning, remaining, reduce, clearTimers, later]);

  /** Tap the wheel mid-spin to jump straight to the result. */
  const fastForward = useCallback(() => {
    const settle = settleRef.current;
    if (!settle) return;
    setRotation((r) => r + 0.001);
    settle();
  }, []);

  const grade = useCallback(
    (knew: boolean) => {
      if (!selected) return;
      if (knew) {
        const nextStreak = streak + 1;
        const mult = comboMultiplier(nextStreak);
        const points = Math.round(POINTS * mult * (bonus ? 2 : 1));
        if (mult > comboMultiplier(streak)) playSound('combo');
        else playSound('correct');
        push({
          text: `+${points}${bonus ? ' bonus' : mult > 1 ? ` ${formatMultiplier(mult)}` : ''}`,
          color: STAGE.bulb,
          x: 42,
          y: 38,
        });
        const newScore = score + points;
        setScore(newScore);
        setStreak(nextStreak);
        setBestStreak((b) => Math.max(b, nextStreak));
        setMood(nextStreak >= 3 ? 'celebrate' : 'happy');
        const left = remaining.filter((c) => c.id !== selected.id);
        setRemaining(left);
        setWheelCards((w) => w.filter((c) => c.id !== selected.id));
        if (left.length === 0) setBest(submitScore('spinner', setId, newScore));
      } else {
        playSound('wrong');
        if (!missedIds.current.has(selected.id)) {
          missedIds.current.add(selected.id);
          setMissedCount((n) => n + 1);
        }
        lastMissedId.current = selected.id;
        setStreak(0);
        setNotYet((n) => n + 1);
        setMood('sad');
      }
      setSelected(null);
      setLandedIndex(null);
      setBonus(false);
    },
    [selected, streak, bonus, score, remaining, push, setId],
  );

  // Keyboard: Space spins; inside a card, Space/Enter reveals, then 1 = knew it, 2 = not yet.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      // A focused button already handles Space/Enter itself (would double-fire).
      if (t?.tagName === 'BUTTON' && (e.key === ' ' || e.key === 'Enter')) return;
      if (!selected) {
        if (e.key === ' ' && !finished) {
          e.preventDefault();
          spin();
        }
        return;
      }
      if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        setRevealed(true);
        playSound('flip');
      } else if (revealed && e.key === '1') grade(true);
      else if (revealed && e.key === '2') grade(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, revealed, finished, spin, grade]);

  const reset = useCallback(() => {
    clearTimers();
    settleRef.current = null;
    pendingOpen.current = false;
    lastMissedId.current = null;
    missedIds.current = new Set();
    setSpinning(false);
    setRemaining([...cards]);
    setWheelCards(sampleWheelCards(cards));
    setRotation(0);
    prevRotation.current = 0;
    setSelected(null);
    setLandedIndex(null);
    setBonus(false);
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setSpins(0);
    setNotYet(0);
    setMissedCount(0);
    setMood('idle');
    setBest(undefined);
  }, [cards, clearTimers]);

  const segments = useMemo(() => {
    const count = wheelCards.length;
    const segAngle = 360 / count;
    const size = 360;
    const r = 158;
    const c = size / 2;
    return wheelCards.map((card, i) => {
      const a0 = (i * segAngle - 90) * (Math.PI / 180);
      const a1 = ((i + 1) * segAngle - 90) * (Math.PI / 180);
      const path =
        count === 1
          ? `M ${c} ${c - r} A ${r} ${r} 0 1 1 ${c - 0.01} ${c - r} Z`
          : `M ${c} ${c} L ${c + r * Math.cos(a0)} ${c + r * Math.sin(a0)} A ${r} ${r} 0 ${segAngle > 180 ? 1 : 0} 1 ${c + r * Math.cos(a1)} ${c + r * Math.sin(a1)} Z`;
      const mid = ((i + 0.5) * segAngle - 90) * (Math.PI / 180);
      const lx = c + r * 0.62 * Math.cos(mid);
      const ly = c + r * 0.62 * Math.sin(mid);
      const rot = (i + 0.5) * segAngle;
      const display = getDisplaySide(card);
      const imgSize = count <= 4 ? 54 : count <= 8 ? 38 : 26;
      const fontSize = count <= 4 ? 15 : count <= 8 ? 13 : 10;
      const maxChars = count <= 4 ? 22 : count <= 8 ? 16 : 11;
      const text = display.text.length > maxChars ? `${display.text.slice(0, maxChars - 1)}…` : display.text;
      return { card, i, path, lx, ly, rot, display, imgSize, fontSize, text, color: SEGMENT_COLORS[i % SEGMENT_COLORS.length], ax: c + r * Math.cos(a0), ay: c + r * Math.sin(a0) };
    });
  }, [wheelCards]);

  // ===== Finished =====
  if (finished) {
    const firstTry = total - missedCount;
    const rate = total > 0 ? firstTry / total : 0;
    const stars = rate >= 0.9 ? 3 : rate >= 0.7 ? 2 : 1;
    return (
      <div className="relative min-h-[calc(100dvh-8rem)] flex items-center px-4 pt-24 pb-10">
        <ResultsPanel
          mascot={<Mascot mood="celebrate" color={STAGE.host} accessory="headband" size={112} />}
          title="Wheel cleared"
          subtitle={`You knew ${firstTry} of ${total} cards on the first spin.`}
          stars={stars}
          score={score}
          best={best}
          stats={[
            { label: 'Spins', value: spins },
            { label: 'Not yet', value: notYet },
            { label: 'Best streak', value: bestStreak },
          ]}
          actions={
            <>
              <Button variant="primary" onClick={reset}>Play again</Button>
              <Button variant="ghost" onClick={exit}>Exit</Button>
            </>
          }
        />
      </div>
    );
  }

  const bulbs = 24;

  return (
    <div className="max-w-4xl mx-auto px-4 py-4">
      <GameTopBar onExit={exit}>
        <ComboMeter streak={streak} />
        <ScoreCounter value={score} />
      </GameTopBar>

      {/* Stage */}
      <div
        className="relative mt-3 rounded-3xl overflow-hidden px-4 pt-6 pb-6"
        style={{
          background: `radial-gradient(ellipse 60% 55% at 50% 38%, ${STAGE.backLight}, ${STAGE.back} 70%)`,
          boxShadow: '0 16px 40px rgba(0,0,0,0.25)',
        }}
      >
        {/* Progress strip: one light per card */}
        <div className="flex justify-center gap-1 flex-wrap mb-4" aria-label={`${done} of ${total} cards cleared`}>
          {cards.slice(0, 40).map((c, i) => (
            <span
              key={c.id}
              className="block rounded-full transition-colors duration-300"
              style={{
                width: 8,
                height: 8,
                background: i < done ? STAGE.bulb : 'rgba(255,255,255,0.18)',
                boxShadow: i < done ? `0 0 6px ${STAGE.bulb}` : undefined,
              }}
            />
          ))}
        </div>

        <div className="relative flex flex-col items-center">
          {/* Pointer */}
          <motion.svg
            width="38"
            height="30"
            viewBox="0 0 38 30"
            className="relative z-10 -mb-3"
            style={{ transformOrigin: '19px 4px', filter: 'drop-shadow(0 3px 3px rgba(0,0,0,0.4))' }}
            animate={spinning && !reduce ? { rotate: [0, -14, 0] } : { rotate: 0 }}
            transition={spinning && !reduce ? { duration: 0.12, repeat: Infinity } : { duration: 0.2 }}
            aria-hidden
          >
            <path d="M4 2 H34 L19 28 Z" fill={STAGE.bulb} stroke="#b7791f" strokeWidth="2.5" strokeLinejoin="round" />
          </motion.svg>

          <div
            className="relative w-full max-w-[23.75rem] aspect-square"
            onClick={fastForward}
            style={{ cursor: spinning ? 'pointer' : 'default' }}
            title={spinning ? 'Tap to stop the wheel' : undefined}
          >
            {/* Marquee rim with bulbs (static; bulbs chase via CSS while spinning) */}
            <svg viewBox="0 0 400 400" className="absolute inset-0 w-full h-full" aria-hidden>
              <circle cx="200" cy="200" r="194" fill="#6d28d9" stroke={STAGE.rim} strokeWidth="4" />
              {Array.from({ length: bulbs }, (_, i) => {
                const a = (i / bulbs) * Math.PI * 2;
                return (
                  <circle
                    key={i}
                    cx={200 + 182 * Math.cos(a)}
                    cy={200 + 182 * Math.sin(a)}
                    r="5.5"
                    fill={STAGE.bulb}
                    className={spinning && !reduce ? 'sp-bulb-chase' : 'sp-bulb'}
                    style={{ animationDelay: `${(i % 3) * 0.12}s` }}
                  />
                );
              })}
            </svg>

            {/* Wheel */}
            <motion.svg
              viewBox="0 0 360 360"
              className="absolute"
              style={{ inset: '5%', width: '90%', height: '90%', willChange: spinning ? 'transform' : 'auto' }}
              animate={{ rotate: rotation }}
              transition={spinning && !reduce ? { duration: SPIN_SECONDS, ease: SPIN_EASE } : { duration: 0 }}
            >
              {segments.map((s) => {
                const landed = s.i === landedIndex;
                const clipId = `${clipIdPrefix}-seg-${s.i}`;
                return (
                  <g key={s.card.id} style={{ filter: landed ? 'brightness(1.18)' : undefined }}>
                    <path d={s.path} fill={s.color} stroke={STAGE.rim} strokeWidth={landed ? 4 : 2} strokeLinejoin="round" />
                    {s.display.imageSrc ? (
                      <>
                        <defs>
                          <clipPath id={clipId}>
                            <circle cx={s.lx} cy={s.ly} r={s.imgSize / 2} />
                          </clipPath>
                        </defs>
                        <circle cx={s.lx} cy={s.ly} r={s.imgSize / 2 + 2} fill="#fff" />
                        <image
                          href={s.display.imageSrc}
                          x={s.lx - s.imgSize / 2}
                          y={s.ly - s.imgSize / 2}
                          width={s.imgSize}
                          height={s.imgSize}
                          clipPath={`url(#${clipId})`}
                          transform={`rotate(${s.rot}, ${s.lx}, ${s.ly})`}
                          preserveAspectRatio="xMidYMid slice"
                        />
                      </>
                    ) : (
                      <text
                        x={s.lx}
                        y={s.ly}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        // left-half labels flip 180° so no label reads upside-down
                        transform={`rotate(${s.rot > 180 ? s.rot + 90 : s.rot - 90}, ${s.lx}, ${s.ly})`}
                        fill="#fff"
                        stroke="rgba(0,0,0,0.25)"
                        strokeWidth="3"
                        paintOrder="stroke"
                        fontSize={s.fontSize}
                        fontWeight="800"
                        fontFamily="var(--font-display)"
                      >
                        {s.text}
                      </text>
                    )}
                  </g>
                );
              })}
              {/* Pegs at segment borders */}
              {wheelCards.length > 1 &&
                segments.map((s) => <circle key={`peg-${s.i}`} cx={s.ax} cy={s.ay} r="4" fill={STAGE.rim} stroke="#b7791f" strokeWidth="1.5" />)}
              <circle cx="180" cy="180" r="30" fill={STAGE.rim} stroke={STAGE.bulb} strokeWidth="6" />
              <circle cx="180" cy="180" r="11" fill="#6d28d9" />
            </motion.svg>

            <ScorePopups popups={popups} onDone={remove} />
          </div>

          {/* Host */}
          <div className="absolute left-0 bottom-0 hidden sm:block" aria-hidden>
            <Mascot mood={mood} color={STAGE.host} accessory="headband" size={88} />
          </div>

          <motion.button
            onClick={spin}
            disabled={spinning}
            whileHover={spinning || reduce ? undefined : { y: -2 }}
            whileTap={spinning || reduce ? undefined : { y: 3 }}
            className="mt-5 h-14 min-w-[12.5rem] px-8 rounded-2xl text-2xl font-extrabold cursor-pointer disabled:cursor-default focus-visible:outline-3 focus-visible:outline-offset-2"
            style={{
              background: spinning ? 'rgba(255,255,255,0.15)' : STAGE.bulb,
              color: spinning ? 'rgba(255,255,255,0.7)' : '#3d2600',
              border: 'none',
              boxShadow: spinning ? 'none' : 'inset 0 -6px 0 #d99a0b, 0 10px 24px rgba(255,210,62,0.3)',
              fontFamily: 'var(--font-display)',
              outlineColor: STAGE.bulb,
            }}
          >
            {spinning ? 'Spinning…' : 'Spin'}
          </motion.button>
          <p className="mt-2 text-xs" style={{ color: 'rgba(255,255,255,0.65)' }}>
            {remaining.length} {remaining.length === 1 ? 'card' : 'cards'} left
            {wheelCards.length < remaining.length ? `, ${wheelCards.length} on the wheel` : ''}
            <span className="hidden md:inline">. Space to spin.</span>
          </p>
        </div>
      </div>

      {/* Card */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(20,8,40,0.6)', backdropFilter: 'blur(3px)' }}
            onClick={() => setSelected(null)}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Spun card"
              initial={reduce ? { opacity: 0 } : { scale: 0.6, rotate: -6, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              exit={reduce ? { opacity: 0 } : { scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 22 }}
              className="relative w-full max-w-md rounded-3xl overflow-hidden"
              style={{ background: 'var(--color-surface)', boxShadow: '0 30px 70px rgba(0,0,0,0.45)' }}
              onClick={(e) => e.stopPropagation()}
            >
              {bonus && (
                <div
                  className="flex items-center justify-center gap-2 py-2 font-extrabold"
                  style={{ background: STAGE.bulb, color: '#3d2600', fontFamily: 'var(--font-display)' }}
                >
                  <Sparkles size={18} /> Bonus spin: double points
                </div>
              )}
              <div className="p-6 text-center">
                <p className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                  {revealed ? 'Did you know it?' : 'Say the answer in your head, then reveal'}
                </p>
                <StudyContent html={selected.term} className="text-2xl font-bold" />
                <AnimatePresence initial={false}>
                  {revealed && (
                    <motion.div
                      initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="overflow-hidden"
                    >
                      <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
                        <StudyContent html={selected.definition} className="text-lg" />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="p-4 pt-0 flex gap-2">
                {!revealed ? (
                  <button
                    autoFocus
                    onClick={() => {
                      setRevealed(true);
                      playSound('flip');
                    }}
                    className="flex-1 flex items-center justify-center gap-2 h-14 rounded-2xl text-lg font-extrabold cursor-pointer focus-visible:outline-3 focus-visible:outline-offset-2"
                    style={{ background: STAGE.host, color: '#fff', border: 'none', boxShadow: 'inset 0 -5px 0 #6d28d9', fontFamily: 'var(--font-display)', outlineColor: STAGE.host }}
                  >
                    <Eye size={20} /> Reveal
                  </button>
                ) : (
                  <>
                    <button
                      autoFocus
                      onClick={() => grade(true)}
                      className="flex-1 h-14 rounded-2xl text-lg font-extrabold cursor-pointer focus-visible:outline-3 focus-visible:outline-offset-2"
                      style={{ background: '#23875a', color: '#fff', border: 'none', boxShadow: 'inset 0 -5px 0 #17623f', fontFamily: 'var(--font-display)', outlineColor: '#23875a' }}
                    >
                      I knew it
                    </button>
                    <button
                      onClick={() => grade(false)}
                      className="flex-1 flex items-center justify-center gap-2 h-14 rounded-2xl text-lg font-extrabold cursor-pointer focus-visible:outline-3 focus-visible:outline-offset-2"
                      style={{ background: 'var(--color-muted)', color: 'var(--color-text)', border: 'none', boxShadow: 'inset 0 -5px 0 var(--color-border)', fontFamily: 'var(--font-display)', outlineColor: 'var(--color-primary)' }}
                    >
                      <RotateCcw size={18} /> Not yet
                    </button>
                  </>
                )}
              </div>
              {revealed && (
                <p className="hidden md:block text-center text-xs pb-3" style={{ color: 'var(--color-text-tertiary)' }}>
                  Keys 1 and 2 answer
                </p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default SpinnerMode;
