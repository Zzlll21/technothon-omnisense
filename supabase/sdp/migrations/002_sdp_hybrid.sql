-- REVIEW CANDIDATE. LOCAL/ISOLATED TEST PROJECT ONLY. Never run against the active demo.
-- Requires 001_sdp_foundation.sql and an explicit session acknowledgement.
-- Does not enable a hybrid writer, provision credentials, or publish/archive a run.
begin;
do $$ begin
  if current_setting('omnisense.hybrid_migration_approved', true) is distinct from 'ISOLATED_TEST'
    then raise exception 'Hybrid migration requires explicit ISOLATED_TEST acknowledgement'; end if;
  if to_regclass('public.sdp_runs') is null or to_regclass('public.sensor_readings') is not null
    then raise exception 'Dedicated SDP foundation required; legacy project refused'; end if;
end $$;

alter table public.sdp_runs drop constraint sdp_runs_model_version_check;
alter table public.sdp_runs drop constraint sdp_runs_check;
alter table public.sdp_runs add constraint sdp_run_model_v2 check (model_version in ('sdp-scripted-v1','sdp-hybrid-v1'));
alter table public.sdp_runs add constraint sdp_run_history_v2 check (
  (model_version='sdp-scripted-v1' and live_anchor-history_start=interval '7 days') or
  (model_version='sdp-hybrid-v1' and live_anchor=history_start));
alter table public.sdp_nodes drop constraint sdp_nodes_node_id_check;
alter table public.sdp_nodes add constraint sdp_node_identity_v2 check (node_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$');
alter table public.sdp_node_samples alter column observed_at drop not null;
alter table public.sdp_node_samples alter column temperature_c drop not null;
alter table public.sdp_node_samples alter column humidity_percent drop not null;
alter table public.sdp_node_samples alter column evidence_event_id drop not null;
alter table public.sdp_node_samples drop constraint sdp_node_samples_temperature_c_check;
alter table public.sdp_node_samples add constraint sdp_temperature_v2 check (temperature_c between -40 and 85);
-- Append columns so legacy positional inserts still use their original columns.
alter table public.sdp_node_samples add column sampled_at timestamptz;
alter table public.sdp_node_samples add column temperature_observed_at timestamptz;
alter table public.sdp_node_samples add column humidity_observed_at timestamptz;
create index sdp_samples_evaluation_history on public.sdp_node_samples(run_id,node_id,sampled_at,sequence);

-- Replace only the three envelope-specific checks. Other keys/FKs remain intact.
do $$ declare c record; begin
  for c in select conname from pg_constraint where conrelid='public.sdp_events'::regclass and contype='c'
    and (pg_get_constraintdef(oid) like '%schema_version%' or pg_get_constraintdef(oid) like '%time_base%' or pg_get_constraintdef(oid) like '%data_sources%')
  loop execute format('alter table public.sdp_events drop constraint %I',c.conname); end loop;
end $$;
alter table public.sdp_events add constraint sdp_event_versioned_clock check ((
  (event->>'schema_version'='sdp.v1-draft.1' and event->'clock'->>'time_base'='REPLAY'
    and event->'clock'->>'replay_id'=run_id::text and event->'data_sources'='["SIMULATED"]'::jsonb) or
  (event->>'schema_version'='sdp.v1-hybrid.1' and event->'clock'='{"time_base":"LIVE","replay_id":null}'::jsonb)
) is true);

create table public.sdp_hybrid_environment (
  singleton boolean primary key default true check(singleton),
  kind text not null check(kind='ISOLATED_TEST'), project_ref text not null check(project_ref ~ '^[a-z0-9]{20}$'),
  protected_project_ref text not null check(protected_project_ref ~ '^[a-z0-9]{20}$'),
  manifest_sha256 text check(manifest_sha256 ~ '^[a-f0-9]{64}$'),
  check(project_ref<>protected_project_ref)
);
-- Intentionally empty: only the database owner may provision this after target review.
create table public.sdp_hybrid_readers (
  run_id uuid not null references public.sdp_runs(run_id), user_id uuid not null,
  primary key(run_id,user_id)
);
create table public.sdp_hybrid_leases (
  run_id uuid primary key references public.sdp_runs(run_id), owner_id uuid not null,
  epoch bigint not null check(epoch>0), expires_at timestamptz not null
);
alter table public.sdp_hybrid_environment enable row level security;
alter table public.sdp_hybrid_readers enable row level security;
alter table public.sdp_hybrid_leases enable row level security;
revoke all on public.sdp_hybrid_environment,public.sdp_hybrid_readers,public.sdp_hybrid_leases from public,anon,authenticated,service_role;

create function public._sdp_exact_keys(j jsonb, keys text[]) returns boolean
language sql immutable set search_path=pg_catalog,pg_temp as $$
 select jsonb_typeof(j)='object' and (select array_agg(k order by k) from jsonb_object_keys(j) k) = (select array_agg(k order by k) from unnest(keys) k);
$$;
create function public._sdp_hybrid_observation(o jsonb, kind text, receipt timestamptz) returns void
language plpgsql set search_path=pg_catalog,pg_temp as $$
begin
 if (public._sdp_exact_keys(o,array['value','source','source_id','observed_at','validity']) and
   o->>'source' in ('MEASURED','UNAVAILABLE') and o->>'validity' in ('VALID','INVALID','UNAVAILABLE')) is not true
   then raise exception 'Invalid hybrid observation shape'; end if;
 if o->>'validity'='VALID' then
   if (o->>'source'='MEASURED' and jsonb_typeof(o->'source_id')='string' and length(o->>'source_id') between 1 and 128
      and (o->>'observed_at')::timestamptz=receipt) is not true then raise exception 'Valid observation requires measured source/original receipt'; end if;
   if kind='classification' then
     if (public._sdp_exact_keys(o->'value',array['class_label','class_scores','headcount_category']) and o->'value'->'class_scores'='null'::jsonb and
       o->'value'->>'class_label' in ('EMPTY_CORE','THERMAL_ANOMALIES','OCCUPIED_1P','OCCUPIED_2P','OCCUPIED_3P_PLUS') and
       o->'value'->>'headcount_category' in ('ZERO','ONE','TWO','THREE_PLUS','UNCERTAIN')) is not true then raise exception 'Invalid hybrid classifier'; end if;
   elsif jsonb_typeof(o->'value') is distinct from 'number' or (o->>'value')::double precision not between (case when kind='temperature' then -40 else 0 end) and (case when kind='temperature' then 85 else 100 end)
     then raise exception 'Invalid measured range'; end if;
 else
   if o->'value' is distinct from 'null'::jsonb then raise exception 'Unavailable/invalid observation must be null'; end if;
   if o->>'observed_at' is not null and (o->>'observed_at')::timestamptz is distinct from receipt then raise exception 'Observation receipt mismatch'; end if;
   if o->>'source'='UNAVAILABLE' and (o->>'validity'<>'UNAVAILABLE' or o->'source_id'<>'null'::jsonb or o->'observed_at'<>'null'::jsonb) then raise exception 'Unavailable source metadata mismatch'; end if;
 end if;
end $$;

create function public._sdp_validate_hybrid_event(e jsonb) returns void
language plpgsql set search_path=pg_catalog,pg_temp as $$
declare p jsonb:=e->'payload'; h jsonb:=p->'hardware'; t text:=e->>'event_type'; s jsonb; n jsonb; count_label text; owner text;
begin
 if (public._sdp_exact_keys(e,array['schema_version','event_type','event_id','correlation_id','session_id','room_id','zone_id','occurred_at','clock','producer','data_sources','payload']) and
   e->>'schema_version'='sdp.v1-hybrid.1' and e->'clock'='{"time_base":"LIVE","replay_id":null}'::jsonb and
   jsonb_typeof(e->'data_sources')='array' and jsonb_array_length(e->'data_sources')>0 and
   jsonb_typeof(p)='object' and length(e->>'event_id') between 1 and 256 and length(e->>'correlation_id') between 1 and 256 and length(e->>'room_id')>0 and e->>'zone_id'='zone-1') is not true then raise exception 'Invalid hybrid envelope'; end if;
 perform (e->>'occurred_at')::timestamptz;
 if exists(select 1 from jsonb_array_elements_text(e->'data_sources') v where v not in ('MEASURED','SIMULATED','UNAVAILABLE','PROXY_TEST')) then raise exception 'Invalid provenance'; end if;
 owner:=case t when 'NODE_EVIDENCE' then 'A_B' when 'ZONE_CONFIG' then 'C' when 'ZONE_DECISION' then 'C' when 'ZONE_FORECAST' then 'D' when 'APPLIED_OUTPUT' then 'B' end;
 if owner is null or (public._sdp_exact_keys(e->'producer',array['component','producer_id']) and e->'producer'->>'component'=owner and length(e->'producer'->>'producer_id')>0) is not true then raise exception 'Invalid event ownership'; end if;
 if t in ('ZONE_FORECAST','APPLIED_OUTPUT') and e->'data_sources'<>'["SIMULATED"]'::jsonb then raise exception 'Forecast/output must remain simulated'; end if;
 if t='NODE_EVIDENCE' then
   if (public._sdp_exact_keys(p,array['node_id','model_version','firmware_version','hardware','classification','temperature_c','humidity_percent']) and
       p->>'node_id' ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' and
       jsonb_typeof(p->'model_version') in ('string','null') and jsonb_typeof(p->'firmware_version') in ('string','null') and
       public._sdp_exact_keys(h,array['received_at','time_basis','device_observed_at','headcount','inference_method','system_active','pir_motion','bme_valid','headcount_source','thermal_ai_label','thermal_ai_confidence']) and
       h->>'time_basis'='GATEWAY_RECEIPT' and h->'device_observed_at'='null'::jsonb and
       jsonb_typeof(h->'headcount')='number' and (h->>'headcount')::numeric between 0 and 3 and (h->>'headcount')::numeric=trunc((h->>'headcount')::numeric) and
       h->>'inference_method' in ('TINYML','THERMAL_BLOB_FALLBACK','UNAVAILABLE') and
       jsonb_typeof(h->'system_active') in ('boolean','null') and jsonb_typeof(h->'pir_motion') in ('boolean','null') and jsonb_typeof(h->'bme_valid') in ('boolean','null') and
       jsonb_typeof(h->'headcount_source') in ('string','null') and jsonb_typeof(h->'thermal_ai_label') in ('string','null') and
       (h->'thermal_ai_confidence'='null'::jsonb or (jsonb_typeof(h->'thermal_ai_confidence')='number' and (h->>'thermal_ai_confidence')::numeric between 0 and 1))) is not true then raise exception 'Invalid hardware metadata'; end if;
   if (h->>'received_at')::timestamptz is distinct from (e->>'occurred_at')::timestamptz then raise exception 'Hardware event must retain original receipt'; end if;
   perform public._sdp_hybrid_observation(p->'classification','classification',(h->>'received_at')::timestamptz);
   perform public._sdp_hybrid_observation(p->'temperature_c','temperature',(h->>'received_at')::timestamptz);
   perform public._sdp_hybrid_observation(p->'humidity_percent','humidity',(h->>'received_at')::timestamptz);
   foreach s in array array[p->'classification',p->'temperature_c',p->'humidity_percent'] loop
     if not (e->'data_sources' ? (s->>'source')) then raise exception 'Missing observation provenance'; end if;
     if s->>'source'='MEASURED' and s->>'source_id' is distinct from ((p->>'node_id')||(case when s=p->'classification' then '/thermal' else '/bme280' end)) then raise exception 'Hardware source identity mismatch'; end if;
   end loop;
   if p->'classification'->>'validity'='VALID' then
     count_label:=case (h->>'headcount')::integer when 0 then 'EMPTY_CORE' when 1 then 'OCCUPIED_1P' when 2 then 'OCCUPIED_2P' else 'OCCUPIED_3P_PLUS' end;
     if (h->>'system_active'='true' and h->>'inference_method'<>'UNAVAILABLE' and p->'classification'->'value'->>'class_label'=count_label and
       p->'classification'->'value'->>'headcount_category'=(array['ZERO','ONE','TWO','THREE_PLUS'])[(h->>'headcount')::integer+1] and
       (h->>'inference_method'<>'THERMAL_BLOB_FALLBACK' or ((h->>'headcount')::integer>0 and h->>'headcount_source'='thermal_blob_fallback')) and
       (h->>'inference_method'<>'TINYML' or (h->>'headcount_source'='thermal_ai' and h->>'thermal_ai_label'=count_label and (h->>'thermal_ai_confidence')::numeric>0))) is not true then raise exception 'Invalid accepted hardware classification'; end if;
   end if;
   if (p->'temperature_c'->>'validity'='VALID' or p->'humidity_percent'->>'validity'='VALID') and (h->>'bme_valid' is distinct from 'true' or h->>'system_active' is distinct from 'true') then raise exception 'Inactive BME cannot be valid'; end if;
 elsif t='ZONE_CONFIG' then
   if (public._sdp_exact_keys(p,array['config_version','effective_from','controller_id','actuator_id','actuation_kind','required_nodes','representative_environment_node_id','freshness','vacancy_confirmation_ms','min_mode_dwell_ms','override_max_duration_ms','limits']) and
     p->>'config_version'='sdp-hybrid-v1' and p->>'actuation_kind'='FAN_PROXY' and p->>'actuator_id'='simulated-actuator' and
     public._sdp_exact_keys(p->'freshness',array['stale_after_ms','disconnected_after_ms','max_clock_skew_ms']) and
     public._sdp_exact_keys(p->'limits',array['temperature_min_c','temperature_max_c','humidity_max_percent','occupied_target_c']) and
     jsonb_typeof(p->'required_nodes')='array' and jsonb_array_length(p->'required_nodes') between 1 and 32 and
     (p->'freshness'->>'stale_after_ms')::bigint>0 and (p->'freshness'->>'disconnected_after_ms')::bigint>(p->'freshness'->>'stale_after_ms')::bigint and
     (p->>'vacancy_confirmation_ms')::bigint=300000) is not true then raise exception 'Invalid hybrid configuration'; end if;
   for n in select value from jsonb_array_elements(p->'required_nodes') loop
     if (public._sdp_exact_keys(n,array['node_id','label','x','y']) and n->>'node_id' ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' and length(n->>'label')>0 and (n->>'x')::numeric between 0 and 1 and (n->>'y')::numeric between 0 and 1) is not true then raise exception 'Invalid node configuration'; end if;
   end loop;
   if (select count(distinct value->>'node_id') from jsonb_array_elements(p->'required_nodes'))<>jsonb_array_length(p->'required_nodes') or not exists(select 1 from jsonb_array_elements(p->'required_nodes') item where item->>'node_id'=p->>'representative_environment_node_id') then raise exception 'Invalid node inventory'; end if;
 elsif t='ZONE_DECISION' then
   if (public._sdp_exact_keys(p,array['command_id','config_event_id','occupancy','coverage','requested_mode','requested_output','reason_code','reason_text','evaluated_at','vacancy_confirmed_at','node_states','forecast_event_id','override_request_id']) and
     p->>'occupancy' in ('OCCUPIED','VACANT','UNCERTAIN') and p->>'coverage' in ('COMPLETE','DEGRADED','UNKNOWN') and p->>'requested_mode' in ('OCCUPIED','SHORT_VACANCY','LONG_VACANCY','PRECOOL') and
     p->>'reason_code' in ('OCCUPIED_EVIDENCE','UNCERTAIN_EVIDENCE','MISSING_EVIDENCE','CONSERVATIVE_FALLBACK','SHORT_GAP','LONG_GAP','FORECAST_RESTART','VACANCY_CONFIRMED') and length(p->>'reason_text')>0 and
     (p->>'evaluated_at')::timestamptz<=(e->>'occurred_at')::timestamptz and p->'override_request_id'='null'::jsonb) is not true then raise exception 'Invalid hybrid decision'; end if;
   if p->>'vacancy_confirmed_at' is not null and (p->>'vacancy_confirmed_at')::timestamptz>(p->>'evaluated_at')::timestamptz then raise exception 'Future vacancy confirmation'; end if;
 elsif t='ZONE_FORECAST' then
   if (public._sdp_exact_keys(p,array['status','source','quality','next_use_window','planned_restart_at','expires_at','method_version','cooling_model_version','supersedes_event_id','status_reason']) and p->>'status'='ACTIVE' and p->>'source'='BOOKING' and p->>'quality'='MEDIUM' and
     p->>'method_version'='synthetic-booking-not-prediction-v1' and (p->>'expires_at')::timestamptz>(e->>'occurred_at')::timestamptz and
     (p->'next_use_window'->>'end')::timestamptz>(p->'next_use_window'->>'start')::timestamptz and (p->>'planned_restart_at')::timestamptz<=(p->'next_use_window'->>'start')::timestamptz) is not true then raise exception 'Invalid synthetic forecast'; end if;
 elsif t='APPLIED_OUTPUT' then
   if (public._sdp_exact_keys(p,array['command_id','decision_event_id','actuator_id','status','reported_output','feedback_basis','reason']) and p->>'status'='APPLIED' and p->>'feedback_basis'='SIMULATED' and p->>'actuator_id'='simulated-actuator') is not true then raise exception 'Physical output forbidden'; end if;
 end if;
 if t in ('ZONE_DECISION','APPLIED_OUTPUT') then
   s:=case t when 'ZONE_DECISION' then p->'requested_output' else p->'reported_output' end;
   if (public._sdp_exact_keys(s,array['fan','setpoint_c']) and s->>'fan' in ('OFF','LOW','MEDIUM','HIGH','AUTO') and jsonb_typeof(s->'setpoint_c') in ('number','null')) is not true then raise exception 'Invalid output setting'; end if;
 end if;
end $$;

-- BEGIN GENERATED COOLING POLICY (omnisense-cooling-v1); regenerate with generate-policy-sql.mjs
create function public._sdp_cooling_policy(at_time timestamptz, occupancy text, vacant_since timestamptz, next_use timestamptz, restart_at timestamptz) returns jsonb
language plpgsql immutable set search_path=pg_catalog,pg_temp as $$
declare mode text:='OCCUPIED'; confirmed timestamptz; elapsed numeric:=extract(epoch from at_time-vacant_since)*1000;
begin
 if occupancy='VACANT' and vacant_since is not null and elapsed>=300000 then
   mode:=case when next_use-vacant_since>=interval '1800000 milliseconds' and at_time>=restart_at and at_time<next_use then 'PRECOOL'
     when elapsed>=1200000 then 'LONG_VACANCY' else 'SHORT_VACANCY' end;
   confirmed:=vacant_since+interval '300000 milliseconds';
 end if;
 return jsonb_build_object('mode',mode,'output','{"OCCUPIED":{"fan":"AUTO","setpoint_c":24.5},"SHORT_VACANCY":{"fan":"LOW","setpoint_c":27},"LONG_VACANCY":{"fan":"OFF","setpoint_c":null},"PRECOOL":{"fan":"HIGH","setpoint_c":24.5}}'::jsonb->mode,
   'vacancy_confirmed_at',case when confirmed is null then null else to_char(confirmed at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end);
end $$;
-- END GENERATED COOLING POLICY

-- Preserve all legacy table invariants when shared columns/checks widen.
create function public._sdp_mode_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare model text;
begin
 select model_version into strict model from public.sdp_runs where run_id=new.run_id;
 if tg_table_name='sdp_nodes' then
   if model='sdp-scripted-v1' and new.node_id not in ('sim-1','sim-2') then raise exception 'Legacy inventory violation'; end if;
 end if;
 if tg_table_name='sdp_events' then
   if model='sdp-scripted-v1' and new.event->>'schema_version' is distinct from 'sdp.v1-draft.1' then raise exception 'Legacy event version violation'; end if;
   if model='sdp-hybrid-v1' then perform public._sdp_validate_hybrid_event(new.event); end if;
 end if;
 if tg_table_name='sdp_node_samples' and model='sdp-scripted-v1' then
   if new.observed_at is null or new.temperature_c is null or new.humidity_percent is null or new.evidence_event_id is null or new.temperature_c not between 15 and 40 then raise exception 'Legacy sample invariant violation'; end if;
   -- Do not update existing records; populate new columns only on future legacy inserts.
   new.sampled_at:=new.observed_at; new.temperature_observed_at:=new.observed_at; new.humidity_observed_at:=new.observed_at;
 end if;
 return new;
end $$;
create trigger sdp_nodes_mode_guard before insert or update on public.sdp_nodes for each row execute function public._sdp_mode_guard();
create trigger sdp_events_mode_guard before insert or update on public.sdp_events for each row execute function public._sdp_mode_guard();
create trigger sdp_samples_mode_guard before insert or update on public.sdp_node_samples for each row execute function public._sdp_mode_guard();

-- Legacy implementation is retained privately; wrapper prevents cross-mode writes.
alter function public.sdp_commit_tick(jsonb) rename to _sdp_commit_scripted_tick;
revoke all on function public._sdp_commit_scripted_tick(jsonb) from public,anon,authenticated,service_role;
create function public.sdp_commit_tick(p_tick jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
 if (select model_version from public.sdp_runs where run_id=(p_tick->>'run_id')::uuid) is distinct from 'sdp-scripted-v1' then raise exception 'Legacy RPC refuses hybrid runs'; end if;
 return public._sdp_commit_scripted_tick(p_tick);
end $$;

create function public.sdp_hybrid_info() returns jsonb
language sql security definer set search_path=pg_catalog,pg_temp as $$
 select jsonb_build_object('installation','omnisense-sdp-hybrid-v1','model_version','sdp-hybrid-v1',
   'environment',(select to_jsonb(e) from public.sdp_hybrid_environment e),
   'hybrid_only',not has_function_privilege('service_role','public.sdp_initialize_run(jsonb)','EXECUTE')
     and not has_function_privilege('service_role','public.sdp_commit_tick(jsonb)','EXECUTE'));
$$;
create function public.sdp_hybrid_initialize_run(p_run jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare r public.sdp_runs; n jsonb;
begin
 if not exists(select 1 from public.sdp_hybrid_environment where kind='ISOLATED_TEST') then raise exception 'Hybrid test environment not provisioned'; end if;
 if (public._sdp_exact_keys(p_run,array['run_id','model_version','seed','history_start','live_anchor','config','full_zone_coverage','heartbeat_ms','replaces_active_run_id']) and
   p_run->>'model_version'='sdp-hybrid-v1' and p_run->>'history_start'=p_run->>'live_anchor' and
   p_run->'config'->>'session_id'=p_run->>'run_id' and p_run->'config'->>'event_type'='ZONE_CONFIG' and
   (p_run->'config'->>'occurred_at')::timestamptz=(p_run->>'live_anchor')::timestamptz and
   jsonb_typeof(p_run->'full_zone_coverage')='boolean' and p_run->>'heartbeat_ms'='30000') is not true then raise exception 'Invalid hybrid run'; end if;
 perform public._sdp_validate_hybrid_event(p_run->'config');
 if p_run->>'replaces_active_run_id' is not null and (p_run->>'replaces_active_run_id')::uuid=(p_run->>'run_id')::uuid then raise exception 'Cannot replace same run'; end if;
 insert into public.sdp_runs(run_id,model_version,seed,definition,history_start,live_anchor)
   values((p_run->>'run_id')::uuid,'sdp-hybrid-v1',(p_run->>'seed')::integer,p_run,(p_run->>'history_start')::timestamptz,(p_run->>'live_anchor')::timestamptz) on conflict do nothing;
 select * into strict r from public.sdp_runs where run_id=(p_run->>'run_id')::uuid for update;
 if r.definition is distinct from p_run or r.status='ARCHIVED' then raise exception 'Immutable/archived run conflict'; end if;
 insert into public.sdp_zones(run_id,zone_id,room_id,name,config) values(r.run_id,'zone-1',p_run->'config'->>'room_id','Hybrid Test Cooling Zone',p_run->'config') on conflict do nothing;
 for n in select value from jsonb_array_elements(p_run->'config'->'payload'->'required_nodes') loop
   insert into public.sdp_nodes(run_id,zone_id,node_id,label,required,x,y) values(r.run_id,'zone-1',n->>'node_id',n->>'label',true,(n->>'x')::numeric,(n->>'y')::numeric) on conflict do nothing;
 end loop;
 return jsonb_build_object('definition',r.definition,'checkpoint',r.checkpoint,'status',r.status);
end $$;

create function public.sdp_hybrid_acquire_writer(p_run_id uuid,p_owner_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare l public.sdp_hybrid_leases; r public.sdp_runs;
begin
 if not exists(select 1 from public.sdp_hybrid_environment where kind='ISOLATED_TEST') then raise exception 'Hybrid test environment not provisioned'; end if;
 select * into strict r from public.sdp_runs where run_id=p_run_id for update;
 if r.model_version<>'sdp-hybrid-v1' or r.status='ARCHIVED' then raise exception 'Hybrid lease run invalid'; end if;
 select * into l from public.sdp_hybrid_leases where run_id=p_run_id;
 if found and l.expires_at>clock_timestamp() and l.owner_id<>p_owner_id then raise exception 'Writer already leased'; end if;
 if not found then
   insert into public.sdp_hybrid_leases values(p_run_id,p_owner_id,1,clock_timestamp()+interval '60 seconds') returning * into l;
 else
   update public.sdp_hybrid_leases set owner_id=p_owner_id,epoch=case when owner_id=p_owner_id and expires_at>clock_timestamp() then epoch else epoch+1 end,expires_at=clock_timestamp()+interval '60 seconds' where run_id=p_run_id returning * into l;
 end if;
 return to_jsonb(l);
end $$;

create function public.sdp_hybrid_commit_tick(p_tick jsonb,p_owner_id uuid,p_epoch bigint) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare r public.sdp_runs; l public.sdp_hybrid_leases; f jsonb:=p_tick->'frame'; e jsonb; s jsonb; ns jsonb; d jsonb; a jsonb; forecast jsonb; config jsonb;
 seq bigint:=(f->>'sequence')::bigint; at_time timestamptz:=(f->>'simulated_at')::timestamptz; i integer:=0; old_hash text; active_id uuid;
 fresh_count integer:=0; empty_count integer:=0; occupied_count integer:=0; expected_occupancy text; expected_coverage text; age_ms numeric; kv record;
 proposed_since timestamptz; previous_since timestamptz; expected_policy jsonb;
 digest text:=encode(sha256(convert_to(p_tick::text,'UTF8')),'hex');
begin
 if not exists(select 1 from public.sdp_hybrid_environment where kind='ISOLATED_TEST') then raise exception 'Hybrid test environment not provisioned'; end if;
 select * into strict r from public.sdp_runs where run_id=(p_tick->>'run_id')::uuid for update;
 if r.model_version<>'sdp-hybrid-v1' or r.status='ARCHIVED' then raise exception 'Hybrid RPC run invalid'; end if;
 select * into strict l from public.sdp_hybrid_leases where run_id=r.run_id;
 if l.owner_id is distinct from p_owner_id or l.epoch is distinct from p_epoch or l.expires_at<=clock_timestamp() then raise exception 'Writer lease/fence invalid'; end if;
 select commit_hash into old_hash from public.sdp_zone_frames where run_id=r.run_id and zone_id='zone-1' and sequence=seq;
 if found then
   if old_hash<>digest then raise exception 'Conflicting retry'; end if;
   update public.sdp_hybrid_leases set expires_at=clock_timestamp()+interval '60 seconds' where run_id=r.run_id;
   return jsonb_build_object('ok',true,'duplicate',true,'sequence',seq);
 end if;
 if seq is distinct from r.last_sequence+1 or (p_tick->>'expected_sequence')::bigint is distinct from r.last_sequence then raise exception 'Checkpoint conflict'; end if;
 if (seq=0 and at_time<r.live_anchor) or (seq>0 and at_time<=r.last_simulated_at) or at_time>clock_timestamp()+interval '5 seconds' or f->>'phase' is distinct from 'CONTINUOUS' or
   (p_tick->'checkpoint'->>'sequence')::bigint is distinct from seq or p_tick->'checkpoint'->>'simulated_at' is distinct from f->>'simulated_at' then raise exception 'Invalid hybrid cutoff/checkpoint'; end if;
 config:=r.definition->'config';
 if (public._sdp_exact_keys(p_tick,array['run_id','expected_sequence','frame','samples','events','checkpoint']) and
   public._sdp_exact_keys(f,array['sequence','simulated_at','phase','occupancy','coverage','decision_event_id','forecast_event_id','output_event_id']) and
   public._sdp_exact_keys(p_tick->'checkpoint',array['sequence','simulated_at','fusion','decision','forecast','output','evidence_ids']) and
   public._sdp_exact_keys(p_tick->'checkpoint'->'fusion',array['evaluated_at','vacant_since','configuration_key','last_receipts']) and
   jsonb_typeof(p_tick->'checkpoint'->'evidence_ids')='object' and jsonb_typeof(p_tick->'checkpoint'->'fusion'->'last_receipts')='object') is not true then raise exception 'Invalid hybrid transaction/checkpoint shape'; end if;
 for kv in select * from jsonb_each_text(p_tick->'checkpoint'->'fusion'->'last_receipts') loop
   if not exists(select 1 from public.sdp_nodes where run_id=r.run_id and node_id=kv.key) or kv.value is null or kv.value::timestamptz>at_time or kv.value::timestamptz<r.live_anchor then raise exception 'Invalid checkpoint receipt'; end if;
 end loop;
 if p_tick->'checkpoint'->'fusion'->>'vacant_since' is not null and ((p_tick->'checkpoint'->'fusion'->>'vacant_since')::timestamptz>at_time or (p_tick->'checkpoint'->'fusion'->>'vacant_since')::timestamptz<r.live_anchor) then raise exception 'Invalid checkpoint vacancy'; end if;
 if jsonb_array_length(p_tick->'samples') is distinct from jsonb_array_length(config->'payload'->'required_nodes') then raise exception 'Configured sample inventory required'; end if;
 if (select count(*) from jsonb_array_elements(p_tick->'events') item where item->>'event_type'='ZONE_DECISION')<>1 or
   (select count(*) from jsonb_array_elements(p_tick->'events') item where item->>'event_type'='APPLIED_OUTPUT')<>1 or
   (select count(*) from jsonb_array_elements(p_tick->'events') item where item->>'event_type'='ZONE_CONFIG')<>(case when seq=0 then 1 else 0 end) or
   (select count(*) from jsonb_array_elements(p_tick->'events') item where item->>'event_type'='ZONE_FORECAST')>1 then raise exception 'Invalid snapshot event inventory'; end if;
 insert into public.sdp_zone_frames(run_id,zone_id,sequence,simulated_at,phase,occupancy,coverage,decision_event_id,forecast_event_id,output_event_id,commit_hash)
   values(r.run_id,'zone-1',seq,at_time,'CONTINUOUS',f->>'occupancy',f->>'coverage',f->>'decision_event_id',f->>'forecast_event_id',f->>'output_event_id',digest);
 for e in select value from jsonb_array_elements(p_tick->'events') loop
   perform public._sdp_validate_hybrid_event(e);
   if e->>'session_id' is distinct from r.run_id::text or e->>'room_id' is distinct from config->>'room_id' or (e->>'occurred_at')::timestamptz>at_time or (e->>'occurred_at')::timestamptz<r.live_anchor then raise exception 'Foreign/future event'; end if;
   if e->>'event_type'='ZONE_CONFIG' and (seq<>0 or e<>config) then raise exception 'Immutable config mismatch'; end if;
   if e->>'event_type'='NODE_EVIDENCE' and not exists(select 1 from jsonb_array_elements(p_tick->'samples') item where item->>'node_id'=e->'payload'->>'node_id' and item->>'evidence_event_id'=e->>'event_id') then raise exception 'Unreferenced hardware event'; end if;
   insert into public.sdp_events(run_id,zone_id,sequence,ordinal,event_id,event_type,occurred_at,event) values(r.run_id,'zone-1',seq,i,e->>'event_id',e->>'event_type',(e->>'occurred_at')::timestamptz,e);
   i:=i+1;
 end loop;
 select event into strict d from public.sdp_events where run_id=r.run_id and event_id=f->>'decision_event_id' and event_type='ZONE_DECISION' and sequence=seq;
 select event into strict a from public.sdp_events where run_id=r.run_id and event_id=f->>'output_event_id' and event_type='APPLIED_OUTPUT' and sequence=seq;
 select event into strict forecast from public.sdp_events where run_id=r.run_id and event_id=f->>'forecast_event_id' and event_type='ZONE_FORECAST' and sequence<=seq;
 if d->'payload'->>'config_event_id' is distinct from config->>'event_id' or d->'payload'->>'forecast_event_id' is distinct from forecast->>'event_id' or
   d->'payload'->>'occupancy' is distinct from f->>'occupancy' or d->'payload'->>'coverage' is distinct from f->>'coverage' or
   d->'payload'->>'evaluated_at' is distinct from f->>'simulated_at' or (forecast->>'occurred_at')::timestamptz>at_time or
   (d->>'occurred_at')::timestamptz is distinct from at_time or (a->>'occurred_at')::timestamptz is distinct from at_time or (forecast->'payload'->>'expires_at')::timestamptz<=at_time or
   a->'payload'->>'decision_event_id' is distinct from d->>'event_id' or a->'payload'->>'command_id' is distinct from d->'payload'->>'command_id' or
   a->'payload'->'reported_output' is distinct from d->'payload'->'requested_output' or p_tick->'checkpoint'->'decision' is distinct from d or p_tick->'checkpoint'->'forecast' is distinct from forecast or p_tick->'checkpoint'->'output' is distinct from a or
   p_tick->'checkpoint'->'fusion'->>'evaluated_at' is distinct from f->>'simulated_at' then raise exception 'Hybrid causal/checkpoint correlation invalid'; end if;
 if jsonb_array_length(d->'payload'->'node_states') is distinct from jsonb_array_length(p_tick->'samples') then raise exception 'Node state inventory mismatch'; end if;
 for s in select value from jsonb_array_elements(p_tick->'samples') loop
   if public._sdp_exact_keys(s,array['node_id','observed_at','sampled_at','temperature_c','humidity_percent','temperature_observed_at','humidity_observed_at','evidence_event_id']) is not true then raise exception 'Invalid sample shape'; end if;
   if not exists(select 1 from public.sdp_nodes where run_id=r.run_id and node_id=s->>'node_id') or (s->>'sampled_at')::timestamptz is distinct from at_time then raise exception 'Sample identity/cutoff invalid'; end if;
   select value into strict ns from jsonb_array_elements(d->'payload'->'node_states') where value->>'node_id'=s->>'node_id';
   if (public._sdp_exact_keys(ns,array['node_id','state','evidence_event_id']) and ns->>'state' in ('FRESH','STALE','DISCONNECTED','MISSING','INVALID')) is not true or ns->'evidence_event_id' is distinct from s->'evidence_event_id' then raise exception 'Sample/state evidence mismatch'; end if;
   if s->>'evidence_event_id' is null then
     if (ns->>'state'='MISSING' and s->'observed_at'='null'::jsonb and s->'temperature_c'='null'::jsonb and s->'humidity_percent'='null'::jsonb and s->'temperature_observed_at'='null'::jsonb and s->'humidity_observed_at'='null'::jsonb) is not true then raise exception 'Missing sample must be explicitly unavailable'; end if;
   else
     if p_tick->'checkpoint'->'evidence_ids'->(s->>'node_id') is distinct from s->'evidence_event_id' or p_tick->'checkpoint'->'fusion'->'last_receipts'->(s->>'node_id') is distinct from s->'observed_at' then raise exception 'Checkpoint evidence mismatch'; end if;
     select event into strict e from public.sdp_events where run_id=r.run_id and zone_id='zone-1' and event_id=s->>'evidence_event_id' and event_type='NODE_EVIDENCE' and sequence<=seq;
     if ns->>'state'='MISSING' or e->'payload'->>'node_id' is distinct from s->>'node_id' or (e->>'occurred_at')::timestamptz>at_time or
       e->'payload'->'hardware'->'received_at' is distinct from s->'observed_at' or
       e->'payload'->'temperature_c'->'value' is distinct from s->'temperature_c' or e->'payload'->'humidity_percent'->'value' is distinct from s->'humidity_percent' or
       e->'payload'->'temperature_c'->'observed_at' is distinct from s->'temperature_observed_at' or e->'payload'->'humidity_percent'->'observed_at' is distinct from s->'humidity_observed_at' then raise exception 'Sample does not match original hardware evidence'; end if;
     age_ms:=extract(epoch from at_time-(s->>'observed_at')::timestamptz)*1000;
     -- Transport loss may mark a recent reading DISCONNECTED, never upgrade freshness.
     if ns->>'state'<>'DISCONNECTED' and ns->>'state' is distinct from (case when age_ms>=(config->'payload'->'freshness'->>'disconnected_after_ms')::bigint then 'DISCONNECTED' when age_ms>=(config->'payload'->'freshness'->>'stale_after_ms')::bigint then 'STALE' when e->'payload'->'classification'->>'validity'='VALID' then 'FRESH' else 'INVALID' end) then raise exception 'Hardware freshness mismatch'; end if;
     if ns->>'state'='FRESH' then
       fresh_count:=fresh_count+1;
       if e->'payload'->'classification'->'value'->>'class_label'='EMPTY_CORE' then empty_count:=empty_count+1; else occupied_count:=occupied_count+1; end if;
     end if;
   end if;
   insert into public.sdp_node_samples(run_id,zone_id,sequence,node_id,observed_at,temperature_c,humidity_percent,evidence_event_id,sampled_at,temperature_observed_at,humidity_observed_at)
     values(r.run_id,'zone-1',seq,s->>'node_id',(s->>'observed_at')::timestamptz,(s->>'temperature_c')::double precision,(s->>'humidity_percent')::double precision,s->>'evidence_event_id',at_time,(s->>'temperature_observed_at')::timestamptz,(s->>'humidity_observed_at')::timestamptz);
 end loop;
 if (select count(*) from jsonb_object_keys(p_tick->'checkpoint'->'evidence_ids'))<>(select count(*) from jsonb_array_elements(p_tick->'samples') item where item->>'evidence_event_id' is not null) then raise exception 'Checkpoint inventory mismatch'; end if;
 expected_occupancy:=case when occupied_count>0 then 'OCCUPIED' when (r.definition->>'full_zone_coverage')::boolean and empty_count=jsonb_array_length(p_tick->'samples') then 'VACANT' else 'UNCERTAIN' end;
 expected_coverage:=case when (r.definition->>'full_zone_coverage')::boolean and fresh_count=jsonb_array_length(p_tick->'samples') then 'COMPLETE' when fresh_count>0 then 'DEGRADED' else 'UNKNOWN' end;
 if f->>'occupancy'<>expected_occupancy or f->>'coverage'<>expected_coverage or (expected_occupancy<>'VACANT' and (d->'payload'->>'requested_mode'<>'OCCUPIED' or p_tick->'checkpoint'->'fusion'->'vacant_since'<>'null'::jsonb or d->'payload'->'vacancy_confirmed_at'<>'null'::jsonb)) then raise exception 'Hybrid fusion mismatch'; end if;
 proposed_since:=(p_tick->'checkpoint'->'fusion'->>'vacant_since')::timestamptz;
 previous_since:=(r.checkpoint->'fusion'->>'vacant_since')::timestamptz;
 if expected_occupancy='VACANT' then
   if proposed_since is null then raise exception 'Vacancy requires a continuity origin'; end if;
   -- A reset is always conservative. Continuing an older origin needs a committed
   -- predecessor and uninterrupted per-node freshness; a restart/gap cannot backdate it.
   if proposed_since<>at_time then
     if r.last_sequence<0 or previous_since is null or proposed_since is distinct from previous_since
       or r.checkpoint->'decision'->'payload'->>'occupancy' is distinct from 'VACANT'
       or at_time-r.last_simulated_at>=((config->'payload'->'freshness'->>'stale_after_ms')::bigint*interval '1 millisecond')
       then raise exception 'Invalid vacancy continuity'; end if;
     for s in select value from jsonb_array_elements(p_tick->'samples') loop
       if r.checkpoint->'fusion'->'last_receipts'->>(s->>'node_id') is null or
         (s->>'observed_at')::timestamptz < (r.checkpoint->'fusion'->'last_receipts'->>(s->>'node_id'))::timestamptz or
         (s->>'observed_at')::timestamptz-(r.checkpoint->'fusion'->'last_receipts'->>(s->>'node_id'))::timestamptz>((config->'payload'->'freshness'->>'stale_after_ms')::bigint*interval '1 millisecond')
         then raise exception 'Vacancy receipt continuity lost'; end if;
     end loop;
   end if;
 end if;
 expected_policy:=public._sdp_cooling_policy(at_time,expected_occupancy,proposed_since,
   (forecast->'payload'->'next_use_window'->>'start')::timestamptz,(forecast->'payload'->>'planned_restart_at')::timestamptz);
 if d->'payload'->>'requested_mode' is distinct from expected_policy->>'mode' or
   d->'payload'->'requested_output' is distinct from expected_policy->'output' or
   (d->'payload'->>'vacancy_confirmed_at')::timestamptz is distinct from (expected_policy->>'vacancy_confirmed_at')::timestamptz
   then raise exception 'Cooling policy invariant violation'; end if;
 if r.last_sequence=-1 then
   perform pg_advisory_xact_lock(193804,1);
   select run_id into active_id from public.sdp_runs where status='ACTIVE' and run_id<>r.run_id;
   if active_id is not null and r.definition->>'replaces_active_run_id' is distinct from active_id::text then raise exception 'Active run replacement requires exact explicit acknowledgement'; end if;
   if active_id is not null then update public.sdp_runs set status='ARCHIVED',updated_at=now() where run_id=active_id; end if;
 end if;
 update public.sdp_runs set last_sequence=seq,last_simulated_at=at_time,checkpoint=p_tick->'checkpoint',status='ACTIVE',updated_at=now() where run_id=r.run_id;
 update public.sdp_hybrid_leases set expires_at=clock_timestamp()+interval '60 seconds' where run_id=r.run_id;
 return jsonb_build_object('ok',true,'duplicate',false,'sequence',seq);
end $$;

create function public.sdp_can_read_run(p_run_id uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,pg_temp as $$
 select exists(select 1 from public.sdp_runs r where r.run_id=p_run_id and r.status='ACTIVE' and
   (r.model_version='sdp-scripted-v1' or exists(select 1 from public.sdp_hybrid_readers a where a.run_id=r.run_id and a.user_id=auth.uid())));
$$;
drop policy sdp_read_runs on public.sdp_runs;
create policy sdp_read_runs on public.sdp_runs for select to anon,authenticated using(public.sdp_can_read_run(run_id));
do $$ declare t text; begin
 foreach t in array array['zones','nodes','frames','samples','events'] loop
   execute format('drop policy %I on public.%I','sdp_read_'||t,case t when 'frames' then 'sdp_zone_frames' when 'samples' then 'sdp_node_samples' else 'sdp_'||t end);
   execute format('create policy %I on public.%I for select to anon,authenticated using(public.sdp_can_read_run(run_id))','sdp_read_'||t,case t when 'frames' then 'sdp_zone_frames' when 'samples' then 'sdp_node_samples' else 'sdp_'||t end);
 end loop;
end $$;
-- Defend against permissive default function grants.
do $$ declare f record; begin
 for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and (proname like '%sdp%hybrid%' or proname in ('_sdp_exact_keys','_sdp_mode_guard','_sdp_cooling_policy','sdp_can_read_run','sdp_commit_tick')) loop
   execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 end loop;
end $$;
grant execute on function public.sdp_can_read_run(uuid) to anon,authenticated;
grant execute on function public.sdp_commit_tick(jsonb),public.sdp_hybrid_info(),public.sdp_hybrid_initialize_run(jsonb),public.sdp_hybrid_acquire_writer(uuid,uuid),public.sdp_hybrid_commit_tick(jsonb,uuid,bigint) to service_role;
commit;
