# Demo Verification Checklist

Use this checklist before demo day and during rehearsal. Work from top to bottom and mark each item only after someone sees it pass.

## 1. Pre-Demo Setup

- [ ] Node.js 20+ is installed.
- [ ] Git repo is cloned on the demo laptop.
- [ ] HiveMQ Cloud broker is created and available.
- [ ] Supabase project is created and accessible.
- [ ] MQTTX is installed for MQTT inspection.
- [ ] `services/mqtt-subscriber/.env` exists and was copied from `.env.example`.
- [ ] `services/control-api/.env` exists and was copied from `.env.example`.
- [ ] `scripts/fake-esp32-publisher/.env` exists and was copied from `.env.example`.
- [ ] `apps/dashboard/.env` exists and was copied from `.env.example`.
- [ ] No real credentials are pasted into README files, docs, screenshots, or slides.

## 2. Cloud Services Verification

- [ ] HiveMQ Cloud host is reachable on port `8883` with SSL/TLS enabled.
- [ ] MQTT Access Credentials work in MQTTX.
- [ ] MQTTX can connect without using anonymous access.
- [ ] Supabase `public.sensor_readings` table exists.
- [ ] Supabase row-level security is enabled on `public.sensor_readings`.
- [ ] Demo SELECT policy exists so the dashboard can read `sensor_readings`.
- [ ] Supabase service role or secret key is used only in `services/mqtt-subscriber/.env`.
- [ ] Dashboard `.env` uses only frontend-safe `VITE_` values.

## 3. Startup Order

Start one terminal per process.

- [ ] Terminal 1: start `services/mqtt-subscriber`.

```powershell
cd services\mqtt-subscriber
npm start
```

- [ ] Terminal 2: start `services/control-api`.

```powershell
cd services\control-api
npm start
```

- [ ] Terminal 3: start fake ESP32 publisher or real ESP32.

```powershell
cd scripts\fake-esp32-publisher
npm start
```

- [ ] Terminal 4: start dashboard.

```powershell
cd apps\dashboard
npm run dev
```

- [ ] Dashboard opens in the browser at the Vite URL.

## 4. Data Path Verification

- [ ] Fake publisher logs telemetry publishing for `demo-1`.
- [ ] Telemetry topic is `omnisense/node/demo-1/telemetry`.
- [ ] `mqtt-subscriber` logs incoming telemetry messages.
- [ ] `mqtt-subscriber` logs normalized telemetry.
- [ ] `mqtt-subscriber` logs successful Supabase inserts.
- [ ] Supabase Table Editor shows new `sensor_readings` rows.
- [ ] Latest dashboard readings show `demo-1`.
- [ ] Dashboard temperature, humidity, headcount, PMV, and crisis state are visible.
- [ ] Historical charts show data after several telemetry messages.
- [ ] Room Comfort Map shows `demo-1` in the Center zone.
- [ ] Unknown room zones stay visible and do not distract from `demo-1`.

## 5. Command Path Verification

- [ ] MQTTX is connected to HiveMQ Cloud.
- [ ] MQTTX is subscribed to:

```text
omnisense/node/demo-1/command
```

- [ ] Dashboard target node is `demo-1`.
- [ ] Click Enable Crisis Mode.
- [ ] MQTTX receives:

```json
{
  "command": "SET_CRISIS_MODE",
  "enabled": true,
  "target_pmv_limit": 1.0,
  "reason": "dashboard_demo"
}
```

- [ ] Dashboard shows success state.
- [ ] Click Disable Crisis Mode.
- [ ] MQTTX receives the same command with `"enabled": false`.
- [ ] Rapid repeated clicks do not publish repeated commands inside the cooldown window.
- [ ] Node selector and both buttons are disabled during pending/cooldown state.

## 6. ESP32 Fallback Plan

- [ ] If ESP32 firmware is unavailable, use `scripts/fake-esp32-publisher`.
- [ ] If real sensors are unstable, use fake publisher demo data.
- [ ] If ESP32 telemetry publishes but command handling is not ready, verify crisis commands with MQTTX.
- [ ] If ESP32 Wi-Fi is unreliable, keep fake publisher running as the main demo source.
- [ ] If the real ESP32 is shown physically, explain that the same MQTT telemetry contract is used.

## 7. Known Simplifications

- [ ] Fake publisher uses simulated demo telemetry.
- [ ] Room Comfort Map is zone/tile-based, not real thermal interpolation.
- [ ] Dashboard uses a demo SELECT policy for read access.
- [ ] Crisis Mode simulates an external grid crisis event.
- [ ] Crisis command delivery is MQTT publish only, not durable command queuing.
- [ ] Production auth, per-user permissions, deployment hardening, and observability are not implemented.
- [ ] This is a hackathon prototype, not a production HVAC control system.

## 8. Common Failure Checklist

- [ ] Dashboard shows no readings: check Supabase rows and the RLS SELECT policy.
- [ ] Dashboard config error or white page: check `apps/dashboard/.env` and restart `npm run dev`.
- [ ] Process connects to `mqtt://localhost:1883`: `.env` is missing, saved in the wrong folder, or the process was not restarted.
- [ ] MQTT auth fails: check HiveMQ host, TLS port `8883`, username, and password.
- [ ] `npm.ps1` is blocked on Windows: use `npm.cmd` or fix PowerShell execution policy.
- [ ] Crisis button does not publish: confirm `services/control-api` is running and MQTTX is subscribed to the command topic.
- [ ] Supabase inserts fail: check `SUPABASE_URL`, backend service key, and `sensor_readings` table.
- [ ] Historical charts are empty: let the fake publisher run longer and refresh the dashboard.
- [ ] Room Comfort Map does not show `demo-1`: confirm latest readings exist for `demo-1`.
- [ ] `.env` files are not committed. Commit only `.env.example` files.

## Right Before Presentation

- [ ] Start all four terminals in the correct order.
- [ ] Confirm fresh `sensor_readings` rows are arriving.
- [ ] Confirm dashboard shows `demo-1`.
- [ ] Confirm charts have enough history to look alive.
- [ ] Confirm MQTTX sees Enable and Disable Crisis Mode commands.
- [ ] Keep MQTTX open on `omnisense/node/demo-1/command`.
- [ ] Keep fake publisher ready even if real ESP32 is planned.
