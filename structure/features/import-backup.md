# Import Backup Feature (TEMPORARY)

## Overview

Temporary feature that lets users import `studyflow-backup.json` files from the previous version of StudyFlow. Imported sets are mapped to the current data model and saved to IndexedDB as if they were created natively.

**This feature is designed to be removed once migration is complete.**

## Files

| File | Purpose |
|------|---------|
| `src/lib/importBackup.ts` | Parsing, validation, and schema mapping logic |
| `src/components/ImportBackupModal.tsx` | Modal UI: file picker, progress, results |
| `src/pages/HomePage.tsx` | "Import" button in top bar + modal mount (marked with `TEMPORARY` comments) |
| `structure/features/import-backup.md` | This documentation |

## Schema Mapping

The old backup format has a few fields not present in the current app:

| Old Field | Action |
|-----------|--------|
| `sharingMode` | Dropped (not in current types) |
| `effectivePermissions` | Dropped (computed field) |
| `visibility` | Kept, normalized to `'private'` or `'public'` |

All other fields (cards, review history, SM-2 state, FSRS state, study stats) are mapped directly since the schemas are compatible.

## How It Works

1. User clicks **Import** button on the home page
2. Modal opens with a drag-and-drop zone / file picker
3. File is read as text, parsed as JSON
4. Each object in the array is validated: must have `id`, `title`, and `cards` array
5. Valid objects are mapped to the current `StudySet` type (old-only fields stripped, defaults applied)
6. Sets are saved via `useSetStore.addSet()` which persists to IndexedDB (upsert — existing sets with same ID are replaced)
7. Results summary shown: imported count, skipped count, error details

## How to Remove This Feature

Delete these files:
1. `src/lib/importBackup.ts`
2. `src/components/ImportBackupModal.tsx`
3. `structure/features/import-backup.md`

Edit `src/pages/HomePage.tsx` — remove all lines marked with the comment `// TEMPORARY: import backup feature`:
1. Remove `useState` from the import if no other state uses it (it was added for this feature)
2. Remove `import { Upload } from 'lucide-react'` — remove `Upload` from the icon import
3. Remove `import ImportBackupModal from '@/components/ImportBackupModal';`
4. Remove `const [showImport, setShowImport] = useState(false);`
5. Remove the `<Button variant="outline" onClick={() => setShowImport(true)} ...>Import</Button>` block
6. Remove `<ImportBackupModal isOpen={showImport} onClose={() => setShowImport(false)} />`

All temporary additions in `HomePage.tsx` are marked with the comment `TEMPORARY: import backup feature` for easy searching.
