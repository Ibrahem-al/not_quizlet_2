import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

// ============================================================
// Floating score/reaction popups ("+100", "Nice!", "Streak x3").
// Games push popups into local state and render <ScorePopups/>
// absolutely inside a relative container.
// ============================================================

export interface Popup {
  id: number;
  text: string;
  /** CSS color for the popup text. */
  color?: string;
  /** Percentage position inside the host container. */
  x?: number;
  y?: number;
}

interface ScorePopupsProps {
  popups: Popup[];
  /** Called when a popup finishes so the host can drop it from state. */
  onDone: (id: number) => void;
}

export function ScorePopups({ popups, onDone }: ScorePopupsProps) {
  const reduce = useReducedMotion() ?? false;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <AnimatePresence>
        {popups.map((p) => (
          // The spacer puts the popup's left edge at x%, then shrinks so a
          // popup too wide for the remaining space slides left instead of clipping.
          <div key={p.id} className="absolute inset-x-0 flex" style={{ top: `${p.y ?? 40}%` }}>
            <div style={{ flex: `0 1 ${p.x ?? 50}%`, minWidth: 0 }} />
            <motion.div
              className="font-bold"
              style={{
                flex: 'none',
                color: p.color ?? 'var(--color-primary)',
                fontSize: '1.375rem',
                whiteSpace: 'nowrap',
                textShadow: '0 2px 8px rgba(0,0,0,0.25)',
                fontFamily: 'var(--font-display)',
              }}
              initial={{ opacity: 0, y: 8, scale: 0.8 }}
              animate={{ opacity: 1, y: reduce ? 0 : -36, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0.2 : 0.9, ease: 'easeOut' }}
              onAnimationComplete={() => onDone(p.id)}
            >
              {p.text}
            </motion.div>
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}

