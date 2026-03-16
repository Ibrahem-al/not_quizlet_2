# OCR Import (Photo Import)

## Overview

Users can import flashcards by uploading a photo of written study material. The system uses Tesseract.js for OCR and a custom parser to extract term-definition pairs.

## Component

**File:** `src/components/PhotoImportModal.tsx`

**Props:** `isOpen`, `onClose`, `onImportCards: (cards: { term: string; definition: string }[]) => void`

## Three-Step Workflow

### Step 1: Upload

- Drag-and-drop zone with dashed border
- Click to open file browser
- Accepts: `image/*` (JPG, PNG, WEBP)
- Shows image preview after selection
- Buttons: Clear / Extract Text

### Step 2: Processing

- Dynamically imports `tesseract.js` (not bundled)
- Shows spinner animation with real-time status text and progress bar
- Tesseract logger callback updates progress percentage
- Language: English (`'eng'`)
- On failure: reverts to upload step with error message

### Step 3: Preview & Edit

- **Raw OCR Text**: Editable textarea showing extracted text; re-parses on every change
- **Parsed Cards**: List of term-definition pairs with inline editing
- Each pair has term input, definition input, and delete button
- "Add Pair" button for manual additions
- "Start Over" returns to upload step
- "Import N Cards" button (disabled if no valid pairs)

## OCR Parser

**File:** `src/lib/ocrParser.ts`

### Function
```typescript
function parseOCRText(text: string): { term: string; definition: string }[]
```

### Parsing Strategy (tried in order)

1. **Numbered list**: `1. term - definition` or `1) term - definition`
   - Regex: `/^\d+[.)]\s*(.+?)\s*[-–:]\s*(.+)$/`
   - Requires >= 2 matches to accept

2. **Tab-separated**: `term\tdefinition`
   - Splits on tab character
   - Requires >= 2 matches

3. **Separator-based**: `term - definition` or `term -- definition` or `term: definition`
   - Tries ` - ` (space-dash-space), then ` -- ` (en-dash), then `: ` (colon-space)
   - Requires >= 1 match

4. **Fallback**: Returns empty array if no format detected

### Validation
All parsed pairs are filtered through `filterValid()` which removes entries where either term or definition is empty after trimming.

## Import Flow

1. User uploads image
2. Tesseract.js extracts text
3. `parseOCRText()` generates initial pairs
4. User can edit raw text (re-triggers parsing) or manually adjust pairs
5. On confirm, `onImportCards(validPairs)` is called
6. Parent component creates Card objects from the pairs and adds them to the set
