import { useCallback, useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import type { GameQuestion } from '@/lib/gameQuestions';
import type { Popup } from '@/components/games/ScorePopup';

// Non-component game helpers (scoring, hooks, effects) shared by the games.
// Kept apart from GameKit.tsx so that file only exports components.

let popupSerial = 0;
/** Monotonic id for score popups. */
export function nextPopupId(): number {
  popupSerial += 1;
  return popupSerial;
}

/** Four answer colors, each paired with the text color that reads on it. */
export const TILE_COLORS = [
  { bg: '#d93843', edge: '#a8202a', text: '#ffffff' },
  { bg: '#0b74d6', edge: '#07539c', text: '#ffffff' },
  { bg: '#f2a81d', edge: '#b97a06', text: '#2b1a00' },
  { bg: '#23875a', edge: '#17623f', text: '#ffffff' },
] as const;

/** Combo multiplier from the current streak: every 2 in a row adds ×0.5, up to ×3. */
export function comboMultiplier(streak: number): number {
  return Math.min(3, 1 + Math.floor(streak / 2) * 0.5);
}

export function formatMultiplier(m: number): string {
  return `×${Number.isInteger(m) ? m : m.toFixed(1)}`;
}

// ---------- Hooks ----------

/** Floating "+150" popups: returns the list, a push helper and the done handler. */
export function usePopups() {
  const [popups, setPopups] = useState<Popup[]>([]);
  const push = useCallback((popup: Omit<Popup, 'id'>) => {
    setPopups((p) => [...p.slice(-5), { ...popup, id: nextPopupId() }]);
  }, []);
  const remove = useCallback((id: number) => {
    setPopups((p) => p.filter((x) => x.id !== id));
  }, []);
  return { popups, push, remove };
}

/** With `confirm` (mid-game), the first Escape arms a "press again to quit"
 *  banner for 2s and a second exits; without it (e.g. results), one Escape
 *  exits. Returns whether the banner should show. */
export function useEscToQuit(enabled: boolean, confirm: boolean, onExit: () => void): boolean {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (confirm && !armed) {
        setArmed(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setArmed(false), 2000);
        return;
      }
      onExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, confirm, armed, onExit]);

  return armed && confirm;
}

/** 1-4 pick a multiple-choice option; T/F (or 1/2) answer true/false.
 *  Ignored while typing in a field. */
export function useAnswerKeys(
  question: GameQuestion | null,
  enabled: boolean,
  onOption: (option: string) => void,
  onTrueFalse: (value: boolean) => void,
): void {
  useEffect(() => {
    if (!enabled || !question) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (question.type === 'multiple-choice' && question.options) {
        const n = parseInt(e.key, 10);
        if (n >= 1 && n <= question.options.length) {
          e.preventDefault();
          onOption(question.options[n - 1]);
        }
      } else if (question.type === 'true-false') {
        const k = e.key.toLowerCase();
        if (k === 't' || k === '1') {
          e.preventDefault();
          onTrueFalse(true);
        } else if (k === 'f' || k === '2') {
          e.preventDefault();
          onTrueFalse(false);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [question, enabled, onOption, onTrueFalse]);
}

/** Two-sided confetti burst in the given colors; no-op under reduced motion. */
export function celebrate(colors: string[], durationMs = 900): () => void {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return () => {};
  let cancelled = false;
  const end = Date.now() + durationMs;
  confetti({ particleCount: 80, spread: 80, startVelocity: 42, origin: { y: 0.6 }, colors });
  const frame = () => {
    if (cancelled) return;
    confetti({ particleCount: 4, angle: 60, spread: 55, origin: { x: 0, y: 0.8 }, colors });
    confetti({ particleCount: 4, angle: 120, spread: 55, origin: { x: 1, y: 0.8 }, colors });
    if (Date.now() < end) requestAnimationFrame(frame);
  };
  frame();
  return () => {
    cancelled = true;
  };
}

