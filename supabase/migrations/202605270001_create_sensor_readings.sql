-- OmniSense Smart HVAC prototype telemetry table.
-- Copy this file into the Supabase SQL Editor and run it manually.

create extension if not exists "pgcrypto";

create table if not exists public.sensor_readings (
  id uuid primary key default gen_random_uuid(),
  node_id text not null check (length(trim(node_id)) > 0),
  recorded_at timestamptz not null default now(),
  temperature numeric null,
  humidity numeric null,
  headcount integer null check (headcount is null or headcount >= 0),
  occupancy integer null check (occupancy is null or occupancy >= 0),
  pmv numeric null,
  crisis_mode boolean not null default false,
  hvac_state jsonb null,
  air_quality numeric null,
  raw_payload jsonb not null default '{}'::jsonb
);

create index if not exists sensor_readings_node_id_idx
  on public.sensor_readings (node_id);

create index if not exists sensor_readings_recorded_at_idx
  on public.sensor_readings (recorded_at desc);

create index if not exists sensor_readings_node_id_recorded_at_idx
  on public.sensor_readings (node_id, recorded_at desc);

comment on table public.sensor_readings is
  'Telemetry readings received from ESP32 nodes or the fake publisher.';

comment on column public.sensor_readings.node_id is
  'Node identifier from the MQTT topic, for example demo-1.';

comment on column public.sensor_readings.recorded_at is
  'Reading timestamp. Defaults to database insert time when the payload does not provide one.';

comment on column public.sensor_readings.temperature is
  'Temperature reading, expected in degrees Celsius for the prototype.';

comment on column public.sensor_readings.humidity is
  'Relative humidity percentage.';

comment on column public.sensor_readings.headcount is
  'Estimated number of people detected near the node.';

comment on column public.sensor_readings.occupancy is
  'Occupancy value for dashboard display. It may mirror headcount in the subscriber later.';

comment on column public.sensor_readings.pmv is
  'Predicted mean vote comfort score, if available.';

comment on column public.sensor_readings.crisis_mode is
  'Whether the reading was captured while crisis mode was active or requested.';

comment on column public.sensor_readings.hvac_state is
  'Flexible HVAC state object, for example mode, fan speed, setpoint, or device state.';

comment on column public.sensor_readings.air_quality is
  'Optional air quality reading if a sensor is available.';

comment on column public.sensor_readings.raw_payload is
  'Original MQTT JSON payload preserved for debugging and demo traceability.';

