import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Heart, Shield, Swords, Zap } from 'lucide-react';
import type { AnswerDirection, Card, QuestionType } from '@/types';
import type { ModeProps } from '@/components/modes/registry';
import { shuffleArray, stripHtml } from '@/lib/utils';
import { buildEquivalenceGroups } from '@/lib/equivalence';
import { buildGameQuestion, gradeGameAnswer, type GameQuestion } from '@/lib/gameQuestions';
import { getBest, submitScore } from '@/lib/gameRecords';
import { playSound } from '@/lib/gameSounds';
import { Button } from '@/components/ui/Button';
import StudyContent from '@/components/StudyContent';
import { Mascot, type MascotMood } from '@/components/games/Mascot';
import { ScorePopups } from '@/components/games/ScorePopup';
import {
  ChoicePills,
  ComboMeter,
  Countdown,
  EscBanner,
  GameTopBar,
  PlayButton,
  QuestionPanel,
  ResultsPanel,
  ScoreCounter,
  SetupSection,
  type Feedback,
} from '@/components/games/GameKit';
import {
  celebrate,
  comboMultiplier,
  formatMultiplier,
  useAnswerKeys,
  useEscToQuit,
  usePopups,
} from '@/components/games/gameLogic';
import './BossBattleMode.css';

// ============================================================
// Boss Battle — turn-based fight. Right answers are the hero's
// attacks; wrong answers let the boss strike AND load that card
// into the boss's move list, so it comes back 2–4 turns later as
// a "special attack" (in-session spaced retrieval).
// ============================================================

const GAME_ID = 'boss-battle';

// Fixed arena art colors (theme-independent).
const ARENA = {
  skyTop: '#1c1a36',
  skyBottom: '#3b2d5e',
  wall: '#2b2548',
  wallLine: '#3a3260',
  floor: '#4a3f6b',
  floorEdge: '#2a2342',
  flame: '#ffb640',
  flameCore: '#fff1b0',
  hero: '#4fa3e0',
  heroHp: '#3ccf7a',
  bossHp: '#ff5a5f',
  ink: '#f6f3ff',
};

type BossId = 'slime' | 'golem' | 'dragon';

interface BossDef {
  name: string;
  blurb: string;
  /** Multiplies boss HP. */
  hpFactor: number;
  /** Damage to the hero on a wrong answer. */
  attack: number;
  accent: string;
  accentEdge: string;
}

const BOSSES: Record<BossId, BossDef> = {
  slime: { name: 'Slime King', blurb: 'Soft hits, slow to anger', hpFactor: 0.85, attack: 14, accent: '#3fae55', accentEdge: '#277a37' },
  golem: { name: 'Stone Golem', blurb: 'Tough and steady', hpFactor: 1, attack: 18, accent: '#7a8290', accentEdge: '#555c68' },
  dragon: { name: 'Storm Dragon', blurb: 'Hits hard, lots of HP', hpFactor: 1.15, attack: 24, accent: '#6a55e0', accentEdge: '#4634ad' },
};

const HERO_MAX = 100;
const BASE_DAMAGE = 10;
const POWER_COST = 3;
const HEAL_AMOUNT = 30;
/** Special attacks (returning missed cards) hit harder and are worth more when countered. */
const SPECIAL_BOOST = 1.4;
const COUNTER_BOOST = 1.5;

interface BattleConfig {
  boss: BossId;
  questionTypes: QuestionType[];
  direction: AnswerDirection;
}

interface Move {
  id: number;
  card: Card;
  label: string;
  /** Turn number when the boss throws this card back. */
  due: number;
}

interface Turn {
  n: number;
  question: GameQuestion;
  special: boolean;
  label: string;
}

/** Boss HP: roughly what a flawless player deals in 8–12 hits (by set size),
 *  so a typical run lands at 10–15 questions. */
function bossMaxHp(cardCount: number, factor: number): number {
  const hits = Math.max(8, Math.min(12, cardCount));
  let sum = 0;
  for (let k = 1; k <= hits; k++) sum += comboMultiplier(k);
  return Math.round(sum * BASE_DAMAGE * 1.1 * factor);
}

function cardLabel(card: Card): string {
  const text = stripHtml(card.term) || stripHtml(card.definition);
  if (!text) return 'a picture card';
  return text.length > 28 ? `${text.slice(0, 26).trimEnd()}…` : text;
}

// ---------- Boss art ----------

function BossArt({ id, hurt, size = 170 }: { id: BossId; hurt?: boolean; size?: number }) {
  if (id === 'slime') {
    return (
      <svg viewBox="0 0 160 160" width={size} height={size} aria-hidden style={{ overflow: 'visible' }}>
        <ellipse cx="80" cy="152" rx="62" ry="8" fill="rgba(0,0,0,0.3)" />
        <path d="M18 150 C12 108 30 60 80 56 C130 60 148 108 142 150 Z" fill="#4cc463" />
        <path d="M18 150 C22 140 30 138 34 146 C38 154 46 154 50 146 C56 136 66 140 68 150 Z" fill="#35a04b" />
        <path d="M92 150 C96 138 108 138 112 148 C116 156 128 154 132 144 C136 138 142 142 142 150 Z" fill="#35a04b" />
        <ellipse cx="52" cy="86" rx="12" ry="8" fill="rgba(255,255,255,0.35)" transform="rotate(-25 52 86)" />
        <circle cx="116" cy="118" r="5" fill="rgba(255,255,255,0.25)" />
        {hurt ? (
          <g stroke="#153d1e" strokeWidth="5" strokeLinecap="round" fill="none">
            <path d="M56 92 L70 100 L56 108" />
            <path d="M104 92 L90 100 L104 108" />
          </g>
        ) : (
          <g>
            <ellipse cx="64" cy="100" rx="10" ry="11" fill="#fff" />
            <ellipse cx="96" cy="100" rx="10" ry="11" fill="#fff" />
            <circle cx="67" cy="102" r="5" fill="#153d1e" />
            <circle cx="93" cy="102" r="5" fill="#153d1e" />
            <path d="M50 84 L74 92 M110 84 L86 92" stroke="#153d1e" strokeWidth="5" strokeLinecap="round" />
          </g>
        )}
        <path d="M60 124 Q80 136 100 124" stroke="#153d1e" strokeWidth="4.5" strokeLinecap="round" fill="none" />
        <path d="M50 62 L54 30 L67 46 L80 22 L93 46 L106 30 L110 62 Z" fill="#ffd23e" stroke="#c99a0a" strokeWidth="3" strokeLinejoin="round" />
        <circle cx="80" cy="50" r="5" fill="#e5484d" />
        <circle cx="62" cy="54" r="3.5" fill="#4fa3e0" />
        <circle cx="98" cy="54" r="3.5" fill="#4fa3e0" />
      </svg>
    );
  }
  if (id === 'golem') {
    const eye = hurt ? '#ff9b3d' : '#6ef2ff';
    return (
      <svg viewBox="0 0 160 160" width={size} height={size} aria-hidden style={{ overflow: 'visible' }}>
        <ellipse cx="80" cy="152" rx="62" ry="8" fill="rgba(0,0,0,0.3)" />
        <rect x="46" y="124" width="28" height="26" rx="6" fill="#646b77" />
        <rect x="88" y="124" width="28" height="26" rx="6" fill="#646b77" />
        <rect x="8" y="72" width="30" height="62" rx="12" fill="#6c7380" />
        <rect x="122" y="72" width="30" height="62" rx="12" fill="#6c7380" />
        <rect x="32" y="66" width="96" height="66" rx="14" fill="#8a919d" />
        <path d="M48 84 L60 96 L54 110 M104 78 L96 92 L108 100" stroke="#5b616c" strokeWidth="3" strokeLinecap="round" fill="none" />
        <ellipse cx="112" cy="118" rx="10" ry="5" fill="#5f9a4f" />
        <rect x="50" y="22" width="60" height="50" rx="10" fill="#9ba2ad" />
        <rect x="50" y="22" width="60" height="10" rx="5" fill="#b1b7c0" />
        <rect x="60" y="42" width="15" height={hurt ? 4 : 8} rx="2" fill={eye} />
        <rect x="85" y="42" width="15" height={hurt ? 4 : 8} rx="2" fill={eye} />
        <path d="M64 60 H96" stroke="#555c68" strokeWidth="4" strokeLinecap="round" />
        <ellipse cx="62" cy="26" rx="8" ry="4" fill="#5f9a4f" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 160 160" width={size} height={size} aria-hidden style={{ overflow: 'visible' }}>
      <ellipse cx="96" cy="152" rx="58" ry="8" fill="rgba(0,0,0,0.3)" />
      <path d="M118 96 L160 34 L152 76 L166 90 Z" fill="#3f2f9e" />
      <path d="M104 160 C108 124 116 100 102 82 L130 72 C146 100 150 132 144 160 Z" fill="#5a47d0" />
      <path d="M116 160 C118 132 122 112 116 96 L128 92 C136 112 138 136 134 160 Z" fill="#a99cf5" />
      <path d="M100 44 L126 10 L114 50 Z" fill="#e9e3ff" />
      <path d="M112 50 L150 30 L126 58 Z" fill="#d7ceff" />
      <path d="M36 72 C40 50 72 36 102 42 L128 52 C138 60 136 78 124 84 L100 94 C82 102 58 102 42 94 Z" fill="#6a55e0" />
      <path d="M42 94 C58 102 82 102 100 94 L96 104 C80 110 58 108 46 102 Z" fill="#4634ad" />
      <path d="M52 95 l4 8 l4 -8 Z M66 97 l4 8 l4 -8 Z M80 96 l4 8 l4 -8 Z" fill="#fff" />
      <circle cx="48" cy="68" r="3" fill="#2a1f70" />
      <ellipse cx="90" cy="62" rx="9" ry={hurt ? 3 : 7} fill="#ffe14d" />
      {!hurt && <ellipse cx="90" cy="62" rx="2.2" ry="6" fill="#2a1f70" />}
      <path d="M78 52 L102 56" stroke="#2a1f70" strokeWidth="4" strokeLinecap="round" />
      <path d="M22 18 L34 38 L26 38 L38 60 L18 34 L27 34 Z" fill="#ffe14d" stroke="#d9a90b" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function HpBar({ label, hp, max, color, align = 'left', icon }: { label: string; hp: number; max: number; color: string; align?: 'left' | 'right'; icon?: ReactNode }) {
  const reduce = useReducedMotion();
  const pct = Math.max(0, Math.min(100, (hp / max) * 100));
  return (
    <div className="min-w-0 flex-1" style={{ textAlign: align }}>
      <div
        className="flex items-center gap-1.5 text-xs sm:text-sm font-extrabold mb-1"
        style={{ color: ARENA.ink, fontFamily: 'var(--font-display)', justifyContent: align === 'right' ? 'flex-end' : 'flex-start' }}
      >
        {icon}
        <span className="truncate">{label}</span>
        <span className="tabular-nums opacity-80">{Math.ceil(hp)}/{max}</span>
      </div>
      <div
        role="progressbar"
        aria-label={`${label} health`}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.ceil(hp)}
        className="h-3.5 rounded-full overflow-hidden"
        style={{ background: 'rgba(0,0,0,0.45)', border: '2px solid rgba(255,255,255,0.18)', direction: align === 'right' ? 'rtl' : 'ltr' }}
      >
        <motion.div
          className="h-full rounded-full"
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 140, damping: 20 }}
          style={{ background: pct < 30 ? '#ffb020' : color, boxShadow: 'inset 0 -3px 0 rgba(0,0,0,0.2)' }}
        />
      </div>
    </div>
  );
}

function Torch({ x }: { x: string }) {
  return (
    <div aria-hidden className="absolute" style={{ left: x, top: '16%', width: 18 }}>
      <svg viewBox="0 0 18 40" width="18" height="40">
        <path className="bsb-torch" d="M9 2 C15 10 15 16 9 20 C3 16 3 10 9 2 Z" fill={ARENA.flame} />
        <path d="M9 9 C12 13 12 16 9 18 C6 16 6 13 9 9 Z" fill={ARENA.flameCore} />
        <rect x="6" y="20" width="6" height="18" rx="2" fill="#6b4a2e" />
      </svg>
    </div>
  );
}

function Arena({
  boss,
  bossHp,
  bossMax,
  heroHp,
  shield,
  mood,
  bossHurt,
  heroCtl,
  bossCtl,
  hurtFlash,
  special,
  popups,
  onPopupDone,
}: {
  boss: BossId;
  bossHp: number;
  bossMax: number;
  heroHp: number;
  shield: boolean;
  mood: MascotMood;
  bossHurt: boolean;
  heroCtl: ReturnType<typeof useAnimationControls>;
  bossCtl: ReturnType<typeof useAnimationControls>;
  hurtFlash: number;
  special: string | null;
  popups: ReturnType<typeof usePopups>['popups'];
  onPopupDone: (id: number) => void;
}) {
  const reduce = useReducedMotion();
  const def = BOSSES[boss];
  return (
    <div
      className="relative overflow-hidden rounded-3xl"
      style={{ background: `linear-gradient(180deg, ${ARENA.skyTop}, ${ARENA.skyBottom})`, boxShadow: '0 16px 40px rgba(0,0,0,0.25)' }}
    >
      {/* back wall */}
      <svg aria-hidden className="absolute inset-x-0 top-[12%] w-full" height="46%" viewBox="0 0 400 100" preserveAspectRatio="none">
        <rect x="0" y="0" width="400" height="100" fill={ARENA.wall} />
        {[20, 45, 70].map((y) => (
          <line key={y} x1="0" x2="400" y1={y} y2={y} stroke={ARENA.wallLine} strokeWidth="2" />
        ))}
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <line key={i} x1={i * 52 + (i % 2) * 20} x2={i * 52 + (i % 2) * 20} y1={i % 2 ? 20 : 45} y2={i % 2 ? 45 : 70} stroke={ARENA.wallLine} strokeWidth="2" />
        ))}
      </svg>
      <Torch x="8%" />
      <Torch x="calc(92% - 18px)" />
      {/* floor */}
      <div aria-hidden className="absolute inset-x-0 bottom-0" style={{ height: '30%', background: ARENA.floor, borderTop: `4px solid ${ARENA.floorEdge}` }} />

      <div className="relative px-3 sm:px-5 pt-3 flex gap-4 sm:gap-10 items-start" style={{ zIndex: 3 }}>
        <HpBar label="You" hp={heroHp} max={HERO_MAX} color={ARENA.heroHp} icon={<Heart size={14} fill="currentColor" />} />
        <HpBar label={def.name} hp={bossHp} max={bossMax} color={ARENA.bossHp} align="right" />
      </div>

      {/* Fighters */}
      <div className="relative flex items-end justify-between px-[6%] h-[190px] sm:h-[230px]" style={{ zIndex: 2 }}>
        <motion.div animate={heroCtl} className="relative mb-2">
          <Mascot mood={mood} color={ARENA.hero} accessory="helmet" size={92} />
          {/* sword */}
          <svg aria-hidden viewBox="0 0 30 60" width="26" height="52" className="absolute" style={{ right: -12, top: 30, transform: 'rotate(35deg)' }}>
            <rect x="12" y="2" width="6" height="38" rx="2" fill="#dfe6ef" stroke="#8795a8" strokeWidth="1.5" />
            <rect x="4" y="38" width="22" height="5" rx="2" fill="#c99a0a" />
            <rect x="12" y="43" width="6" height="12" rx="2" fill="#6b4a2e" />
          </svg>
          <AnimatePresence>
            {shield && (
              <motion.div
                aria-hidden
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.3 }}
                className="absolute rounded-full"
                style={{ inset: -10, border: '3px solid #7cd8ff', background: 'rgba(124,216,255,0.18)' }}
              />
            )}
          </AnimatePresence>
        </motion.div>
        <motion.div animate={bossCtl} className="relative">
          <BossArt id={boss} hurt={bossHurt} size={170} />
        </motion.div>
      </div>

      {/* Special attack banner */}
      <AnimatePresence>
        {special && (
          <motion.div
            key={special}
            role="status"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -12, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            className="absolute left-1/2 top-12 -translate-x-1/2 max-w-[88%] flex items-center gap-2 px-3.5 py-2 rounded-2xl"
            style={{ background: def.accent, boxShadow: `inset 0 -4px 0 ${def.accentEdge}, 0 8px 20px rgba(0,0,0,0.35)`, zIndex: 4 }}
          >
            <span className="bsb-special-bolt flex shrink-0" style={{ color: '#ffe14d' }}>
              <Zap size={20} fill="currentColor" />
            </span>
            <span className="font-extrabold text-sm sm:text-base leading-tight" style={{ color: '#fff', fontFamily: 'var(--font-display)' }}>
              The boss uses: {special}!
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {hurtFlash > 0 && (
        <div key={hurtFlash} aria-hidden className="bsb-hurt-flash absolute inset-0 pointer-events-none" style={{ background: '#ff2d3d', opacity: 0, zIndex: 5 }} />
      )}

      <div className="absolute inset-0" style={{ zIndex: 6 }}>
        <ScorePopups popups={popups} onDone={onPopupDone} />
      </div>
    </div>
  );
}

function MovesStrip({ moves, turn, accent }: { moves: Move[]; turn: number; accent: string }) {
  return (
    <div className="mt-3 rounded-2xl px-3 py-2.5" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>
          Boss&apos;s moves
        </span>
        {moves.length === 0 ? (
          <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            None yet. Cards you miss become its attacks.
          </span>
        ) : (
          moves
            .slice()
            .sort((a, b) => a.due - b.due)
            .map((m) => {
              const inTurns = Math.max(1, m.due - turn);
              return (
                <span
                  key={m.id}
                  className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-bold max-w-[180px]"
                  style={{ background: accent, color: '#fff' }}
                  title={m.label}
                >
                  <Zap size={12} fill="currentColor" className="shrink-0" />
                  <span className="truncate">{m.label}</span>
                  <span className="opacity-80 tabular-nums shrink-0">in {inTurns}</span>
                </span>
              );
            })
        )}
      </div>
    </div>
  );
}

// ---------- Setup ----------

function ConfigScreen({ onStart, setId }: { onStart: (c: BattleConfig) => void; setId: string }) {
  const [boss, setBoss] = useState<BossId>('golem');
  const [types, setTypes] = useState<QuestionType[]>(['multiple-choice', 'true-false', 'written']);
  const [direction, setDirection] = useState<AnswerDirection>('term-to-def');
  const toggleType = (type: QuestionType) =>
    setTypes((prev) => (prev.includes(type) ? (prev.length > 1 ? prev.filter((t) => t !== type) : prev) : [...prev, type]));
  const [bests] = useState(() => ({
    slime: getBest(GAME_ID, setId, 'slime'),
    golem: getBest(GAME_ID, setId, 'golem'),
    dragon: getBest(GAME_ID, setId, 'dragon'),
  }));

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <div className="rounded-3xl overflow-hidden" style={{ boxShadow: '0 20px 50px rgba(0,0,0,0.18)' }}>
        <div
          className="relative flex items-end justify-center gap-2 h-[160px] px-4 pb-3"
          style={{ background: `linear-gradient(180deg, ${ARENA.skyTop}, ${ARENA.skyBottom})` }}
        >
          <Mascot mood="happy" color={ARENA.hero} accessory="helmet" size={80} />
          <div className="pb-2 text-left">
            <h2 className="text-3xl font-extrabold" style={{ color: ARENA.ink, fontFamily: 'var(--font-display)' }}>
              Boss Battle
            </h2>
            <p className="text-sm font-semibold" style={{ color: '#cfc6f5' }}>
              Right answers attack. Cards you miss come back as the boss&apos;s moves.
            </p>
          </div>
        </div>
        <div className="p-6 flex flex-col gap-6" style={{ background: 'var(--color-surface)' }}>
          <SetupSection label="Choose your boss">
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(BOSSES) as BossId[]).map((id) => {
                const b = BOSSES[id];
                const on = id === boss;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setBoss(id)}
                    className="flex flex-col items-center rounded-2xl pt-2 pb-2.5 px-1 cursor-pointer focus-visible:outline-3 focus-visible:outline-offset-2"
                    style={{
                      background: on ? ARENA.skyBottom : 'var(--color-muted)',
                      border: on ? `3px solid ${b.accent}` : '3px solid transparent',
                      color: on ? ARENA.ink : 'var(--color-text)',
                      outlineColor: b.accent,
                    }}
                  >
                    <BossArt id={id} size={64} />
                    <span className="text-sm font-extrabold mt-1" style={{ fontFamily: 'var(--font-display)' }}>{b.name}</span>
                    <span className="text-[11px] leading-tight opacity-80 text-center">{b.blurb}</span>
                    {bests[id] !== null && (
                      <span className="text-[11px] font-bold mt-1 tabular-nums opacity-90">Best {bests[id]?.toLocaleString()}</span>
                    )}
                  </button>
                );
              })}
            </div>
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
              accent={BOSSES[boss].accent}
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
              accent={BOSSES[boss].accent}
            />
          </SetupSection>
          <PlayButton color={BOSSES[boss].accent} onClick={() => onStart({ boss, questionTypes: types, direction })}>
            Fight the {BOSSES[boss].name}
          </PlayButton>
        </div>
      </div>
    </div>
  );
}

// ---------- Game ----------

export default function BossBattleMode({ cards, setId, exitUrl }: ModeProps) {
  const navigate = useNavigate();
  const reduce = !!useReducedMotion();
  const exitTo = exitUrl ?? `/sets/${setId}`;
  const exit = useCallback(() => navigate(exitTo), [navigate, exitTo]);
  const groups = useMemo(() => buildEquivalenceGroups(cards), [cards]);
  const heroCtl = useAnimationControls();
  const bossCtl = useAnimationControls();

  const [phase, setPhase] = useState<'config' | 'countdown' | 'game' | 'won' | 'lost'>('config');
  const [config, setConfig] = useState<BattleConfig | null>(null);
  const [turn, setTurn] = useState<Turn | null>(null);
  const [moves, setMoves] = useState<Move[]>([]);
  const [bossMax, setBossMax] = useState(100);
  const [bossHp, setBossHp] = useState(100);
  const [heroHp, setHeroHp] = useState(HERO_MAX);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [countered, setCountered] = useState(0);
  const [charge, setCharge] = useState(0);
  const [shield, setShield] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [lastPoints, setLastPoints] = useState<number | null>(null);
  const [mood, setMood] = useState<MascotMood>('idle');
  const [bossHurt, setBossHurt] = useState(false);
  const [hurtFlash, setHurtFlash] = useState(0);
  const [ending, setEnding] = useState(false);
  const [missed, setMissed] = useState<Card[]>([]);
  const [best, setBest] = useState<ReturnType<typeof submitScore> | undefined>();
  const { popups, push, remove } = usePopups();

  // Handler-only state (never read during render).
  const deckRef = useRef<Card[]>([]);
  const deckPos = useRef(0);
  const movesRef = useRef<Move[]>([]);
  const moveSerial = useRef(0);
  const questionStart = useRef(0);
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const later = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  }, []);
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const playing = phase === 'game';
  const escArmed = useEscToQuit(phase !== 'config', playing, exit);
  const bossDef = config ? BOSSES[config.boss] : BOSSES.golem;

  /** Build turn `n`: a due boss move wins over the next deck card. */
  const makeTurn = useCallback(
    (n: number, cfg: BattleConfig): Turn => {
      const queue = movesRef.current;
      const due = queue.filter((m) => m.due <= n).sort((a, b) => a.due - b.due)[0];
      let card: Card;
      let special = false;
      let label = '';
      if (due) {
        movesRef.current = queue.filter((m) => m.id !== due.id);
        setMoves(movesRef.current);
        card = due.card;
        special = true;
        label = due.label;
      } else {
        const queued = new Set(queue.map((m) => m.card.id));
        let picked: Card | null = null;
        for (let tries = 0; tries <= cards.length; tries++) {
          if (deckPos.current >= deckRef.current.length) {
            deckRef.current = shuffleArray(cards);
            deckPos.current = 0;
          }
          const c = deckRef.current[deckPos.current++];
          if (!queued.has(c.id) || tries === cards.length) {
            picked = c;
            break;
          }
        }
        card = picked ?? cards[0];
      }
      let type = cfg.questionTypes[Math.floor(Math.random() * cfg.questionTypes.length)];
      // Written needs typeable text on both sides; fall back for picture cards.
      if (type === 'written' && (!stripHtml(card.term) || !stripHtml(card.definition))) type = 'multiple-choice';
      const question = buildGameQuestion(card, cards, groups, type, cfg.direction, n);
      return { n, question, special, label };
    },
    [cards, groups],
  );

  const start = useCallback(
    (cfg: BattleConfig) => {
      timers.current.forEach(clearTimeout);
      timers.current.clear();
      deckRef.current = shuffleArray(cards);
      deckPos.current = 0;
      movesRef.current = [];
      const max = bossMaxHp(cards.length, BOSSES[cfg.boss].hpFactor);
      setConfig(cfg);
      setMoves([]);
      setBossMax(max);
      setBossHp(max);
      setHeroHp(HERO_MAX);
      setScore(0);
      setStreak(0);
      setMaxStreak(0);
      setCorrect(0);
      setAnswered(0);
      setCountered(0);
      setCharge(0);
      setShield(false);
      setFeedback(null);
      setSelected(null);
      setLastPoints(null);
      setMood('idle');
      setBossHurt(false);
      setEnding(false);
      setMissed([]);
      setBest(undefined);
      heroCtl.set({ x: 0, y: 0, opacity: 1, scale: 1, rotate: 0 });
      bossCtl.set({ x: 0, y: 0, opacity: 1, scale: 1, rotate: 0, filter: 'brightness(1)' });
      setTurn(makeTurn(1, cfg));
      setPhase('countdown');
    },
    [cards, makeTurn, heroCtl, bossCtl],
  );

  const finish = useCallback(
    (result: 'won' | 'lost', finalScore: number) => {
      if (!config) return;
      setScore(finalScore);
      setBest(submitScore(GAME_ID, setId, finalScore, config.boss));
      setMood(result === 'won' ? 'celebrate' : 'sad');
      setPhase(result);
      playSound(result === 'won' ? 'win' : 'lose');
    },
    [config, setId],
  );

  useEffect(() => {
    if (phase === 'won') return celebrate([bossDef.accent, '#ffd23e', ARENA.hero, '#ffffff']);
  }, [phase, bossDef.accent]);

  const advance = useCallback(() => {
    if (!config || !turn) return;
    setTurn(makeTurn(turn.n + 1, config));
    setFeedback(null);
    setSelected(null);
    setLastPoints(null);
    setMood('idle');
    setBossHurt(false);
    questionStart.current = Date.now();
  }, [config, turn, makeTurn]);

  const answer = useCallback(
    (isRight: boolean) => {
      if (!config || !turn || feedback || ending || !playing) return;
      const seconds = (Date.now() - questionStart.current) / 1000;
      setAnswered((a) => a + 1);
      const def = BOSSES[config.boss];

      if (isRight) {
        playSound('correct');
        const nextStreak = streak + 1;
        const mult = comboMultiplier(nextStreak);
        const crit = seconds <= (turn.question.type === 'written' ? 7 : 3.5);
        const damage = Math.round(BASE_DAMAGE * mult * (crit ? 1.5 : 1) * (turn.special ? COUNTER_BOOST : 1));
        const newBossHp = Math.max(0, bossHp - damage);
        const points = damage * 10;
        const newScore = score + points;
        setStreak(nextStreak);
        setMaxStreak((m) => Math.max(m, nextStreak));
        setCorrect((c) => c + 1);
        setCharge((c) => Math.min(POWER_COST, c + 1));
        setScore(newScore);
        setLastPoints(points);
        setFeedback('correct');
        setMood(nextStreak >= 3 ? 'celebrate' : 'happy');
        if (turn.special) setCountered((c) => c + 1);
        if (mult > comboMultiplier(streak)) {
          playSound('combo');
          push({ text: `${formatMultiplier(mult)} combo`, color: '#ffb020', x: 34, y: 18 });
        }
        if (!reduce) heroCtl.start({ x: [0, 70, 0], transition: { duration: 0.45, times: [0, 0.4, 1] } });
        later(() => {
          setBossHurt(true);
          bossCtl.start(
            reduce
              ? { filter: ['brightness(1)', 'brightness(1.8)', 'brightness(1)'], transition: { duration: 0.3 } }
              : { x: [0, 14, -8, 4, 0], filter: ['brightness(1)', 'brightness(2.4)', 'brightness(1)'], transition: { duration: 0.4 } },
          );
          playSound('land');
          push({
            text: `${turn.special ? 'Countered! ' : crit ? 'Critical! ' : ''}-${damage}`,
            color: crit || turn.special ? '#ffe14d' : '#ffffff',
            x: 62,
            y: 34,
          });
          setBossHp(newBossHp);
        }, reduce ? 0 : 180);

        if (newBossHp <= 0) {
          setEnding(true);
          later(() => {
            playSound('crumble');
            bossCtl.start(
              reduce
                ? { opacity: 0, transition: { duration: 0.3 } }
                : { opacity: [1, 1, 0], y: [0, -10, 50], scale: [1, 1.1, 0.6], rotate: [0, -6, 12], transition: { duration: 1 } },
            );
          }, 500);
          later(() => finish('won', newScore + heroHp * 10 + 500), reduce ? 900 : 1700);
        } else {
          later(() => advance(), reduce ? 700 : 1150);
        }
      } else {
        playSound('wrong');
        const hit = Math.round(def.attack * (turn.special ? SPECIAL_BOOST : 1));
        const blocked = shield;
        const newHero = blocked ? heroHp : Math.max(0, heroHp - hit);
        setStreak(0);
        setCharge((c) => (c >= POWER_COST ? c : 0));
        setFeedback('wrong');
        setLastPoints(null);
        setMissed((m) => (m.some((c) => c.id === turn.question.card.id) ? m : [...m, turn.question.card]));
        // The missed card becomes a boss move, due back in 2–4 turns.
        const move: Move = {
          id: ++moveSerial.current,
          card: turn.question.card,
          label: turn.label || cardLabel(turn.question.card),
          due: turn.n + 2 + Math.floor(Math.random() * 3),
        };
        movesRef.current = [...movesRef.current, move];
        setMoves(movesRef.current);
        if (!reduce) bossCtl.start({ x: [0, -80, 0], transition: { duration: 0.45, times: [0, 0.45, 1] } });
        later(() => {
          if (blocked) {
            setShield(false);
            playSound('boost');
            push({ text: 'Blocked!', color: '#7cd8ff', x: 12, y: 36 });
          } else {
            setHeroHp(newHero);
            setHurtFlash((f) => f + 1);
            playSound('crumble');
            push({ text: `-${hit}`, color: '#ff6b6b', x: 16, y: 36 });
            if (!reduce) heroCtl.start({ x: [0, -10, 8, -5, 0], transition: { duration: 0.35 } });
          }
          setMood(newHero <= 30 ? 'worried' : 'sad');
        }, reduce ? 0 : 200);
        if (newHero <= 0) {
          setEnding(true);
          later(() => finish('lost', score), reduce ? 900 : 1500);
        }
      }
    },
    [config, turn, feedback, ending, playing, streak, bossHp, score, heroHp, shield, push, later, finish, advance, reduce, heroCtl, bossCtl],
  );

  const activatePower = useCallback(
    (kind: 'heal' | 'shield') => {
      if (!playing || ending || charge < POWER_COST) return;
      setCharge(0);
      playSound('boost');
      if (kind === 'heal') {
        setHeroHp((h) => Math.min(HERO_MAX, h + HEAL_AMOUNT));
        push({ text: `+${HEAL_AMOUNT}`, color: ARENA.heroHp, x: 16, y: 34 });
      } else {
        setShield(true);
        push({ text: 'Shield up', color: '#7cd8ff', x: 10, y: 34 });
      }
    },
    [playing, ending, charge, push],
  );

  const question = turn?.question ?? null;
  const onWritten = useCallback((text: string) => question && answer(gradeGameAnswer(question, { written: text })), [question, answer]);
  const onOption = useCallback(
    (option: string) => {
      if (!question || feedback || ending) return;
      setSelected(option);
      answer(gradeGameAnswer(question, { option }));
    },
    [question, feedback, ending, answer],
  );
  const onTrueFalse = useCallback((tf: boolean) => question && answer(gradeGameAnswer(question, { tf })), [question, answer]);
  useAnswerKeys(question, playing && !feedback && !ending, onOption, onTrueFalse);

  useEffect(() => {
    if (!playing || feedback !== 'wrong' || ending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        advance();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing, feedback, ending, advance]);

  if (phase === 'config') return <ConfigScreen onStart={start} setId={setId} />;

  if (phase === 'won' || phase === 'lost') {
    const accuracy = answered > 0 ? correct / answered : 0;
    const heroPct = heroHp / HERO_MAX;
    const stars =
      phase === 'won' ? (heroPct >= 0.7 && accuracy >= 0.85 ? 3 : heroPct >= 0.35 && accuracy >= 0.65 ? 2 : 1) : 0;
    return (
      <div className="relative min-h-[calc(100dvh-8rem)] flex flex-col items-center px-4 pt-24 pb-10">
        <ResultsPanel
          mascot={<Mascot mood={phase === 'won' ? 'celebrate' : 'sad'} color={ARENA.hero} accessory="helmet" size={112} />}
          title={phase === 'won' ? `The ${bossDef.name} is down` : `The ${bossDef.name} won this round`}
          subtitle={
            phase === 'won'
              ? `Beaten in ${answered} turns with ${Math.ceil(heroHp)} HP left.`
              : `It still had ${Math.ceil(bossHp)} HP. Review its moves and try again.`
          }
          stars={stars}
          score={score}
          best={best}
          stats={[
            { label: 'Accuracy', value: `${Math.round(accuracy * 100)}%` },
            { label: 'Best streak', value: maxStreak },
            { label: 'Countered', value: countered },
            { label: 'HP left', value: Math.ceil(heroHp) },
          ]}
          actions={
            <>
              <Button variant="primary" onClick={() => config && start(config)}>Fight again</Button>
              <Button variant="outline" onClick={() => setPhase('config')}>Change boss</Button>
              <Button variant="ghost" onClick={exit}>Exit</Button>
            </>
          }
        />
        {missed.length > 0 && (
          <div className="w-full max-w-md mt-4 rounded-2xl p-4" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            <h3 className="font-extrabold mb-2" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
              Cards the boss used against you
            </h3>
            <ul className="flex flex-col gap-2">
              {missed.map((c) => (
                <li key={c.id} className="rounded-xl p-2.5 text-sm" style={{ background: 'var(--color-muted)', color: 'var(--color-text)' }}>
                  <StudyPair card={c} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  const powered = charge >= POWER_COST;

  return (
    <div className="max-w-3xl mx-auto px-4 py-4">
      <EscBanner show={escArmed} />
      {phase === 'countdown' && (
        <Countdown
          accent={bossDef.accent}
          onDone={() => {
            questionStart.current = Date.now();
            setPhase('game');
          }}
        />
      )}

      <GameTopBar onExit={exit}>
        <ComboMeter streak={streak} />
        <ScoreCounter value={score} />
      </GameTopBar>

      <div className="mt-3">
        <Arena
          boss={config?.boss ?? 'golem'}
          bossHp={bossHp}
          bossMax={bossMax}
          heroHp={heroHp}
          shield={shield}
          mood={mood}
          bossHurt={bossHurt}
          heroCtl={heroCtl}
          bossCtl={bossCtl}
          hurtFlash={hurtFlash}
          special={playing && turn?.special && !feedback ? turn.label : null}
          popups={popups}
          onPopupDone={remove}
        />
      </div>

      {/* Power-up */}
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 mr-1" aria-label={`Power ${charge} of ${POWER_COST}`} role="img">
          {Array.from({ length: POWER_COST }, (_, i) => (
            <span
              key={i}
              className="w-3.5 h-3.5 rounded-full"
              style={{ background: i < charge ? '#ffb020' : 'var(--color-muted)', border: '2px solid var(--color-border)' }}
            />
          ))}
          <span className="text-sm font-semibold ml-1" style={{ color: 'var(--color-text-secondary)' }}>
            {powered ? 'Power ready' : `${POWER_COST} in a row charges a power`}
          </span>
        </div>
        <PowerButton icon={<Heart size={16} fill="currentColor" />} label={`Heal +${HEAL_AMOUNT}`} color="#23875a" edge="#17623f" disabled={!powered || ending || !playing || heroHp >= HERO_MAX} onClick={() => activatePower('heal')} />
        <PowerButton icon={<Shield size={16} fill="currentColor" />} label="Shield" color="#0b74d6" edge="#07539c" disabled={!powered || ending || !playing || shield} onClick={() => activatePower('shield')} />
      </div>

      <MovesStrip moves={moves} turn={turn?.n ?? 1} accent={bossDef.accent} />

      <div className="mt-3">
        <AnimatePresence mode="wait">
          {turn && question && (
            <motion.div
              key={turn.n}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -12 }}
              transition={{ type: 'spring', stiffness: 360, damping: 32 }}
              className="rounded-3xl p-5 sm:p-6"
              style={{
                background: 'var(--color-surface)',
                border: turn.special ? `3px solid ${bossDef.accent}` : '1px solid var(--color-border)',
                boxShadow: 'var(--shadow-card)',
              }}
            >
              <div className="flex items-center justify-between gap-2 mb-2 text-sm font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                <span>Turn {turn.n}</span>
                {turn.special ? (
                  <span className="inline-flex items-center gap-1 font-bold" style={{ color: bossDef.accent }}>
                    <Swords size={14} /> Special attack: answer to counter it
                  </span>
                ) : (
                  <span>Answer fast for a critical hit</span>
                )}
              </div>
              <QuestionPanel
                question={question}
                feedback={feedback}
                selectedOption={selected}
                disabled={!playing || ending}
                onWritten={onWritten}
                onOption={onOption}
                onTrueFalse={onTrueFalse}
                points={lastPoints}
                footer={
                  feedback === 'wrong' && !ending ? (
                    <Button variant="primary" className="w-full mt-3" onClick={advance}>
                      Next turn
                    </Button>
                  ) : null
                }
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function PowerButton({ icon, label, color, edge, disabled, onClick }: { icon: ReactNode; label: string; color: string; edge: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="bsb-focus inline-flex items-center gap-1.5 h-10 px-3.5 rounded-xl text-sm font-extrabold cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 transition-transform active:translate-y-0.5"
      style={{ background: color, color: '#fff', border: 'none', boxShadow: `inset 0 -4px 0 ${edge}`, fontFamily: 'var(--font-display)' }}
    >
      {icon}
      {label}
    </button>
  );
}

function StudyPair({ card }: { card: Card }) {
  return (
    <div className="flex flex-col gap-0.5">
      <StudyContent html={card.term} className="font-bold" />
      <StudyContent html={card.definition} className="opacity-80" />
    </div>
  );
}
