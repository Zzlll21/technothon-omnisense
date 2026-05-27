# MQTT Contract

This contract lets the ESP32 firmware, fake publisher, MQTT subscriber, Supabase schema, and dashboard agree on topic names and JSON fields.

No MQTT publishing, subscribing, database inserts, or dashboard behavior is implemented in this document.

## Topics

Telemetry readings are published by a node to:

```text
omnisense/node/{node_id}/telemetry
```

Commands are published by the backend to:

```text
omnisense/node/{node_id}/command
```

Examples:

```text
omnisense/node/nodeA/telemetry
omnisense/node/nodeB/telemetry
omnisense/node/nodeA/command
omnisense/node/nodeB/command
```

The `{node_id}` path value should match the `node_id` field in telemetry payloads. If they disagree, the subscriber should treat the topic value as the source of truth.

## Telemetry Payload

Use `recorded_at` as the timestamp field so it maps directly to the `sensor_readings.recorded_at` database column. If `recorded_at` is missing, the future database insert should use the database insert time.

Required fields:

| Field | Type | Notes |
| --- | --- | --- |
| `node_id` | string | Node identifier, for example `nodeA`. |
| `temperature` | number | Temperature in degrees Celsius. |
| `humidity` | number | Relative humidity percentage. |
| `headcount` | integer | Estimated people count near the node. Dashboard/backend occupied status is derived from `headcount > 0`. |
| `pmv` | number | Predicted mean vote comfort value. |
| `crisis_mode` | boolean | Whether crisis mode is active or being simulated for this reading. |

Optional fields:

| Field | Type | Notes |
| --- | --- | --- |
| `air_quality` | number | Optional air quality reading if a sensor is available. |
| `hvac_state` | object | Flexible HVAC state, such as mode, fan, and setpoint. |
| `recorded_at` | string | ISO 8601 timestamp, for example `2026-05-27T03:45:00Z`. If omitted, database insert time should be used later. |
| `battery_voltage` | number | ESP32 battery voltage if available. |
| `firmware_version` | string | Firmware version string. |
| `raw_sensor_summary` | object | Small debugging summary from firmware or fake publisher. |

Example telemetry payloads:

- `docs/sample-payloads/telemetry-nodeA.json`
- `docs/sample-payloads/telemetry-nodeB.json`

## Command Payloads

The command topic is reserved for backend-to-node instructions.

Supported commands for the hackathon demo:

| Command | Purpose |
| --- | --- |
| `SET_CRISIS_MODE` | Enable or disable crisis mode behavior. |
| `SET_HVAC_STATE` | Request a simple HVAC state change, such as fan mode or target setpoint. |

### SET_CRISIS_MODE

```json
{
  "command": "SET_CRISIS_MODE",
  "enabled": true,
  "target_pmv_limit": 1.0,
  "reason": "grid_crisis_demo"
}
```

Fields:

| Field | Type | Notes |
| --- | --- | --- |
| `command` | string | Must be `SET_CRISIS_MODE`. |
| `enabled` | boolean | `true` turns crisis mode on, `false` turns it off. |
| `target_pmv_limit` | number | Optional comfort limit for demo behavior. |
| `reason` | string | Optional reason for logs and demo explanation. |

Crisis command examples:

- `docs/sample-payloads/command-crisis-mode-on.json`
- `docs/sample-payloads/command-crisis-mode-off.json`

### SET_HVAC_STATE

Suggested shape for a later demo command:

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

This is documented for team alignment only. It is not implemented yet.

## Team Usage

- ESP32 firmware should publish telemetry to its own telemetry topic.
- The fake publisher should generate payloads with this same shape.
- The subscriber should subscribe to `omnisense/node/+/telemetry`, validate these fields, and map matching fields into `sensor_readings`.
- The subscriber should store the entire original telemetry JSON in `sensor_readings.raw_payload`, including optional fields that do not have dedicated database columns.
- The backend command publisher should publish command payloads to one node command topic.
- The dashboard should read database rows and call a backend endpoint later; it should not publish MQTT directly from the browser.
