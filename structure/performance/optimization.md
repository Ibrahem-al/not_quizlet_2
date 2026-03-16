# Performance Optimization

## Key Strategies

### 1. Virtualized Card List

**File:** `src/components/CardList.tsx`

- Uses `@tanstack/react-virtual` for card lists exceeding 20 items
- Estimated row height: 120px, overscan: 3
- Only renders visible cards + small buffer
- Falls back to simple rendering for small sets (< 20 cards)
- **Impact:** Handles 500+ card sets without DOM bloat

### 2. Lazy TipTap Editor Mounting

**File:** `src/components/EditableCard.tsx`

- TipTap editor instances are only created when a card is in "active" (editing) state
- Inactive cards render static HTML via `dangerouslySetInnerHTML`
- Only ONE card can be active at a time
- **Impact:** Avoids creating 100+ ProseMirror instances for large sets

### 3. Code Splitting (Lazy Routes)

**File:** `src/App.tsx`

All 15 page components use `React.lazy()`:
```typescript
const HomePage = lazy(() => import('@/pages/HomePage'));
const StudyPage = lazy(() => import('@/pages/StudyPage'));
// ... etc
```

Wrapped in a single `<Suspense>` with a spinner fallback.

**Impact:** Initial bundle only loads the shell; pages load on navigation.

### 4. React.memo with Custom Comparison

**File:** `src/components/EditableCard.tsx`

```typescript
const EditableCard = memo(
  function EditableCard({ ... }) { ... },
  (prev, next) =>
    prev.card.id === next.card.id &&
    prev.card.term === next.card.term &&
    prev.card.definition === next.card.definition &&
    prev.index === next.index &&
    prev.isActive === next.isActive,
);
```

Only re-renders when card content, position, or active state actually changes. Prevents cascade re-renders when parent state changes.

### 5. Dynamic Imports for Heavy Libraries

| Library | Import Point | Size Impact |
|---------|-------------|-------------|
| jsPDF | `PrintDialog.tsx` -> `pdfGenerator.ts` | ~250KB, only when generating PDFs |
| tesseract.js | `PhotoImportModal.tsx` | ~2MB+, only when OCR is triggered |
| canvas-confetti | `MatchMode.tsx` | ~8KB, only on game completion |

### 6. Manual Chunk Splitting

**File:** `vite.config.ts`

```typescript
manualChunks(id: string) {
  if (id.includes('react-dom') || id.includes('react/') || id.includes('react-router-dom'))
    return 'vendor-react';
  if (id.includes('@tiptap')) return 'vendor-editor';
  if (id.includes('@dnd-kit')) return 'vendor-dnd';
  if (id.includes('framer-motion')) return 'vendor-motion';
  if (id.includes('zustand') || id.includes('@tanstack/react-query'))
    return 'vendor-state';
}
```

**Impact:** Vendor chunks cached independently. Updating app code doesn't invalidate vendor cache.

### 7. React Query Stale Time

**File:** `src/main.tsx`

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});
```

Prevents redundant network requests for server-state data within 5-minute windows.

### 8. useCallback Everywhere

All event handlers in frequently re-rendered components are wrapped in `useCallback` with explicit dependency arrays:
- EditableCard: handleDelete, handleTermUpdate, handleDefUpdate
- CardList: handleDragEnd, handleActivate
- Study modes: all answer handlers, navigation, rating

### 9. Debounced Operations

- Card content auto-saves use the `use-debounce` library to batch rapid edits
- Search query updates are immediate in state but filtering can be debounced on the consumer side

### 10. Image Compression

**File:** `src/lib/utils.ts` -> `compressImage()`

- Max dimension: 1024px (maintains aspect ratio)
- JPEG encoding starting at quality 0.8
- Iteratively reduces quality until under 500KB
- Prevents large images from bloating IndexedDB and slowing saves

### 11. Fuse.js Search Indexing

**File:** `src/components/CommandPalette.tsx`

- Search index pre-computed via `useMemo` when sets change
- Only first 20 card terms per set are indexed (not all cards)
- Results limited to 8 items

### 12. CSS Variable Theme Switching

Theme changes only toggle a CSS class (`.dark`), not re-render React. CSS custom properties cascade automatically, so no component needs to re-render on theme change. Only the theme toggle button reads from the store.

### 13. Reduced Motion Support

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

Prevents performance overhead from animations for users who prefer reduced motion.

## Build Target

```typescript
build: {
  target: 'es2022',
  chunkSizeWarningLimit: 500, // KB
}
```

ES2022 target enables modern syntax (top-level await, class fields) without transpilation overhead.
