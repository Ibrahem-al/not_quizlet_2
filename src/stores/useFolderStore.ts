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
    await deleteFolder(id);
    set({
      folders: get().folders.filter((f) => f.id !== id),
      selectedFolderId:
        get().selectedFolderId === id ? null : get().selectedFolderId,
    });
  },

  selectFolder: (id: string | null) => {
    set({ selectedFolderId: id });
  },
}));
