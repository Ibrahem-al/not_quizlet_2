# PDF Generation

## Overview

StudyFlow generates printable study worksheets as downloadable PDFs using jsPDF (dynamically imported). Six different activity types are available.

## PrintDialog Component

**File:** `src/components/PrintDialog.tsx`

Two-phase modal:
1. **Activity Selection**: 2-column grid of 6 activity cards with icon, name, description, and minimum card requirement
2. **Configuration**: Direction picker, card count slider, question type toggles (test only), generate button

### Configuration Options

| Option | Values | Available For |
|--------|--------|---------------|
| Direction | Term->Def, Def->Term, Both | All activities |
| Card count | Slider (min cards to total cards) | All activities |
| Question types | Written, MC, True/False | Test only |
| Multi-answer MC | Checkbox | Test only (when MC enabled) |

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

### Shared Helpers
- `getJsPDF()` - Dynamic import of jsPDF
- `buildPairs(set, config)` - Shuffles cards, applies direction, strips HTML, returns `{ question, answer, imageData }[]`
- `header(doc, title)` - Renders title + date + separator line, returns Y offset
- `checkPage(doc, y, needed)` - Auto-paginates when content would overflow
- `addImage(doc, base64, x, y, maxW, maxH)` - Silently adds base64 image
- `wrapText(doc, text, maxWidth)` - Text wrapping via jsPDF `splitTextToSize`

## Six Activity Types

### 1. Test (`generateTestPDF`)
**Min cards:** 4

- Questions page with numbered items
- Cycles through question types: written (blank line), MC (4 shuffled options A-D), T/F (shown definition + "True / False")
- Images embedded below questions when present
- Answer key on separate page

### 2. Line Matching (`generateLineMatchingPDF`)
**Min cards:** 3

- Two columns: numbered questions (left) and lettered shuffled answers (right)
- Students draw lines to match
- Answer key on separate page showing `1 -> B` mappings

### 3. Flashcards (`generateFlashcardsPDF`)
**Min cards:** 1

- 2x4 grid of cards per page (80mm x 55mm each)
- Front sides pages: questions with optional images
- Back sides pages: answers with mirrored column order (so cards match when printed double-sided and cut)

### 4. Matching Game (`generateMatchingGamePDF`)
**Min cards:** 3

- All terms and definitions shuffled together
- Dashed-border cards (80mm x 28mm) arranged in 2 columns
- Designed to be cut out and matched physically

### 5. Cut & Glue (`generateCutAndGluePDF`)
**Min cards:** 3

- Page 1: Numbered definitions with blank boxes (55mm wide) for gluing terms
- Page 2: Shuffled cut-out term strips with dashed borders
- Students cut terms and glue them next to correct definitions

### 6. Lift the Flap (`generateLiftTheFlapPDF`)
**Min cards:** 2

- Instruction: "Fold along the dotted line so the answer is hidden beneath the question"
- Each card: solid border rectangle divided by horizontal dashed fold line
- Top half: question (bold)
- Bottom half: answer (smaller text)
- Students fold paper to hide answers

## Output

All PDFs:
- A4 format, millimeter units
- Helvetica font (built into jsPDF)
- Downloaded as `{Set Title} - {Activity Name}.pdf`
- Font sizes: 16pt title, 9pt date, 10-11pt content
