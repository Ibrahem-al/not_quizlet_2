import Dexie, { type Table } from 'dexie';
import type { StudySet, Folder, FolderItem, StudySession } from '@/types';

interface StudyFlowSettings {
  id?: number;
  [key: string]: unknown;
}

class StudyFlowDB extends Dexie {
  sets!: Table<StudySet, string>;
  sessions!: Table<StudySession, number>;
  settings!: Table<StudyFlowSettings, number>;
  folders!: Table<Folder, string>;
  folderItems!: Table<FolderItem, string>;

  constructor() {
    super('StudyFlowDB');

    this.version(2).stores({
      sets: 'id, updatedAt, createdAt, folderId',
      sessions: '++id, setId, startedAt',
      settings: '++id',
      folders: 'id, userId, parentFolderId, updatedAt',
      folderItems: 'id, folderId, itemId',
    });

    this.version(3).stores({
      sets: 'id, updatedAt, createdAt, folderId',
      sessions: '++id, setId, startedAt',
      settings: '++id',
      folders: 'id, userId, parentFolderId, updatedAt, shareToken',
      folderItems: 'id, folderId, itemId',
    });
  }
}

export const db = new StudyFlowDB();

// --- Sets ---

export async function getAllSets(): Promise<StudySet[]> {
  return db.sets.toArray();
}

export async function getSet(id: string): Promise<StudySet | undefined> {
  return db.sets.get(id);
}

export async function saveSet(set: StudySet): Promise<void> {
  await db.sets.put(set);
}

export async function deleteSet(id: string): Promise<void> {
  await db.sets.delete(id);
}

// --- Folders ---

export async function getAllFolders(): Promise<Folder[]> {
  return db.folders.toArray();
}

export async function saveFolder(folder: Folder): Promise<void> {
  await db.folders.put(folder);
}

export async function deleteFolder(id: string): Promise<void> {
  await db.folders.delete(id);
}

// --- Folder Items ---

export async function getFolderItems(folderId: string): Promise<FolderItem[]> {
  return db.folderItems.where('folderId').equals(folderId).toArray();
}

export async function saveFolderItem(item: FolderItem): Promise<void> {
  await db.folderItems.put(item);
}

export async function deleteFolderItem(id: string): Promise<void> {
  await db.folderItems.delete(id);
}

// --- Sessions ---

export async function logSession(session: StudySession): Promise<void> {
  await db.sessions.add(session);
}
