import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function getEnvVar(name: string): string | undefined {
  // Check window globals first (for runtime injection), then Vite env
  if (typeof window !== 'undefined') {
    const windowValue = (window as unknown as Record<string, unknown>)[name];
    if (typeof windowValue === 'string' && windowValue) return windowValue;
  }

  try {
    const env = import.meta.env;
    return env?.[name] as string | undefined;
  } catch {
    return undefined;
  }
}

const supabaseUrl = getEnvVar('VITE_SUPABASE_URL');
const supabaseAnonKey = getEnvVar('VITE_SUPABASE_ANON_KEY');

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;
