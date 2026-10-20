import { createClient } from "@supabase/supabase-js";

const configuration = __SDP_PUBLIC_CONFIG__;
export const supabaseConfigError = configuration.error;
export const supabase = configuration.error ? null : createClient(configuration.url, configuration.key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});
