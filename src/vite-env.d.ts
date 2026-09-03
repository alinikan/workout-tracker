/// <reference types="vite/client" />

// Vite injects environment variables through import.meta.env. This file teaches TypeScript the
// exact variables this project expects so typos are caught while editing.
interface ImportMetaEnv {
  // Browser-safe Supabase project URL, for example https://abc123.supabase.co.
  readonly VITE_SUPABASE_URL?: string;

  // Supabase publishable key. This is safe in browser code only when Row Level Security is enabled.
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;

  // Backwards-compatible alias for older Supabase dashboards/docs that called this the anon key.
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

// Extending ImportMeta lets TypeScript understand import.meta.env throughout the React app.
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
