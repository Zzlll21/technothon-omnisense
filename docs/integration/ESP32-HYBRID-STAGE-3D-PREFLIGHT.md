# Stage 3D — isolated Supabase deployment preflight

Date: 23 October 2026. Branch: `feature/esp32-hybrid`.
Scope: documentation and local read-only preflight. **No project was created or
inspected through an authenticated cloud service; no hosted SQL, Auth provisioning,
MQTT ingestion or writer startup was performed.** Existing configuration and the
stable synthetic demonstration remain unchanged.

Read with [Stage 3C](ESP32-HYBRID-STAGE-3C-RESOLUTION.md), which supersedes the
earlier Stage 3/3B implementation limitations and old migration hash. This guide
does not approve any of the future operations below.

Revision: **physical-first competition prototype**. The existing Hybrid Runtime
Supervisor and two physical nodes are the hosted integration test path. A new
automated hosted fixture harness, a fixture publisher and a second compatibility
project are **not prerequisites**. Existing offline tests cover deterministic
policy boundaries and fault injection; hosted checks below cover actual deployment,
access control and physical data. No cloud operation is authorized by this revision.

## Shortest safe execution path

| Step | Action after the applicable approval | Completion evidence |
| --- | --- | --- |
| 1 | Create one empty isolated Supabase test project; independently check its reference/origin against the account console and protected demo references. | Distinct real target, no copied demo data or credentials. |
| 2 | Finalize one physical-run manifest for demo-1/demo-2; pin its exact hash in the existing registry. Keep replacement null. Decide coverage honestly before approval; false unless physically validated. | Local manifest loader and all three SQL hashes pass. |
| 3 | With explicit target-specific SQL approval, apply **001 → 002 → environment marker → 003** and run the existing read-only verification. Configure dedicated Auth accounts A/B. | Correct marker, RLS/grants/lockdown; no runs/writers yet. |
| 4 | With separate controlled-runtime approval, start **one existing supervisor**, using both physical nodes and the approved test-only environment. Observe the first real receipts and complete snapshots. | Exact run activated, one lease owner, demo-1/demo-2 samples and causal records stored. |
| 5 | While supervising that process, grant A the exact run ACL; test direct anonymous/B denial and A reads against populated data. Start the separate private Spatial Dashboard preview only after those checks pass. | Real Auth/RLS results, both nodes visible at reviewed positions with independent history. |
| 6 | Walk through occupied evidence, one node offline/recovery, null/unavailable readings when naturally present, and CSV export. Check snapshot integrity again. Stop the isolated runner with Ctrl+C at the agreed deadline. | Small, labelled hardware demonstration record; unchanged forecasts/simulated HVAC and stable synthetic demo. |

Use one operator-supervised session, initially about 10–15 minutes. The writer
CLI has no automatic duration option; the operator must stop it. A failure of
identity, permissions, integrity or lease checks stops the trial. Successful
ingestion does not by itself establish that every cooling mode was physically tested.

**Cooling demonstration limit:** with coverage false, both valid empty nodes still
produce UNCERTAIN and conservative OCCUPIED cooling. A positive occupied input
changes the assessment but may leave that same cooling request. To demonstrate an
actual reduction using hardware, validate that these two placements cover the
declared zone, approve coverage true **before initializing that immutable run**,
and receive continuous fresh, valid active-empty inference from both nodes for
at least five minutes. PIR inactivity, fallback zero and unavailable sensing do
not qualify. If the current firmware cannot sustain this evidence, show the honest
conservative hardware result and the existing offline policy tests; do not alter
firmware, fake emptiness or claim a hardware vacancy transition.

## 1. Current decision and evidence

**GO to review a new, disposable test-project proposal. NO-GO for hosted SQL or
runtime activation until a real target is independently verified and approved.**

| Item | Verified locally / outstanding |
| --- | --- |
| Branch | `feature/esp32-hybrid` |
| SQL | Full current 002 and 003 reviewed; exact file hashes below match Stage 3C |
| Approval registry | `services/sdp-generator/deployment/approved-hybrid-targets.json` still contains `approved: []` |
| Real isolated project identity | **Not supplied, independently verified or registered** |
| Protected project identities | Must be independently recorded by the operator; none inferred from secrets or environment variables |
| Default runtime | `npm --prefix services/sdp-generator run hybrid:run` exits successfully with disabled/help output; no network |
| Generated policy | `node services/sdp-generator/generate-policy-sql.mjs --check` passes |
| Whitespace | `git diff --check` passes |
| Regression baseline | Stage 3C reports 250 passing tests: 99 generator, 20 shared contract, 131 dashboard; not rerun as part of this documentation-only preflight |
| Hosted behavior | Not tested; local PGlite/fake Auth/HTTP/MQTT tests do not certify hosted behavior |
| Physical nodes | Real simultaneous reception, independent readings and coverage remain unverified by these tests |

Only this report is added in Stage 3D. Earlier uncommitted implementation files
are preserved. No migration, registry, credential or application code is changed.

## 2. Create the separate project — future approval A

1. Obtain approval for a **new project**, its organization, region, plan/cost and
   disposable-data policy. Suggested name: `omnisense-hybrid-isolated-test`.
   Prefer a dedicated test organization if available; otherwise a distinct project
   in an approved organization is required. A new schema, branch of the active
   database, clone/restore of production data, or new ACTIVE run in the existing
   project is not the intended isolation.
2. In the Supabase organization dashboard choose **New project**, select the
   approved organization, enter that explicit test name, choose the region and
   generate a unique database password in a private password manager. Do not reuse
   a demo password, import data or link the repository's generic CLI to this project.
   Wait until the project is healthy. Supabase documents project creation through
   its [organization dashboard](https://supabase.com/docs/guides/getting-started/quickstarts/reactjs).
3. Keep API auto-granting (**Automatically expose new tables/functions**, or the
   equivalent current Data API setting) off. The reviewed migrations explicitly
   grant their required access. The eventual Data API must be enabled with `public`
   exposed for the existing readers/RPCs; it may remain disabled during schema
   installation. Do not toggle auto-granting on after lockdown to fix a denied
   request. Review effective grants instead. See [Supabase API security](https://supabase.com/docs/guides/api/securing-your-api).
4. Do not add scheduled jobs, Edge Functions, database webhooks, replication,
   deployment integrations or another generator. No Realtime publication or
   Storage bucket is required by this polling dashboard.
5. Record the chosen backup/retention arrangement before any hardware writes.
   Do not assume free-tier PITR or an immediately usable restore point. For an empty
   disposable project, rebuilding another empty test project is the initial
   recovery strategy; later data retention needs an approved private backup/export.
   Verify actual plan capabilities in [Database Backups](https://supabase.com/docs/guides/platform/backups).
6. Stop here to verify identity. Creating a project does not approve SQL execution.

## 3. Independent identity and manifest — future approval B

Use the operator's authenticated Supabase account as the independent source, not
the application's environment or a caller-supplied marker. Open the new project
from the organization's project list. Cross-check its actual reference ID in
project settings, the `/dashboard/project/<ref>` page URL, and its API URL in
Connect/API settings. The API origin must be exactly
`https://<20-lowercase-alphanumeric-ref>.supabase.co`. These views corroborate the
account-selected project; they are not an external cryptographic attestation.

Separately confirm the existing SDP project and any other protected project's
references from their own account entries. Read only their identity information;
do not edit settings or inspect/copy credentials. The new reference must differ
from **every** protected reference. Project display names and `current_database()`
(often `postgres`) are insufficient proof of identity.

Maintain a non-secret approval record:

| Required field | Evidence to retain privately where appropriate |
| --- | --- |
| Organization, new project name, region and project reference | Account-selected project details, observer/reviewer and verification UTC time |
| Canonical API origin | Same reference as account details and console URL |
| Protected references | Independently confirmed SDP/legacy/other protected project IDs |
| Run identity and activation | New lowercase UUID; UTC timestamp with milliseconds, `history_start = live_anchor`; no hardware history backfill |
| Inventory | Exact `demo-1` and `demo-2`, reviewed labels/coordinates and representative environment node |
| Coverage/replacement | Coverage false unless both placements are physically validated and true is explicitly approved before run initialization; `replaces_active_run_id=null` for first trial |
| Preview | `http://127.0.0.1:5178`, separate from the stable demo process |
| Source and approval | Branch/revision plus reviewed dirty changes, all three SQL hashes, exact manifest hash, approving person/date/scope |

Create a **new non-secret manifest**, based on
`services/sdp-generator/deployment/hybrid-target.example.json`, only after these
facts are known. Replace every placeholder, removing the example extra protected
reference if it does not correspond to a real protected project. Keep the template
itself unchanged. Requirements enforced by `hybrid-target.mjs`:

- `schema_version=omnisense.hybrid-target.v1`, `environment_kind=ISOLATED_TEST`;
  canonical URL and distinct target/primary protected references.
- `protected_project_refs` includes the primary protected reference and all known
  protected references; none equals the target.
- 1–32 unique node identities matching `[A-Za-z0-9][A-Za-z0-9_-]{0,63}`; nonempty
  labels up to 128 characters; finite normalized x/y in [0,1]; representative is
  an inventory member. Device IDs are not limited to `demo-1`/`demo-2` in the code.
- Valid UTC `live_anchor`, lowercase run UUID, approved preview origin and the
  exact three migration hashes. No credentials, self-hash or extra fields.
- Run definition is immutable after initialization. A later change to inventory,
  coverage, representative, anchor or replacement is a separately reviewed run;
  do not edit an existing run/marker to bypass a conflict.

Hash exact manifest **bytes** after final formatting. This local command reads no
credentials (substitute a real non-secret path; it does not approve that file):

```powershell
Get-FileHash -LiteralPath '<ABSOLUTE_MANIFEST_PATH>' -Algorithm SHA256
```

After explicit approval, add its lowercase hash and independently checked IDs to
the fixed source registry, preserving its schema and any existing approvals:

```json
{
  "manifest_sha256": "<APPROVED_MANIFEST_SHA256>",
  "project_ref": "<INDEPENDENTLY_VERIFIED_TEST_REF>",
  "protected_project_ref": "<INDEPENDENTLY_VERIFIED_PROTECTED_SDP_REF>"
}
```

That object belongs in the registry's `approved` array; it is not a replacement
for the whole registry. Do not register the example manifest or fake test fixture.
Changing even whitespace in the approved manifest invalidates the approval.
Changing SQL requires new hash review and manifest approval. No alternative
registry can be selected through environment/CLI configuration.

After registration, this **local-only** loader check must pass before cloud work:

```powershell
node --input-type=module -e "import {loadHybridTarget,verifyMigrationFiles} from './services/sdp-generator/hybrid-target.mjs'; const t=await loadHybridTarget(process.argv[1]); await verifyMigrationFiles(t); console.log('Approved manifest and local SQL hashes verified; no network');" '<ABSOLUTE_MANIFEST_PATH>'
```

This is not proof that SQL Editor is on the correct cloud project. Registry/source
review and independent account verification are both required. A trusted
administrator can edit code or lie in a database marker; the guard addresses
accidental configuration errors, not a malicious administrator.

## 4. Migration order and exact bytes — future approval C

Complete SQL artifacts are in `supabase/sdp/migrations/`:

| Order | File | SHA256 verified in this preflight |
| --- | --- | --- |
| 1 | `001_sdp_foundation.sql` | `d850d4ccd9db9587af587f290e3ba35ce6d2fd2d38755244bdceb7fcb083ac2b` |
| 2 | `002_sdp_hybrid.sql` | `c007fa7042dacad38d60420d7ec0e267e72902d52202aa1b559ab4a31d80a7f4` |
| 3 | `003_sdp_hybrid_isolated_lockdown.sql` | `c10beafccfbb957f970b9b483fd5dae9741abeb586977ef6c08091e199eb62b1` |

Recheck from the repository root; stop on any mismatch:

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath `
  supabase/sdp/migrations/001_sdp_foundation.sql, `
  supabase/sdp/migrations/002_sdp_hybrid.sql, `
  supabase/sdp/migrations/003_sdp_hybrid_isolated_lockdown.sql
```

Do not use the superseded 002 hash from the early Stage 3 implementation report.
Do not run `policy:generate`, normalize line endings, or edit SQL after approval.

**The following SQL is a future procedure, not executed or authorized here.**
Use the new project's owner SQL Editor, rechecking the browser's project reference
against the approval before **every** submission. Do not use a generic linked
`supabase db push`, inherited `DATABASE_URL`, or a saved query on the stable project.

1. After target-specific approval, perform an owner read-only precheck: no
   `public.sdp_runs`, `public.sensor_readings`, or prior SDP objects/data should
   exist in this freshly created project. Verify roles `anon`, `authenticated`,
   `service_role`, `auth.uid()`, and `USAGE` on `public` for those roles exist;
   record PostgreSQL version. Unexpected objects or missing baseline privileges
   require review, not broad grants or deletion. A marker does not protect 001.
2. Submit the **entire hash-reviewed 001** once. It has its own transaction.
3. In one SQL Editor submission, prefix the **entire hash-reviewed 002** with:

   ```sql
   SET omnisense.hybrid_migration_approved = 'ISOLATED_TEST';
   -- Immediately followed by the complete approved 002 file, unchanged.
   ```

   Keep the prefix and file in one submission: SQL Editor/pooling need not retain
   session settings between runs. Do not wrap the files in another transaction.
4. Provision the owner-only environment marker once, using reviewed non-secret
   IDs and the **manifest** digest (not one SQL file's digest):

   ```sql
   BEGIN;
   INSERT INTO public.sdp_hybrid_environment
     (singleton, kind, project_ref, protected_project_ref, manifest_sha256)
   VALUES (true, 'ISOLATED_TEST', '<APPROVED_TEST_REF>',
     '<PROTECTED_SDP_REF>', '<APPROVED_MANIFEST_SHA256>');
   COMMIT;
   ```

   Existing marker/conflict means stop; do not upsert over it.
5. In **one submission**, prefix the full unchanged 003 with all four settings:

   ```sql
   SET omnisense.hybrid_isolated_lockdown_approved = 'ISOLATED_TEST';
   SET omnisense.hybrid_target_ref = '<APPROVED_TEST_REF>';
   SET omnisense.hybrid_protected_ref = '<PROTECTED_SDP_REF>';
   SET omnisense.hybrid_manifest_sha256 = '<APPROVED_MANIFEST_SHA256>';
   -- Immediately followed by the complete approved 003 file, unchanged.
   ```

6. Fill only the three placeholders in a review copy of
   `supabase/sdp/verification/002_sdp_hybrid_read_only.sql`:
   `<APPROVED_TEST_REF>`, `<PROTECTED_DEMO_REF>`, `<APPROVED_MANIFEST_SHA256>`.
   Submit that read-only transaction after separate approval for hosted validation.
   Record sanitized results and actual target in the deployment ledger.
7. Enable/verify the new project's Data API `public` exposure if still disabled,
   without enabling automatic grants. Keep all runtimes stopped.

Expected initial result: nine SDP tables with RLS enabled; one SELECT policy on
each of six data tables; no policies/browser access on the three control tables;
zero runs, leases, reader ACLs, frames, events and samples; matching marker;
zero integrity violations. `sdp_hybrid_info()` through the future guarded backend
must report the approved marker and `hybrid_only=true`.

001/002/003 are separate transactions, not one atomic installation. An error rolls
back that file, not earlier successful files. Stop on error, record which steps
committed, and review before retry; these migrations are not idempotent.

### Compatibility, security and active-run restrictions

- 002 widens versioned contracts without rewriting historical measurements. New
  hybrid values/receipt times may be null; legacy synthetic rules remain protected
  by mode triggers and the guarded legacy commit wrapper. Forecasts and applied
  output remain explicitly simulated. No physical HVAC path is introduced.
- Hybrid rows are visible to an authenticated user only when explicitly allowed
  for that exact ACTIVE run. Archived runs are hidden even from that run's former
  dashboard reader. Existing ACTIVE synthetic rows remain publicly readable under
  001+002. The private preview also pins the expected hybrid run/model/origin.
- The private marker, reader ACL and leases have no browser table access.
  Privileged RPCs have fixed search paths and explicit execution grants; the
  secret-key backend cannot write tables directly through the granted role.
- 003 revokes `service_role` execution on `sdp_initialize_run(jsonb)` and
  `sdp_commit_tick(jsonb)`. It requires the exact marker/settings and refuses **any
  scripted run**, archived or active. It never belongs on the existing demo.
- Initialization creates a SEEDING run; the first complete hybrid commit activates
  it. If another run is ACTIVE, replacement requires its exact UUID in the new
  immutable definition. Keep replacement null on this first clean target. A later
  approved replacement archives the former ACTIVE run without deleting history;
  it also changes which run browser readers can see.
- Never seed synthetic runs into this locked-down target. Preserve synthetic
  compatibility through existing local regression/parity tests and leave the
  stable demonstration's project/process/configuration untouched. No second
  hosted compatibility project is planned for this prototype. Do not claim new
  hosted synthetic migration coverage or regrant legacy writes here.

## 5. Private Auth setup — future approval D

Only on the approved new project:

1. Enable email/password sign-in. Disable public new-user signups and anonymous
   sign-ins; leave unused providers off. Keep email confirmation required for
   ordinary signup rather than weakening it globally. Configure Site URL as
   `http://127.0.0.1:5178` and only that exact test redirect origin if needed.
   The current flow uses password login, not an email callback. See
   [Auth configuration](https://supabase.com/docs/guides/auth/general-configuration).
2. Create two dedicated confirmed accounts: intended reader A and unrelated
   authenticated reader B. Use Auth Users' administrative create-user flow with
   confirmation, or a separately reviewed server-only
   [admin createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser)
   operation with `email_confirm: true`. Do not send invitations/emails as part
   of this procedure. Keep passwords in a private manager; record only user UUIDs
   in the approval evidence. Disable no confirmation setting on the stable project.
3. Auth creation alone grants neither user hybrid data. After the approved existing
   supervisor initializes the exact physical run, the owner may grant A access
   explicitly while the single supervised runner continues:

   ```sql
   INSERT INTO public.sdp_hybrid_readers (run_id, user_id)
   VALUES ('<APPROVED_RUN_UUID>'::uuid, '<READER_A_AUTH_UUID>'::uuid);
   ```

   Do not add B. The run FK means this cannot precede run initialization. Check
   the UUID belongs to the new project's Auth user; no wildcard membership exists.
4. A separate private preview process uses its approved manifest, exact origin and
   **new project's publishable key**. Do not rebuild/reconfigure the deployed demo.
   Future command, only after preview approval and private process configuration:

   ```powershell
   npm --prefix apps/dashboard run dev -- --port 5178 --strictPort
   ```

5. Before login, no dashboard data readers should mount. Verify wrong credentials,
   login A/B, refresh, logout and expiry; browser session persistence is disabled.
   A login form is not an RLS boundary: direct HTTP tests below remain mandatory.

## 6. Environment separation and secret placement

Do not change current `.env` files or configure any live values during preflight.
Use dedicated, short-lived child-process environments supplied by a private secret
manager/secure launcher. Store non-secret manifests separately from secrets. Avoid
literal secret values in shell commands/history, transcripts, reports, Git, screenshots
or `VITE_*`. Do not enumerate environment values to diagnose configuration.

| Consumer | Exact variables / future configuration |
| --- | --- |
| Writer gate | `HYBRID_ENABLE_WRITES=false` throughout preflight; future explicit writer approval is required for `true` |
| Writer identity | `HYBRID_ENVIRONMENT_KIND=ISOLATED_TEST`, `HYBRID_EXPECTED_PROJECT_REF`, `HYBRID_PROTECTED_PROJECT_REF`, `HYBRID_SUPABASE_URL`; all must equal approved manifest |
| Writer secret | `HYBRID_SUPABASE_SECRET_KEY`: only the new project's private `sb_secret_...`, injected into that server process; legacy JWT backend keys are rejected |
| Writer manifest | CLI `--manifest <ABSOLUTE_MANIFEST_PATH>` and `--confirm <APPROVED_TEST_REF>` are required in addition to `--live`; no live command is executed in this stage |
| MQTT gate | `HYBRID_MQTT_ENABLE=false` throughout preflight; future ingestion approval required for `true` |
| MQTT transport | Future only: `MQTT_BROKER_URL=mqtts://<existing-host>:8883`, `MQTT_USERNAME`, `MQTT_PASSWORD` from existing authorized configuration, without editing it; credentials remain separate from the URL |
| MQTT inventory | Future only: `HYBRID_NODE_IDS=demo-1,demo-2`, `HYBRID_FULL_ZONE_COVERAGE` exactly matches the approved manifest (false unless physically validated); leave optional `HYBRID_STALE_AFTER_MS` / `HYBRID_DISCONNECTED_AFTER_MS` absent or exactly 90000/180000; live writer rejects other thresholds |
| Diagnostic cadence | Optional `HYBRID_DIAGNOSTIC_INTERVAL_MS` applies to diagnostic runner output, not writer scheduling; not needed for preflight |
| Private preview process | `VITE_HYBRID_PRIVATE=true`, `HYBRID_MANIFEST_PATH=<ABSOLUTE_MANIFEST_PATH>`, `VITE_SUPABASE_URL=<APPROVED_TEST_ORIGIN>`, `VITE_SUPABASE_PUBLISHABLE_KEY=<NEW_PROJECT_PUBLISHABLE_KEY>` |
| Auth test credentials | Reader A/B passwords and short-lived access tokens stay private/in memory; these are not runtime environment variable names or manifest fields |
| SQL owner password / connection | Private operator store only; SQL Editor deployment needs no connection string in the app |

The preview accepts `sb_publishable_...`; backend secrets must never reach its
process or bundle. Supabase distinguishes [publishable and secret keys](https://supabase.com/docs/guides/getting-started/api-keys);
the latter bypass RLS, so keep them server-only even with the narrower SQL grants.

Build a child environment from an explicit allowlist (needed OS/tool paths plus
only that process's test variables), rather than inheriting an entire demo shell.
Exclude legacy `SUPABASE_*`, `DATABASE_URL`, PostgreSQL connection defaults,
unrelated `VITE_*`, dotenv preloads/`NODE_OPTIONS`, and startup tasks. Keep writer
and preview secrets separate. Neither the hybrid CLI nor private Vite mode loads
the synthetic dotenv file. Never use generator `npm start` for this integration.

Scope of protection: guarded hybrid requests pin canonical origin, RPC paths,
registry/manifest/hash, marker and lockdown; redirects are blocked. Private preview
pins origin/run/model. Generic SQL tools, the original synthetic runner and an
administrator editing trusted code are outside those guards. They cannot be
certified safe merely by setting environment variables. Keep them out of this
deployment path and never give the new test process protected-project credentials.

## 7. Hosted validation procedure — future approval E

### Empty target first

Run the owner read-only verification after migration and check every grant, not
only RLS flags. Confirm `public` schema usage, PostgREST RPC discovery and foreign-key
joins. Expected six data tables grant SELECT to anon/authenticated only; none of
the three application roles can write tables. Controls grant none. Legacy write
RPC execution must be false for all three after 003. Browser roles must not execute
privileged/internal RPCs. If GraphQL is exposed, verify its reads obey the same
RLS; do not introduce a bypass view or broad grants for troubleshooting.

An empty-table anonymous result does **not** prove privacy. Populated ACTIVE-run
API tests are required next. SQL Editor owner results and local `SET ROLE` tests
do not substitute for real Supabase Auth JWT requests.

### Controlled physical bootstrap using the existing supervisor

No new persistence test program is required. After migration/catalog checks and
explicit approval for this exact live test, configure the existing runner with
the approved manifest, new project's server secret and existing MQTT settings in
its own private process environment. This approval covers **both** MQTT ingestion
and isolated database writes, with an operator and stop deadline named in advance.
Only at this point set `HYBRID_ENABLE_WRITES=true` and `HYBRID_MQTT_ENABLE=true`.
Match `HYBRID_FULL_ZONE_COVERAGE` to the reviewed manifest; no other configuration
or default needs changing.

From the repository root, future launch syntax (not executed in this revision):

```powershell
npm --prefix services/sdp-generator run hybrid:run -- --live --manifest '<ABSOLUTE_MANIFEST_PATH>' --confirm '<APPROVED_TEST_REF>'
```

The supervisor verifies the marker and effective legacy-RPC lockdown, initializes
or reloads this exact immutable run, acquires its exclusive lease, then connects
MQTT. It evaluates actual receipts through the existing adapter/fusion/policy and
commits complete transactional snapshots. Observe `HYBRID_STARTED` and
`MQTT_SUBSCRIBED`, but treat them only as startup/subscription success. Confirm
NODE_EVIDENCE and original receipts for **each** node in the stored records to
prove telemetry reception. Initial missing-node frames are allowed and must have
null measurements; they are not hardware observations.

Keep this as the **only writer for the isolated project/run**. No synthetic
generator, fixture publisher, second supervisor or scheduled job targets it.
The original synthetic generator may keep running against its original separate
project. Do not intentionally start a competing supervisor to test lease denial;
check one current owner in the existing verification SQL and retain offline
contention/fencing tests as evidence for the prototype.

Once a complete populated frame exists, grant A its exact run ACL using the SQL
in section 5, carry out the access matrix's essential checks below, and only then
open the private Dashboard preview. Thus real physical snapshots supply the
positive data needed for meaningful RLS tests, without a fixture run or an ACTIVE
replacement. If any essential check fails, Ctrl+C the isolated runner and stop
the preview. Do not alter permissions to make a failing test appear successful.

For restart testing, Ctrl+C, reconcile any already issued request and allow the
60-second lease to expire before launching the **same manifest/run** again. The
lease epoch must advance; persisted sequence/history continue, but current sensing
authority and vacancy continuity start empty until new physical packets arrive.
Restart does not require a new run/marker or another publisher. Queue overflow,
wrong checkpoint or competing authority is a stop-and-investigate condition.

### Auth / HTTP access matrix

Use the new project's publishable key in `apikey`. For an anonymous request omit
Authorization; for A/B send `Authorization: Bearer <their actual short-lived JWT>`
obtained by password sign-in to **this** project's Auth. Never place an
`sb_publishable_...` or `sb_secret_...` value in a Bearer field. Use a reviewed
manual HTTP client, with tokens kept in its private session; do not log
headers/tokens, HAR files or raw auth responses. No automated harness is needed.

For **each** of `sdp_runs`, `sdp_zones`, `sdp_nodes`, `sdp_zone_frames`,
`sdp_node_samples`, `sdp_events`, issue a filtered request:
`GET /rest/v1/<table>?select=*&run_id=eq.<APPROVED_RUN_UUID>&limit=1`.
Also test an unfiltered limited request so omission of a client filter cannot leak
another run. Run the following matrix against real, populated ACTIVE data:

For the first prototype, the essential hosted checks are anonymous denial, B's
denial, A's successful reads, private control-table denial, the absence of browser
write/privileged-RPC grants and effective legacy write-RPC revocation. Check those
grants with the existing owner verification SQL and make direct HTTP requests for
the reader/control cases and representative write/RPC denials. The remaining
session/ACL-removal/archive cases can be manual follow-ups; an ACTIVE replacement
is not required merely to test them. Do not build a new test service or introduce
another writer to exercise this matrix.

| Identity / request | Expected result |
| --- | --- |
| Publishable key without Auth JWT | 200 with no hybrid rows (or explicit permission denial); never hybrid content |
| Authenticated B, no ACL | Same denial/no hybrid rows despite successful login |
| Authenticated A with exact ACL | Nonempty intended ACTIVE run rows; exact node inventory and correlated records |
| A/B/anonymous selecting environment/readers/leases | Permission denied; never marker, ACL or lease contents |
| A/B/anonymous INSERT/PATCH/DELETE data/control tables | Permission denied, no mutations |
| A/B/anonymous executing privileged hybrid/legacy/internal RPCs | Permission denied, no initialization, lease or commit |
| Server secret calling legacy write RPCs after 003 | Permission denied; do not grant them back |
| Server secret using guarded `sdp_hybrid_info` | Matching marker and `hybrid_only=true`; then only approved RPC operations |
| Expired/malformed/wrong-project JWT | Authentication failure, never data; sanitize errors |
| A after owner removes its ACL | No hybrid rows on subsequent requests; do not assume sign-out revokes an already issued JWT immediately |
| Former ACTIVE run after separately approved replacement | Browser reads hidden even with old ACL; history still retained for owner inspection |

Test A's ACL removal only with explicit test-write approval, restoring the exact
approved grant afterwards if required. Read helper `sdp_can_read_run(uuid)` is
intentionally executable by browser roles; it must not expose unauthorized data.
Use syntactically valid requests and record status plus sanitized SQL/API error
code: a malformed-query/invalid-payload error is not proof of permission denial.
Successful A reads provide the positive control against a disabled/broken API.
The private preview blocks its own anonymous Data API requests before sending them;
use the direct test client for server-side anonymous-denial proof. Supabase
[RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security)
explains the role/JWT boundary.

### Minimum physical acceptance walkthrough

| Test | Inputs and pass criteria |
| --- | --- |
| Two real nodes | Observe original NODE_EVIDENCE receipts for demo-1 and demo-2. Walk near each device and compare actual source/headcount/BME fields and updates. Equal numbers alone are not a fault, but powering down one node must not stop or refresh the other. Never relabel sim nodes as hardware. |
| Occupied cooling | Valid occupied inference from either physical node yields OCCUPIED with AUTO/24.5. Observe the actual stored decision and correlated simulated output; do not mistake MQTT subscription success for receipt or a physical fan command. |
| Vacancy, conditional | If coverage was validated/approved and both nodes sustain fresh active-empty inference, observe the five-minute confirmation and SHORT_VACANCY/LOW/27. Reoccupy: fresh positive evidence returns OCCUPIED. If these conditions cannot be achieved, mark the vacancy/reduction hardware test NOT DEMONSTRATED; do not force a zero-to-vacant mapping. |
| Independent ageing | Power off only demo-2 for over 180 seconds while demo-1 keeps publishing; demo-2 becomes STALE at 90s and DISCONNECTED at 180s from its last receipt, while demo-1 stays independently fresh when valid. Occupancy remains OCCUPIED if demo-1 observes people, otherwise conservative UNCERTAIN. Power demo-2 back on and require new valid receipts for recovery. |
| Availability | Inspect valid BME readings and naturally occurring inactive/N/A packets. Values unavailable in one field remain null with their validity/source; no borrowed/zero measurements. Missing sensor cases not encountered physically remain covered offline, labelled NOT OBSERVED LIVE. |
| Snapshot integrity | Run the existing owner read-only verification before/after the walkthrough: zero integrity violations; one sample per node per frame; original evidence/receipts, decision/forecast/output links and checkpoint agree at the pinned sequence. One live lease owner, sequences advance without duplicate commands; no unreferenced or future evidence. |
| Dashboard and history | A sees both node IDs/positions, independent histories, correct representative BME availability, occupancy and requested output. Select a historical frame while later data arrives; verify its decision/forecast/output correlations and unknown gaps. Forecast/output provenance stays SIMULATED. |
| CSV | Export ALL records to include NODE_EVIDENCE; verify a small sample against stored IDs, correlation, receipt/evaluation times, nulls and provenance. Keep the file private. Large export stress tests are not required for first light. |
| Stop/restart | After initial success, Ctrl+C, reconcile the last issued transaction, wait for the lease to expire and restart the same run once. Epoch advances, history is retained, new packets are required and downtime does not count as vacancy. No overlapping supervisors. |
| Synthetic preservation | The original project's generator/configuration/deployment remain unchanged and the existing synthetic Dashboard still works. Local synthetic tick/CSV parity remains the regression proof; no synthetic test run is created in the hybrid project. |

For a short prototype session, the initial read-only catalog check plus populated
read checks validate deployed snapshot consistency. They do not independently
prove every rollback/fencing/ambiguous-response failure case. Existing local SQL
and runtime tests remain the evidence for atomic rejection, exact retries,
competing owners, stale epochs, invalid policy transitions and restart recovery.
Do not report those as hosted fault-injection results.

LONG_VACANCY needs 20 minutes of qualified vacancy; PRECOOL additionally needs the
unchanged timetable's eligible restart window and gap. They can be observed in a
longer approved physical session if valid evidence permits. Deterministic
same-forecast comparisons, all policy boundaries and negative transitions remain
existing offline tests, not prerequisites for building a new hosted harness.
Likewise retain local CSV byte parity, pagination/limit/cancellation tests instead
of adding hosted load infrastructure. Build extra tooling only if a concrete
hosted failure cannot be diagnosed with the runner, existing verification SQL,
manual API checks and dashboard.

Expected persisted shape: real IDs in `sdp_nodes`, original gateway receipt in
evidence and sample `observed_at`, independent environmental observed times/nulls,
frame evaluation in `sampled_at` (legacy frame column is still named
`simulated_at`), inference/source/classification metadata in NODE_EVIDENCE, and
transactionally correlated occupancy/decision/forecast/simulated output. No device
acquisition timestamp is available. Declaring two IDs does not prove physical
independence; later real packet captures must demonstrate distinct receipts and
readings without logging credentials.

After the walkthrough rerun the read-only integrity verification. Retain a short
sanitized PASS/FAIL/NOT OBSERVED record with run UUID, sequence range, test identity,
SQL/manifest hashes and timestamps. Distinguish actual ESP32 observations from
existing offline test results; no constructed packets are written in this plan.

## 8. Rollback and failure handling

Before runtime approval there should be no writer/MQTT process to stop. Failed
identity, manifest, hash, grant or Auth checks mean stop and leave the stable
demonstration alone. Do not soften guards, regrant legacy writes or overwrite the
marker to continue.

On SQL error, inspect transaction status and the deployment ledger before retry.
Use ROLLBACK only to clear that failed session if needed; it cannot undo an earlier
COMMIT. There is no reviewed destructive down migration. For a broken disposable
installation, prefer a newly approved empty test project and new identity approval.
Do not run DROP/TRUNCATE, automatically delete projects, remove test history or
restore over another project.

After a future approved writer test, stop only its process and private preview;
await/reconcile its one issued request and natural lease expiry. Retain required
private exports/backup. Restore only the isolated target from its approved restore
point, or rebuild a fresh isolated target after approval. A replacement/restore
changes the target/run approval as applicable. Never manually reflag ACTIVE rows
or use the existing synthetic generator as a rollback writer.

## 9. Final preflight and explicit approval gates

- [ ] New project creation, organization/region/plan and retention approved (A).
- [ ] Real account-selected identity cross-checked; target distinct from every
  protected reference; non-secret verification record reviewed (B).
- [ ] Manifest complete; exact-byte digest approved in fixed registry; local
  loader and all three hashes pass; no credential included (B).
- [ ] New empty-project owner precheck, **001 → 002 → marker → 003**, Data API
  exposure and exact target-specific SQL approved (C).
- [ ] Dedicated confirmed A/B users, new-project Auth settings and later exact
  run ACL provisioning approved; no invitations sent (D).
- [ ] Hosted read-only catalog/API verification approved; no automated hosted
  fixture harness or additional test project is needed (E).
- [ ] Separate private preview approved with test publishable key and exact port;
  real Auth/RLS tests pass before claiming private dashboard readiness (D/E).
- [ ] Existing local regression/parity results retained; no legacy write regrant
  or synthetic run in the hybrid-only project (E).
- [ ] **Gate F before physical bootstrap:** MQTT ingestion and the sole Hybrid
  Writer separately approved for exact manifest/run, operator and stop deadline,
  reviewed coverage, matching marker and `hybrid_only=true`. Use this runner for
  populated RLS and end-to-end validation; no fixture publisher precedes it.
- [ ] Any replacement ACTIVE run, backup restore, project deletion, key rotation
  or production cutover requires its own explicit approval; none is part of 3D.

The next milestone is **A/B: an approved, independently verified isolated target**.
Migrations and live writer/MQTT activation remain stopped until explicit approval.
