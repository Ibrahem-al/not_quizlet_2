# Data Models

All TypeScript interfaces are defined in `src/types/index.ts`.

## Core Types

### Card
```typescript
interface Card {
  id: string;              // crypto.randomUUID()
  term: string;            // HTML content (supports rich text, inline images)
  definition: string;      // HTML content
  imageData?: string;      // Base64 encoded image (legacy, separate from inline HTML images)
  audioData?: string;      // Base64 encoded audio (reserved, not yet implemented)
  difficulty: number;      // SM-2 difficulty (0-5 typically)
  repetition: number;      // SM-2 repetition count (0 = new/reset)
  interval: number;        // SM-2 interval in days
  efFactor: number;        // SM-2 ease factor (>= 1.3)
  nextReviewDate: number;  // Unix timestamp for next scheduled review
  history: ReviewLog[];    // Array of all review events
  fsrs?: FSRSState;        // Optional FSRS algorithm state (reserved)
}
```

### ReviewLog
```typescript
interface ReviewLog {
  date: number;            // Unix timestamp of review
  quality: number;         // 0-5 rating (SM-2 scale)
  timeSpent: number;       // Milliseconds spent on card
  mode: 'flashcards' | 'learn' | 'match' | 'test' | 'game';
}
```

### FSRSState
```typescript
interface FSRSState {
  stability: number;
  difficulty: number;
  state: 0 | 1 | 2 | 3;  // New, Learning, Review, Relearning
  lastReview: number;      // Unix timestamp
}
```

### StudySet
```typescript
interface StudySet {
  id: string;              // crypto.randomUUID()
  title: string;           // Set name
  description: string;     // Optional description
  createdAt: number;       // Unix timestamp
  updatedAt: number;       // Unix timestamp (updated on any change)
  tags: string[];          // Searchable tags
  cards: Card[];           // Embedded card array (not normalized)
  lastStudied: number;     // Unix timestamp of most recent study session
  studyStats: StudyStats;  // Aggregate statistics
  visibility: 'private' | 'public';  // Cloud visibility
  folderId?: string;       // Parent folder reference
  userId?: string;         // Owner's Supabase user ID
  cardCount?: number;      // Denormalized count (for cloud queries)
}
```

### StudyStats
```typescript
interface StudyStats {
  totalSessions: number;
  averageAccuracy: number;
  streakDays: number;
}
```

## Organization Types

### Folder
```typescript
interface Folder {
  id: string;
  userId: string;
  name: string;
  description: string;
  parentFolderId?: string;  // Enables nesting
  color: FolderColor;       // Visual identifier
  createdAt: number;
  updatedAt: number;
  itemCount?: number;       // Denormalized
}

type FolderColor = 'blue' | 'green' | 'purple' | 'red' | 'orange' | 'yellow' | 'pink' | 'teal' | 'gray';
```

### FolderItem
```typescript
interface FolderItem {
  id: string;
  folderId: string;
  itemType: 'set';         // Currently only 'set'
  itemId: string;          // Reference to StudySet.id
  addedAt: number;
  addedBy: string;         // User ID
}
```

## Session Types

### StudySession
```typescript
interface StudySession {
  id?: number;             // Auto-increment (Dexie)
  setId: string;
  startedAt: number;
  endedAt?: number;
  mode: string;            // Study mode name
  cardsStudied: number;
  accuracy?: number;       // 0-1 percentage
}
```

## Study Configuration Types

### TestConfig
```typescript
interface TestConfig {
  questionCount: number;
  direction: AnswerDirection;
  questionTypes: QuestionType[];
  multiAnswerMC: boolean;
}
```

### GameRegistration
```typescript
interface GameRegistration {
  id: string;
  name: string;
  category: string;
  minCards: number;
  icon: string;
  description: string;
}
```

## UI Types

### Toast
```typescript
interface Toast {
  id: string;              // crypto.randomUUID()
  type: ToastType;
  message: string;
  duration?: number;       // Auto-dismiss milliseconds
}

type ToastType = 'success' | 'error' | 'info' | 'warning';
```

### ValidationIssue
```typescript
interface ValidationIssue {
  code: string;            // e.g., 'EMPTY_CONTENT', 'MAX_LENGTH'
  message: string;         // Human-readable description
  severity: ValidationSeverity;
  cardId?: string;         // Card-specific issues include the card ID
}

type ValidationSeverity = 'error' | 'warning';
```

## Enum-Like Types

```typescript
type QuestionType = 'written' | 'multiple-choice' | 'true-false';
type AnswerDirection = 'term-to-def' | 'def-to-term' | 'both';
type StudyMode = 'flashcards' | 'learn' | 'match' | 'test'
               | 'spinner' | 'block-builder' | 'memory-card-flip' | 'race-to-finish';
```

## Key Design Decisions

1. **Cards embedded in StudySet**: Cards are stored as an array within the set, not as a separate normalized table. This simplifies offline storage and sync but means the entire set must be loaded/saved as a unit.

2. **HTML content**: Term and definition fields store HTML strings, enabling rich text (bold, italic, images). All display and comparison functions must strip HTML via `stripHtml()`.

3. **SM-2 state on Card**: Each card carries its own spaced repetition state, enabling per-card scheduling independent of study mode.

4. **Timestamps as Unix milliseconds**: All date fields use `Date.now()` (milliseconds since epoch), not ISO strings.
