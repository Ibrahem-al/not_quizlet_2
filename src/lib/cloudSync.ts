import type { StudySet, Folder } from '@/types';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

// ============================================================
// Column mapping: App uses camelCase, Supabase uses snake_case
// ============================================================

interface DbRow {
  id: string;
  user_id: string;
  title: string;
  description: string;
  tags: string[];
  cards: unknown[];
  created_at: number;
  updated_at: number;
  last_studied: number;
  study_stats: { totalSessions: number; averageAccuracy: number; streakDays: number };
  visibility: 'private' | 'public';
  folder_id: string | null;
  share_token: string | null;
}

function rowToSet(row: DbRow): StudySet {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    description: row.description,
    tags: row.tags ?? [],
    cards: (row.cards ?? []) as StudySet['cards'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastStudied: row.last_studied,
    studyStats: row.study_stats ?? { totalSessions: 0, averageAccuracy: 0, streakDays: 0 },
    visibility: row.visibility,
    folderId: row.folder_id ?? undefined,
    shareToken: row.share_token ?? undefined,
  };
}

function setToRow(set: StudySet): Record<string, unknown> {
  return {
    id: set.id,
    user_id: set.userId,
    title: set.title,
    description: set.description,
    tags: set.tags,
    cards: set.cards,
    created_at: set.createdAt,
    updated_at: set.updatedAt,
    last_studied: set.lastStudied,
    study_stats: set.studyStats,
    visibility: set.visibility,
    folder_id: set.folderId ?? null,
    share_token: set.shareToken ?? null,
  };
}

// ============================================================
// Sync operations
// ============================================================

export async function syncSetsToCloud(
  userId: string,
  localSets: StudySet[],
): Promise<StudySet[]> {
  if (!isSupabaseConfigured() || !supabase) return [];

  // Fetch user's cloud sets (only metadata, not full cards for speed)
  const { data: cloudRows, error } = await supabase
    .from('study_sets')
    .select('*')
    .eq('user_id', userId);

  if (error) {
    console.error('Failed to fetch cloud sets:', error.message);
    return [];
  }

  const cloudSets = ((cloudRows ?? []) as DbRow[]).map(rowToSet);
  const cloudMap = new Map(cloudSets.map(s => [s.id, s]));

  const toUpsert: Record<string, unknown>[] = [];
  const mergedSets: StudySet[] = [];

  // Merge local → cloud
  for (const local of localSets) {
    const cloud = cloudMap.get(local.id);
    if (!cloud) {
      // Local-only: push to cloud
      toUpsert.push(setToRow({ ...local, userId }));
      mergedSets.push({ ...local, userId });
    } else if (local.updatedAt > cloud.updatedAt) {
      // Local is newer
      toUpsert.push(setToRow({ ...local, userId, shareToken: cloud.shareToken ?? local.shareToken }));
      mergedSets.push({ ...local, userId, shareToken: cloud.shareToken ?? local.shareToken });
    } else {
      // Cloud is newer or equal — use cloud version
      mergedSets.push(cloud);
    }
    cloudMap.delete(local.id);
  }

  // Cloud-only sets (not in local) — pull down
  for (const cloud of cloudMap.values()) {
    mergedSets.push(cloud);
  }

  // Batch upsert changed sets
  if (toUpsert.length > 0) {
    const { error: upsertError } = await supabase
      .from('study_sets')
      .upsert(toUpsert, { onConflict: 'id' });

    if (upsertError) {
      console.error('Failed to upsert sets:', upsertError.message);
    }
  }

  return mergedSets;
}

export async function syncSetToCloud(set: StudySet): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;

  const { error } = await supabase
    .from('study_sets')
    .upsert(setToRow(set), { onConflict: 'id' });

  if (error) {
    console.error('Failed to sync set:', error.message);
  }
}

export async function deleteSetFromCloud(setId: string): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;

  const { error } = await supabase
    .from('study_sets')
    .delete()
    .eq('id', setId);

  if (error) {
    console.error('Failed to delete set from cloud:', error.message);
  }
}

// ============================================================
// Share link operations
// ============================================================

/** Generate a share token for a set and persist to cloud */
export async function generateShareToken(set: StudySet): Promise<string | null> {
  if (!isSupabaseConfigured() || !supabase) return null;

  const token = crypto.randomUUID();

  const { error } = await supabase
    .from('study_sets')
    .update({ share_token: token })
    .eq('id', set.id);

  if (error) {
    console.error('Failed to generate share token:', error.message);
    return null;
  }

  return token;
}

/** Remove share token (stop sharing) */
export async function removeShareToken(setId: string): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;

  const { error } = await supabase
    .from('study_sets')
    .update({ share_token: null })
    .eq('id', setId);

  if (error) {
    console.error('Failed to remove share token:', error.message);
  }
}

/** Fetch a shared set by token — works without auth */
export async function fetchSharedSet(shareToken: string): Promise<StudySet | null> {
  if (!isSupabaseConfigured() || !supabase) return null;

  // Use the RPC to bypass RLS cleanly
  const { data, error } = await supabase
    .rpc('get_shared_set', { p_share_token: shareToken });

  if (error || !data || (data as DbRow[]).length === 0) {
    // Fallback: direct query (works because shared_select RLS allows it)
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('study_sets')
      .select('*')
      .eq('share_token', shareToken)
      .limit(1)
      .single();

    if (fallbackError || !fallbackData) return null;
    return rowToSet(fallbackData as DbRow);
  }

  return rowToSet((data as DbRow[])[0]);
}

// ============================================================
// Folder column mapping
// ============================================================

interface FolderDbRow {
  id: string;
  user_id: string;
  name: string;
  description: string;
  parent_folder_id: string | null;
  color: string;
  created_at: number;
  updated_at: number;
  share_token: string | null;
}

function rowToFolder(row: FolderDbRow): Folder {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description,
    parentFolderId: row.parent_folder_id ?? undefined,
    color: (row.color ?? 'blue') as Folder['color'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    shareToken: row.share_token ?? undefined,
  };
}

function folderToRow(folder: Folder): Record<string, unknown> {
  return {
    id: folder.id,
    user_id: folder.userId,
    name: folder.name,
    description: folder.description,
    parent_folder_id: folder.parentFolderId ?? null,
    color: folder.color,
    created_at: folder.createdAt,
    updated_at: folder.updatedAt,
    share_token: folder.shareToken ?? null,
  };
}

// ============================================================
// Folder sync operations
// ============================================================

export async function syncFolderToCloud(folder: Folder): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;

  const { error } = await supabase
    .from('folders')
    .upsert(folderToRow(folder), { onConflict: 'id' });

  if (error) {
    console.error('Failed to sync folder:', error.message);
  }
}

/** Sync a folder, all its descendants, and all sets in the tree to cloud */
export async function syncFolderTreeToCloud(
  folderId: string,
  allFolders: Folder[],
  allSets: StudySet[],
): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;

  // BFS to collect the folder + all descendants
  const folderIds = new Set<string>();
  const queue = [folderId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    folderIds.add(id);
    for (const f of allFolders) {
      if (f.parentFolderId === id && !folderIds.has(f.id)) {
        queue.push(f.id);
      }
    }
  }

  // Upsert all folders in the tree
  const folderRows = allFolders
    .filter((f) => folderIds.has(f.id))
    .map(folderToRow);
  if (folderRows.length > 0) {
    const { error } = await supabase
      .from('folders')
      .upsert(folderRows, { onConflict: 'id' });
    if (error) console.error('Failed to sync folder tree:', error.message);
  }

  // Upsert all sets in those folders
  const setRows = allSets
    .filter((s) => s.folderId && folderIds.has(s.folderId))
    .map(setToRow);
  if (setRows.length > 0) {
    const { error } = await supabase
      .from('study_sets')
      .upsert(setRows, { onConflict: 'id' });
    if (error) console.error('Failed to sync folder sets:', error.message);
  }
}

// ============================================================
// Folder share link operations
// ============================================================

/** Generate a share token for a folder and persist to cloud */
export async function generateFolderShareToken(folder: Folder): Promise<string | null> {
  if (!isSupabaseConfigured() || !supabase) return null;

  const token = crypto.randomUUID();

  const { error } = await supabase
    .from('folders')
    .update({ share_token: token })
    .eq('id', folder.id);

  if (error) {
    console.error('Failed to generate folder share token:', error.message);
    return null;
  }

  return token;
}

/** Remove folder share token (stop sharing) */
export async function removeFolderShareToken(folderId: string): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;

  const { error } = await supabase
    .from('folders')
    .update({ share_token: null })
    .eq('id', folderId);

  if (error) {
    console.error('Failed to remove folder share token:', error.message);
  }
}

/** Fetch a shared folder with all subfolders and sets — works without auth */
export async function fetchSharedFolder(
  shareToken: string,
): Promise<{ folder: Folder; subfolders: Folder[]; sets: StudySet[] } | null> {
  if (!isSupabaseConfigured() || !supabase) return null;

  // Fetch subfolders (includes the root folder) and sets in parallel
  const [foldersRes, setsRes] = await Promise.all([
    supabase.rpc('get_shared_folder_subfolders', { p_share_token: shareToken }),
    supabase.rpc('get_shared_folder_sets', { p_share_token: shareToken }),
  ]);

  if (foldersRes.error || !foldersRes.data || (foldersRes.data as FolderDbRow[]).length === 0) {
    // Fallback: try direct query for just the root folder
    const { data, error } = await supabase
      .from('folders')
      .select('*')
      .eq('share_token', shareToken)
      .limit(1)
      .single();
    if (error || !data) return null;

    const folder = rowToFolder(data as FolderDbRow);

    // Fetch sets directly
    const { data: setData } = await supabase
      .from('study_sets')
      .select('*')
      .eq('folder_id', folder.id);

    return {
      folder,
      subfolders: [],
      sets: ((setData ?? []) as DbRow[]).map(rowToSet),
    };
  }

  const allFolders = (foldersRes.data as FolderDbRow[]).map(rowToFolder);
  const rootFolder = allFolders.find((f) => f.shareToken === shareToken) ?? allFolders[0];
  const subfolders = allFolders.filter((f) => f.id !== rootFolder.id);
  const sets = ((setsRes.data ?? []) as DbRow[]).map(rowToSet);

  return { folder: rootFolder, subfolders, sets };
}
