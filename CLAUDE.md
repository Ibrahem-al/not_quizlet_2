# StudyFlow Project Context

## What is this?
StudyFlow is an offline-first flashcard and study application built with React 19, TypeScript, Vite 7, and Tailwind CSS 4. It's similar to Quizlet but optimized for performance with large card sets.

## Key Architecture
- **Offline-first**: All data in IndexedDB via Dexie. Supabase is optional for cloud sync.
- **Performance-critical**: The card editor must handle 100+ cards without lag. TipTap editors only mount for the active card. Lists > 20 items are virtualized.
- **Code-split**: Every page and game mode is lazy-loaded. Heavy libs (tesseract.js, jspdf) use dynamic import.

## Tech Stack
React 19, TypeScript (strict), Vite 7, Tailwind CSS 4, Zustand, React Query, Dexie, TipTap, @dnd-kit, Framer Motion, Fuse.js, cmdk, Supabase (optional)

## Important Files
- `APP_SPECIFICATION.md` - Complete feature specification
- `IMPROVEMENTS.md` - Tracks issues and improvements
- `structure/` - Full documentation
- `supabase/migrations/001_initial_schema.sql` - Database schema with RLS policies
- `src/db/index.ts` - Dexie database layer
- `src/stores/` - Zustand stores
- `src/lib/cloudSync.ts` - Cloud sync with snake_case↔camelCase mapping + share token ops
- `src/lib/` - Utilities, validation, equivalence, spaced repetition
- `src/components/modes/` - Study modes
- `src/components/modes/games/` - Game modes
- `src/pages/SharedSetPage.tsx` - Read-only shared set view (no auth required)
- `src/pages/SharedStudyPage.tsx` - Study modes for shared sets

## Supabase Schema
- DB uses snake_case columns; app uses camelCase. Mapping is in `src/lib/cloudSync.ts` (rowToSet/setToRow).
- RLS: owner has full CRUD; anyone can SELECT sets that have a non-null share_token (UUID, unguessable).
- Share flow: owner clicks "Share Link" → generates UUID share_token → URL is /shared/:token → SharedSetPage fetches via RPC/direct query → read-only view + study modes, no login needed.

## Design Tokens
All colors, shadows, and radii use CSS custom properties (--color-*, --shadow-*, --radius-*). Theme toggling adds/removes .dark class on <html>.

## Commands
- `npm run dev` - Development server
- `npm run build` - Production build
- `npm run preview` - Preview production build

## Performance Rules
1. Never mount TipTap for inactive cards
2. Virtualize card lists > 20 items
3. Debounce saves at 5 seconds
4. Use React.memo with custom comparators on cards
5. Dynamic import for heavy libraries
6. Keep initial JS bundle < 200KB gzipped
