/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface Window {
  __VITE_SUPABASE_URL__?: string;
  __VITE_SUPABASE_ANON_KEY__?: string;
}
