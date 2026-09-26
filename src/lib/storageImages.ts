import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { compressImage } from '@/lib/utils';

export const CARD_IMAGE_BUCKET = 'card-images';

const INLINE_IMAGE_REGEX = /data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g;

export interface CardImageStorageContext {
  userId: string;
  setId: string;
  cardId: string;
}

function fileExtensionFromMimeType(mimeType: string): string {
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('gif')) return 'gif';
  return 'jpg';
}

async function dataUriToBlob(dataUri: string): Promise<Blob> {
  const response = await fetch(dataUri);
  return response.blob();
}

function buildCardImagePath(
  context: CardImageStorageContext,
  extension = 'jpg',
  contentHash?: string,
): string {
  return [
    context.userId,
    context.setId,
    context.cardId,
    // Content-addressed when the source hash is known, so a retried or
    // repeated sync of the same image targets the same object.
    `${contentHash ?? `${Date.now()}-${crypto.randomUUID()}`}.${extension}`,
  ].join('/');
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Inline images already uploaded this session, keyed by user + source hash.
 *  A background sync that lands while the user keeps editing can't persist
 *  the Storage URL back into the working copy, so the next autosave still
 *  carries the same base64 — without this memo it was re-uploaded (as a new
 *  object) on every save. In-flight uploads are shared too. */
const uploadedInlineImages = new Map<string, Promise<string>>();

function requireStorage(): SupabaseClient {
  if (!isSupabaseConfigured() || !supabase) {
    throw new Error('Supabase Storage is not configured.');
  }
  return supabase;
}

// Formats whose visual data is destroyed by re-encoding to opaque JPEG:
// PNG (alpha channel), GIF/WEBP (animation + alpha). These are uploaded
// as-is so transparency and animation survive.
const FORMAT_PRESERVING_MIME = /image\/(png|gif|webp)/i;

export function hasInlineBase64Images(html: string): boolean {
  return /data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/.test(html);
}

export async function uploadCardImage(
  file: File | Blob,
  context: CardImageStorageContext,
  contentHash?: string,
): Promise<string> {
  const client = requireStorage();

  const sourceType = file.type || 'image/jpeg';

  // Preserve PNG transparency / GIF (and animated WEBP) rather than flatten
  // them onto an opaque white JPEG. compressImage() always re-encodes to
  // JPEG, so we only route lossy-safe formats through it.
  let blob: Blob;
  let contentType: string;
  if (FORMAT_PRESERVING_MIME.test(sourceType)) {
    blob = file;
    contentType = sourceType;
  } else {
    const compressedDataUri = await compressImage(file);
    blob = await dataUriToBlob(compressedDataUri);
    contentType = blob.type || 'image/jpeg';
  }

  const extension = fileExtensionFromMimeType(contentType);
  const path = buildCardImagePath(context, extension, contentHash);

  const { error } = await client.storage
    .from(CARD_IMAGE_BUCKET)
    .upload(path, blob, {
      cacheControl: '3600',
      upsert: false,
      contentType,
    });

  // A content-addressed object that already exists holds this same image
  // (e.g. uploaded by an earlier session or a push whose upsert then failed).
  const alreadyStored = Boolean(contentHash) && /already exists|duplicate/i.test(error?.message ?? '');
  if (error && !alreadyStored) {
    throw new Error(`Failed to upload card image: ${error.message}`);
  }

  const { data } = client.storage
    .from(CARD_IMAGE_BUCKET)
    .getPublicUrl(path);

  return data.publicUrl;
}

export async function uploadBase64ImageToStorage(
  dataUri: string,
  context: CardImageStorageContext,
): Promise<string> {
  const hash = await sha256Hex(dataUri);
  const key = `${context.userId}:${hash}`;
  const existing = uploadedInlineImages.get(key);
  if (existing) return existing;

  const upload = dataUriToBlob(dataUri).then((blob) => uploadCardImage(blob, context, hash));
  uploadedInlineImages.set(key, upload);
  // Failed uploads must be retryable, so never memoize a rejection.
  upload.catch(() => uploadedInlineImages.delete(key));
  return upload;
}

export async function migrateInlineHtmlImagesToStorage(
  html: string,
  context: CardImageStorageContext,
): Promise<string> {
  const matches = [...new Set(html.match(INLINE_IMAGE_REGEX) ?? [])];
  if (matches.length === 0) return html;

  const replacements = await Promise.all(
    matches.map(async (dataUri) => ({
      from: dataUri,
      to: await uploadBase64ImageToStorage(dataUri, context),
    })),
  );

  let result = html;
  for (const replacement of replacements) {
    result = result.split(replacement.from).join(replacement.to);
  }
  return result;
}
