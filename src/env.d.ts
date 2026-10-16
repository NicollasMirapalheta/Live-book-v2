/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL (Fase 7); without it the app keeps the books only in this browser */
  readonly VITE_SUPABASE_URL?: string
  /** Supabase "anon" (public) key — public by design, the RLS policies protect the data */
  readonly VITE_SUPABASE_ANON_KEY?: string
}
