# OmniSense main website entry

The user approved making the Spatial Workspace the primary website after Phase 4 (`996285c`). This change connects the existing approved landing presentation to the integrated workspace and removes legacy dashboard links. No additional visual redesign or data/business-logic migration is included.

## Start locally

In PowerShell:

```powershell
Set-Location "C:\Users\zheng\.codex\visualizations\2026\10\21\01a15eba-1f31-7181-8a51-48088d87b563\omnisense-spatial-integration\apps\dashboard"
npm.cmd run dev:site
```

- Main entry: http://127.0.0.1:8130/ (opens `/landing/`).
- Workspace: http://127.0.0.1:8130/workspace.
- Zone / Usage / Records: `/workspace?view=room`, `?view=history`, `?view=records`.
- Existing spatial query bookmarks remain supported.
- Keep the terminal open; Ctrl+C stops it. For another port: `npm.cmd run dev:site -- --port 8132`.

One local server serves both the approved animated landing page and the stored-data workspace. No Python server or second generator is required. The launcher reads the existing ignored local `.env` in memory, or the primary checkout's existing app configuration when running in its isolated Git worktree. It never creates, copies, prints or modifies that file.

For a production build and local preview (stop dev first):

```powershell
npm.cmd run build:site
npm.cmd run preview:site
```

The output is `apps/dashboard/dist`. This is local activation, not public deployment. Public hosting must serve the build, support the `/workspace` SPA fallback to `/index.html`, and serve the `/landing/` directory index. No push or merge was performed and the stable checkout is unchanged.

## Implementation

- `src/App.tsx`: new visitors enter the landing page; the Spatial Workspace is now the React app. The legacy Dashboard is no longer imported by the entry point. Its source remains available as reference.
- `src/pages/SpatialDashboard.tsx`: remove Current dashboard navigation and obsolete URL/prop construction.
- `src/components/spatial/ZoneWorkspace.tsx`: remove the secondary legacy history/records/CSV link; integrated navigation already provides these functions.
- `scripts/landing-assets.mjs`: package an explicit six-file presentation allowlist from approved design sources into ignored `public/landing`, updating scene links and all five workspace calls to action. No operational fixtures are imported. Development/preview directory-index middleware keeps `/landing/` from becoming a React fallback.
- `scripts/site.mjs`: start dev, build or preview with existing configuration and strict local port handling. No writer, database mutation, schema change or credential generation.
- `vite.config.ts`, `package.json`, `.gitignore`, app `README.md`: connect packaging, reusable commands and documentation.
- `test/site-entry.test.mjs`: presentation assets and workspace links, plus directory/query behavior in dev and preview.

## Validation

TypeScript and `npm run build:site` pass. All **121** regression tests pass (119 existing + two site-entry tests). Existing Three.js chunk-size advisory remains unchanged.

Started the exact `npm run dev:site` command on 8130. Browser verified `/` → approved landing → Open workspace → real ACTIVE snapshot / floor → zone, with no Current dashboard links. The existing read configuration loaded correctly (Feed current, representative stored readings).

Started `npm run preview:site -- --port 8132` against the production build. Browser verified root landing, its direct Operating Records CTA, 25 stored rows / 5,796 matching records, feed current, and direct URL reload. No legacy UI substitution. Temporary production preview stopped after validation; normal dev site remains on 8130.

Reviewed screenshots of the approved landing and fully loaded zone workspace under `main-site-evidence`. No console errors, failed images or horizontal overflow. The original landing's muted preview labels still trigger the screenshot helper's contrast heuristic; this routing change preserves its approved styling and animation. The workspace screenshot has no automated issues.

Stable checkout branch, HEAD, status, index and all 64 recorded file hashes verified against the original private manifest. No `.env`, Supabase adapters, correlations, calculations, CSV exporter, generator, schema, RLS or backend changes.
