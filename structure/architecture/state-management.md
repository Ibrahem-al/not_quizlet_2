# State Management

StudyFlow uses **Zustand 5** for global state across 6 stores. React Query handles server-state caching. No Redux or Context providers are needed (Zustand stores are vanilla JS singletons).

## Store Architecture

```
React Query (QueryClient)
  └── staleTime: 5 minutes
  └── Used for async data fetching

Zustand Stores (6 total)
  ├── useSetStore      - Study sets CRUD + search
  ├── useThemeStore    - Theme toggle with localStorage
  ├── useToastStore    - Notification queue
  ├── useAuthStore     - Supabase auth state
  ├── useFolderStore   - Folders CRUD + selection
  └── useFilterStore   - Card filtering for study modes
```

---

## useSetStore

**File:** `src/stores/useSetStore.ts`

| State | Type | Default | Description |
|-------|------|---------|-------------|
| `sets` | `StudySet[]` | `[]` | All study sets, sorted by `updatedAt` descending |
| `loading` | `boolean` | `false` | Loading indicator during initial fetch |
| `searchQuery` | `string` | `''` | Current search text for filtering sets |

| Action | Signature | Description |
|--------|-----------|-------------|
| `loadSets` | `() => Promise<void>` | Reads all sets from IndexedDB, sorts by updatedAt |
| `addSet` | `(set: StudySet) => Promise<void>` | Saves to DB and adds to state |
| `updateSet` | `(set: StudySet) => Promise<void>` | Updates in DB and state |
| `removeSet` | `(id: string) => Promise<void>` | Deletes from DB and state |
| `setSearchQuery` | `(query: string) => void` | Updates search filter text |

**Data flow:** All mutations write to IndexedDB first (via `saveSet`/`deleteSet`), then update in-memory state. Sorts are applied after every mutation.

---

## useThemeStore

**File:** `src/stores/useThemeStore.ts`

| State | Type | Default | Description |
|-------|------|---------|-------------|
| `theme` | `'light' \| 'dark'` | Auto-detected | Current theme |

| Action | Signature | Description |
|--------|-----------|-------------|
| `toggleTheme` | `() => void` | Switches between light and dark |
| `setTheme` | `(theme: Theme) => void` | Sets specific theme |

**Persistence:** Manual localStorage under key `studyflow-theme`. On initialization:
1. Check `localStorage` for stored preference
2. Fall back to `prefers-color-scheme` media query
3. Apply theme by toggling `.dark` class on `document.documentElement`

---

## useToastStore

**File:** `src/stores/useToastStore.ts`

| State | Type | Default | Description |
|-------|------|---------|-------------|
| `toasts` | `Toast[]` | `[]` | Active toast notifications |

| Action | Signature | Description |
|--------|-----------|-------------|
| `addToast` | `(type: ToastType, message: string, duration?: number) => void` | Creates toast with auto-dismiss |
| `removeToast` | `(id: string) => void` | Removes a specific toast |

**Auto-dismiss durations:**
- `success` / `info`: 4000ms
- `error` / `warning`: 6000ms

Each toast gets a `crypto.randomUUID()` id and a `setTimeout` for auto-removal.

---

## useAuthStore

**File:** `src/stores/useAuthStore.ts`

| State | Type | Default | Description |
|-------|------|---------|-------------|
| `user` | `User \| null` | `null` | Supabase user object |
| `session` | `Session \| null` | `null` | Supabase session object |
| `loading` | `boolean` | `true` | Auth initialization in progress |

| Action | Signature | Description |
|--------|-----------|-------------|
| `setUser` | `(user, session) => void` | Sets user and session state |
| `signOut` | `() => Promise<void>` | Calls `supabase.auth.signOut()` and clears state |
| `initialize` | `() => Promise<void>` | Fetches current session from Supabase |

**Behavior when Supabase is not configured:** `initialize()` sets user/session to null and loading to false. The app functions fully offline.

---

## useFolderStore

**File:** `src/stores/useFolderStore.ts`

| State | Type | Default | Description |
|-------|------|---------|-------------|
| `folders` | `Folder[]` | `[]` | All folders, sorted by updatedAt |
| `selectedFolderId` | `string \| null` | `null` | Currently selected folder for filtering |

| Action | Signature | Description |
|--------|-----------|-------------|
| `loadFolders` | `() => Promise<void>` | Reads all folders from IndexedDB |
| `addFolder` | `(folder: Folder) => Promise<void>` | Creates folder in DB and state |
| `updateFolder` | `(folder: Folder) => Promise<void>` | Updates folder in DB and state |
| `removeFolder` | `(id: string) => Promise<void>` | Deletes folder; clears selection if deleted folder was selected |
| `selectFolder` | `(id: string \| null) => void` | Sets active folder filter |

---

## useFilterStore

**File:** `src/stores/useFilterStore.ts`

| State | Type | Default | Description |
|-------|------|---------|-------------|
| `cardFilter` | `'all' \| 'due' \| 'new' \| 'difficult'` | `'all'` | Active card filter |
| `filteredCardIds` | `string[] \| null` | `null` | Specific card IDs to study (e.g., missed cards from test) |

| Action | Signature | Description |
|--------|-----------|-------------|
| `setFilter` | `(filter: CardFilter) => void` | Sets the card filter type |
| `setFilteredCardIds` | `(ids: string[] \| null) => void` | Sets specific card IDs to study |
| `resetFilter` | `() => void` | Resets both filter and IDs to defaults |

**Usage:** When test mode shows "Study Missed Cards", it sets `filteredCardIds` to the IDs of incorrect cards, then navigates to flashcard mode which uses those IDs.

---

## Data Flow Diagram

```
User Interaction
       │
       ▼
  Component (React)
       │
       ├──► Zustand Store (in-memory state)
       │         │
       │         ├──► Dexie (IndexedDB)  [local persistence]
       │         │
       │         └──► Cloud Sync (Supabase)  [optional]
       │
       └──► React Query  [server-state cache]
                │
                └──► Supabase API  [public sets, auth]
```
