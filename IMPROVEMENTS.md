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
