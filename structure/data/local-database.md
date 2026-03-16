# Local Database (IndexedDB via Dexie)

## Overview

All local data is stored in IndexedDB using Dexie.js (v4.3). The database is called `StudyFlowDB` and is the primary data store -- the app works entirely offline.

**File:** `src/db/index.ts`

## Database Class

```typescript
class StudyFlowDB extends Dexie {
  sets!: Table<StudySet, string>;
  sessions!: Table<StudySession, number>;
  settings!: Table<StudyFlowSettings, number>;
  folders!: Table<Folder, string>;
  folderItems!: Table<FolderItem, string>;
}
```

## Schema (Version 2)

```typescript
this.version(2).stores({
  sets: 'id, updatedAt, createdAt, folderId',
  sessions: '++id, setId, startedAt',
  settings: '++id',
  folders: 'id, userId, parentFolderId, updatedAt',
  folderItems: 'id, folderId, itemId',
});
```

## Tables

### sets
| Index | Type | Description |
|-------|------|-------------|
| `id` (primary) | `string` | UUID primary key |
| `updatedAt` | `number` | For sorting by recency |
| `createdAt` | `number` | For sorting by creation date |
| `folderId` | `string?` | For filtering by folder |

Cards are embedded within each set record as a JSON array -- not a separate table.

### sessions
| Index | Type | Description |
|-------|------|-------------|
| `++id` (primary) | `number` | Auto-incrementing integer |
| `setId` | `string` | For querying sessions by set |
| `startedAt` | `number` | For time-range queries |

### settings
| Index | Type | Description |
|-------|------|-------------|
| `++id` (primary) | `number` | Auto-incrementing |

General key-value settings store with `[key: string]: unknown`.

### folders
| Index | Type | Description |
|-------|------|-------------|
| `id` (primary) | `string` | UUID primary key |
| `userId` | `string` | For multi-user filtering |
| `parentFolderId` | `string?` | For hierarchy queries |
| `updatedAt` | `number` | For sorting |

### folderItems
| Index | Type | Description |
|-------|------|-------------|
| `id` (primary) | `string` | UUID primary key |
| `folderId` | `string` | For querying items in a folder |
| `itemId` | `string` | For reverse lookup |

## CRUD Helper Functions

### Sets
```typescript
getAllSets(): Promise<StudySet[]>          // db.sets.toArray()
getSet(id: string): Promise<StudySet?>    // db.sets.get(id)
saveSet(set: StudySet): Promise<void>     // db.sets.put(set)  -- upsert
deleteSet(id: string): Promise<void>      // db.sets.delete(id)
```

### Folders
```typescript
getAllFolders(): Promise<Folder[]>         // db.folders.toArray()
saveFolder(folder: Folder): Promise<void> // db.folders.put(folder)
deleteFolder(id: string): Promise<void>   // db.folders.delete(id)
```

### Folder Items
```typescript
getFolderItems(folderId: string): Promise<FolderItem[]>  // where('folderId').equals(folderId)
saveFolderItem(item: FolderItem): Promise<void>          // db.folderItems.put(item)
deleteFolderItem(id: string): Promise<void>              // db.folderItems.delete(id)
```

### Sessions
```typescript
logSession(session: StudySession): Promise<void>  // db.sessions.add(session)
```

## Data Flow

```
Component -> Zustand Store -> CRUD Helper -> Dexie -> IndexedDB
```

1. Component calls store action (e.g., `useSetStore.addSet(newSet)`)
2. Store action calls DB helper (e.g., `saveSet(newSet)`)
3. DB helper uses Dexie to write to IndexedDB
4. Store updates in-memory state array

All writes are `put()` (upsert) except sessions which use `add()` (insert-only).

## Storage Considerations

- **No size limit enforcement**: IndexedDB storage depends on browser quota (typically 50-80% of available disk)
- **Card images**: Stored as base64 strings within HTML content, can grow large
- **Image compression**: `compressImage()` in utils limits images to ~500KB per image, max 1024px dimension
- **Performance warning**: Sets with > 500 cards trigger a validation warning due to potential performance impact of loading the full embedded array
