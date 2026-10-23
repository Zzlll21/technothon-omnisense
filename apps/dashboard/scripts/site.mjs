// One local server for the approved landing page and the stored-data Spatial Workspace.
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createServer, build, preview } from "vite";

const app = fileURLToPath(new URL("../", import.meta.url));
let configuration = resolve(app, ".env");
if (!existsSync(configuration)) {
  // An isolated Git worktree reuses the existing checkout's ignored configuration in memory.
  // Never create, copy, print or modify an environment file.
  try {
    const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: app, encoding: "utf8" }).trim();
    configuration = resolve(dirname(common), "apps/dashboard/.env");
  } catch { /* The existing visible setup state handles unconfigured standalone copies. */ }
}
if (process.env.VITE_HYBRID_PRIVATE !== 'true' && existsSync(configuration)) process.loadEnvFile(configuration);
process.chdir(app);
const command = process.argv[2] ?? "dev";
const portIndex = process.argv.indexOf("--port");
const port = portIndex < 0 ? 8130 : Number(process.argv[portIndex + 1]);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Choose a valid local port.");
if (command === "build") {
  await build({ root: app });
  console.log("Built landing page and Spatial Workspace in apps/dashboard/dist.");
} else if (command === "dev" || command === "preview") {
  const options = { host: "127.0.0.1", port, strictPort: true };
  const server = command === "preview" ? await preview({ root: app, preview: options }) : await createServer({ root: app, server: options });
  if (command === "dev") await server.listen();
  console.log(`OmniSense: http://127.0.0.1:${port}/\nWorkspace: http://127.0.0.1:${port}/workspace\nPress Ctrl+C to stop. No generator is started.`);
} else throw new Error("Use dev, build or preview.");
