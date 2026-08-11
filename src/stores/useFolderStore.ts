import { create } from 'zustand';
import type { Folder } from '@/types';
import { getAllFolders, saveFolder, deleteFolder } from '@/db';
import { pullFoldersFromCloud, deleteFolderFromCloud } from '@/lib/cloudSync';
import { queueFolderSync, cancelSync } from '@/lib/syncEngine';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';

/** Cloud-first: push every folder write to Supabase immediately when signed in. */
function cloudSyncFolder(folder: Folder): void {
  if (!isSupabaseConfigured()) return;
  const user = useAuthStore.getState().user;
  if (user) queueFolderSync(folder, user.id);
}

interface FolderStore {
  folders: Folder[];
  selectedFolderId: string | null;

  loadFolders: () => Promise<void>;
  addFolder: (folder: Folder) => Promise<void>;
  updateFolder: (folder: Folder) => Promise<void>;
  removeFolder: (id: string) => Promise<void>;
  selectFolder: (id: string | null) => void;
  /** Get all descendant folder IDs (recursive) */
  getDescendantIds: (id: string) => string[];
}

export const useFolderStore = create<FolderStore>((set, get) => ({
  folders: [],
  selectedFolderId: null,

  loadFolders: async () => {
    const localFolders = await getAllFolders();
    localFolders.sort((a, b) => b.updatedAt - a.updatedAt);
    set({ folders: localFolders });

    // Background cloud pull — non-blocking, offline-first
    // Wait for auth to finish initializing if it hasn't yet
    if (isSupabaseConfigured()) {
      let user = useAuthStore.getState().user;
      if (!user && useAuthStore.getState().loading) {
        user = await new Promise<ReturnType<typeof useAuthStore.getState>['user']>((resolve) => {
          const unsub = useAuthStore.subscribe((state) => {
            if (!state.loading) {
              unsub();
              resolve(state.user);
            }
          });
        });
      }
      if (user) {
        try {
          const merged = await pullFoldersFromCloud(user.id, get().folders);

          // Recompute the merge against the freshest store state at commit
          // time (no awaits between read and commit) so folders added, renamed
          // or removed during the async pull are not clobbered by a stale
          // pre-loop snapshot.
          const currentFolders = get().folders;
          const currentMap = new Map(currentFolders.map((f) => [f.id, f]));
          const nextById = new Map(currentFolders.map((f) => [f.id, f]));
          const writes: Folder[] = [];

          for (const f of merged) {
            const existing = currentMap.get(f.id);
            if (!existing) {
              nextById.set(f.id, f);
              writes.push(f);
            } else if (f.updatedAt > existing.updatedAt) {
              nextById.set(f.id, f);
              writes.push(f);
            }
          }

          set({
            folders: [...nextById.values()].sort(
              (a, b) => b.updatedAt - a.updatedAt,
            ),
          });

          // Persist to IndexedDB outside the state-commit critical section.
          await Promise.all(writes.map((f) => saveFolder(f)));
        } catch {
          // Silent — offline-first, local folders already displayed
        }
      }
    }
  },

  addFolder: async (folder: Folder) => {
    await saveFolder(folder);
    const folders = [...get().folders, folder].sort(
      (a, b) => b.updatedAt - a.updatedAt,
    );
    set({ folders });

    cloudSyncFolder(folder);
  },

  updateFolder: async (updated: Folder) => {
    await saveFolder(updated);
    const folders = get()
      .folders.map((f) => (f.id === updated.id ? updated : f))
      .sort((a, b) => b.updatedAt - a.updatedAt);
    set({ folders });

    cloudSyncFolder(updated);
  },

  removeFolder: async (id: string) => {
    // Drop any queued cloud push first so it cannot re-create the row
    // after the delete lands.
    cancelSync('folder', id);
    const folder = get().folders.find((f) => f.id === id);
    const parentId = folder?.parentFolderId ?? undefined;

    // Move child folders up to parent (cloud FK is ON DELETE SET NULL, so
    // sync the re-parented children immediately to converge with the cloud)
    const childFolders = get().folders.filter((f) => f.parentFolderId === id);
    for (const child of childFolders) {
      const updated = { ...child, parentFolderId: parentId, updatedAt: Date.now() };
      await saveFolder(updated);
      cloudSyncFolder(updated);
    }

    await deleteFolder(id);

    const updatedFolders = get()
      .folders.filter((f) => f.id !== id)
      .map((f) => (f.parentFolderId === id ? { ...f, parentFolderId: parentId } : f))
      .sort((a, b) => b.updatedAt - a.updatedAt);

    set({
      folders: updatedFolders,
      selectedFolderId:
        get().selectedFolderId === id ? null : get().selectedFolderId,
    });

    // Delete from cloud so pullFoldersFromCloud won't resurrect it
    if (isSupabaseConfigured()) {
      deleteFolderFromCloud(id).catch(() => {});
    }
  },

  getDescendantIds: (id: string) => {
    const result: string[] = [];
    const queue = [id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const children = get().folders.filter((f) => f.parentFolderId === current);
      for (const child of children) {
        result.push(child.id);
        queue.push(child.id);
      }
    }
    return result;
  },

  selectFolder: (id: string | null) => {
    set({ selectedFolderId: id });
  },
}));
