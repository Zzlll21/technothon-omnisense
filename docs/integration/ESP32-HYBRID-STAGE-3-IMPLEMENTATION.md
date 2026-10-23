# Stage 3 offline implementation and deployment review

Date: 23 October 2026. Branch: `feature/esp32-hybrid`.
Status: candidate implemented and tested locally; **hosted migration and runtime
activation are not approved or performed**. Read with the Stage 1, Stage 2 and
Stage 3 plan reports in this directory. This document supersedes the plan's
statement that no candidate SQL exists, without changing its hardware acceptance gates.
Subsequent [Stage 3C fixes](ESP32-HYBRID-STAGE-3C-RESOLUTION.md) supersede this report's earlier runtime/auth limitations and SQL hash; use that report for the current candidate and approval sequence.

## Review artifacts and files

The complete executable candidate is
[`002_sdp_hybrid.sql`](../../supabase/sdp/migrations/002_sdp_hybrid.sql).
Review that entire file, including grants, RLS and activation, before execution.
`001_sdp_foundation.sql` is unchanged. There is no generated SQL hidden in a launcher.
Candidate SHA256:
`2e196838161e6e3b4e544badd3b3da8c9deb4b7fab11e7ff95a856dde924a9a2`.

Stage 3 adds:

- `services/sdp-generator/src/hybridModel.ts`: immutable hybrid definition and pure
  transactional frame builder using existing hardware fusion, booking schedule,
  `coolingPolicy()` and simulated output semantics.
- `services/sdp-generator/hybrid-session.mjs`: per-node ingestion, receipt IDs,
  transient-state evaluation, bounded buffering, frozen retries and serialized commits.
- `services/sdp-generator/hybrid-writer.mjs`: isolated-target configuration,
  marker verification and narrow privileged RPC client. Import/construction sends
  nothing. No CLI, timer, MQTT connection or writer is automatically started.
- `services/sdp-generator/test/hybrid-{database,session}.test.mjs` and
  `apps/dashboard/test/hybrid-persistence.test.mjs`: offline regression coverage.

Stage 3 updates these existing files:

| Area | Files relative to repository root |
| --- | --- |
| Shared versioned contract | `packages/sdp-contract/src/types.ts`, `src/validate.ts`, `test/contracts.test.mjs` |
| Generator build checks | `services/sdp-generator/package.json` |
| Five persisted readers and CSV | `apps/dashboard/src/api/overview.ts`, `nodeHistory.ts`, `predictiveHistory.ts`, `utilizationHistory.ts`, `operatingRecords.ts`, `exportOperatingRecords.ts` |
| Reader scopes and nullable display model | `apps/dashboard/src/hooks/useNodeHistory.ts`, `usePredictiveHistory.ts`, `useUtilizationHistory.ts`; `src/types/overview.ts` |
| Attribution, history gaps, records | `apps/dashboard/src/lib/nodeHistoryDisplay.ts`, `predictiveDisplay.ts`, `overviewDisplay.ts`, `spatialOverview.ts`, `spatialCooling.ts`, `spatialRecords.ts`, `operatingRecordsDisplay.ts` |
| Existing presentation compatibility | `apps/dashboard/src/components/cooling/NodeComparison.tsx`, `NodeHistoryCharts.tsx`, `PredictiveTimeline.tsx`, `OperatingRecords.tsx`, `ProductShell.tsx`, `RecordDetail.tsx`; `src/components/spatial/CoolingTimeline.tsx`, `OperatingRecordInspector.tsx`; `src/pages/SpatialDashboard.tsx` |

The uncommitted Stage 1–2 adapter, MQTT runner, model extraction, fixture, package
lock/dependency additions and earlier reports already existed at the start of this
stage and have been retained. They are not new hardware measurements or credentials.

## Persistence contract and compatibility

`sdp-scripted-v1` / `sdp.v1-draft.1` remain supported. New hybrid runs explicitly use
`sdp-hybrid-v1` / `sdp.v1-hybrid.1` and LIVE/null replay clocks. The legacy event
validator remains strict; stored readers dispatch by version and then bind to the
pinned run model. A LIVE event cannot be accepted into a scripted read simply by
removing its provenance check.

| Input | Stored representation |
| --- | --- |
| Hardware identity | Configured topic/payload identity, e.g. `demo-1`, `demo-2`. Bounded 1–64 character alphanumeric/underscore/hyphen IDs; 1–32 unique configured nodes. No alias to sim IDs. |
| Ingestion identity | Gateway-generated UUID suffix assigned once per accepted receipt. It identifies ingestion and transactional retry, not a device acquisition sequence. |
| Receipt | `hardware.received_at`, evidence `occurred_at` and sample `observed_at` preserve original UTC gateway receipt. `time_basis=GATEWAY_RECEIPT`; `device_observed_at=null`. |
| Evaluation | `sampled_at` is the committed frame cutoff, independently of receipt. Existing frame `simulated_at` column name is retained for compatibility; the hybrid clock is LIVE. |
| Occupancy | Effective validated classification, capped headcount 0–3, TinyML/fallback method, original source/label/confidence and nullable active/PIR flags. Full class distribution and unavailable firmware/model versions are null. |
| Environment | Independent temperature/RH values, source IDs, VALID/INVALID/UNAVAILABLE and observation times. `N/A`, missing and invalid values never become zero. BME range is −40..85 C, RH 0..100%; these are validation bounds, not new HVAC limits. |
| Missing node | One explicit sample projection per configured node, with null evidence ID, receipt and measurements; decision state MISSING/null reference. No evidence event invented. |
| Reused evidence | Original ID/receipt reused across frame projections; freshness advances from receipt, not commit. No second measurement point fabricated in charts. |
| Forecast/output | Existing synthetic timetable and simulated acknowledgement, with SIMULATED provenance. Firmware fan/HVAC fields are not physical control feedback. |

The migration adds sampled/per-field time columns without backfilling or updating
existing sample rows. New legacy inserts populate these columns via a trigger;
legacy readers continue selecting their original columns. Legacy non-null,
temperature-range, inventory, REPLAY and simulation invariants remain enforced
after shared table checks widen. The original commit implementation is retained
privately behind a stored-model guard. Its existing information RPC is unchanged.

Hardware has no seven-day seed or synthetic replacement observations. No historical
synthetic run is converted into a hardware run. Original environment data, forecast
behavior and complete synthetic tick bytes remain covered by regression tests.

## One writer and activation safeguards

The session implements the interface consumed by the unchanged
`attachMqttMonitor()` binding. Each received packet passes the Stage 1 normalizer;
each transient occupancy/unavailable input can reset vacancy continuity before the
next persistence heartbeat. Required coverage defaults false. A positive fresh
node establishes occupancy; only all fresh valid active empty nodes and explicitly
validated full coverage establish vacancy. PIR inactivity and fallback zero never
confirm room vacancy. There is no demo-only zero-to-vacant shortcut.

An in-flight tick is immutable. Later MQTT packets queue separately; the committed
checkpoint advances only after an exact acknowledgement. Queue overflow clears
authority/vacancy continuity; it does not amend the pending retry. Restart retains
the committed sequence but requires new packets and creates a real history gap.
The next frame is current, never a catch-up backfill with today's measurements.

The database locks the run and requires a 60-second owner/epoch lease. Accepted
commits renew it; unexpired competing owners, expired or null tokens and stale
epochs fail. A lost response must retry the identical tick while the lease remains
valid. After lease expiry, the future supervisor must stop its flush loop, read
the committed checkpoint, explicitly reacquire authority and reconcile whether
the pending sequence was committed; it must never blindly rebuild a changed retry.
New ownership/restart drops observation authority. A supervisor is not launched here.

One transaction stores frame, new events, samples and checkpoint. It checks version,
scope, causal cutoff, exact per-node sample/evidence values and receipts, unique
inventory, classification metadata, freshness, conservative fusion, command/output
correlation and retry hash. It rejects physical outputs. The application remains
the existing cooling-policy evaluator; the SQL is not a new forecast controller.

**Starting a run can archive the previous ACTIVE run.** Initialization remains
SEEDING. On the first complete hybrid frame the RPC locks publication, reads the
current ACTIVE run and refuses replacement unless the immutable definition contains
that exact `replaces_active_run_id`. Default null refuses any existing active run.
An acknowledged replacement archives that run atomically but keeps its rows.
Only ACTIVE data is exposed through existing reader semantics; archived rows remain
available to the database owner for audit/export. The legacy generator still has
its original automatic publication behavior, so never run it against the hybrid
test project. Project isolation is required even with the new hybrid guard.

## Reader and CSV behavior

All five readers bind LIVE/provenance to `sdp-hybrid-v1`. Hybrid samples are checked
against exact linked evidence and projected onto the evaluation axis for frame
inspection; original receipt is retained separately. Histories use sampled-time
pagination, show null/missing/stale/downtime gaps and deduplicate repeated acquisition
IDs in measurement plots. The representative environment node remains explicitly
configured; a missing value never borrows from the other node. Occupancy and
environment validity remain independent.

The active CSV exporter derives its data-source label from stored event provenance.
Hybrid layout appends schema, clock, node/source, receipt, measured values/validities
and complete stored event JSON. That JSON retains raw/effective classification,
winning confidence, time basis and references; a decision's JSON names all node
evidence IDs rather than averaging node environments. Export node-evidence records
as well as decisions to obtain their actual measurements. The output remains
explicitly simulated. Synthetic CSV columns and bytes are unchanged.

Existing server-side filters, pinned snapshot/as-of scope, exact related IDs, counts,
stable 500-row pagination, 50,000-row/25 MiB limits, cancellation, formula escaping
and UTC/Malaysia timestamps remain in use. No deployed dashboard is changed.

## Local validation

All database tests use disposable in-process PGlite/PostgreSQL and constructed,
sanitized firmware-compatible fixtures. Transport tests inject a fake MQTT client
and fake HTTP transport. None connects to HiveMQ or Supabase.

Run from the repository root in PowerShell:

```powershell
npm --prefix services/sdp-generator test
npm --prefix packages/sdp-contract test
npm --prefix apps/dashboard run typecheck
Push-Location apps/dashboard
node --test test/*.test.mjs
Pop-Location
npm --prefix apps/dashboard run build
npm --prefix apps/dashboard run build:site
git diff --check
```

Final results: **87 generator tests, 19 shared-contract tests and 126 dashboard
tests passed** (232 total). Generator build/syntax checks, dashboard TypeScript,
standard Vite build, site build and `git diff --check` passed. Vite reports its
existing office-renderer chunk size warning; builds complete successfully.

Database coverage
includes continuation/activation of the original 2,017-frame history after migration,
no existing-row rewrite, atomic malformed-tick rollback, independent hardware nodes,
null measurements/missing evidence, retry/fencing/privacy, explicit active-run
replacement and all four cooling modes under identical forecast conditions.
Session tests cover pending input, transient occupied pulses, overflow, reconnect,
restart, stale evidence and exact retry. Reader tests cover all five paths, pinned
history, independent nullable fields and multi-page hybrid export.

Synthetic parity covers all 4,897 ticks (seven days plus 24 continuous hours), SHA256
`d887eb95d0f5c713c67c160f314676c99a6f2e5545fc4971563cd41f15a4ad78`.
The fixed legacy CSV fixture also matches bytes from the original `ec62d18`
exporter, SHA256 `05a2bd40af0fee2b1876b41e53edd03a0515a49d0acd12d7e991d91b2fad559e`.

Physical two-device reception, independence and valid sustained-empty operation
remain **unverified**. Previous diagnostic subscriptions received no packets.
The Stage 3 plan's H1–H3 hardware gates must be completed and labelled separately
from replay. BME observations do not change the existing setpoint policy.

## Security and isolated project prerequisites

Provision a new project, proposed name `omnisense-hybrid-stage3-test`, with a different
20-character project reference, URL and keys. A second run or schema inside the
active demonstration is not sufficient isolation. Do not copy production data or
keys. Record the protected demo reference and confirmed new reference as non-secret
deployment metadata; they must differ.

The migration creates an intentionally empty private installation marker. Without
owner provisioning it cannot initialize, acquire or commit hybrid data. This marker
and SQL acknowledgement are operational interlocks, not proof of the cloud project's
identity: the operator must verify the actual target before submitting SQL.

Hybrid data is private by default. Anonymous and unrelated authenticated readers
see no hybrid rows; approved test user UUIDs get run-scoped SELECT only via the new
ACL/RLS. Browser roles have no table writes or privileged RPC execution. Secret keys
stay backend-only. The service-role API is RPC-only for these tables, and helper
functions have trusted search paths and revoked direct execution.

Use a dedicated authenticated read-only test session in a separately configured
local dashboard preview. A publishable key alone cannot read hardware rows. The
existing dashboard has no new sign-in UI in this change; an approved private-session
test harness/auth flow is still a deployment prerequisite. Never use a backend key
in the browser or weaken RLS to make a preview load.

Prepared backend configuration uses only `HYBRID_*` target variables, no synthetic
`.env` fallback:

```text
HYBRID_ENABLE_WRITES=true
HYBRID_ENVIRONMENT_KIND=ISOLATED_TEST
HYBRID_EXPECTED_PROJECT_REF=<reviewed new project reference>
HYBRID_PROTECTED_PROJECT_REF=<existing demo project reference>
HYBRID_SUPABASE_URL=https://<reviewed new project reference>.supabase.co
HYBRID_SUPABASE_SECRET_KEY=<private backend sb_secret_ key>
```

No values have been created, saved or changed. In addition to explicit opt-in, the
configuration requires an exact reference confirmation, exact HTTPS URL and matching
database marker. The narrow client strips Bearer authorization, uses the secret as
`apikey`, blocks redirects/unexpected endpoints and omits raw upstream errors from
logs. MQTT uses the existing TLS infrastructure and private credentials, with a
unique subscriber identity and exact configured telemetry topics. It never publishes
firmware commands. Source sequence/order guarantees cannot be recovered from the
current firmware; retained/DUP packets invalidate authority and unflagged identical
QoS0 packets remain indistinguishable from new observations.

## Approval-required migration and activation sequence

These are review instructions, **not commands executed in this preparation**.
Approval must name the candidate SQL and the exact isolated target reference.

1. Verify the current branch, review the complete SQL/diff and passing offline
   results. Confirm the target is a new project and its reference differs from the
   protected demo. Record a test-project backup/restore point and baseline inventory.
   Do not change the existing demonstration or its generator settings.
2. In the new project's owner SQL session only, apply the unchanged
   `supabase/sdp/migrations/001_sdp_foundation.sql`. Confirm the six SDP tables,
   expected function signatures and no `sensor_readings` legacy table. Do not rerun
   foundation against an occupied project.
3. In one owner session, set
   `SET omnisense.hybrid_migration_approved = 'ISOLATED_TEST';`
   and execute the complete `002_sdp_hybrid.sql`. It has its own BEGIN/COMMIT;
   on error ROLLBACK and inspect the cause. Apply once, track the version and exact
   file hash in deployment records. It is deliberately not a repeatable migration.
   No run is activated by this operation.
4. After independently confirming the target again, provision its private marker
   with the reviewed references:

   ```sql
   INSERT INTO public.sdp_hybrid_environment
     (singleton, kind, project_ref, protected_project_ref)
   VALUES (true, 'ISOLATED_TEST', '<NEW_20_CHAR_REF>', '<DEMO_20_CHAR_REF>');
   ```

   Only the owner can provision this table. Confirm `sdp_hybrid_info()` through the
   server role and verify no active test run/writer exists. Repeat RLS/privilege and
   malformed transaction tests against hosted PostgREST; local PGlite does not test
   Supabase's API gateway, Auth or key handling.
5. Prepare the one explicit runtime supervisor using the exported session/writer
   interfaces: validate separate configuration and marker; initialize or load the
   exact immutable hybrid run; reconcile committed checkpoint; acquire lease; attach
   the subscribe-only MQTT binding; evaluate every packet and schedule a serialized
   flush at no more than the 30-second heartbeat interval. Capture current receipt
   times, never device times invented by the supervisor. On shutdown detach MQTT
   and stop the sole flush loop. Test lease expiry recovery before activation.
   There is no cloud writer launch command in this candidate; the existing
   `npm start` stays synthetic and `hybrid:mqtt` stays read-only.
6. Use a new explicit UUID and current UTC activation instant. Configure `demo-1`
   and `demo-2` (or reviewed inventory), coordinates and representative node. Keep
   full coverage false until validated. Require `replaces_active_run_id=null` for
   the first clean project trial. If a later test intentionally replaces an active
   run, stop its writer, export/retain it and separately approve its exact UUID.
7. Create the dedicated test user/session and, as owner, insert only the intended
   `(run_id,user_id)` into `sdp_hybrid_readers`. Launch a separate local preview on
   its own port with test-only public configuration and authenticated client.
8. Separately approve starting this project's single writer and physical ingestion.
   First complete controlled replay persistence and all acceptance cases; then
   H1–H3 physical tests with devices online. Check active-run identity in the stable
   project using its existing read-only view; its sequence may advance normally.
9. Execute the accepted plan's full H/F/P/R/C/B acceptance matrix, retain sanitized
   captures and SQL/reader/export evidence, and stop for review. No shared-project
   migration, production cutover, physical HVAC control, push or deployment follows
   automatically from this test approval.

## Rollback and remaining gates

Before migration commit, any SQL failure rolls back the candidate atomically.
After commit, stop the **isolated** supervisor and preview, retain/export its test
dataset and restore the isolated pre-migration backup or rebuild another disposable
project from foundation. There is intentionally no destructive down migration:
dropping nullable/version/provenance support after hardware rows exist would lose
data or fail constraints. Never delete/rewrite synthetic history or run a rollback
against the stable demonstration. Restoring an archived ACTIVE flag manually is
not a supported rollback; use a reviewed isolated restore if a replacement must be
undone. Ordinary old readers are compatible with the old project; revert only the
separate test preview/process if required.

Remaining gates are hosted SQL/PostgREST/Auth verification, private preview session
provisioning, approved supervisor startup/recovery wiring, real two-device identity
and freshness tests, spatial coverage validation and the complete accepted end-to-end
matrix. Firmware sensing limitations can keep quiet-room evidence uncertain and
prevent reduced cooling indefinitely. Persistence does not resolve that limitation.
No current test proves measured energy savings or physical HVAC operation.
