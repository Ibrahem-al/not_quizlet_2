import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import type { Card } from '@/types';
import type { ModeProps } from '@/components/modes/registry';
import {
  fairRepeatCards,
  hasDefinitionContent,
  hasTermContent,
  normalizeAnswer,
  shuffleArray,
  stripHtml,
} from '@/lib/utils';
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
import './FishingPondMode.css';

// ============================================================
// Fishing Pond — the prompt hangs from your hook; fish carrying
// answers swim below. Tap the fish with the matching answer to
// reel it in. Leave it too long and the right fish swims away.
// ============================================================

const GAME_ID = 'fishing-pond';

// Scene art: fixed so the pond reads the same in both themes.
const ART = {
  skyTop: '#9fd8ef',
  skyBottom: '#e4f5fb',
  wood: '#b27a45',
  woodDark: '#7a4b24',
  woodLight: '#cf975f',
  rod: '#5a3517',
  line: '#20303a',
  waterTop: '#3fb0c8',
  waterMid: '#1b7c9c',
  waterBottom: '#0d4260',
  reed: '#3f7d3a',
  reedLight: '#5fa352',
  lily: '#4f9d4a',
  pebble: '#0a354d',
  tag: '#fff8e6',
  tagEdge: '#e2d3ad',
  ink: '#1d2b33',
  gold: '#ffc83d',
  goldEdge: '#c98a00',
  mascot: '#4fb3a4',
};

const FISH_COLORS = ['#ff7a59', '#9b6bff', '#ff5c8a', '#4f8cff', '#2fb98e'];

/** Half the fish element's width, in px (see .fp-fish). */
const HALF = 66;
/** The label chip (max 9.375rem, see .fp-chip) can outgrow the fish box as the text size goes up; widen the edge limit by the overflow past its 150px base. */
function edgeHalf(): number {
  const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  return HALF + Math.max(0, 9.375 * rootPx - 150) / 2;
}
/** After this much swimming time the right fish stops turning and heads off. */
const ESCAPE_MS = 12_000;
const GOLDEN_CHANCE = 1 / 6;
const LABEL_MAX = 38;

type PromptSide = 'term' | 'definition';
type RoundsOpt = '10' | 'all';

interface FishSpec {
  id: string;
  html: string;
  label: string;
  imageOnly: boolean;
  correct: boolean;
  lane: number;
  /** Start position as a share of the swim range. */
  x0: number;
  dir: 1 | -1;
  /** px per second */
  speed: number;
  bob: number;
  color: string;
}

interface Round {
  id: number;
  promptHtml: string;
  answerHtml: string;
  answerLabel: string;
  golden: boolean;
  fish: FishSpec[];
}

interface CatchEntry {
  id: number;
  promptHtml: string;
  answerHtml: string;
  golden: boolean;
  color: string;
  points: number;
}

type Status = 'swim' | 'casting' | 'caught' | 'wrong' | 'missed';

interface Config {
  side: PromptSide;
  rounds: RoundsOpt;
  fishCount: 3 | 4 | 5;
}

interface Cast {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function labelFor(html: string): { label: string; imageOnly: boolean } {
  const text = stripHtml(html).replace(/\s+/g, ' ');
  return { label: truncate(text, LABEL_MAX), imageOnly: !text && /<img/i.test(html) };
}

/** Build every round up front (randomness lives here, in the start handler). */
function buildRounds(cards: Card[], groups: Map<string, Card[]>, config: Config): Round[] {
  const promptOk = config.side === 'term' ? hasTermContent : hasDefinitionContent;
  const answerOk = config.side === 'term' ? hasDefinitionContent : hasTermContent;
  const answerSide: PromptSide = config.side === 'term' ? 'definition' : 'term';

  const eligible = cards
    .filter((c) => promptOk(c) && answerOk(c))
    .map((card) => {
      // Anything equivalent to the right answer is kept out of the distractors.
      const valid = new Set(getEquivalentAnswers(card, answerSide, groups).map(normalizeAnswer));
      const pool = getWrongOptionPool(card, cards, groups, answerSide).filter((a) => {
        if (valid.has(normalizeAnswer(a))) return false;
        const { label, imageOnly } = labelFor(a);
        return label.length > 0 || imageOnly;
      });
      return { card, pool };
    })
    .filter((e) => e.pool.length > 0);

  if (eligible.length === 0) return [];
  // "10" repeats cards fairly when the set is smaller than that.
  const picks = config.rounds === 'all' ? shuffleArray(eligible) : fairRepeatCards(eligible, 10);

  return picks.map(({ card, pool }, i) => {
    const answerHtml = config.side === 'term' ? card.definition : card.term;
    const wrongs = shuffleArray(pool).slice(0, config.fishCount - 1);
    const answers = shuffleArray([answerHtml, ...wrongs]);
    const lanes = shuffleArray(answers.map((_, k) => k));
    const colors = shuffleArray(FISH_COLORS);
    const fish: FishSpec[] = answers.map((html, k) => ({
      id: `${i}-${k}`,
      html,
      ...labelFor(html),
      correct: html === answerHtml,
      lane: lanes[k],
      x0: Math.random(),
      dir: Math.random() < 0.5 ? 1 : -1,
      speed: 38 + Math.random() * 55,
      bob: Math.random() * Math.PI * 2,
      color: colors[k % colors.length],
    }));
    const { label } = labelFor(answerHtml);
    return {
      id: i,
      promptHtml: config.side === 'term' ? card.term : card.definition,
      answerHtml,
      answerLabel: label,
      golden: Math.random() < GOLDEN_CHANCE,
      fish,
    };
  });
}

// ---------- Art ----------

function FishArt({ color, golden, size = 104 }: { color: string; golden?: boolean; size?: number }) {
  const body = golden ? ART.gold : color;
  return (
    <svg viewBox="0 0 104 48" width={size} height={(size * 48) / 104} aria-hidden style={{ display: 'block', overflow: 'visible' }}>
      <path d="M4 8 L26 24 L4 40 Q10 24 4 8 Z" fill={body} stroke="rgba(0,0,0,0.22)" strokeWidth="2" />
      <ellipse cx="60" cy="24" rx="40" ry="19" fill={body} />
      <ellipse cx="60" cy="29" rx="32" ry="10" fill="rgba(255,255,255,0.22)" />
      <path d="M50 6 Q60 -2 72 7 Z" fill={body} stroke="rgba(0,0,0,0.2)" strokeWidth="2" />
      <path d="M40 10 Q46 24 40 38" fill="none" stroke="rgba(0,0,0,0.18)" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="84" cy="19" r="5.5" fill="#fff" />
      <circle cx="85.5" cy="19" r="2.8" fill={ART.ink} />
      <path d="M96 27 Q93 30 90 28" fill="none" stroke={ART.ink} strokeWidth="2" strokeLinecap="round" />
      {golden && (
        <>
          <path d="M64 12 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 z" fill="#fff" />
          <circle cx="48" cy="18" r="2" fill="#fff" />
        </>
      )}
    </svg>
  );
}

function Dock({ promptHtml, golden, mood, barRef, dockRef }: { promptHtml: string | null; golden: boolean; mood: MascotMood; barRef?: React.Ref<HTMLDivElement>; dockRef?: React.Ref<HTMLDivElement> }) {
  return (
    <div ref={dockRef} className="relative" style={{ height: '11rem', background: `linear-gradient(180deg, ${ART.skyTop}, ${ART.skyBottom})` }}>
      {/* Far shore */}
      <svg aria-hidden className="absolute left-0 right-0 w-full" viewBox="0 0 400 40" preserveAspectRatio="none" style={{ bottom: 18, height: 40 }}>
        <path d="M0 40 L0 22 Q60 6 120 20 T240 16 T400 18 L400 40 Z" fill="#8cc79a" />
        <path d="M0 40 L0 30 Q80 18 170 30 T400 26 L400 40 Z" fill="#6fb07c" />
      </svg>
      {/* Dock planks */}
      <div aria-hidden className="absolute left-0 bottom-0" style={{ width: 'min(46%, 240px)', height: 22, background: ART.wood, boxShadow: `inset 0 -5px 0 ${ART.woodDark}, inset 0 3px 0 ${ART.woodLight}` }}>
        <div className="absolute inset-y-0" style={{ left: '33%', width: 2, background: ART.woodDark }} />
        <div className="absolute inset-y-0" style={{ left: '66%', width: 2, background: ART.woodDark }} />
      </div>
      <div aria-hidden className="absolute" style={{ left: 'calc(min(46%, 240px) - 18px)', bottom: -26, width: 10, height: 48, background: ART.woodDark }} />

      {/* Rod and line: x in %, y in px */}
      <svg aria-hidden className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 176" preserveAspectRatio="none">
        <line x1="13" y1="128" x2="50" y2="14" stroke={ART.rod} strokeWidth="5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <line x1="50" y1="14" x2="50" y2="38" stroke={ART.line} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>

      <div className="absolute" style={{ left: 'max(2%, 6px)', bottom: 14 }}>
        <Mascot mood={mood} color={ART.mascot} accessory="tufts" size={70} />
      </div>

      {/* Hook tag with the prompt */}
      {promptHtml !== null && (
        <div
          className="fp-tag absolute left-1/2 -translate-x-1/2 rounded-xl px-3 py-2 text-center overflow-x-hidden overflow-y-auto"
          style={{
            top: '2.375rem',
            width: 'min(62%, 23.75rem)',
            maxHeight: '7.375rem',
            background: golden ? '#fff3c4' : ART.tag,
            color: ART.ink,
            boxShadow: `inset 0 -4px 0 ${golden ? ART.gold : ART.tagEdge}, 0 6px 14px rgba(0,0,0,0.18)`,
          }}
        >
          <span aria-hidden className="absolute left-1/2 -translate-x-1/2 -top-1 w-3 h-3 rounded-full" style={{ border: `2px solid ${ART.line}`, background: 'transparent' }} />
          <StudyContent html={promptHtml} className="text-base sm:text-lg font-extrabold leading-snug break-words" />
          <div className="absolute left-0 bottom-0 h-1" ref={barRef} style={{ width: '100%', background: '#e5484d', opacity: 0.7 }} />
        </div>
      )}
    </div>
  );
}

function PondBackdrop() {
  return (
    <>
      <svg aria-hidden className="absolute left-0 top-0 w-full" viewBox="0 0 400 14" preserveAspectRatio="none" style={{ height: 14 }}>
        <path d="M0 0 L400 0 L400 6 Q390 12 380 6 T360 6 T340 6 T320 6 T300 6 T280 6 T260 6 T240 6 T220 6 T200 6 T180 6 T160 6 T140 6 T120 6 T100 6 T80 6 T60 6 T40 6 T20 6 T0 6 Z" fill={ART.skyBottom} opacity="0.5" />
      </svg>
      {/* Lily pads */}
      <svg aria-hidden className="absolute" viewBox="0 0 60 20" style={{ right: 12, top: 6, width: 60 }}>
        <ellipse cx="22" cy="10" rx="20" ry="7" fill={ART.lily} />
        <path d="M22 10 L42 7 L40 13 Z" fill={ART.waterTop} />
        <circle cx="46" cy="12" r="6" fill="#ff9ec7" />
      </svg>
      {/* Reeds */}
      <svg aria-hidden className="fp-sway absolute left-1 bottom-0" viewBox="0 0 40 120" style={{ width: 36, height: '42%' }} preserveAspectRatio="xMinYMax meet">
        <path d="M8 120 Q4 60 12 0" stroke={ART.reed} strokeWidth="5" fill="none" strokeLinecap="round" />
        <path d="M20 120 Q24 70 18 20" stroke={ART.reedLight} strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d="M30 120 Q34 80 36 44" stroke={ART.reed} strokeWidth="4" fill="none" strokeLinecap="round" />
      </svg>
      <svg aria-hidden className="fp-sway absolute right-1 bottom-0" viewBox="0 0 40 120" style={{ width: 30, height: '34%', animationDelay: '-1.5s' }} preserveAspectRatio="xMaxYMax meet">
        <path d="M12 120 Q8 70 16 10" stroke={ART.reedLight} strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d="M28 120 Q32 60 26 30" stroke={ART.reed} strokeWidth="5" fill="none" strokeLinecap="round" />
      </svg>
      {/* Pebbles */}
      <svg aria-hidden className="absolute left-0 bottom-0 w-full" viewBox="0 0 400 16" preserveAspectRatio="none" style={{ height: 16 }}>
        <path d="M0 16 L0 10 Q20 4 40 10 Q70 2 100 9 Q140 3 180 10 Q220 4 260 9 Q300 2 340 10 Q370 5 400 9 L400 16 Z" fill={ART.pebble} />
      </svg>
    </>
  );
}

// ---------- Setup ----------

function ConfigScreen({ onStart, initial, onExit }: { onStart: (c: Config) => void; initial: Config; onExit: () => void }) {
  const [side, setSide] = useState<PromptSide>(initial.side);
  const [rounds, setRounds] = useState<RoundsOpt>(initial.rounds);
  const [fishCount, setFishCount] = useState<3 | 4 | 5>(initial.fishCount);
  const accent = '#1b7c9c';
  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <div className="rounded-3xl overflow-hidden" style={{ boxShadow: '0 20px 50px rgba(0,0,0,0.18)' }}>
        {/* The water band, mascot clearance and bottom padding are px to match
            the fixed-size art, so larger text grows the sky, not the water */}
        <div className="relative overflow-hidden" style={{ minHeight: '9.375rem', background: ART.skyTop }}>
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0"
            style={{ height: 67.5, background: `linear-gradient(180deg, ${ART.waterTop}, ${ART.waterBottom})` }}
          />
          <div className="absolute left-4 bottom-[24px]">
            <Mascot mood="happy" color={ART.mascot} accessory="tufts" size={80} />
          </div>
          <div className="absolute" style={{ right: 18, bottom: 16 }}>
            <FishArt color={FISH_COLORS[0]} size={70} />
          </div>
          <div className="relative pl-[112px] pt-5 pr-4 pb-[24px]">
            <h2 className="text-3xl font-extrabold m-0" style={{ color: ART.ink, fontFamily: 'var(--font-display)' }}>
              Fishing Pond
            </h2>
            <p className="text-sm font-semibold m-0" style={{ color: '#23485a' }}>
              Hook the fish carrying the right answer before it swims off.
            </p>
          </div>
        </div>
        <div className="p-6 flex flex-col gap-6" style={{ background: 'var(--color-surface)' }}>
          <SetupSection label="On the hook">
            <ChoicePills
              options={[
                { value: 'term', label: 'Terms' },
                { value: 'definition', label: 'Definitions' },
              ]}
              isSelected={(v) => v === side}
              onToggle={setSide}
              accent={accent}
            />
          </SetupSection>
          <SetupSection label="Rounds">
            <ChoicePills
              options={[
                { value: '10', label: '10' },
                { value: 'all', label: 'All cards' },
              ]}
              isSelected={(v) => v === rounds}
              onToggle={setRounds}
              accent={accent}
            />
          </SetupSection>
          <SetupSection label="Fish in the pond">
            <ChoicePills
              options={[
                { value: 3, label: '3' },
                { value: 4, label: '4' },
                { value: 5, label: '5' },
              ]}
              isSelected={(v) => v === fishCount}
              onToggle={(v) => setFishCount(v as 3 | 4 | 5)}
              accent={accent}
            />
          </SetupSection>
          <PlayButton color={accent} onClick={() => onStart({ side, rounds, fishCount })}>
            Cast off
          </PlayButton>
          <Button variant="ghost" onClick={onExit}>
            Back to set
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------- Game ----------

interface SwimState {
  x: number;
  dir: 1 | -1;
  speed: number;
  bob: number;
}

export default function FishingPondMode({ cards, setId, exitUrl }: ModeProps) {
  const navigate = useNavigate();
  const reduce = !!useReducedMotion();
  const exitTo = exitUrl ?? `/sets/${setId}`;
  const exit = useCallback(() => navigate(exitTo), [navigate, exitTo]);
  const groups = useMemo(() => buildEquivalenceGroups(cards), [cards]);

  const [phase, setPhase] = useState<'config' | 'countdown' | 'play' | 'done'>('config');
  const [config, setConfig] = useState<Config>({ side: 'term', rounds: '10', fishCount: 4 });
  const [rounds, setRounds] = useState<Round[]>([]);
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState<Status>('swim');
  const [cast, setCast] = useState<Cast | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [splash, setSplash] = useState<{ n: number; x: number; y: number } | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [log, setLog] = useState<CatchEntry[]>([]);
  const [mood, setMood] = useState<MascotMood>('idle');
  const [best, setBest] = useState<ReturnType<typeof submitScore> | undefined>();
  const [empty, setEmpty] = useState(false);
  const { popups, push, remove } = usePopups();

  const sceneRef = useRef<HTMLDivElement>(null);
  const pondRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const fishEls = useRef(new Map<string, HTMLButtonElement>());
  const scoreRef = useRef(0);
  const splashN = useRef(0);
  /** Loop controls, written by handlers and read by the animation frame. */
  const frozenRef = useRef(false);
  const fleeIdRef = useRef<string | null>(null);
  const activeMsRef = useRef(0);
  const escapedRef = useRef(false);

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

  const round = rounds[index] ?? null;
  const playing = phase === 'play';
  const escArmed = useEscToQuit(phase !== 'config', playing, exit);

  const resetRoundControls = () => {
    frozenRef.current = false;
    fleeIdRef.current = null;
    activeMsRef.current = 0;
    escapedRef.current = false;
  };

  const start = useCallback(
    (cfg: Config) => {
      clearTimers();
      const built = buildRounds(cards, groups, cfg);
      setConfig(cfg);
      if (built.length === 0) {
        setEmpty(true);
        return;
      }
      setEmpty(false);
      setRounds(built);
      setIndex(0);
      setStatus('swim');
      setCast(null);
      setPickedId(null);
      setSplash(null);
      setScore(0);
      scoreRef.current = 0;
      setStreak(0);
      setBestStreak(0);
      setLog([]);
      setMood('idle');
      setBest(undefined);
      frozenRef.current = false;
      fleeIdRef.current = null;
      activeMsRef.current = 0;
      escapedRef.current = false;
      setPhase('countdown');
    },
    [cards, groups, clearTimers],
  );

  const finish = useCallback(() => {
    clearTimers();
    setBest(submitScore(GAME_ID, setId, scoreRef.current, `${config.side}-${config.rounds}-${config.fishCount}`));
    setPhase('done');
    playSound('win');
  }, [clearTimers, setId, config]);

  const next = useCallback(() => {
    if (index + 1 >= rounds.length) {
      finish();
      return;
    }
    resetRoundControls();
    setIndex(index + 1);
    setStatus('swim');
    setCast(null);
    setPickedId(null);
    setMood('idle');
  }, [index, rounds.length, finish]);

  const onEscape = useCallback(() => {
    if (status !== 'swim') return;
    frozenRef.current = true;
    playSound('wrong');
    setStatus('missed');
    setStreak(0);
    setMood('sad');
    later(next, 2000);
  }, [status, later, next]);
  const escapeRef = useRef(onEscape);
  useEffect(() => {
    escapeRef.current = onEscape;
  });

  // Swim loop: writes positions straight to the fish elements.
  useEffect(() => {
    if (!round || !playing) return;
    const pond = pondRef.current;
    if (!pond) return;
    const edge = edgeHalf();
    const range = Math.max(0, pond.clientWidth - 2 * edge);
    const swim = new Map<string, SwimState>(
      round.fish.map((f) => [f.id, { x: edge + f.x0 * range, dir: f.dir, speed: f.speed, bob: f.bob }]),
    );
    let last = performance.now();
    let raf = 0;
    const frame = (t: number) => {
      const dt = Math.min(0.05, Math.max(0, (t - last) / 1000));
      last = t;
      const W = pond.clientWidth;
      if (!frozenRef.current) activeMsRef.current += dt * 1000;
      const leaving = activeMsRef.current >= ESCAPE_MS;
      const bar = barRef.current;
      if (bar) bar.style.width = `${Math.max(0, 1 - activeMsRef.current / ESCAPE_MS) * 100}%`;

      for (const f of round.fish) {
        const s = swim.get(f.id)!;
        const el = fishEls.current.get(f.id);
        const fleeing = fleeIdRef.current === f.id;
        const moving = !reduce && (fleeing || !frozenRef.current);
        if (moving) {
          const escaping = fleeing || (f.correct && leaving);
          const speed = fleeing ? 420 : escaping ? Math.max(s.speed * 2, 150) : s.speed;
          s.x += s.dir * speed * dt;
          if (!escaping) {
            if (s.x < edge) {
              s.x = edge;
              s.dir = 1;
            } else if (s.x > W - edge) {
              s.x = W - edge;
              s.dir = -1;
            }
          }
          s.bob += dt * 1.8;
        }
        if (el) {
          el.style.left = `${s.x - HALF}px`;
          el.style.transform = reduce ? '' : `translateY(${Math.sin(s.bob) * 4}px)`;
          el.style.setProperty('--fp-dir', String(s.dir));
        }
        if (f.correct && leaving && !escapedRef.current && !frozenRef.current) {
          const gone = reduce || s.x < -edge || s.x > W + edge;
          if (gone) {
            escapedRef.current = true;
            escapeRef.current();
          }
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [round, playing, reduce]);

  const pick = useCallback(
    (fish: FishSpec) => {
      if (!playing || !round || status !== 'swim') return;
      const scene = sceneRef.current;
      const el = fishEls.current.get(fish.id);
      if (!scene || !el) return;
      frozenRef.current = true;
      const s = scene.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const x2 = r.left - s.left + r.width / 2;
      const y2 = r.top - s.top + 22;
      setCast({ x1: s.width / 2, y1: (14 * (dockRef.current?.offsetHeight ?? 176)) / 176, x2, y2 });
      setPickedId(fish.id);
      setStatus('casting');
      playSound('flip');
      const seconds = activeMsRef.current / 1000;
      const px = (x2 / s.width) * 100;
      const py = (y2 / s.height) * 100;

      later(
        () => {
          if (fish.correct) {
            const nextStreak = streak + 1;
            const mult = comboMultiplier(nextStreak);
            const speed = Math.round(Math.max(0, 50 * (1 - seconds / 8)));
            const points = Math.round(100 * mult * (round.golden ? 2 : 1)) + speed;
            scoreRef.current += points;
            setScore(scoreRef.current);
            setStreak(nextStreak);
            setBestStreak((b) => Math.max(b, nextStreak));
            setStatus('caught');
            setMood(round.golden || nextStreak >= 3 ? 'celebrate' : 'happy');
            splashN.current += 1;
            setSplash({ n: splashN.current, x: x2, y: y2 });
            playSound(round.golden ? 'boost' : 'correct');
            if (mult > comboMultiplier(streak)) {
              playSound('combo');
              push({ text: `${formatMultiplier(mult)} combo!`, color: '#e5484d', x: 8, y: 30 });
            }
            push({ text: round.golden ? `Golden! +${points}` : `+${points}`, color: round.golden ? ART.gold : '#ffffff', x: Math.min(70, px), y: Math.max(8, py - 6) });
            setLog((l) => [
              ...l,
              {
                id: round.id,
                promptHtml: round.promptHtml,
                answerHtml: round.answerHtml,
                golden: round.golden,
                color: fish.color,
                points,
              },
            ]);
            later(next, reduce ? 700 : 1200);
          } else {
            fleeIdRef.current = fish.id;
            playSound('wrong');
            setStatus('wrong');
            setStreak(0);
            setMood('sad');
            later(next, 1900);
          }
        },
        reduce ? 120 : 340,
      );
    },
    [playing, round, status, streak, later, next, push, reduce],
  );

  // Number keys cast at the matching fish.
  useEffect(() => {
    if (!playing || !round || status !== 'swim') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= round.fish.length) {
        e.preventDefault();
        pick(round.fish[n - 1]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing, round, status, pick]);

  useEffect(() => {
    if (phase !== 'done' || rounds.length === 0) return;
    if (log.length / rounds.length >= 0.7) return celebrate([ART.gold, ART.waterTop, '#ff7a59', '#ffffff']);
  }, [phase, log.length, rounds.length]);

  const setFishEl = useCallback((id: string, el: HTMLButtonElement | null) => {
    if (el) fishEls.current.set(id, el);
    else fishEls.current.delete(id);
  }, []);

  if (phase === 'config') {
    return (
      <>
        <ConfigScreen initial={config} onStart={start} onExit={exit} />
        {empty && (
          <p role="alert" className="max-w-xl mx-auto px-4 -mt-4 text-center font-semibold" style={{ color: 'var(--color-danger)' }}>
            This set needs at least two cards with different answers to stock the pond.
          </p>
        )}
      </>
    );
  }

  if (phase === 'done') {
    const total = rounds.length;
    const pct = total > 0 ? Math.round((log.length / total) * 100) : 0;
    const stars = pct >= 90 ? 3 : pct >= 70 ? 2 : pct >= 40 ? 1 : 0;
    const goldens = log.filter((c) => c.golden).length;
    return (
      <div className="relative min-h-[calc(100dvh-8rem)] flex flex-col items-center px-4 pt-24 pb-10 gap-6">
        <ResultsPanel
          mascot={<Mascot mood={stars >= 2 ? 'celebrate' : stars === 1 ? 'happy' : 'sad'} color={ART.mascot} accessory="tufts" size={112} />}
          title={stars === 3 ? 'What a haul' : stars >= 1 ? 'Nice fishing' : 'The fish won this time'}
          subtitle={`You landed ${log.length} of ${total} fish.`}
          stars={stars}
          score={score}
          best={best}
          stats={[
            { label: 'Accuracy', value: `${pct}%` },
            { label: 'Best streak', value: bestStreak },
            { label: 'Golden fish', value: goldens },
          ]}
          actions={
            <>
              <Button variant="primary" onClick={() => start(config)}>
                Fish again
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
        {log.length > 0 && (
          <section
            className="fp-log w-full max-w-md rounded-3xl p-5"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
            aria-labelledby="fp-log-title"
          >
            <h3 id="fp-log-title" className="text-lg font-extrabold m-0" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
              Catch log
            </h3>
            <ul className="list-none p-0 m-0 mt-3 flex flex-col gap-2">
              {log.map((c, i) => (
                <li key={`${c.id}-${i}`} className="flex items-center gap-3 rounded-2xl p-3" style={{ background: 'var(--color-muted)', color: 'var(--color-text)' }}>
                  <span className="shrink-0">
                    <FishArt color={c.color} golden={c.golden} size={48} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <StudyContent html={c.answerHtml} className="font-bold text-sm break-words" />
                    <div className="text-xs mt-0.5 break-words" style={{ color: 'var(--color-text-secondary)' }}>
                      {truncate(stripHtml(c.promptHtml) || 'Picture card', 70)}
                    </div>
                  </div>
                  <span className="text-sm font-extrabold tabular-nums shrink-0" style={{ fontFamily: 'var(--font-display)', color: c.golden ? ART.goldEdge : 'var(--color-text-secondary)' }}>
                    +{c.points}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  }

  const correctFish = round?.fish.find((f) => f.correct) ?? null;
  const showAnswer = status === 'wrong' || status === 'missed';

  return (
    <div className="max-w-4xl mx-auto px-4 py-4">
      <EscBanner show={escArmed} />
      {phase === 'countdown' && <Countdown accent={ART.gold} onDone={() => setPhase('play')} />}

      <GameTopBar onExit={exit}>
        <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
          Fish {Math.min(index + 1, rounds.length)} of {rounds.length}
        </span>
        <ComboMeter streak={streak} />
        <ScoreCounter value={score} />
      </GameTopBar>

      <div
        ref={sceneRef}
        className="relative mt-4 rounded-3xl overflow-hidden"
        style={{ boxShadow: '0 16px 40px rgba(0,0,0,0.2)' }}
      >
        <Dock promptHtml={round?.promptHtml ?? null} golden={!!round?.golden} mood={mood} barRef={barRef} dockRef={dockRef} />

        <div
          ref={pondRef}
          className="relative overflow-hidden"
          style={{
            height: 'clamp(18.75rem, 48dvh, 26.25rem)',
            background: `linear-gradient(180deg, ${ART.waterTop}, ${ART.waterMid} 45%, ${ART.waterBottom})`,
          }}
        >
          <PondBackdrop />

          {round?.golden && status === 'swim' && (
            <div
              className="fp-shimmer absolute left-3 top-4 px-2.5 py-1 rounded-full text-xs font-extrabold"
              style={{ color: '#3d2600', fontFamily: 'var(--font-display)', zIndex: 15 }}
            >
              A golden fish is in here. Double points.
            </div>
          )}

          {round?.fish.map((f, k) => {
            const n = round.fish.length;
            const frac = n > 1 ? f.lane / (n - 1) : 0.5;
            const isPicked = pickedId === f.id;
            const glow = showAnswer && f.correct;
            const gone = (status === 'caught' && isPicked) || (status === 'missed' && f.correct && reduce);
            const dim = (showAnswer && !f.correct && !(status === 'wrong' && isPicked)) || (status === 'casting' && !isPicked);
            const golden = round.golden && f.correct && (status === 'caught' || showAnswer);
            const label = f.imageOnly ? 'picture answer' : f.label;
            const edge = edgeHalf();
            return (
              <button
                key={f.id}
                ref={(el) => setFishEl(f.id, el)}
                type="button"
                onClick={() => pick(f)}
                disabled={!playing || status !== 'swim'}
                aria-label={`Fish ${k + 1}: ${label}`}
                title={stripHtml(f.html) || undefined}
                className={['fp-fish', glow ? 'fp-glow' : '', gone ? 'fp-gone' : '', dim ? 'fp-dim' : ''].join(' ')}
                style={{
                  top: `calc(${frac} * (100% - 6.875rem) + 1.125rem)`,
                  left: `calc(${edge - HALF}px + (100% - ${2 * edge}px) * ${f.x0})`,
                  zIndex: 5 + f.lane,
                  ['--fp-dir' as string]: String(f.dir),
                }}
              >
                <span className="relative">
                  <span className="fp-body block">
                    <FishArt color={f.color} golden={golden} />
                  </span>
                  <span
                    aria-hidden
                    className="absolute -top-1.5 left-1/2 -translate-x-1/2 flex items-center justify-center w-6 h-6 rounded-full text-xs font-extrabold"
                    style={{ background: ART.ink, color: '#fff', fontFamily: 'var(--font-display)', border: '2px solid #fff' }}
                  >
                    {k + 1}
                  </span>
                  {f.imageOnly && (
                    <span className="fp-badge absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ border: `3px solid ${golden ? ART.goldEdge : '#fff'}` }}>
                      <StudyContent html={f.html} />
                    </span>
                  )}
                </span>
                {!f.imageOnly && (
                  <span aria-hidden className="fp-chip" style={{ background: '#fff', color: ART.ink, boxShadow: '0 3px 0 rgba(0,0,0,0.25)' }}>
                    {f.label}
                  </span>
                )}
              </button>
            );
          })}

          {/* Answer strip after a wrong pick or a miss */}
          <AnimatePresence>
            {showAnswer && round && (
              <motion.div
                role="status"
                className="fp-banner absolute left-3 right-3 bottom-4 flex items-center gap-3 rounded-2xl px-4 py-2.5"
                style={{ background: 'rgba(255,255,255,0.95)', color: ART.ink, zIndex: 30, boxShadow: '0 6px 18px rgba(0,0,0,0.25)' }}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <span className="text-sm font-extrabold shrink-0" style={{ color: '#c2303c', fontFamily: 'var(--font-display)' }}>
                  {status === 'missed' ? 'It got away.' : 'Wrong fish.'}
                </span>
                <span className="text-sm min-w-0 flex-1 flex items-center gap-1.5 flex-wrap">
                  <span style={{ color: '#4a5a63' }}>Answer:</span>
                  <StudyContent html={round.answerHtml} className="font-bold break-words" />
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Fishing line, splash and the reeled-in fish span dock and pond */}
        {cast && (
          <svg aria-hidden className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 25 }}>
            <motion.path
              d={`M ${cast.x1} ${cast.y1} Q ${(cast.x1 + cast.x2) / 2 + 30} ${(cast.y1 + cast.y2) / 2} ${cast.x2} ${cast.y2}`}
              fill="none"
              stroke={ART.line}
              strokeWidth={1.75}
              initial={{ pathLength: reduce ? 1 : 0 }}
              animate={{ pathLength: 1, opacity: status === 'caught' || status === 'wrong' ? 0 : 1 }}
              transition={{ pathLength: { duration: reduce ? 0 : 0.3, ease: 'easeOut' }, opacity: { duration: 0.4, delay: 0.3 } }}
            />
          </svg>
        )}
        {splash && status === 'caught' && (
          <div key={splash.n} aria-hidden className="absolute pointer-events-none" style={{ left: splash.x, top: splash.y, zIndex: 26 }}>
            <span className="fp-splash" />
            <span className="fp-splash fp-s2" />
          </div>
        )}
        <AnimatePresence>
          {status === 'caught' && cast && correctFish && (
            <motion.div
              key={`reel-${round?.id}`}
              aria-hidden
              className="absolute pointer-events-none"
              style={{ left: 0, top: 0, zIndex: 27 }}
              initial={{ x: cast.x2 - 52, y: cast.y2 - 24, rotate: 0, opacity: 1 }}
              animate={
                reduce
                  ? { opacity: 1 }
                  : { x: cast.x1 - 26, y: cast.y1 + 10, rotate: -70, scale: 0.7, transition: { duration: 0.6, ease: [0.3, 0, 0.2, 1] } }
              }
              exit={{ opacity: 0, transition: { duration: 0.2 } }}
            >
              <FishArt color={correctFish.color} golden={!!round?.golden} />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 28 }}>
          <ScorePopups popups={popups} onDone={remove} />
        </div>
      </div>

      <p className="hidden md:block mt-2 text-xs text-center" style={{ color: 'var(--color-text-tertiary)' }}>
        Tap a fish or press its number to cast
      </p>
    </div>
  );
}
