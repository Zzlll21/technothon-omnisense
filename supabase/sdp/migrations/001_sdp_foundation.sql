-- Dedicated SDP project ONLY. Apply manually; never run against Technothon.
-- One transaction: a failed installation leaves no partially installed objects.
begin;
do $$ begin
  if to_regclass('public.sensor_readings') is not null then
    raise exception 'Refusing SDP installation: legacy sensor_readings exists. Use a dedicated project.';
  end if;
end $$;

create table public.sdp_runs (
  run_id uuid primary key,
  model_version text not null check (model_version = 'sdp-scripted-v1'),
  seed integer not null check (seed >= 0),
  status text not null default 'SEEDING' check (status in ('SEEDING','ACTIVE','ARCHIVED')),
  definition jsonb not null check (jsonb_typeof(definition) = 'object'),
  history_start timestamptz not null,
  live_anchor timestamptz not null,
  last_sequence bigint not null default -1 check (last_sequence >= -1),
  last_simulated_at timestamptz,
  checkpoint jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (live_anchor - history_start = interval '7 days'),
  check ((last_sequence = -1 and checkpoint is null and last_simulated_at is null)
      or (last_sequence >= 0 and checkpoint is not null and last_simulated_at is not null))
);
create unique index sdp_one_active_run on public.sdp_runs(status) where status = 'ACTIVE';

create table public.sdp_zones (
  run_id uuid not null references public.sdp_runs(run_id),
  zone_id text not null check (zone_id = 'zone-1'),
  room_id text not null,
  name text not null,
  config jsonb not null,
  primary key (run_id, zone_id)
);
create table public.sdp_nodes (
  run_id uuid not null,
  zone_id text not null,
  node_id text not null check (node_id in ('sim-1','sim-2')),
  label text not null,
  required boolean not null default true,
  x numeric not null check (x between 0 and 1),
  y numeric not null check (y between 0 and 1),
  primary key (run_id, node_id),
  unique (run_id, zone_id, node_id),
  foreign key (run_id, zone_id) references public.sdp_zones(run_id, zone_id)
);
create table public.sdp_zone_frames (
  run_id uuid not null,
  zone_id text not null,
  sequence bigint not null check (sequence >= 0),
  simulated_at timestamptz not null,
  inserted_at timestamptz not null default now(),
  phase text not null check (phase in ('HISTORY','CONTINUOUS')),
  occupancy text not null check (occupancy in ('OCCUPIED','VACANT','UNCERTAIN')),
  coverage text not null check (coverage in ('COMPLETE','DEGRADED','UNKNOWN')),
  decision_event_id text not null,
  forecast_event_id text not null,
  output_event_id text not null,
  commit_hash text not null,
  primary key (run_id, zone_id, sequence),
  unique (run_id, zone_id, simulated_at),
  foreign key (run_id, zone_id) references public.sdp_zones(run_id, zone_id)
);
create index sdp_frames_history on public.sdp_zone_frames(run_id, zone_id, simulated_at desc);

create table public.sdp_events (
  run_id uuid not null,
  zone_id text not null,
  sequence bigint not null,
  ordinal integer not null check (ordinal >= 0),
  event_id text not null,
  event_type text not null check (event_type in ('ZONE_CONFIG','NODE_EVIDENCE','ZONE_DECISION','ZONE_FORECAST','APPLIED_OUTPUT','OVERRIDE_REQUEST','OVERRIDE_STATUS')),
  occurred_at timestamptz not null,
  inserted_at timestamptz not null default now(),
  event jsonb not null,
  primary key (run_id, event_id),
  unique (run_id, zone_id, event_id),
  unique (run_id, zone_id, sequence, ordinal),
  foreign key (run_id, zone_id, sequence) references public.sdp_zone_frames(run_id, zone_id, sequence),
  -- Ordinary CHECK accepts SQL NULL; IS TRUE also rejects missing JSON keys.
  check ((event->>'schema_version' = 'sdp.v1-draft.1') is true),
  check ((event->>'event_id' = event_id and event->>'event_type' = event_type) is true),
  check ((event->>'session_id' = run_id::text and event->>'zone_id' = zone_id) is true),
  check ((event->'clock'->>'time_base' = 'REPLAY' and event->'clock'->>'replay_id' = run_id::text) is true),
  check ((event->'data_sources' = '["SIMULATED"]'::jsonb) is true),
  check ((jsonb_typeof(event->'payload') = 'object') is true)
);
create index sdp_events_timeline on public.sdp_events(run_id, zone_id, occurred_at, sequence, ordinal);
create index sdp_events_by_type on public.sdp_events(run_id, zone_id, event_type, occurred_at desc);
create unique index sdp_decision_commands on public.sdp_events(run_id, (event->'payload'->>'command_id')) where event_type = 'ZONE_DECISION';

create table public.sdp_node_samples (
  run_id uuid not null,
  zone_id text not null,
  sequence bigint not null,
  node_id text not null,
  observed_at timestamptz not null,
  inserted_at timestamptz not null default now(),
  temperature_c double precision not null check (temperature_c between 15 and 40),
  humidity_percent double precision not null check (humidity_percent between 0 and 100),
  evidence_event_id text not null,
  primary key (run_id, zone_id, sequence, node_id),
  foreign key (run_id, zone_id, sequence) references public.sdp_zone_frames(run_id, zone_id, sequence),
  foreign key (run_id, zone_id, node_id) references public.sdp_nodes(run_id, zone_id, node_id),
  foreign key (run_id, zone_id, evidence_event_id) references public.sdp_events(run_id, zone_id, event_id)
);
create index sdp_samples_history on public.sdp_node_samples(run_id, node_id, observed_at desc);
alter table public.sdp_zone_frames
  add foreign key (run_id, zone_id, decision_event_id) references public.sdp_events(run_id, zone_id, event_id) deferrable initially deferred,
  add foreign key (run_id, zone_id, forecast_event_id) references public.sdp_events(run_id, zone_id, event_id) deferrable initially deferred,
  add foreign key (run_id, zone_id, output_event_id) references public.sdp_events(run_id, zone_id, event_id) deferrable initially deferred;

-- Browser readers see only the fully seeded active run. No browser writes.
alter table public.sdp_runs enable row level security;
alter table public.sdp_zones enable row level security;
alter table public.sdp_nodes enable row level security;
alter table public.sdp_zone_frames enable row level security;
alter table public.sdp_node_samples enable row level security;
alter table public.sdp_events enable row level security;
create policy sdp_read_runs on public.sdp_runs for select to anon, authenticated using (status = 'ACTIVE');
create policy sdp_read_zones on public.sdp_zones for select to anon, authenticated using (exists (select 1 from public.sdp_runs r where r.run_id = sdp_zones.run_id and r.status = 'ACTIVE'));
create policy sdp_read_nodes on public.sdp_nodes for select to anon, authenticated using (exists (select 1 from public.sdp_runs r where r.run_id = sdp_nodes.run_id and r.status = 'ACTIVE'));
create policy sdp_read_frames on public.sdp_zone_frames for select to anon, authenticated using (exists (select 1 from public.sdp_runs r where r.run_id = sdp_zone_frames.run_id and r.status = 'ACTIVE'));
create policy sdp_read_samples on public.sdp_node_samples for select to anon, authenticated using (exists (select 1 from public.sdp_runs r where r.run_id = sdp_node_samples.run_id and r.status = 'ACTIVE'));
create policy sdp_read_events on public.sdp_events for select to anon, authenticated using (exists (select 1 from public.sdp_runs r where r.run_id = sdp_events.run_id and r.status = 'ACTIVE'));
revoke all on public.sdp_runs, public.sdp_zones, public.sdp_nodes, public.sdp_zone_frames, public.sdp_node_samples, public.sdp_events from public, anon, authenticated, service_role;
grant select on public.sdp_runs, public.sdp_zones, public.sdp_nodes, public.sdp_zone_frames, public.sdp_node_samples, public.sdp_events to anon, authenticated;
-- service_role can only write through the explicitly granted definer functions.

create function public.sdp_generator_info() returns jsonb
language sql security definer set search_path = pg_catalog, pg_temp as $$
  select jsonb_build_object('installation', 'omnisense-sdp-isolated-v1', 'model_version', 'sdp-scripted-v1', 'legacy_present', to_regclass('public.sensor_readings') is not null);
$$;

create function public.sdp_initialize_run(p_run jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare r public.sdp_runs; n jsonb;
begin
  if to_regclass('public.sensor_readings') is not null then raise exception 'Legacy project refused'; end if;
  if p_run->>'model_version' is distinct from 'sdp-scripted-v1'
    or p_run->'config'->>'event_type' is distinct from 'ZONE_CONFIG'
    or p_run->'config'->>'zone_id' is distinct from 'zone-1'
    or p_run->'config'->>'session_id' is distinct from p_run->>'run_id'
    or jsonb_array_length(p_run->'config'->'payload'->'required_nodes') is distinct from 2
  then raise exception 'Invalid run definition'; end if;
  insert into public.sdp_runs(run_id, model_version, seed, definition, history_start, live_anchor)
    values ((p_run->>'run_id')::uuid, p_run->>'model_version', (p_run->>'seed')::integer, p_run, (p_run->>'history_start')::timestamptz, (p_run->>'live_anchor')::timestamptz)
    on conflict (run_id) do nothing;
  select * into strict r from public.sdp_runs where run_id = (p_run->>'run_id')::uuid for update;
  if r.definition is distinct from p_run then raise exception 'Run ID already has different immutable configuration'; end if;
  insert into public.sdp_zones values (r.run_id, 'zone-1', 'demo-room', 'SDP Demo Cooling Zone', p_run->'config') on conflict do nothing;
  for n in select value from jsonb_array_elements(p_run->'config'->'payload'->'required_nodes') loop
    insert into public.sdp_nodes values (r.run_id, 'zone-1', n->>'node_id', n->>'label', true, (n->>'x')::numeric, (n->>'y')::numeric) on conflict do nothing;
  end loop;
  return jsonb_build_object('definition', r.definition, 'checkpoint', r.checkpoint, 'status', r.status);
end $$;

create function public.sdp_get_run(p_run_id uuid) returns jsonb
language sql security definer set search_path = pg_catalog, pg_temp as $$
  select jsonb_build_object('definition', definition, 'checkpoint', checkpoint, 'status', status) from public.sdp_runs where run_id = p_run_id;
$$;

create function public.sdp_commit_tick(p_tick jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  r public.sdp_runs; f jsonb := p_tick->'frame'; s jsonb; e jsonb; d jsonb; a jsonb; forecast jsonb;
  seq bigint := (f->>'sequence')::bigint;
  at_time timestamptz := (f->>'simulated_at')::timestamptz;
  digest text := encode(sha256(convert_to(p_tick::text, 'UTF8')), 'hex');
  previous_hash text; i integer := 0;
begin
  select * into strict r from public.sdp_runs where run_id = (p_tick->>'run_id')::uuid for update;
  select commit_hash into previous_hash from public.sdp_zone_frames where run_id = r.run_id and zone_id = 'zone-1' and sequence = seq;
  if found then
    if previous_hash <> digest then raise exception 'Conflicting retry for committed sequence'; end if;
    return jsonb_build_object('ok', true, 'duplicate', true, 'sequence', seq);
  end if;
  if r.status = 'ARCHIVED' then raise exception 'Archived run cannot advance'; end if;
  if seq is distinct from r.last_sequence + 1 or (p_tick->>'expected_sequence')::bigint is distinct from r.last_sequence then raise exception 'Checkpoint conflict; reload run'; end if;
  if at_time is distinct from (case when seq = 0 then r.history_start when r.last_simulated_at < r.live_anchor then least(r.last_simulated_at + interval '5 minutes', r.live_anchor) else r.last_simulated_at + interval '30 seconds' end)
    or at_time > clock_timestamp() + interval '5 seconds'
    or f->>'phase' is distinct from (case when at_time <= r.live_anchor then 'HISTORY' else 'CONTINUOUS' end)
    or p_tick->'checkpoint'->>'simulated_at' is distinct from f->>'simulated_at'
    or (p_tick->'checkpoint'->>'sequence')::bigint is distinct from seq
  then raise exception 'Invalid simulation timestamp/phase/checkpoint'; end if;
  if jsonb_array_length(p_tick->'samples') is distinct from 2 then raise exception 'Exactly two node samples required'; end if;
  insert into public.sdp_zone_frames values (r.run_id, 'zone-1', seq, at_time, now(), f->>'phase', f->>'occupancy', f->>'coverage', f->>'decision_event_id', f->>'forecast_event_id', f->>'output_event_id', digest);
  for e in select value from jsonb_array_elements(p_tick->'events') loop
    if (e->>'occurred_at')::timestamptz is distinct from at_time then raise exception 'Event must belong to this snapshot time'; end if;
    insert into public.sdp_events values (r.run_id, 'zone-1', seq, i, e->>'event_id', e->>'event_type', at_time, now(), e);
    i := i + 1;
  end loop;
  for s in select value from jsonb_array_elements(p_tick->'samples') loop
    select event into strict e from public.sdp_events where run_id = r.run_id and event_id = s->>'evidence_event_id';
    if e->>'event_type' is distinct from 'NODE_EVIDENCE'
      or e->'payload'->>'node_id' is distinct from s->>'node_id'
      or (s->>'observed_at')::timestamptz is distinct from at_time
      or e->'payload'->'temperature_c'->'value' is distinct from s->'temperature_c'
      or e->'payload'->'humidity_percent'->'value' is distinct from s->'humidity_percent'
      or (e->>'occurred_at')::timestamptz is distinct from at_time
    then raise exception 'Sample does not match evidence'; end if;
    insert into public.sdp_node_samples values (r.run_id, 'zone-1', seq, s->>'node_id', at_time, now(), (s->>'temperature_c')::double precision, (s->>'humidity_percent')::double precision, s->>'evidence_event_id');
  end loop;
  select event into strict d from public.sdp_events where run_id = r.run_id and event_id = f->>'decision_event_id' and event_type = 'ZONE_DECISION';
  select event into strict a from public.sdp_events where run_id = r.run_id and event_id = f->>'output_event_id' and event_type = 'APPLIED_OUTPUT';
  select event into strict forecast from public.sdp_events where run_id = r.run_id and event_id = f->>'forecast_event_id' and event_type = 'ZONE_FORECAST';
  if d->'payload'->>'occupancy' is distinct from f->>'occupancy'
    or d->'payload'->>'coverage' is distinct from f->>'coverage'
    or a->'payload'->>'decision_event_id' is distinct from d->>'event_id'
    or a->'payload'->>'command_id' is distinct from d->'payload'->>'command_id'
    or a->'payload'->>'status' is distinct from 'APPLIED'
    or a->'payload'->>'feedback_basis' is distinct from 'SIMULATED'
    or a->'payload'->'reported_output' is distinct from d->'payload'->'requested_output'
    or p_tick->'checkpoint'->'decision' is distinct from d
    or p_tick->'checkpoint'->'forecast' is distinct from forecast
    or p_tick->'checkpoint'->'output' is distinct from a
  then raise exception 'Decision/output/checkpoint correlation invalid'; end if;
  if not exists (select 1 from public.sdp_events where run_id = r.run_id and event_id = d->'payload'->>'config_event_id' and event_type = 'ZONE_CONFIG')
    or not exists (select 1 from public.sdp_events where run_id = r.run_id and event_id = d->'payload'->>'forecast_event_id' and event_type = 'ZONE_FORECAST')
  then raise exception 'Missing decision configuration/forecast reference'; end if;
  for s in select value from jsonb_array_elements(d->'payload'->'node_states') loop
    if not exists (select 1 from public.sdp_events ev where ev.run_id = r.run_id and ev.event_id = s->>'evidence_event_id' and ev.event_type = 'NODE_EVIDENCE' and ev.event->'payload'->>'node_id' = s->>'node_id') then raise exception 'Missing decision evidence reference'; end if;
  end loop;
  -- Publication is atomic with the final seed frame, not a client-side toggle.
  if at_time = r.live_anchor then
    perform pg_advisory_xact_lock(193804, 1);
    update public.sdp_runs set status = 'ARCHIVED', updated_at = now() where status = 'ACTIVE' and run_id <> r.run_id;
  end if;
  update public.sdp_runs set last_sequence = seq, last_simulated_at = at_time,
    checkpoint = p_tick->'checkpoint', updated_at = now(),
    status = case when at_time >= live_anchor then 'ACTIVE' else 'SEEDING' end where run_id = r.run_id;
  return jsonb_build_object('ok', true, 'duplicate', false, 'sequence', seq);
end $$;

-- Supabase functions otherwise receive PUBLIC execution privileges by default.
revoke all on function public.sdp_generator_info(), public.sdp_initialize_run(jsonb), public.sdp_get_run(uuid), public.sdp_commit_tick(jsonb) from public, anon, authenticated;
grant execute on function public.sdp_generator_info(), public.sdp_initialize_run(jsonb), public.sdp_get_run(uuid), public.sdp_commit_tick(jsonb) to service_role;
commit;
