-- Stage 3B artifact, validated only in local PGlite during Stage 3C. No hosted execution.
-- Run as owner ONLY in the explicitly approved isolated project after 001 + 002 + 003.
-- Replace both non-secret references and the manifest hash after target review.
-- This reads catalog/data; it does not establish a trusted cloud project identity.
begin transaction read only;

select current_database() as database_name, current_user as sql_role,
       current_setting('server_version') as postgres_version,
       now() as verification_at;

with expected as (
  select '<APPROVED_TEST_REF>'::text as test_ref,
         '<PROTECTED_DEMO_REF>'::text as protected_ref,
         '<APPROVED_MANIFEST_SHA256>'::text as manifest_hash
)
select 'environment_marker' as check_name,
       (select count(*)=1 from public.sdp_hybrid_environment) and
       exists(select 1 from public.sdp_hybrid_environment e, expected x
              where e.singleton and e.kind='ISOLATED_TEST'
                and x.test_ref ~ '^[a-z0-9]{20}$' and x.protected_ref ~ '^[a-z0-9]{20}$'
                and e.project_ref=x.test_ref and e.protected_project_ref=x.protected_ref
                and e.manifest_sha256=x.manifest_hash and x.manifest_hash ~ '^[a-f0-9]{64}$'
                and x.test_ref<>x.protected_ref) as pass;

-- Nine tables, all RLS enabled. Six data tables each have one SELECT policy;
-- the three private control tables have no browser policies.
select c.relname, c.relrowsecurity, c.relforcerowsecurity,
       (select count(*) from pg_policy p where p.polrelid=c.oid) as policy_count,
       c.relacl
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' and c.relname in
 ('sdp_runs','sdp_zones','sdp_nodes','sdp_zone_frames','sdp_node_samples','sdp_events',
  'sdp_hybrid_environment','sdp_hybrid_readers','sdp_hybrid_leases')
order by c.relname;

select tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies where schemaname='public' and tablename like 'sdp\_%' escape '\'
order by tablename, policyname;

-- For six data tables: SELECT true for anon/authenticated, false for service_role.
-- For private control tables: SELECT false for all three. Every write false.
with roles(role_name) as (values('anon'),('authenticated'),('service_role'))
select c.relname, r.role_name,
       has_table_privilege(r.role_name,c.oid,'SELECT') as can_select,
       has_table_privilege(r.role_name,c.oid,'INSERT') as can_insert,
       has_table_privilege(r.role_name,c.oid,'UPDATE') as can_update,
       has_table_privilege(r.role_name,c.oid,'DELETE') as can_delete,
       has_table_privilege(r.role_name,c.oid,'TRUNCATE') as can_truncate
from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join roles r
where n.nspname='public' and c.relkind='r' and c.relname like 'sdp\_%' escape '\'
order by c.relname,r.role_name;

-- Read helper: anon/authenticated execute only. Privileged public RPCs:
-- service_role execute only. Internal helpers: no execute for any listed role.
-- After Stage 3B's isolated-only hardening, sdp_initialize_run(jsonb) and
-- sdp_commit_tick(jsonb) must ALSO be false for service_role. The shared migration
-- alone preserves these two legacy grants for backward compatibility.
with roles(role_name) as (values('anon'),('authenticated'),('service_role'))
select p.oid::regprocedure::text as function_signature, r.role_name,
       has_function_privilege(r.role_name,p.oid,'EXECUTE') as can_execute,
       p.prosecdef as security_definer, p.proconfig as function_settings
from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join roles r
where n.nspname='public' and p.proname like '%sdp%'
order by function_signature,r.role_name;

select c.relname, con.conname, pg_get_constraintdef(con.oid) as definition
from pg_constraint con join pg_class c on c.oid=con.conrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname like 'sdp\_%' escape '\'
order by c.relname,con.conname;

select t.tgname, c.relname, pg_get_triggerdef(t.oid) as definition
from pg_trigger t join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname like 'sdp\_%' escape '\' and not t.tgisinternal
order by c.relname,t.tgname;

select indexname,indexdef from pg_indexes
where schemaname='public' and tablename like 'sdp\_%' escape '\'
order by tablename,indexname;

-- Immediately after migration/provisioning: zero runs/leases/reader rows.
-- After approved writer activation: exactly one intended ACTIVE hybrid run.
select model_version,status,count(*) as runs from public.sdp_runs
group by model_version,status order by model_version,status;
select run_id,model_version,status,last_sequence,last_simulated_at from public.sdp_runs
order by created_at;
select run_id,owner_id,epoch,expires_at,expires_at>clock_timestamp() as lease_current
from public.sdp_hybrid_leases order by run_id;
select run_id,user_id from public.sdp_hybrid_readers order by run_id,user_id;
select run_id,zone_id,node_id,label,required,x,y from public.sdp_nodes order by run_id,node_id;

-- Every integrity count below must be zero. These are cross-table checks,
-- not substitutes for actual anon/authenticated HTTP tests or policy tests.
select 'hybrid_frame_inventory' as check_name,count(*) as violations from (
  select f.run_id,f.zone_id,f.sequence
  from public.sdp_zone_frames f join public.sdp_runs r using(run_id)
  left join public.sdp_node_samples s using(run_id,zone_id,sequence)
  where r.model_version='sdp-hybrid-v1'
  group by f.run_id,f.zone_id,f.sequence
  having count(s.node_id)<>(select count(*) from public.sdp_nodes n
                          where n.run_id=f.run_id and n.zone_id=f.zone_id and n.required)
) bad;

select 'hybrid_sample_evidence' as check_name,count(*) as violations
from public.sdp_node_samples s join public.sdp_runs r using(run_id)
join public.sdp_zone_frames f using(run_id,zone_id,sequence)
left join public.sdp_events e on e.run_id=s.run_id and e.zone_id=s.zone_id and e.event_id=s.evidence_event_id
where r.model_version='sdp-hybrid-v1' and (
  s.sampled_at is distinct from f.simulated_at or
  case when s.evidence_event_id is null then
    s.observed_at is not null or s.temperature_c is not null or s.humidity_percent is not null
    or s.temperature_observed_at is not null or s.humidity_observed_at is not null
  else e.event_type is distinct from 'NODE_EVIDENCE' or e.sequence>s.sequence
    or e.event->'payload'->>'node_id' is distinct from s.node_id
    or (e.event->'payload'->'hardware'->>'received_at')::timestamptz is distinct from s.observed_at
    or s.observed_at>s.sampled_at
    or (e.event->'payload'->'temperature_c'->>'value')::double precision is distinct from s.temperature_c
    or (e.event->'payload'->'humidity_percent'->>'value')::double precision is distinct from s.humidity_percent
    or (e.event->'payload'->'temperature_c'->>'observed_at')::timestamptz is distinct from s.temperature_observed_at
    or (e.event->'payload'->'humidity_percent'->>'observed_at')::timestamptz is distinct from s.humidity_observed_at
  end);

select 'hybrid_frame_correlation' as check_name,count(*) as violations
from public.sdp_zone_frames f join public.sdp_runs r using(run_id)
left join public.sdp_events d on d.run_id=f.run_id and d.zone_id=f.zone_id and d.event_id=f.decision_event_id
left join public.sdp_events a on a.run_id=f.run_id and a.zone_id=f.zone_id and a.event_id=f.output_event_id
left join public.sdp_events p on p.run_id=f.run_id and p.zone_id=f.zone_id and p.event_id=f.forecast_event_id
where r.model_version='sdp-hybrid-v1' and (
 d.event_type is distinct from 'ZONE_DECISION' or a.event_type is distinct from 'APPLIED_OUTPUT'
 or p.event_type is distinct from 'ZONE_FORECAST' or d.sequence is distinct from f.sequence or a.sequence is distinct from f.sequence
 or p.sequence>f.sequence or d.occurred_at is distinct from f.simulated_at or a.occurred_at is distinct from f.simulated_at
 or p.occurred_at>f.simulated_at or (p.event->'payload'->>'expires_at')::timestamptz<=f.simulated_at
 or d.event->'payload'->>'occupancy' is distinct from f.occupancy
 or d.event->'payload'->>'coverage' is distinct from f.coverage
 or d.event->'payload'->>'forecast_event_id' is distinct from f.forecast_event_id
 or a.event->'payload'->>'decision_event_id' is distinct from f.decision_event_id
 or a.event->'payload'->>'command_id' is distinct from d.event->'payload'->>'command_id'
 or a.event->'payload'->'reported_output' is distinct from d.event->'payload'->'requested_output'
 or a.event->'payload'->>'feedback_basis' is distinct from 'SIMULATED');

select 'hybrid_checkpoint_receipts' as check_name,count(*) as violations
from public.sdp_runs r join public.sdp_node_samples s on s.run_id=r.run_id and s.sequence=r.last_sequence
where r.model_version='sdp-hybrid-v1' and s.evidence_event_id is not null and (
 r.checkpoint->'evidence_ids'->>s.node_id is distinct from s.evidence_event_id
 or (r.checkpoint->'fusion'->'last_receipts'->>s.node_id)::timestamptz is distinct from s.observed_at);

rollback;
