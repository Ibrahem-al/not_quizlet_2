# Cloud Sync

## Overview

Cloud sync is optional and uses Supabase. When `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are not configured, all sync functions return early without errors.

**File:** `src/lib/cloudSync.ts`

## Sync Functions

### syncSetsToCloud(userId, localSets)

Full bidirectional sync for all user sets:

1. Fetch all cloud sets for the user: `supabase.from('sets').select('*').eq('userId', userId)`
2. Build a `Map<id, StudySet>` of cloud sets
3. For each local set:
   - If not in cloud: upload with userId
   - If local `updatedAt` > cloud `updatedAt`: upload (local wins)
   - If cloud is newer: no action (caller handles merging cloud -> local)
4. Batch upsert all changes: `supabase.from('sets').upsert(toUpsert, { onConflict: 'id' })`
5. Store sync timestamp in `localStorage` under `studyflow_last_synced_at`

### syncSetToCloud(set)

Single-set sync:
```typescript
supabase.from('sets').upsert(set, { onConflict: 'id' })
```

### syncSetContentToCloud(set)

Same as `syncSetToCloud` but omits `share_token` from the upsert payload. Used by auto-sync in `useSetStore` to avoid accidentally clearing an individually-shared set's token when syncing content changes.

### deleteSetFromCloud(setId)

Single-set deletion:
```typescript
supabase.from('sets').delete().eq('id', setId)
```

### Share Link Operations (Sets)

- **`generateShareToken(set)`** — Generates `crypto.randomUUID()`, updates `share_token` on the set row in Supabase, returns the token
- **`removeShareToken(setId)`** — Sets `share_token` to null (stops sharing)
- **`fetchSharedSet(shareToken)`** — Fetches set by token via RPC `get_shared_set` (SECURITY DEFINER), with fallback to direct query. Works without auth.

### Folder Cloud Sync

- **`syncFolderToCloud(folder)`** — Upserts a single folder to Supabase
- **`syncFolderTreeToCloud(folderId, allFolders, allSets)`** — BFS from the target folder to collect all descendants, then batch upserts all folders and their sets. Called before generating a folder share token.

### Share Link Operations (Folders)

- **`generateFolderShareToken(folder)`** — Generates UUID, updates `share_token` on folder row, returns token
- **`removeFolderShareToken(folderId)`** — Sets `share_token` to null (stops sharing)
- **`fetchSharedFolder(shareToken)`** — Fetches folder + all subfolders + all sets in the tree. Uses two parallel RPCs (`get_shared_folder_subfolders`, `get_shared_folder_sets`). Falls back to BFS walking `parent_folder_id` if RPCs unavailable. Returns `{ folder, subfolders, sets }` or null.

### Column Mapping (Folders)

| App (camelCase) | DB (snake_case) |
|-----------------|-----------------|
| `id` | `id` |
| `userId` | `user_id` |
| `name` | `name` |
| `description` | `description` |
| `parentFolderId` | `parent_folder_id` |
| `color` | `color` |
| `createdAt` | `created_at` |
| `updatedAt` | `updated_at` |
| `shareToken` | `share_token` |

## Auto Cloud Sync (Shared Folders)

When a set or folder is in a shared tree (i.e., the folder or any ancestor has a `shareToken`), changes are automatically synced to the cloud so the second user sees updates without needing a new share link.

**useSetStore** (`src/stores/useSetStore.ts`):
- `addSet` / `updateSet` — if the set's folder is in a shared tree, calls `syncSetContentToCloud()` (fire-and-forget)
- `updateSet` — also checks the **old** folder (handles moving a set out of a shared folder)
- `removeSet` — if the set was in a shared folder, calls `deleteSetFromCloud()`
- Uses `isInSharedTree(folderId)` helper that walks the folder ancestor chain via `useFolderStore.getState()`

**useFolderStore** (`src/stores/useFolderStore.ts`):
- `updateFolder` — if the folder is shared (or in a shared tree), calls `syncFolderToCloud()` (fire-and-forget)
- Uses `isSharedFolder(folder, allFolders)` helper

All auto-syncs are non-blocking and silently swallow errors to maintain offline-first behavior.

## One-Time Image Migration

**Function:** `migrateOversizedImages()` in `src/lib/cloudSync.ts`
**Trigger:** Called once on app startup from `App.tsx`
**Guard:** `localStorage.studyflow_images_migrated` prevents re-runs

Scans all local sets for cards with base64 images exceeding 500 KB. Compresses them via `compressBase64InHtml()` (Canvas API — max 1024px, JPEG quality 0.7). Saves compressed cards back to IndexedDB and syncs to cloud if the user is authenticated. This fixes legacy cards that bypassed the 500 KB `compressImage()` limit.

**Utility:** `compressBase64InHtml(html)` in `src/lib/utils.ts` — finds all `data:image/...;base64,...` patterns in an HTML string, re-compresses any over 500 KB via Image → Canvas → JPEG.

## Conflict Resolution

**Strategy: Last-Write-Wins (LWW)**

- Compare `updatedAt` timestamps between local and cloud versions
- Higher timestamp wins
- In case of local edit while offline, the local version overwrites cloud on next sync
- No field-level merging -- entire set object is replaced

## Sync Timing

- **localStorage key:** `studyflow_last_synced_at` stores Unix timestamp of last successful sync
- `getLastSyncedAt()` returns this value (0 if never synced)

## Guard Pattern

Every sync function begins with:
```typescript
if (!isSupabaseConfigured() || !supabase) return;
```

This ensures:
- No errors when Supabase is not configured
- No network requests in offline-only mode
- Functions are safe to call from any context

## Error Handling

All Supabase errors are logged to `console.error` but never thrown. Sync failures are silent -- the app continues to function with local data. This is intentional for offline-first behavior.

## Supabase Client

**File:** `src/lib/supabase.ts`

```typescript
const supabaseUrl = getEnvVar('VITE_SUPABASE_URL');
const supabaseAnonKey = getEnvVar('VITE_SUPABASE_ANON_KEY');

export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}
```

Environment variables are read from:
1. `window` globals (for runtime injection)
2. `import.meta.env` (Vite build-time)
