import { create } from 'zustand';

const STORAGE_KEY = 'studyflow-theme';

type Theme = 'light' | 'dark';

interface ThemeStore {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'dark' || stored === 'light') return stored;

  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
  localStorage.setItem(STORAGE_KEY, theme);
}

export const useThemeStore = create<ThemeStore>((set, get) => {
  const initial = getInitialTheme();
  // Apply initial theme to DOM immediately
  if (typeof window !== 'undefined') {
    applyTheme(initial);
  }

  return {
    theme: initial,

    toggleTheme: () => {
      const next: Theme = get().theme === 'light' ? 'dark' : 'light';
      applyTheme(next);
      set({ theme: next });
    },

    setTheme: (theme: Theme) => {
      applyTheme(theme);
      set({ theme });
    },
  };
});
