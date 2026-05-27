# Local Demo Notes

These notes cover the fake ESP32 MQTT publisher and MQTT subscriber through Supabase inserts. Dashboard and crisis command handling are not implemented yet.

## MQTT Subscriber Setup

From `services/mqtt-subscriber`:

```powershell
npm install
Copy-Item .env.example .env
npm start
```

Fill in `.env` with the same MQTT broker settings used by the fake publisher.
Also fill `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for the backend subscriber. Do not commit `.env` or paste the service role key into docs.
`npm start` loads `.env` with Node's `--env-file=.env` option.

The subscriber listens on:

```text
omnisense/node/+/telemetry
```

Valid telemetry is inserted into:

```text
public.sensor_readings
```

## Fake Publisher Setup

From `scripts/fake-esp32-publisher`:

```powershell
npm install
Copy-Item .env.example .env
npm start
```

Required environment variables:

```text
MQTT_BROKER_URL=mqtts://e30385d740794e6ab456cd2a6456ba78.s1.eu.hivemq.cloud:8883
MQTT_USERNAME=<from HiveMQ Access Credentials>
MQTT_PASSWORD=<from HiveMQ Access Credentials>
MQTT_TELEMETRY_TOPIC_TEMPLATE=omnisense/node/{node_id}/telemetry
FAKE_PUBLISH_INTERVAL_MS=3000
```

Use real credentials only in your local `.env` file. Do not commit or paste the real password into repository files.
`npm start` loads `.env` with Node's `--env-file=.env` option.

## Verify With MQTTX

To test the app-to-app MQTT path, run the subscriber in one terminal and the fake publisher in another terminal. The subscriber should log messages from:

```text
omnisense/node/demo-1/telemetry
```

After valid telemetry arrives, the subscriber should also log a successful Supabase insert. Open Supabase Table Editor and confirm new rows appear in `sensor_readings`.

You can also inspect and publish messages directly with MQTTX.

MQTTX connection settings:

```text
Host: e30385d740794e6ab456cd2a6456ba78.s1.eu.hivemq.cloud
Port: 8883
SSL/TLS: ON
Username: from HiveMQ Access Credentials
Password: from HiveMQ Access Credentials
```

To test validation, publish invalid JSON in MQTTX to `omnisense/node/demo-1/telemetry` and confirm the subscriber rejects it without exiting:

```text
{bad json
```

To test a missing field, publish this payload in MQTTX to `omnisense/node/demo-1/telemetry`:

```json
{
  "node_id": "demo-1",
  "humidity": 55,
  "headcount": 2,
  "pmv": 0.1,
  "crisis_mode": false
}
```

To test topic `node_id` precedence, publish this mismatched payload in MQTTX to `omnisense/node/demo-1/telemetry` and confirm the subscriber uses `demo-1`:

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

Expected topic:

```text
omnisense/node/demo-1/telemetry
```

Expected payload shape:

```json
{
  "node_id": "demo-1",
  "recorded_at": "2026-05-27T03:45:00.000Z",
  "temperature": 24.2,
  "humidity": 58,
  "headcount": 2,
  "pmv": 0.2,
  "crisis_mode": false,
  "hvac_state": {
    "mode": "cool",
    "fan": "auto",
    "setpoint": 24
  },
  "battery_voltage": 4.1,
  "firmware_version": "fake-demo-0.1.0",
  "raw_sensor_summary": {
    "scenario": "normal",
    "sequence": 0,
    "occupied": true
  }
}
```

## Stop The Publisher

Press Ctrl+C in the terminal running `npm start`. The script closes the MQTT connection before exiting.
