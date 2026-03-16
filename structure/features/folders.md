# Folder Organization System

## Overview

Folders provide hierarchical organization for study sets. They support nesting (parent-child), color coding, and filtering on the home page.

## Data Model

```typescript
interface Folder {
  id: string;           // crypto.randomUUID()
  userId: string;       // Owner (empty string for local-only)
  name: string;         // Display name
  description: string;  // Optional description
  parentFolderId?: string; // Nested folder support
  color: FolderColor;   // One of 9 colors
  createdAt: number;    // Unix timestamp
  updatedAt: number;    // Unix timestamp
  itemCount?: number;   // Computed count
}

type FolderColor = 'blue' | 'green' | 'purple' | 'red' | 'orange' | 'yellow' | 'pink' | 'teal' | 'gray';
```

## Components

### FolderSidebar

**File:** `src/components/FolderSidebar.tsx`

Fixed-width sidebar (240px) on the left side of the home page.

**Layout:**
1. "Folders" header
2. "All Sets" button (selects null folder = show all)
3. Recursive folder tree (FolderNode component)
4. "New Folder" creation area at bottom

**FolderNode** renders recursively:
- Expand/collapse chevron (if has children)
- Colored folder icon (using FOLDER_COLORS map)
- Folder name (truncated)
- Children rendered inside AnimatePresence with height animation

**Create Folder Flow:**
1. Click "New Folder" dashed button
2. Animated form slides in: text input + color picker (9 circles) + Create/Cancel buttons
3. Enter key or Create button saves folder
4. Escape or Cancel dismisses form

### MoveToFolderModal

**File:** `src/components/MoveToFolderModal.tsx`

Modal to assign a set to a folder.

**Props:** `isOpen`, `onClose`, `setId`, `currentFolderId?`

**Features:**
- Recursive FolderRow rendering (respects nesting)
- Current folder highlighted with check mark
- "Remove from folder" option at bottom (only shown if set is currently in a folder)
- Moving a set updates its `folderId` field and `updatedAt` timestamp

## Folder Store

**File:** `src/stores/useFolderStore.ts`

- `folders: Folder[]` - All folders sorted by updatedAt
- `selectedFolderId: string | null` - Active filter
- CRUD actions that persist to IndexedDB via `src/db/index.ts`

## Filtering

On the home page, when `selectedFolderId` is set:
- Only sets with matching `folderId` are displayed
- "All Sets" selection (null) shows everything

## Folder Colors

| Color | Hex | Visual |
|-------|-----|--------|
| blue | `#3b82f6` | Folder icon tint |
| green | `#22c55e` | |
| purple | `#a855f7` | |
| red | `#ef4444` | |
| orange | `#f97316` | |
| yellow | `#eab308` | |
| pink | `#ec4899` | |
| teal | `#14b8a6` | |
| gray | `#6b7280` | |

## Database

Folders stored in Dexie `folders` table with indexes on `id`, `userId`, `parentFolderId`, `updatedAt`.

FolderItems stored in `folderItems` table (id, folderId, itemId) -- though the primary mechanism uses `StudySet.folderId` directly.
