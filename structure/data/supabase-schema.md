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

**Key operations:**
- `select('*').eq('userId', userId)` - Fetch user's sets
- `upsert(set, { onConflict: 'id' })` - Create or update
- `delete().eq('id', setId)` - Delete set
- `select('*').eq('visibility', 'public').order('updatedAt').limit(50)` - Public sets (currently unused; Explore page removed)

### Expected RLS Policies

```sql
-- Users can read their own sets
CREATE POLICY "Users can read own sets"
  ON sets FOR SELECT
  USING (auth.uid()::text = "userId");

-- Users can insert their own sets
CREATE POLICY "Users can insert own sets"
  ON sets FOR INSERT
  WITH CHECK (auth.uid()::text = "userId");

-- Users can update their own sets
CREATE POLICY "Users can update own sets"
  ON sets FOR UPDATE
  USING (auth.uid()::text = "userId");

-- Users can delete their own sets
CREATE POLICY "Users can delete own sets"
  ON sets FOR DELETE
  USING (auth.uid()::text = "userId");

-- Anyone can read public sets
CREATE POLICY "Anyone can read public sets"
  ON sets FOR SELECT
  USING (visibility = 'public');
```

## RPC Functions

### get_public_sets

Optimized server-side function for fetching public sets (Explore page has been removed; this function is currently unused):

```sql
CREATE OR REPLACE FUNCTION get_public_sets()
RETURNS SETOF sets AS $$
  SELECT * FROM sets
  WHERE visibility = 'public'
  ORDER BY "updatedAt" DESC
  LIMIT 50;
$$ LANGUAGE sql STABLE;
```

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
