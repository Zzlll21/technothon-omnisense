import { defineConfig, loadEnv } from "vite";
import { prepareLanding, landingRoutes } from "./scripts/landing-assets.mjs";
import { resolvePublicConfig } from "./src/lib/publicConfig";

// Keep the approved landing source separate; Vite includes its generated public assets in dev and builds.
prepareLanding();

export default defineConfig(({ mode }) => ({
  plugins: [landingRoutes()],
  // Opt out of automatic VITE_ exposure, including accidentally misplaced secrets.
  envPrefix: [],
  define: { __SDP_PUBLIC_CONFIG__: JSON.stringify(resolvePublicConfig(loadEnv(mode, process.cwd(), "VITE_"))) }
}));
