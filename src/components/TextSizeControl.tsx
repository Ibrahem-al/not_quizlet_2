import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { ALargeSmall } from 'lucide-react';
import { TEXT_SIZES, useTextSizeStore } from '@/stores/useTextSizeStore';

// The picker glyphs stay at fixed pixel sizes so the ladder itself doesn't
// jump around while the rest of the page rescales.
const GLYPH_PX = [12, 16, 20, 25, 31];

const pct = (scale: number) => `${+(scale * 100).toFixed(1)}`;

/** Heading, "A" ladder, current value and footnote. Used in the header
 *  popover and inline in the mobile menu. */
export function TextSizePicker({ autoFocus = false }: { autoFocus?: boolean }) {
  const size = useTextSizeStore((s) => s.size);
  const setSize = useTextSizeStore((s) => s.setSize);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const index = Math.max(0, TEXT_SIZES.findIndex((s) => s.value === size));
  const current = TEXT_SIZES[index];

  useEffect(() => {
    if (autoFocus) optionRefs.current[index]?.focus();
    // Focus the selected option on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = (i: number, focus = true) => {
    const nextIndex = Math.min(TEXT_SIZES.length - 1, Math.max(0, i));
    setSize(TEXT_SIZES[nextIndex].value);
    if (focus) optionRefs.current[nextIndex]?.focus();
  };

  const onRadioKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowUp: index + 1,
      ArrowLeft: index - 1,
      ArrowDown: index - 1,
      Home: 0,
      End: TEXT_SIZES.length - 1,
    };
    if (e.key in moves) {
      e.preventDefault();
      choose(moves[e.key]);
    }
  };

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="m-0 text-sm font-semibold" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-sans)' }}>
          Text size
        </h2>
        {size !== 'md' && (
          <button
            type="button"
            onClick={() => choose(1, false)}
            className="text-xs font-medium cursor-pointer rounded-md px-1.5 py-0.5"
            style={{ background: 'transparent', border: 'none', color: 'var(--color-primary)' }}
          >
            Reset
          </button>
        )}
      </div>

      <div role="radiogroup" aria-label="Text size" onKeyDown={onRadioKey} className="mt-3">
        <div className="grid grid-cols-5 items-end" style={{ height: 46 }}>
          {TEXT_SIZES.map((s, i) => {
            const selected = i === index;
            return (
              <button
                key={s.value}
                ref={(el) => {
                  optionRefs.current[i] = el;
                }}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={`${s.label}, ${pct(s.scale)}%`}
                title={s.label}
                tabIndex={selected ? 0 : -1}
                onClick={() => choose(i)}
                className="flex items-end justify-center h-full cursor-pointer rounded-md"
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: '0 0 6px',
                  fontFamily: 'var(--font-display)',
                  fontWeight: selected ? 700 : 500,
                  fontSize: GLYPH_PX[i],
                  lineHeight: 1,
                  color: selected ? 'var(--color-primary)' : 'var(--color-text-tertiary)',
                  transition: 'color var(--duration-fast) var(--ease-smooth)',
                }}
              >
                A
              </button>
            );
          })}
        </div>

        {/* Track with a marker that slides under the chosen size */}
        <div
          aria-hidden
          className="relative"
          style={{ height: 4, borderRadius: 'var(--radius-full)', background: 'var(--color-muted)' }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              width: `${100 / TEXT_SIZES.length}%`,
              transform: `translateX(${index * 100}%)`,
              transition: 'transform var(--duration-normal) var(--ease-out)',
              padding: '0 10px',
            }}
          >
            <div style={{ height: '100%', borderRadius: 'var(--radius-full)', background: 'var(--color-primary)' }} />
          </div>
        </div>
      </div>

      <p className="mt-3 mb-0 text-sm" aria-live="polite" style={{ color: 'var(--color-text)' }}>
        <span className="font-medium">{current.label}</span>
        <span style={{ color: 'var(--color-text-tertiary)' }}> {pct(current.scale)}%</span>
      </p>
      <p className="mt-0.5 mb-0 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
        Saved on this device.
      </p>
    </div>
  );
}

/** Header button that opens the text size picker in a popover. */
export function TextSizeControl() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-center w-9 h-9 rounded-lg cursor-pointer transition-colors"
        style={{
          background: open ? 'var(--color-muted)' : 'transparent',
          border: 'none',
          color: 'var(--color-text-secondary)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--color-muted)';
        }}
        onMouseLeave={(e) => {
          if (!open) e.currentTarget.style.background = 'transparent';
        }}
        aria-label="Text size"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <ALargeSmall size={18} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Text size"
          className="absolute right-0 top-full mt-2 z-50 w-[17.5rem] p-4"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-xl)',
            boxShadow: 'var(--shadow-lg)',
            animation: 'scaleIn var(--duration-fast) var(--ease-out)',
            transformOrigin: 'top right',
          }}
        >
          <TextSizePicker autoFocus />
        </div>
      )}
    </div>
  );
}
