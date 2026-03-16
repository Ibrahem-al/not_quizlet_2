# Bundle Analysis

## Chunk Strategy

Vite's `manualChunks` in `vite.config.ts` splits the bundle into targeted vendor chunks plus route-based code splits.

## Chunk Breakdown

### Vendor Chunks (cached independently)

| Chunk | Contents | Approx Size | Cache Strategy |
|-------|----------|-------------|----------------|
| `vendor-react` | react, react-dom, react-router-dom | ~150KB gzipped | Stable; changes rarely |
| `vendor-editor` | @tiptap/* (starter-kit, react, image, highlight, placeholder) | ~120KB gzipped | Stable; only loads when editing |
| `vendor-dnd` | @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities | ~30KB gzipped | Stable |
| `vendor-motion` | framer-motion | ~80KB gzipped | Stable |
| `vendor-state` | zustand, @tanstack/react-query | ~20KB gzipped | Stable |

### Application Chunks (route-based)

Each lazy-loaded page becomes its own chunk:

| Route Chunk | Components | Load Trigger |
|-------------|-----------|--------------|
| HomePage | HomePage, FolderSidebar, SetCard, CommandPalette | Navigate to `/` |
| NewSetPage | NewSetPage, CardList, EditableCard | Navigate to `/sets/new` |
| SetDetailPage | SetDetailPage, GameBrowserModal, PrintDialog, MoveToFolderModal | Navigate to `/sets/:id` |
| StudyPage | StudyPage + active mode component | Navigate to study route |
| FlashcardMode | FlashcardMode, StudyContent | Study flashcards |
| LearnMode | LearnMode, equivalence lib | Study learn |
| MatchMode | MatchMode, canvas-confetti (dynamic) | Study match |
| TestMode | TestMode (largest mode, 3 phases) | Study test |
| SpinnerMode | SpinnerMode (SVG wheel) | Game: spinner |
| BlockBuilderMode | BlockBuilderMode (tower visualization) | Game: block-builder |
| MemoryCardFlipMode | MemoryCardFlipMode (flip animations) | Game: memory |
| RaceToFinishMode | RaceToFinishMode (board game SVG) | Game: race |
| Auth pages | SignIn, SignUp, ForgotPassword, ResetPassword, AccountSettings | Auth routes |
| Live pages | LiveJoin, LiveHost, LivePlay | Multiplayer routes |
| StatsPage | StatsPage | Navigate to `/stats` |

### Dynamically Imported (not in bundle at all)

| Library | Trigger | Approx Size |
|---------|---------|-------------|
| jsPDF | User clicks "Generate PDF" in PrintDialog | ~250KB |
| tesseract.js | User clicks "Extract Text" in PhotoImportModal | ~2MB+ (includes WASM) |
| canvas-confetti | Match game completion | ~8KB |

## Initial Load

The initial page load includes:
1. `index.html` (minimal)
2. Main app chunk (App.tsx, Layout, router setup, stores, utils)
3. `vendor-react` chunk
4. `vendor-motion` chunk (used in Layout animations)
5. `vendor-state` chunk (Zustand stores initialized immediately)
6. Current route's page chunk

**Not loaded initially:**
- `vendor-editor` (only on card editing)
- `vendor-dnd` (only on card editing)
- Study mode chunks
- Auth page chunks
- jsPDF, tesseract.js

## Build Configuration

```typescript
build: {
  target: 'es2022',          // Modern browsers, minimal transpilation
  chunkSizeWarningLimit: 500, // Warn at 500KB per chunk
  rollupOptions: {
    output: {
      manualChunks(id) { ... }
    }
  }
}
```

## PWA Caching

The `vite-plugin-pwa` with `registerType: 'autoUpdate'` creates a service worker that caches all built assets. After first load, subsequent visits serve from cache with background updates.

## Optimization Recommendations

1. **TipTap** is the largest vendor dependency. It's correctly isolated in `vendor-editor` and only loaded during editing.
2. **Framer Motion** is loaded on every page (Layout uses it). Consider using CSS animations for the Layout if bundle size becomes a concern.
3. **Study mode chunks** are small individually but there are 8 of them. They share common patterns that Vite's tree-shaking handles well.
4. Large sets (500+ cards with images) can produce significant IndexedDB payloads. The base64 image compression (500KB cap) mitigates this.
