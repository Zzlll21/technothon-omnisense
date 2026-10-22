export interface PublicConfig { url: string; key: string; error: string | null; privateHybrid?: boolean; expectedRunId?: string; previewOrigin?: string }

// Validate in Vite before any configuration is serialized into browser code.
export function resolvePublicConfig(env: Record<string, string | undefined>, target?: {url:string;run_id:string;preview_origin:string}): PublicConfig {
  const empty = (error: string): PublicConfig => ({ url: "", key: "", error, ...(env.VITE_HYBRID_PRIVATE==='true'?{privateHybrid:true}:{}) });
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return empty(env.VITE_HYBRID_PRIVATE==='true' ? 'Supply the approved private preview URL and publishable key through its process configuration.' : "Add the SDP project URL and publishable key to apps/dashboard/.env, then restart the dev server.");
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return empty("A frontend publishable key is required. Backend and legacy keys are not accepted. Update apps/dashboard/.env and restart.");
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !/^[a-z0-9]{20}\.supabase\.co$/.test(parsed.hostname) || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") throw new Error();
    if (env.VITE_HYBRID_PRIVATE === 'true') {
      if (!target || parsed.origin !== target.url) return { ...empty('An independently approved hybrid target is required.'), privateHybrid: true };
      return { url: parsed.origin, key, error: null, privateHybrid: true, expectedRunId: target.run_id, previewOrigin: target.preview_origin };
    }
    return { url: parsed.origin, key, error: null };
  } catch { return empty("Use the dedicated SDP project URL https://PROJECT_REF.supabase.co, then restart the dev server."); }
}
