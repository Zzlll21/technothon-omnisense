# Stage 3D — hosted owner precheck result and migration approval package

Date: 23 October 2026, Malaysia. Hosted results inspected around
2026-10-22T19:17:18Z (03:17 MYT). Branch: `feature/esp32-hybrid`.

**Result: PASS for the read-only owner precheck. Ready for separate migration
approval on this exact isolated target; migrations remain unapproved/unapplied.**

Authorization was limited to read-only hosted precheck operations on
`onfzcxtejvxpcppcvkgk`. No migration, DDL, application data write, role change,
credential change, MQTT connection or writer startup was performed. The protected
synthetic project was not queried or modified during this precheck. SQL Editor
may retain its normal private query/history and service logs; these are not
application database objects or snapshot writes.

## Verified target and local integrity

The signed-in Supabase Dashboard showed `omnisense-hybrid-test`, organization
Universiti Malaya, on the exact project path
`/dashboard/project/onfzcxtejvxpcppcvkgk`. Its authenticated Data API overview
showed `https://onfzcxtejvxpcppcvkgk.supabase.co/rest/v1/`, with Data API enabled.
The SQL Editor stayed on that same project before submission and when reading
results. SQL was never submitted on protected reference `uaqblatyabykhghiqecp`.

The protected project's identity was independently established in the prior
[target review](ESP32-HYBRID-STAGE-3D-TARGET-REVIEW.md). Its actual reference differs
from this isolated target. `current_database()=postgres` is a database name,
not independent cloud project identity; the authenticated Dashboard/account
context supplies that identity boundary.

The normal, unmodified local `loadHybridTarget()` and `verifyMigrationFiles()`
checks passed against the real approved registry before hosted execution:

| Item | Approved SHA-256 / identity |
| --- | --- |
| Manifest target | `onfzcxtejvxpcppcvkgk` |
| Protected reference | `uaqblatyabykhghiqecp` |
| Manifest exact bytes | `c3089fa380256437d7ef2049b5b60769d0b0234e4f069982505839b32fa24cb1` |
| 001_sdp_foundation.sql | `d850d4ccd9db9587af587f290e3ba35ce6d2fd2d38755244bdceb7fcb083ac2b` |
| 002_sdp_hybrid.sql | `c007fa7042dacad38d60420d7ec0e267e72902d52202aa1b559ab4a31d80a7f4` |
| 003_sdp_hybrid_isolated_lockdown.sql | `c10beafccfbb957f970b9b483fd5dae9741abeb586977ef6c08091e199eb62b1` |

No manifest, registry or migration file was changed in this precheck. Any future
byte change requires review before execution. Use the registered manifest at
`services/sdp-generator/deployment/hybrid-target.onfzcxtejvxpcppcvkgk.draft.json`;
the `.draft` filename does not change its registered exact-byte identity.

## Hosted SQL and exact observations

Executed the catalog-only
[owner precheck SQL](../../supabase/sdp/verification/001_sdp_hybrid_owner_precheck.sql)
in the verified target's SQL Editor, using the displayed `postgres` role. It wraps
the SELECT in `BEGIN TRANSACTION READ ONLY`, uses a transaction-local 15-second
statement timeout and ends with `ROLLBACK`. No custom stored function was called;
checks use built-in catalog/privilege functions. The query returned **32 rows**.

The reviewed local query artifact SHA-256 is
`cba451c3982cd9554d474eea63b80ddd3d8958a845207891b3c589a22b4ffca4`.
Results were read from SQL Editor's table and its Copy as JSON action. No keys,
tokens, connection strings or application measurements were retrieved.

| Check | Actual result |
| --- | --- |
| Database | `postgres` |
| Current user / session user | `postgres` / `postgres` |
| Transaction read-only | `on` |
| PostgreSQL server | `17.11` |
| Database owner | `postgres` |
| Current role has owner privileges | `true` |
| CREATE on database | `true` |
| Public schema owner | `pg_database_owner` |
| CREATE / USAGE on public | `true` / `true` |
| USAGE on plpgsql | `true` |
| auth.uid() exists / owner can execute | `true` / `true` |
| Owner USAGE on auth schema | `true` |
| Core sha256(bytea) exists | `true` |
| Required API roles present | `3`: anon, authenticated, service_role |
| Public relations | `0`, list `NONE` (tables, partitioned tables, views, materialized views, sequences and foreign tables) |
| Public functions | `0`, list `NONE` |
| SDP relations / functions | `0` / `0` |
| Legacy public.sensor_readings | Absent (`false`) |
| supabase_migrations.schema_migrations | Absent (`false`) |
| Relations in supabase_migrations schema | `NONE` |

Role attributes returned by the catalog query:

| Role | Superuser | Create role | Bypass RLS | Public USAGE |
| --- | --- | --- | --- | --- |
| postgres | false | true | true | true |
| anon | false | false | false | true |
| authenticated | false | false | false | true |
| service_role | false | false | true | true |

Installed extensions:
`pg_stat_statements:1.11`, `pgcrypto:1.3`, `plpgsql:1.0`,
`supabase_vault:0.3.1`, `uuid-ossp:1.1`.

Non-system schemas:
`auth`, `extensions`, `graphql`, `graphql_public`, `public`, `realtime`,
`storage`, `vault`.

Interpretation: there is no current SDP installation, legacy sensor table or public
application-object collision. No migration ledger exists to enumerate past
version records; absence of the ledger alone is not proof of schema emptiness,
which is why both relation and function catalogs were checked. Built-in Auth,
Storage and other Supabase schemas are expected and must not be removed.

Owner/schema/language privileges and required built-ins support the proposed
migrations. This is a privilege/catalog conclusion, not a claim that DDL was
trial-executed or that all future managed-platform restrictions have been tested.
No object was created to test permissions.

## Limits and checks to repeat before deployment

- The existing SDP tables, snapshot writer RPCs and RLS policies are not installed
  here yet. Their hosted behavior cannot pass an end-to-end test before migration.
  Actual Auth/RLS denial/positive controls, transactional commits and physical
  node tests remain later approval gates.
- New-project automatic exposure was independently verified OFF in the prior
  setup step (03:02 MYT); Data API enabled was observed again in this precheck.
  Reconfirm automatic exposure OFF immediately before migration. Do not enable
  auto grants or use Harden Data API to change the schema architecture.
- The Dashboard still displayed a general Supabase technical-issue banner. The
  read-only hosted query succeeded. Reassess relevant target/service health before
  deployment; do not override a failing migration or broaden grants to continue.
- SQL Editor results and account identity do not audit other terminals or services.
  Keep the original synthetic generator and its configuration untouched. No
  generator or live hybrid process should target the new project during migration.

## Exact execution plan — separate approval required

Approval scope must name **only** project `onfzcxtejvxpcppcvkgk`, the manifest digest
above, the three migration digests, marker provisioning and read-only post-checks.
It must not imply Auth provisioning, MQTT ingestion, writer startup or deployment
of the private Dashboard.

1. Reverify the authenticated project name/reference/API origin and protected
   reference distinction. Recheck approved manifest and SQL byte hashes, target
   health, automatic exposure OFF and no new public/SDP objects since precheck.
   Any changed state/hash or unexpected object stops execution for review.
2. In that project's owner SQL Editor apply the complete unchanged
   [001_sdp_foundation.sql](../../supabase/sdp/migrations/001_sdp_foundation.sql)
   once. It has its own transaction. Confirm success; do not initialize a synthetic
   run or start a generator. If it fails, stop and inspect its rollback outcome.
3. In **one submission**, prefix the entire unchanged
   [002_sdp_hybrid.sql](../../supabase/sdp/migrations/002_sdp_hybrid.sql) with:

   ```sql
   SET omnisense.hybrid_migration_approved = 'ISOLATED_TEST';
   -- Immediately followed by full reviewed 002, unchanged.
   ```

   Keep settings/file together because SQL Editor connections need not persist
   between runs. Do not add an outer transaction around the migration files.
4. After confirming 002 succeeded, provision the owner-only marker once:

   ```sql
   BEGIN;
   INSERT INTO public.sdp_hybrid_environment
     (singleton, kind, project_ref, protected_project_ref, manifest_sha256)
   VALUES (true, 'ISOLATED_TEST', 'onfzcxtejvxpcppcvkgk',
     'uaqblatyabykhghiqecp',
     'c3089fa380256437d7ef2049b5b60769d0b0234e4f069982505839b32fa24cb1');
   COMMIT;
   ```

   Unexpected existing marker means stop. Do not upsert over it.
5. In **one submission**, prefix the complete unchanged
   [003_sdp_hybrid_isolated_lockdown.sql](../../supabase/sdp/migrations/003_sdp_hybrid_isolated_lockdown.sql)
   with:

   ```sql
   SET omnisense.hybrid_isolated_lockdown_approved = 'ISOLATED_TEST';
   SET omnisense.hybrid_target_ref = 'onfzcxtejvxpcppcvkgk';
   SET omnisense.hybrid_protected_ref = 'uaqblatyabykhghiqecp';
   SET omnisense.hybrid_manifest_sha256 = 'c3089fa380256437d7ef2049b5b60769d0b0234e4f069982505839b32fa24cb1';
   -- Immediately followed by full reviewed 003, unchanged.
   ```

   Its marker check and refusal of scripted records must pass. Do not regrant
   the two legacy writer RPCs after this isolated-only lockdown.
6. Run a review copy of
   [002_sdp_hybrid_read_only.sql](../../supabase/sdp/verification/002_sdp_hybrid_read_only.sql)
   replacing its placeholders with this test reference, protected reference and
   manifest digest. Check nine RLS-enabled tables, exact marker, intended policies
   and effective function/table grants, including legacy write-RPC denial. Expect
   zero runs/leases/ACLs/frames/events/samples and zero integrity violations.
7. Report installation results and stop. Do not initialize a run, create Auth
   accounts/ACLs, change credentials, connect MQTT or start the Hybrid Writer.
   Those require later explicit approval for the controlled physical session.

Each migration and marker provisioning is a separate transaction; a failed later
step does not undo a successful earlier step. Record committed steps, stop on
error and reconcile before any retry. Do not rerun successful files. There is no
approved destructive down migration, manual ACTIVE reflag or automatic deletion.
Recovery would affect only disposable test resources after separate review; the
existing synthetic project is never a migration/rollback target.

**Decision:** owner precheck passed. The exact migration package above is ready
for the user's separate approval. No migration approval is inferred from the
read-only precheck authorization.
