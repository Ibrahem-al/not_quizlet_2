# PDF Generation

## Overview

StudyFlow generates printable study worksheets as downloadable PDFs using jsPDF (dynamically imported). Six different activity types are available, all configured through a polished Print Dialog modal.

## PrintDialog Component

**File:** `src/components/PrintDialog.tsx`

Two-view modal opened from the Print button on SetDetailPage:

### Main Activity Picker View

**Header:**
- Title: "Print Activities"
- Subtitle: "{X} cards in this set"

**Shared Configuration (applies to all non-test activities):**

**Number of Cards:**
- +/- stepper with numeric input in center
- Min 1, max total cards in set
- Preset buttons: 5, 10, 20, All (active preset has primary fill; inactive have bordered outline)

**Answer Direction:**
- Three toggle buttons in a segmented control: "Definition", "Term", "Both"
- Helper text below explains the selected direction:
  - Definition: "Given the term, answer with the definition."
  - Term: "Given the definition, answer with the term."
  - Both: "Each item randomly picks which side is the prompt."

**Activity Grid:**
- 2-column grid of clickable cards, each showing:
  - 40x40px icon container with gradient background
  - Activity name (bold) and one-line description (muted)
  - Disabled state (50% opacity) if set has fewer cards than required
  - Loading spinner in icon slot when that activity is generating

| Activity | Icon | Gradient | Min Cards | Description |
|----------|------|----------|-----------|-------------|
| Printable Test | FileText | purple->pink | 2 | Written, multiple choice, and true/false questions. |
| Line Matching | ArrowLeftRight | blue->cyan | 2 | Draw lines to match terms with definitions. |
| Flashcards | LayoutGrid | emerald->teal | 1 | Cut-out flashcards with term and definition. |
| Matching Game | Puzzle | orange->amber | 2 | Cut-out cards for a physical matching game. |
| Cut & Glue | Scissors | rose->red | 2 | Cut out terms and glue them next to definitions. |
| Lift the Flap | BookOpen | violet->indigo | 2 | Cut flaps with questions, lift to reveal answers underneath. |

If fewer than 2 cards selected, a warning banner: "Select at least 2 cards to generate most activities."

**Footer:** "PDFs are generated locally — no data is sent to any server."

Clicking "Printable Test" navigates to the test config sub-view. All other activities generate immediately with the shared card count and direction.

### Test Configuration Sub-View

Replaces the main picker when "Printable Test" is clicked.

**Header:**
- Back arrow button (returns to main picker)
- Title: "Printable Test"
- Subtitle: "Configure your test before generating"

**Question Types (checkboxes, stacked):**
- "Written answers" (default: checked)
- "Multiple choice" (default: checked)
  - When checked, indented sub-checkbox: "Multi-answer MC" (default: unchecked)
  - When multi-answer checked, helper: "MC questions may have multiple correct answers shown in the answer key."
- "True / False" (default: checked)

**Answer Direction:** Same segmented toggle as main view.

**Number of Questions:**
- +/- stepper with numeric input
- Min 1, max 3x card count or 50 (whichever larger)
- Presets: 5, 10, 20, All (card count), 2x All (if within max)
- Helper when count > card count: "Cards will repeat evenly — each card appears at least X times"

**Generate Button:** Full-width, gradient (purple->pink), "Generate Test" with FileText icon. Loading state: spinner + "Generating PDF..."

## PDF Generator

**File:** `src/lib/pdfGenerator.ts`

### Config Interface
```typescript
interface PDFConfig {
  direction: 'term-to-def' | 'def-to-term' | 'both';
  count: number;
  questionTypes?: ('written' | 'multiple-choice' | 'true-false')[];
  multiAnswerMC?: boolean;
}
```

### CardPair (internal)
```typescript
interface CardPair {
  card: Card;
  question: string;         // Stripped HTML text
  answer: string;            // Stripped HTML text
  questionImages: string[];  // Base64 images extracted from HTML
  answerImages: string[];    // Base64 images extracted from HTML
  equivalentAnswers: string[]; // Alternative valid answers from equivalence groups
}
```

### Shared Helpers

| Helper | Purpose |
|--------|---------|
| `getJsPDF()` | Dynamic import of jsPDF |
| `extractImages(html)` | Extracts base64 `src` attributes from `<img>` tags in HTML content |
| `slugify(text)` | Lowercase, remove non-alphanumeric, replace spaces with hyphens, truncate to 50 chars |
| `buildPairs(set, config)` | Shuffles cards, applies direction, strips HTML, extracts images, builds equivalence groups, supports card repetition when count > card count |
| `header(doc, title, setTitle)` | 16pt bold title + 9pt gray subtitle (set title \| date) + thin horizontal rule at y=28; returns y=35 |
| `pageNumber(doc)` | Adds "Page X of Y" centered at bottom of every page (8pt gray) — called once before save |
| `checkPage(doc, y, needed)` | Auto-paginates at y=275 |
| `tryAddImage(doc, base64, x, y, maxW, maxH)` | Adds image silently (catches errors for unsupported formats) |
| `renderImageGrid(doc, images, x, y, maxW, imgH)` | Renders 1-6 images in grid layout (1: as-is, 2-3: row, 4: 2x2, 5-6: 3x2); returns height used |
| `wrapText(doc, text, maxWidth)` | Text wrapping via jsPDF `splitTextToSize` |
| `save(doc, type, title)` | Calls `pageNumber()`, then saves as `studyflow-{type}-{slugified-title}.pdf` |

### Equivalence Integration

All activities use `buildEquivalenceGroups()` from `src/lib/equivalence.ts`:
- `buildPairs()` calls `getEquivalentAnswers()` to populate `equivalentAnswers` on each pair
- Answer keys show primary answer first, then equivalents in parentheses: "Dog = A domesticated canine (or A pet animal)"
- Test MC uses `getWrongOptionPool()` to ensure wrong options are never from the same equivalence group

## Common PDF Properties

- **Page size:** A4 (210mm x 297mm), portrait
- **Margins:** 15mm (12mm for Lift the Flap)
- **Content width:** 180mm
- **Font:** Helvetica (normal and bold)
- **Page numbers:** "Page X of Y" centered at bottom, 8pt gray
- **Header:** 16pt bold title + 9pt gray subtitle (set title | date) + 0.3pt horizontal rule
- **Images:** Extracted from card HTML, rendered in grid layout with 2mm gap

## Six Activity Types

### 1. Printable Test (`generateTestPDF`)
**File name:** `studyflow-test-{slugified-title}.pdf`
**Min cards:** 2

**Student info section (top of first page):**
- "Name: ________________________________________"
- "Date: _________________    Score: ______ / {total}"
- Thin horizontal rule

**Written questions:**
- Number + verb ("Define" for term->def, "What term means" for def->term)
- Prompt in quotes, wrapped to 150mm
- Question images below (grid layout, max 40mm wide x 18mm)
- Two blank answer lines (thin gray rules, 8mm apart)

**Multiple choice questions:**
- Number + verb ("What is the definition of" / "Which term matches")
- 4 options with empty circles (2mm) and letters (a/b/c/d)
- Options shuffled; correct + 3 wrong from equivalence-excluded pool
- Multi-answer MC may include equivalent answers as additional correct options

**True/False questions:**
- "True or False: [statement]"
- Statement phrasing depends on direction
- Images shown between statement and circles
- Two large circles (2.5mm) labeled "True" and "False"

**Answer key (last page):**
- Written: answer text + equivalents in parentheses
- MC: correct letter(s) + answer text + equivalents
- T/F: "True" or "False"

### 2. Line Matching (`generateLineMatchingPDF`)
**File name:** `studyflow-matching-worksheet-{slugified-title}.pdf`
**Min cards:** 2

- Instruction: "Draw a line from each item on the left to its match on the right."
- Column headers: "Terms" and "Definitions" (or reversed for def->term)
- Left column: numbered questions (1, 2, 3...)
- Right column: lettered shuffled answers (A, B, C...)
- Dotted connecting line between columns at each row midpoint
- Images below text on each side (max 28mm wide x 14mm)
- 10 items per page max

**Answer key:** "{number} = {letter}" with equivalent letter matches in parentheses

### 3. Flashcards (`generateFlashcardsPDF`)
**File name:** `studyflow-flashcards-{slugified-title}.pdf`
**Min cards:** 1

- 2 columns x 4 rows = 8 cards per page
- Each card: dashed border (0.3pt, 2mm rounded corners, [2,2] dash)
- Card number "#1" in top-right corner (7pt gray)
- Top half: prompt (bold), auto-shrinking font (10pt down to 7pt)
- Dashed horizontal divider in the middle (1.5px dash)
- Bottom half: answer (normal weight, 9pt down to 7pt)
- Both halves support text + images with adaptive layout
- First page instruction: "Cut along dashed lines to create individual flashcards."

### 4. Matching Game (`generateMatchingGamePDF`)
**File name:** `studyflow-matching-game-{slugified-title}.pdf`
**Min cards:** 2

- Header: "Matching Game" + instructions about matching T/D cards
- 3 columns x 5 rows = 15 tiles per page
- Each tile: dashed border (0.3pt, 2mm rounded, [2, 1.5] dash), 58mm x 38mm
- **Type badge** (top-left): "T" (blue #3b82f6) or "D" (green #10b981) in colored rounded rect
- **Match number** (top-right): "#1", "#2" in light gray (6pt)
- Content: auto-shrinking text (9pt to 6pt), term bold, definition normal
- All tiles shuffled randomly (terms and definitions mixed)
- Instruction at bottom: "Cut along dashed lines. Match term cards (T) with definition cards (D)."

### 5. Cut & Glue (`generateCutAndGluePDF`)
**File name:** `studyflow-cut-and-glue-{slugified-title}.pdf`
**Min cards:** 2

**Section 1 — Definition sheet:**
- Student info (Name, Date)
- Instruction: "Cut out the terms and glue each one next to its matching definition."
- Each row: numbered definition (left) + empty glue box (right, 58mm wide, solid gray border)
- "Glue here" in faint text centered in box
- 8 items per page

**Section 2 — Cut-out terms:**
- Header: "Cut Out & Glue" with instruction
- 3-column grid of term boxes
- Dotted borders (0.5pt, heavier for cutting emphasis)
- Bold centered text, auto-shrinking (9pt to 6pt)
- Terms shuffled (different order than definitions)
- Instruction: "Cut along dotted lines, then glue each one next to its matching pair."

**Answer key:** "{number}. {term} = {definition} (or equivalents)"

### 6. Lift the Flap (`generateLiftTheFlapPDF`)
**File name:** `studyflow-lift-the-flap-{slugified-title}.pdf`
**Min cards:** 2

Produces page pairs (base sheet + flap sheet):

**Base sheet (answers):**
- Title: set title (11pt bold)
- Subtitle: "Base Sheet — Answers are revealed when flaps are lifted"
- Full-width rows (186mm x 28mm) with solid border
- Right edge: 10mm glue strip (light gray fill), "GLUE HERE" rotated 90deg
- Answer content centered in remaining space

**Flap sheet (questions):**
- Instruction about cutting and applying glue
- Same grid positions as base sheet
- Dashed borders (cut lines)
- Question content centered

**Assembly:** Cut flaps, glue right edge onto base sheet glue strip, flap covers answer and lifts from left to right.

## File Naming Convention

All PDFs: `studyflow-{type}-{slugified-title}.pdf`

| Activity | Type slug |
|----------|-----------|
| Test | `test` |
| Line Matching | `matching-worksheet` |
| Flashcards | `flashcards` |
| Matching Game | `matching-game` |
| Cut & Glue | `cut-and-glue` |
| Lift the Flap | `lift-the-flap` |

Title is slugified: lowercase, non-alphanumeric removed, spaces to hyphens, truncated to 50 chars.

## Integration

- **SetDetailPage** opens PrintDialog via `setPrintDialogOpen(true)` on the Print button click
- jsPDF is dynamically imported only when a user clicks Generate (~390KB chunk, not in initial bundle)
- All PDF generation runs client-side — no server calls
