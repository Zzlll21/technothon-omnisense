# Local Demo Runbook

Use this runbook for a fresh clone demo-day setup.

The local demo pipeline is:

```text
fake ESP32 publisher -> HiveMQ Cloud MQTT -> mqtt-subscriber -> Supabase sensor_readings -> dashboard
dashboard -> control-api -> HiveMQ Cloud MQTT command topic
```

## Prerequisites

- Git
- Node.js 20+ with npm
- HiveMQ Cloud broker
- Supabase project
- MQTTX for MQTT inspection and manual tests

On Windows PowerShell, use `npm.cmd` if `npm.ps1` is blocked.

## Install Dependencies

Run once after cloning:

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

## Environment Files

From the repo root, copy each template and fill in local values:

```powershell
Copy-Item services\mqtt-subscriber\.env.example services\mqtt-subscriber\.env
Copy-Item services\control-api\.env.example services\control-api\.env
Copy-Item scripts\fake-esp32-publisher\.env.example scripts\fake-esp32-publisher\.env
Copy-Item apps\dashboard\.env.example apps\dashboard\.env
```

Do not commit `.env` files.

### Backend Subscriber Env

File: `services/mqtt-subscriber/.env`

```text
MQTT_BROKER_URL=mqtts://your-hivemq-cloud-host:8883
MQTT_USERNAME=<from HiveMQ Access Credentials>
MQTT_PASSWORD=<from HiveMQ Access Credentials>
MQTT_TELEMETRY_TOPIC=omnisense/node/+/telemetry

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<backend-only service role or secret key>

MQTT_COMMAND_TOPIC_TEMPLATE=omnisense/node/{node_id}/command
NODE_ENV=development
```

`SUPABASE_SERVICE_ROLE_KEY` belongs only in this backend service.

### Control API Env

File: `services/control-api/.env`

```text
MQTT_BROKER_URL=mqtts://your-hivemq-cloud-host:8883
MQTT_USERNAME=<from HiveMQ Access Credentials>
MQTT_PASSWORD=<from HiveMQ Access Credentials>
MQTT_COMMAND_TOPIC_TEMPLATE=omnisense/node/{node_id}/command
PORT=3001
```

MQTT credentials stay backend-side. The dashboard never publishes MQTT directly.

### Fake Publisher Env

File: `scripts/fake-esp32-publisher/.env`

```text
MQTT_BROKER_URL=mqtts://your-hivemq-cloud-host:8883
MQTT_USERNAME=<from HiveMQ Access Credentials>
MQTT_PASSWORD=<from HiveMQ Access Credentials>
MQTT_TELEMETRY_TOPIC_TEMPLATE=omnisense/node/{node_id}/telemetry
FAKE_PUBLISH_INTERVAL_MS=3000
```

### Dashboard Env

File: `apps/dashboard/.env`

```text
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=<frontend-safe anon key>
VITE_API_BASE_URL=http://localhost:3001
```

You may use `VITE_SUPABASE_PUBLISHABLE_KEY` instead of `VITE_SUPABASE_ANON_KEY` if your Supabase project provides one.

Never put `SUPABASE_SERVICE_ROLE_KEY`, `sb_secret`, `MQTT_PASSWORD`, or MQTT credentials in dashboard files.

## Supabase Setup

1. Open Supabase.
2. Go to SQL Editor.
3. Run the SQL in `supabase/schema.sql`.
4. Confirm `public.sensor_readings` exists.
5. Enable row-level security on `public.sensor_readings`.
6. Add this demo SELECT policy so the dashboard can read rows:

```sql
create policy "Allow public read access for demo"
on public.sensor_readings
for select
to anon
using (true);
```

The backend subscriber uses the service role or secret key to insert rows. The dashboard uses only the anon or publishable key to read rows.

## HiveMQ Cloud Setup

Use HiveMQ Cloud over TLS:

```text
Host: your-hivemq-cloud-host
Port: 8883
SSL/TLS: ON
```

Create MQTT Access Credentials in HiveMQ Cloud.

Use the same MQTT credentials in:

- `scripts/fake-esp32-publisher/.env`
- `services/mqtt-subscriber/.env`
- `services/control-api/.env`
- ESP32 firmware

Firmware should use MQTT credentials only. Firmware should not use Supabase URLs, anon keys, service keys, or database APIs.

## Startup Order

Start one terminal per process.

Terminal 1, subscriber:

```powershell
cd services\mqtt-subscriber
npm start
```

Terminal 2, control API:

```powershell
cd services\control-api
npm start
```

Terminal 3, fake ESP32 publisher:

```powershell
cd scripts\fake-esp32-publisher
npm start
```

Terminal 4, dashboard:

```powershell
cd apps\dashboard
npm run dev
```

Open the Vite URL printed in Terminal 4.

## Demo Verification

1. Watch `services/mqtt-subscriber` logs. It should receive `omnisense/node/demo-1/telemetry`.
2. Open Supabase Table Editor and confirm new rows appear in `sensor_readings`.
3. Open the dashboard and confirm the overview card for `demo-1`.
4. Let the fake publisher run for a few minutes and confirm historical charts update.
5. Confirm Room Comfort Map shows `demo-1` in the Center zone.
6. In MQTTX, connect to HiveMQ Cloud and subscribe to:

```text
omnisense/node/demo-1/command
```

7. In the dashboard, click Enable Crisis Mode for `demo-1`.
8. Confirm MQTTX receives:

```json
{
  "command": "SET_CRISIS_MODE",
  "enabled": true,
  "target_pmv_limit": 1.0,
  "reason": "dashboard_demo"
}
```

9. Click Disable Crisis Mode and confirm MQTTX receives the same command with `enabled: false`.

## Manual Control API Test

With `services/control-api` running, you can test without the dashboard:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:3001/api/crisis `
  -ContentType "application/json" `
  -Body '{"node_id":"demo-1","enabled":true,"target_pmv_limit":1.0,"reason":"dashboard_demo"}'
```

Expected command topic:

```text
omnisense/node/demo-1/command
```

## MQTTX Validation Tests

MQTTX connection settings:

```text
Host: your-hivemq-cloud-host
Port: 8883
SSL/TLS: ON
Username: from HiveMQ Access Credentials
Password: from HiveMQ Access Credentials
```

Telemetry topic:

```text
omnisense/node/demo-1/telemetry
```

Invalid JSON test payload:

```text
{bad json
```

Missing `temperature` test payload:

```json
{
  "node_id": "demo-1",
  "humidity": 55,
  "headcount": 2,
  "pmv": 0.1,
  "crisis_mode": false
}
```

Mismatched body `node_id` test payload:

```json
{
  "node_id": "wrong-node",
  "temperature": 24.5,
  "humidity": 55,
  "headcount": 2,
  "pmv": 0.1,
  "crisis_mode": false
}
```

The subscriber should reject invalid messages without exiting. For mismatched `node_id`, the topic node ID wins.

## Troubleshooting

- Dashboard has no readings: confirm `sensor_readings` has rows and the Supabase SELECT policy exists.
- Dashboard shows config error or white page: create `apps/dashboard/.env`, fill `VITE_` variables, and restart `npm run dev`.
- Process connects to `mqtt://localhost:1883`: the `.env` file is missing, saved in the wrong folder, or the process was not restarted.
- MQTT auth fails: check HiveMQ Access Credentials, TLS port `8883`, and `mqtts://` broker URL.
- Crisis button does not publish: start `services/control-api`, check its MQTT env vars, and subscribe in MQTTX to `omnisense/node/demo-1/command`.
- Supabase inserts fail: check `SUPABASE_URL`, backend-only service key, and that the table exists.
- PowerShell blocks `npm.ps1`: run `npm.cmd` or adjust PowerShell execution policy.
- `.env` files must not be committed. Commit only `.env.example` files.

## Demo Stop

Press Ctrl+C in each terminal.

## Not Production-Ready

This demo setup does not include production auth, per-user permissions, durable command delivery, device provisioning, deployment automation, strict RLS policies, observability, or secret rotation.
