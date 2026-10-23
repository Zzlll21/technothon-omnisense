-- Read-only owner precheck. No migration, DDL, application writes or role changes.
-- Authorized target: onfzcxtejvxpcppcvkgk ONLY.
-- Protected project: uaqblatyabykhghiqecp; never execute this there.
-- Verify the authenticated Dashboard project before submission. The database
-- name (usually postgres) and the comments here are not cloud identity proof.
begin transaction read only;
set local statement_timeout = '15s';

select check_name, result from (
  select '01.current_database' as check_name, current_database()::text as result
  union all select '02.current_user', current_user::text
  union all select '03.session_user', session_user::text
  union all select '04.transaction_read_only', current_setting('transaction_read_only')
  union all select '05.server_version', current_setting('server_version')
  union all select '06.database_owner', pg_get_userbyid(datdba)
    from pg_database where datname=current_database()
  union all select '07.member_of_database_owner', pg_has_role(current_user,datdba,'USAGE')::text
    from pg_database where datname=current_database()
  union all select '08.database_create', has_database_privilege(current_user,current_database(),'CREATE')::text
  union all select '09.public_schema_owner', pg_get_userbyid(nspowner)
    from pg_namespace where nspname='public'
  union all select '10.public_schema_create', has_schema_privilege(current_user,'public','CREATE')::text
  union all select '11.public_schema_usage', has_schema_privilege(current_user,'public','USAGE')::text
  union all select '12.plpgsql_usage', has_language_privilege(current_user,'plpgsql','USAGE')::text
  union all select '13.auth_uid_exists', (to_regprocedure('auth.uid()') is not null)::text
  union all select '14.auth_uid_execute', case when to_regprocedure('auth.uid()') is null then 'false'
    else has_function_privilege(current_user,to_regprocedure('auth.uid()'),'EXECUTE')::text end
  union all select '15.core_sha256_exists', (to_regprocedure('pg_catalog.sha256(bytea)') is not null)::text
  union all select '16.required_role_count', count(*)::text from pg_roles
    where rolname in ('anon','authenticated','service_role')
  union all select '17.role/'||rolname, jsonb_build_object(
    'superuser',rolsuper,'create_role',rolcreaterole,'bypass_rls',rolbypassrls,
    'public_usage',has_schema_privilege(oid,'public','USAGE'))::text
    from pg_roles where rolname in (current_user,'anon','authenticated','service_role')
  union all select '18.public_relation_count', count(*)::text
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p','v','m','S','f')
  union all select '19.public_relations', coalesce(string_agg(c.relname||':'||c.relkind::text,', ' order by c.relname),'NONE')
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p','v','m','S','f')
  union all select '20.public_function_count', count(*)::text from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  union all select '21.public_functions', coalesce(string_agg(p.oid::regprocedure::text,', ' order by p.proname),'NONE')
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  union all select '22.sdp_relation_count', count(*)::text
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname like 'sdp\_%' escape '\'
  union all select '23.legacy_sensor_readings_exists', (to_regclass('public.sensor_readings') is not null)::text
  union all select '24.migration_ledger_exists', (to_regclass('supabase_migrations.schema_migrations') is not null)::text
  union all select '25.migration_schema_relations', coalesce(string_agg(c.relname,', ' order by c.relname),'NONE')
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='supabase_migrations' and c.relkind in ('r','p','v','m','S','f')
  union all select '26.installed_extensions', string_agg(extname||':'||extversion,', ' order by extname) from pg_extension
  union all select '27.schemas', string_agg(nspname,', ' order by nspname) from pg_namespace
    where nspname not like 'pg_%' and nspname<>'information_schema'
  union all select '28.sdp_function_count', count(*)::text from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and (p.proname like 'sdp\_%' escape '\' or p.proname like '\_sdp\_%' escape '\')
  union all select '29.auth_schema_usage', has_schema_privilege(current_user,'auth','USAGE')::text
) checks order by check_name;

rollback;
