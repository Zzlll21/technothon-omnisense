# Fake ESP32 Publisher

Placeholder for a script that will publish fake ESP32 telemetry to the MQTT broker during local development and demos.

Planned responsibilities:

- Publish fake telemetry to `omnisense/node/{node_id}/telemetry`
- Send values on a configurable interval
- Provide a fallback when physical ESP32 hardware is unavailable

No fake publishing logic is implemented yet.

