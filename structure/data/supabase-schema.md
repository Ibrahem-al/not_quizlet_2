# Supabase Schema

## Overview

The Supabase database mirrors the local Dexie schema but adds Row-Level Security (RLS) and server-side functions. The schema is inferred from client-side queries in `src/lib/cloudSync.ts` and auth pages.

## Tables

### sets

The primary table for study set storage and sharing.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `uuid` / `text` | Primary key (client-generated UUID) |
| `title` | `text` | Set title |
| `description` | `text` | Set description |
| `createdAt` | `bigint` | Unix timestamp (ms) |
| `updatedAt` | `bigint` | Unix timestamp (ms) |
| `tags` | `jsonb` / `text[]` | Array of tag strings |
| `cards` | `jsonb` | Embedded array of Card objects |
| `lastStudied` | `bigint` | Unix timestamp (ms) |
| `studyStats` | `jsonb` | `{ totalSessions, averageAccuracy, streakDays }` |
| `visibility` | `text` | `'private'` or `'public'` |
| `folderId` | `text` | Optional folder reference |
| `userId` | `text` / `uuid` | Owner's auth user ID |
| `cardCount` | `integer` | Denormalized card count |
| `shareToken` | `uuid` | Unique share link token (null = not shared) |

**Key operations:**
- `select('*').eq('userId', userId)` - Fetch user's sets
- `upsert(set, { onConflict: 'id' })` - Create or update
- `delete().eq('id', setId)` - Delete set
- `select('*').eq('visibility', 'public').order('updatedAt').limit(50)` - Public sets (currently unused; Explore page removed)

### RLS Policies (study_sets)

- **`owner_select/insert/update/delete`** — Full CRUD for `auth.uid() = user_id`
- **`shared_select`** — Anyone can SELECT if `share_token IS NOT NULL`
- **`shared_folder_sets_select`** — Anonymous users can SELECT sets whose `folder_id` is in a shared folder tree (recursive CTE)

### folders

| Column | Type | Description |
|--------|------|-------------|
| `id` | `uuid` | Primary key |
| `user_id` | `uuid` | Owner (references auth.users) |
| `name` | `text` | Folder name |
| `description` | `text` | Optional description |
| `parent_folder_id` | `uuid` | Parent folder (null = root) |
| `color` | `text` | Color name (default 'blue') |
| `created_at` | `bigint` | Unix timestamp (ms) |
| `updated_at` | `bigint` | Unix timestamp (ms) |
| `share_token` | `uuid` | Unique share link token (null = not shared) |

### RLS Policies (folders)

- **`folders_owner`** — Full CRUD for `auth.uid() = user_id`
- **`shared_folder_select`** — Anyone can SELECT if `share_token IS NOT NULL`
- **`shared_folder_children_select`** — Anyone can SELECT subfolders within a shared folder tree (uses `is_in_shared_folder_tree()` helper)

### RLS Policies (study_sets) — shared folder access

- **`shared_folder_sets_select`** — Anyone can SELECT sets whose `folder_id` is in a shared folder tree (uses `is_in_shared_folder_tree()` helper)

### Helper: is_in_shared_folder_tree(p_folder_id UUID)

`SECURITY DEFINER` function that checks if a folder is a descendant of any shared folder. Used by RLS policies instead of inline recursive CTEs to avoid infinite recursion (inline CTEs in RLS policies re-trigger the same policies, causing Postgres to error). Walks the tree starting from all folders with a non-null `share_token`.

### Migration Files

- `001_initial_schema.sql` — Tables, indexes, RLS, RPC functions for sets, folders, folder_items, auth, live games
- `002_folder_sharing.sql` — Adds `share_token` to folders, RLS policies for shared folder/set access, RPC functions for shared folder fetching (idempotent, safe to re-run)

## RPC Functions

### get_shared_set(p_share_token UUID)

Fetches a shared set by token. SECURITY DEFINER (bypasses RLS). Used by `fetchSharedSet()`.

### get_shared_folder(p_share_token UUID)

Fetches a shared folder by token. SECURITY DEFINER.

### get_shared_folder_subfolders(p_share_token UUID)

Returns the shared folder + all descendant subfolders via recursive CTE on `parent_folder_id`. SECURITY DEFINER.

### get_shared_folder_sets(p_share_token UUID)

Returns all `study_sets` whose `folder_id` is in the shared folder tree (recursive CTE). SECURITY DEFINER.

### check_account_lockout

Brute-force protection check:

```sql
CREATE OR REPLACE FUNCTION check_account_lockout(p_email text)
RETURNS json AS $$
-- Returns { locked: boolean }
-- Checks failed_login_attempts table for recent failures
-- Locks account after N failures within time window
$$ LANGUAGE plpgsql;
```

### record_failed_login

Records a failed login attempt:

```sql
CREATE OR REPLACE FUNCTION record_failed_login(p_email text)
RETURNS void AS $$
-- Inserts into failed_login_attempts table
$$ LANGUAGE plpgsql;
```

## Authentication

Supabase Auth is used with email/password authentication:

- `supabase.auth.signInWithPassword({ email, password })`
- `supabase.auth.signUp({ email, password })`
- `supabase.auth.signOut()`
- `supabase.auth.getSession()` - Restore session on page load
- Password reset via Supabase auth email flow

## Setup Notes

To enable cloud features:

1. Create a Supabase project
2. Create the `sets` table with columns matching the schema above
3. Enable RLS and add the policies listed above
4. Optionally create the RPC functions for public sets and account lockout
5. Set environment variables:
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

The app will detect these at runtime and enable cloud features automatically.
