import { createClient } from "@supabase/supabase-js";

const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
const rawSupabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ||
  "";

function isValidSupabaseProjectUrl(value: string) {
  try {
    const url = new URL(value);
    const isLocalSupabase = ["localhost", "127.0.0.1"].includes(url.hostname);
    const isHostedSupabase = url.protocol === "https:" && url.hostname.endsWith(".supabase.co");
    return isHostedSupabase || (isLocalSupabase && url.protocol === "http:");
  } catch {
    return false;
  }
}

function getSupabaseConfigError(url: string, publishableKey: string) {
  if (!url && !publishableKey) return "";
  if (!url) return "VITE_SUPABASE_URL is missing.";
  if (!publishableKey) return "VITE_SUPABASE_PUBLISHABLE_KEY is missing.";
  if (!isValidSupabaseProjectUrl(url)) {
    return "VITE_SUPABASE_URL must look like https://YOUR-PROJECT-REF.supabase.co.";
  }
  return "";
}

let detectedSupabaseConfigError = getSupabaseConfigError(
  rawSupabaseUrl,
  rawSupabasePublishableKey,
);

function createSupabaseClient() {
  if (detectedSupabaseConfigError || !rawSupabaseUrl || !rawSupabasePublishableKey) return null;

  try {
    return createClient(rawSupabaseUrl, rawSupabasePublishableKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    });
  } catch {
    detectedSupabaseConfigError =
      "Supabase could not start. Re-check VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.";
    return null;
  }
}

export const supabase = createSupabaseClient();
export const supabaseConfigError = detectedSupabaseConfigError;
export const isSupabaseConfigured = Boolean(supabase && !supabaseConfigError);
