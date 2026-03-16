# StudyFlow Print Options — Detailed Specification

This document describes every printable PDF activity available in StudyFlow, including exactly what the dialog looks like, how each PDF is laid out, and what appears on every page.

---

## Print Dialog

The Print Dialog is a modal opened from the set detail page. It has two views: the main activity picker and the test configuration sub-view.

### Main Activity Picker View

**Header:**
- Title: "Print Activities"
- Subtitle showing card count: "X cards in this set"
- Close button (X icon) in the top-right corner

**Configuration Section (applies to all non-test activities):**

**Number of Cards:**
- A +/- stepper with a numeric input in the center
- Minimum: 1, maximum: total cards in the set
- Preset buttons below: 5, 10, 20, All (showing the actual number)
- Active preset is highlighted with primary color fill; inactive ones have a bordered outline style

**Answer Direction:**
- Three toggle buttons side by side: "Definition", "Term", "Both"
- Only one can be active at a time (radio-style toggle buttons)
- Helper text below explains the selected direction:
  - Definition: "Given the term, answer with the definition."
  - Term: "Given the definition, answer with the term."
  - Both: "Each item randomly picks which side is the prompt."

**Activity Grid:**
A 2-column grid of clickable cards, each showing:
- A 40×40px icon container with a gradient background
- Activity name in bold
- One-line description in smaller muted text
- Disabled state (50% opacity, not clickable) if the set has fewer cards than required
- Loading state shows a spinning loader icon when that activity is generating

**The 6 activity cards in the grid:**

| Activity | Icon | Gradient | Min Cards | Description |
|----------|------|----------|-----------|-------------|
| Printable Test | FileText | purple→pink | 2 | Written, multiple choice, and true/false questions. |
| Line Matching | ArrowLeftRight | blue→cyan | 2 | Draw lines to match terms with definitions. |
| Flashcards | LayoutGrid | emerald→teal | 1 | Cut-out flashcards with term and definition. |
| Matching Game | Puzzle | orange→amber | 2 | Cut-out cards for a physical matching game. |
| Cut & Glue | Scissors | rose→red | 2 | Cut out terms and glue them next to definitions. |
| Lift the Flap | BookOpen | violet→indigo | 2 | Cut flaps with questions, lift to reveal answers underneath. |

If fewer than 2 cards are selected, a full-width banner appears: "Select at least 2 cards to generate most activities."

**Footer:**
- Centered small text: "PDFs are generated locally — no data is sent to any server."

**Clicking "Printable Test"** navigates to the test configuration sub-view (described below). All other activities generate immediately using the shared card count and direction settings.

---

### Test Configuration Sub-View

Replaces the main picker when "Printable Test" is clicked.

**Header:**
- Back arrow button (returns to main picker)
- Title: "Printable Test"
- Subtitle: "Configure your test before generating"
- Close button (X icon)

**Question Types:**
- Three checkboxes stacked vertically:
  - "Written answers" (checked by default)
  - "Multiple choice" (checked by default)
  - "True / False" (checked by default)
- When "Multiple choice" is checked, an indented sub-checkbox appears:
  - "Multi-answer MC" (unchecked by default)
  - When checked, helper text: "MC questions may have multiple correct answers shown in the answer key."

**Answer Direction:**
- Same three toggle buttons as the main view: "Definition", "Term", "Both"
- Same helper text below

**Number of Questions:**
- +/- stepper with numeric input
- Minimum: 1, maximum: 3× the card count or 50, whichever is larger
- Preset buttons: 5, 10, 20, All (card count), and 2× All (if within max)
- If question count exceeds card count, helper text appears: "Cards will repeat evenly — each card appears at least X times"

**Generate Button:**
- Full-width button at the bottom with gradient (purple→pink)
- Text: "Generate Test" with FileText icon
- While generating: shows spinning loader icon and text "Generating PDF..."

---

## Common PDF Properties

All generated PDFs share these characteristics:

- **Page size**: A4 (210mm × 297mm)
- **Orientation**: Portrait
- **Margins**: 15mm on all sides
- **Content width**: 180mm (210 - 15×2)
- **Font**: Helvetica (normal and bold)
- **Text color**: Black (#000000) for content
- **Non-Latin text**: Rendered via high-DPI canvas (4× scale) to handle Arabic, Hebrew, CJK, Thai, Devanagari, etc. with proper shaping and RTL support
- **Images**: Embedded from cards, scaled proportionally to fit within designated areas, preserving aspect ratio
- **Page numbers**: Every page shows "Page X of Y" centered at the bottom in small gray text (8pt, #969696)

### Header Format (shared by most PDFs)
- Title in 16pt bold Helvetica
- Subtitle line in 9pt normal Helvetica, gray (#787878): shows the set title and current date separated by " | "
- A thin horizontal rule (0.3pt, #C8C8C8) drawn below the subtitle
- Total header height: ~22mm

### Image Handling in PDFs
- Images from card HTML content are extracted and resolved to base64
- URL-based images are converted to base64 via canvas
- The `imageData` field (if present) is also included
- Multiple images use a horizontal-first grid layout:
  - 1 image: displayed as-is
  - 2–3 images: side by side in a row
  - 4 images: 2×2 grid
  - 5–6 images: 3×2 grid
- 2mm gap between images in the grid
- Standard inline image height: 18mm
- Smaller option image height: 12mm

---

## 1. Printable Test

**File name**: `studyflow-test-{set-title}.pdf`

### Page 1+: Test Questions

**Student Info Section (top of first page):**
- "Name: ________________________________________" (10pt)
- "Date: _________________    Score: ______ / {total}" (10pt)
- A thin horizontal rule below

**Questions are rendered sequentially, one after another, with automatic page breaks when space runs out.**

#### Written Answer Questions

Layout:
```
{n}. Define: "{prompt text}"
[prompt images if any, up to 40mm wide × 18mm tall]
_________________________________________________
_________________________________________________
```

- Question number + verb in 10pt bold
- Verb is "Define" for term→definition, "What term means" for definition→term
- The prompt text is in quotes
- If the prompt has images, they are shown below the text (indented 5mm, max 40mm wide)
- Two blank answer lines drawn as thin gray horizontal rules, spaced 6mm apart
- 2mm gap after the last line before the next question

#### Multiple Choice Questions

Layout:
```
{n}. What is the definition of "{prompt text}"?
[prompt images if any]
○ a)  Option text
      [option images if any]
○ b)  Option text
○ c)  Option text
○ d)  Option text
```

- Question in 10pt bold
- Verb is "What is the definition of" for term→definition, "Which term matches" for definition→term
- Each option prefixed with an empty circle (2mm radius) and a letter (a/b/c/d)
- Option text is 10pt normal, indented 10mm from left margin
- Option images (if any) are rendered below the option text, indented 15mm, max 60mm wide × 12mm tall
- 4 options always shown
- Options are shuffled randomly
- In multi-answer MC mode, some options may share the same equivalence group as the correct answer

#### True/False Questions

Layout:
```
{n}. True or False: "{prompt}" means "{shown answer}"
[images if any]
○ True      ○ False
```

- Statement in 10pt bold
- If definition→term direction, reads: "'{shown answer}' is the term for '{prompt}'"
- If the shown answer is correct, the true answer is "True"; if it's a substitute wrong answer, the true answer is "False"
- Two large empty circles (2.5mm radius) with "True" and "False" labels, spaced 30mm apart
- If the card has images (from either side), they are shown between the statement and the circles

### Answer Key Page (always the last page)

**Header:** "Answer Key — Test" with set title and date

Each answer listed sequentially:
```
1. The correct answer text (or equivalent alternative answers)
   [answer images if applicable]
2. b) The correct answer text (or equivalent alternative answers)
3. True
...
```

- Written answers show the plain text answer, plus any equivalent answers in parentheses: "(or synonym1, synonym2)"
- Multiple choice answers show the correct letter(s) + the answer text + equivalents
- True/False answers show "True" or "False"
- Answer images are shown below the text for written and MC types (max 60mm wide × 12mm tall)

---

## 2. Line Matching Worksheet

**File name**: `studyflow-matching-worksheet-{set-title}.pdf`

### Worksheet Pages

**Header:** "Line Matching Worksheet" with set title and date

**Instruction line** (9pt, gray): "Draw a line from each item on the left to its match on the right."

**Column headers** (10pt bold):
- Left column header: "Terms" (or "Definitions" if direction is definition→term)
- Right column header: "Definitions" (or "Terms")

**Layout:**
```
Terms                                         Definitions

1. Photosynthesis .......................... A. A large body of water
   [term image]                                [definition image]

2. Ocean .................................. B. Converting light to energy
   [term image]                                [definition image]

3. Mitosis ................................ C. Cell division process
```

- Left column starts at the left margin, 70mm wide
- Right column starts at margin + content width - 70mm, 70mm wide
- Terms are numbered (1, 2, 3...)
- Definitions are lettered (A, B, C...)
- **Definitions are shuffled** so they don't align with their matching terms
- A dotted horizontal line connects the two columns at the vertical midpoint of each row (light gray, 1px dash pattern)
- Images for each side are rendered below the text, indented 10mm, max 28mm wide × 14mm tall
- 10 items per page maximum
- Page breaks added automatically when needed

### Answer Key Page

**Header:** "Answer Key — Line Matching" with set title and date

Each answer listed:
```
1 = C
2 = A (or D)
3 = B
```

- Format: "{number} = {letter}"
- If equivalent answers exist, alternative matching letters are shown in parentheses: "(or D, F)"
- 11pt font, 7mm spacing between entries

---

## 3. Flashcards

**File name**: `studyflow-flashcards-{set-title}.pdf`

### Card Grid Pages

**Top-left corner**: Set title + "— Flashcards" in 8pt gray text

**Grid layout**: 2 columns × 4 rows = 8 cards per page

Each card is a rectangle with:
- **Dashed border**: Light gray (#B4B4B4), 0.3pt wide, 2mm rounded corners, dash pattern [2,2]
- **Card number**: "#1", "#2" etc. in tiny gray text (7pt, #B4B4B4) in the top-right corner
- **Width**: ~87mm per card (content width minus 6mm gap, divided by 2)
- **Height**: ~66mm per card (page height minus margins and header, divided by 4)

**Card interior split into two halves:**

**Top half (prompt side):**
- Content rendered in bold
- If text + images: text takes 35% of half height, images take 60%
- If images only: fills the available space
- If text only: vertically centered, font size auto-shrinks (10pt down to 7pt) to fit

**Dashed horizontal divider**: A thin dashed line across the middle of the card (1.5px dash, #C8C8C8, 0.2pt wide)

**Bottom half (answer side):**
- Content rendered in normal weight
- Same adaptive layout as top half (text + images, images only, or text only)
- Font starts at 9pt, auto-shrinks to 7pt to fit

**Bottom of first page**: Centered instruction in 7pt gray: "Cut along dashed lines to create individual flashcards."

---

## 4. Matching Game

**File name**: `studyflow-matching-game-{set-title}.pdf`

### First Page Header

- Title: "Matching Game" in 14pt bold
- Subtitle: "{set title}  |  Cut out cards. Match each term (T) with its definition (D)." in 8pt gray
- Second line: "Matching numbers in the corners can be used to verify correct pairs." in 8pt gray

### Tile Grid

**Grid layout**: 3 columns × 5 rows = 15 tiles per page

Each tile is a rectangle:
- **Dashed border**: Gray (#A0A0A0), 0.3pt wide, 2mm rounded corners, dash pattern [2, 1.5]
- **Width**: ~58mm per tile (content width minus gaps, divided by 3)
- **Height**: 38mm fixed
- **Horizontal gap**: 3mm between columns
- **Vertical gap**: 3mm between rows

**Tile interior:**

**Type badge** (top-left corner):
- A small rounded rectangle (8mm × 5mm) filled with color
- "T" (blue: rgb(59,130,246)) for term tiles
- "D" (green: rgb(16,185,129)) for definition tiles
- White letter centered in the badge

**Match number** (top-right corner):
- "#1", "#2" etc. in 6pt very light gray (#BEBEBE)
- Used to verify correct pairs (matching terms and definitions share the same number)

**Content area** (below badge, centered):
- If text + images: text takes 35% height (bold for terms, normal for definitions), images take 60%
- If images only: fills the space
- If text only: vertically centered, 9pt font auto-shrinks to 6pt to fit, centered alignment
- Term text is bold; definition text is normal

**All tiles from all cards are shuffled randomly** — term and definition tiles are mixed together in no particular order.

**Bottom of first page**: Centered instruction in 7pt gray: "Cut along dashed lines. Match term cards (T) with definition cards (D)."

---

## 5. Cut & Glue Activity

**File name**: `studyflow-cut-and-glue-{set-title}.pdf`

This activity produces a multi-section PDF:

### Section 1: Definition Sheet (with glue spaces)

**Header:** "Cut & Glue Activity" with set title and date

**Student info:**
- "Name: ________________________________________"
- "Date: _________________"

**Instruction** (9pt, gray): "Cut out the terms and glue each one next to its matching definition." (Flipped if direction is definition→term)

**Layout — each row contains:**

```
1. The definition text here...          ┌─────────────────┐
   [definition images if any]           │                 │
                                        │   Glue here     │
                                        │                 │
                                        └─────────────────┘
```

- Left side: Definition text with number prefix (10pt normal), left-aligned at the margin
  - Definition images rendered below text if present (indented 5mm, max width = content area - glue box - 6mm)
- Right side: An empty box with solid gray border (#A0A0A0, 0.4pt, 1.5mm rounded corners)
  - Box width: ~58mm (1/3 of content width)
  - Box height: matches the row height (minimum 22mm, expands for longer content)
  - "Glue here" in tiny very light gray text (#D2D2D2, 7pt) centered in the box
- 8 items per page maximum
- Automatic page breaks

### Section 2: Cut-Out Terms (on separate page(s))

**Header:** "Cut Out & Glue" in 14pt bold

**Instruction** (8pt, gray): "Cut along the dotted lines. Glue each term next to its matching definition."

**Dashed divider**: A dashed line below the header

**Grid layout**: 3 columns

Each term box:
- **Dotted border**: Darker gray (#505050), 0.5pt wide (heavier to emphasize cutting), 1.5mm rounded corners, dash pattern [2,2]
- **Width**: ~58mm (same as the glue box on the definition page, so they fit perfectly)
- **Height**: Uniform across all boxes — calculated as the tallest content among all terms (minimum 22mm)
- **Horizontal gap**: 4mm, **Vertical gap**: 4mm

**Content**: Term text centered in the box (bold, 9pt auto-shrinks to 6pt)
- If term has images: text on top, images below
- If images only: centered in the box
- **Terms are shuffled** — they don't appear in the same order as the definitions

**Bottom of cut page**: Centered instruction in 7pt gray: "Cut along dotted lines, then glue each one next to its matching pair."

### Answer Key Page

**Header:** "Answer Key — Cut & Glue" with set title and date

Each answer:
```
1. Photosynthesis = The process of converting light energy into chemical energy
2. Mitosis = Cell division (or Cell splitting)
```

- Format: "{number}. {term} = {definition}"
- Equivalent answers shown in parentheses
- 10pt font

---

## 6. Lift the Flap Activity

**File name**: `studyflow-lift-the-flap-{set-title}.pdf`

This activity produces pairs of pages that work together: a base sheet (answers visible) and a flap sheet (questions to cut out and glue on top).

### Page 1 of each pair: Base Sheet (Answers)

**Top-left:** Set title in 11pt bold

**Subtitle** (7pt, gray): "Base Sheet — Answers are revealed when flaps are lifted"

**Layout — full-width horizontal rows:**

Each row is a wide rectangle spanning the full content width:
- **Solid border**: Light gray (#B4B4B4, 0.3pt)
- **Width**: Full content width (~186mm, using 12mm margins)
- **Height**: 28mm fixed
- **Vertical gap**: 4mm between rows

**Right edge — Glue strip:**
- A 10mm wide strip on the right side of each cell
- Filled with light gray (#E6E6E6)
- A thin vertical line separates it from the content area
- "GLUE HERE" text rotated 90° in gray (#A0A0A0, 6pt), centered in the strip

**Content area** (left of glue strip):
- Answer text/images centered within the remaining space (~166mm wide)
- If text + images: text takes 40% of height, images take 55%
- If text only: vertically centered, auto-shrinking font (9pt to 6pt)
- If images only: centered in the space

### Page 2 of each pair: Flap Sheet (Questions)

**Instruction** (7pt, gray): "Cut along the dotted lines. Apply glue to the shaded strip on the base sheet, then press the flap onto the matching cell."

**Layout — same grid positions as the base sheet:**

Each flap is a rectangle at the exact same position as its corresponding answer cell:
- **Dashed border**: Darker gray (#505050, 0.4pt), dash pattern [2,2] — the cut line
- Same dimensions as the base sheet cells (full width × 28mm)

**Content:** Question text/images centered in the full cell
- Same adaptive rendering as the base sheet (text + images, text only, images only)

### How It Works When Assembled

1. Print both pages (base sheet and flap sheet)
2. Cut out each flap along the dotted lines
3. Apply glue to the shaded "GLUE HERE" strip on the base sheet
4. Press the corresponding flap on top, hinging on the glued right edge
5. The flap covers the answer — lift it to reveal the answer underneath

The right-edge hinge means flaps open from left to right, like turning a page. The glue strip on the base sheet exactly aligns with the right edge of the flap.

---

## Direction Behavior Across All Activities

The "Answer Direction" setting affects what appears as the prompt vs. the answer in every activity:

| Direction | Prompt/Question side | Answer/Response side |
|-----------|---------------------|---------------------|
| Term→Definition | The card's term is shown as the prompt | The card's definition is the expected answer |
| Definition→Term | The card's definition is shown as the prompt | The card's term is the expected answer |
| Both | Each item randomly picks one direction | The opposite side is the answer |

When "Both" is selected, the direction is randomized independently for every single item/question — so within the same worksheet, some items might show term→definition and others definition→term.

---

## Answer Equivalence in Printed Materials

All activities that have answer keys use the equivalence system:

- If multiple cards share the same term, any of their definitions are valid answers
- The answer key shows the primary answer first, then equivalent alternatives in parentheses
- Example: `3. Dog = A domesticated canine (or A pet animal, A four-legged companion)`
- In multiple choice, if an option happens to match an equivalent answer, it is also marked as correct in the answer key
- In line matching, if multiple definitions are equivalent, the answer key shows all valid letter matches

---

## File Naming Convention

All PDFs follow this pattern: `studyflow-{type}-{slugified-title}.pdf`

| Activity | File name pattern |
|----------|------------------|
| Test | `studyflow-test-{title}.pdf` |
| Line Matching | `studyflow-matching-worksheet-{title}.pdf` |
| Flashcards | `studyflow-flashcards-{title}.pdf` |
| Matching Game | `studyflow-matching-game-{title}.pdf` |
| Cut & Glue | `studyflow-cut-and-glue-{title}.pdf` |
| Lift the Flap | `studyflow-lift-the-flap-{title}.pdf` |

The title is slugified: spaces replaced with hyphens, non-alphanumeric characters removed, truncated to 50 characters.
