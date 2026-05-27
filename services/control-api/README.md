# Control API Service

Minimal backend API for publishing OmniSense MQTT control commands.

This service lets the dashboard request crisis mode without exposing MQTT credentials in browser code.

## Endpoint

```text
POST /api/crisis
```

Request body:

```json
{
  "node_id": "demo-1",
  "enabled": true,
  "target_pmv_limit": 1.0,
  "reason": "dashboard_demo"
}
```

Required fields:

```text
node_id string
enabled boolean
```

Optional fields:

```text
target_pmv_limit number
reason string
```

## MQTT Command

The API publishes to:

```text
omnisense/node/{node_id}/command
```

For `demo-1`, the topic is:

```text
omnisense/node/demo-1/command
```

Payload:

```json
{
  "command": "SET_CRISIS_MODE",
  "enabled": true,
  "target_pmv_limit": 1.0,
  "reason": "dashboard_demo"
}
```

## Setup

```powershell
npm install
Copy-Item .env.example .env
npm start
```

`npm start` loads `.env` with Node's `--env-file=.env` option.

## Required Environment Variables

```text
MQTT_BROKER_URL
MQTT_USERNAME
MQTT_PASSWORD
MQTT_COMMAND_TOPIC_TEMPLATE
PORT
```

Use real MQTT credentials only in your local `.env` file. Do not commit `.env`.
`MQTT_PASSWORD` is used for connecting but is never printed in logs.

## Manual Test With MQTTX

1. Start this control API.
2. In MQTTX, connect to HiveMQ Cloud with TLS enabled.
3. Subscribe to:

```text
omnisense/node/demo-1/command
```

4. Send a POST request:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:3001/api/crisis `
  -ContentType "application/json" `
  -Body '{"node_id":"demo-1","enabled":true,"target_pmv_limit":1.0,"reason":"dashboard_demo"}'
```

5. Confirm MQTTX receives the command payload on `omnisense/node/demo-1/command`.

To disable crisis mode, send:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:3001/api/crisis `
  -ContentType "application/json" `
  -Body '{"node_id":"demo-1","enabled":false,"target_pmv_limit":1.0,"reason":"dashboard_demo"}'
```

## Not Implemented Here

- Dashboard crisis button UI
- ESP32 command handling
- Supabase writes
- Telemetry validation changes
