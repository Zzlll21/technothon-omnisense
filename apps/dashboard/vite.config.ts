import { defineConfig, loadEnv } from "vite";
import { resolvePublicConfig } from "./src/lib/publicConfig";

export default defineConfig(({ mode }) => ({
  // Opt out of automatic VITE_ exposure, including accidentally misplaced secrets.
  envPrefix: [],
  define: { __SDP_PUBLIC_CONFIG__: JSON.stringify(resolvePublicConfig(loadEnv(mode, process.cwd(), "VITE_"))) }
}));
