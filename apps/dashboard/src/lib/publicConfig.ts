export interface PublicConfig { url: string; key: string; error: string | null }

// Validate in Vite before any configuration is serialized into browser code.
export function resolvePublicConfig(env: Record<string, string | undefined>): PublicConfig {
  const empty = (error: string): PublicConfig => ({ url: "", key: "", error });
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return empty("Add the SDP project URL and publishable key to apps/dashboard/.env, then restart the dev server.");
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return empty("A frontend publishable key is required. Backend and legacy keys are not accepted. Update apps/dashboard/.env and restart.");
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !/^[a-z0-9]{20}\.supabase\.co$/.test(parsed.hostname) || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") throw new Error();
    return { url: parsed.origin, key, error: null };
  } catch { return empty("Use the dedicated SDP project URL https://PROJECT_REF.supabase.co, then restart the dev server."); }
}
