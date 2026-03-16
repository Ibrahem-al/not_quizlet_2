# Architecture Overview

## Tech Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Framework | React | 19.2 | UI rendering |
| Language | TypeScript | 5.9 | Type safety |
| Build | Vite | 8.0 | Dev server, bundling, HMR |
| Styling | Tailwind CSS | 4.2 | Utility-first CSS |
| Animation | Framer Motion | 12.36 | Page transitions, card flips, micro-interactions |
| State | Zustand | 5.0 | 6 global stores |
| Server State | TanStack React Query | 5.90 | Async data caching (staleTime: 5min) |
| Local DB | Dexie | 4.3 | IndexedDB wrapper for offline storage |
| Cloud DB | Supabase | 2.99 | Optional auth, cloud sync, public sets |
| Rich Text | TipTap | 3.20 | ProseMirror-based card editor |
| Drag & Drop | @dnd-kit | core 6.3, sortable 10.0 | Card reordering, Match mode drag-to-match |
| Virtualization | @tanstack/react-virtual | 3.13 | Large card list rendering |
| Search | Fuse.js | 7.1 | Fuzzy search in command palette |
| Command Palette | cmdk | 1.1 | Ctrl+K modal |
| Routing | React Router DOM | 7.13 | SPA routing with lazy loading |
| Icons | Lucide React | 0.577 | Consistent icon library |
| Confetti | canvas-confetti | 1.9 | Celebration effects on game completion |
| Resizable | react-resizable-panels | 4.7 | Resizable panel layouts |
| Debounce | use-debounce | 10.1 | Input debouncing |
| PWA | vite-plugin-pwa | 1.2 | Service worker, offline manifest |
| PDF | jsPDF | dynamically imported | Printable worksheet generation |
| OCR | tesseract.js | dynamically imported | Photo-to-text card import |

## Design Philosophy

### Offline-First
The app is designed to work entirely offline. All data is stored locally in IndexedDB via Dexie. Supabase is optional -- when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are not set, the app functions as a fully local-only application. Cloud features (auth, sync, multiplayer) are gracefully disabled.

### Lazy Everything
Every page is code-split via `React.lazy()`. Heavy libraries (jsPDF, tesseract.js, TipTap) are dynamically imported only when needed. The TipTap editor is only mounted when a card is in "active" editing state.

### Spaced Repetition Built-In
Cards carry SM-2 algorithm state (`efFactor`, `interval`, `repetition`, `nextReviewDate`). Learn and Test modes update these fields, enabling intelligent review scheduling. Flashcard mode is a simple review mode without SM-2 integration.

### Equivalence-Aware Grading
Answer checking uses Levenshtein distance with adaptive thresholds plus equivalence groups. Cards with identical normalized terms share all valid answers, preventing false negatives in study modes.

## Key Architectural Decisions

1. **CSS Custom Properties over Tailwind theme** -- Design tokens are defined as CSS variables in `index.css` rather than Tailwind config. This enables runtime theme switching (light/dark) by toggling a `.dark` class on `<html>`.

2. **Zustand over Redux/Context** -- Minimal boilerplate, no providers needed except for React Query. Each store is a single `create()` call with typed state and actions.

3. **Dexie over raw IndexedDB** -- Provides a Promise-based API, schema versioning, and compound indexes without the pain of raw IDB transactions.

4. **TipTap over plain textarea** -- Cards support rich text (bold, italic, strikethrough, highlight), inline images (paste/drop/upload), and HTML storage.

5. **Manual chunk splitting** -- Vite's `manualChunks` separates vendor-react, vendor-editor, vendor-dnd, vendor-motion, and vendor-state into dedicated chunks for optimal caching.

## Application Flow

```
main.tsx
  -> StrictMode + QueryClientProvider + BrowserRouter
    -> App.tsx
      -> useThemeStore (apply theme on mount)
      -> useAuthStore.initialize() (fetch session on mount)
      -> Suspense (lazy page loading)
        -> Layout (header, nav, theme toggle, auth)
          -> AnimatePresence + Routes
            -> RequireAuth (wraps protected routes like /sets/new)
              -> [Lazy Pages]
      -> ToastContainer (global notifications)
```

## Routes

| Path | Page | Description |
|------|------|-------------|
| `/` | HomePage | Set grid with folder sidebar, search, filters |
| `/sets/new` | NewSetPage | Card editor for creating new sets |
| `/sets/:id` | SetDetailPage | Set overview, study mode selection, edit |
| `/sets/:id/study/:mode` | StudyPage | Active study session (8 modes) |
| `/stats` | StatsPage | Study statistics and progress |
| `/folders/:id` | FolderDetailPage | View sets in a folder |
| `/signin` | SignInPage | Email/password sign in |
| `/signup` | SignUpPage | Account creation |
| `/forgot-password` | ForgotPasswordPage | Password reset request |
| `/reset-password` | ResetPasswordPage | Password reset confirmation |
| `/account/settings` | AccountSettingsPage | Account management |
| `/live` | LiveJoinPage | Join a live session |
| `/live/host/:sessionId` | LiveHostPage | Host a live session |
| `/live/play` | LivePlayPage | Play in a live session |
