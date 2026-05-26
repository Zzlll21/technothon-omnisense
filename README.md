# OmniSense Smart HVAC Prototype

Hackathon prototype architecture:

```text
ESP32 or fake publisher -> MQTT broker -> MQTT subscriber -> Supabase -> React dashboard
```

This repository currently contains the initial project structure and safe configuration templates only. MQTT handling, database inserts, dashboard screens, and crisis mode are intentionally not implemented yet.

## Project Structure

```text
apps/
  dashboard/                 React dashboard placeholder
services/
  mqtt-subscriber/           MQTT-to-Supabase subscriber placeholder
scripts/
  fake-esp32-publisher/      Fake ESP32 telemetry publisher placeholder
supabase/
  schema.sql                 Database schema for manual Supabase setup
.env.example                 Root reference for all environment variables
README.md                    Project overview and setup notes
```

## Local Setup

1. Copy the relevant `.env.example` file for the part you are working on.
2. Rename the copy to `.env`.
3. Fill in local MQTT and Supabase values.
4. Keep `.env` files private. They are ignored by git.

For quick reference:

- Backend subscriber config: `services/mqtt-subscriber/.env.example`
- Dashboard config: `apps/dashboard/.env.example`
- Fake publisher config: `scripts/fake-esp32-publisher/.env.example`
- Full variable reference: `.env.example`

## Environment Notes

- Frontend variables use the `VITE_` prefix because they may be exposed to browser code.
- Backend secrets, especially `SUPABASE_SERVICE_ROLE_KEY`, belong only in backend/service `.env` files.
- Do not place service-role keys or MQTT passwords in frontend `.env` files.

## Current Status

Implemented:

- Minimal repository structure
- Safe placeholder environment templates
- README setup notes
- Supabase `sensor_readings` schema for telemetry storage

## Supabase Schema Setup

To create the telemetry table manually:

1. Open your Supabase project.
2. Go to SQL Editor.
3. Copy the contents of `supabase/schema.sql`.
4. Run the SQL.

The migration version is also available at `supabase/migrations/202605270001_create_sensor_readings.sql`.

### Manual Insert Example

```sql
insert into public.sensor_readings (
  node_id,
  temperature,
  humidity,
  headcount,
  occupancy,
  pmv,
  crisis_mode,
  hvac_state,
  air_quality,
  raw_payload
) values (
  'demo-1',
  24.8,
  61.5,
  3,
  3,
  0.2,
  false,
  '{"mode":"cool","fan":"auto","setpoint":24}'::jsonb,
  null,
  '{"temperature":24.8,"humidity":61.5,"headcount":3,"pmv":0.2}'::jsonb
);
```

### Latest Reading Query

```sql
select *
from public.sensor_readings
where node_id = 'demo-1'
order by recorded_at desc
limit 1;
```

### Historical Readings Query

```sql
select *
from public.sensor_readings
where node_id = 'demo-1'
order by recorded_at asc;
```

Not implemented yet:

- MQTT subscriber connection or message handling
- Telemetry validation
- Supabase inserts or queries
- React dashboard application
- Historical charts, heatmap, or crisis mode
- Fake ESP32 publishing logic
