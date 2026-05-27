# MQTT Subscriber Service

Node.js service that subscribes to OmniSense telemetry messages from the MQTT broker.

This ticket only receives and logs MQTT telemetry. It does not insert into Supabase yet.

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
```

`MQTT_PASSWORD` is used for connecting but is never printed in logs.

## Behavior

- Connects to the MQTT broker.
- Subscribes to `omnisense/node/+/telemetry`.
- Logs connection, reconnect, offline, close, and error events.
- Validates incoming telemetry before future database inserts.
- Logs received topic, normalized `node_id`, and normalized telemetry JSON.
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

## Manual Validation Tests

Use MQTTX to publish manual test messages through HiveMQ Cloud while the subscriber is running.

MQTTX connection settings:

```text
Host: e30385d740794e6ab456cd2a6456ba78.s1.eu.hivemq.cloud
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

Not implemented yet:

- Supabase inserts
- Dashboard integration
- Crisis command handling
