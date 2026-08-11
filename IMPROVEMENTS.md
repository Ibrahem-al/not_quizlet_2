# StudyFlow Improvements Log

This file tracks improvements, corrections, and lessons learned during development. It is continuously updated based on feedback.

## Architecture Decisions

### What Went Well
- **Offline-first with optional cloud**: IndexedDB as primary storage means the app works without any backend
- **Lazy TipTap mounting**: Only the focused card mounts TipTap editors, preventing slowdown with large sets (30+ cards)
- **Code splitting by route**: Each page/mode is lazy-loaded, keeping initial bundle small
- **Virtualized card list**: @tanstack/react-virtual for sets > 20 cards prevents DOM bloat
- **Dynamic imports for heavy libs**: tesseract.js and jspdf only load when needed

### Known Issues to Address
1. **Live Multiplayer**: Currently placeholder pages - full Supabase Realtime implementation needed
2. **Spaced Repetition**: SM-2 is functional but FSRS algorithm would give better scheduling
3. **Image storage**: Base64 in card HTML is simple but inefficient for large images - consider Supabase Storage
4. **Editor toolbar**: BubbleMenu positioning could be improved with custom floating UI
5. **Offline sync queue**: When going back online, there's no queued sync - changes must be manually triggered
6. **Test PDF quality**: jsPDF text rendering is basic - consider using a more capable PDF library
7. **Memory Card Flip**: Content-based matching may have edge cases with very similar cards
8. **Race to Finish board**: SVG board could be more visually polished with curved paths

## Performance Lessons
1. **Never mount rich text editors for all cards** - Previous versions became unusable at 30+ cards because TipTap was mounted for every card simultaneously
2. **Virtualize lists over 20 items** - DOM nodes from large lists cause significant jank
3. **Debounce saves at 5 seconds** - Shorter intervals cause write amplification to IndexedDB
4. **Use React.memo with custom comparators** - Prevent re-renders of card components when unrelated state changes
5. **Split vendor chunks** - Keep react, framer-motion, tiptap, dnd-kit in separate chunks for better caching

## Feedback Log
<!-- Record user feedback and corrections here -->
| Date | Feedback | Action Taken |
|------|----------|-------------|
| 2026-03-16 | Initial build | Created app from specification |
| 2026-03-16 | cloudSync.ts used camelCase column names, Supabase uses snake_case | Rewrote cloudSync.ts with proper rowToSet/setToRow mapping functions |
| 2026-03-16 | No RLS policies — any user could read/modify any set | Created full migration SQL with RLS: owner CRUD + share_token SELECT for anonymous access |
| 2026-03-16 | No share link feature | Added share_token column, /shared/:token route, read-only SharedSetPage with study modes, Share button on SetDetailPage |
| 2026-03-16 | Users could create sets without being logged in | Added RequireAuth route guard, auth initialization in App.tsx, returnTo redirect after sign-in |
| 2026-03-16 | Spinner wheel didn't visually spin | Wrapped SVG in rotating div — CSS transforms unreliable on SVG `<g>` elements |
| 2026-03-16 | Images displayed full-size in card editor | Added `.editor-content` and `.card-preview` classes with thumbnail sizing CSS |
| 2026-03-16 | Memory game cards too large, required scrolling | Viewport-height grid with auto-sized rows, removed fixed aspect ratio |
| 2026-03-16 | Memory game ended early (counter mismatch) | Changed completion check from counter comparison to `updated.every(c => c.isMatched)` |
| 2026-03-16 | No save button in card editor | Added manual Save button alongside Add Card, flushes debounce timer |
| 2026-03-16 | Text too small across study modes | Bumped terms to text-2xl, definitions to text-xl, memory cards to text-base |
| 2026-03-16 | Match mode was click-based | Rewrote with @dnd-kit drag-and-drop — tiles are both draggable and droppable in shuffled grid |
| 2026-03-16 | Flashcard difficulty rating unnecessary | Removed SM-2 integration, rating buttons, swipe-to-rate; simplified to Prev/Flip/Next |
| 2026-03-16 | Photo import feature unused | Removed Photo Import button and Camera icon from SetDetailPage |
| 2026-03-16 | Match mode always used same first 8 cards | Added setup screen with pair count selector; cards randomly selected via shuffleArray each game |
| 2026-03-16 | Spinner text too small and animation glitchy | Direct SVG rotation with will-change hint; bigger 360px wheel; adaptive font size and truncation |
| 2026-03-16 | T/F questions marked equivalent definitions as wrong | Fixed isCorrect check in all 4 question modes to compare against all correctAnswers via normalizeAnswer |
| 2026-03-16 | No way to filter cards before studying | Added card filter panel on SetDetailPage with checkboxes, min-2 guard, Apply/Clear buttons; filter persists in store across all modes until manually cleared |
| 2026-07-11 | Full codebase bug audit | Documented 62 verified bugs in BUG_REPORT.md (1 critical, 13 high, 21 medium, 27 low) via multi-agent review + adversarial verification |
| 2026-07-12 | Fixed all 62 audited bugs + game visual overhaul | See "2026-07-12" section below. All fixes verified: tsc clean, 0 ESLint errors, vite build passes, all 4 games render with 0 console errors |

## 2026-07-12: Full Bug Audit Fixes + Game Visual Overhaul

Fixed all 62 bugs from BUG_REPORT.md. Highlights:
- **Security**: Added `src/lib/sanitize.ts` (dependency-free, default-deny HTML allowlist) — StudyContent now sanitizes all sharer HTML, closing the stored-XSS hole on shared pages (H8). New Supabase migration `005_security_hardening.sql` drops the enumerable RLS policies that leaked every shared set/folder + their share_tokens to anon (H11/H12), pins `search_path` on SECURITY DEFINER funcs (M18), rewrites `check_password_reuse` (M17), and revokes anon EXECUTE on the rate-limit RPCs (L26). Electron gets a CSP + window-open/navigation guards (M16).
- **Data-loss / sync**: cloud pull no longer nulls a set/folder `share_token` (H1/M2), no longer overwrites newer concurrent edits (H2), no longer resurrects hidden legacy dupes (M1); store merges recompute against fresh state (M3/L25). Uploads preserve PNG/GIF format (L3).
- **Crashes / robustness**: killed the image-only-set print infinite loop (C1); added an `ErrorBoundary` (chunk-load self-heal) + a `NotFoundPage` catch-all route (H10/L22).
- **Correctness**: `formatTime` %60 fix (H3); direction-aware, deduped MC distractors (H4/M6); Block Builder winnable at low counts (M7); SRS no longer under-records repeated Learn cards (H13); filter scoped per-set so it no longer leaks across sets (H5/M10); shared-study Exit returns to the shared view instead of a dead "Set not found" (H6/H7); command palette searches the whole library (H9).
- **Game visual/animation overhaul** (all 4): framer-motion spring animations, `useReducedMotion` support, canvas-confetti celebrations, aurora backgrounds, consistent stat pills, and polished results screens.
  - **Spinner** → conic-gradient wheel with curved labels, bouncing pointer, glowing hub.
  - **Memory** → 3D perspective card flips, glossy card backs, match sparkle/streak combo.
  - **Block Builder** → spring-dropped blocks, rising animated lava, scaled summit marker.
  - **Race to Finish** → asphalt racetrack with checkered finish, lane markings, animated racers. (Resolves Known Issue #8.)

## Future Improvements
- [ ] Implement full Live Multiplayer with Supabase Realtime
- [ ] Add FSRS spaced repetition algorithm option (Learn/Test modes only; Flashcard mode is now simple review)
- [x] Auth guard on set creation routes
- [x] Manual Save button in card editor
- [x] Drag-and-drop matching in Match mode
- [x] Simplified Flashcard mode (no difficulty rating)
- [x] Fixed spinner wheel animation
- [x] Fixed memory game completion logic
- [x] Match mode setup screen with pair count + random card selection
- [x] Spinner wheel: bigger, adaptive text, GPU-accelerated rotation
- [x] T/F equivalence fix across Learn, Test, BlockBuilder, RaceToFinish
- [x] Card filter feature: select/deselect cards on SetDetailPage, persists across modes
- [x] Dimmed excluded cards in card editor (40% opacity)
- [x] Image thumbnails in card editor
- [x] Viewport-fit memory game grid
- [ ] Supabase Storage for images instead of base64
- [ ] Recharts integration for richer analytics charts
- [ ] Keyboard shortcut overlay/help modal
- [x] Share sets via link (read-only, no login required)
- [x] Supabase RLS policies for private sets + share token access
- [ ] Export/import sets as JSON
- [ ] Collaborative set editing
- [ ] Audio card support (text-to-speech)
- [ ] Search within card content
- [ ] Undo/redo for card operations (add/delete/reorder)

## 2026-08-10 — Cloud-first sync, security migration applied, game overhaul, re-theme

**Backups taken first** (rollback points): git branch `backup/pre-improvements-2026-08-10` + tag; tag `deployed-production-2026-08-10` = exact Vercel prod commit; full DB snapshot in Supabase schema `backup_20260810`; local dump + all 587 card images in `../not_quizlet_2_backups/2026-08-10/` (kept OUT of this public repo — contains emails/share tokens).

**Database** — migration 005 (security hardening) applied to Supabase and verified: enumeration policies dropped, SECURITY DEFINER search_paths pinned, anon EXECUTE revoked on rate-limit writers; study_sets checksum identical before/after (no data loss). App follow-ups shipped: RPC-only shared-set/folder fetches (fallback direct queries removed), `check_password_reuse` callers fixed (p_user_id + scalar boolean), `is_account_locked` name fixed in SignInPage. Still pending: service-role edge functions to populate `password_history` and drive failed-login accounting.

**Cloud-first sync** — new `src/lib/syncEngine.ts`: every set/folder write pushes to Supabase immediately when signed in (500ms coalesce per item, exponential-backoff retries, flush on reconnect); `SyncStatusIndicator` in the header; IndexedDB remains the offline cache; pull-merge on load is the reconciliation net. The old "only shared folders auto-sync" logic is gone.

**Games** — BlockBuilder: instant-loss-on-first-wrong-answer fixed (lava grace), final-answer feedback shown before results, stable block keys, 1-4/T/F keyboard input, double-Esc quit, mobile tower visible. RaceToFinish: stale-winner-stats fixed, page scroll-hijack fixed, faster pacing, solo "Race a bot" mode (Turbo Bot, 65% accuracy), track presets capped at 30, palette consolidated. MemoryCardFlip: 18-pair cap, dvh board height, instant Play Again, honest "Efficiency" stat, updater-purity fixes. Spinner: skip cooldown, 24-segment wheel sampling, definition-side label fix, confetti only on completion, tap-to-fast-forward. All four: synthesized WebAudio sounds (`src/lib/gameSounds.ts`) with a persistent mute toggle.

**Study modes** — Learn: interleaved question types + one review round of missed cards + dead code removed. Match: 12-pair cap + timeout-leak fix. Flashcards: shuffle toggle. Modal: role=dialog/aria-modal/focus management. Input: useId (label-collision fix).

**Re-theme (anti-vibecode)** — primary moved off `#6366f1` indigo (the canonical AI-generated tell) to a lapis/cerulean ink `#1b6ca8` grounded in Arabic manuscript illumination (the app's actual content); Space Grotesk replaced by IBM Plex Sans + IBM Plex Sans Arabic (Arabic content finally gets a designed face) with Bricolage Grotesque display; `::selection`/caret themed; 100vh → 100dvh everywhere; purple print gradients replaced; OG meta added; PWA manifest theme updated. Everything flows through the existing CSS tokens, so reverting is a one-file change.

**Post-review hardening (same day)** — a high-effort code review of the above found 10 issues, all fixed: syncEngine now serializes pushes per item (no out-of-order overwrites), keeps retry-exhausted items so "click to retry" actually retries, and exposes cancelSync() which removeSet/removeFolder call so a queued push can't resurrect a deleted item; folder pushes upsert the ancestor chain in one ordered statement (parent_folder_id FK safety); auto-sync preparation failures abort the push instead of falling back to raw base64; fetchSharedFolder no longer caches a transient sets-RPC failure as "empty folder"; coalesce window raised 500ms→2s (deliberate middle between cloud-first immediacy and the 5s-debounce performance rule); Learn results score first attempts only (review round no longer skews accuracy); Spinner can't double-spin during the post-land pause; FlashcardMode deck resyncs when the cards prop changes; Modal got a real Tab focus trap; dead syncFolderToCloud removed.
