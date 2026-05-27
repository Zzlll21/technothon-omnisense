import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY
) as string | undefined;

export const supabaseConfigError = getSupabaseConfigError();

export const supabase = supabaseConfigError
  ? null
  : createClient(supabaseUrl as string, supabaseKey as string);

function getSupabaseConfigError() {
  if (!supabaseUrl) {
    return "Missing VITE_SUPABASE_URL. Create apps/dashboard/.env and restart the dashboard dev server.";
  }

  if (!supabaseKey) {
    return "Missing VITE_SUPABASE_ANON_KEY or VITE_SUPABASE_PUBLISHABLE_KEY. Create apps/dashboard/.env and restart the dashboard dev server.";
  }

  return null;
}
