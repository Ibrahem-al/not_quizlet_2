import { create } from 'zustand';

// Per-device preference (never synced to the cloud). index.html applies the
// saved value before first paint so the page never renders at the wrong size.
const STORAGE_KEY = 'studyflow-text-size';

export type TextSize = 'sm' | 'md' | 'lg' | 'xl' | 'xxl';

export const TEXT_SIZES: { value: TextSize; label: string; scale: number }[] = [
  { value: 'sm', label: 'Small', scale: 0.875 },
  { value: 'md', label: 'Default', scale: 1 },
  { value: 'lg', label: 'Large', scale: 1.125 },
  { value: 'xl', label: 'Larger', scale: 1.25 },
  { value: 'xxl', label: 'Largest', scale: 1.375 },
];

const DEFAULT_SIZE: TextSize = 'md';

interface TextSizeStore {
  size: TextSize;
  setSize: (size: TextSize) => void;
}

function isTextSize(value: unknown): value is TextSize {
  return TEXT_SIZES.some((s) => s.value === value);
}

function readStored(): TextSize {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isTextSize(stored)) return stored;
  } catch {
    // storage blocked (private mode) — fall back to default
  }
  return DEFAULT_SIZE;
}

function applySize(size: TextSize): void {
  const scale = TEXT_SIZES.find((s) => s.value === size)?.scale ?? 1;
  const root = document.documentElement;
  root.style.setProperty('--sf-text-scale', String(scale));
  root.dataset.textSize = size;
}

export const useTextSizeStore = create<TextSizeStore>((set) => {
  const initial = typeof window === 'undefined' ? DEFAULT_SIZE : readStored();
  if (typeof window !== 'undefined') {
    applySize(initial);
    // Keep other open tabs in step with the choice.
    window.addEventListener('storage', (e) => {
      if (e.key !== STORAGE_KEY) return;
      const next = isTextSize(e.newValue) ? e.newValue : DEFAULT_SIZE;
      applySize(next);
      set({ size: next });
    });
  }

  return {
    size: initial,
    setSize: (size) => {
      applySize(size);
      try {
        localStorage.setItem(STORAGE_KEY, size);
      } catch {
        // storage unavailable; the choice still applies for this session
      }
      set({ size });
    },
  };
});
