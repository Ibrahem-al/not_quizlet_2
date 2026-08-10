# StudyFlow — Bug Audit Report

**Date:** 2026-07-11
**Scope:** Full codebase — all 72 `src/**` TypeScript/React files, the two Electron files, and the four Supabase SQL migrations.
**Method:** A whole-codebase multi-agent audit (19 domain reviewers reading every file in full), each finding then re-checked by an independent *adversarial verifier* that re-read the source to refute false positives. Results were cross-checked against `tsc -b` (typecheck) and `eslint`.

**Outcome:** 75 candidate defects were raised; **62 were confirmed** against the actual code and **13 were refuted** (documented at the end for transparency).

> ## ✅ RESOLUTION (2026-07-12)
> **All 62 confirmed bugs have been fixed.** Verified: `tsc -b` clean (0 errors), ESLint 0 errors (was 36), `vite build` passes, and all 4 game modes render live with 0 console errors. New files added: `src/lib/sanitize.ts` (XSS), `src/components/ErrorBoundary.tsx`, `src/pages/NotFoundPage.tsx`, `supabase/migrations/005_security_hardening.sql`. See the `2026-07-12` section of `IMPROVEMENTS.md` for the summary.
>
> **Follow-ups requiring separate action (noted by the security agent):** the `005` migration must be **applied** to Supabase; and to fully realize M17/H11, the app should also (1) remove the direct-query fallback in `fetchSharedSet` (`cloudSync.ts`), (2) insert bcrypt hashes into `password_history` on password change and fix the two `check_password_reuse` callers, and (3) move `record_failed_login`/`record_password_reset_request` to a `service_role` edge function.

| Severity | Count |
|----------|------:|
| 🔴 Critical | 1 |
| 🟠 High | 13 |
| 🟡 Medium | 21 |
| 🟢 Low | 27 |
| **Total** | **62** |

> Severities below use the **verifier-corrected** rating (several original ratings were adjusted up or down after the code was re-read). Where two reviewers reported the *same* root cause, the findings are merged and marked *(independently confirmed ×2)*.

---

## Table of Contents
1. [Critical](#-critical)
2. [High](#-high)
3. [Medium](#-medium)
4. [Low](#-low)
5. [Build / toolchain issues](#build--toolchain-issues)
6. [Dead code note: Photo Import / OCR](#dead-code-note-photo-import--ocr)
7. [Investigated but NOT bugs (refuted)](#investigated-but-not-bugs-refuted)
8. [Recommended fix order](#recommended-fix-order)

---

## 🔴 Critical

### C1 — Infinite loop freezes the browser when printing a set of image-only (or blank-text) cards
- **File:** `src/lib/pdfGenerator.ts:98` (`buildPairs`)
- **Category:** crash
- **What's wrong:** `buildPairs` filters cards with `set.cards.filter(c => stripHtml(c.term) || stripHtml(c.definition))`. `stripHtml` uses `textContent`, so a card whose term/definition is *image-only* or whitespace-only strips to `''` and is dropped, producing an empty `cards` array. When `config.count > cards.length` (i.e. `> 0`), the repeat loop `while (repeated.length < config.count) repeated.push(...shuffleArray(cards))` pushes nothing each iteration (`shuffleArray([]) === []`), so the condition is never satisfied — an unbreakable loop. This is reachable through normal UI: `PrintDialog` counts cards via `set.cards.length` and app validation treats image-only cards as valid, so the print button is enabled and passes `count > 0` into `buildPairs`.
- **Impact:** Generating **any** print activity for a set whose cards contain no extractable text (image-only cards, or whitespace-only text) hard-freezes the browser tab in an infinite loop. No PDF is produced; the user must force-close the tab.
- **Fix:** Guard the empty pool before the repeat loop — `if (cards.length === 0) return [];` right after the filter — and short-circuit each generator when `buildPairs` returns `[]`.

---

## 🟠 High

### H1 — Cloud sync silently wipes a set's `share_token`, permanently breaking public share links *(data-loss)*
- **File:** `src/lib/cloudSync.ts:495` (`pullSetsFromCloud`, "local is newer" branch)
- **What's wrong:** In the local-newer branch the fire-and-forget upload is built with `setToRow({ ...local, userId })`, and `setToRow` sets `share_token: set.shareToken ?? null`. When a share token exists **only in the cloud** (a share link was created on another device that this device hasn't pulled yet), this full-row upsert overwrites the cloud `share_token` with `null`. The merged local copy is never given the token either. This is asymmetric with the cloud-newer branch (line 486), which deliberately preserves `shareToken`, and with `setContentToRow`/`syncSetContentToCloud`, which strip `share_token` precisely to avoid clobbering it. Crucially, `generateShareToken` does **not** bump `updatedAt`, so the cloud `updatedAt` stays at the last *content* timestamp after sharing — meaning any device with a routine local edit newer than that timestamp enters this branch and nulls the token.
- **Impact:** A public `/shared/:token` link silently 404s for **everyone**, and the token is unrecoverable without re-sharing. Reachable by the ordinary "share on device A, edit on device B, sync" sequence.
- **Fix:** Preserve the cloud token both in memory (`shareToken: local.shareToken ?? cloud.shareToken`) and remotely by uploading via a mapper that omits `share_token` (like `setContentToRow`).

### H2 — `loadSets` merge overwrites newer concurrent card edits when only `userId` differs *(data-loss)*
- **File:** `src/stores/useSetStore.ts:189`
- **What's wrong:** The merge guard is `s.updatedAt > existing.updatedAt || s.userId !== existing.userId`. The `|| userId !==` clause bypasses last-writer-wins. Offline-first local sets often have `userId === undefined` while the cloud row has a real `userId`; `pullSetsFromCloud` returns `{ ...local, userId: cloud.userId }` carrying the **pre-pull** `updatedAt`. If the user edits the set during the pull window, `existing` has the newer edit but the same `undefined` userId, so `s.updatedAt > existing.updatedAt` is false yet `s.userId !== existing.userId` is true — the newer edit is replaced by the stale `s` and `saveSet(s)` writes the stale version to IndexedDB (a permanent overwrite, not just a flicker).
- **Impact:** A card edit made while the set list refreshes from the cloud is silently discarded and the stale pre-edit version is written to disk; it does not return on reload. (Requires a concurrent edit landing during the in-flight pull; most reliably lost when the edit was committed by an unmount-save on navigation.)
- **Fix:** Adopt cloud content only when `s.updatedAt > existing.updatedAt`; when *only* `userId` differs, patch just that field onto the newer `existing` (preserving `existing.updatedAt`/`existing.cards`) instead of replacing the whole object.

### H3 — `formatTime` computes seconds with `% 10` instead of `% 60` *(logic-error, independently confirmed ×2)*
- **File:** `src/lib/utils.ts:59` (used by `MatchMode` timer/summary)
- **What's wrong:** The seconds field is `Math.floor(seconds % 10)`, which keeps only the *ones* digit. Any time whose seconds-within-the-minute is ≥ 10 renders wrong: `formatTime(45.3)` → `0:05.3` (should be `0:45.3`); `formatTime(72)` → `1:02.0` (should be `1:12.0`).
- **Impact:** MatchMode's live clock and "Completed in …" time are wrong for essentially every game longer than 10 seconds — the mode's headline metric reads nonsensically. **Display-only:** the raw numeric `timer` used for any comparison is unaffected.
- **Fix:** `const s = Math.floor(seconds % 60);`

### H4 — Printed multiple-choice distractors are always *definitions*, even when the answer is a *term*
- **File:** `src/lib/pdfGenerator.ts:277` (via `getWrongOptionPool`)
- **What's wrong:** `getWrongOptionPool` (`equivalence.ts:62`) unconditionally returns `c.definition` for every distractor, ignoring direction. For `def-to-term`, the question asks "Which term matches…?" and `pair.answer` is a term, yet all three distractors are definitions — so the options contain exactly one term (the correct answer) among three definitions.
- **Impact:** Printed multiple-choice tests generated with the **Term** or **Both** direction are broken: the correct answer is trivially identifiable because it's the only option of the right type. (The printed answer key itself stays correct; the question is just degenerate.)
- **Fix:** Make the wrong-option pool direction-aware — return terms when the answer is a term, definitions when it's a definition (mirroring the `isTtD` decision in `buildPairs`).

### H5 — Card filter leaks across sets: opening a second set marks ALL its cards inactive *(state)*
- **File:** `src/pages/SetDetailPage.tsx:138` (+ seed at line 119); root cause in `src/stores/useFilterStore.ts`
- **What's wrong:** `useFilterStore.filteredCardIds` is a single **global** value with no per-set scoping, and `SetDetailPage` never clears it on unmount. The restore effect assumes the stored ids belong to *this* set and treats every card *not* in the stored list as excluded. Apply a filter on Set A (store now holds A's ids), open Set B → none of B's ids match, so `excluded` becomes **all** of B's cards and it calls `setExcludedCardIds(all)` + `setFilterApplied(true)`. The initial `filterApplied = !!storedFilterIds` compounds it.
- **Impact:** After filtering one set and navigating to another (via Home), the second set shows "0 of N cards active", every card dimmed, Games reports 0 cards, and every study mode says "Not enough cards". Fully reproducible through normal UI. Recoverable via the "Clear" button, but looks completely broken until noticed.
- **Fix:** Scope the filter to a set id (store the owning `setId` alongside `filteredCardIds` and only restore on match), and clear the store on unmount when leaving without an active same-set filter.

### H6 — Exiting a *shared* study/game session dumps the anonymous viewer on a private "Set not found" page
- **File:** `src/pages/SharedStudyPage.tsx:126` (passes real `set.id` into the modes)
- **What's wrong:** Shared pages pass `setId = set.id` (the real cloud UUID) into the reused study/game modes, which hardcode `navigate(`/sets/${setId}`)` on Exit / Escape / Session-Complete (FlashcardMode, LearnMode, MatchMode, TestMode, and all game modes). `/sets/:id` renders `SetDetailPage`, which looks the set up **only in the viewer's local IndexedDB** — an anonymous viewer has no local copy, so it renders "Set not found".
- **Impact:** Exiting or finishing **any** shared study/game session ejects the viewer to a dead-end error page instead of returning to the shared set. Breaks the core shared-study exit flow for every mode.
- **Fix:** Give the mode components an explicit `exitUrl`/`backTo` prop; shared pages pass `/shared/${token}`, and modes navigate to it for Exit/Escape/Complete instead of `/sets/${setId}`.

### H7 — Same broken exit for shared *folder* study sessions
- **File:** `src/pages/SharedFolderStudyPage.tsx:146`
- **What's wrong:** Same root cause as H6. This page even computes the correct `backUrl = `/shared/folder/${token}`` (line 98) but only uses it in its own error/empty branches — the mode components never receive it, so their in-session Exit still goes to `/sets/<uuid>`.
- **Impact:** Exiting/completing any study or game launched from a shared folder drops the anonymous viewer on "Set not found" instead of the shared folder.
- **Fix:** Thread the existing `backUrl` into the modes via the same exit/back prop as H6.

### H8 — Stored XSS: unsanitized sharer HTML rendered to anonymous viewers *(security, independently confirmed ×2)*
- **File:** `src/components/StudyContent.tsx:13` (sink) — called from `src/pages/SharedSetPage.tsx:245/254` and every shared study mode
- **What's wrong:** `StudyContent` injects `html` via `dangerouslySetInnerHTML` with **no sanitization** (there is no DOMPurify/sanitizer anywhere in `src/`). The HTML originates from the set owner and is served to arbitrary anonymous third parties via the no-auth `/shared/:token` route. Any markup that survives into a stored card body (e.g. `<img src=x onerror=…>` from a crafted import or a direct API write to the owner's own row) executes in the viewer's browser at the app origin. The component is even labelled the "Safe HTML renderer" — it is not.
- **Impact:** A malicious sharer runs JavaScript in any viewer's browser on the app origin — reading the viewer's IndexedDB study data, stealing any Supabase session/localStorage token, abusing the service worker, and running persistent phishing. No login required to be a victim. Affects every shared study surface (sets *and* folders). The app ships **no CSP**, so there's no defense-in-depth backstop.
- **Fix:** Sanitize card HTML before injecting — centralize `DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR })` inside `StudyContent` so every render path is covered; pair with a `script-src 'self'` CSP.

### H9 — Command palette search can only ever find the 8 most-recent sets
- **File:** `src/components/CommandPalette.tsx:236`
- **What's wrong:** The Fuse index is built over **all** sets, but the only `Command.Item`s rendered for the Study Sets group are `recentSets` — the 8 most-recently-updated sets (`.slice(0, MAX_RESULTS)`). cmdk's custom `filter` can only score items that are actually mounted in the DOM, so any set outside the top 8 is unreachable even though Fuse would match it.
- **Impact:** A user with more than 8 sets who searches the palette for an older set's title/tag/term gets "No results found" and cannot navigate to it — the palette's primary search feature is silently broken for most of the library. (Empty-query case still shows the 8 recents.)
- **Fix:** Render a searchable item for every set (let cmdk hide non-matches), or drive the visible list from `fuse.search(query)`, falling back to `recentSets` only when the input is empty.

### H10 — No error boundary: a failed lazy-chunk load blanks the entire app *(crash)*
- **File:** `src/App.tsx:43` (Suspense with no ErrorBoundary anywhere in the tree)
- **What's wrong:** Every page and game mode is `React.lazy`, wrapped only in `<Suspense>`. Suspense catches a *pending* promise but not a *rejected* one, and there is no `ErrorBoundary` anywhere (grep for `componentDidCatch`/`getDerivedStateFromError` → 0 files). If any dynamic `import()` rejects — common for an offline-first app navigating to a not-yet-cached route, or after a redeploy invalidates old hashed chunk names — the rejection propagates uncaught, React unmounts the whole tree, and the user gets a blank white screen with no recovery. Same for any render-time exception in a page.
- **Impact:** A single flaky/offline chunk fetch (or any uncaught render error) wipes the entire UI to a blank page. The stale-chunk-after-redeploy case hits essentially every still-open client on every deploy.
- **Fix:** Wrap the app in an `ErrorBoundary` with a reload/retry fallback, and special-case chunk-load errors (detect + force a one-time reload) so stale-chunk redeploys self-heal.

### H11 — RLS lets anyone enumerate **all** shared sets and harvest every `share_token` *(security)*
- **File:** `supabase/migrations/001_initial_schema.sql:60` (`shared_select` policy)
- **What's wrong:** `shared_select` grants SELECT to every role (anon included) for any row where `share_token IS NOT NULL`. It does **not** require the caller to supply a specific token — it makes every currently-shared set visible in bulk. Since the Supabase anon key is public, anyone can `GET /rest/v1/study_sets?select=*&share_token=not.is.null` and receive every shared set's full row, **including the `share_token` column and the owner's `user_id`**. The "unguessable UUID" comment is void — nobody needs to guess when the policy hands them all out.
- **Impact:** An unauthenticated visitor can dump the title/description/tags/cards of every set anyone has ever shared, harvest all `share_token`s to reconstruct every `/shared/:token` link, and learn every sharer's `user_id`. Sharing with one person effectively publishes to the entire internet and leaks the secret link. (Scope is limited to *shared* sets; private sets keep `share_token = NULL`.)
- **Fix:** Drop the table-level `shared_select` policy; serve shared sets **only** through the `SECURITY DEFINER get_shared_set(p_share_token)` RPC (which filters by the exact token) and remove the direct-query fallback in `fetchSharedSet` (`cloudSync.ts:715`). A row policy cannot express "only if you already know this token."

### H12 — Same RLS flaw for shared folders — enumerate all folders + tokens + subtrees *(security)*
- **File:** `supabase/migrations/002_folder_sharing.sql:26` (`shared_folder_select`, plus `shared_folder_children_select` / `shared_folder_sets_select`)
- **What's wrong:** Identical pattern to H11: `USING (share_token IS NOT NULL)` lets any anon list every shared folder (names/descriptions + the `share_token` column) in bulk, then walk the child-folder and contained-set policies to traverse the whole shared subtree — all without knowing a token.
- **Impact:** Any unauthenticated visitor can enumerate all shared folders across all users, harvest their tokens to rebuild every shared-folder link, and read every set inside those trees.
- **Fix:** Drop these table-level policies; serve shared folders only via the existing token-filtered `SECURITY DEFINER` RPCs (`get_shared_folder` / `get_shared_folder_subfolders` / `get_shared_folder_sets`). Never expose the `share_token` column to anon.

### H13 — Repeated cards in a Learn session lose review history and mis-schedule SRS *(data-loss; downgraded from the original "high" to reflect it affects an opt-in path)*
- **File:** `src/components/modes/LearnMode.tsx:182`
- **What's wrong:** `recordAndAdvance` calls `recordReview(currentQuestion.card, …)`, where `currentQuestion.card` is the **original** object captured at `buildQuestions()` time, and `fairRepeatCards` reuses the exact same object reference for every repeated occurrence. When `questionCount > cards.length` (an explicitly promoted "cards repeat evenly" feature), each `recordReview` starts from the stale pre-session interval/repetition/history. Because `updateSet` replaces the card by id, the later review overwrites the earlier one — history only ever gains **one** entry for that card and SM-2 interval/repetition never compound across repeats.
- **Impact:** In any Learn session with more questions than cards, review history is under-recorded and the spaced-repetition schedule for those cards is wrong; the reinforcement the repeat feature exists to provide never accumulates. *(The same pattern exists at `TestMode.tsx:598`.)*
- **Fix:** Base each review on the card's current store state: `const base = studySet.cards.find(c => c.id === currentQuestion.card.id) ?? currentQuestion.card;` then `recordReview(base, …)`.

---

## 🟡 Medium

### M1 — `pullSetsFromCloud` resurrects locally-hidden legacy-duplicate sets on every pull
- **File:** `src/lib/cloudSync.ts:468`
- **What's wrong:** `cloudSets` is filtered only against pending *deletes*, not against locally *hidden* sets. The caller passes `get().sets`, which already excludes sets with `hiddenReason`. So a hidden-but-cloud-present set has no local match, hits the `if (!local)` "cloud-only" branch, and is pulled down; the store then `saveSet`s the cloud version (which carries no `hiddenReason`/`hiddenAt`/`replacedBySetId` — those aren't in `DbRow`/`rowToSet`), un-hiding it and destroying its hidden markers in IndexedDB. `backfillLegacyHiddenSets` re-hides it on the *next* `loadSets`, but the pull inside that same call resurrects it again — a re-clobber loop.
- **Impact:** The legacy-share de-duplication feature is defeated whenever cloud sync is active: the exact duplicate the user hid keeps reappearing. No card content is lost — only the derived "hidden" marker.
- **Fix:** Pass **all** local sets (including hidden) into `pullSetsFromCloud` and preserve `hiddenReason`/`hiddenAt`/`replacedBySetId` across the merge, or track hidden ids like pending deletes and re-apply markers when a cloud-only set matches a hidden record.

### M2 — Shared folder `share_token` clobbered the same way as sets *(data-loss)*
- **File:** `src/lib/cloudSync.ts:553` (`pullFoldersFromCloud`, local-newer branch)
- **What's wrong:** Same class as H1: the local-newer branch pushes `folderToRow({ ...local, userId })` whose `share_token` is `local.shareToken ?? null`, overwriting any cloud-only folder token. The direct-edit auto-sync path is safely skipped on the second device (`isSharedFolder` is false without the token), so this pull-merge upload is the sole path that reaches and clobbers the cloud token.
- **Impact:** A shared-folder link created on another device can be silently nulled after a local folder edit + sync, breaking the `/shared/folder/:token` URL for all viewers.
- **Fix:** Mirror the H1 fix — preserve `local.shareToken ?? cloud.shareToken` and upload via a mapper that omits `share_token`.

### M3 — `loadSets` merge uses a pre-loop snapshot, clobbering concurrent add/update/remove *(race-condition)*
- **File:** `src/stores/useSetStore.ts:199`
- **What's wrong:** The merge captures `currentSets = get().sets` before a loop that `await saveSet(s)` on each changed set (each `await` yields to the event loop), then commits `set({ sets: … })` from the **pre-loop** snapshot. Any `addSet`/`updateSet`/`removeSet` dispatched during the awaits is overwritten in the store. The clobber window only exists when the merge contains ≥1 cloud-only/newer set (the only iterations that await) — common on first login or after any cloud-side edit.
- **Impact:** Newly created sets can momentarily vanish and just-deleted sets can momentarily reappear during a cloud pull, until the next reload (IndexedDB stays authoritative, so it self-heals). Confusing flicker/apparent data loss on a hot path (`loadSets` fires on every page mount).
- **Fix:** Recompute against fresh state at commit time via a functional `set((state) => …)` updater, and move the `saveSet` writes out of the critical section.

### M4 — OCR numbered-list regex splits on a bare hyphen/colon inside the term
- **File:** `src/lib/ocrParser.ts:16`
- **What's wrong:** The pattern `/^\d+[.)]\s*(.+?)\s*[-–:]\s*(.+)$/` allows the separator to be a hyphen/colon with **no** surrounding spaces and `(.+?)` is non-greedy, so it splits at the *first* hyphen/colon. `1. e-mail - electronic mail` → term `e`, definition `mail - electronic mail`. (Section 3 of the same file deliberately requires spaces around the dash to avoid this; the numbered branch doesn't.)
- **Impact:** Numbered flashcard lists imported via OCR get corrupted whenever a term contains a hyphen or colon (co-op, e-mail, x-ray). *(Mitigated: the parsed pairs go through a preview/edit step before commit — and note this whole feature is currently unreachable; see [Dead code note](#dead-code-note-photo-import--ocr).)*
- **Fix:** Split on the first ` - `/` : ` occurrence like Section 3, or require a space on at least one side while special-casing the `term: definition` colon format.

### M5 — `onDragOver` handler param type not assignable to `DndContext` (typecheck break)
- **File:** `src/components/modes/MatchMode.tsx:337`
- **What's wrong:** `handleDragOver` is hand-typed `(event: { over: { id: string } | null }) => void`, but `@dnd-kit`'s `onDragOver` expects `(event: DragOverEvent) => void` where `over.id` is `UniqueIdentifier` (`string | number`). The contravariant mismatch makes `tsc` error here. Runtime is fine (all tile ids are strings).
- **Impact:** `npm run typecheck` (`tsc -b`) fails at this line and IDEs show an error. **`npm run build` is unaffected** — it runs `vite build` (esbuild), which does not type-check.
- **Fix:** `import { DragOverEvent } from '@dnd-kit/core'`, type the handler accordingly, and use `event.over ? String(event.over.id) : null`.

### M6 — MC distractor pool can contain the correct answer / duplicates (grouped only by term)
- **File:** `src/components/modes/TestMode.tsx:93` (via `getWrongOptionPool`)
- **What's wrong:** `getWrongOptionPool` (`equivalence.ts:51`) excludes only cards sharing the same normalized *term* and never dedupes definitions. If two cards have different terms but the same definition (synonyms — common), that definition isn't excluded from a third card's wrong pool, and the pool is never deduped. Because both the render highlight and `checkMC` grade via `normalizeAnswer` equality, such a "distractor" renders as a second correct-looking option and is graded correct when clicked. (The reverse/term branch and the multi-answer/true-false branches share the un-deduped pool.)
- **Impact:** Test questions can show duplicate options and mark a supposed distractor as correct — the quiz looks broken and lets users "pass" a wrong choice whenever the set has cards with shared definitions/terms.
- **Fix:** Before slicing, drop pool entries whose `normalizeAnswer` value is in `correctAnswers.map(normalizeAnswer)`, and drop duplicate normalized values.

### M7 — Block Builder is mathematically unwinnable when `questionCount` < 5
- **File:** `src/components/modes/games/BlockBuilderMode.tsx:330`
- **What's wrong:** `summitHeight = Math.max(200, questionCount * 40)` for non-infinite games, but each correct answer adds only 40 (one block) and you get at most `questionCount` questions. To win you need `towerHeight >= summitHeight`. For `questionCount` 1–4 the max reachable tower is ≤ 160 < the 200 floor, so `newHeight >= summitHeight` (line 380) can **never** be true. The config UI allows `questionCount` down to 1.
- **Impact:** A player who selects 2, 3, or 4 questions and answers every one correctly still gets the "Lava Wins!" loss screen — the mode is impossible to win for that whole range (invisible at the default of 10).
- **Fix:** Scale the win target with the actual question count (`summitHeight = config.isInfinite ? 400 : questionCount * 40`) and keep the 200 floor only for the *visual* container height.

### M8 — `PrintDialog` inline sub-components remount every render → count input loses focus each keystroke *(ui-ux)*
- **File:** `src/components/PrintDialog.tsx:131` (also the test-config Stepper at line 382)
- **What's wrong:** `Stepper`, `PresetButtons`, and `DirectionToggle` are declared **inside** the `PrintDialog` function body, so each render creates a fresh component identity and React unmounts/remounts the subtree instead of updating it. Typing in the Stepper's `<input type="number">` → `onChange` → `setCount` → re-render → Stepper remounts → the input is destroyed/recreated and blurs.
- **Impact:** Users cannot type a multi-digit card/question count normally — the number input loses focus after every single digit. (The +/- buttons and presets still work as a workaround.)
- **Fix:** Hoist `Stepper`, `PresetButtons`, and `DirectionToggle` to module scope, passing state via props.

### M9 — Line-matching worksheet answer letters go past 'Z' into punctuation beyond 26 items
- **File:** `src/lib/pdfGenerator.ts:426` (also lines 466, 473)
- **What's wrong:** Labels use `String.fromCharCode(65 + i)`; for `i >= 26` this yields `[`, `\`, `]`, `^`, … instead of letters. The card count is user-selectable up to the full set size via the Stepper and the "All (cardCount)" preset, so any set with >26 selected cards overflows. (The label is a global per-item index, not reset per page.)
- **Impact:** Line-matching worksheets for sets with >26 items show garbage symbols instead of letters for items 27+, in both the column and the answer key.
- **Fix:** Use a base-26 label helper (A…Z, AA, AB, …) at lines 426/466/473, or paginate and restart labels per page.

### M10 — StudyPage applies a leaked global filter without checking the ids belong to this set
- **File:** `src/pages/StudyPage.tsx:90`
- **What's wrong:** StudyPage snapshots `useFilterStore.filteredCardIds` and, if non-empty, filters `validCards` to matching ids with **no** verification the ids belong to the current set. Because the store is global (only cleared on StudyPage mount or explicit Clear), a filter applied to a different set filters this set's cards down to zero. (Related to H5.)
- **Impact:** Studying a set can wrongly show "Not enough cards" even though it has plenty — e.g. after filtering Set A, going to Set B and clicking a study mode. The mode is blocked with no explanation.
- **Fix:** Only apply the filter when at least one filtered id exists in `studySet.cards` (fall back to all valid cards when the intersection is empty), and ideally key the stored filter by `setId`.

### M11 — Image-only cards under-counted on `SharedSetPage`, wrongly disabling study modes
- **File:** `src/pages/SharedSetPage.tsx:68`
- **What's wrong:** `validCards` strips all HTML to plain text and requires non-empty text, so an image-only card counts as 0. But the study pages (`SharedStudyPage.tsx:74`) use `hasTermContent`/`hasDefinitionContent`, which **do** count image-only cards. The two filters disagree.
- **Impact:** An image-only shared set shows "0 cards" and hides all study/games buttons (gated on `validCards.length`), even though the modes would run fine; mixed sets show wrong counts and Learn/Match/Test/Games get disabled when they should be enabled.
- **Fix:** Count with `set.cards.filter(c => hasTermContent(c) || hasDefinitionContent(c))`, matching the study pages.

### M12 — Same image-only under-count per set on `SharedFolderPage`
- **File:** `src/pages/SharedFolderPage.tsx:168` (`getValidCardCount`)
- **What's wrong:** Same text-only filter as M11, disagreeing with `SharedFolderStudyPage.tsx:95` which counts image-only cards as valid.
- **Impact:** Image-only sets in a shared folder show "0 cards" and hide their study buttons (gated on `cardCount > 0`); mixed sets undercount and wrongly disable modes.
- **Fix:** Use `hasTermContent`/`hasDefinitionContent` for the count.

### M13 — `/account/settings` auth guard can fail to redirect, leaving a blank page *(state)*
- **File:** `src/pages/auth/AccountSettingsPage.tsx:32`
- **What's wrong:** The route is **not** wrapped in `RequireAuth` (App.tsx:63), so its only guard is a `useEffect` that reads `loading` imperatively but declares deps `[user, navigate]` and only subscribes to the `user` slice. On a hard refresh while unauthenticated, the store starts `loading=true, user=null`; the effect runs once, sees `loading` truthy, skips `navigate`; then `initialize()` flips `loading=false` with `user` still `null` — but `user` is unchanged (no re-render) and `loading` isn't in the deps (no re-run), so `navigate('/signin')` never fires. This is a race that reliably manifests when `getSession()` stays pending past mount (expired/stale token triggering a token refresh — exactly when a redirect is warranted).
- **Impact:** An unauthenticated visitor who directly loads/refreshes `/account/settings` is never redirected; the component renders `null`, leaving a permanently blank content area. (No data leaks — the password form is separately guarded by `!user`.)
- **Fix:** Subscribe to `loading` and add it to the deps (`if (!loading && !user) navigate('/signin', { replace: true })`), or simply wrap the route in `<RequireAuth>`.

### M14 — OCR failure produces no visible feedback *(ui-ux)*
- **File:** `src/components/PhotoImportModal.tsx:91`
- **What's wrong:** The catch block sets `statusText('OCR failed…')` then immediately `setStep('upload')`, but `statusText` is only rendered on the *processing* step — the upload step never shows it, and there's no other error surface. The catch also never calls `reset()`, so the image stays selected.
- **Impact:** On any OCR failure the modal snaps back to the upload screen with the image still there and zero explanation; the user re-clicks "Extract Text" and hits the same silent failure. *(Currently unreachable — see [Dead code note](#dead-code-note-photo-import--ocr).)*
- **Fix:** Track a dedicated error string and render it on the upload step (or show a toast).

### M15 — `mainWindow` never reset to `null`, so macOS dock-reopen can't recreate the window *(Electron)*
- **File:** `electron/main.js:42`
- **What's wrong:** `createWindow()` never registers `mainWindow.on('closed', () => { mainWindow = null })`. `mainWindow` is declared `let mainWindow;` (so it is `undefined`, never `null`), and the `activate` handler guards recreation with `if (mainWindow === null)` — which is never true. It also leaks a reference to the destroyed native window.
- **Impact:** On macOS, after closing the window (the app stays alive), clicking the dock icon does nothing — the user must force-quit and relaunch.
- **Fix:** Add `mainWindow.on('closed', () => { mainWindow = null; });` inside `createWindow()`.

### M16 — Electron: no Content-Security-Policy and no navigation / window-open guards *(security)*
- **File:** `electron/main.js:15`
- **What's wrong:** `nodeIntegration:false` / `contextIsolation:true` are correctly set, but there's no CSP for loaded content and no `setWindowOpenHandler` / `will-navigate` handler. With no CSP, injected/remote content in the renderer (the app renders user/TipTap HTML) can load external scripts; with no navigation handler, `window.open`/`target=_blank` spawn in-app BrowserWindows and the main window can be navigated to an attacker URL.
- **Impact:** Missing defense-in-depth: a single HTML-injection in card content could load remote scripts and open/navigate to arbitrary origins inside the privileged Electron shell; external links open in-app instead of the system browser. (Bounded to medium by the sandbox/isolation defaults already in place.)
- **Fix:** Set a restrictive CSP (`default-src 'self'; script-src 'self'`) via `onHeadersReceived` or a `<meta>` tag, add `setWindowOpenHandler` → `shell.openExternal` + `return { action: 'deny' }` (remember to import `shell`), and a `will-navigate` handler blocking off-origin navigation.

### M17 — `check_password_reuse` ignores its password argument and history is never populated (dead control) *(security)*
- **File:** `supabase/migrations/001_initial_schema.sql:290`
- **What's wrong:** The body is `SELECT EXISTS(SELECT 1 FROM password_history WHERE user_id = p_user_id …) INTO reused;` — it never references `p_password`, so it can't compare against prior passwords; it only reports whether *any* history row exists. Nothing in the codebase ever inserts into `password_history` (only a SELECT policy, no INSERT path), so the table is always empty and the function always returns false. Both callers (`ResetPasswordPage.tsx:73`, `AccountSettingsPage.tsx:86`) also omit the required `p_user_id` and read a nonexistent `.reused` field on a scalar boolean, so it no-ops even if the SQL were fixed.
- **Impact:** The advertised "cannot reuse your last 5 passwords" protection is completely non-functional — every new password (including one identical to the current) passes. (Actual password hashing is delegated to Supabase Auth, so no credentials are exposed.)
- **Fix:** Insert bcrypt hashes into `password_history` on every change; compare via `crypt(p_password, stored_hash)`; and fix the callers to pass `p_user_id` and read the scalar boolean.

### M18 — `SECURITY DEFINER` functions in migration 001 have a mutable `search_path` *(security)*
- **File:** `supabase/migrations/001_initial_schema.sql:258` (and the other definer functions in 001)
- **What's wrong:** `get_shared_set` and every auth/cleanup `SECURITY DEFINER` function in 001 omit `SET search_path` and reference tables unqualified, so name resolution follows the **caller's** search_path. Migration 002 correctly pins `SET search_path = public`; 001 is inconsistent and trips Supabase's own "Function Search Path Mutable" advisor.
- **Impact:** Theoretical privilege-escalation/data-tampering via search_path shadowing against elevated functions; the guaranteed consequence is persistent Supabase security-advisor warnings on all nine functions. (Practical exploitability is constrained by the PostgREST model.)
- **Fix:** Add `SET search_path = ''` with schema-qualified names (e.g. `public.study_sets`), or `SET search_path = public`, to every definer function in 001.

### M19 — New folder can be created under the wrong parent (stale `selectedFolderId` closure) *(state)*
- **File:** `src/components/FolderSidebar.tsx:154`
- **What's wrong:** `handleCreateFolder` reads `selectedFolderId` (for `parentFolderId` and auto-expand) but its `useCallback` deps are `[newName, newColor, addFolder]` — `selectedFolderId` is omitted, so the callback is only refreshed on name/color keystrokes. The realistic trigger is a **non-navigating** selection change after the last keystroke while the form stays open — clicking "All Sets" or Home's "Clear" (both set `selectedFolderId` to `null` without unmounting the sidebar).
- **Impact:** The new folder is nested under the previously-selected parent instead of at root (and the wrong parent auto-expands) — a silent hierarchy mistake the user must fix by moving the folder.
- **Fix:** Add `selectedFolderId` to the dependency array (or read it via a ref).

### M20 — True/False question mislabels which text is the term vs. definition in reverse direction *(ui-ux)*
- **File:** `src/components/modes/TestMode.tsx:119`
- **What's wrong:** For a reverse (def-to-term) T/F question, `tfPair` is built as `term: card.definition`, `definition: shownDef` (a term), but the render prints `tfPair.term` under the literal label "Term:" and `tfPair.definition` under "Definition:". So the labels are swapped relative to content. (Grading is unaffected.)
- **Impact:** In "Definition → Term" and "Both" modes, True/False questions show the definition under "Term:" and vice-versa, confusing the user about what they're judging.
- **Fix:** Keep `tfPair.term`/`.definition` semantically correct (or swap the labels when reverse).

### M21 — `eslint` set-state-in-effect cascades in the Shared* pages and StatsPage *(performance / correctness smell)*
- **Files:** `src/pages/SharedSetPage.tsx:63`, `SharedStudyPage.tsx:69`, `SharedFolderStudyPage.tsx:90`, `StatsPage.tsx:15`
- **What's wrong:** These effects call `setState` synchronously in the effect body (`react-hooks/set-state-in-effect`), which triggers cascading re-renders (React flags them as errors). In the Shared* pages the effect returns `fetchSet()`/`fetchData()` (a function used as a cleanup that itself sets state); in StatsPage a count-up animation seeds state directly.
- **Impact:** Extra render passes on fetch/animation paths; brittle patterns that will worsen under React's stricter effect semantics. Low functional impact today but flagged by the project's own lint config (36 errors total).
- **Fix:** Derive state during render where possible, or gate the `setState` behind the external-change condition the effect is meant to synchronize; for the count-up, drive it from a ref/`requestAnimationFrame` rather than seeding state in the effect body.

---

## 🟢 Low

### L1 — `migrateOversizedImages` marks migration complete even after a failure, preventing retry
- **File:** `src/lib/cloudSync.ts:1111` — the whole body is in a swallowing try/catch and `localStorage.setItem(MIGRATE_KEY, '1')` runs unconditionally. If compression/`saveSet` throws partway, the one-time migration is permanently marked done. **Impact:** local IndexedDB copies of not-yet-migrated sets keep their oversized inline base64 and are never retried (cloud sync still re-compresses per-sync, so sharing isn't permanently broken). **Fix:** set the flag only after the loop completes without throwing, or record per-set progress.

### L2 — `requireStorage()` doesn't narrow `supabase`, so strict typecheck fails at lines 59 & 71
- **File:** `src/lib/storageImages.ts:59` (and :71) — `requireStorage()` returns `void` and throws when `supabase` is null, but doesn't narrow the `SupabaseClient | null` union, so `supabase.storage` is `TS18047: 'supabase' is possibly 'null'` under strict mode. Runtime is safe. **Impact:** `npm run typecheck`/CI/IDE go red; no runtime or `vite build` effect. **Fix:** make the guard return the non-null client — `function requireStorage(): SupabaseClient { if (!supabase) throw …; return supabase; }` — and use that.

### L3 — Uploaded images are always re-encoded to JPEG, dropping PNG transparency / GIF animation
- **File:** `src/lib/storageImages.ts:54` — every file goes through `compressImage` (`utils.ts:122`), which fills the canvas opaque white and returns `toDataURL('image/jpeg')`, so the blob is always JPEG and the png/webp/gif branches of `fileExtensionFromMimeType` are dead. **Impact:** transparent PNGs get a white background, animated GIFs lose animation, and the stored extension/content-type is always `jpg`. **Fix:** preserve format for alpha/animated sources, or delete the misleading multi-format helper.

### L4 — Equivalence groups are always keyed by term, so alternate terms sharing a definition are never matched
- **File:** `src/lib/equivalence.ts:12` — `buildEquivalenceGroups`/`getEquivalentAnswers` always key by `normalizeAnswer(card.term)` regardless of `direction`, so the `'term'` (def→term) branch can never surface an alternate term that shares a definition. The JSDoc is also inverted. **Impact:** limited to `pdfGenerator` `buildPairs` def→term answer keys (interactive modes hardcode `[card.term]` and don't route through the buggy branch), which drop valid cross-term equivalents. **Fix:** key by the field opposite the answer direction.

### L5 — `normalizeAnswer` doesn't strip diacritics/punctuation → false rejects of short accented answers
- **File:** `src/lib/utils.ts:91` — grading only strips HTML, lowercases, trims, collapses whitespace. With the ≤4-char zero-edit threshold, `café`→`cafe` (precomposed) and `té`→`te` are rejected, and multi-punctuation answers like `U.S.`→`us` (distance 2) fail. **Impact:** systematic false rejects for very short accented answers and punctuation-heavy answers. **Fix:** NFD-normalize and strip combining marks before comparing (treat punctuation folding as a product decision).

### L6 — `getWrongOptionPool` can return a distractor identical to the card's correct answer
- **File:** `src/lib/equivalence.ts:61` — excludes only same-term-group cards, so a different card with the same definition text becomes a "wrong" option equal to the correct one. **Impact:** MCQs can show two identical options when a set has cards with duplicate definitions under different terms (confusing, fewer real distractors). **Fix:** also exclude/dedupe options whose `normalizeAnswer` equals the correct answer's. *(Same underlying gap as M6.)*

### L7 — Loss becomes impossible in Block Builder once the tower is emptied
- **File:** `src/components/modes/games/BlockBuilderMode.tsx:396` — lose check is `if (newLava >= newTower && newTower > 0)`; once the tower is knocked to 0 (penalty on medium/hard), the `newTower > 0` clause is permanently false, so the lava-overtake loss can never fire. **Impact:** in infinite mode the lava visual maxes out but the game never ends (recoverable by answering correctly or Exit); finite mode still ends when questions run out. **Fix:** treat an empty tower under risen lava as a loss (drop the `> 0` guard after at least one answer).

### L8 — Wrong-answer "skip turn" timer in Race mode isn't tracked or cleared on unmount
- **File:** `src/components/modes/games/RaceToFinishMode.tsx:456` — this is the only deferred timer not registered in `moveTimeoutsRef`, so the unmount cleanup can't clear it; it still fires after Exit and calls setters on an unmounted component. **Impact:** on React 19 the setters are silent no-ops (no warning), so the only effect is a wasted `generateQuestion()` call — a consistency/leak-hygiene issue. **Fix:** register the timer in `moveTimeoutsRef` like the others.

### L9 — Reset during a spin doesn't clear the pending 4s spin timeout
- **File:** `src/components/modes/games/SpinnerMode.tsx:110` — `handleReset` resets game state but never clears `spinTimeoutRef` nor resets `isSpinning`, and the Reset button isn't disabled while spinning. **Impact:** after Reset, the stale timeout fires ~4s later and pops a card-detail modal from the pre-reset closure; clicking "Got it" removes that card and sets `doneCount=1` right after a fresh start. **Fix:** clear `spinTimeoutRef` and `setIsSpinning(false)` in `handleReset` (or disable Reset while spinning).

### L10 — Debounce timer ref never reset to `null` → redundant save + `updatedAt` bump on unmount *(state)*
- **File:** `src/pages/SetDetailPage.tsx:199` — `saveTimerRef.current` is set when scheduling but never nulled after the timeout runs or after a manual save, and the unmount cleanup uses `if (saveTimerRef.current)` as its "unsaved changes" guard. So after any save that session, unmount always performs an extra `updateSet` with a fresh `updatedAt`. **Impact:** leaving a set (after ≥1 edit that session) triggers a redundant IndexedDB write + cloud sync and bumps `updatedAt`, marginally reordering the Home grid. **Fix:** set `saveTimerRef.current = null` after the timeout/manual save (nulling is more reliable than reading a stale `saveStatus` in the cleanup closure).

### L11 — Uncontrolled title/description inputs lose edits on navigation without blur *(data-loss)*
- **File:** `src/pages/SetDetailPage.tsx:507` — title/description use `defaultValue` and only commit on `onBlur`. If the user edits then leaves via Back/Forward/shortcut/programmatic nav without blurring, `handleTitleBlur`/`handleDescBlur` never fire and no save is scheduled; the unmount safety net can't rescue it (gated on `saveTimerRef` + reads stale `localSetRef`). **Impact:** the most recent un-blurred title/description edit is silently discarded with no "unsaved" indication. (Card term/definition edits are unaffected — they commit on change.) **Fix:** make the inputs controlled, or capture the DOM value in unmount cleanup.

### L12 — New-Set form has no submit guard → duplicate sets and unhandled rejection
- **File:** `src/pages/NewSetPage.tsx:46` — the submit button isn't disabled during the async `addSet`, and a new id is generated per submit; a double-click creates two sets. There's no try/catch, so a rejected `addSet` leaves an unhandled rejection and no user feedback. **Impact:** rapid double-submit creates a duplicate set (still in the library, not lost); a save failure leaves the user on the form with no error. **Fix:** track a submitting state to disable the button, and wrap `addSet` in try/catch.

### L13 — Brief "Set not found" flash for valid sets during load *(ui-ux)*
- **File:** `src/pages/SetDetailPage.tsx:427` — `loaded` is flipped in one effect and `localSet` is populated in a separate effect (effects run after paint), so there's always one commit with `loaded=true`/`localSet=null` that paints the not-found screen for ~1 frame, even when sets are already loaded. **Impact:** opening a valid set briefly flashes the "Set not found" error before the content appears. **Fix:** resolve the set in the same effect that flips `loaded`, or derive the found set during render.

### L14 — In-progress folder name/description edits clobbered by a background folder update *(state)*
- **File:** `src/pages/FolderDetailPage.tsx:63` — an effect re-seeds the edit inputs from `folder` on every `folder` reference change; a background `loadFolders` cloud pull that returns a strictly-newer folder produces a new reference and overwrites what the user is typing. (The fire-and-forget auto-sync does *not* trigger this — no write-back.) **Impact:** under multi-device/stale-local conditions, renaming a folder can have unsaved keystrokes reset mid-edit. **Fix:** seed the fields only when entering edit mode, or guard the effect with `if (!isEditing)` and deps `[folder?.id, isEditing]`.

### L15 — `SharedSetPage` card preview lists all cards but the header count uses `validCards` *(ui-ux)*
- **File:** `src/pages/SharedSetPage.tsx:222` — the preview maps over `set.cards` (including blank ones) while the "{n} cards" header reports `validCards.length`. **Impact:** when a shared set contains blank cards, the count and the visible list disagree and empty rows render. **Fix:** render the preview from `validCards` and number by its index.

### L16 — Sign-up email field keeps a stuck focus glow because `Input`'s internal `onBlur` is overridden *(ui-ux)*
- **File:** `src/pages/auth/SignUpPage.tsx:182` — `Input` (`ui/Input.tsx`) defines its own `onBlur` that clears the imperatively-set focus box-shadow/border, but spreads `{...props}` *after* it, so passing `onBlur={validateEmail}` replaces the reset. Because the focus style was set via direct DOM mutation, React never clears it. **Impact:** after focusing then blurring the email field, the primary-color focus border + glow stay stuck (the field looks perpetually focused). **Fix:** compose the consumer `onBlur` with `Input`'s internal one instead of letting `{...props}` clobber it.

### L17 — Re-selecting the same image after "Clear" does nothing
- **File:** `src/components/PhotoImportModal.tsx:161` — the hidden file input's `value` is never cleared, so re-picking the exact same file after `reset()` (Clear) fires no `onChange`. (Only the Clear path is affected; "Start Over" remounts a fresh input.) **Impact:** clearing the preview then re-choosing the identical image appears to do nothing — a confusing dead-end. *(Currently unreachable — see [Dead code note](#dead-code-note-photo-import--ocr).)* **Fix:** reset `e.target.value` in `onChange` and `fileInputRef.current.value` in `reset()`.

### L18 — Space key is dead for image-only / empty-definition flashcards (won't even flip)
- **File:** `src/components/modes/FlashcardMode.tsx:58` — `handleProgressiveReveal` fetches the definition words and returns early when `words.length === 0` **before** performing the initial flip, so for a card with an image-only/empty definition, Space does nothing. **Impact:** users studying image-based sets can't use the Space shortcut to flip those cards; the key silently does nothing. **Fix:** flip first, then bail out of the word-reveal branch when there are no words.

### L19 — True/False "false" statements can actually be true, mislabeling the printed answer key
- **File:** `src/lib/pdfGenerator.ts:313` — a false T/F statement picks another pair's answer via `shuffleArray(pairs.filter(idx !== i)…)[0] ?? pair.answer`; with `count = 1` the filtered list is empty and it falls back to `pair.answer` (the correct answer), producing a statement that is actually true while the key says False. Duplicate answers can trigger it too. **Impact:** a generated T/F item can display a correct statement marked "False" in the answer key. **Fix:** when no distinct alternative exists (fallback used, or chosen answer normalizes-equal to `pair.answer`), force `isTrue = true`.

### L20 — Multi-answer MC can drop the primary correct answer, desyncing the answer key
- **File:** `src/lib/pdfGenerator.ts:280` — with `multiAnswerMC` and ≥3 distractors, `shuffleArray([...correctAnswers, ...wrongOptions]).slice(0, 4)` can randomly drop `pair.answer` itself (~1/5 of the time), while the key still renders `entry.answer = pair.answer` against an option letter that now points at the equivalent. **Impact:** the multi-answer MC answer key can reference a letter whose printed text differs, or omit the stated primary answer. **Fix:** reserve slots for all correct answers first, then fill remaining slots with shuffled wrong options; derive the key text from the finalized option array.

### L21 — `setFillColor(230)` is a type error (no single-number overload)
- **File:** `src/lib/pdfGenerator.ts:928` — jsPDF's types declare `setFillColor(ch1: string)` and `setFillColor(ch1,ch2,ch3: number)` but no single-number overload (unlike `setDrawColor`/`setTextColor`), so `tsc` errors here (`TS2345`). Runtime is fine (jsPDF accepts a single number as grayscale) and `vite build` doesn't type-check. **Impact:** contributes to a red `npm run typecheck`/IDE; no runtime or build-output effect. **Fix:** `doc.setFillColor(230, 230, 230)` or `'#e6e6e6'`.

### L22 — No catch-all route — unknown URLs render an empty page *(ui-ux)*
- **File:** `src/App.tsx:70` — `<Routes>` defines only explicit paths with no `<Route path="*">`, so any unmatched URL (mistyped path, stale bookmark) renders `null` — just the header with an empty main area. (Deep links to removed sets still match `/sets/:id`.) **Impact:** bad/outdated URLs show a confusing blank area instead of a 404. **Fix:** add `<Route path="*" element={<NotFoundPage/>} />` (or a redirect).

### L23 — Ctrl/Cmd+K palette shortcut fails when Shift or Caps Lock changes the key case
- **File:** `src/hooks/useCommandPalette.ts:9` — the check is `e.key === 'k'` (lowercase literal); with Caps Lock on or Shift held, `e.key` is `'K'` and the comparison fails. **Impact:** users with Caps Lock (or who include Shift) can't open the command palette via the shortcut. **Fix:** `e.key.toLowerCase() === 'k'`.

### L24 — `MoveToFolderModal` retains inline-create state after close/reopen *(state)*
- **File:** `src/components/MoveToFolderModal.tsx:73` — `isCreating`/`newName` are never reset on close, and the modal is mounted persistently (doesn't unmount), so opening it, clicking "New folder", typing, and dismissing via X/backdrop leaves the create state + typed name populated on the next open (possibly for a different set). **Impact:** a stale half-typed folder name reappears when moving a different set; a hurried "Create & Move" can create an unintended folder. **Fix:** reset local state on `!isOpen` via a `useEffect`.

### L25 — `loadFolders` merge uses a pre-loop snapshot, clobbering concurrent folder changes *(race-condition)*
- **File:** `src/stores/useFolderStore.ts:78` — same stale-snapshot pattern as M3: `newFolders` is built from a pre-loop snapshot while the loop awaits `saveFolder`, and the final `set({ folders: newFolders })` commits the stale snapshot, overwriting any `addFolder`/`updateFolder`/`removeFolder` dispatched during the awaits. **Impact:** a folder created/renamed/deleted during a background folder pull can momentarily disappear/reappear in the sidebar until reload (IndexedDB self-heals). **Fix:** commit against fresh state via a functional updater and move `saveFolder` writes out of the critical section.

### L26 — Anon-executable rate-limit RPCs allow (latent) lockout / reset denial-of-service *(security)*
- **File:** `supabase/migrations/001_initial_schema.sql:313` — `record_failed_login` / `record_password_reset_request` are `SECURITY DEFINER` with the default `EXECUTE` grant to PUBLIC and accept an arbitrary email, inserting RLS-bypassing rows. **Currently latent:** the client calls a *nonexistent* `check_account_lockout` RPC (only `is_account_locked` exists) and the error is swallowed, and the reset-request functions are never called — so no user is actually locked out today. The residual risk is unauthenticated write access to two rate-limit tables (row poisoning / unbounded growth), and the DoS becomes real the moment the lockout check is "fixed" to call `is_account_locked`. **Fix:** `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated`; drive failed-login/reset accounting from a trusted server context (edge function with `service_role`), keyed on IP + a server secret; and fix the `check_account_lockout`/`is_account_locked` name mismatch.

### L27 — jsPDF flap-sheet fill-color type error *(duplicate of L21 — see above)*
> Tracked under L21; listed here only because it was the single confirmed critical/build issue in the `pdf-print` domain's set. No separate action needed.

---

## Build / toolchain issues

Two automated gates were run against the tree:

**`tsc -b` (typecheck) — 4 errors, all captured above:**
- `src/lib/storageImages.ts:59` and `:71` → **L2**
- `src/lib/pdfGenerator.ts:928` → **L21**
- `src/components/modes/MatchMode.tsx:337` → **M5**

> ⚠️ `npm run build` maps to `vite build` (esbuild), which **does not type-check**, so these do not block a production build — but `npm run typecheck` and any CI/IDE type gate is red. Worth wiring `tsc -b` into CI so these can't regress silently.

**`eslint` — 36 errors + 5 warnings**, dominated by:
- `react-hooks/set-state-in-effect` in `SharedSetPage`, `SharedStudyPage`, `SharedFolderStudyPage`, `FolderDetailPage`, `StatsPage` → **M21**
- `@typescript-eslint/no-unused-vars` (e.g. `StatsPage.tsx:242` `'i' is defined but never used`).

---

## Dead code note: Photo Import / OCR

`src/components/PhotoImportModal.tsx` is fully implemented (image upload → `tesseract.js` OCR → `parseOCRText` → preview → import), **but it is never rendered or imported anywhere** in the app (grep for `PhotoImportModal` finds only its own definition). Additionally, **`tesseract.js` is not declared in `package.json` and is not installed in `node_modules`**, and the dynamic `import(/* @vite-ignore */ 'tesseract.js')` (line 75) has no import-map or CDN fallback in `index.html`.

**Consequences:**
- The findings inside this component — **M4** (OCR regex mis-split), **M14** (silent OCR-failure feedback), **L17** (re-select same image) — are **latent**: real code defects, but not currently reachable by users.
- If/when the modal is wired into the UI, OCR will fail immediately on the missing `tesseract.js` dependency (the `catch` at line 89 fires every time), compounded by M14's silent failure. This is why the "OCR always fails" candidate was *refuted as a user-facing bug* (unreachable) while the code-quality defects inside were *confirmed*.

**Recommendation:** either delete the dead component, or wire it up **and** add `tesseract.js` to dependencies (plus fix M4/M14/L17) before shipping the feature.

---

## Investigated but NOT bugs (refuted)

These candidates were raised by a reviewer and then **refuted** by an independent verifier that re-read the code — recorded here so they aren't re-investigated:

| Candidate | File | Why it's not a bug |
|---|---|---|
| Cloud pull resurrects hidden sets (store-layer framing) | `useSetStore.ts:186` | The real defect lives at the sync layer and is captured as **M1**; this store-layer framing of the premise was inaccurate. |
| `fairRepeatCards` infinite-loops on empty items | `utils.ts:116` | The loop math is real in isolation, but callers never invoke it with an empty pool + `count>0`; the reachable infinite-loop is the `pdfGenerator` one (**C1**). |
| `validateCard` MAX_LENGTH flags image cards | `validation.ts:28` | Behaves as intended for the actual stored representation. |
| Untracked completion `setTimeout` in Memory game | `MemoryCardFlipMode.tsx:159` | On React 19 the post-unmount setter is a silent no-op; no observable defect. |
| SetDetailPage ignores `:id` param changes | `SetDetailPage.tsx:149` | Premise false — the route/page remounts on set→set navigation, so no stale set/mis-saved edit. |
| Stats "Reviews by Mode" drops game reviews | `StatsPage.tsx:103` | Verified to behave correctly for the actual mode set. |
| Study heatmap ignores `dayOfWeek` | `StatsPage.tsx:96` | Computed-but-unused field; grid still aligns correctly. |
| SharedFolderStudyPage keeps stale set on param change | `SharedFolderStudyPage.tsx:89` | Requires a no-remount param change that doesn't occur in the actual routing. |
| Photo-import OCR "always fails" | `PhotoImportModal.tsx:75` | Refuted **as a user-facing bug** because the component is unreachable dead code (see note above); the dependency really is missing. |
| Modal scroll-lock released while another modal open | `ui/Modal.tsx:39` | Requires two simultaneously-open Modals, which the app never does. |
| Suspense blanks the header on first navigation | `App.tsx:50` | Navigations run inside a React transition, so the fallback never replaces revealed content. |
| `Input` derives duplicate DOM ids from label | `ui/Input.tsx:14` | Not triggered in practice given how labels/ids are used. |
| Malformed `file://` URL breaks packaged Windows build | `electron/main.js:24` | Empirically produces a valid path on Windows. |

---

## Recommended fix order

1. **Security first (H8, H11, H12):** the unsanitized shared-HTML XSS and the two RLS enumeration flaws expose all shared content + secret tokens to anonymous users. These are the highest real-world risk. (Then M16/M17/M18/L26 harden the rest.)
2. **Data-loss on sync (H1, H2, M1, M2):** `share_token` clobbering and the `loadSets` overwrite silently destroy user work / break share links.
3. **The crash (C1):** trivial guard, prevents a full browser-tab freeze on a normal print action.
4. **Broken core flows (H5, H6, H7, H9, H10, M10):** filter-leak "0 cards", shared-study dead-ends, palette search, and the missing error boundary all make the app look broken through ordinary use.
5. **Study/print correctness (H3, H4, H13, M6, M7, M9, M20, L4–L6, L19, L20):** wrong timers, degenerate MC/T-F questions, SRS mis-scheduling.
6. **Build gate (M5, L2, L21):** wire `tsc -b` into CI and fix the three type errors so regressions surface.
7. **Everything else (remaining Medium/Low):** UX polish, race-condition flicker, Electron hardening, and the dead OCR feature decision.

*Full per-finding evidence (reviewer + verifier reasoning) is available in the audit transcript.*
