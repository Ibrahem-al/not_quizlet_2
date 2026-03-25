import { create } from 'zustand';
import type { Folder } from '@/types';
import { getAllFolders, saveFolder, deleteFolder } from '@/db';

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
    const folders = await getAllFolders();
    folders.sort((a, b) => b.updatedAt - a.updatedAt);
    set({ folders });
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
