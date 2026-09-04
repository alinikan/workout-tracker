import { createClient } from "@supabase/supabase-js";
import { fetchWithTimeout } from "./fetchWithTimeout";

/**
 * Supabase browser client setup.
 *
 * This file is deliberately tiny and defensive:
 * - It reads only publishable browser-safe variables from Vite's import.meta.env.
 * - It validates the URL before creating the client so a bad Vercel env var shows a clear message.
 * - It exports null-friendly state so the app can still run as a local-only tracker.
 *
 * Never place a service-role key here. Anything prefixed with VITE_ is bundled into browser code.
 */

// Trim whitespace because copied environment variables often include accidental leading/trailing
// spaces, especially when pasted from dashboards.
const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
const rawSupabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ||
  "";

// Local Supabase projects use http://localhost, while hosted Supabase projects use
// https://...supabase.co. Rejecting other shapes catches common setup mistakes early.
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

// Returning a string instead of throwing lets the UI show a friendly setup message while still
// allowing local-only workout and diet tracking.
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
      global: { fetch: fetchWithTimeout },
      auth: {
        // These options keep email/password sessions alive inside normal browsers and iPhone Home
        // Screen PWAs, which may have separate storage from Safari.
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

// The app imports all three exports so UI copy can distinguish "not configured" from "configured
// but signed out" and from "configured incorrectly".
export const supabase = createSupabaseClient();
export const supabaseConfigError = detectedSupabaseConfigError;
export const isSupabaseConfigured = Boolean(supabase && !supabaseConfigError);
