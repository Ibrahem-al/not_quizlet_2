import { useEffect, useMemo, useRef, useState } from 'react';
import PageTransition from '@/components/layout/PageTransition';
import { Card } from '@/components/ui/Card';
import { useSetStore } from '@/stores/useSetStore';
import { formatDuration } from '@/lib/utils';
import type { ReviewLog } from '@/types';

/** Animate a number counting up from 0 to target. */
function useAnimatedCounter(target: number, duration = 800): number {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (target === 0) {
      setValue(0);
      return;
    }
    const start = performance.now();
    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out quad
      const eased = 1 - (1 - progress) * (1 - progress);
      setValue(Math.round(eased * target));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return value;
}

/** Get a date string (YYYY-MM-DD) for a timestamp. */
function dateKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function StatsPage() {
  const sets = useSetStore((s) => s.sets);
  const loadSets = useSetStore((s) => s.loadSets);

  useEffect(() => {
    loadSets();
  }, [loadSets]);

  // Gather all review logs
  const allLogs = useMemo(() => {
    const logs: ReviewLog[] = [];
    for (const set of sets) {
      for (const card of set.cards) {
        for (const log of card.history) {
          logs.push(log);
        }
      }
    }
    return logs;
  }, [sets]);

  // Compute aggregate stats
  const totalReviews = allLogs.length;
  const totalTimeMs = useMemo(
    () => allLogs.reduce((sum, l) => sum + l.timeSpent, 0),
    [allLogs],
  );
  const bestStreak = useMemo(
    () => Math.max(0, ...sets.map((s) => s.studyStats.streakDays)),
    [sets],
  );

  const animatedReviews = useAnimatedCounter(totalReviews);
  const animatedStreak = useAnimatedCounter(bestStreak);

  // Heatmap data: last 84 days (12 weeks)
  const heatmapData = useMemo(() => {
    const map = new Map<string, number>();
    for (const log of allLogs) {
      const key = dateKey(log.date);
      map.set(key, (map.get(key) ?? 0) + 1);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cells: { date: string; count: number; dayOfWeek: number }[] = [];
    for (let i = 83; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = dateKey(d.getTime());
      cells.push({
        date: key,
        count: map.get(key) ?? 0,
        dayOfWeek: d.getDay(),
      });
    }
    return cells;
  }, [allLogs]);

  // Reviews by mode
  const modeDistribution = useMemo(() => {
    const counts: Record<string, number> = {
      flashcards: 0,
      learn: 0,
      match: 0,
      test: 0,
    };
    for (const log of allLogs) {
      if (log.mode in counts) {
        counts[log.mode]++;
      }
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
    return Object.entries(counts).map(([mode, count]) => ({
      mode,
      count,
      percentage: Math.round((count / total) * 100),
    }));
  }, [allLogs]);

  const modeColors: Record<string, string> = {
    flashcards: 'var(--color-primary)',
    learn: 'var(--color-success)',
    match: 'var(--color-warning)',
    test: 'var(--color-info, var(--color-primary))',
  };

  // Last 28 days bar chart
  const last28Days = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const map = new Map<string, number>();
    for (const log of allLogs) {
      const key = dateKey(log.date);
      map.set(key, (map.get(key) ?? 0) + 1);
    }

    const bars: { date: string; count: number; label: string }[] = [];
    let maxCount = 0;
    for (let i = 27; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = dateKey(d.getTime());
      const count = map.get(key) ?? 0;
      if (count > maxCount) maxCount = count;
      bars.push({
        date: key,
        count,
        label: `${d.getMonth() + 1}/${d.getDate()}`,
      });
    }
    return { bars, maxCount: maxCount || 1 };
  }, [allLogs]);

  function heatmapColor(count: number): string {
    if (count === 0) return 'var(--color-muted)';
    if (count <= 2) return 'color-mix(in srgb, var(--color-primary) 30%, var(--color-muted))';
    if (count <= 5) return 'color-mix(in srgb, var(--color-primary) 60%, var(--color-muted))';
    return 'var(--color-primary)';
  }

  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    date: string;
    count: number;
  } | null>(null);

  return (
    <PageTransition>
      <div className="max-w-5xl mx-auto px-4 py-6">
        <h1
          className="text-2xl font-bold mb-6"
          style={{ color: 'var(--color-text)', fontFamily: 'var(--font-sans)' }}
        >
          Statistics
        </h1>

        {/* Top stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <Card>
            <p
              className="text-sm font-medium mb-1"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Total Reviews
            </p>
            <p
              className="text-3xl font-bold"
              style={{ color: 'var(--color-primary)' }}
            >
              {animatedReviews.toLocaleString()}
            </p>
          </Card>
          <Card>
            <p
              className="text-sm font-medium mb-1"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Time Studied
            </p>
            <p
              className="text-3xl font-bold"
              style={{ color: 'var(--color-primary)' }}
            >
              {formatDuration(totalTimeMs)}
            </p>
          </Card>
          <Card>
            <p
              className="text-sm font-medium mb-1"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Best Streak
            </p>
            <p
              className="text-3xl font-bold"
              style={{ color: 'var(--color-primary)' }}
            >
              {animatedStreak} day{bestStreak === 1 ? '' : 's'}
            </p>
          </Card>
        </div>

        {/* Study Heatmap */}
        <Card className="mb-8">
          <h2
            className="text-base font-semibold mb-4"
            style={{ color: 'var(--color-text)' }}
          >
            Study Heatmap
          </h2>
          <div className="relative">
            <div
              className="grid gap-1"
              style={{
                gridTemplateColumns: 'repeat(12, 1fr)',
                gridTemplateRows: 'repeat(7, 1fr)',
              }}
            >
              {heatmapData.map((cell, i) => (
                <div
                  key={cell.date}
                  className="aspect-square rounded-sm cursor-default"
                  style={{
                    background: heatmapColor(cell.count),
                    minWidth: 0,
                    borderRadius: '3px',
                  }}
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setTooltip({
                      x: rect.left + rect.width / 2,
                      y: rect.top - 8,
                      date: cell.date,
                      count: cell.count,
                    });
                  }}
                  onMouseLeave={() => setTooltip(null)}
                />
              ))}
            </div>
            {tooltip && (
              <div
                className="fixed z-50 px-2 py-1 text-xs rounded pointer-events-none"
                style={{
                  left: tooltip.x,
                  top: tooltip.y,
                  transform: 'translate(-50%, -100%)',
                  background: 'var(--color-text)',
                  color: 'var(--color-background)',
                  borderRadius: 'var(--radius-sm)',
                  whiteSpace: 'nowrap',
                }}
              >
                {tooltip.date}: {tooltip.count} review
                {tooltip.count === 1 ? '' : 's'}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 mt-3 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            <span>Less</span>
            {[0, 2, 4, 7].map((n) => (
              <div
                key={n}
                className="w-3 h-3 rounded-sm"
                style={{ background: heatmapColor(n) }}
              />
            ))}
            <span>More</span>
          </div>
        </Card>

        {/* Reviews by Mode */}
        <Card className="mb-8">
          <h2
            className="text-base font-semibold mb-4"
            style={{ color: 'var(--color-text)' }}
          >
            Reviews by Mode
          </h2>
          <div className="flex flex-col gap-3">
            {modeDistribution.map(({ mode, count, percentage }) => (
              <div key={mode}>
                <div className="flex items-center justify-between mb-1">
                  <span
                    className="text-sm font-medium capitalize"
                    style={{ color: 'var(--color-text)' }}
                  >
                    {mode}
                  </span>
                  <span
                    className="text-sm"
                    style={{ color: 'var(--color-text-tertiary)' }}
                  >
                    {count} ({percentage}%)
                  </span>
                </div>
                <div
                  className="h-3 rounded-full overflow-hidden"
                  style={{ background: 'var(--color-muted)' }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${percentage}%`,
                      background: modeColors[mode] ?? 'var(--color-primary)',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Last 28 Days */}
        <Card>
          <h2
            className="text-base font-semibold mb-4"
            style={{ color: 'var(--color-text)' }}
          >
            Last 28 Days
          </h2>
          <div className="flex items-end gap-1" style={{ height: '120px' }}>
            {last28Days.bars.map((bar) => (
              <div
                key={bar.date}
                className="flex-1 flex flex-col items-center justify-end h-full group"
              >
                <div
                  className="w-full rounded-t-sm transition-all duration-300 relative"
                  style={{
                    height: `${Math.max((bar.count / last28Days.maxCount) * 100, bar.count > 0 ? 8 : 0)}%`,
                    background: bar.count > 0
                      ? 'var(--color-primary)'
                      : 'transparent',
                    minHeight: bar.count > 0 ? '4px' : '0',
                  }}
                >
                  <div
                    className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-1.5 py-0.5 text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap"
                    style={{
                      background: 'var(--color-text)',
                      color: 'var(--color-background)',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    {bar.count}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2">
            <span
              className="text-xs"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              {last28Days.bars[0]?.label}
            </span>
            <span
              className="text-xs"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              {last28Days.bars[last28Days.bars.length - 1]?.label}
            </span>
          </div>
        </Card>
      </div>
    </PageTransition>
  );
}

export default StatsPage;
