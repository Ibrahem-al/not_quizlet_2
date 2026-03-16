# Card Editor System

## Overview

The card editor is a multi-component system for creating and editing flashcards with rich text support. It consists of three main components:

1. **CardList** - Virtualized, sortable container
2. **EditableCard** - Individual card row with active/inactive states
3. **TipTapEditor** - Rich text editor mounted only when active

## CardList

**File:** `src/components/CardList.tsx`

### Props
```typescript
interface CardListProps {
  cards: Card[];
  onUpdateCard: (id: string, field: 'term' | 'definition', value: string) => void;
  onDeleteCard: (id: string) => void;
  onReorderCards: (cards: Card[]) => void;
}
```

### Virtualization
- **Threshold:** Cards are virtualized when `cards.length > 20` (VIRTUALIZATION_THRESHOLD)
- **Library:** `@tanstack/react-virtual` with `useVirtualizer`
- **Estimated row height:** 120px
- **Overscan:** 3 items above/below viewport
- When below threshold, renders all cards in a simple flexbox column

### Drag & Drop
- Uses `@dnd-kit/core` with `DndContext`, `closestCenter` collision detection
- `@dnd-kit/sortable` with `SortableContext` and `verticalListSortingStrategy`
- Sensors: `PointerSensor` (8px activation distance) + `KeyboardSensor`
- On drag end: splices card array and calls `onReorderCards`

### Active Card Tracking
- Single `activeCardId` state - only one card can be active (editing) at a time
- Clicking a card activates it; clicking outside deactivates

## EditableCard

**File:** `src/components/EditableCard.tsx`

### Props
```typescript
interface EditableCardProps {
  card: Card;
  index: number;
  isActive: boolean;
  onActivate: (id: string) => void;
  onUpdate: (id: string, field: 'term' | 'definition', value: string) => void;
  onDelete: (id: string) => void;
}
```

### Layout (left to right)
1. **Drag handle** (40px) - GripVertical icon, `cursor-grab`
2. **Card number** (32px) - 1-indexed display
3. **Content area** (flex-1, grid 2-col)
   - Term column (border-right separator)
   - Definition column
4. **Delete button** (40px) - Trash icon, confirmation dialog

### Active vs Inactive State

**Inactive (isActive = false):**
- Term and definition rendered as static HTML via `dangerouslySetInnerHTML`
- Empty fields show placeholder text ("Click to edit term/definition") in tertiary color
- Images display as small thumbnails via `.card-preview img` CSS (80x56px max)
- Click anywhere in content area activates the card

**Active (isActive = true):**
- TipTapEditor mounted for both term and definition
- Blue border highlight + shadow elevation
- Images display as thumbnails via `.editor-content img` CSS (80x56px max)
- Validation warnings shown below empty fields ("Term is required" / "Definition is required")
- Click-outside listener deactivates the card

### Performance Optimization
- Wrapped in `React.memo` with custom comparison:
  ```typescript
  (prev, next) =>
    prev.card.id === next.card.id &&
    prev.card.term === next.card.term &&
    prev.card.definition === next.card.definition &&
    prev.index === next.index &&
    prev.isActive === next.isActive
  ```
- All callbacks wrapped in `useCallback`
- TipTap editors are only mounted when card is active (lazy mounting)

### Content Detection
Uses utility functions from `src/lib/utils.ts`:
- `hasTextContent(html)` - strips HTML and checks for non-empty text
- `isImageOnly(html)` - checks if content has `<img>` but no text

## TipTapEditor

**File:** `src/components/TipTapEditor.tsx`

### Props
```typescript
interface TipTapEditorProps {
  content: string;       // HTML string
  onUpdate: (html: string) => void;
  placeholder?: string;  // Default: "Type here..."
  className?: string;
}
```

### Extensions
| Extension | Purpose |
|-----------|---------|
| `StarterKit` | Basic formatting (bold, italic, strike, lists, headings) |
| `Image` | Inline images, base64 allowed |
| `Highlight` | Text highlighting |
| `Placeholder` | Gray placeholder text when empty |

### Toolbar (BubbleMenu)
Appears when text is selected. Buttons:
- **Bold** (B)
- **Italic** (I)
- **Strikethrough** (S)
- **Highlight** (marker)
- Separator
- **Insert Image** (opens file picker)
- Separator
- **Undo** (disabled when nothing to undo)
- **Redo** (disabled when nothing to redo)

### Image Handling
Three insertion methods:
1. **Paste**: `handlePaste` intercepts clipboard items of type `image/*`
2. **Drop**: `handleDrop` intercepts dropped image files
3. **Upload**: Button creates a hidden `<input type="file">` and triggers click

All images are compressed via `compressImage()`:
- Max dimension: 1024px (maintains aspect ratio)
- JPEG format with quality starting at 0.8
- Iteratively reduces quality until under 500KB (base64)
- Stored inline as base64 data URLs in HTML

### Content Sync
- `onUpdate` callback fires on every TipTap content change, emitting `editor.getHTML()`
- External content changes are synced back via `useEffect` that calls `editor.commands.setContent(content, { emitUpdate: false })` to avoid feedback loops

## Validation System

**File:** `src/lib/validation.ts`

### Card-Level Validation

| Code | Severity | Condition |
|------|----------|-----------|
| `EMPTY_CONTENT` | error | Term or definition is empty (no text and no image) |
| `MAX_LENGTH` | error | Term or definition exceeds 10,000 characters |
| `SUSPICIOUSLY_SIMILAR` | warning | Normalized term equals normalized definition |
| `URL_AS_CONTENT` | warning | Content is just a URL |
| `ALL_CAPS_DETECTED` | warning | Content (> 3 chars) is all uppercase |

### Set-Level Validation

| Code | Severity | Condition |
|------|----------|-----------|
| `MIN_CARDS` | error | Fewer than 2 cards |
| `MAX_CARDS` | warning | More than 500 cards |
| `DUPLICATE_TERMS` | warning | Multiple cards have the same normalized term |
| `TAG_MISSING` | warning | No tags on the set |

### Helper Functions
- `validateCard(card)` -> `ValidationIssue[]`
- `validateSet(set)` -> `ValidationIssue[]` (includes all card validations)
- `getHardErrors(issues)` -> errors only
- `hasHardErrors(issues)` -> boolean
