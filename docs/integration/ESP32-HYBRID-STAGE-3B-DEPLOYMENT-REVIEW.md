# Stage 3B — isolated deployment review and gated procedure

Date: 23 October 2026. Branch: `feature/esp32-hybrid`; baseline `ec62d18`.
Decision: **review complete; hold deployment and authoritative writer activation**.
Update: [Stage 3C resolution](ESP32-HYBRID-STAGE-3C-RESOLUTION.md) records the subsequent local fixes and revised migration/runtime approval gates. Findings below describe the Stage 3B snapshot.
The existing synthetic demonstration requires no change. This review adds only
this report and a not-executed, read-only SQL verification artifact. It does not
repair implementation, alter the migration or grant permission for cloud work.

This report qualifies the readiness statements in
[Stage 3 implementation](ESP32-HYBRID-STAGE-3-IMPLEMENTATION.md).
The accepted [Stage 3 plan](ESP32-HYBRID-STAGE-3-PLAN.md) remains the architectural
direction. Passing existing tests does not close the newly identified gaps below.

## 1. Findings and release gates

| ID | Finding and evidence | Required disposition before hosted writes |
| --- | --- | --- |
| B1 — blocker | `hybrid-session.mjs:19,33` evaluates disconnected occupancy with no readings and a reset fusion checkpoint, but keeps cached entries for sample construction. Both nodes become DISCONNECTED with non-null evidence IDs while `fusion.last_receipts` is empty. `002_sdp_hybrid.sql:304` requires each referenced sample's exact receipt in that map. | Repair the disconnect transaction construction while retaining original receipts and conservative uncertainty. Add a session-to-SQL disconnect commit/retry/reconnect regression. Do not weaken evidence correlation checks merely to permit it. |
| B2 — blocker | There is no hybrid writer CLI/supervisor. `npm start` is still the synthetic generator; `hybrid:mqtt` is still read-only. Exported writer/session modules are preparation, not a complete deployed service. | Prepare and review one opt-in supervisor with immutable target checks, unique owner ID per process, bounded serialized flush/drain, lease-expiry reconciliation, controlled retries and shutdown. Then approve its activation separately. |
| B3 — blocker | `apps/dashboard/src/lib/supabase.ts` creates an anonymous singleton with session persistence, automatic refresh and URL session detection disabled. No sign-in or session injection path currently authenticates that client. | Provide an isolated test-only auth gate/harness before mounting readers, using the same client for all hooks. Explicitly manage refresh/re-authentication and sign-out. Do not weaken RLS or use a backend key in the browser. |
| B4 — deployment gate | Migration preserves `service_role` execution of legacy `sdp_initialize_run` and `sdp_commit_tick`. The legacy publisher can create another scripted run and archive an ACTIVE hybrid run; it does not use the hybrid lease or exact replacement acknowledgement. | In the new hybrid-only test project, explicitly revoke those two execution grants after migration, as specified below. Do not apply this extra hardening to the existing synthetic project or alter the shared backward-compatible migration just to disable its legacy mode. |
| B5 — isolation gate | The expected/protected references and confirmation are supplied by the caller; the factory can also be constructed directly without the enable-flag helper. The SQL acknowledgement and marker are operator-controlled. The dashboard validates URL/key format, not an approved target reference. | Record an independently verified, non-secret target manifest. The future launcher must enforce it at every entry point. No actual new or protected reference has been verified in this review. Absolute prevention of mistargeting cannot currently be certified. |
| B6 — validation gap | SQL validates non-vacant conservative mode and mode-to-output mapping, but does not independently enforce the 5-minute/20-minute vacancy thresholds, confirmation-time relationship, continuity after a gap, or PRECOOL eligibility against the forecast. The shared validator likewise accepts an early SHORT_VACANCY event. | Add negative validation tests and enforce the intended temporal consistency before claiming SQL guards the policy independently. The application currently calls the correct policy; this is a privileged writer/contract defense gap, not anonymous HVAC access. Review any resulting SQL revision and its new hash before migration approval. |

B1 was reproduced with constructed firmware-compatible packets, the actual session
and a mock writer: the produced disconnect tick had states
`[DISCONNECTED,DISCONNECTED]`, retained evidence/sample receipts, and zero checkpoint
receipt entries; both node comparisons in the SQL rule would fail. **No SQL was
executed to establish this**. The earlier test checks disconnect assessment but
does not flush that disconnect through SQL's receipt validation.

For B6, a pure-JavaScript check built a first-frame valid empty snapshot whose
actual policy requests OCCUPIED. After changing the correlated decision/output to
SHORT_VACANCY/LOW/27 with null confirmation, all shared event validators still
passed. Inspection of SQL shows no vacancy-duration check that would reject that
temporal contradiction. Database acceptance of this mutation was not executed.

The supervisor must also handle backlog with backpressure: repeated timer calls
must not create an unbounded Promise chain while commits are slow. A lost response
may have committed; process restart or lease reacquisition must reconcile the
stored checkpoint before resending or rebuilding anything. Neither a generic
retry loop nor reusing one owner UUID across two processes is sufficient.

## 2. Full migration review

Reviewed [001](../../supabase/sdp/migrations/001_sdp_foundation.sql) and the complete
[002](../../supabase/sdp/migrations/002_sdp_hybrid.sql), not just the Stage 1 design.
Current SHA256 values:

```text
001 d850d4ccd9db9587af587f290e3ba35ce6d2fd2d38755244bdceb7fcb083ac2b
002 2e196838161e6e3b4e544badd3b3da8c9deb4b7fab11e7ff95a856dde924a9a2
```

Any approved correction to 002 invalidates that candidate hash and needs a new
review record. The scripts are versioned, one-time migrations, not idempotent setup.

| Area | Review result and practical limit |
| --- | --- |
| Historical data | No DROP TABLE, TRUNCATE, DELETE or historical measurement UPDATE in 002. New nullable time columns are appended without backfill. Existing synthetic values/IDs are retained. |
| Backward compatibility | Legacy model/history/clock/provenance rules remain; mode triggers retain legacy identity/non-null/range checks after global constraints widen. The private renamed legacy commit is reachable only through a stored-model guard. New readers select new columns only for hybrid runs. |
| Schema mutation | 002 drops/replaces constraints, renames a function and replaces six read policies. These acquire locks and can change availability/access. It is not safe to run against the stable demo merely because it does not delete rows. Constraint-name/catalog assumptions require the exact reviewed foundation and no schema drift. |
| Atomic migration | BEGIN/COMMIT encloses 002. On error, ROLLBACK its failed transaction; a separately committed 001 remains installed. Do not rerun 001 or assume failure removed it. |
| Atomic snapshot | Run lock, expected sequence, monotonic cutoff, frame/events/samples/checkpoint and publication are in one RPC transaction. Unique keys, exact references and JSON content hash reject conflicting retries; errors roll back all that RPC's changes. |
| Provenance/nulls | Versioned LIVE hardware evidence, independent BME validity/times and nullable observations are checked against sample projections. Forecasts and output remain SIMULATED; physical output is forbidden. Policy-duration validation has the B6 limitation. |
| Lease | Acquisition locks the run. Different live owners are rejected; expired ownership gets a higher epoch. Commit checks owner, epoch and expiry before even acknowledging a duplicate. Accepted writes/identical retries renew the 60-second lease. A lease is per run, not a ban on creating other runs. |
| Publication | First complete frame acquires the publication lock. Default null replacement ID rejects any existing ACTIVE run; only its exact acknowledged UUID can be archived. Archive keeps rows but removes them from ACTIVE-only readers. The legacy publishing path is the B4 exception. |
| RLS/grants | All nine tables use RLS; six data tables permit SELECT only. Synthetic ACTIVE reads retain public behavior. Hybrid ACTIVE reads require `auth.uid()` membership for that run. Private environment/reader/lease tables have no browser access. Direct writes are revoked from anon/authenticated/service_role. |
| Privileged functions | Qualified objects, trusted `pg_catalog,pg_temp` search paths and explicit EXECUTE revocation constrain the definer RPC surface. Owner/admin authority is still trusted. Validate effective privileges on the actual project because platform default grants can vary. |
| Rollback | No destructive down migration is supplied. Reversing nullable/version support after hardware rows exist can fail or lose data. Recovery is confined to a retained/restored disposable test environment, not edits to the stable project. |

Supabase documents grants and RLS as separate controls; RLS alone does not revoke
existing grants. Its secret API keys resolve to `service_role` and bypass RLS, so
the explicit table/RPC privileges and backend-only key handling remain essential.
[API security](https://supabase.com/docs/guides/api/securing-your-api),
[API keys](https://supabase.com/docs/guides/getting-started/api-keys).

## 3. Synthetic compatibility and validation performed

This review reran **207 tests without executing SQL**:

- Generator pure model/adapter/session/mock transport/writer/parity tests: 62 pass.
- Shared contract and CLI validation tests: 19 pass.
- Dashboard readers, rendering adapters, history and exports: 126 pass.

The complete 4,897 synthetic tick digest and original synthetic CSV fixture still
match their baseline bytes. The earlier Stage 3 report records local database
compatibility tests, including continuation of a 2,017-frame synthetic run after
migration. Those database suites were **not rerun** under this request's prohibition
on applying SQL to any database. They do not cover B1 or establish hosted readiness.
No SQL, broker test, Supabase API request, deployed dashboard check or writer startup
occurred in Stage 3B. No implementation source or existing migration was changed.

## 4. Exact isolated project configuration

| Setting | Required test configuration |
| --- | --- |
| Project | New dedicated `omnisense-hybrid-stage3-test`, with an independently confirmed reference different from both the active SDP demo and any original Technothon project. No production clone/data/key import. |
| Region/resources | Operator-approved available region and test resource/budget allocation. Record the selected region; do not infer one from browser timezone. No production cutover or resource change is included. |
| Database | Supported hosted PostgreSQL with foundation's built-in JSONB/SHA256/PLpgSQL facilities and Supabase roles/auth.uid available. UTC input timestamps; no new extension required by these migrations. New public SDP namespace must be empty before 001. |
| Data API | Enabled for the existing `public` schema used by readers/RPCs. Existing 500-row client pages need no row-limit increase when the configured maximum is at least 500. Verify function discovery and linked sample/event FK queries through hosted PostgREST. No Realtime or Storage setup is needed. |
| Backend credential | New project's private `sb_secret_...` API key, accessible only to the approved sole backend process. No browser, CSV, Git, screenshot, transcript or command-line literal. |
| Frontend credential | Same test project's `sb_publishable_...` key and exact HTTPS URL. A publishable key alone is anonymous and cannot read the hybrid run. |
| Auth | Dedicated confirmed test users, public sign-up/anonymous sign-in disabled in this new project; approved tester membership only. Avoid email invitations. Approved in-memory password/session flow and explicit token refresh needed. Use a separate localhost origin/port, e.g. `http://127.0.0.1:5178`. Any redirect allowlist must be restricted to the actual test flow. |
| Processes | One hybrid supervisor, no synthetic generator, legacy subscriber writer, cron job, automation or Edge Function writer pointing at this project. Original demonstration continues independently. |
| Run | One new UUID, real activation UTC, no historical hardware backfill, `replaces_active_run_id=null`. Coverage false until physically validated. Separate test-reader ACL per run. |
| Operations | Owner-reviewed backup/export or reproducible rebuild path, private logs with fixed error tokens, target manifest and approved migration hashes. No automatic deploy/restart until the trial is accepted. |

Use one approved target manifest outside credentials, containing:
`test_project_ref`, `protected_sdp_project_ref`, any additional protected legacy
reference, exact API origin, approved SQL hashes, run UUID, coverage/representative
node/inventory, local preview origin and operator approvals. Unfilled placeholders
mean **STOP**, never discover or default to a production target.

## 5. Target-isolation safeguards and limits

Current writer helper requires `HYBRID_ENABLE_WRITES=true`, environment kind
ISOLATED_TEST, distinct expected/protected 20-character references, an exact
reference confirmation, exact HTTPS origin and a backend secret key. It does not
read the synthetic `.env`. Verification must match the private installation marker
before initialize/get-run/acquire/commit. Its HTTP wrapper permits only five named
POST RPCs at that origin, strips Bearer authorization, blocks redirects and logs
no raw upstream errors. It does not accept a database connection string.

These checks prevent common accidental reuse; they are not independent proof that
the caller supplied the right protected reference. The future supervisor must
compare configuration against the approved manifest before constructing the
client, and cannot bypass the enable/confirmation helper by calling the factory
directly. Backend key origin cannot be inferred from its opaque text. SQL Editor
target selection is outside these JavaScript guards. Manually copied markers can
be wrong, so both operator target verification and runtime checks are required.

The current checkout has only `.env.example` files in the examined root/dashboard/
generator locations; relevant HYBRID/VITE/Supabase/database/PG process-variable
presence checks were all false. Values were not printed. This does not audit
external terminals, browser sessions, CI secrets or the deployed demonstration.
Neither actual test nor protected project reference is currently certified here.

For the future trial, use a separate private backend secret source and a fresh
child-process environment with an explicit allowlist. Include only reviewed
HYBRID/MQTT variables and required system/runtime variables. Exclude synthetic
Supabase variables, DATABASE_URL/PG service defaults, dotenv preload/Node options
and inherited VITE overrides unless explicitly validated. For the frontend, supply
only the reviewed test URL/publishable key; never a backend variable. Leave all
existing `.env` files and deployment settings unchanged.

Use the explicit test project's SQL Editor for this procedure to avoid implicit
CLI project links or stored database connection defaults. Do not use an existing
`supabase db push`, linked-project command or generic SQL task. If a direct database
client is later proposed, its exact test host/reference, TLS verification and
credential source need separate review; never put a password-bearing DSN in a report.

## 6. Node inventory, workspace and private access

Proposed initial immutable inventory (illustrative coordinates only):

| Topic | Payload ID / stored node | Label | x / y |
| --- | --- | --- | --- |
| `omnisense/node/demo-1/telemetry` | `demo-1` | Physical Node 1 | 0.30 / 0.50 |
| `omnisense/node/demo-2/telemetry` | `demo-2` | Physical Node 2 | 0.70 / 0.50 |

The normalizer rejects a topic/payload identity disagreement. Initialization writes
the configured inventory directly; arbitrary approved IDs are supported. The
workspace maps exact IDs and configured coordinates through `spatialOverview`,
`OfficeCanvas` and `officeRenderer.js`, with node-ID selection/history. Displayed
Node 01/02 are ordinal labels, not MQTT identities. Only the Open Office maps to
the one stored zone; surrounding rooms/furniture and approximately 10 m² footprints
remain illustrative. Confirm actual positions/labels before initializing; do not
interpret those drawings as validated physical coverage.

Use `demo-1` as the initial representative environment node only if approved; this
is a display choice, not an average. Its unavailable BME value stays null even if
`demo-2` is valid. Valid occupancy can coexist with invalid environment. Independent
receipt clocks and state remain visible; a fresh-and-valid aggregate indicator
requires all displayed evidence fields and must not be read as a packet count.
Firmware headcount is capped and must not be summed across overlapping footprints.
The payload supplies no MAC, source sequence or acquisition timestamp: physically
power/stimulus-test each identity and confirm unique MQTT clients separately.

No public-demo policy changes are required in the existing project. In the new
project, 002 replaces the foundation policies so an ACTIVE hybrid run is readable
only by an authenticated user whose actual `auth.uid()` is in `sdp_hybrid_readers`.
Anonymous and unrelated users see no hardware rows. Do not add an OR/public policy
to fix the missing login path. Archived runs remain hidden through this API even
from their prior ACL user; owner audit/export is a separate operation.

The test auth gate must authenticate the same singleton before `useOverview` and
the history/record hooks mount, clear session on sign-out and handle expiry. A
different signed-in client does not authenticate the current anonymous one.
Persistence and redirect auto-detection are disabled, so a refresh or magic-link
redirect is not an implemented login flow. Supabase's session API requires valid
access/refresh tokens; none should be pasted into logs or committed.
[setSession](https://supabase.com/docs/reference/javascript/auth-setsession),
[sessions](https://supabase.com/docs/guides/auth/sessions).

## 7. Approval-required deployment sequence

This sequence is gated by B1–B6; it is not a request to execute the current candidate.
All cloud actions below require explicit approval naming the exact new project.

1. Resolve/review blockers offline and authorize SQL regression execution separately.
   Test the actual session-to-SQL disconnect path, expiry reconciliation, negative
   policy cases and private auth flow. Record revised hashes and rerun parity.
2. Approve new project creation/configuration and any test cost. Record its exact
   reference and all protected references independently from current environment
   variables. Inspect every target URL. Confirm no writer/scheduler is configured.
3. Approve the complete final SQL plus the isolated-only grant hardening below.
   Open only the explicitly selected test SQL Editor for execution. Confirm its
   project reference against the manifest, capture an empty-schema baseline and
   backup/rebuild record. Check absence of existing SDP objects and legacy
   `sensor_readings`; stop for any collision/drift.
4. Execute reviewed 001 once as database owner. In the same selected project,
   execute `SET omnisense.hybrid_migration_approved='ISOLATED_TEST';` and the entire
   final 002 in one session. Do not initialize any run between these migrations.
   On a failed transaction issue ROLLBACK, inspect objects and stop. A successful
   001 survives a later failed 002; do not reapply 001 blindly.
5. As owner in this target only, provision the marker and disable the legacy
   publishing path before giving the hybrid process its private credential:

   ```sql
   BEGIN;
   -- Replace these two placeholders from the approved manifest; never infer them.
   INSERT INTO public.sdp_hybrid_environment
     (singleton,kind,project_ref,protected_project_ref)
   VALUES (true,'ISOLATED_TEST','<APPROVED_TEST_REF>','<PROTECTED_DEMO_REF>');
   REVOKE EXECUTE ON FUNCTION public.sdp_initialize_run(jsonb),
     public.sdp_commit_tick(jsonb) FROM service_role;
   COMMIT;
   ```

   The table reference checks make unfilled placeholders fail and roll back. The
   two revoked functions must remain available in the original synthetic project.
   Keep `sdp_get_run` available because the hybrid writer needs it. Do not re-grant
   the private `_sdp_commit_scripted_tick` helper.
6. Run the not-yet-executed owner verification artifact
   [`002_sdp_hybrid_read_only.sql`](../../supabase/sdp/verification/002_sdp_hybrid_read_only.sql),
   after substituting approved references. It uses READ ONLY and ROLLBACK. All
   integrity counts must be zero, table/policy/function grants must match comments,
   and no run/lease should exist yet. Catalog checks do not prove JWT/API behavior.
   Test PostgREST function discovery and `sdp_hybrid_info` through the guarded
   server client; do not log request headers or keys.
7. After approving run initialization, verify target and immutable configuration,
   initialize/load the intended UUID and confirm SEEDING/checkpoint state. Create
   dedicated confirmed test users privately. As owner grant only the intended
   reader membership (this is data, not a browser write privilege):

   ```sql
   INSERT INTO public.sdp_hybrid_readers(run_id,user_id)
   VALUES ('<APPROVED_RUN_UUID>'::uuid,'<APPROVED_TEST_USER_UUID>'::uuid);
   ```

   Use real user UUIDs from this test project's Auth, not an email or another
   project's UUID. No new database role or service key is needed in the browser.
8. Approve one controlled replay writer activation. Acquire a per-process random
   owner lease, verify epoch and start the reviewed bounded supervisor. First tick
   atomically activates a complete snapshot. With null replacement ID, an existing
   ACTIVE run must abort activation without changing either run. Never use
   `npm start` as the hybrid launch command: no hybrid launch script exists yet.
9. Start the separate authenticated local preview only after its auth gate is
   implemented and reviewed. Future existing Vite command:
   `npm --prefix apps/dashboard run dev -- --port 5178 --strictPort`, with reviewed
   test-only process configuration. Do not edit the stable dashboard `.env`, use
   a shared browser profile/session, or deploy this preview over the public site.
10. Pass replay persistence/security/recovery tests, stop that writer and reconcile
    its final checkpoint before changing input source. Separately approve real
    MQTT ingestion using existing TLS settings, exact two topics and a unique
    subscriber Client ID. Require new physical packets; never reclassify replay
    evidence as physical. If using a new run, retain the replay run and separately
    approve its exact replacement UUID before any activation that archives it.
11. Execute the acceptance matrix below, retain sanitized evidence and review the
    result. A verified isolated trial does not authorize production migration,
    public hardware access, physical HVAC actuation, push, merge or deployment.

Backend opt-in names remain HYBRID_ENABLE_WRITES, HYBRID_ENVIRONMENT_KIND,
HYBRID_EXPECTED_PROJECT_REF, HYBRID_PROTECTED_PROJECT_REF, HYBRID_SUPABASE_URL and
HYBRID_SUPABASE_SECRET_KEY. MQTT settings remain the existing private TLS variables.
Frontend uses VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY only. No values
have been set, copied or changed during this review.

## 8. End-to-end acceptance checklist

Record source as PHYSICAL or CONSTRUCTED_REPLAY for every case; unobserved physical
states remain pending rather than being reported as hardware success.

| ID | Exact action | Pass criteria |
| --- | --- | --- |
| I1 | Compare approved manifest, SQL Editor target, backend origin/marker and preview origin | All point to the new test reference; protected references differ; only one writer; no stable configuration change. |
| I2 | Inspect grants/policies after isolated hardening | Nine RLS tables; browser SELECT on six only; private controls unreadable; zero direct write grants; privileged RPCs unavailable to browsers; legacy write RPCs unavailable to service_role in this test project. |
| A1 | Read all six tables as anonymous, unrelated authenticated tester and approved tester | First two see no hybrid rows; approved tester sees only its ACTIVE run and correlated records; all three denied table writes and privileged RPCs. Test actual Auth JWTs via API, not SQL-owner results alone. |
| A2 | Sign out, expire session, refresh/re-authenticate, reload preview | Hardware data is not fetched anonymously or silently exposed; auth state/error is explicit, and valid session restores scoped reads. |
| H1 | Both physical devices publish for 120 seconds | At least 30 newly received valid non-retained packets per ID, independent advancing receipts, exact topic/payload identity. Retain sanitized capture with gateway time/provenance. |
| H2 | Stimulate/power off demo-1 for over 180 seconds while demo-2 stays online, then reverse | Only the powered-off device ages through 90-second STALE and 180-second DISCONNECTED; the other keeps its own readings. Operator/broker evidence confirms distinct physical clients, not just different topics. |
| H3 | Produce valid occupied, active-empty, PIR-inactive, fallback, unavailable thermal, BME valid/N/A/missing/invalid cases | Original source/label/confidence/count/active flags preserved; independent nulls; inactivity/fallback zero/unavailable never confirms vacancy. Label any state produced only by replay. |
| F1 | Occupied + empty/missing/stale at one identical forecast instant | OCCUPIED/AUTO/24.5; required coverage appropriately degraded; no headcount summation. |
| F2 | Both valid active empty with coverage false | UNCERTAIN and OCCUPIED request, no vacancy confirmation. |
| F3 | Controlled continuous empty replay with validated fixture coverage, starting 12:00 MYT | Before 12:05 OCCUPIED; at 12:05 SHORT_VACANCY/LOW/27; at 12:20 LONG_VACANCY/OFF/null; at 12:50 PRECOOL/HIGH/24.5 for original timetable. Occupied counterparts at identical times retain the same forecast but request OCCUPIED. |
| F4 | Inject transient occupied/unavailable, stale gap, reconnect and queue overflow during confirmed vacancy | Continuity resets even between commits or during a pending DB request; no early reduction after recovery. SQL/contract negative cases reject premature reduction and inconsistent confirmation/forecast eligibility after B6 resolution. |
| P1 | Persist two different BME values, one unavailable field and a missing node | Exact independent stored values/validities, original receipts and null missing references; all frame inventory/correlation checks pass; no replacement values or fabricated evidence. |
| P2 | Disconnect MQTT after accepted hardware evidence and commit while disconnected; reconnect | Conservative DISCONNECTED snapshot commits without checkpoint receipt mismatch, can retry identically, and reconnect needs new packets. This specifically closes B1. |
| P3 | Lose a commit acknowledgement, retry same tick, then change the same-sequence payload | Exact retry inserts once; changed retry rejected atomically. One frame/sample/event set and one checkpoint advance. |
| P4 | Acquire from a second process/owner; expire/take over lease; retry old epoch including a duplicate | Live competitor and expired/stale/null tokens rejected; new epoch required. Recovery reconciles committed state before retry and never counts downtime as continuous vacancy. |
| P5 | Wrong model/scope/node/event type, duplicate/omitted node, future evidence, wrong command/report or physical feedback | Entire RPC rolls back; before/after checkpoint and table counts unchanged. |
| P6 | Initialize another run with default null replacement ID while a run is ACTIVE | First commit aborts and original remains ACTIVE. Only a separately approved exact replacement archives it, preserves all rows and exposes no mixed snapshot. Legacy bypass is denied by isolated grants. |
| R1 | Inspect floor, 3D, demo-1/demo-2, representative environment, 1h/24h history and utilization | Exact IDs/coordinates/receipts; independent field validity; no environment borrowing, stale chart bridges or downtime backfill; all forecasts/output explicitly simulated. |
| R2 | Pin history at T, append later events and cross a Malaysia midnight/downtime gap | No future evidence enters T; decision/forecast/command links exact; elapsed durations partition correctly; downtime unknown, not multiplied by event count. |
| C1 | Export over 500 ALL records and separately both nodes' evidence | Same filters/count/snapshot across pages, correct metadata/null validity/time basis and stored JSON; hardware not labelled wholly simulated; forecast/output retain simulated provenance. Decision JSON names both evidence references. |
| C2 | Append during export, cancel, fail a page, test 50,000 rows/25 MiB bounds and hostile CSV text | Pinned result remains stable; no partial download; established limits, escaping, formula protection and UTC/+08 timestamps pass. |
| B1 | Compare protected demonstration before/after using its existing authorized public read surface | Same project/configuration and ACTIVE run identity; normal synthetic advancement allowed; original generator and public dashboard stay operational. No stable database SQL or credential change caused by this trial. |

Quiet-room firmware may become inactive before five minutes of qualifying empty
observations; hardware reduction may therefore remain unobserved. This is expected
conservative behavior, not permission to change PIR/TinyML firmware or fabricate
vacancy. Sustained-empty and rare recovery states may require labelled replay.

## 9. Rollback and approvals

On migration error: ROLLBACK the failed transaction and inspect the *test* schema.
001 may already be committed; a successful 002 must not be blindly rerun. On an
RPC error: retain the exact pending payload and committed checkpoint, do not advance
local state, and classify permanent validation/authority failures rather than loop.

After activation, stop the isolated supervisor/preview and MQTT subscription,
prevent automatic restart and account for any already in-flight transaction before
recording the final committed sequence. Retain/export its test dataset privately.
Restore an independently tested pre-migration test backup or rebuild another
disposable isolated project from the approved sources. No automatic DROP, history
deletion, in-place down migration, manual ACTIVE reflag or production key rotation
is part of rollback. Destruction of a test project or any credential revocation
requires specific approval and applies only to that project. The protected
synthetic demonstration is not a rollback target and is never restarted for this.

Required explicit approvals, in order: offline blocker repairs and SQL regression
testing; new project/resources; final exact SQL hashes/target plus isolated grant
hardening; test marker/users/ACL and run initialization; replay writer/private
preview activation; real telemetry ingestion; any exact ACTIVE replacement; and
any restore/destructive cleanup. This review performs none of those actions and
does not ask for a production cutover.
