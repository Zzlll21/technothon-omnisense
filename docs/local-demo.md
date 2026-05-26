# Local Demo Notes

These notes cover the fake ESP32 MQTT publisher only. The MQTT subscriber, Supabase inserts, dashboard, and crisis command handling are not implemented yet.

## Fake Publisher Setup

From `scripts/fake-esp32-publisher`:

```powershell
npm install
Copy-Item .env.example .env
npm start
```

Required environment variables:

```text
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_USERNAME=
MQTT_PASSWORD=
MQTT_TELEMETRY_TOPIC_TEMPLATE=omnisense/node/{node_id}/telemetry
FAKE_PUBLISH_INTERVAL_MS=3000
```

Leave `MQTT_USERNAME` and `MQTT_PASSWORD` blank for a local broker with no authentication. Use real credentials only in your local `.env` file.

## Verify With MQTT Client

Subscribe to the demo telemetry topic:

```bash
mosquitto_sub -h localhost -p 1883 -t "omnisense/node/demo-1/telemetry" -v
```

If your broker requires credentials:

```bash
mosquitto_sub -h localhost -p 1883 -u "<username>" -P "<password>" -t "omnisense/node/demo-1/telemetry" -v
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
