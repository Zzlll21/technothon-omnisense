# Firmware Integration Guide

Audience: ESP32 firmware teammate.

This guide covers only what the ESP32 firmware needs to implement. The ESP32 should communicate through MQTT only.

## MQTT Broker Settings

Use the HiveMQ Cloud broker settings provided by the team:

```text
Host: your-hivemq-cloud-host
Port: 8883
SSL/TLS: ON
Username: from HiveMQ Access Credentials
Password: from HiveMQ Access Credentials
```

Do not hardcode real credentials in firmware committed to the repository.

## Telemetry Topic

Each ESP32 node publishes sensor telemetry to:

```text
omnisense/node/{node_id}/telemetry
```

Example:

```text
omnisense/node/demo-1/telemetry
```

The `{node_id}` in the topic is treated as the source of truth by the backend.

## Command Topic

Each ESP32 node should subscribe to:

```text
omnisense/node/{node_id}/command
```

Example:

```text
omnisense/node/demo-1/command
```

## Telemetry JSON Payload

Publish JSON with these required fields:

```json
{
  "node_id": "demo-1",
  "temperature": 24.8,
  "humidity": 61.5,
  "headcount": 3,
  "pmv": 0.2,
  "crisis_mode": false
}
```

Optional fields:

```json
{
  "recorded_at": "2026-05-27T03:45:00Z",
  "air_quality": 42.0,
  "hvac_state": {
    "mode": "cool",
    "fan": "auto",
    "setpoint": 24
  },
  "battery_voltage": 4.02,
  "firmware_version": "demo-0.1.0",
  "raw_sensor_summary": {
    "pir_motion": true,
    "co2_estimate": 680
  }
}
```

Full example:

```json
{
  "node_id": "demo-1",
  "recorded_at": "2026-05-27T03:45:00Z",
  "temperature": 24.8,
  "humidity": 61.5,
  "headcount": 3,
  "pmv": 0.2,
  "crisis_mode": false,
  "air_quality": 42.0,
  "hvac_state": {
    "mode": "cool",
    "fan": "auto",
    "setpoint": 24
  },
  "battery_voltage": 4.02,
  "firmware_version": "demo-0.1.0",
  "raw_sensor_summary": {
    "pir_motion": true,
    "co2_estimate": 680
  }
}
```

Use `headcount` only. Do not send an `occupancy` field. Dashboard/backend occupied status is derived from `headcount > 0`.

If the ESP32 cannot provide `recorded_at`, omit it. The backend/database path can use insert time later.

## Crisis Mode Command Handling

The ESP32 should listen for command payloads on its command topic.

Example crisis mode ON command:

```json
{
  "command": "SET_CRISIS_MODE",
  "enabled": true,
  "target_pmv_limit": 1.0,
  "reason": "grid_crisis_demo"
}
```

Expected firmware behavior:

- If `command` is `SET_CRISIS_MODE`, read `enabled`.
- If `enabled` is `true`, enter demo crisis mode behavior.
- If `enabled` is `false`, leave demo crisis mode behavior.
- Treat `target_pmv_limit` and `reason` as optional values for local behavior or debug logs.
- Ignore unknown command fields safely.

Suggested future command shape:

```json
{
  "command": "SET_HVAC_STATE",
  "hvac_state": {
    "mode": "cool",
    "fan": "auto",
    "setpoint": 25
  },
  "reason": "manual_dashboard_adjustment"
}
```

`SET_HVAC_STATE` is documented for alignment, but crisis mode is the main demo command.

## Database Boundary

The ESP32 must not call Supabase or any database API.

Database insertion is handled by the `mqtt-subscriber` backend:

```text
ESP32 -> MQTT broker -> mqtt-subscriber backend -> Supabase sensor_readings
```
