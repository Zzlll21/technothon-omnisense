# OmniSense Smart HVAC Prototype

Hackathon prototype pipeline:

```text
fake ESP32 publisher -> HiveMQ Cloud MQTT -> mqtt-subscriber -> Supabase -> React dashboard
                                                   dashboard -> control-api -> HiveMQ MQTT command
```

The local demo uses cloud MQTT and Supabase, with four local processes:

- `services/mqtt-subscriber`: receives telemetry and inserts valid rows into Supabase.
- `services/control-api`: accepts dashboard crisis-mode requests and publishes MQTT commands.
- `scripts/fake-esp32-publisher`: simulates ESP32 telemetry for `demo-1`.
- `apps/dashboard`: shows overview cards, historical charts, room comfort map, and crisis controls.

## Prerequisites

- Git
- Node.js 20+ with npm
- HiveMQ Cloud broker
- Supabase project
- MQTTX for MQTT testing

On Windows PowerShell, use `npm.cmd` if `npm.ps1` is blocked.

## Project Structure

```text
apps/dashboard/                 React dashboard
services/mqtt-subscriber/       MQTT telemetry -> Supabase backend
services/control-api/           Dashboard control API -> MQTT command backend
scripts/fake-esp32-publisher/   Fake ESP32 telemetry publisher
supabase/schema.sql             Manual Supabase schema setup
docs/local-demo.md              Full demo-day runbook
docs/demo-checklist.md          Rehearsal and presentation checklist
docs/mqtt-contract.md           MQTT topic and JSON payload contract
```

## Fresh Clone Setup

Install dependencies in each runnable workspace:

```powershell
cd services\mqtt-subscriber
npm install

cd ..\control-api
npm install

cd ..\..\scripts\fake-esp32-publisher
npm install

cd ..\..\apps\dashboard
npm install
```

From the repo root, copy env templates:

```powershell
Copy-Item services\mqtt-subscriber\.env.example services\mqtt-subscriber\.env
Copy-Item services\control-api\.env.example services\control-api\.env
Copy-Item scripts\fake-esp32-publisher\.env.example scripts\fake-esp32-publisher\.env
Copy-Item apps\dashboard\.env.example apps\dashboard\.env
```

Never commit `.env` files. They are ignored by git.

## Environment Files

Backend-only files:

- `services/mqtt-subscriber/.env`
- `services/control-api/.env`
- `scripts/fake-esp32-publisher/.env`

These may contain MQTT credentials. `services/mqtt-subscriber/.env` also contains `SUPABASE_SERVICE_ROLE_KEY`. These values must not be placed in dashboard files.

Frontend-safe file:

- `apps/dashboard/.env`

Only use `VITE_` variables here:

```text
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_API_BASE_URL=http://localhost:3001
```

## Supabase Setup

1. Open Supabase SQL Editor.
2. Run `supabase/schema.sql`.
3. Enable row-level security on `public.sensor_readings`.
4. Add a demo read policy for the dashboard:

```sql
create policy "Allow public read access for demo"
on public.sensor_readings
for select
to anon
using (true);
```

Use the Supabase service role or secret key only in `services/mqtt-subscriber/.env`.

## HiveMQ Setup

Use HiveMQ Cloud over TLS:

```text
Host: your-hivemq-cloud-host
Port: 8883
SSL/TLS: ON
```

Create MQTT Access Credentials in HiveMQ Cloud. Use those MQTT credentials in the fake publisher, subscriber, control API, and ESP32 firmware. Firmware should never use Supabase keys.

## Demo Startup Order

Terminal 1:

```powershell
cd services\mqtt-subscriber
npm start
```

Terminal 2:

```powershell
cd services\control-api
npm start
```

Terminal 3:

```powershell
cd scripts\fake-esp32-publisher
npm start
```

Terminal 4:

```powershell
cd apps\dashboard
npm run dev
```

Open the Vite URL printed by the dashboard.

## Demo Verification

- Supabase `sensor_readings` receives rows.
- Dashboard overview shows `demo-1`.
- Historical charts update after a few minutes of fake telemetry.
- Room Comfort Map shows `demo-1` in the Center zone.
- MQTTX subscribed to `omnisense/node/demo-1/command` receives crisis commands.
- Dashboard Enable/Disable Crisis Mode buttons publish `SET_CRISIS_MODE` through `services/control-api`.

## Troubleshooting

- Dashboard has no readings: check Supabase RLS SELECT policy.
- Dashboard white page or config error: create `apps/dashboard/.env`, fill `VITE_` values, and restart `npm run dev`.
- MQTT connects to `mqtt://localhost:1883`: save the correct `.env` file and restart the process. Node only reads `--env-file=.env` at startup.
- PowerShell blocks `npm.ps1`: use `npm.cmd` or adjust PowerShell execution policy.
- MQTTX sees no crisis command: start `services/control-api`, confirm MQTT credentials, and subscribe to `omnisense/node/demo-1/command`.
- Never commit `.env` files or paste real passwords/service keys into docs.

See [docs/local-demo.md](docs/local-demo.md) for the longer runbook and [docs/demo-checklist.md](docs/demo-checklist.md) for rehearsal.

## Not Production-Ready

This is a hackathon demo. It does not include production auth, API rate limiting, durable command queues, device identity management, deployment automation, or production-grade RLS policies.
