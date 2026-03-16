# Study Modes

StudyFlow has 8 study modes: 4 core modes and 4 game modes. All modes receive `cards: Card[]` and `setId: string` as props.

## Study Mode Type

```typescript
type StudyMode = 'flashcards' | 'learn' | 'match' | 'test'
               | 'spinner' | 'block-builder' | 'memory-card-flip' | 'race-to-finish';
```

---

## 1. Flashcard Mode

**File:** `src/components/modes/FlashcardMode.tsx`
**Route:** `/sets/:id/study/flashcards`

### Behavior
- Cards displayed one at a time with 3D flip animation (spring physics)
- Swipe gestures: right = "Know It" (quality 5), left = "Study Again" (quality 2), down = skip
- Progressive word reveal: press Space to reveal definition one word at a time
- SM-2 spaced repetition updates on every rating

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Progressive reveal (shows definition word by word) |
| `Arrow Left` | Previous card |
| `Arrow Right` | Next card |
| `1` | Rate "Again" (quality 2) |
| `2` | Rate "Hard" (quality 3) |
| `3` | Rate "Easy" (quality 5) |
| `Escape` | Exit (press twice to confirm) |

### Session Complete Screen
Shows breakdown: Know It / Learning / Study Again counts with color-coded cards. Options: Restart or Exit.

---

## 2. Learn Mode

**File:** `src/components/modes/LearnMode.tsx`
**Route:** `/sets/:id/study/learn`

### Behavior
- Generates up to 20 questions from shuffled cards
- Mixed question types distributed by position: 0-40% = MC, 40-80% = written, 80-100% = T/F
- Uses equivalence groups for multi-answer correctness
- After answering, shows confidence buttons (Hard/Medium/Easy for correct, Continue for wrong)
- SM-2 updates with quality based on confidence selection

### Question Types
- **Multiple Choice**: 1 correct + up to 3 wrong options from equivalence-excluded pool
- **Written**: Free-text input graded with Levenshtein distance
- **True/False**: Shows a term-definition pair, user judges if pairing is correct

---

## 3. Match Mode

**File:** `src/components/modes/MatchMode.tsx`
**Route:** `/sets/:id/study/match`

### Behavior
- Takes first 8 cards, creates term + definition tiles (16 total), shuffled
- Timer starts on first click
- Select two tiles to match; equivalence-aware matching
- Matched tiles fade out; mismatched tiles shake (x-axis animation)
- Confetti via `canvas-confetti` on completion
- Shows completion time

### Grid Layout
Responsive: 2 cols (mobile), 3 cols (sm), 4 cols (md+). Each tile is 112px tall.

---

## 4. Test Mode

**File:** `src/components/modes/TestMode.tsx`
**Route:** `/sets/:id/study/test`

### Three Phases
1. **Config**: Question count (presets: 5/10/20/all/custom), direction (term->def, def->term, both), question types (written/MC/T-F), multi-answer MC toggle
2. **Test**: Questions presented one at a time with progress bar. SM-2 updates per question.
3. **Results**: Animated circular SVG progress indicator, missed cards list, options to study missed cards / retake / exit

### Config Interface
```typescript
interface TestConfig {
  questionCount: number;
  direction: 'term-to-def' | 'def-to-term' | 'both';
  questionTypes: ('written' | 'multiple-choice' | 'true-false')[];
  multiAnswerMC: boolean;
}
```

### "Study Missed Cards" Flow
Sets `filteredCardIds` in `useFilterStore` with IDs of incorrectly answered cards, then navigates to flashcard mode.

---

## 5. Spinner Mode (Game)

**File:** `src/components/modes/games/SpinnerMode.tsx`
**Route:** `/sets/:id/study/spinner`
**Min Cards:** 2

### Behavior
- SVG wheel with up to 12 segments (one per card), color-coded by hue
- Click SPIN: wheel rotates 5-8 full turns plus random offset with CSS easing
- After 4-second spin, selected card appears in a flip-card modal
- "Got it" removes card from wheel; "Skip" keeps it
- Game ends when all cards removed

### Wheel Mechanics
- Segment angle = 360 / remaining cards
- Landing calculated to center pointer on random segment
- Rotation uses `cubic-bezier(0.17, 0.67, 0.12, 0.99)` for natural deceleration

---

## 6. Block Builder Mode (Game)

**File:** `src/components/modes/games/BlockBuilderMode.tsx`
**Route:** `/sets/:id/study/block-builder`
**Min Cards:** 4

### Behavior
- Answer questions to stack blocks; rising lava threatens your tower
- Correct answers add a 40px block and score points
- Wrong answers can remove blocks (penalty depends on difficulty)
- Win by reaching the summit; lose if lava overtakes tower

### Config
- **Difficulty**: Easy (no penalty, slow lava), Medium (1 block penalty, medium lava + acceleration), Hard (2 block penalty, fast lava + high acceleration)
- **Question types**: Written, MC, T/F (mix and match)
- **Direction**: Term->Def, Def->Term, Both
- **Question count**: Custom number or infinite mode

### Scoring
```
points = (100 + speedBonus) * streakMultiplier * difficultyMultiplier
speedBonus = max(0, min(50, 50 * (1 - timeSpent/15)))
streakMult = min(2, 1 + (streak-1) * 0.1)
```

### Visual
Split layout: question panel (left) + tower visualization (right, 48-wide on desktop). Tower shows colored blocks stacking upward, lava rising with wave animation, summit line indicator.

---

## 7. Memory Card Flip Mode (Game)

**File:** `src/components/modes/games/MemoryCardFlipMode.tsx`
**Route:** `/sets/:id/study/memory-card-flip`
**Min Cards:** 2

### Behavior
- Classic concentration/memory game
- Select pair count (2-12), generates term + definition card pairs
- Cards face-down with "?" symbol, flip on click with 3D CSS animation
- Match term to definition (equivalence-aware)
- Matched pairs fade out and shrink
- Tracks moves and elapsed time

### Grid Columns
- 2-3 pairs: 2 columns
- 4-6 pairs: 3 columns
- 7-12 pairs: 4 columns

### Results
Shows moves, time, pairs, accuracy percentage. Confetti animation using Framer Motion particles.

---

## 8. Race to Finish Mode (Game)

**File:** `src/components/modes/games/RaceToFinishMode.tsx`
**Route:** `/sets/:id/study/race-to-finish`
**Min Cards:** 4

### Behavior
- Board game with 1-4 players taking turns
- Answer correctly to roll a dice (1-6) and advance on the path
- Wrong answers skip your turn
- Path has random shortcuts (for paths >= 15 cells) that teleport players forward
- First player to reach the finish line wins

### Config
- **Players**: 1-4, each with unique emoji and color
- **Path length**: Presets (10/15/20/30/50/75/100) or custom +/- 5
- **Direction**: Term->Def, Def->Term, Both
- **Question types**: Written, MC, T/F

### Visual
Split layout: question panel (left) + SVG board (right). Board shows nodes connected by lines, player tokens as colored circles with emojis, shortcut arrows, GO/finish markers.

### Player Emojis & Colors
| Player | Emoji | Color |
|--------|-------|-------|
| 1 | Rocket | `#3b82f6` |
| 2 | Fire | `#ef4444` |
| 3 | Leaf | `#22c55e` |
| 4 | Lightning | `#f59e0b` |

---

## Game Browser Modal

**File:** `src/components/GameBrowserModal.tsx`

Grid of 4 game cards showing name, icon, description, category badge, and minimum card requirement. Games with insufficient cards are disabled with opacity 0.4.

| Game | Category | Min Cards |
|------|----------|-----------|
| Spinner | Quick Play | 2 |
| Block Builder | Challenge | 4 |
| Memory Card Flip | Classic | 2 |
| Race to Finish | Timed | 4 |

---

## Common Patterns Across Modes

### Answer Grading
All modes use `gradeWrittenAnswer()` from `src/lib/equivalence.ts` which:
1. Normalizes both user answer and correct answers (lowercase, trim, collapse whitespace, strip HTML)
2. Checks equivalence groups for multi-answer correctness
3. Uses Levenshtein distance with adaptive thresholds: exact for <= 4 chars, 1 edit for <= 8 chars, 15% of length for longer

### SM-2 Integration
Flashcard and Learn modes call `recordReview(card, quality, mode)` from `src/lib/spaced-repetition.ts`. Quality values: 1 (wrong), 2 (again), 3 (hard), 4 (medium), 5 (easy). Test mode uses 4 (correct) or 1 (wrong).

### Session Complete UI
All modes show a completion screen with stats, "Play Again"/"Restart" and "Exit" buttons. Exit navigates to `/sets/:id`.
