function getRuntimeFlag(name: string): string | undefined {
  if (typeof window !== 'undefined') {
    const value = (window as unknown as Record<string, unknown>)[name];
    if (typeof value === 'string') return value;
    if (typeof value === 'boolean') return value ? 'true' : 'false';
  }

  try {
    const env = import.meta.env;
    const value = env?.[name];
    return typeof value === 'string' ? value : undefined;
  } catch {
    return undefined;
  }
}

function parseFlag(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null) return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

export function isStorageImageUploadsEnabled(): boolean {
  return parseFlag(getRuntimeFlag('VITE_STORAGE_IMAGE_UPLOADS_ENABLED'), true);
}

export function isLazyImageMigrationEnabled(): boolean {
  return parseFlag(getRuntimeFlag('VITE_LAZY_IMAGE_MIGRATION_ENABLED'), true);
}
