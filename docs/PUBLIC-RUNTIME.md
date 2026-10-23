# Safe runtime setup

Use **Node.js 24**. See the [repository README](../README.md) for installation and current scope.

These instructions describe existing functionality. They do not authorize cloud
changes. A fresh clone can run all offline checks without a real manifest or keys.

## Private target provisioning

The database owner supplies an independently reviewed original manifest and its
SHA-256. Verify the exact bytes before use. Keep it outside Git, and verify the
three migration hashes with the existing loader. Do not alter migrations 001–003
or deploy the unfinished migration 004. For an already provisioned project, do not
repeat SQL setup.

The manifest pins an isolated target, protected references, run UUID/live anchor,
both node identities, representative node, exact local origin and
`full_zone_coverage=false`. Keep an existing ACTIVE run and its definition intact.

Privately populate only the existing registry format in
`services/sdp-generator/deployment/approved-hybrid-targets.json`:

```json
{
  "schema_version": "omnisense.hybrid-approvals.v1",
  "approved": [{
    "project_ref": "<APPROVED_TEST_REFERENCE>",
    "protected_project_ref": "<PROTECTED_REFERENCE>",
    "manifest_sha256": "<INDEPENDENTLY_VERIFIED_SHA256>"
  }]
}
```

This local file is already tracked: never stage its populated contents. The public
commit must retain `"approved": []`. The example manifest is a schema illustration,
not an approved runnable target. No configuration bypass or self-approval is offered.

## Dashboard

Only when destination files do not exist:

```powershell
if (Test-Path apps/dashboard/.env.hybrid.local) { throw 'Private file already exists.' }
Copy-Item apps/dashboard/.env.hybrid.example apps/dashboard/.env.hybrid.local
```

Privately set `VITE_HYBRID_PRIVATE=true`, the approved `VITE_SUPABASE_URL`,
`VITE_SUPABASE_PUBLISHABLE_KEY`, and absolute `HYBRID_MANIFEST_PATH`.
The publishable key is a browser-facing identifier, never a secret/service-role key.
Do not put backend or MQTT variables into this file.

```powershell
npm.cmd --prefix apps/dashboard run dev:hybrid
```

Open the approved loopback origin on port 5178. Root is public. Enter Workspace
requires login, then RLS permits only explicitly approved runs. Account creation,
Reader A's exact-run grant and Reader B's denial are owner-managed; source code
does not grant access. Sign-out clears the session and unmounts protected content.
Reload clears the intentionally memory-only session. Do not weaken RLS to troubleshoot.

For the separate synthetic project, use `.env.example` → `.env` with only its URL
and publishable key, then `npm run dev`. Do not mix the two targets or credentials.

## Hybrid Backend — operator-only live startup

Copy the backend template only if the private destination does not already exist:

```powershell
if (Test-Path services/sdp-generator/hybrid-runtime.local.env) { throw 'Private file already exists.' }
Copy-Item services/sdp-generator/hybrid-runtime.env.example services/sdp-generator/hybrid-runtime.local.env
```

Configure privately:

| Variables | Requirement |
| --- | --- |
| `HYBRID_EXPECTED_PROJECT_REF`, `HYBRID_PROTECTED_PROJECT_REF` | Distinct approved isolated/protected references |
| `HYBRID_SUPABASE_URL`, `HYBRID_SUPABASE_SECRET_KEY` | Isolated target; backend secret only |
| `HYBRID_ENVIRONMENT_KIND` | `ISOLATED_TEST` |
| `MQTT_BROKER_URL`, `MQTT_USERNAME`, `MQTT_PASSWORD` | TLS broker, port 8883; private broker credentials |
| `HYBRID_NODE_IDS` | `demo-1,demo-2` matching the manifest |
| `HYBRID_FULL_ZONE_COVERAGE` | `false` |
| `HYBRID_ENABLE_WRITES`, `HYBRID_MQTT_ENABLE` | Leave false except during explicitly approved sessions |

Before enabling both opt-ins, verify original manifest/migration hashes, the
isolated target, both physical node topics and absence of another Writer or
legacy mirror. Do not start legacy subscriber/control-api/fake-publisher services.

The following command is for a separately approved live session only; substitute
reviewed paths/reference privately:

```powershell
Set-Location services/sdp-generator
node --env-file=hybrid-runtime.local.env hybrid-run.mjs --live --manifest "C:/private/omnisense/hybrid-target.APPROVED.draft.json" --confirm APPROVED_PROJECT_REF
```

The Supervisor has no duration flag; supervise an agreed bounded session externally.
Stop with Ctrl+C, wait for `HYBRID_STOPPED` and process exit, then disable both
opt-ins privately. No new flush starts on shutdown; an issued transaction may
finish. Never restart a halted Writer by bypassing lease/target/checkpoint checks.
No physical HVAC is controlled.

## Local versus cloud

ESP32 devices publish to HiveMQ. The operator-hosted Writer commits to isolated
Supabase. Vercel serves static assets; authenticated browsers read Supabase under
RLS. Turning off the Writer host stops new stored data. Continuous worker hosting
is future work, separate from the frontend deployment.
