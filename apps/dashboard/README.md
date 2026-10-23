# OmniSense Dashboard

Use **Node.js 24**. See the [repository README](../../README.md) for installation and current scope.

The current product is the public landing page and authenticated Hybrid Spatial
Workspace. Start with the repository [README](../../README.md) and
[safe runtime setup](../../docs/PUBLIC-RUNTIME.md).

- `npm run dev`: local read-only/synthetic configuration via `.env`.
- `npm run dev:hybrid`: explicit private configuration via `.env.hybrid.local`;
  loopback port 5178 and the approved manifest origin must agree.
- `npm run build`: TypeScript and normal static Vite build.
- `npm run build:hybrid`: private static build; locally approved config required.
- `npm run package:hybrid -- ABSOLUTE_FRESH_STAGE`: audit and package an existing
  private build; requires `HYBRID_SITE_ORIGIN` and never deploys.

`/` is public; `/workspace` and `?experience=spatial` are protected in private
Hybrid mode. Sessions exist only in memory; browser reload needs sign-in.
Workspace navigation within an active session does not request credentials twice.
The browser uses only a publishable key and user authentication. RLS controls
exact-run access; Reader B stays denied without an explicit owner grant.

The `dev:site`/`build:site` helpers retain legacy synthetic worktree environment
fallback behavior. Use `dev:hybrid`/`build:hybrid` for private operation.
Never place MQTT or backend keys in any frontend environment or Vite define.

The stable release includes temperature, humidity and occupancy histories, four
cooling modes, elapsed-time analytics, contextual records and safe CSV export.
PMV implementation/migration 004 is not included. Geometry and surrounding rooms
are illustrative; cooling reports are simulated, not equipment feedback.
