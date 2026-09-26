import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Shield } from 'lucide-react';
import type { AnswerDirection, Card } from '@/types';
import type { ModeProps } from '@/components/modes/registry';
import { fairRepeatCards, isImageOnly, stripHtml } from '@/lib/utils';
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
  Countdown,
  EscBanner,
  GameTopBar,
  PlayButton,
  ResultsPanel,
  ScoreCounter,
  SetupSection,
} from '@/components/games/GameKit';
import { celebrate, comboMultiplier, formatMultiplier, useEscToQuit, usePopups } from '@/components/games/gameLogic';
import './MeteorDefenseMode.css';

// ============================================================
// Meteor Defense — meteors carrying a prompt fall on a night city.
// Type the answer and press Enter: the lowest meteor it matches is
// blasted by the laser. A meteor that lands costs a shield and shows
// its answer so the player learns it, then comes back later.
// ============================================================

const GAME_ID = 'meteor-defense';

// Scene art — fixed colors, independent of the app theme.
const ART = {
  skyTop: '#070b24',
  skyMid: '#151d4d',
  skyLow: '#33285f',
  star: '#e9ecff',
  cityFar: '#1d2352',
  cityNear: '#0d1230',
  window: '#ffd66b',
  shield: '#5fd4ff',
  laser: '#7dfcff',
  rock: '#7a5543',
  rockDark: '#4b3127',
  rockLight: '#9c745f',
  accent: '#ff7a3a',
  accentEdge: '#c24f1c',
};

const LIVES = 3;
/** Vertical position (% of scene height) where meteors strike the city. */
const GROUND = 80;
const START_Y = -6;
/** Three lanes keep labels apart even at phone width. */
const LANES = [17, 50, 83];
const TURRET_Y = 90;

type Difficulty = 'easy' | 'medium' | 'hard';
type Length = 'short' | 'standard' | 'twice';

const DIFFICULTY: Record<Difficulty, { fallMs: number; gapMs: number; maxOnScreen: number; mult: number }> = {
  easy: { fallMs: 20000, gapMs: 5200, maxOnScreen: 2, mult: 1 },
  medium: { fallMs: 15000, gapMs: 4000, maxOnScreen: 2, mult: 1.5 },
  hard: { fallMs: 11000, gapMs: 3000, maxOnScreen: 3, mult: 2 },
};

interface Config {
  difficulty: Difficulty;
  direction: AnswerDirection;
  length: Length;
}

interface Target {
  key: string;
  promptHtml: string;
  /** Truncated plain text for the meteor label ('' when image-only). */
  promptText: string;
  promptImage: boolean;
  answers: string[];
  answerText: string;
}

type MeteorState = 'falling' | 'blasted' | 'landed';

interface Meteor {
  id: number;
  target: Target;
  x: number;
  /** Fall progress 0..1. */
  t: number;
  duration: number;
  state: MeteorState;
  /** Game-clock time after which a finished meteor is removed. */
  doneAt: number;
}

interface Run {
  meteors: Meteor[];
  waves: Target[][];
  wave: number;
  queue: Target[];
  clock: number;
  lastSpawn: number;
  breakUntil: number;
  lives: number;
  streak: number;
  blasted: number;
  landed: number;
  typedWrong: number;
  over: boolean;
  nextId: number;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function buildTargets(cards: Card[], groups: Map<string, Card[]>, direction: AnswerDirection): Target[] {
  const out: Target[] = [];
  const add = (card: Card, answerSide: 'term' | 'definition') => {
    const promptHtml = answerSide === 'definition' ? card.term : card.definition;
    const answerHtml = answerSide === 'definition' ? card.definition : card.term;
    const answerText = stripHtml(answerHtml);
    if (!answerText) return; // image-only answers can't be typed
    const promptText = stripHtml(promptHtml);
    const promptImage = !promptText && isImageOnly(promptHtml);
    if (!promptText && !promptImage) return;
    const answers = getEquivalentAnswers(card, answerSide, groups).filter((a) => stripHtml(a));
    out.push({
      key: `${card.id}-${answerSide}`,
      promptHtml,
      promptText: truncate(promptText, 48),
      promptImage,
      answers: answers.length > 0 ? answers : [answerHtml],
      answerText,
    });
  };
  for (const card of cards) {
    if (direction === 'term-to-def' || direction === 'both') add(card, 'definition');
    if (direction === 'def-to-term' || direction === 'both') add(card, 'term');
  }
  return out;
}

function totalFor(length: Length, poolSize: number): number {
  if (length === 'short') return 15;
  if (length === 'standard') return 30;
  return Math.min(80, Math.max(10, poolSize * 2));
}

/** Split the run into waves that grow by one meteor each: 4, 5, 6 … 10. */
function buildWaves(pool: Target[], total: number): Target[][] {
  const all = fairRepeatCards(pool, total);
  const waves: Target[][] = [];
  let size = 4;
  let i = 0;
  while (i < all.length) {
    waves.push(all.slice(i, i + size));
    i += size;
    size = Math.min(10, size + 1);
  }
  return waves;
}

function newRun(waves: Target[][]): Run {
  return {
    meteors: [],
    waves,
    wave: 0,
    queue: [...(waves[0] ?? [])],
    clock: 0,
    lastSpawn: -10000,
    breakUntil: 0,
    lives: LIVES,
    streak: 0,
    blasted: 0,
    landed: 0,
    typedWrong: 0,
    over: false,
    nextId: 1,
  };
}

function meteorY(t: number): number {
  return START_Y + t * (GROUND - START_Y);
}

// Deterministic star field and skyline (computed once, not during render).
function seeded(i: number, n: number): number {
  const v = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453;
  return v - Math.floor(v);
}
const STARS = Array.from({ length: 46 }, (_, i) => ({
  x: seeded(i, 1) * 100,
  y: seeded(i, 2) * 70,
  r: 0.6 + seeded(i, 3) * 1.1,
  o: 0.35 + seeded(i, 4) * 0.6,
}));
const BUILDINGS = Array.from({ length: 16 }, (_, i) => {
  const w = 18 + Math.round(seeded(i, 5) * 14);
  const h = 34 + Math.round(seeded(i, 6) * 46);
  return { i, w, h };
});
const SKYLINE = (() => {
  let x = 0;
  return BUILDINGS.map((b) => {
    const r = { ...b, x };
    x += b.w + 2;
    return r;
  }).filter((b) => b.x < 400);
})();

// ---------- Scene pieces ----------

function SceneSky({ children, height }: { children?: ReactNode; height: string | number }) {
  return (
    <div
      className="relative overflow-hidden select-none"
      style={{ height, background: `linear-gradient(180deg, ${ART.skyTop} 0%, ${ART.skyMid} 55%, ${ART.skyLow} 100%)` }}
    >
      <svg aria-hidden className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
        {STARS.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r * 0.25} fill={ART.star} opacity={s.o} />
        ))}
      </svg>
      {/* moon */}
      <svg aria-hidden className="absolute" style={{ right: '8%', top: '8%' }} width="34" height="34" viewBox="0 0 34 34">
        <circle cx="17" cy="17" r="14" fill="#f3efd9" />
        <circle cx="23" cy="12" r="13" fill={ART.skyTop} opacity="0.92" />
      </svg>
      {children}
    </div>
  );
}

function City({ lives, hitKey }: { lives: number; hitKey: number }) {
  const shieldOpacity = lives >= 3 ? 0.75 : lives === 2 ? 0.5 : lives === 1 ? 0.28 : 0;
  return (
    <>
      <svg
        aria-hidden
        className="absolute left-0 w-full"
        style={{ top: `${GROUND - 12}%`, height: `${100 - GROUND + 12}%` }}
        viewBox="0 0 400 100"
        preserveAspectRatio="none"
      >
        {/* shield dome */}
        <path
          key={hitKey}
          className={hitKey > 0 ? 'md-shield-hit' : undefined}
          d="M-10 100 Q200 -6 410 100"
          fill={ART.shield}
          fillOpacity={shieldOpacity * 0.12}
          stroke={ART.shield}
          strokeOpacity={shieldOpacity}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
        {SKYLINE.map((b) => (
          <rect key={`f${b.i}`} x={b.x + 6} y={100 - b.h * 0.9} width={b.w} height={b.h} fill={ART.cityFar} />
        ))}
        {SKYLINE.map((b) => {
          const h = b.h * 0.72;
          const y = 100 - h;
          const windows: ReactNode[] = [];
          for (let row = 0; row * 7 + 6 < h - 4; row++) {
            for (let col = 0; col * 6 + 5 < b.w - 3; col++) {
              if (seeded(b.i * 31 + row * 7 + col, 9) > 0.55) {
                windows.push(
                  <rect key={`${row}-${col}`} x={b.x + 4 + col * 6} y={y + 5 + row * 7} width="2.6" height="3.2" fill={ART.window} opacity="0.85" />,
                );
              }
            }
          }
          return (
            <g key={`n${b.i}`}>
              <rect x={b.x} y={y} width={b.w} height={h} fill={ART.cityNear} />
              {windows}
            </g>
          );
        })}
      </svg>
      {/* turret */}
      <svg aria-hidden className="absolute" style={{ left: '50%', top: `${TURRET_Y}%`, transform: 'translate(-50%, -30%)' }} width="44" height="36" viewBox="0 0 44 36">
        <rect x="19" y="0" width="6" height="16" rx="2" fill="#b9c4ff" />
        <path d="M6 36 L6 22 Q22 8 38 22 L38 36 Z" fill="#3b4686" />
        <circle cx="22" cy="22" r="4" fill={ART.laser} />
      </svg>
    </>
  );
}

function MeteorView({ m }: { m: Meteor }) {
  const y = meteorY(m.t);
  const danger = m.state === 'falling' && m.t > 0.72;
  return (
    <div className="md-meteor" style={{ left: `${m.x}%`, top: `${y}%` }}>
      <div className="md-rock">
        {m.state === 'falling' && (
          <>
            <div className="md-tail" />
            <svg width="40" height="40" viewBox="0 0 40 40">
              <path d="M20 3 L33 9 L37 22 L30 34 L16 37 L5 29 L4 14 Z" fill={ART.rock} stroke={ART.rockDark} strokeWidth="2" />
              <circle cx="15" cy="16" r="4" fill={ART.rockDark} />
              <circle cx="26" cy="26" r="3" fill={ART.rockDark} />
              <path d="M12 8 L22 6" stroke={ART.rockLight} strokeWidth="2" strokeLinecap="round" />
            </svg>
          </>
        )}
        {m.state === 'blasted' && (
          <>
            <div className="md-boom" />
            {[
              [-34, -26],
              [30, -30],
              [-26, 24],
              [34, 18],
              [2, -40],
            ].map(([dx, dy], i) => (
              <span key={i} className="md-shard" style={{ ['--dx' as string]: `${dx}px`, ['--dy' as string]: `${dy}px` }} />
            ))}
          </>
        )}
      </div>
      {m.state !== 'landed' && (
        <div className={`md-label${danger ? ' md-danger' : ''}${m.state === 'blasted' ? ' md-fade' : ''}`}>
          {m.target.promptImage ? <StudyContent html={m.target.promptHtml} className="md-thumb" /> : m.target.promptText}
        </div>
      )}
    </div>
  );
}

// ---------- Setup ----------

function SetupScreen({
  onStart,
  cards,
  groups,
  onExit,
}: {
  onStart: (c: Config) => void;
  cards: Card[];
  groups: Map<string, Card[]>;
  onExit: () => void;
}) {
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [direction, setDirection] = useState<AnswerDirection>('term-to-def');
  const [length, setLength] = useState<Length>('standard');
  const pool = useMemo(() => buildTargets(cards, groups, direction), [cards, groups, direction]);
  const anyUsable = useMemo(() => buildTargets(cards, groups, 'both').length > 0, [cards, groups]);

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <div className="rounded-3xl overflow-hidden" style={{ boxShadow: '0 20px 50px rgba(0,0,0,0.18)' }}>
        <SceneSky height={160}>
          <City lives={3} hitKey={0} />
          <div className="absolute inset-0 flex items-start gap-3 p-5">
            <div className="text-left">
              <h2 className="text-3xl font-extrabold" style={{ color: '#fff', fontFamily: 'var(--font-display)' }}>
                Meteor Defense
              </h2>
              <p className="text-sm font-semibold max-w-[22rem]" style={{ color: '#c9d2ff' }}>
                Type the answer to a falling meteor to blast it before it hits the city.
              </p>
            </div>
          </div>
        </SceneSky>
        <div className="p-6 flex flex-col gap-6" style={{ background: 'var(--color-surface)' }}>
          {!anyUsable ? (
            <div className="text-center">
              <p className="font-semibold" style={{ color: 'var(--color-text)' }}>
                This set needs cards with typed text to play Meteor Defense.
              </p>
              <Button variant="primary" className="mt-4" onClick={onExit}>
                Exit
              </Button>
            </div>
          ) : (
            <>
              <SetupSection label="Speed">
                <ChoicePills
                  options={[
                    { value: 'easy', label: 'Slow' },
                    { value: 'medium', label: 'Steady ×1.5' },
                    { value: 'hard', label: 'Fast ×2' },
                  ]}
                  isSelected={(v) => v === difficulty}
                  onToggle={setDifficulty}
                  accent={ART.accent}
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
                  accent={ART.accent}
                />
              </SetupSection>
              <SetupSection label="Length">
                <ChoicePills
                  options={[
                    { value: 'short', label: '15 meteors' },
                    { value: 'standard', label: '30 meteors' },
                    { value: 'twice', label: `Every card twice (${totalFor('twice', pool.length)})` },
                  ]}
                  isSelected={(v) => v === length}
                  onToggle={setLength}
                  accent={ART.accent}
                />
              </SetupSection>
              {pool.length === 0 ? (
                <p className="text-sm font-semibold" style={{ color: 'var(--color-danger)' }}>
                  No cards have typed text on that side. Try another answer option.
                </p>
              ) : (
                <PlayButton color={ART.accent} onClick={() => onStart({ difficulty, direction, length })}>
                  Defend the city
                </PlayButton>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Game ----------

interface Result {
  won: boolean;
  score: number;
  lives: number;
  blasted: number;
  landed: number;
  typedWrong: number;
  bestStreak: number;
  wave: number;
  waves: number;
  best: ReturnType<typeof submitScore>;
}

export default function MeteorDefenseMode({ cards, setId, exitUrl }: ModeProps) {
  const navigate = useNavigate();
  const reduce = !!useReducedMotion();
  const shake = useAnimationControls();
  const exitTo = exitUrl ?? `/sets/${setId}`;
  const exit = useCallback(() => navigate(exitTo), [navigate, exitTo]);
  const groups = useMemo(() => buildEquivalenceGroups(cards), [cards]);

  const [phase, setPhase] = useState<'config' | 'countdown' | 'game' | 'over'>('config');
  const [config, setConfig] = useState<Config | null>(null);
  const [meteors, setMeteors] = useState<Meteor[]>([]);
  const [impacts, setImpacts] = useState<{ id: number; x: number }[]>([]);
  const [lives, setLives] = useState(LIVES);
  const [wave, setWave] = useState(0);
  const [waveCount, setWaveCount] = useState(0);
  const [banner, setBanner] = useState<string | null>(null);
  const [missed, setMissed] = useState<{ id: number; prompt: Target } | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [hitKey, setHitKey] = useState(0);
  const [text, setText] = useState('');
  const [wrongFlash, setWrongFlash] = useState(false);
  const inputShake = useAnimationControls();
  const [result, setResult] = useState<Result | null>(null);
  const { popups, push, remove } = usePopups();

  const runRef = useRef<Run>(newRun([]));
  const scoreRef = useRef(0);
  const bestStreakRef = useRef(0);
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
  const escArmed = useEscToQuit(phase !== 'config', playing || phase === 'countdown', exit);

  const start = useCallback(
    (cfg: Config) => {
      clearTimers();
      const pool = buildTargets(cards, groups, cfg.direction);
      const waves = buildWaves(pool, totalFor(cfg.length, pool.length));
      runRef.current = newRun(waves);
      scoreRef.current = 0;
      bestStreakRef.current = 0;
      setConfig(cfg);
      setMeteors([]);
      setImpacts([]);
      setLives(LIVES);
      setWave(0);
      setWaveCount(waves.length);
      setBanner(null);
      setMissed(null);
      setScore(0);
      setStreak(0);
      setHitKey(0);
      setText('');
      setResult(null);
      setPhase('countdown');
    },
    [cards, groups, clearTimers],
  );

  // The game loop: advances meteors on a game clock that stops while the
  // tab is hidden (rAF pauses and each frame's step is capped).
  useEffect(() => {
    if (phase !== 'game' || !config) return;
    const settings = DIFFICULTY[config.difficulty];
    let raf = 0;
    let last = performance.now();

    const endGame = (won: boolean) => {
      const g = runRef.current;
      const variant = `${config.difficulty}-${config.direction}-${config.length}`;
      const best = submitScore(GAME_ID, setId, scoreRef.current, variant);
      playSound(won ? 'win' : 'lose');
      setResult({
        won,
        score: scoreRef.current,
        lives: g.lives,
        blasted: g.blasted,
        landed: g.landed,
        typedWrong: g.typedWrong,
        bestStreak: bestStreakRef.current,
        wave: g.wave + 1,
        waves: g.waves.length,
        best,
      });
      setPhase('over');
    };

    const tick = (dt: number) => {
      const g = runRef.current;
      g.clock += dt;
      const speed = Math.pow(0.92, g.wave) * Math.max(0.8, 1 - g.streak * 0.02);

      for (const m of g.meteors) {
        if (m.state !== 'falling') continue;
        m.t += dt / m.duration;
        if (m.t >= 1) {
          m.t = 1;
          m.state = 'landed';
          m.doneAt = g.clock + 300;
          g.lives -= 1;
          g.landed += 1;
          g.streak = 0;
          // Bring the card back later in this wave so it gets practiced.
          g.queue.splice(Math.min(2, g.queue.length), 0, m.target);
          playSound('crumble');
          setLives(g.lives);
          setStreak(0);
          setHitKey((k) => k + 1);
          const impactId = m.id;
          setImpacts((list) => [...list, { id: impactId, x: m.x }]);
          later(() => setImpacts((list) => list.filter((i) => i.id !== impactId)), 800);
          setMissed({ id: m.id, prompt: m.target });
          later(() => setMissed((cur) => (cur && cur.id === impactId ? null : cur)), 3200);
          if (!reduce) void shake.start({ x: [0, -9, 9, -5, 5, 0], transition: { duration: 0.4 } });
          if (g.lives <= 0 && !g.over) {
            g.over = true;
            later(() => endGame(false), 1500);
          }
        }
      }

      g.meteors = g.meteors.filter((m) => m.state === 'falling' || g.clock < m.doneAt);
      if (g.over) return;

      const falling = g.meteors.filter((m) => m.state === 'falling');
      if (g.clock >= g.breakUntil) {
        const cap = Math.min(settings.maxOnScreen, 1 + Math.floor(g.wave / 2));
        const gap = settings.gapMs * Math.pow(0.93, g.wave);
        const since = g.clock - g.lastSpawn;
        const ready = falling.length === 0 ? since >= 700 : since >= gap;
        if (g.queue.length > 0 && falling.length < cap && ready) {
          const free = LANES.filter((x) => !falling.some((m) => m.x === x));
          if (free.length > 0) {
            const target = g.queue.shift()!;
            // Longer answers take longer to type, so they fall a little slower.
            const typingBonus = Math.min(9000, target.answerText.length * 110);
            g.meteors.push({
              id: g.nextId++,
              target,
              x: free[Math.floor(Math.random() * free.length)],
              t: 0,
              duration: settings.fallMs * speed + typingBonus,
              state: 'falling',
              doneAt: 0,
            });
            g.lastSpawn = g.clock;
          }
        }

        if (g.queue.length === 0 && g.meteors.length === 0) {
          if (g.wave + 1 >= g.waves.length) {
            g.over = true;
            later(() => endGame(true), 600);
          } else {
            g.wave += 1;
            g.queue = [...g.waves[g.wave]];
            g.breakUntil = g.clock + 1900;
            g.lastSpawn = g.clock;
            playSound('boost');
            setWave(g.wave);
            setBanner(`Wave ${g.wave + 1}`);
            later(() => setBanner(null), 1700);
          }
        }
      }
    };

    const step = (now: number) => {
      const dt = Math.min(now - last, 100);
      last = now;
      if (!document.hidden && !runRef.current.over) tick(dt);
      setMeteors(runRef.current.meteors.map((m) => ({ ...m })));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [phase, config, setId, later, reduce, shake]);

  useEffect(() => {
    if (phase === 'game') inputRef.current?.focus();
  }, [phase]);

  useEffect(() => {
    if (phase === 'over' && result?.won && result.lives >= 2) {
      return celebrate([ART.laser, ART.window, ART.accent, '#ffffff']);
    }
  }, [phase, result]);

  const fire = (e: FormEvent) => {
    e.preventDefault();
    const g = runRef.current;
    if (!playing || g.over || !text.trim() || !config) return;
    const candidates = g.meteors.filter((m) => m.state === 'falling').sort((a, b) => b.t - a.t);
    const hit = candidates.find((m) => gradeWrittenAnswer(text, m.target.answers));
    if (!hit) {
      g.streak = 0;
      g.typedWrong += 1;
      setStreak(0);
      setWrongFlash(true);
      later(() => setWrongFlash(false), 500);
      if (!reduce) void inputShake.start({ x: [0, -8, 7, -4, 0], transition: { duration: 0.32 } });
      playSound('wrong');
      inputRef.current?.select();
      return;
    }
    hit.state = 'blasted';
    hit.doneAt = g.clock + 650;
    g.blasted += 1;
    const prevMult = comboMultiplier(g.streak);
    g.streak += 1;
    bestStreakRef.current = Math.max(bestStreakRef.current, g.streak);
    const mult = comboMultiplier(g.streak);
    const heightBonus = Math.round(100 * (1 - hit.t));
    const points = Math.round((100 + heightBonus) * mult * DIFFICULTY[config.difficulty].mult);
    scoreRef.current += points;
    setScore(scoreRef.current);
    setStreak(g.streak);
    setText('');
    playSound('correct');
    const y = meteorY(hit.t);
    push({ text: `+${points}`, color: '#ffe27a', x: Math.min(78, Math.max(4, hit.x - 6)), y: Math.max(4, y - 10) });
    if (mult > prevMult) {
      playSound('combo');
      push({ text: `${formatMultiplier(mult)} combo`, color: '#ff9f6b', x: 36, y: 30 });
    }
  };

  if (phase === 'config') {
    return <SetupScreen onStart={start} cards={cards} groups={groups} onExit={exit} />;
  }

  if (phase === 'over' && result) {
    const faced = result.blasted + result.landed;
    const accuracy = faced > 0 ? Math.round((result.blasted / faced) * 100) : 0;
    const stars = result.won ? Math.max(1, Math.min(3, result.lives)) : 0;
    return (
      <div className="relative min-h-[calc(100dvh-8rem)] flex items-center px-4 pt-24 pb-10">
        <ResultsPanel
          mascot={<Mascot mood={result.won ? 'celebrate' : 'sad'} color={ART.shield} accessory="helmet" size={112} />}
          title={result.won ? 'City saved' : 'The shields fell'}
          subtitle={
            result.won
              ? result.lives === LIVES
                ? 'Not a single meteor got through.'
                : `${result.lives} of ${LIVES} shields still standing.`
              : `You held out until wave ${result.wave} of ${result.waves}.`
          }
          stars={stars}
          score={result.score}
          best={result.best}
          stats={[
            { label: 'Blasted', value: result.blasted },
            { label: 'Landed', value: result.landed },
            { label: 'Accuracy', value: `${accuracy}%` },
            { label: 'Best streak', value: result.bestStreak },
          ]}
          actions={
            <>
              <Button variant="primary" onClick={() => config && start(config)}>
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

  const blasting = meteors.filter((m) => m.state === 'blasted');

  return (
    <div className="max-w-4xl mx-auto px-4 py-4">
      <EscBanner show={escArmed} />
      {phase === 'countdown' && <Countdown accent={ART.laser} onDone={() => setPhase('game')} />}

      <GameTopBar onExit={exit}>
        <div
          className="flex items-center gap-1 h-10 px-3 rounded-xl"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          aria-label={`${lives} of ${LIVES} shields left`}
          role="img"
        >
          {Array.from({ length: LIVES }, (_, i) => (
            <Shield
              key={i}
              size={18}
              strokeWidth={2.5}
              fill={i < lives ? ART.shield : 'transparent'}
              color={i < lives ? '#1f8fb8' : 'var(--color-text-tertiary)'}
            />
          ))}
        </div>
        <ComboMeter streak={streak} />
        <ScoreCounter value={score} />
      </GameTopBar>

      <motion.div
        animate={shake}
        className="relative mt-3 rounded-3xl overflow-hidden"
        style={{ boxShadow: '0 16px 40px rgba(0,0,0,0.22)' }}
      >
        <SceneSky height="clamp(300px, 60dvh, 540px)">
          <div className="absolute inset-0">
            <City lives={lives} hitKey={hitKey} />

            <svg aria-hidden className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ zIndex: 3 }}>
              {blasting.map((m) => (
                <line
                  key={m.id}
                  className="md-laser"
                  x1={50}
                  y1={TURRET_Y}
                  x2={m.x}
                  y2={meteorY(m.t)}
                  stroke={ART.laser}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>

            {meteors.map((m) => (
              <MeteorView key={m.id} m={m} />
            ))}

            {impacts.map((imp) => (
              <div key={imp.id} className="md-impact" style={{ left: `${imp.x}%`, top: `${GROUND + 2}%` }} />
            ))}

            <ScorePopups popups={popups} onDone={remove} />

            <div
              className="absolute top-3 left-3 px-2.5 py-1 rounded-lg text-sm font-extrabold tabular-nums"
              style={{ background: 'rgba(255,255,255,0.12)', color: '#e6e9ff', fontFamily: 'var(--font-display)', zIndex: 6 }}
            >
              Wave {wave + 1} of {Math.max(1, waveCount)}
            </div>

            <AnimatePresence>
              {banner && (
                <motion.div
                  key={banner}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-x-0 flex justify-center pointer-events-none"
                  style={{ top: '34%', zIndex: 7 }}
                >
                  <span
                    className="text-5xl font-extrabold"
                    style={{ color: '#fff', fontFamily: 'var(--font-display)', textShadow: '0 4px 0 rgba(0,0,0,0.35)' }}
                  >
                    {banner}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="absolute inset-x-3 flex justify-center pointer-events-none" style={{ top: 44, zIndex: 8 }} role="status" aria-live="polite">
              <AnimatePresence>
                {missed && (
                  <motion.div
                    key={missed.id}
                    initial={reduce ? { opacity: 0 } : { opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="max-w-md w-full rounded-2xl px-4 py-2.5"
                    style={{ background: 'rgba(255,245,235,0.96)', color: '#2a1a14', boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }}
                  >
                    <p className="text-xs font-bold" style={{ color: '#b2361f' }}>
                      That one hit the city. The answer was
                    </p>
                    <p className="font-extrabold leading-snug" style={{ fontFamily: 'var(--font-display)' }}>
                      {truncate(missed.prompt.answerText, 140)}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </SceneSky>
      </motion.div>

      <form onSubmit={fire} className="mt-3 flex gap-2">
        <motion.div animate={inputShake} className="flex-1 min-w-0 flex">
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={!playing}
          placeholder="Type an answer, then Enter"
          aria-label="Answer for a falling meteor"
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
        </motion.div>
        <button
          type="submit"
          disabled={!playing || !text.trim()}
          className="h-14 px-5 rounded-2xl font-extrabold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-3 focus-visible:outline-offset-2"
          style={{
            background: ART.accent,
            color: '#fff',
            border: 'none',
            boxShadow: `inset 0 -5px 0 ${ART.accentEdge}`,
            fontFamily: 'var(--font-display)',
            outlineColor: ART.accent,
          }}
        >
          Fire
        </button>
      </form>
      <p className="mt-2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
        Your answer hits the lowest meteor it matches.
      </p>
    </div>
  );
}
