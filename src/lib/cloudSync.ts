import type { PostgrestError } from '@supabase/supabase-js';
import type { StudySet, Folder } from '@/types';
import { isLazyImageMigrationEnabled } from '@/lib/featureFlags';
import {
  migrateInlineHtmlImagesToStorage,
  uploadBase64ImageToStorage,
  type CardImageStorageContext,
} from '@/lib/storageImages';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { compressBase64InHtml, compressImage } from '@/lib/utils';

// ============================================================
// Pending-delete tracking — prevents deleted items from being
// resurrected by cloud pull when the cloud delete fails.
// ============================================================

type PendingDeleteType = 'set' | 'folder';
type DeleteTable = 'study_sets' | 'folders';

const PENDING_DELETE_KEYS: Record<PendingDeleteType, string> = {
  set: 'sf_pending_set_deletes',
  folder: 'sf_pending_folder_deletes',
};

function getPendingDeletes(type: PendingDeleteType): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(PENDING_DELETE_KEYS[type]) || '[]'));
  } catch {
    return new Set();
  }
}

function setPendingDeletes(type: PendingDeleteType, pending: Set<string>): void {
  localStorage.setItem(PENDING_DELETE_KEYS[type], JSON.stringify([...pending]));
}

function addPendingDelete(type: PendingDeleteType, id: string): void {
  const pending = getPendingDeletes(type);
  pending.add(id);
  setPendingDeletes(type, pending);
}

function removePendingDelete(type: PendingDeleteType, id: string): void {
  const pending = getPendingDeletes(type);
  pending.delete(id);
  setPendingDeletes(type, pending);
}

async function confirmCloudDelete(table: DeleteTable, id: string): Promise<boolean> {
  if (!supabase) return false;

  const { data, error } = await supabase
    .from(table)
    .delete()
    .eq('id', id)
    .select('id');

  if (error) return false;
  if ((data?.length ?? 0) > 0) return true;

  const { count, error: countError } = await supabase
    .from(table)
    .select('id', { head: true, count: 'exact' })
    .eq('id', id);

  if (countError) return false;
  return (count ?? 0) === 0;
}

function retryPendingDeletes(type: PendingDeleteType, table: DeleteTable, ids: Iterable<string>): void {
  if (!supabase) return;

  for (const id of ids) {
    void confirmCloudDelete(table, id)
      .then((confirmed) => {
        if (confirmed) removePendingDelete(type, id);
      });
  }
}

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

const BASE64_CHAR_MULTIPLIER = 1.37;
const MAX_EMBEDDED_MEDIA_BYTES = 500 * 1024;
const MAX_EMBEDDED_MEDIA_CHARS = Math.floor(MAX_EMBEDDED_MEDIA_BYTES * BASE64_CHAR_MULTIPLIER);
const MAX_SHARE_PAYLOAD_BYTES = 4 * 1024 * 1024;

export type CloudSyncErrorCode =
  | 'payload_too_large'
  | 'auth'
  | 'permission'
  | 'legacy_conflict'
  | 'validation'
  | 'network'
  | 'not_synced'
  | 'unknown';

export class CloudSyncError extends Error {
  code: CloudSyncErrorCode;
  causeMessage?: string;
  details?: string;

  constructor(
    code: CloudSyncErrorCode,
    message: string,
    options?: { causeMessage?: string; details?: string },
  ) {
    super(message);
    this.name = 'CloudSyncError';
    this.code = code;
    this.causeMessage = options?.causeMessage;
    this.details = options?.details;
  }
}

function estimateSerializedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

function isImageDataUri(value: string): boolean {
  return /^data:image\/[^;]+;base64,/i.test(value);
}

function getCardImageStorageContext(
  set: StudySet,
  cardId: string,
): CardImageStorageContext | null {
  if (!set.userId) return null;
  return {
    userId: set.userId,
    setId: set.id,
    cardId,
  };
}

async function compressImageDataUri(dataUri: string): Promise<string> {
  try {
    const response = await fetch(dataUri);
    const blob = await response.blob();
    return await compressImage(blob);
  } catch {
    return dataUri;
  }
}

function classifyStorageError(error: unknown, operation: string): CloudSyncError {
  const details = error instanceof Error ? error.message : String(error);

  if (/row-level security|permission denied|violates row-level security policy|not allowed/i.test(details)) {
    return new CloudSyncError('permission', `Failed to ${operation}.`, { details });
  }
  if (/bucket|storage/i.test(details)) {
    return new CloudSyncError('validation', `Failed to ${operation}.`, { details });
  }
  if (/network|fetch|timeout|connection|load failed/i.test(details)) {
    return new CloudSyncError('network', `Failed to ${operation}.`, { details });
  }

  return new CloudSyncError('unknown', `Failed to ${operation}.`, { details });
}

function validateSetForCloudSync(set: StudySet): void {
  if (!Array.isArray(set.tags)) {
    throw new CloudSyncError('validation', 'This set has invalid tags data.');
  }
  if (!Array.isArray(set.cards)) {
    throw new CloudSyncError('validation', 'This set has invalid card data.');
  }
  if (set.visibility !== 'private' && set.visibility !== 'public') {
    throw new CloudSyncError('validation', 'This set has an invalid visibility value.');
  }
}

async function prepareSetForCloudSync(set: StudySet): Promise<StudySet> {
  validateSetForCloudSync(set);

  let changed = false;
  const preparedCards = await Promise.all(
    set.cards.map(async (card) => {
      let nextCard = card;
      const imageContext = getCardImageStorageContext(set, card.id);
      const shouldMigrateImages = isLazyImageMigrationEnabled() && imageContext !== null;

      let term = await compressBase64InHtml(card.term);
      if (shouldMigrateImages) {
        try {
          term = await migrateInlineHtmlImagesToStorage(term, imageContext);
        } catch (error) {
          throw classifyStorageError(error, 'move inline card images to cloud storage');
        }
      }
      if (term !== nextCard.term) {
        nextCard = { ...nextCard, term };
      }

      let definition = await compressBase64InHtml(card.definition);
      if (shouldMigrateImages) {
        try {
          definition = await migrateInlineHtmlImagesToStorage(definition, imageContext);
        } catch (error) {
          throw classifyStorageError(error, 'move inline card images to cloud storage');
        }
      }
      if (definition !== nextCard.definition) {
        nextCard = { ...nextCard, definition };
      }

      if (nextCard.imageData && isImageDataUri(nextCard.imageData)) {
        if (shouldMigrateImages) {
          try {
            const imageUrl = await uploadBase64ImageToStorage(nextCard.imageData, imageContext);
            if (imageUrl !== nextCard.imageData) {
              nextCard = { ...nextCard, imageData: imageUrl };
            }
          } catch (error) {
            throw classifyStorageError(error, 'move card attachments to cloud storage');
          }
        } else if (nextCard.imageData.length > MAX_EMBEDDED_MEDIA_CHARS) {
          const compressedImage = await compressImageDataUri(nextCard.imageData);
          if (compressedImage.length < nextCard.imageData.length) {
            nextCard = { ...nextCard, imageData: compressedImage };
          }
        }
      }

      if ((nextCard.imageData?.length ?? 0) > MAX_EMBEDDED_MEDIA_CHARS) {
        throw new CloudSyncError(
          'payload_too_large',
          'This set includes an image attachment that is too large to sync.',
          { details: 'Reduce the image size or remove the attachment and try again.' },
        );
      }

      if ((nextCard.audioData?.length ?? 0) > MAX_EMBEDDED_MEDIA_CHARS) {
        throw new CloudSyncError(
          'payload_too_large',
          'This set includes an audio attachment that is too large to sync.',
          { details: 'Remove the large audio attachment and try again.' },
        );
      }

      if (nextCard !== card) {
        changed = true;
      }

      return nextCard;
    }),
  );

  const preparedSet = changed ? { ...set, cards: preparedCards } : set;
  const payloadBytes = estimateSerializedBytes(setToRow(preparedSet));
  if (payloadBytes > MAX_SHARE_PAYLOAD_BYTES) {
    throw new CloudSyncError(
      'payload_too_large',
      'This set is too large to sync for sharing.',
      {
        details: `Share payload is ${(payloadBytes / (1024 * 1024)).toFixed(1)} MB after compression.`,
      },
    );
  }

  return preparedSet;
}

function classifySupabaseError(error: PostgrestError, operation: string): CloudSyncError {
  const message = [error.message, error.details, error.hint].filter(Boolean).join(' ');

  if (/payload too large|request entity too large|body exceeded|too large/i.test(message)) {
    return new CloudSyncError('payload_too_large', `Failed to ${operation}.`, {
      causeMessage: error.message,
      details: message,
    });
  }
  if (/jwt|session|token|auth/i.test(message)) {
    return new CloudSyncError('auth', `Failed to ${operation}.`, {
      causeMessage: error.message,
      details: message,
    });
  }
  if (/row-level security|permission denied|violates row-level security policy|not allowed/i.test(message)) {
    return new CloudSyncError('permission', `Failed to ${operation}.`, {
      causeMessage: error.message,
      details: message,
    });
  }
  if (/check constraint|violates|invalid input|json|malformed|not-null/i.test(message)) {
    return new CloudSyncError('validation', `Failed to ${operation}.`, {
      causeMessage: error.message,
      details: message,
    });
  }
  if (/network|fetch|timeout|connection|failed to fetch|load failed/i.test(message)) {
    return new CloudSyncError('network', `Failed to ${operation}.`, {
      causeMessage: error.message,
      details: message,
    });
  }

  return new CloudSyncError('unknown', `Failed to ${operation}.`, {
    causeMessage: error.message,
    details: message,
  });
}

export function isLegacyShareConflict(error: unknown): boolean {
  return error instanceof CloudSyncError
    && (error.code === 'permission' || error.code === 'not_synced' || error.code === 'legacy_conflict');
}

export function createLegacyShareConflictError(details?: string): CloudSyncError {
  return new CloudSyncError(
    'legacy_conflict',
    'This set may belong to an older cloud copy from another account.',
    { details },
  );
}

export function getShareLinkErrorMessage(error: unknown): string {
  if (error instanceof CloudSyncError) {
    switch (error.code) {
      case 'payload_too_large':
        return 'This set is too large to share. Compress or remove large images/audio and try again.';
      case 'auth':
        return 'Your session expired. Sign in again, then try sharing this set.';
      case 'permission':
        return 'You do not have permission to share this set.';
      case 'legacy_conflict':
        return 'This set appears to be tied to an older cloud copy. A repaired copy may need to be created before it can be shared.';
      case 'validation':
        return 'This set contains data that could not be synced. Review its media and try again.';
      case 'not_synced':
        return 'Failed to create share link. The set could not be synced to the cloud.';
      case 'network':
        return 'Failed to create share link. Check your connection and try again.';
      default:
        return 'Failed to create share link. Please try again.';
    }
  }

  return 'Failed to create share link. Please try again.';
}

export function getFolderShareLinkErrorMessage(error: unknown): string {
  if (error instanceof CloudSyncError) {
    switch (error.code) {
      case 'payload_too_large':
        return 'A set in this folder is too large to share. Compress or remove large images/audio and try again.';
      case 'auth':
        return 'Your session expired. Sign in again, then try sharing this folder.';
      case 'permission':
        return 'You do not have permission to share this folder.';
      case 'validation':
        return 'Some folder content could not be synced. Review the sets inside and try again.';
      case 'not_synced':
        return 'Failed to create the folder share link because the folder tree did not fully sync to the cloud.';
      case 'network':
        return 'Failed to create the folder share link. Check your connection and try again.';
      default:
        return 'Failed to create the folder share link. Please try again.';
    }
  }

  return 'Failed to create the folder share link. Please try again.';
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

function setContentToRow(set: StudySet): Record<string, unknown> {
  const row = setToRow(set);
  delete row.share_token;
  return row;
}

// ============================================================
// Sync operations
// ============================================================

export async function syncSetToCloud(set: StudySet): Promise<StudySet> {
  if (!isSupabaseConfigured() || !supabase) return set;

  const preparedSet = await prepareSetForCloudSync(set);

  const { error } = await supabase
    .from('study_sets')
    .upsert(setToRow(preparedSet), { onConflict: 'id' });

  if (error) {
    console.error('Failed to sync set:', error.message);
    throw classifySupabaseError(error, 'sync this set to the cloud');
  }

  return preparedSet;
}

// ============================================================
// Pull operations (cloud → local) for cross-device sync
// ============================================================

/** Pull user's sets from Supabase and merge with local sets (LWW by updatedAt).
 *  Returns the merged set list. Caller is responsible for saving to IndexedDB. */
export async function pullSetsFromCloud(
  userId: string,
  localSets: StudySet[],
): Promise<StudySet[]> {
  if (!isSupabaseConfigured() || !supabase) return localSets;

  const { data: cloudRows, error } = await supabase
    .from('study_sets')
    .select('*')
    .eq('user_id', userId);

  if (error || !cloudRows) return localSets;

  // Filter out items pending deletion locally — prevents resurrection
  const pending = getPendingDeletes('set');
  const cloudSets = (cloudRows as DbRow[]).map(rowToSet).filter((s) => !pending.has(s.id));

  // Retry pending deletes that are still in Supabase
  retryPendingDeletes('set', 'study_sets', pending);

  const localMap = new Map(localSets.map((s) => [s.id, s]));

  const merged: StudySet[] = [];
  const toUpload: Record<string, unknown>[] = [];

  // Process all cloud sets
  for (const cloud of cloudSets) {
    const local = localMap.get(cloud.id);
    if (!local) {
      // Cloud-only → pull down
      merged.push(cloud);
    } else if (cloud.updatedAt > local.updatedAt) {
      // Cloud is newer → use cloud (preserve local shareToken if cloud has none)
      merged.push({ ...cloud, shareToken: cloud.shareToken ?? local.shareToken });
    } else {
      // Local is newer or equal → keep local
      merged.push(
        local.userId === cloud.userId
          ? local
          : { ...local, userId: cloud.userId },
      );
      if (local.updatedAt > cloud.updatedAt) {
        toUpload.push(setToRow({ ...local, userId }));
      }
    }
    localMap.delete(cloud.id);
  }

  // Local-only sets (not in cloud) → keep local + push to cloud
  for (const local of localMap.values()) {
    merged.push(local);
    toUpload.push(setToRow({ ...local, userId }));
  }

  // Push local-only and locally-newer sets to cloud (fire-and-forget)
  if (toUpload.length > 0) {
    supabase
      .from('study_sets')
      .upsert(toUpload, { onConflict: 'id' })
      .then(({ error: e }) => { if (e) console.error('Failed to push sets:', e.message); });
  }

  return merged;
}

/** Pull user's folders from Supabase and merge with local folders (LWW). */
export async function pullFoldersFromCloud(
  userId: string,
  localFolders: Folder[],
): Promise<Folder[]> {
  if (!isSupabaseConfigured() || !supabase) return localFolders;

  const { data: cloudRows, error } = await supabase
    .from('folders')
    .select('*')
    .eq('user_id', userId);

  if (error || !cloudRows) return localFolders;

  // Filter out items pending deletion locally — prevents resurrection
  const pending = getPendingDeletes('folder');
  const cloudFolders = (cloudRows as FolderDbRow[]).map(rowToFolder).filter((f) => !pending.has(f.id));

  // Retry pending deletes that are still in Supabase
  retryPendingDeletes('folder', 'folders', pending);

  const localMap = new Map(localFolders.map((f) => [f.id, f]));

  const merged: Folder[] = [];
  const toUpload: Record<string, unknown>[] = [];

  for (const cloud of cloudFolders) {
    const local = localMap.get(cloud.id);
    if (!local) {
      merged.push(cloud);
    } else if (cloud.updatedAt > local.updatedAt) {
      merged.push(cloud);
    } else {
      merged.push(local);
      if (local.updatedAt > cloud.updatedAt) {
        toUpload.push(folderToRow({ ...local, userId }));
      }
    }
    localMap.delete(cloud.id);
  }

  for (const local of localMap.values()) {
    merged.push(local);
    toUpload.push(folderToRow({ ...local, userId }));
  }

  if (toUpload.length > 0) {
    supabase
      .from('folders')
      .upsert(toUpload, { onConflict: 'id' })
      .then(({ error: e }) => { if (e) console.error('Failed to push folders:', e.message); });
  }

  return merged;
}

/** Sync set content to cloud WITHOUT overwriting share_token.
 *  Used for auto-sync when a set in a shared folder is modified. */
export async function syncSetContentToCloud(set: StudySet): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;

  const row = setToRow(set);
  delete row.share_token; // preserve whatever share_token exists in cloud

  const { error } = await supabase
    .from('study_sets')
    .upsert(row, { onConflict: 'id' });

  if (error) {
    console.error('Failed to sync set content:', error.message);
  }
}

export async function deleteSetFromCloud(setId: string): Promise<void> {
  addPendingDelete('set', setId);
  if (!isSupabaseConfigured() || !supabase) return;

  const confirmed = await confirmCloudDelete('study_sets', setId);
  if (confirmed) {
    removePendingDelete('set', setId);
  } else {
    console.error('Failed to confirm set deletion in cloud:', setId);
  }
}

// ============================================================
// Share link operations
// ============================================================

/** Generate a share token for a set after it has been synced to cloud. */
export async function generateShareToken(set: StudySet): Promise<string> {
  if (!isSupabaseConfigured() || !supabase) {
    throw new CloudSyncError('unknown', 'Cloud sharing is not configured.');
  }

  const token = crypto.randomUUID();

  // Use .select() to verify the update actually matched a row
  const { data, error } = await supabase
    .from('study_sets')
    .update({ share_token: token })
    .eq('id', set.id)
    .select('id');

  if (error) {
    console.error('Failed to generate share token:', error.message);
    throw classifySupabaseError(error, 'generate a share link');
  }

  // If no rows were updated, the set doesn't exist in cloud or RLS blocked it
  if (!data || data.length === 0) {
    console.error('Share token update matched 0 rows — set may not be synced to cloud');
    throw new CloudSyncError(
      'not_synced',
      'Share token update matched 0 rows.',
      { details: 'The cloud row was missing or not writable during share token generation.' },
    );
  }

  return token;
}

/** Remove share token (stop sharing) */
export async function removeShareToken(setId: string): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) {
    throw new CloudSyncError('unknown', 'Cloud sharing is not configured.');
  }

  const { error } = await supabase
    .from('study_sets')
    .update({ share_token: null })
    .eq('id', setId);

  if (error) {
    console.error('Failed to remove share token:', error.message);
    throw classifySupabaseError(error, 'remove this share link');
  }
}

// ============================================================
// Shared content cache — avoids re-fetching from Supabase
// within the same browser session, dramatically reducing egress.
// ============================================================

const SHARED_SET_CACHE_PREFIX = 'sf_shared_set_';
const SHARED_FOLDER_CACHE_PREFIX = 'sf_shared_folder_';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCachedData<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const { data, expiry } = JSON.parse(raw) as { data: T; expiry: number };
    if (Date.now() > expiry) {
      sessionStorage.removeItem(key);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function setCachedData<T>(key: string, data: T): void {
  try {
    sessionStorage.setItem(key, JSON.stringify({ data, expiry: Date.now() + CACHE_TTL_MS }));
  } catch {
    // sessionStorage full or unavailable — ignore
  }
}

function clearCachedData(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore unavailable sessionStorage
  }
}

export function clearSharedFolderCache(shareToken: string): void {
  clearCachedData(SHARED_FOLDER_CACHE_PREFIX + shareToken);
}

/** Fetch a shared set by token — works without auth */
export async function fetchSharedSet(shareToken: string): Promise<StudySet | null> {
  if (!isSupabaseConfigured() || !supabase) return null;

  // Check sessionStorage cache first
  const cacheKey = SHARED_SET_CACHE_PREFIX + shareToken;
  const cached = getCachedData<StudySet>(cacheKey);
  if (cached) return cached;

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
    const result = rowToSet(fallbackData as DbRow);
    setCachedData(cacheKey, result);
    return result;
  }

  const result = rowToSet((data as DbRow[])[0]);
  setCachedData(cacheKey, result);
  return result;
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

export async function deleteFolderFromCloud(folderId: string): Promise<void> {
  addPendingDelete('folder', folderId);
  if (!isSupabaseConfigured() || !supabase) return;

  const confirmed = await confirmCloudDelete('folders', folderId);
  if (confirmed) {
    removePendingDelete('folder', folderId);
  } else {
    console.error('Failed to confirm folder deletion in cloud:', folderId);
  }
}

/** Sync a folder, all its descendants, and all sets in the tree to cloud */
export async function syncFolderTreeToCloud(
  folderId: string,
  allFolders: Folder[],
  allSets: StudySet[],
): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;

  const folderMap = new Map(allFolders.map((folder) => [folder.id, folder]));

  // Include ancestors first so nested shared folders can be upserted
  // without violating the parent_folder_id foreign key.
  const ancestorIds: string[] = [];
  let ancestorCursor = folderMap.get(folderId)?.parentFolderId;
  while (ancestorCursor) {
    const ancestor = folderMap.get(ancestorCursor);
    if (!ancestor) break;
    ancestorIds.unshift(ancestor.id);
    ancestorCursor = ancestor.parentFolderId;
  }

  // BFS to collect the folder + all descendants
  const folderIds = new Set<string>();
  for (const ancestorId of ancestorIds) {
    folderIds.add(ancestorId);
  }
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
  const folderRows = [
    ...ancestorIds.map((id) => folderMap.get(id)).filter((folder): folder is Folder => Boolean(folder)),
    ...allFolders.filter((f) => folderIds.has(f.id) && !ancestorIds.includes(f.id)),
  ].map(folderToRow);
  if (folderRows.length > 0) {
    const { error } = await supabase
      .from('folders')
      .upsert(folderRows, { onConflict: 'id' });
    if (error) {
      console.error('Failed to sync folder tree:', error.message);
      throw classifySupabaseError(error, 'sync this folder tree to the cloud');
    }
  }

  // Upsert all sets in those folders
  const preparedSets = await Promise.all(
    allSets
      .filter((s) => s.folderId && folderIds.has(s.folderId))
      .map((set) => prepareSetForCloudSync(set)),
  );
  const setRows = preparedSets.map(setContentToRow);
  if (setRows.length > 0) {
    const { error } = await supabase
      .from('study_sets')
      .upsert(setRows, { onConflict: 'id' });
    if (error) {
      console.error('Failed to sync folder sets:', error.message);
      throw classifySupabaseError(error, 'sync this folder tree to the cloud');
    }
  }
}

// ============================================================
// Folder share link operations
// ============================================================

/** Generate a share token for a folder and persist to cloud */
export async function generateFolderShareToken(folder: Folder): Promise<string> {
  if (!isSupabaseConfigured() || !supabase) {
    throw new CloudSyncError('unknown', 'Cloud sharing is not configured.');
  }

  const token = crypto.randomUUID();

  const { data, error } = await supabase
    .from('folders')
    .update({ share_token: token })
    .eq('id', folder.id)
    .select('id');

  if (error) {
    console.error('Failed to generate folder share token:', error.message);
    throw classifySupabaseError(error, 'generate a folder share link');
  }

  if (!data || data.length === 0) {
    console.error('Folder share token update matched 0 rows — folder tree may not be synced');
    throw new CloudSyncError(
      'not_synced',
      'Folder share token update matched 0 rows.',
      { details: 'The cloud folder row was missing or not writable during share token generation.' },
    );
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
  options?: { bypassCache?: boolean },
): Promise<{ folder: Folder; subfolders: Folder[]; sets: StudySet[] } | null> {
  if (!isSupabaseConfigured() || !supabase) return null;

  const cacheKey = SHARED_FOLDER_CACHE_PREFIX + shareToken;
  if (options?.bypassCache) {
    clearCachedData(cacheKey);
  } else {
    const cached = getCachedData<{ folder: Folder; subfolders: Folder[]; sets: StudySet[] }>(cacheKey);
    if (cached) return cached;
  }

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

    // Fetch subfolders by walking parent_folder_id from the shared root
    // Uses BFS with sequential queries since RLS only allows reading
    // folders within the shared tree (via shared_folder_children_select policy)
    const folderIds = new Set<string>([folder.id]);
    const subfolders: Folder[] = [];
    let parentIds = [folder.id];

    while (parentIds.length > 0) {
      const { data: childData } = await supabase
        .from('folders')
        .select('*')
        .in('parent_folder_id', parentIds);
      const children = ((childData ?? []) as FolderDbRow[]).map(rowToFolder);
      if (children.length === 0) break;
      parentIds = [];
      for (const child of children) {
        if (!folderIds.has(child.id)) {
          folderIds.add(child.id);
          subfolders.push(child);
          parentIds.push(child.id);
        }
      }
    }

    // Fetch all sets belonging to any folder in the tree
    const { data: setData } = await supabase
      .from('study_sets')
      .select('*')
      .in('folder_id', Array.from(folderIds));

    const fallbackResult = {
      folder,
      subfolders,
      sets: ((setData ?? []) as DbRow[]).map(rowToSet),
    };
    setCachedData(cacheKey, fallbackResult);
    return fallbackResult;
  }

  const allFolders = (foldersRes.data as FolderDbRow[]).map(rowToFolder);
  const rootFolder = allFolders.find((f) => f.shareToken === shareToken) ?? allFolders[0];
  const subfolders = allFolders.filter((f) => f.id !== rootFolder.id);

  // If the sets RPC failed, fetch sets via direct query as fallback
  let sets: StudySet[];
  if (setsRes.error || !setsRes.data) {
    const folderIds = allFolders.map((f) => f.id);
    const { data: setData } = await supabase
      .from('study_sets')
      .select('*')
      .in('folder_id', folderIds);
    sets = ((setData ?? []) as DbRow[]).map(rowToSet);
  } else {
    sets = (setsRes.data as DbRow[]).map(rowToSet);
  }

  const result = { folder: rootFolder, subfolders, sets };
  setCachedData(cacheKey, result);
  return result;
}

// ============================================================
// One-time migration: compress oversized inline images
// ============================================================

const MIGRATE_KEY = 'studyflow_images_migrated';
const IMG_SIZE_THRESHOLD = 500 * 1024 * 1.37; // ~500 KB in base64 chars

function hasOversizedImages(html: string): boolean {
  const regex = /data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    if (match[0].length > IMG_SIZE_THRESHOLD) return true;
  }
  return false;
}

/** One-time migration: find all sets with oversized base64 images, compress them,
 *  and save back to IndexedDB + cloud. Runs only once (localStorage flag). */
export async function migrateOversizedImages(): Promise<void> {
  if (localStorage.getItem(MIGRATE_KEY)) return;

  try {
    const { getAllSets, saveSet } = await import('@/db');

    const allSets = await getAllSets();
    let migrated = 0;

    for (const set of allSets) {
      let changed = false;
      const cards = [...set.cards];

      for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        const termNeedsCompress = hasOversizedImages(card.term);
        const defNeedsCompress = hasOversizedImages(card.definition);

        if (termNeedsCompress || defNeedsCompress) {
          cards[i] = {
            ...card,
            term: termNeedsCompress ? await compressBase64InHtml(card.term) : card.term,
            definition: defNeedsCompress ? await compressBase64InHtml(card.definition) : card.definition,
          };
          changed = true;
        }
      }

      if (changed) {
        const updated = { ...set, cards };
        await saveSet(updated);
        migrated++;

        // Sync to cloud if user is authenticated
        if (isSupabaseConfigured()) {
          try {
            const { useAuthStore } = await import('@/stores/useAuthStore');
            const user = useAuthStore.getState().user;
            if (user) {
              await syncSetContentToCloud({ ...updated, userId: user.id });
            }
          } catch { /* cloud sync is best-effort */ }
        }
      }
    }

    if (migrated > 0) {
      console.log(`Image migration: compressed images in ${migrated} set(s)`);
    }
  } catch (err) {
    console.error('Image migration failed:', err);
  }

  localStorage.setItem(MIGRATE_KEY, '1');
}
