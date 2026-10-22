# Stage 3D — target-specific preparation: onfzcxtejvxpcppcvkgk

Date: 23 October 2026 (Malaysia). Local inspection: 2026-10-22T18:52:53.183Z.
Authenticated identity follow-up: 2026-10-22T18:58:32Z (02:58 MYT, 23 October).
Operator Data API change verified: 2026-10-22T19:02:22Z (03:02 MYT, 23 October).
Manifest candidate finalized with the operator's current-time choice:
2026-10-22T19:04:19.000Z (03:04:19 MYT, 23 October).
Branch: `feature/esp32-hybrid`.

**Status: IDENTITY VERIFIED; CONFIGURATION / MANIFEST NOT APPROVED.
Hosted SQL and live runtime startup remain NO-GO.**
This applies the simplified [Stage 3D runbook](ESP32-HYBRID-STAGE-3D-PREFLIGHT.md)
to the supplied candidate. It does not authorize a migration or claim an exclusive
ownership/security audit. No hosted SQL, application/database configuration change,
MQTT connection, writer startup, push or merge was performed by the agent. The
operator's new-project automatic-exposure change is recorded below.

## 1. Authenticated identity evidence and remaining setup

| Check | Result |
| --- | --- |
| Verified project name | `omnisense-hybrid-test`, observed in the signed-in Supabase Dashboard |
| Verified reference | `onfzcxtejvxpcppcvkgk`; account project selector, overview path and General settings Project ID agree |
| Verified API origin | `https://onfzcxtejvxpcppcvkgk.supabase.co`; visible in authenticated overview; Data API overview confirms the same origin with `/rest/v1/` |
| Organization and region | Universiti Malaya (`avadegsqhqejvtdxxkul`), Northeast Asia (Tokyo), `ap-northeast-1`; NANO / Free organization shown |
| New-project health and versions | Healthy; General settings shows PostgreSQL 17.11.0.003, PostgREST 14.18, Auth 2.197.0. No repository connected, no recorded migrations/backups shown; this is not an owner SQL empty-schema check. |
| Supabase connector / CLI | No Supabase connector was exposed; no installed `supabase` executable was found on the current shell PATH |
| Authenticated browser check | Initial attempt redirected to sign-in. After the operator signed in privately, independently read the project selector, both project overviews, new-project General settings and Data API overview/settings. No tokens/cookies were read. |
| Protected SDP project | Authenticated organization selector lists `omnisense-sdp` at `uaqblatyabykhghiqecp`; its loaded overview confirms name, origin `https://uaqblatyabykhghiqecp.supabase.co`, organization and Healthy status. Only its overview was read. |
| Isolation from original demo | **VERIFIED distinct project IDs/origins**: `onfzcxtejvxpcppcvkgk` differs from `uaqblatyabykhghiqecp`. Both are separate projects in the same organization; this does not audit all deployed client environments. |
| New Data API | Enabled; exposed schemas selector shows `public` / `graphql_public` (2 of 2); no tables/functions available in selector; max rows 1000. No schema/query was executed by this agent. |
| Automatic exposure | **Verified OFF after the operator reported saving the change.** Authenticated new-project settings shows switch value 0 and disabled Save/Cancel (no pending edits). Data API overview separately confirms Enable Data API remains ON and the same target REST origin. No setting was changed by the agent. |
| Platform advisory | A Supabase-wide technical-issue banner was present while both projects individually showed Healthy. Reassess relevant service health before hosted execution; the banner does not invalidate the identity comparison. |
| Active approval registry | Unchanged: `approved: []`; no candidate approval registered |

Public DNS/TLS availability, a matching URL string or a self-written database
marker would not replace authenticated project verification. No attempt was made
to obtain browser cookies, access tokens, passwords or secret keys.

Next steps, with no migrations or changes to the existing demo:

1. Completed: the operator disabled Automatically expose new tables and saved;
   the agent verified OFF on `onfzcxtejvxpcppcvkgk`. This changes automatic grants
   in the new project's configuration; it is not a versioned migration.
2. Completed: read-only follow-up confirms Data API remains enabled at the expected
   origin. Leave `public` exposed. The reviewed migrations explicitly control
   table/function grants. Existing GraphQL exposure must obey the same effective
   grants/RLS; verify that after migration. Do not use Harden Data API to change
   the schema architecture.
3. Completed: operator chose current time for the manifest; the candidate's exact
   bytes and registry-entry proposal are now finalized and hashed below. Pending:
   review node positions/representative/coverage, explicitly approve registry
   registration, then separately approve the exact SQL sequence. No keys or
   passwords are needed in chat.

## 2. Prepared files and finalization

Draft manifest:
[`hybrid-target.onfzcxtejvxpcppcvkgk.draft.json`](../../services/sdp-generator/deployment/hybrid-target.onfzcxtejvxpcppcvkgk.draft.json).
Draft registry entry:
[`hybrid-target.onfzcxtejvxpcppcvkgk.registry-entry.draft.json`](../../services/sdp-generator/deployment/hybrid-target.onfzcxtejvxpcppcvkgk.registry-entry.draft.json).

These are complete **review candidates**, not active approval; their filenames
retain `.draft` to make that distinction visible. Both include the authenticated
protected reference `uaqblatyabykhghiqecp`; no unresolved field remains. The
operator chose the current UTC time, recorded as
`live_anchor=2026-10-22T19:04:19.000Z` (23 October 2026, 03:04:19 MYT).

Exact manifest-byte SHA-256:

```text
c3089fa380256437d7ef2049b5b60769d0b0234e4f069982505839b32fa24cb1
```

That digest is in the prepared three-field registry entry. The active registry
remains `approved: []`; the normal loader must still reject this candidate. Do
not register it until the operator explicitly approves this exact manifest.

Proposed run UUID: `de585067-a340-471c-b990-d0ee6004cde3`, generated locally only;
no corresponding database run was initialized. Review the proposed inventory
`demo-1`/`demo-2`, labels, representative `demo-1`, coordinates (0.3,0.5)/(0.7,0.5)
and preview origin `http://127.0.0.1:5178`. Coordinates are draft display positions,
not verified physical coverage. Coverage remains false and replacement is null.

The anchor is the earliest accepted evidence/evaluation time, not evidence that a
writer was started then. A later startup must use actual later gateway receipts;
no measurements, snapshots or vacancy continuity are backfilled into the gap.
The run remains uninitialized. Registry approval alone also starts nothing.

Review all fields and add any other known protected references before approval.
Any content edit requires recalculating the exact-byte digest and registry entry;
changing only the path does not change the bytes. Do not add a self-hash or secrets.
The prepared registry entry is:

```json
{
  "manifest_sha256": "c3089fa380256437d7ef2049b5b60769d0b0234e4f069982505839b32fa24cb1",
  "project_ref": "onfzcxtejvxpcppcvkgk",
  "protected_project_ref": "uaqblatyabykhghiqecp"
}
```

Only after explicit manifest-registration approval may that entry be added to the
fixed `services/sdp-generator/deployment/approved-hybrid-targets.json`. Existing
approvals must be preserved. No entry was added during this preparation.

Only a finalized, reviewed and registered manifest may pass the existing loader;
the local loader/hash check in the main runbook performs no network operation.
Changing any manifest bytes invalidates the approval. Do not initialize a run
until the configuration is final: inventory, coverage and anchor are immutable.

## 3. Exact migration SHA-256 verification

Fresh local file hashing matches the Stage 3C/3D reviewed values:

| SQL file | SHA-256 |
| --- | --- |
| [001_sdp_foundation.sql](../../supabase/sdp/migrations/001_sdp_foundation.sql) | `d850d4ccd9db9587af587f290e3ba35ce6d2fd2d38755244bdceb7fcb083ac2b` |
| [002_sdp_hybrid.sql](../../supabase/sdp/migrations/002_sdp_hybrid.sql) | `c007fa7042dacad38d60420d7ec0e267e72902d52202aa1b559ab4a31d80a7f4` |
| [003_sdp_hybrid_isolated_lockdown.sql](../../supabase/sdp/migrations/003_sdp_hybrid_isolated_lockdown.sql) | `c10beafccfbb957f970b9b483fd5dae9741abeb586977ef6c08091e199eb62b1` |

These certify local file bytes, not any hosted schema. No SQL was executed.
Recompute before deployment; stop if any hash differs. Do not regenerate or edit
SQL, or normalize line endings, after approval.

Offline checks passed: both candidate files parse as JSON, UTC anchor and distinct
verified references are valid, node inventory and registry digest match, all
three migration digests match actual files, the active registry remains empty,
and the real manifest loader rejects the unapproved candidate.
Whitespace checks and `git diff --check` passed. No runtime or SQL tests were run
in this preparation step.

## 4. Required secure configuration — proposal only

The inspected tool process has the relevant HYBRID, MQTT and private-preview
variables UNSET. No active `.env`/`.env.local` was found at the repository root,
`apps/dashboard` or `services/sdp-generator`; repository dotenv discovery returned
example templates only. This is not an audit of other terminals, running services,
deployment hosts or the existing synthetic generator's effective environment.
No environment file or variable was changed.

Prepare separate private child-process configurations after identity review:

| Process / variable | Required proposed value |
| --- | --- |
| Writer `HYBRID_ENABLE_WRITES` | `false` until separate explicit runtime approval |
| Writer `HYBRID_ENVIRONMENT_KIND` | `ISOLATED_TEST` |
| Writer `HYBRID_EXPECTED_PROJECT_REF` | `onfzcxtejvxpcppcvkgk` |
| Writer `HYBRID_SUPABASE_URL` | `https://onfzcxtejvxpcppcvkgk.supabase.co` |
| Writer `HYBRID_PROTECTED_PROJECT_REF` | `uaqblatyabykhghiqecp`, independently read from the authenticated project selector and overview |
| Writer `HYBRID_SUPABASE_SECRET_KEY` | This new project's `sb_secret_...`, privately injected into the writer process only; never a browser value, chat message, committed file or command-line literal |
| Writer manifest | Explicit `--manifest` path to the future final approved file and `--confirm onfzcxtejvxpcppcvkgk`; no startup command is authorized now |
| MQTT `HYBRID_MQTT_ENABLE` | `false` until explicit ingestion approval |
| MQTT `HYBRID_NODE_IDS` | `demo-1,demo-2` |
| MQTT `HYBRID_FULL_ZONE_COVERAGE` | `false`, matching this draft; true only after separate physical validation/review before final run initialization |
| MQTT timing | `HYBRID_STALE_AFTER_MS=90000`, `HYBRID_DISCONNECTED_AFTER_MS=180000`, or leave both absent for those defaults |
| MQTT transport/secrets | Existing authorized `MQTT_BROKER_URL` using mqtts/TLS:8883, `MQTT_USERNAME`, `MQTT_PASSWORD`; no firmware or broker credential changes, no secrets in the URL |
| Preview `VITE_HYBRID_PRIVATE` | `true` only in its dedicated future private-preview process |
| Preview `HYBRID_MANIFEST_PATH` | Absolute path to the same future final approved manifest |
| Preview `VITE_SUPABASE_URL` | `https://onfzcxtejvxpcppcvkgk.supabase.co` |
| Preview `VITE_SUPABASE_PUBLISHABLE_KEY` | This new project's `sb_publishable_...` only; privately configure without displaying its value |
| Auth users | Dedicated confirmed reader A and unrelated B, in the new project only; passwords remain private; exact run ACL granted only to A after initialization |

Use an explicit allowlist for each child's environment. Do not inherit production
credentials, generic `SUPABASE_*`, `DATABASE_URL`, PG connection defaults, unrelated
`VITE_*`, or dotenv preloads. Do not overwrite existing demo configuration. The
hybrid writer and private preview already pin target/manifest identity; the writer
also checks marker/lockdown and permitted RPC paths. Generic CLI/SQL tools are
outside those protections, so do not use a linked `supabase db push` or synthetic
`npm start` for this target.

Until secrets are supplied privately to the future processes and that effective
configuration is checked, this report cannot certify their key provenance or
runtime environment. It approves no secret and changes none.

## 5. Final proposed migration sequence — approval required, not executed

Keep the full file contents unchanged, with the hashes above. Before every future
SQL Editor submission verify the authenticated selected project is
`onfzcxtejvxpcppcvkgk`. Do not execute while automatic exposure is enabled, the
manifest/registry review is incomplete, or target-specific migration approval is absent.

1. After explicit target-specific approval, perform the runbook's owner read-only
   empty-project/baseline-role check. An unexpected schema or existing run is a
   stop condition. Do not delete or repair objects automatically.
2. Apply the entire **001_sdp_foundation.sql** once.
3. In one submission prefix the complete **002_sdp_hybrid.sql** with:

   ```sql
   SET omnisense.hybrid_migration_approved = 'ISOLATED_TEST';
   -- Follow with full hash-reviewed 002, unchanged.
   ```

4. Provision the private marker once as owner, after final manifest approval:

   ```sql
   BEGIN;
   INSERT INTO public.sdp_hybrid_environment
     (singleton, kind, project_ref, protected_project_ref, manifest_sha256)
   VALUES (true, 'ISOLATED_TEST', 'onfzcxtejvxpcppcvkgk',
     'uaqblatyabykhghiqecp', 'c3089fa380256437d7ef2049b5b60769d0b0234e4f069982505839b32fa24cb1');
   COMMIT;
   ```

   The marker digest is the **final manifest** digest, not a SQL digest. Do not
   upsert over an existing marker. This concrete proposal is still not authorized
   for execution; any manifest change requires updating this digest too.
5. In one submission prefix the full unchanged **003** with:

   ```sql
   SET omnisense.hybrid_isolated_lockdown_approved = 'ISOLATED_TEST';
   SET omnisense.hybrid_target_ref = 'onfzcxtejvxpcppcvkgk';
   SET omnisense.hybrid_protected_ref = 'uaqblatyabykhghiqecp';
   SET omnisense.hybrid_manifest_sha256 = 'c3089fa380256437d7ef2049b5b60769d0b0234e4f069982505839b32fa24cb1';
   -- Follow with full hash-reviewed 003, unchanged.
   ```

   003 must find the matching isolated marker and no scripted runs. It revokes
   the two legacy writer RPC grants only in this new project. No synthetic
   compatibility run or second test project is needed by the simplified approach.
6. After approval, run the existing
   [read-only verification SQL](../../supabase/sdp/verification/002_sdp_hybrid_read_only.sql)
   with its three placeholders filled from verified references/final manifest hash.
   Expect nine RLS-enabled SDP tables, correct SELECT policies/private controls,
   effective legacy-RPC denial, matching marker, zero runs/leases/ACLs and zero
   integrity violations. Check Data API public exposure without automatic grants.
7. Configure new-project Auth and approve the separate bounded physical runtime
   session later. No writer or MQTT command is part of migration approval.

Each migration is a separate transaction. A failure does not undo earlier files;
stop and reconcile the deployment ledger rather than reapplying successful files.
There is no destructive down migration. Keep the existing demo untouched; restore
or rebuild only disposable test resources with separate approval if ever needed.

## 6. Approval checklist and next action

- [x] Branch confirmed `feature/esp32-hybrid`.
- [x] Supplied reference/origin format and mutual consistency checked locally.
- [x] Exact local 001/002/003 hashes recomputed and copied into draft manifest.
- [x] Draft manifest and registry proposal prepared; active registry stays empty.
- [x] Runtime gates remain unset/disabled; no secrets requested or disclosed.
- [x] Authenticated new project name/organization/reference/origin/health verified.
- [x] Authenticated `omnisense-sdp` reference/origin recorded and distinct.
- [x] New-project automatic exposure disabled/saved and rechecked; no changes to
  the protected project. Add any other protected projects if applicable.
- [x] Operator's current-time choice applied; complete manifest candidate and
  registry-entry proposal saved and hashed. No active registration performed.
- [ ] Node positions, representative, coverage and exact manifest reviewed and
  explicitly approved for registry registration.
- [ ] Explicit approval for **this exact target**, final manifest digest and
  **001 → 002 → marker → 003**, plus agreed owner verification/Auth steps.
- [ ] Separate approval for one supervised physical MQTT/writer session and
  private preview; only that writer may target the isolated project/run.
- [ ] During that later session: real receipts from both nodes, populated-data
  anonymous/B denial and A success, zero snapshot integrity violations, independent
  staleness/recovery, Dashboard/history/CSV and honest cooling results verified.

**Next action:** review this exact manifest candidate and approve **manifest
registration only**, or request changes. Proposed positions/representative remain
as above, coverage false and replacement null. After registration, rerun the
normal loader/hash check and obtain separate explicit approval for the target and
**001 → 002 → marker → 003** plus agreed owner precheck/verification. SQL, Auth
provisioning, MQTT and writer startup remain unapproved and unperformed. No change
to the original SDP project is required.
