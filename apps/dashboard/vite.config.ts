import { defineConfig, loadEnv } from "vite";
import { prepareLanding, landingRoutes } from "./scripts/landing-assets.mjs";
import { resolvePublicConfig } from "./src/lib/publicConfig";
import { loadHybridTarget, verifyMigrationFiles } from "../../services/sdp-generator/hybrid-target.mjs";

// Keep the approved landing source separate; Vite includes its generated public assets in dev and builds.
prepareLanding();

export default defineConfig(async ({ mode }) => {
  // Private previews never inherit a synthetic checkout's dotenv configuration.
  const privateMode=process.env.VITE_HYBRID_PRIVATE==='true';
  const env = privateMode ? {VITE_HYBRID_PRIVATE:'true',VITE_SUPABASE_URL:process.env.VITE_SUPABASE_URL,VITE_SUPABASE_PUBLISHABLE_KEY:process.env.VITE_SUPABASE_PUBLISHABLE_KEY} : loadEnv(mode, process.cwd(), "VITE_");
  if(!privateMode && env.VITE_HYBRID_PRIVATE==='true')throw new Error('Private preview requires explicit process opt-in');
  let target;
  if (env.VITE_HYBRID_PRIVATE === 'true') {
    target = await loadHybridTarget(process.env.HYBRID_MANIFEST_PATH);
    await verifyMigrationFiles(target);
  }
  return {
  plugins: [landingRoutes()],
  // Opt out of automatic VITE_ exposure, including accidentally misplaced secrets.
  envPrefix: [],
  define: { __SDP_PUBLIC_CONFIG__: JSON.stringify(resolvePublicConfig(env, target)) }
}; });
