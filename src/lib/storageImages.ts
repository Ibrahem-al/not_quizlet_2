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
): string {
  return [
    context.userId,
    context.setId,
    context.cardId,
    `${Date.now()}-${crypto.randomUUID()}.${extension}`,
  ].join('/');
}

function requireStorage(): void {
  if (!isSupabaseConfigured() || !supabase) {
    throw new Error('Supabase Storage is not configured.');
  }
}

export function hasInlineBase64Images(html: string): boolean {
  return /data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/.test(html);
}

export async function uploadCardImage(
  file: File | Blob,
  context: CardImageStorageContext,
): Promise<string> {
  requireStorage();

  const compressedDataUri = await compressImage(file);
  const blob = await dataUriToBlob(compressedDataUri);
  const extension = fileExtensionFromMimeType(blob.type || 'image/jpeg');
  const path = buildCardImagePath(context, extension);

  const { error } = await supabase.storage
    .from(CARD_IMAGE_BUCKET)
    .upload(path, blob, {
      cacheControl: '3600',
      upsert: false,
      contentType: blob.type || 'image/jpeg',
    });

  if (error) {
    throw new Error(`Failed to upload card image: ${error.message}`);
  }

  const { data } = supabase.storage
    .from(CARD_IMAGE_BUCKET)
    .getPublicUrl(path);

  return data.publicUrl;
}

export async function uploadBase64ImageToStorage(
  dataUri: string,
  context: CardImageStorageContext,
): Promise<string> {
  const blob = await dataUriToBlob(dataUri);
  return uploadCardImage(blob, context);
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
