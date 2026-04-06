import { create } from 'zustand';
import type { Folder } from '@/types';
import { getAllFolders, saveFolder, deleteFolder } from '@/db';
import { syncFolderToCloud, pullFoldersFromCloud, deleteFolderFromCloud } from '@/lib/cloudSync';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';

/** Check if a folder (or any ancestor) is shared */
function isSharedFolder(folder: Folder, allFolders: Folder[]): boolean {
  let currentId: string | undefined = folder.id;
  while (currentId) {
    const f = allFolders.find((x) => x.id === currentId);
    if (!f) break;
    if (f.shareToken) return true;
    currentId = f.parentFolderId;
  }
  return false;
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
        user = await new Promise<typeof user>((resolve) => {
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
          // Merge cloud results into current store instead of replacing.
          // Prevents overwriting folders added or edited during the async pull.
          const currentFolders = get().folders;
          const currentMap = new Map(currentFolders.map((f) => [f.id, f]));
          const newFolders = [...currentFolders];

          for (const f of merged) {
            const existing = currentMap.get(f.id);
            if (!existing) {
              newFolders.push(f);
              await saveFolder(f);
            } else if (f.updatedAt > existing.updatedAt) {
              const idx = newFolders.findIndex((x) => x.id === f.id);
              if (idx !== -1) newFolders[idx] = f;
              await saveFolder(f);
            }
          }

          newFolders.sort((a, b) => b.updatedAt - a.updatedAt);
          set({ folders: newFolders });
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
  },

  updateFolder: async (updated: Folder) => {
    await saveFolder(updated);
    const folders = get()
      .folders.map((f) => (f.id === updated.id ? updated : f))
      .sort((a, b) => b.updatedAt - a.updatedAt);
    set({ folders });

    // Auto-sync if this folder is shared (or is inside a shared tree)
    if (isSupabaseConfigured() && isSharedFolder(updated, folders)) {
      const user = useAuthStore.getState().user;
      if (user) {
        syncFolderToCloud({ ...updated, userId: user.id }).catch(() => {});
      }
    }
  },

  removeFolder: async (id: string) => {
    const folder = get().folders.find((f) => f.id === id);
    const parentId = folder?.parentFolderId ?? undefined;

    // Move child folders up to parent
    const childFolders = get().folders.filter((f) => f.parentFolderId === id);
    for (const child of childFolders) {
      const updated = { ...child, parentFolderId: parentId, updatedAt: Date.now() };
      await saveFolder(updated);
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
      const user = useAuthStore.getState().user;
      if (user) {
        deleteFolderFromCloud(id).catch(() => {});
      }
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
