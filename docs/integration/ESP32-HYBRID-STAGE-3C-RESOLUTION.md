# Stage 3C — deployment blocker resolution

Branch: `feature/esp32-hybrid`. Baseline: `ec62d18`. Date: 23 October 2026.
Scope: local implementation, disposable in-process PostgreSQL testing and build
verification only. No hosted SQL, HiveMQ connection, live writer, firmware change,
credential change, push, merge or deployment was performed.

This supersedes the open implementation blockers in the
[Stage 3B review](ESP32-HYBRID-STAGE-3B-DEPLOYMENT-REVIEW.md) and the runtime/auth
preparation limitations in [Stage 3](ESP32-HYBRID-STAGE-3-IMPLEMENTATION.md).
It does not certify a cloud project or physical hardware trial.

## Resolution by blocker

| Blocker | Implemented resolution | Evidence |
| --- | --- | --- |
| B1: disconnect receipt mismatch | Disconnected assessments keep exact original receipts for retained sample/evidence references, while occupancy is UNCERTAIN, states are DISCONNECTED and vacancy continuity is null. No new hardware event or measurement timestamp is manufactured. | Runtime → SDK transport → local SQL test commits disconnect, reconnect, one-node recovery, independent staleness and restart. Original evidence event count/receipts stay unchanged during disconnect. |
| B2: missing supervisor | `hybrid-runtime.mjs` owns one session/lease, waits for verified initialization before MQTT, coalesces simultaneous pumps, keeps one in-flight transaction, bounds input buffering, handles retry/recovery and waits for the issued request on shutdown. `hybrid-run.mjs` is the explicit opt-in CLI. | Local SQL-backed integration tests exercise lost responses, exact retries, lease expiry reconciliation, a competing owner, restart and immutable run mismatch. A separate test issues 100 simultaneous pump calls and observes one commit. |
| B3: private dashboard login | Opt-in private mode renders a login gate before dashboard readers mount. Email/password login uses the same singleton client as every reader, stores session only in memory, handles token refresh/expiry/sign-out and blocks anonymous or mismatched-token Data API requests. Expected run/model and preview origin are pinned. | Auth lifecycle tests include refresh, expiry, delayed sign-in after logout, sanitized failures and pre-login rendering. Existing synthetic configuration/output remains the default. Actual Supabase Auth/JWT gateway integration remains a hosted acceptance test. |
| B4: synthetic writer interference | New, separately scoped `003_sdp_hybrid_isolated_lockdown.sql` revokes the two legacy write RPCs from service_role only after the owner confirms matching isolated marker/ref/hash and absence of scripted records. Writer startup verifies effective legacy RPC denial. | Local SQL proves both old write RPCs are denied in the locked-down fresh test project. Existing 001+002 compatibility tests still seed/advance synthetic runs unchanged. 003 must never be applied to the existing synthetic project. |
| B5: environment-only target checks | A fixed, reviewed source registry pins the SHA256 of an independently approved non-secret manifest. Loader brands/freezes verified targets; writer factory refuses plain objects and mismatched environment configuration. CLI and private Vite mode check exact migration file hashes. Database marker must match the same manifest hash, references and lockdown capability. | Empty/unapproved registry, changed manifest bytes, forged plain object, different env target and changed SQL bytes fail closed. No actual target is approved: shipped registry is empty. |
| B6: incomplete policy validation | One shared application policy preserves original behavior. SQL guard is generated from its versioned constants/output map, checked for drift, and tested against the application across threshold/forecast boundaries. Commit validates vacancy origin/continuity, exact expected mode/output/confirmation and supporting stored forecast. | Negative SQL tests reject premature reduction, early LONG_VACANCY, ineligible PRECOOL, forged origin/gaps and missing confirmation, atomically. Shared contract validation also rejects locally detectable confirmation/duration contradictions. |

## Runtime behavior and recovery

Pipeline: existing subscribe-only MQTT binding → existing normalizer → existing
occupancy fusion → shared cooling policy with existing synthetic timetable → one
hybrid transactional session/writer. Forecasts and reported HVAC output remain
simulated. No HVAC command topic, physical actuator or firmware algorithm was added.

`npm run hybrid:run` without arguments prints help and exits without network access.
The executable live branch requires all of: `--live`, `--manifest`, `--confirm`,
HYBRID_ENABLE_WRITES=true, the existing MQTT opt-in, valid private credentials,
an independently approved target, exact reviewed file hashes, matching immutable
run/inventory/coverage and database marker/lockdown verification. It creates a
unique subscriber Client ID and random writer owner UUID per process. Existing
`npm start` remains synthetic; `hybrid:mqtt` remains read-only diagnostics.

Initialization reloads the committed checkpoint of the exact immutable definition.
The new session starts with no observation authority or vacancy timer. MQTT is
connected only after exclusive lease acquisition; SUBACK is required before packets
can establish current-session evidence. A broker error/disconnect invalidates
vacancy. Retained/DUP/rejected packets do not refresh readings. A cached acquisition
ages independently per node from its original receipt.

A pending transaction stays unchanged across retry. Accepted writes renew the
database's 60-second lease; the supervisor uses a conservative local deadline and
bounded SDK requests. On expiry or stale-token rejection it reacquires authority
before reading the checkpoint. It recognizes an already committed lost response,
or retries the exact uncommitted pending transaction against an unchanged checkpoint.
A conflicting checkpoint or another live owner halts the process. Recovery then
clears buffered authority and waits for new packets. It never fills downtime with
current readings. An unavailable recovery read is retried before another flush.

Shutdown stops the MQTT binding and scheduling immediately, and waits for the one
already-issued bounded request; it does not start a final flush. That request may
commit, so restart always reloads stored state. The lease expires naturally; there
is no automatic owner steal or unsafe force-release. A newly started process may
need to wait for the old lease to expire. Repeated stop requests are idempotent.

## Database and application responsibilities

`packages/sdp-contract/src/policy.ts` now exports the unchanged policy and versioned
threshold/output values. The synthetic model re-exports that function; no timetable,
forecast, booking, environment trajectory or output simulation logic was changed.
The 4,897-tick baseline and fixed synthetic CSV bytes remain regression requirements.

Database-enforced invariants include scope, inventories, source/validity/value/time
correlation, fresh/invalid/missing states, explicit full coverage, conservative
non-vacancy behavior, transactional references, unique commands/sequences and lease
fencing. A VACANT origin is required; it must begin at the current cutoff or continue
the prior committed vacancy with bounded per-node receipt/evaluation gaps. A reset
to the current cutoff is allowed. Mode/output/confirmation are checked using the
exact linked forecast, including PRECOOL's window/gap/confirmation prerequisites.

The application remains responsible for the booking forecast, every transient MQTT
assessment and timer reset, transport state, queue overflow/restart handling and
original receipt IDs. SQL cannot independently observe an unreceived packet, prove
a physical room was empty between readings, or recover device acquisition times
that the firmware does not supply. It does not implement another PIR/thermal
algorithm or a second booking schedule.

The generated SQL is included in the complete 002 file, so deployment has no hidden
script dependency. `npm run policy:generate` refreshes that section after an intended
policy revision; build `--check` refuses drift. The generated representation and
application evaluator are compared across 108 combinations of occupancy, duration
and forecast gaps, including confirmation/long-vacancy/PRECOOL boundaries. Future
policy changes require version review, regeneration, parity/negative tests and new
approved migration hashes. Shared validation alone cannot validate joined forecast
eligibility; the transactional SQL supplies that cross-record check.

## Independent target approval

New files under `services/sdp-generator/deployment/` contain an intentionally invalid
manifest template and an **empty** approval registry. No test or production project
reference, API key or live activation has been approved or provisioned.

Before a future trial, independently confirm the new project reference using the
operator's Supabase project console/account, separately from environment variables.
Record the protected SDP/legacy references, new test origin, chosen run UUID and UTC
activation, node positions/representative/coverage, preview origin and exact hashes
of 001/002/003 in a credential-free manifest based on the template. Do not include a
self-hash or secrets in the manifest. Hash its exact bytes and review an approval
entry in the fixed `approved-hybrid-targets.json`:

```json
{
  "manifest_sha256": "<REVIEWED_MANIFEST_SHA256>",
  "project_ref": "<INDEPENDENTLY_CONFIRMED_TEST_REF>",
  "protected_project_ref": "<CONFIRMED_PROTECTED_SDP_REF>"
}
```

Only reviewed source controls this registry; no env variable or CLI flag selects an
alternative registry. Offline tests inject a fake filesystem with constructed refs;
they never add a real approval. Trusted operators can edit code/registry or lie in
an owner marker, so this is not protection against an administrator deliberately
rewriting trusted source. It is a fail-closed boundary against environmental
mistargeting. The SQL Editor's actual project must still be checked independently.
No actual cloud identity is certified by this local work.

## Updated migration sequence — future approval required

Complete SQL files:

1. `001_sdp_foundation.sql`: unchanged.
2. `002_sdp_hybrid.sql`: updated marker hash, capability info, generated policy guard
   and vacancy continuity/temporal validation; existing synthetic behavior retained.
3. `003_sdp_hybrid_isolated_lockdown.sql`: a separate fresh hybrid test project step.
   It refuses any project containing scripted runs and does not delete data.

All are transaction-wrapped. Do not rerun successful migrations or apply them to
the stable project. Future owner sequence after target-specific approval:

1. Apply 001 in the empty new project. Set
   `omnisense.hybrid_migration_approved='ISOLATED_TEST'` and apply full reviewed 002.
2. Provision its private marker with five explicit columns:
   `(singleton,kind,project_ref,protected_project_ref,manifest_sha256)`, containing
   the independently approved references and exact manifest digest.
3. In that same selected test project, set the following session settings from the
   approval record, then apply full reviewed 003:

   ```sql
   SET omnisense.hybrid_isolated_lockdown_approved = 'ISOLATED_TEST';
   SET omnisense.hybrid_target_ref = '<APPROVED_TEST_REF>';
   SET omnisense.hybrid_protected_ref = '<PROTECTED_SDP_REF>';
   SET omnisense.hybrid_manifest_sha256 = '<APPROVED_MANIFEST_SHA256>';
   ```

4. Run the updated read-only verification SQL with all three placeholders filled.
   Check marker, effective grants, RLS, no existing writer and zero integrity
   violations. It is now executable-tested locally, not certified against hosted
   PostgREST/Auth. Configure dedicated confirmed test users and per-run reader ACLs
   only after approving initialization of the intended immutable run.
5. Approve runtime/private-preview activation separately. Keep coverage false and
   replacement ID null for the first clean trial. A later ACTIVE replacement must
   be pinned explicitly in its new reviewed manifest and approved by exact UUID.
6. Complete the Stage 3B I/A/H/F/P/R/C acceptance matrix through hosted API/Auth and
   real physical nodes. Do not turn local fixture success into a hardware claim.

Future launch syntax after build, real target approval and private process
configuration (these commands were **not run**):

```powershell
npm --prefix services/sdp-generator run hybrid:run -- --live --manifest <APPROVED_MANIFEST_PATH> --confirm <APPROVED_TEST_REF>
```

For a separate private preview, set VITE_HYBRID_PRIVATE=true,
HYBRID_MANIFEST_PATH and the approved test VITE_SUPABASE_URL/
VITE_SUPABASE_PUBLISHABLE_KEY in that child process only, then use its approved
localhost port. Private Vite/site mode skips synthetic dotenv loading and verifies
the same target/files. The normal synthetic preview/build path remains unchanged.
Use only a publishable key in the browser and an approved Auth account; never a
backend key. Sign-in/refresh failures unmount readers and revoke local API authority.

Rollback remains stop the isolated process/preview, reconcile any issued request,
retain private test exports and restore/rebuild only the disposable test project.
There is no destructive down migration, automatic ACTIVE reflag or history deletion.
Do not use the stable generator/project as a rollback target.

## Files changed in Stage 3C

| Area | Files relative to repository root |
| --- | --- |
| Runtime, target trust, writer/session | `services/sdp-generator/hybrid-runtime.mjs`, `hybrid-run.mjs`, `hybrid-target.mjs`, `hybrid-writer.mjs`, `hybrid-session.mjs` |
| Approval templates/build | `services/sdp-generator/deployment/approved-hybrid-targets.json`, `hybrid-target.example.json`; `package.json`, `generate-policy-sql.mjs` |
| Shared policy/contracts | `packages/sdp-contract/src/policy.ts`, `index.ts`, `validate.ts`, `test/contracts.test.mjs`; `services/sdp-generator/src/model.ts` |
| Private dashboard | `apps/dashboard/src/lib/privateAuth.ts`, `supabase.ts`, `publicConfig.ts`; `src/components/PrivateHybridAccess.tsx`; `src/main.tsx`, `src/hooks/useOverview.ts`; `vite.config.ts`, `scripts/site.mjs` |
| SQL | `supabase/sdp/migrations/002_sdp_hybrid.sql`, `003_sdp_hybrid_isolated_lockdown.sql`; `supabase/sdp/verification/002_sdp_hybrid_read_only.sql` |
| Regression/integration | `services/sdp-generator/test/hybrid-runtime.test.mjs`, `hybrid-session.test.mjs`, `test/fixtures/approved-target.mjs`; `apps/dashboard/test/private-hybrid-access.test.mjs` |
| Documentation | This report and supersession links in the prior Stage 3/3B reports |

Earlier uncommitted Stage 1–3 files remain intact. No package dependency or credential
was added. Generated `dist`/landing artifacts remain ignored build output.

## Validation and readiness

Final results: **250 tests passed** — 99 generator tests (including 12 target/runtime/
local-SQL cases), 20 shared contract/CLI tests, 131 dashboard tests. Generator build
and syntax checks, generated policy drift check, dashboard TypeScript, standard Vite
build, site build and `git diff --check` passed. The existing office renderer chunk
size warning remains; builds complete successfully.

Parity SHA256 values:

```text
4,897 synthetic ticks  d887eb95d0f5c713c67c160f314676c99a6f2e5545fc4971563cd41f15a4ad78
Original CSV bytes     05a2bd40af0fee2b1876b41e53edd03a0515a49d0acd12d7e991d91b2fad559e
```

Current migration SHA256 values (older 002 approval hashes are superseded):

```text
001 d850d4ccd9db9587af587f290e3ba35ce6d2fd2d38755244bdceb7fcb083ac2b
002 c007fa7042dacad38d60420d7ec0e267e72902d52202aa1b559ab4a31d80a7f4
003 c10beafccfbb957f970b9b483fd5dae9741abeb586977ef6c08091e199eb62b1
```

Reproduce from the repository root in PowerShell:

```powershell
npm --prefix services/sdp-generator test
npm --prefix packages/sdp-contract test
Push-Location apps/dashboard
node --test test/*.test.mjs
npm run typecheck
npm run build
npm run build:site
Pop-Location
git diff --check
```

All database execution in Stage 3C used disposable in-process PGlite, fake Auth role
claims and a fake HTTP/MQTT boundary. No TCP database connection was opened.

Remaining hosted checks: actual migration permissions/locking and PostgreSQL
differences, Supabase API key/header handling, PostgREST discovery/FK joins, real
Auth JWT issuance/refresh/revocation and run ACLs, browser sign-in/rendering, network
timeouts/ambiguous outcomes and process/broker recovery on the deployment host.
Physical node independence, coverage/calibration and sustained active-empty evidence
are still unverified. Headcount remains capped; QoS0 source ordering/duplicates and
MAC/acquisition timestamps cannot be inferred from current payloads. Queue overflow
or excessive event throughput creates explicit unknown gaps; it is not a raw-packet
archival service. No measured energy savings or physical HVAC operation is claimed.

Recommendation: **conditional GO for a target-specific, approved isolated Supabase
integration trial** after the offline checks below pass. Migration or writer startup
now is **NO-GO** because no real target manifest/registry entry, marker, users, keys
or cloud-operation approval exists. The stable synthetic demonstration stays on
its existing project/process; none of these migration or lockdown steps targets it.
