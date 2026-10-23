# Hybrid frontend on Vercel

The existing site is https://omnisense-hybrid-spatial.vercel.app. This document
describes the already implemented static packaging workflow; it does not deploy,
change hosted Auth settings, link Git or modify the current deployment.

| Setting | Value |
| --- | --- |
| Application directory | `apps/dashboard` (within the repository; build needs root contracts and landing sources) |
| Build | `npm run build:hybrid` from that directory |
| Static output | `apps/dashboard/dist` |
| Packaging | `npm run package:hybrid -- ABSOLUTE_FRESH_STAGE` |
| Production origin | `https://omnisense-hybrid-spatial.vercel.app` |

The browser uses only `VITE_HYBRID_PRIVATE`, `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY`. The build also needs local `HYBRID_MANIFEST_PATH`
and `HYBRID_SITE_ORIGIN`. Vite disables automatic environment exposure and emits
only the validated public projection: target URL, publishable key, exact origin
and expected run. No backend key, manifest bytes or approval registry is emitted.

The registered target is verified against migrations 001–003 before building.
Use the public setup templates in [safe runtime setup](../PUBLIC-RUNTIME.md).
Do not upload private build configuration to Vercel or put it in GitHub.

## Local build and audit

From `apps/dashboard`, with approved private local configuration already present:

```powershell
$env:HYBRID_SITE_ORIGIN = 'https://omnisense-hybrid-spatial.vercel.app'
npm.cmd run build:hybrid
npm.cmd run package:hybrid -- 'C:/private/omnisense/FRESH_UNIQUE_STAGE'
Remove-Item Env:HYBRID_SITE_ORIGIN
```

Packaging refuses an existing output directory, unexpected assets, private keys,
known runtime credential values, missing landing assets or mismatched target/origin.
It creates `.vercel/output/config.json`, static assets and a hash inventory outside
the source checkout. It performs no login, upload or deployment. Never reuse or
overwrite an older staging package. Project linking is a separate operator action
inside a fresh stage; `.vercel/project.json` and any CLI `.env.local` stay private.

The generated routes serve `/` and `/workspace` through the SPA, preserve existing
query deep links, serve the landing/assets directly, and return 404 for missing
asset/private paths. Root landing is public; workspace routes enforce the existing
authentication gate. Supabase RLS remains the data-access boundary, including
Reader A exact-run access and Reader B denial. Sessions remain memory-only.

Any deployment requires separate approval and an audited stage linked to the
existing Vercel project. Do not connect GitHub automatic deployments at this stage.
The Writer stays on its separate operator host; Vercel runs no MQTT or Writer code.
