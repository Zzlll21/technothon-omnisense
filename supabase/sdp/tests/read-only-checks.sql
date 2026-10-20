-- Optional manual verification in the NEW dedicated project's SQL Editor.
-- Read-only: no INSERT/UPDATE/DELETE, migrations or credential output.
select public.sdp_generator_info();
select tablename, rowsecurity
from pg_tables where schemaname = 'public' and tablename like 'sdp_%'
order by tablename;
select tablename, policyname, roles, cmd
from pg_policies where schemaname = 'public' and tablename like 'sdp_%'
order by tablename;
select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where specific_schema = 'public' and routine_name like 'sdp_%'
order by routine_name, grantee;
select p.proname as function_name, p.prosecdef as security_definer, p.proconfig as settings,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as generator_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in
  ('sdp_generator_info', 'sdp_initialize_run', 'sdp_get_run', 'sdp_commit_tick')
order by p.proname;
select table_name, grantee, privilege_type
from information_schema.table_privileges
where table_schema = 'public' and table_name like 'sdp_%'
order by table_name, grantee;
select c.relname as table_name, r.role_name,
  has_table_privilege(r.role_name, c.oid, 'SELECT') as can_select,
  has_table_privilege(r.role_name, c.oid, 'INSERT') as can_insert,
  has_table_privilege(r.role_name, c.oid, 'UPDATE') as can_update,
  has_table_privilege(r.role_name, c.oid, 'DELETE') as can_delete,
  has_table_privilege(r.role_name, c.oid, 'TRUNCATE') as can_truncate
from pg_class c join pg_namespace n on n.oid = c.relnamespace
cross join (values ('anon'), ('authenticated'), ('service_role')) as r(role_name)
where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'sdp_%'
order by c.relname, r.role_name;
-- Expect SELECT only for anon/authenticated, service_role execution on four RPCs,
-- no PUBLIC/anon/authenticated write-RPC execution, and RLS on all six tables.
-- Expect SECURITY DEFINER true; search_path=pg_catalog, pg_temp; browser execute
-- false; generator execute true. Table SELECT true only for browser roles;
-- all mutation privileges false, including service_role direct table writes.
select run_id, status, last_sequence, history_start, live_anchor, last_simulated_at, updated_at
from public.sdp_runs order by created_at desc;
select r.run_id, r.status,
  (select count(*) from public.sdp_zone_frames f where f.run_id = r.run_id and f.phase = 'HISTORY') as history_frames,
  (select count(*) from public.sdp_node_samples s join public.sdp_zone_frames f using (run_id, zone_id, sequence)
    where s.run_id = r.run_id and f.phase = 'HISTORY') as history_node_samples,
  (select count(*) from public.sdp_zone_frames f where f.run_id = r.run_id and f.phase = 'CONTINUOUS') as continuous_frames
from public.sdp_runs r order by r.created_at desc;
select distinct on (s.node_id) s.run_id, s.node_id, s.observed_at, s.inserted_at,
  s.temperature_c, s.humidity_percent
from public.sdp_node_samples s join public.sdp_runs r using (run_id)
where r.status = 'ACTIVE'
order by s.node_id, s.observed_at desc;
