import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Crown, Feather, Flame, Gem, Leaf, Moon, Plus, Sparkles, Zap, type LucideIcon } from 'lucide-react';
import type { StudySet } from '@/types';
import { useSetStore } from '@/stores/useSetStore';
import { buildEquivalenceGroups } from '@/lib/equivalence';
import { buildGameQuestion, gradeGameAnswer, type GameQuestion } from '@/lib/gameQuestions';
import { recordReview } from '@/lib/spaced-repetition';
import { shuffleArray } from '@/lib/utils';
import { submitScore } from '@/lib/gameRecords';
import { playSound } from '@/lib/gameSounds';
import { Spinner } from '@/components/ui/Spinner';
import { Mascot, type MascotMood } from '@/components/games/Mascot';
import { ScorePopups } from '@/components/games/ScorePopup';
import {
  ComboMeter,
  EscBanner,
  GameTopBar,
  PlayButton,
  QuestionPanel,
  ResultsPanel,
  ScoreCounter,
  type Feedback,
} from '@/components/games/GameKit';
import { celebrate, comboMultiplier, useAnswerKeys, useEscToQuit, usePopups } from '@/components/games/gameLogic';
import {
  QUEST_SIZE,
  addDays,
  completeToday,
  countUsableCards,
  currentStreak,
  dateKey,
  isQuizzable,
  keyToDate,
  pickReward,
  planQuest,
  readDailyState,
  rewardById,
  todayKey,
  type DailyReward,
  type DailyState,
} from '@/lib/dailyQuest';

// ============================================================
// Daily Quest — one short review a day across every set, a streak
// calendar, and a reward chest to open at the end.
// ============================================================

// Scene art — a dusk hillside, fixed so it reads the same in both themes.
const SCENE = {
  skyTop: '#2d1b4e',
  skyBottom: '#f08a5d',
  sun: '#ffd27a',
  hillFar: '#5b3a6e',
  hillNear: '#2a1a40',
  wood: '#9a5a32',
  woodDark: '#62341a',
  gold: '#ffc53d',
  goldDark: '#b3820f',
  ray: 'rgba(255,221,140,0.28)',
  accent: '#f07c3a',
  accentEdge: '#b3521c',
};

const REWARD_ICONS: Record<string, LucideIcon> = {
  comet: Sparkles,
  quill: Feather,
  owl: Moon,
  leaf: Leaf,
  flame: Flame,
  gem: Gem,
  crown: Crown,
  bolt: Zap,
};

const POINTS_PER_CORRECT = 100;

interface QuestItem {
  question: GameQuestion;
  setId: string;
  cardId: string;
  setTitle: string;
}

type Phase = 'home' | 'playing' | 'chest' | 'results';

interface RunStats {
  correct: number;
  total: number;
  score: number;
  bestStreak: number;
  bonus: boolean;
}

function buildQuest(sets: StudySet[], bonus: boolean): QuestItem[] {
  const plan = planQuest(sets, Date.now(), QUEST_SIZE, true);
  const byId = new Map(sets.map((s) => [s.id, s]));
  const pools = new Map<string, { usable: StudySet['cards']; groups: ReturnType<typeof buildEquivalenceGroups> }>();
  // Bonus rounds shuffle so a replay doesn't feel identical.
  const picks = bonus ? shuffleArray(plan.picks) : plan.picks;
  const items: QuestItem[] = [];
  picks.forEach((p, i) => {
    const set = byId.get(p.setId);
    const card = set?.cards.find((c) => c.id === p.cardId);
    if (!set || !card) return;
    let pool = pools.get(set.id);
    if (!pool) {
      const usable = set.cards.filter(isQuizzable);
      pool = { usable, groups: buildEquivalenceGroups(usable) };
      pools.set(set.id, pool);
    }
    const type = Math.random() < 0.7 ? 'multiple-choice' : 'true-false';
    items.push({
      question: buildGameQuestion(card, pool.usable, pool.groups, type, 'term-to-def', i),
      setId: set.id,
      cardId: card.id,
      setTitle: set.title,
    });
  });
  return items;
}

// ---------- Page ----------

export default function DailyQuestPage() {
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

  if (!loaded && sets.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }
  return <DailyQuest sets={sets} />;
}

function DailyQuest({ sets }: { sets: StudySet[] }) {
  const navigate = useNavigate();
  const [today] = useState(todayKey);
  const [daily, setDaily] = useState<DailyState>(readDailyState);
  const [phase, setPhase] = useState<Phase>('home');
  const [items, setItems] = useState<QuestItem[]>([]);
  const [bonus, setBonus] = useState(false);
  const [stats, setStats] = useState<RunStats | null>(null);
  const [reward, setReward] = useState<DailyReward | null>(null);
  const [best, setBest] = useState<{ previousBest: number | null; isNewBest: boolean } | undefined>(undefined);

  const doneToday = daily.days.includes(today);
  const usableCards = useMemo(() => countUsableCards(sets), [sets]);
  const [now] = useState(() => Date.now());
  const plan = useMemo(() => planQuest(sets, now, QUEST_SIZE, true), [sets, now]);

  const start = (asBonus: boolean) => {
    const quest = buildQuest(useSetStore.getState().sets, asBonus);
    if (quest.length === 0) return;
    playSound('go');
    setItems(quest);
    setBonus(asBonus);
    setStats(null);
    setPhase('playing');
  };

  const finish = (run: RunStats) => {
    setStats(run);
    setBest(submitScore('daily-quest', run.bonus ? 'bonus' : 'all', run.score));
    if (!run.bonus) {
      const r = pickReward();
      const next = completeToday(r.id);
      setDaily(next);
      setReward(rewardById(next.rewards[today]) ?? r);
      setPhase('chest');
    } else {
      setPhase('results');
    }
  };

  if (usableCards === 0) {
    return (
      <div className="max-w-xl mx-auto px-4 py-10">
        <SceneCard compact>
          <div className="flex items-end justify-center gap-3 flex-1 pb-4">
            <Mascot mood="idle" color={SCENE.accent} size={80} />
          </div>
        </SceneCard>
        <div className="text-center mt-6">
          <h1 className="text-3xl font-extrabold" style={{ color: 'var(--color-text)' }}>
            Nothing to review yet
          </h1>
          <p className="mt-2" style={{ color: 'var(--color-text-secondary)' }}>
            Daily Quest mixes cards from all your sets. Make a set with a few cards and come back for your first quest.
          </p>
          <Link
            to="/sets/new"
            className="inline-flex items-center gap-2 mt-5 h-12 px-5 rounded-2xl font-extrabold focus-visible:outline-3 focus-visible:outline-offset-2"
            style={{ background: SCENE.accent, color: '#fff', boxShadow: `inset 0 -5px 0 ${SCENE.accentEdge}`, fontFamily: 'var(--font-display)' }}
          >
            <Plus size={18} /> Create a set
          </Link>
        </div>
      </div>
    );
  }

  if (phase === 'playing') {
    return (
      <QuestRun
        key={items.map((i) => i.cardId).join('|')}
        items={items}
        bonus={bonus}
        onExit={() => setPhase('home')}
        onFinish={finish}
      />
    );
  }

  if (phase === 'chest' && reward && stats) {
    return (
      <div className="max-w-xl mx-auto px-4 py-6">
        <ChestScene reward={reward} streak={currentStreak(daily.days, today)} onContinue={() => setPhase('results')} />
      </div>
    );
  }

  if (phase === 'results' && stats) {
    const pct = stats.total ? stats.correct / stats.total : 0;
    const stars = pct >= 0.9 ? 3 : pct >= 0.7 ? 2 : pct >= 0.4 ? 1 : 0;
    return (
      <div className="max-w-xl mx-auto px-4 pt-24 pb-10">
        <ResultsPanel
          mascot={<Mascot mood={stars >= 2 ? 'celebrate' : 'happy'} color={SCENE.accent} size={110} />}
          title={stats.bonus ? 'Bonus round done' : 'Quest complete'}
          subtitle={stats.bonus ? "Bonus rounds don't change your streak." : `Day ${currentStreak(daily.days, today)} of your streak.`}
          stars={stars}
          score={stats.score}
          best={best}
          stats={[
            { label: 'Correct', value: `${stats.correct}/${stats.total}` },
            { label: 'Accuracy', value: `${Math.round(pct * 100)}%` },
            { label: 'Best run', value: stats.bestStreak },
          ]}
          actions={
            <>
              <button
                type="button"
                onClick={() => setPhase('home')}
                autoFocus
                className="h-12 px-5 rounded-2xl font-extrabold cursor-pointer focus-visible:outline-3 focus-visible:outline-offset-2"
                style={{ background: SCENE.accent, color: '#fff', border: 'none', boxShadow: `inset 0 -5px 0 ${SCENE.accentEdge}`, fontFamily: 'var(--font-display)' }}
              >
                See my week
              </button>
              <button
                type="button"
                onClick={() => navigate('/')}
                className="h-12 px-5 rounded-2xl font-bold cursor-pointer focus-visible:outline-3 focus-visible:outline-offset-2"
                style={{ background: 'var(--color-muted)', color: 'var(--color-text)', border: 'none' }}
              >
                Home
              </button>
            </>
          }
        />
      </div>
    );
  }

  // Home: today's quest, or "come back tomorrow" once done.
  const streak = currentStreak(daily.days, today);
  const todaysReward = rewardById(daily.rewards[today]);
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-4">
      <div className="rounded-3xl overflow-hidden" style={{ boxShadow: '0 20px 50px rgba(0,0,0,0.18)' }}>
        <SceneCard compact>
          <div className="flex items-end justify-center gap-3 flex-1 pb-3 px-4">
            <Mascot mood={doneToday ? 'celebrate' : 'happy'} color={SCENE.accent} accessory="headband" size={84} />
            <div className="pb-3 text-left min-w-0">
              <h1 className="text-3xl font-extrabold" style={{ color: '#fff', fontFamily: 'var(--font-display)' }}>
                {doneToday ? 'Quest complete' : "Today's quest"}
              </h1>
              <p className="text-sm font-semibold" style={{ color: '#ffe3cf' }}>
                {doneToday ? 'Come back tomorrow to keep your streak going.' : 'About five minutes of review from all your sets.'}
              </p>
            </div>
          </div>
        </SceneCard>
        <div className="p-5 sm:p-6 flex flex-col gap-5" style={{ background: 'var(--color-surface)' }}>
          <StreakSummary streak={streak} best={Math.max(daily.best, streak)} doneToday={doneToday} />
          <WeekRow days={daily.days} today={today} />
          {doneToday ? (
            <div className="flex flex-col gap-3">
              {todaysReward && <RewardRow reward={todaysReward} />}
              <button
                type="button"
                onClick={() => start(true)}
                className="min-h-12 py-2 px-4 leading-tight rounded-2xl font-extrabold cursor-pointer focus-visible:outline-3 focus-visible:outline-offset-2"
                style={{ background: 'var(--color-muted)', color: 'var(--color-text)', border: 'none', fontFamily: 'var(--font-display)' }}
              >
                Bonus round (doesn't count for your streak)
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                {planSummary(plan.due, plan.fresh, plan.extra, plan.setCount)}
              </p>
              <PlayButton color={SCENE.accent} onClick={() => start(false)}>
                Start quest
              </PlayButton>
            </div>
          )}
        </div>
      </div>
      <MonthCalendar days={daily.days} today={today} />
    </div>
  );
}

function planSummary(due: number, fresh: number, extra: number, setCount: number): string {
  const parts: string[] = [];
  if (due) parts.push(`${due} due for review`);
  if (fresh) parts.push(`${fresh} new`);
  if (extra) parts.push(`${extra} coming up soon`);
  const total = due + fresh + extra;
  const from = setCount === 1 ? 'from 1 set' : `from ${setCount} sets`;
  return `${total} ${total === 1 ? 'card' : 'cards'} ${from}: ${parts.join(', ')}.`;
}

// ---------- Scene ----------

function SceneCard({ children, compact, height }: { children?: ReactNode; compact?: boolean; height?: number }) {
  return (
    <div
      className="relative overflow-hidden flex flex-col"
      style={{
        minHeight: height ? `${height / 16}rem` : compact ? '9.375rem' : '20rem',
        background: `linear-gradient(180deg, ${SCENE.skyTop} 0%, #7a3e6a 55%, ${SCENE.skyBottom} 100%)`,
      }}
    >
      <svg aria-hidden className="absolute inset-0 w-full h-full" viewBox="0 0 400 150" preserveAspectRatio="none">
        <circle cx="300" cy="104" r="30" fill={SCENE.sun} opacity="0.9" />
        <path d="M0 150 L0 105 Q80 70 170 100 T400 92 L400 150 Z" fill={SCENE.hillFar} />
        <path d="M0 150 L0 125 Q120 100 240 122 T400 118 L400 150 Z" fill={SCENE.hillNear} />
        {[30, 70, 120, 200, 240, 350, 380].map((x, i) => (
          <circle key={x} cx={x} cy={12 + ((i * 17) % 40)} r={i % 3 === 0 ? 1.6 : 1} fill="#fff" opacity="0.7" />
        ))}
      </svg>
      <div className="relative flex-1 flex flex-col">{children}</div>
    </div>
  );
}

// ---------- Streak + calendar ----------

function StreakSummary({ streak, best, doneToday }: { streak: number; best: number; doneToday: boolean }) {
  return (
    <div className="flex items-center gap-4">
      <div
        className="flex items-center justify-center w-16 h-16 rounded-2xl shrink-0"
        style={{ background: streak > 0 ? SCENE.accent : 'var(--color-muted)', boxShadow: streak > 0 ? `inset 0 -5px 0 ${SCENE.accentEdge}` : 'none' }}
        aria-hidden
      >
        <Flame size={34} style={{ width: '2.125rem', height: '2.125rem' }} color={streak > 0 ? '#fff' : 'var(--color-text-tertiary)'} fill={streak > 0 ? '#ffd27a' : 'none'} />
      </div>
      <div className="min-w-0">
        <div className="text-3xl font-extrabold tabular-nums leading-none" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
          {streak} {streak === 1 ? 'day' : 'days'}
        </div>
        <div className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
          {streak === 0
            ? 'Finish a quest to start a streak.'
            : doneToday
              ? `Current streak. Best: ${best}.`
              : `Streak alive. Finish today's quest to extend it. Best: ${best}.`}
        </div>
      </div>
    </div>
  );
}

function WeekRow({ days, today }: { days: string[]; today: string }) {
  const done = new Set(days);
  const keys = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  return (
    <ol className="grid grid-cols-7 gap-1.5 list-none p-0 m-0" aria-label="Last 7 days">
      {keys.map((k) => {
        const d = keyToDate(k);
        const isDone = done.has(k);
        const isToday = k === today;
        const label = d.toLocaleDateString(undefined, { weekday: 'short' });
        return (
          <li key={k} className="flex flex-col items-center gap-1" aria-label={`${d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}: ${isDone ? 'quest done' : 'no quest'}`}>
            <span className="text-xs font-semibold" style={{ color: isToday ? 'var(--color-text)' : 'var(--color-text-tertiary)' }} aria-hidden>
              {label.slice(0, 2)}
            </span>
            <span
              aria-hidden
              className="flex items-center justify-center w-full max-w-10 aspect-square rounded-full"
              style={{
                background: isDone ? SCENE.accent : 'var(--color-muted)',
                boxShadow: isDone ? `inset 0 -3px 0 ${SCENE.accentEdge}` : 'none',
                outline: isToday ? `2px solid ${SCENE.accent}` : 'none',
                outlineOffset: 2,
              }}
            >
              {isDone ? <Flame size={18} color="#fff" fill="#ffd27a" /> : <span className="text-xs font-bold" style={{ color: 'var(--color-text-tertiary)' }}>{d.getDate()}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function MonthCalendar({ days, today }: { days: string[]; today: string }) {
  const done = new Set(days);
  const t = keyToDate(today);
  const first = new Date(t.getFullYear(), t.getMonth(), 1);
  const daysInMonth = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  const lead = first.getDay();
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => dateKey(new Date(t.getFullYear(), t.getMonth(), i + 1))),
  ];
  // Weekday initials for a Sunday-first grid, from a known Sunday.
  const heads = Array.from({ length: 7 }, (_, i) => new Date(2023, 0, 1 + i).toLocaleDateString(undefined, { weekday: 'narrow' }));
  const count = cells.filter((c) => c && done.has(c)).length;
  return (
    <section
      className="rounded-3xl p-5"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      aria-label="This month"
    >
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-lg font-extrabold" style={{ color: 'var(--color-text)' }}>
          {t.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </h2>
        <span className="text-sm tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
          {count} {count === 1 ? 'quest' : 'quests'}
        </span>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center" role="grid">
        {heads.map((h, i) => (
          <span key={i} className="text-xs font-bold pb-1" style={{ color: 'var(--color-text-tertiary)' }} aria-hidden>
            {h}
          </span>
        ))}
        {cells.map((c, i) =>
          c === null ? (
            <span key={`e${i}`} aria-hidden />
          ) : (
            <span
              key={c}
              role="gridcell"
              aria-label={`${keyToDate(c).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}${done.has(c) ? ', quest done' : ''}`}
              className="mx-auto flex items-center justify-center w-full max-w-8 aspect-square rounded-full text-xs font-bold tabular-nums"
              style={{
                background: done.has(c) ? SCENE.accent : 'transparent',
                color: done.has(c) ? '#fff' : c > today ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)',
                outline: c === today ? `2px solid ${SCENE.accent}` : 'none',
                outlineOffset: 1,
              }}
            >
              {keyToDate(c).getDate()}
            </span>
          ),
        )}
      </div>
    </section>
  );
}

function RewardBadge({ reward, size = 64, rem }: { reward: DailyReward; size?: number; rem?: boolean }) {
  const Icon = REWARD_ICONS[reward.id] ?? Sparkles;
  const dim = rem ? `${size / 16}rem` : size;
  return (
    <span
      className="flex items-center justify-center rounded-full shrink-0"
      style={{
        width: dim,
        height: dim,
        background: reward.color,
        boxShadow: `inset 0 -${Math.round(size / 12)}px 0 ${reward.edge}, 0 0 0 ${Math.round(size / 16)}px ${SCENE.gold}`,
      }}
      aria-hidden
    >
      <Icon size={size * 0.5} color="#fff" strokeWidth={2.2} />
    </span>
  );
}

function RewardRow({ reward }: { reward: DailyReward }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl p-3" style={{ background: 'var(--color-muted)' }}>
      <RewardBadge reward={reward} size={44} rem />
      <div className="min-w-0">
        <div className="font-extrabold" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
          Today's reward: {reward.name}
        </div>
        <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {reward.blurb}
        </div>
      </div>
    </div>
  );
}

// ---------- Chest (the memorable moment) ----------

function ChestScene({ reward, streak, onContinue }: { reward: DailyReward; streak: number; onContinue: () => void }) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => () => stopRef.current?.(), []);

  const openChest = () => {
    if (open) return;
    setOpen(true);
    playSound('win');
    stopRef.current = celebrate([SCENE.gold, reward.color, '#ffffff', SCENE.accent], 1100);
  };

  return (
    <div className="rounded-3xl overflow-hidden" style={{ boxShadow: '0 20px 50px rgba(0,0,0,0.22)' }}>
      <SceneCard height={380}>
        <div className="flex flex-col items-center flex-1 pt-5 px-4 text-center">
          <h1 className="text-2xl sm:text-3xl font-extrabold" style={{ color: '#fff', fontFamily: 'var(--font-display)' }}>
            {open ? reward.name : 'Quest complete!'}
          </h1>
          <p className="text-sm font-semibold mt-1 min-h-[1.25rem]" style={{ color: '#ffe3cf' }} aria-live="polite">
            {open ? reward.blurb : 'Your reward chest is here.'}
          </p>
          <div className="relative mt-auto mb-4" style={{ width: 220, height: 220 }}>
            <AnimatePresence>
              {open && (
                <motion.div
                  key="badge"
                  className="absolute left-1/2 z-10"
                  style={{ top: 70, marginLeft: -40 }}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: 40, scale: 0.3 }}
                  animate={reduce ? { opacity: 1, y: -70 } : { opacity: 1, y: -70, scale: 1 }}
                  transition={reduce ? { duration: 0.2 } : { type: 'spring', stiffness: 170, damping: 12, delay: 0.25 }}
                >
                  <RewardBadge reward={reward} size={80} />
                </motion.div>
              )}
            </AnimatePresence>
            <button
              type="button"
              onClick={openChest}
              disabled={open}
              autoFocus
              aria-label={open ? `Chest opened: ${reward.name}` : 'Open the reward chest'}
              className="absolute inset-0 cursor-pointer disabled:cursor-default rounded-3xl focus-visible:outline-3 focus-visible:outline-offset-4"
              style={{ background: 'transparent', border: 'none', outlineColor: '#fff' }}
            >
              <Chest open={open} reduce={!!reduce} />
            </button>
          </div>
        </div>
      </SceneCard>
      <div className="p-5 flex flex-col items-center gap-3 text-center" style={{ background: 'var(--color-surface)' }}>
        {open ? (
          <>
            <p className="font-bold" style={{ color: 'var(--color-text)' }}>
              <Flame size={16} className="inline -mt-1 mr-1" color={SCENE.accent} fill={SCENE.accent} />
              {streak === 1 ? 'Day 1. A streak starts here.' : `${streak} days in a row.`}
            </p>
            <div className="w-full max-w-xs">
              <PlayButton color={SCENE.accent} onClick={onContinue}>
                Continue
              </PlayButton>
            </div>
          </>
        ) : (
          <p className="font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
            Tap the chest to open it.
          </p>
        )}
      </div>
    </div>
  );
}

function Chest({ open, reduce }: { open: boolean; reduce: boolean }) {
  return (
    <svg viewBox="0 0 200 200" width="100%" height="100%" aria-hidden style={{ overflow: 'visible' }}>
      {/* light rays */}
      <motion.g
        initial={false}
        animate={{ opacity: open ? 1 : 0, scale: open ? 1 : 0.4 }}
        transition={{ duration: reduce ? 0.15 : 0.5, delay: reduce ? 0 : 0.15 }}
        style={{ originX: '100px', originY: '112px' }}
      >
        {[-70, -40, -12, 12, 40, 70].map((a) => (
          <polygon key={a} points="100,112 90,10 110,10" fill={SCENE.ray} transform={`rotate(${a} 100 112)`} />
        ))}
      </motion.g>
      <ellipse cx="100" cy="182" rx="78" ry="9" fill="rgba(0,0,0,0.3)" />
      {/* base */}
      <rect x="28" y="112" width="144" height="68" rx="8" fill={SCENE.wood} />
      <rect x="28" y="168" width="144" height="12" rx="6" fill={SCENE.woodDark} />
      <rect x="44" y="112" width="12" height="68" fill={SCENE.gold} />
      <rect x="144" y="112" width="12" height="68" fill={SCENE.gold} />
      <rect x="28" y="112" width="144" height="8" fill={SCENE.goldDark} />
      {/* glow inside when open */}
      <motion.rect
        x="34"
        y="104"
        width="132"
        height="12"
        rx="4"
        fill="#fff1c2"
        initial={false}
        animate={{ opacity: open ? 1 : 0 }}
        transition={{ duration: 0.2 }}
      />
      {/* lid, hinged at the back-left */}
      <motion.g
        initial={false}
        animate={open ? (reduce ? { y: -18 } : { rotate: -32, y: -8, x: -6 }) : { rotate: 0, y: 0, x: 0 }}
        transition={reduce ? { duration: 0.15 } : { type: 'spring', stiffness: 220, damping: 11 }}
        style={{ originX: '28px', originY: '112px' }}
      >
        <path d="M28 112 L28 86 Q28 58 100 58 Q172 58 172 86 L172 112 Z" fill={SCENE.wood} />
        <path d="M28 104 L172 104 L172 112 L28 112 Z" fill={SCENE.woodDark} />
        <path d="M44 112 L44 65 Q50 62 56 61 L56 112 Z" fill={SCENE.gold} />
        <path d="M144 112 L144 61 Q150 62 156 65 L156 112 Z" fill={SCENE.gold} />
        <rect x="88" y="98" width="24" height="26" rx="4" fill={SCENE.gold} />
        <circle cx="100" cy="108" r="3.5" fill={SCENE.woodDark} />
        <rect x="98.5" y="109" width="3" height="8" rx="1.5" fill={SCENE.woodDark} />
      </motion.g>
    </svg>
  );
}

// ---------- The run ----------

function QuestRun({
  items,
  bonus,
  onExit,
  onFinish,
}: {
  items: QuestItem[];
  bonus: boolean;
  onExit: () => void;
  onFinish: (run: RunStats) => void;
}) {
  const [index, setIndex] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [points, setPoints] = useState<number | null>(null);
  const [mood, setMood] = useState<MascotMood>('idle');
  const { popups, push, remove } = usePopups();
  // Reviews are written one after another so each reads the set the previous
  // one saved (two answers from the same set must not clobber each other).
  const saveChain = useRef<Promise<void>>(Promise.resolve());

  const item = items[index];
  const question = item?.question ?? null;

  const saveReview = useCallback((setId: string, cardId: string, ok: boolean) => {
    saveChain.current = saveChain.current
      .then(async () => {
        const store = useSetStore.getState();
        const latest = store.sets.find((s) => s.id === setId);
        if (!latest) return;
        const idx = latest.cards.findIndex((c) => c.id === cardId);
        if (idx < 0) return;
        const updatedCards = latest.cards.slice();
        updatedCards[idx] = recordReview(latest.cards[idx], ok ? 4 : 1, 'game');
        await store.updateSet({ ...latest, cards: updatedCards, updatedAt: Date.now() }, { background: true });
      })
      .catch(() => {
        // a failed local write shouldn't break the quest
      });
  }, []);

  const answer = useCallback(
    (a: { written: string } | { option: string } | { tf: boolean }) => {
      if (!item || feedback) return;
      const ok = gradeGameAnswer(item.question, a);
      if ('option' in a) setSelected(a.option);
      setFeedback(ok ? 'correct' : 'wrong');
      saveReview(item.setId, item.cardId, ok);
      if (ok) {
        const nextStreak = streak + 1;
        const gained = Math.round(POINTS_PER_CORRECT * comboMultiplier(nextStreak));
        setStreak(nextStreak);
        setBestStreak((b) => Math.max(b, nextStreak));
        setCorrect((c) => c + 1);
        setScore((s) => s + gained);
        setPoints(gained);
        setMood('happy');
        playSound(nextStreak >= 3 && nextStreak % 2 === 1 ? 'combo' : 'correct');
        push({ text: `+${gained}`, x: 50, y: 30, color: SCENE.accent });
      } else {
        setStreak(0);
        setPoints(null);
        setMood('sad');
        playSound('wrong');
      }
    },
    [item, feedback, streak, saveReview, push],
  );

  const onOption = useCallback((option: string) => answer({ option }), [answer]);
  const onTrueFalse = useCallback((tf: boolean) => answer({ tf }), [answer]);
  const onWritten = useCallback((written: string) => answer({ written }), [answer]);

  useAnswerKeys(question, feedback === null, onOption, onTrueFalse);
  const armed = useEscToQuit(true, true, onExit);

  const next = () => {
    if (index + 1 >= items.length) {
      onFinish({ correct, total: items.length, score, bestStreak, bonus });
      return;
    }
    setIndex(index + 1);
    setFeedback(null);
    setSelected(null);
    setPoints(null);
    setMood('idle');
  };

  if (!item || !question) return null;
  const progress = (index + (feedback ? 1 : 0)) / items.length;

  return (
    <div className="max-w-2xl mx-auto px-4 py-4">
      <EscBanner show={armed} />
      <GameTopBar onExit={onExit}>
        <ComboMeter streak={streak} />
        <ScoreCounter value={score} />
      </GameTopBar>

      <div className="mt-3 flex items-center gap-3">
        <span className="text-sm font-bold tabular-nums whitespace-nowrap" style={{ color: 'var(--color-text-secondary)' }}>
          {index + 1} of {items.length}
        </span>
        <div
          className="flex-1 h-3 rounded-full overflow-hidden"
          style={{ background: 'var(--color-muted)' }}
          role="progressbar"
          aria-label="Quest progress"
          aria-valuemin={0}
          aria-valuemax={items.length}
          aria-valuenow={index + (feedback ? 1 : 0)}
        >
          <div
            className="h-full rounded-full transition-[width] duration-300"
            style={{ width: `${progress * 100}%`, background: SCENE.accent }}
          />
        </div>
        {bonus && (
          <span className="text-xs font-bold px-2 py-1 rounded-full" style={{ background: 'var(--color-muted)', color: 'var(--color-text-secondary)' }}>
            Bonus
          </span>
        )}
      </div>

      <div
        className="relative mt-4 rounded-3xl p-5 sm:p-6"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: '0 12px 30px rgba(0,0,0,0.08)' }}
      >
        <ScorePopups popups={popups} onDone={remove} />
        <div className="flex items-center justify-between gap-3 mb-3">
          <span
            className="text-xs font-bold px-2.5 py-1 rounded-full truncate max-w-[70%]"
            style={{ background: 'var(--color-muted)', color: 'var(--color-text-secondary)' }}
          >
            {item.setTitle}
          </span>
          <Mascot mood={mood} color={SCENE.accent} accessory="headband" size={48} />
        </div>
        <QuestionPanel
          key={index}
          question={question}
          feedback={feedback}
          selectedOption={selected}
          onWritten={onWritten}
          onOption={onOption}
          onTrueFalse={onTrueFalse}
          points={points}
          footer={
            <div className="mt-4">
              <button
                type="button"
                onClick={next}
                autoFocus
                className="w-full h-12 rounded-2xl font-extrabold cursor-pointer focus-visible:outline-3 focus-visible:outline-offset-2"
                style={{
                  background: SCENE.accent,
                  color: '#fff',
                  border: 'none',
                  boxShadow: `inset 0 -5px 0 ${SCENE.accentEdge}`,
                  fontFamily: 'var(--font-display)',
                }}
              >
                {index + 1 >= items.length ? (bonus ? 'Finish' : 'Open your reward') : 'Next'}
              </button>
            </div>
          }
        />
      </div>
    </div>
  );
}
