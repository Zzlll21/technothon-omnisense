# Stage 3D — isolated SQL migration results

Date: 23 October 2026 (Malaysia). Branch: `feature/esp32-hybrid`.
Target: `omnisense-hybrid-test` / `onfzcxtejvxpcppcvkgk`.
Protected synthetic project: `uaqblatyabykhghiqecp`.

**Result: 001, 002, the environment marker and 003 committed successfully.
Read-only post-migration verification passed. Work stopped before Auth or runtime
activation.** No correction, retry of a successful migration or substitute SQL
was needed. The protected project was not opened, queried or modified in this run.

This records execution under the user's explicit target-specific migration
approval, following the [reviewed OWNER-PRECHECK package](ESP32-HYBRID-STAGE-3D-OWNER-PRECHECK.md).
The earlier package's pending-migration status is historical; this report records
the resulting installation. The [raw result evidence](evidence/STAGE-3D-MIGRATION-RESULTS.json)
contains the repeated precheck, execution ledger and all 18 verification result sets.

## Preconditions repeated before the first write

- Signed-in Dashboard/SQL Editor identified `omnisense-hybrid-test` in Universiti
  Malaya and the exact `/dashboard/project/onfzcxtejvxpcppcvkgk` path. The project
  overview showed the matching API origin and Healthy status. No other project
  was selected or targeted.
- Data API settings showed Automatically expose new tables OFF, with disabled
  Save/Cancel and no pending edits. The exposed schema count was 2 of 2, consistent
  with the reviewed configuration. No setting was changed by the agent.
- The normal approved-manifest loader and exact migration-file hash verification
  passed. SQL files were also read directly from disk and hashed again in the UI
  execution session before their unchanged contents were pasted.
- The original read-only owner precheck was rerun immediately before migration.
  All 32 results matched the reviewed baseline: postgres owner/session, read-only
  transaction, required schema/language privileges, three API roles and auth.uid()
  / core SHA-256 availability; zero public relations/functions/SDP objects; no
  legacy sensor_readings and no CLI migration ledger.

Approved and reverified digests:

| Artifact | SHA-256 |
| --- | --- |
| Registered manifest | `c3089fa380256437d7ef2049b5b60769d0b0234e4f069982505839b32fa24cb1` |
| 001_sdp_foundation.sql | `d850d4ccd9db9587af587f290e3ba35ce6d2fd2d38755244bdceb7fcb083ac2b` |
| 002_sdp_hybrid.sql | `c007fa7042dacad38d60420d7ec0e267e72902d52202aa1b559ab4a31d80a7f4` |
| 003_sdp_hybrid_isolated_lockdown.sql | `c10beafccfbb957f970b9b483fd5dae9741abeb586977ef6c08091e199eb62b1` |

## Committed steps

Times are when successful completion was recorded, not PostgreSQL commit timestamps.
All four steps displayed `Success. No rows returned` in the target's SQL Editor.

| Step | Observed completion UTC | Result |
| --- | --- | --- |
| Full unchanged 001 | 2026-10-22T19:26:54.275Z | SUCCESS, committed |
| ISOLATED_TEST session acknowledgement + full unchanged 002 | 2026-10-22T19:27:38.891Z | SUCCESS, committed |
| Exact owner marker INSERT from reviewed package | 2026-10-22T19:28:08.232Z | SUCCESS, committed |
| Exact four target/hash session safeguards + full unchanged 003 | 2026-10-22T19:28:55.845Z | SUCCESS, committed |

SQL Editor displayed its generic destructive-operation warning for 002, consistent
with the reviewed constraint/policy replacements. Execution was confirmed under
the user's exact approval of that migration; no contents were changed. It did not
produce a SQL error. Each migration retained its own BEGIN/COMMIT boundary; no
outer transaction was introduced.

The 002 acknowledgement and 003 prefix were in their respective single
submissions. Marker SQL and 003 safeguard values came from the reviewed package.
The installed marker was independently verified as exactly one matching row:

```json
{
  "singleton": true,
  "kind": "ISOLATED_TEST",
  "project_ref": "onfzcxtejvxpcppcvkgk",
  "protected_project_ref": "uaqblatyabykhghiqecp",
  "manifest_sha256": "c3089fa380256437d7ef2049b5b60769d0b0234e4f069982505839b32fa24cb1"
}
```

This was manual SQL Editor installation. The reviewed files do not create/update
a Supabase CLI migration ledger; dashboard CLI migration-history counts are not
the installation proof. The catalog results and execution ledger below are the
record of what was applied. Do not rerun these successful files.

## Read-only post-migration results

Executed the complete existing
[`002_sdp_hybrid_read_only.sql`](../../supabase/sdp/verification/002_sdp_hybrid_read_only.sql),
replacing only its three documented placeholders with the approved references and
manifest digest. The source file itself was not edited. Source SHA-256:
`f136231ba6d34f456bf35f3607ffee68633b1f9038788992f786e636c18fd6f1`.

The editor exposed only the last SELECT result of the full script. Each unchanged
SELECT was therefore also inspected individually, with the same read-only
transaction/ROLLBACK wrappers, to capture every result set. No verification logic
or migration was regenerated. Verification completed around
2026-10-22T19:36:20.574Z (03:36 MYT, 23 October). The context query reported
database `postgres`, SQL role `postgres`, PostgreSQL `17.11`, server time
`2026-10-22 19:36:05.900598+00`.

| Verification | Actual result |
| --- | --- |
| Environment marker | `pass=true`; exactly one row matches kind, both references and manifest hash |
| SDP tables | 9; all have RLS enabled |
| Data-table policies | 6 SELECT policies, all scoped through `sdp_can_read_run(run_id)` to anon/authenticated; no write policies |
| Private control policies | 0 on environment, leases and reader ACLs |
| Effective table-role grants | 27 combinations checked; 12 SELECT grants on the six data tables for anon/authenticated; all nine service_role table SELECT grants false; all INSERT/UPDATE/DELETE/TRUNCATE grants false |
| Effective function-role grants | 45 combinations checked; read helper only to anon/authenticated; six intended public backend RPCs only to service_role; internal helpers inaccessible to all three roles |
| Legacy writer RPCs | sdp_initialize_run(jsonb) and sdp_commit_tick(jsonb): execution false for anon, authenticated and service_role |
| Function search paths | Every inspected function has `search_path=pg_catalog, pg_temp` |
| Constraints | 55 definitions recorded, including versioned mode/history/clock, measurement/identity, keys and causal FKs |
| Mode guards | 3 triggers, each invoking _sdp_mode_guard(): events, node samples and nodes |
| Indexes | 20 recorded; unique single-ACTIVE-run and command indexes plus evaluation/history indexes present |
| Run status inventory / run checkpoints | Empty / empty; no run initialized or activated |
| Writer leases | Empty |
| Reader ACLs | Empty |
| Node inventory rows | Empty |
| hybrid_frame_inventory | 0 violations |
| hybrid_sample_evidence | 0 violations |
| hybrid_frame_correlation | 0 violations |
| hybrid_checkpoint_receipts | 0 violations |

Because there are no runs, the foreign-key-linked application tables contain no
snapshots/events/samples/zones either. No synthetic or hybrid run was seeded. The
only provisioned application control row is the approved environment marker.

RLS FORCE is false, as expected for the owner/security-definer architecture; RLS
enabled plus explicit grants/policies is the browser boundary. No API browser role
can SELECT private controls or write tables. Catalog privilege verification is
not a substitute for actual populated-data Auth/PostgREST tests.

## Scope, remaining limits and next approval

No Auth user, reader ACL or run was created. No MQTT ingestion, Hybrid Writer,
Dashboard preview/activation, physical HVAC control, credential edit, production
migration, Git push or merge occurred. No additional Supabase test project was
created. The existing synthetic project/process/configuration remained untouched.

There were no precondition, migration or verification failures. The general
Supabase technical-issue banner remained visible, but target health was Healthy
and all approved SQL operations succeeded. No recovery/corrective SQL was applied.

The zero integrity counts validate the empty installed state; they do not establish
real snapshot persistence, live telemetry compatibility, lease contention/recovery,
occupied/vacant transitions, CSV export or Auth/JWT access in a populated run.
Those remain controlled end-to-end acceptance tests using the existing supervisor
and two physical devices after separate approval. Current manifest coverage is
false, so vacancy-driven cooling reduction remains disabled unless coverage is
physically validated and a configuration/run change is separately reviewed.

**Stopped here.** Next approvals remain: dedicated test Auth accounts and private
access setup; then the exact bounded single-writer physical MQTT session and
private Dashboard preview, including populated-data anonymous/B denial and A
success. No runtime activation is implied by successful schema installation.

Local repository changes in this execution step are this report and
`docs/integration/evidence/STAGE-3D-MIGRATION-RESULTS.json`. Migration, manifest,
registry, firmware, generator, Dashboard code and credentials were not edited.
