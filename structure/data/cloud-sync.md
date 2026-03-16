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

### deleteSetFromCloud(setId)

Single-set deletion:
```typescript
supabase.from('sets').delete().eq('id', setId)
```

### fetchPublicSets()

Fetches public sets (previously used by the Explore page, which has been removed; this function is currently unused):

1. First tries RPC: `supabase.rpc('get_public_sets')` (optimized server-side function)
2. Falls back to direct query: `supabase.from('sets').select('*').eq('visibility', 'public').order('updatedAt', { ascending: false }).limit(50)`

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
