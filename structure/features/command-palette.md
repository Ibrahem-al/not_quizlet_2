# Command Palette

## Overview

A Spotlight/VS Code-style command palette for quick navigation, powered by `cmdk` and `fuse.js`.

## Components

### useCommandPalette Hook

**File:** `src/hooks/useCommandPalette.ts`

Registers global keyboard listeners:
- **Ctrl+K / Cmd+K**: Toggle palette open/closed
- **/** (forward slash): Open palette (only when not focused in input/textarea/contenteditable)

Returns `{ isOpen, setIsOpen }`.

### CommandPalette Component

**File:** `src/components/CommandPalette.tsx`

**Props:** `isOpen: boolean`, `onClose: () => void`

## UI Structure

Full-screen overlay with centered modal (max-width 512px, positioned at 15vh from top):

1. **Backdrop**: Semi-transparent black with 4px blur, click to close
2. **Search input**: Auto-focused, with Search icon and "Esc" kbd hint
3. **Results list** (max-height 320px, scrollable):
   - **Quick Actions group**: Home (H), New Set (N), Stats (S)
   - **Study Sets group**: Up to 8 most recent sets

## Search

### Fuzzy Search Configuration
```typescript
new Fuse(flatSets, {
  keys: [
    { name: 'title', weight: 0.5 },
    { name: 'tags', weight: 0.3 },
    { name: 'terms', weight: 0.2 },
  ],
  threshold: 0.4,
  includeScore: true,
})
```

### Indexed Data
Each set is flattened to:
```typescript
interface FlattenedSet {
  id: string;
  title: string;
  tags: string;       // tags.join(' ')
  terms: string;      // first 20 card terms, stripped of HTML, joined
}
```

### cmdk Filter Integration
The `Command` component's `filter` prop delegates to Fuse.js:
- No search query: all items shown (score 1)
- With query: Fuse search results matched by set ID, score inverted (1 - fuseScore)

## Quick Actions

| Action | Keyboard Hint | Navigation |
|--------|--------------|------------|
| Home | H | `/` |
| New Set | N | `/sets/new` |
| Stats | S | `/stats` |

## Animation

- Backdrop: fade in/out (150ms)
- Modal: opacity + scale(0.95) + translateY(-10px) -> visible (150ms, ease [0.4, 0, 0.2, 1])
- Wrapped in AnimatePresence for exit animations

## Set Result Items

Each set shows:
- Title (font-medium, truncated)
- Card count + first 3 tags (text-xs, tertiary color)
- Selecting navigates to `/sets/:id` and closes palette
