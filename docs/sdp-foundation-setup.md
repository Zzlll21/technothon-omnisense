# SDP Phase 1: isolated storage and generator

**Do not apply this migration to the Technothon project.** Nothing in this phase
has been executed against Supabase. No frontend or legacy service was changed.

## 1. Apply the reviewed migration manually

1. Confirm `git branch --show-current` reports `sdp-dashboard-rebuild`.
2. Open the existing dedicated **omnisense-sdp** project in Supabase. Check the
   project name in the header; do not open the Technothon project. If starting
   fresh, create a separate SDP project before continuing.
3. Choose **SQL Editor > New Query**. Run this read-only preflight:

   ```sql
   select to_regclass('public.sensor_readings') as legacy_table,
          to_regclass('public.sdp_runs') as sdp_installation;
   ```

   Both should be null for a fresh dedicated project. If `legacy_table` exists,
   stop: this is not an isolated installation. If `sdp_installation` exists, do
   not drop tables or rerun the creation migration; investigate its version first.
4. Open `supabase/sdp/migrations/001_sdp_foundation.sql` locally. Paste its entire
   contents, including `begin;` and `commit;`, into a new SQL Editor query.
5. Check the project header again and click **Run**, using the SQL Editor's
   privileged `postgres` role. Do not attempt this with a publishable key.
   Apply once. The migration is transactional, not a rerunnable reset script,
   and refuses installation if legacy `sensor_readings` exists. It only creates
   or grants/revokes permissions on the named new SDP objects; it does not alter
   global default privileges, existing tables, MQTT or Technothon SQL.
6. Confirm the six `sdp_*` tables exist and RLS is enabled on all six. No manual
   permissive INSERT policy or disabled-RLS workaround is needed.
7. Run `supabase/sdp/tests/read-only-checks.sql` to inspect installation security.
   Paste the entire file into another SQL Editor query and click Run. Expect:
   six tables with RLS; SELECT policies for the active run; browser mutation
   privileges false; browser execution false for all four RPCs; generator
   execution true; SECURITY DEFINER true and `search_path=pg_catalog, pg_temp`.
   The generator has no direct table grants. Owner/admin privileges are expected.
   No runs or samples exist until you explicitly start the writer.
   This verification script changes no data. Running as `postgres` is not a
   browser access test: its role-privilege queries inspect effective grants;
   embedded-PostgreSQL tests separately execute queries as anon/authenticated.

## 2. Find URL, reference and Secret API Key

1. Stay inside **omnisense-sdp**, open the project's **Connect** dialog and copy
   its Project URL. It must look like `https://<project-ref>.supabase.co`.
2. The project reference is the hostname portion before `.supabase.co`, also
   visible in the dashboard URL `/dashboard/project/<project-ref>`. It is not the
   display name `omnisense-sdp`. Use that same reference for all confirmation
   fields below. Custom domains are intentionally not supported by this guard.
3. Open **Settings > API Keys**, locate **Secret keys**, and create a dedicated
   generator key (for example name it `sdp-generator`) if needed. Privately copy
   the `sb_secret_...` value into the generator's local `.env` only. Do not use
   the publishable key, JWT signing secret, database password or an access token.
4. Never paste the key into SQL Editor, chat, source files, a shell command,
   screenshots or dashboard configuration. Future frontend code must use its own
   publishable key, not this secret. Do not disable or rotate Technothon's keys.

Secret keys are opaque, not JWTs, and map to `service_role` at the Data API.
The server client uses them through `apikey` with no opaque Bearer header.
See [Supabase API key guidance](https://supabase.com/docs/guides/getting-started/api-keys).

This public schema exposes only seeded, ACTIVE run rows through SELECT policies
to `anon` and `authenticated`. SEEDING and ARCHIVED runs are not public. This is
an intentionally public **simulated demo dataset**, not tenant authorization for
real building data. Do not ingest real personal/sensor data under this policy.

## 3. Configure the generator privately (PowerShell)

From the repository root in Windows PowerShell:

```powershell
Set-Location "C:\Users\zheng\OneDrive\文档\Technothon"
git branch --show-current
npm.cmd --prefix apps/dashboard ci
npm.cmd --prefix services/sdp-generator ci
npm.cmd --prefix services/sdp-generator run build
Set-Location services/sdp-generator
if (-not (Test-Path -LiteralPath .env)) { Copy-Item .env.example .env }
node -e "console.log(require('node:crypto').randomUUID())"
notepad .env
```

Edit only `services/sdp-generator/.env` locally:

| Variable | Purpose |
| --- | --- |
| `SDP_ENABLE_WRITES` | Keep false for initial offline validation. Change to `true` immediately before deliberate seeding. |
| `SDP_SUPABASE_URL` | New SDP project URL; must exactly match the project reference. |
| `SDP_EXPECTED_PROJECT_REF` | Dedicated 20-character Supabase project reference. |
| `SDP_SUPABASE_SECRET_KEY` | Recommended: the dedicated project's backend-only `sb_secret_...` value. Never use a `VITE_` prefix. |
| `SDP_SUPABASE_SERVICE_ROLE_KEY` | Optional legacy JWT fallback; leave **blank** when using the Secret API Key. Configuring both nonempty is rejected. |
| `SDP_RUN_ID` | UUID generated above; paste once and reuse for restart. Do not generate a new ID for each start. |
| `SDP_SEED` | Integer 0-2147483647, default 42; immutable per run. |
| `SDP_LIVE_ANCHOR` | Optional UTC ISO time ending in Z, aligned to :00/:30 seconds; blank chooses now on creation. Existing runs resume their stored anchor. Never set a future time. |

Only this service's `.env` is loaded when running `npm.cmd start` **from its
directory**. The writer never loads root, dashboard, subscriber or Control API
credentials. Restart after editing environment values. `.env` is already ignored;
`.env.example` remains tracked. Check `git status` and
`git check-ignore services/sdp-generator/.env` from the root before committing.
Never copy backend credentials into any `VITE_` variable.
Do not print the `.env` contents to verify it. An ignored file is not encrypted:
protect the local file, OS account, backups and any OneDrive sharing/sync access.

## 4. Run the offline dry-run

From `services/sdp-generator`:

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd start                     # Offline, even if .env has credentials
npm.cmd start -- --frames 10      # Short offline inspection
```

Expected: `OFFLINE DRY RUN`, followed by 2,017 frames and 4,034 samples processed;
nothing persisted. `--frames 10` is an optional shorter inspection. No network
requests are made, even if the local environment contains a key.

## 5. Seed seven days, then start continuous generation

Only AFTER manually applying/reviewing the migration in **omnisense-sdp**, save
`SDP_ENABLE_WRITES=true` in the local `.env`. Leave the legacy fallback blank
when using `SDP_SUPABASE_SECRET_KEY`. From `services/sdp-generator`:

```powershell
# Replace this placeholder with the NEW SDP reference, not the Technothon one.
$SdpProjectRef = 'YOUR_SDP_PROJECT_REF'
npm.cmd start -- --write --confirm-project $SdpProjectRef --seed-only
# Wait for successful completion before starting continuous generation:
npm.cmd start -- --write --confirm-project $SdpProjectRef
```

Writing requires all three: `--write`, `SDP_ENABLE_WRITES=true`, and the matching
`--confirm-project` reference. The service first checks a privileged installation
marker and verifies that `sensor_readings` is absent. Dry-run never probes a URL.
The writer logs neither credentials nor response bodies. RPC errors report HTTP
status/database code; check the dedicated project's logs for diagnostics. The
official SDK is configured without browser session persistence, refresh or URL
session detection. The generator only permits POSTs to its four RPC paths on
the confirmed HTTPS host, refuses redirects and disables SDK automatic retries.
Supabase and SQL grants, not the local key-format check, enforce authorization.

Seeding inserts 2,017 frames and 4,034 node samples, plus contract events. It may
take several minutes over HTTPS. Only the final seed frame makes the run visible
to anonymous readers. The next command resumes that same run and catches up, then
writes every 30 seconds. Ctrl+C stops; restart with the same run ID to recover.
Never run both commands concurrently. A 409/checkpoint conflict usually means
another writer is running or the process needs restarting with a fresh checkpoint.

## 6. Verify Supabase is updating

1. Open **omnisense-sdp > Table Editor > sdp_runs**. During seeding it shows
   SEEDING to the privileged editor; after completion it shows ACTIVE with
   `last_sequence=2016`. Public readers see zero runs until seeding finishes.
2. In Table Editor inspect `sdp_zone_frames` and `sdp_node_samples`. After the
   seed-only command expect 2,017 historical frames and 4,034 node samples, with
   two node IDs `sim-1` and `sim-2`. See `sdp_events` for the unchanged simulated
   contract envelopes, decisions, forecasts and reported outputs.
3. Rerun `supabase/sdp/tests/read-only-checks.sql` in SQL Editor. Its final queries
   show per-run counts and the latest two node samples without credentials.
4. After starting continuous mode, wait at least 60 seconds, rerun the verification
   query (or refresh Table Editor) and confirm increasing `last_sequence`,
   `last_simulated_at`, `updated_at`, and CONTINUOUS frame count. Each logical
   sample advances 30 seconds. Catch-up after downtime can initially be faster.
5. Compare `simulated_at`/`observed_at` with `inserted_at`: history has old logical
   times but a recent insertion time. Do not use insertion time for history charts.
6. Stop with Ctrl+C and restart the same continuous command. It must retain the
   same run ID and resume the checkpoint, not recreate the seven-day seed.

If authorization fails, check the correct project's Secret API Key and explicit
RPC EXECUTE grants. Do not enable browser writes or disable RLS to fix it. Key
rotation requires updating only this ignored `.env` and restarting the service.

## 7. Safe reset / new simulation

1. Stop the generator with Ctrl+C. Do not delete tables, modify checkpoints or
   run a destructive SQL reset against either project.
2. Generate a NEW UUID, update only `SDP_RUN_ID` in this service's ignored `.env`.
3. Optionally change seed and clear `SDP_LIVE_ANCHOR` for a new seven-day window.
4. Run the seed-only command with the same dedicated-project confirmation.
5. Once fully seeded, the new run becomes ACTIVE and the previous run becomes
   ARCHIVED atomically. Until then, readers retain the old complete dataset.
6. Start continuous generation for the new run. Keep old rows for investigation;
   privileged, reviewed cleanup/retention can be designed later.

## 8. Storage and future dashboard access

| Table | Purpose / keys |
| --- | --- |
| `sdp_runs` | Immutable definition, seed/version/anchor, publication status, atomic sequence and model checkpoint; UUID run key. |
| `sdp_zones` | Zone name, room and original ZoneConfig envelope; scoped by run/zone. |
| `sdp_nodes` | Required sensor mapping, labels and normalized floorplan coordinates; scoped by run/node. |
| `sdp_zone_frames` | Authoritative sampled occupancy/coverage and current decision/forecast/output IDs, sequence, logical time, insertion time and retry hash. |
| `sdp_node_samples` | Two environmental samples per frame with exact NodeEvidence references. |
| `sdp_events` | Unmodified contract envelopes, run/zone/frame linkage, event type, logical timestamp and causal ordinal. |

Composite foreign keys prevent cross-run/zone joins; per-frame/node and per-run
event uniqueness prevent duplicates. Descending frame/sample indexes support
latest/history queries. Event indexes support ordered timeline/type filtering.
Database functions lock the run and commit records/checkpoint together. Browser
roles have SELECT only, no function execution or table mutations. The service
role also has no direct table grants here; writes go through the four explicitly
granted SECURITY DEFINER functions with `pg_catalog, pg_temp` search paths and
schema-qualified application tables. Missing event envelope fields fail database
checks instead of passing via SQL NULL. A Secret API Key/service-role credential
is still privileged project-wide: keep it server-side. These functions do not
make a stolen key safe for other objects or Supabase services.

For the next frontend phase, use ONLY the new project's URL + publishable/anon
key. No dashboard environment is modified in this phase. Planned read pattern:

1. Read ACTIVE `sdp_runs` (zero rows means seeding/unavailable, not a crash).
2. Scope **every** subsequent query by that `run_id` and `zone_id`.
3. Fetch latest frame ordered by `simulated_at DESC LIMIT 1`, nodes and zone config.
4. Join frame event IDs to decisions/forecasts/applied reports; do not recompute
   controller occupancy/modes in React. Load the associated node sample frame.
5. Query bounded frame/sample histories ordered by logical timestamp. Supabase
   has response row limits: paginate seven-day history rather than silently
   truncating at 1,000 rows. Page events by `(occurred_at, sequence, ordinal)`.
6. Adapt event envelopes into the existing `SdpDataSource` using the current run
   as `session_id`/`replay_id` and latest frame as `as_of`. Persistence metadata
   is outside the wire contract. A real Supabase adapter is future work.
7. Poll initially (for example every 30 seconds). Realtime subscriptions are not
   enabled by this migration. Use `simulated_at` for charts/freshness; use
   `updated_at` and logical-time lag for generator health.
8. Derive runtime/utilization from time intervals between mode changes, never
   sample counts (five-minute history and 30-second continuation differ). These
   are simulated operating-mode indicators, not electricity/energy savings.

## Scope and remaining work

The schema/writer are deliberately limited to one scripted zone and two required
nodes. No real controller/prediction implementation, manual overrides, hardware
failure injection, authentication, tenant isolation, retention or production
deployment is added. The old frontend remains unchanged until the next phase.
Future schema/model changes need a new migration/model version, not edits to a
published run. Transport/topic decisions remain untouched.
