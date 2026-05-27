# MQTT Subscriber Service

Node.js service that subscribes to OmniSense telemetry messages from the MQTT broker.

This service receives MQTT telemetry, validates it, normalizes it, and inserts valid readings into Supabase.

## Topic

```text
omnisense/node/+/telemetry
```

Example publisher topic:

```text
omnisense/node/demo-1/telemetry
```

## Setup

```powershell
npm install
Copy-Item .env.example .env
npm start
```

Fill in `.env` with your MQTT broker settings before running. Do not commit `.env`.
`npm start` loads this file with Node's `--env-file=.env` option.

## Required Environment Variables

```text
MQTT_BROKER_URL
MQTT_USERNAME
MQTT_PASSWORD
MQTT_TELEMETRY_TOPIC
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

`MQTT_PASSWORD` is used for connecting but is never printed in logs.
`SUPABASE_SERVICE_ROLE_KEY` is used only by this backend service and is never printed in logs.

## Behavior

- Connects to the MQTT broker.
- Subscribes to `omnisense/node/+/telemetry`.
- Logs connection, reconnect, offline, close, and error events.
- Validates incoming telemetry before future database inserts.
- Logs received topic, normalized `node_id`, and normalized telemetry JSON.
- Inserts valid normalized telemetry into `sensor_readings`.
- Logs insert failures clearly and keeps running.
- Logs invalid JSON or invalid telemetry clearly without crashing.
- Stops cleanly with Ctrl+C.

## Validation Rules

Accepted telemetry must arrive on `omnisense/node/{node_id}/telemetry`.
The topic `node_id` is the source of truth. If the payload `node_id` differs, the subscriber logs a warning and uses the topic value.

Required fields:

```text
temperature number
humidity number
headcount integer >= 0
pmv number
crisis_mode boolean
```

Optional normalized fields:

```text
recorded_at
hvac_state
air_quality
```

Unknown extra fields are not promoted into normalized telemetry. They remain preserved inside `raw_payload`.

## Supabase Insert Mapping

Validated telemetry maps to `sensor_readings` like this:

```text
node_id -> node_id
recorded_at -> recorded_at, only if provided
temperature -> temperature
humidity -> humidity
headcount -> headcount
pmv -> pmv
crisis_mode -> crisis_mode
hvac_state -> hvac_state, only if provided
air_quality -> air_quality, only if provided
raw_payload -> raw_payload
```

The full original parsed MQTT JSON is stored in `raw_payload`. Unknown extra fields are preserved there and are not inserted as separate top-level columns.

## Manual Insert Test

1. Confirm the `sensor_readings` table exists in Supabase.
2. Fill `services/mqtt-subscriber/.env` with MQTT and Supabase values.
3. Start the subscriber:

```powershell
npm start
```

4. Start the fake publisher in another terminal:

```powershell
cd ..\..\scripts\fake-esp32-publisher
npm start
```

5. Open Supabase Table Editor and select `sensor_readings`.
6. Confirm new rows appear.
7. Confirm `raw_payload` contains the original telemetry JSON.
8. Temporarily use an invalid Supabase service role key and restart the subscriber. Confirm insert errors are logged but the subscriber keeps running.

## Manual Validation Tests

Use MQTTX to publish manual test messages through HiveMQ Cloud while the subscriber is running.

MQTTX connection settings:

```text
Host: your-hivemq-cloud-host
Port: 8883
SSL/TLS: ON
Username: from HiveMQ Access Credentials
Password: from HiveMQ Access Credentials
```

Do not commit or paste the real password into repository files.

Publish each test message to:

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

Out of scope for this service:

- Dashboard rendering
- Crisis command publishing, handled by `services/control-api`
