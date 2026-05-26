# Fake ESP32 Publisher

Node.js script that publishes fake ESP32 telemetry to the MQTT broker during local development and demos.

It publishes to:

```text
omnisense/node/demo-1/telemetry
```

The payload follows `docs/mqtt-contract.md` and uses `headcount` only. Dashboard/backend occupied status can be derived from `headcount > 0`.

## Setup

```powershell
npm install
Copy-Item .env.example .env
npm start
```

Fill in `.env` with your MQTT broker settings before running. Do not commit `.env`.

## Behavior

- Sends one payload immediately after connecting.
- Sends another payload every `FAKE_PUBLISH_INTERVAL_MS`.
- Cycles through normal, warm/high-PMV, and crisis-like readings.
- Logs every JSON payload it publishes.
- Stops cleanly with Ctrl+C.
