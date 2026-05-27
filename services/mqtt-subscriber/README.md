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
- Logs received topic, parsed topic `node_id`, and parsed telemetry JSON.
- Logs invalid JSON clearly without crashing.
- Stops cleanly with Ctrl+C.

Not implemented yet:

- Supabase inserts
- Payload validation beyond JSON parsing
- Dashboard integration
- Crisis command handling
