# OmniSense MQTT Firmware Code Summary

This document explains the current firmware flow for the OmniSense ESP32 MQTT demo. It is written for teammates who need to understand what the code is doing, how each sensor is used, what is sent to the dashboard, and how fan speed is decided.

## 1. Project Purpose

The firmware runs on an ESP32. Its job is to:

- Connect to Wi-Fi.
- Connect to HiveMQ Cloud using MQTT over TLS.
- Read PIR, BME280, AMG8833 thermal array, VL53L8 ToF, and fan control logic.
- Estimate comfort using PMV and PPD.
- Estimate headcount using thermal AI / thermal fallback, validated by ToF.
- Control fan speed based on headcount and comfort mode.
- Publish telemetry to the dashboard through MQTT.
- Receive a backend command for the existing crisis-mode override.

The firmware does not connect directly to Supabase or any database. It only communicates through MQTT.

## 2. Main Files

| File | Purpose |
|---|---|
| `OmniSense_MQTT_Firmware_Demo.ino` | Main firmware flow, Wi-Fi, MQTT, telemetry JSON, sensor timing, fan decision |
| `Config.h` | Pin numbers, timing values, ToF thresholds, thermal thresholds, fan PWM values |
| `PirSensor.cpp/.h` | PIR motion detection |
| `BmeSensor.cpp/.h` | BME280 temperature and humidity reading |
| `ThermalArray.cpp/.h` | AMG8833 thermal array reading, AI headcount, thermal blob fallback |
| `TofSensor.cpp/.h` | VL53L8 8x8 ToF object validation |
| `FanControl.cpp/.h` | Fan PWM hardware output |
| `Comfort.cpp/.h` | PMV, PPD, and comfort-mode classification |

## 3. Device Identity and MQTT Topics

The current node identity is:

```text
NODE_ID = demo-1
MQTT_CLIENT_ID = omnisense-esp32-demo-1
```

Telemetry is published to:

```text
omnisense/node/demo-1/telemetry
```

Commands are received from:

```text
omnisense/node/demo-1/command
```

The firmware connects to HiveMQ Cloud on port `8883` using TLS. The code contains Wi-Fi and MQTT credentials, but these should be treated as local demo credentials and should not be shared publicly.

## 4. Important Timing Settings

Current timing values:

| Setting | Value | Meaning |
|---|---:|---|
| `NO_ACTIVITY_TIMEOUT_MS` | `10000 ms` | System stays active for 10 seconds after the latest PIR motion |
| `SENSOR_READ_INTERVAL_MS` | `200 ms` | Sensor reads happen about 5 times per second while active |
| `TELEMETRY_PUBLISH_INTERVAL_MS` | `200 ms` | MQTT telemetry publishes about 5 times per second |
| `MQTT_RECONNECT_INTERVAL_MS` | `2000 ms` | MQTT reconnect attempt interval |
| `WIFI_CONNECT_TIMEOUT_MS` | `12000 ms` | Time allowed per Wi-Fi network before trying another |

Because the sensor read interval and publish interval are both `200 ms`, the dashboard can receive frequent updates while PIR keeps the system active.

## 5. Pin Configuration

Current ESP32 pin usage:

| Component | Pin |
|---|---:|
| PIR sensor | GPIO `27` |
| Fan PWM | GPIO `25` |
| I2C SDA | GPIO `21` |
| I2C SCL | GPIO `22` |
| ToF LPN | GPIO `19` |
| ToF INT | GPIO `23`, optional and currently unused |

## 6. Startup Flow

When the ESP32 starts:

1. Serial starts at `115200`.
2. I2C starts using SDA `21` and SCL `22`.
3. PIR sensor is initialized.
4. Fan PWM is initialized and turned off.
5. BME280 is checked.
6. AMG8833 thermal array is checked.
7. VL53L8 ToF sensor is checked.
8. Wi-Fi connection starts.
9. MQTT TLS client is configured.
10. MQTT connects to HiveMQ.
11. The device subscribes to the command topic.

If BME280 is not detected, the code does not use fake temperature or humidity values. It reports `N/A`.

If AMG8833 is not detected, headcount becomes `0` when thermal data is unavailable.

If ToF is not detected or the library is missing, ToF validation cannot happen, so thermal headcount will not be accepted.

## 7. Main Loop Flow

The main `loop()` repeatedly does this:

1. Maintain Wi-Fi connection.
2. Maintain MQTT connection.
3. Process MQTT incoming messages.
4. Read telemetry inputs.
5. Apply local fan/HVAC behavior.
6. Publish telemetry every `200 ms`.

Simplified flow:

```text
loop
  maintain Wi-Fi
  maintain MQTT
  read PIR
  if PIR active window is alive:
    read BME
    read ToF
    read thermal array
    calculate PMV / comfort mode
    calculate fan speed
  else:
    stop sensing
    reset values to N/A or 0
    turn fan off
  publish MQTT telemetry
```

## 8. PIR Activation Logic

PIR controls when the whole sensing system is active.

When PIR detects motion:

- `lastActivityMs` is updated.
- `systemActive` becomes `true`.
- The system starts sensing.

The system stays active for:

```text
10 seconds after the latest PIR motion
```

If no motion is detected for 10 seconds:

- `systemActive = false`
- BME stops being read.
- ToF stops being read.
- Thermal array stops being read.
- Temperature becomes `N/A`.
- Humidity becomes `N/A`.
- PMV becomes `N/A`.
- PPD becomes `N/A`.
- Headcount becomes `0`.
- Fan turns off.
- HVAC mode becomes `off`.

This is software-level stopping. The code stops reading the sensors, but it does not physically cut power to the sensor modules.

## 9. BME280 Temperature and Humidity

BME280 is used for:

- Temperature
- Humidity

The current code does not use pressure.

BME is only read when:

```text
systemActive == true
```

That means BME only starts sensing after PIR activates the system.

If BME gives a valid reading:

- `temperature` is sent as a number.
- `humidity` is sent as a number.
- `bme_valid = true`.

If BME is missing or does not produce a valid reading:

- `temperature = "N/A"`
- `humidity = "N/A"`
- `pmv = "N/A"`
- `ppd = "N/A"`
- `comfortStatus = "N/A"`
- `comfortMode = "N/A"`
- `alertLevel = "N/A"`
- `bme_valid = false`

There are no fixed fallback values anymore. The old demo values `24.8 C` and `61.5%` were removed.

## 10. PMV and PPD Calculation

PMV means Predicted Mean Vote. It estimates whether people feel cold, comfortable, warm, or hot.

The code calculates PMV using:

- Air temperature from BME280
- Relative humidity from BME280

The code also assumes fixed values:

| Parameter | Value |
|---|---:|
| Radiant temperature | Same as air temperature |
| Air velocity | `0.1 m/s` |
| Metabolic rate | `1.1 met` |
| Clothing | `0.6 clo` |
| External work | `0` |

PPD means Predicted Percentage Dissatisfied. It estimates what percentage of people may feel uncomfortable based on PMV.

If temperature or humidity is `N/A`, PMV and PPD are also `N/A`.

## 11. Comfort Mode Classification

Comfort mode is now based on PMV only.

| PMV range | Comfort mode |
|---|---|
| `PMV < -0.5` | `cold` |
| `-0.5 <= PMV <= 0.5` | `comfortable` |
| `0.5 < PMV <= 1.0` | `warm` |
| `PMV > 1.0` | `hot` |

The firmware sends this value through:

```json
"comfortStatus": "cold/comfortable/warm/hot",
"comfortMode": "cold/comfortable/warm/hot",
"alertLevel": "cold/comfortable/warm/hot"
```

The word `crisis` is no longer used for automatic PMV comfort classification. However, the old backend command variable `crisisMode` still exists as a separate MQTT command override.

## 12. Thermal Array Headcount

The AMG8833 thermal array reads an 8x8 grid, which means 64 thermal pixels.

When active, the code:

1. Reads 64 temperature pixels.
2. Estimates ambient temperature from the coolest 16 pixels.
3. Calculates a hot-pixel threshold.
4. Runs AI headcount classification.
5. Falls back to thermal blob counting if AI fails or confidence is low.

Thermal threshold logic:

```text
adaptive threshold = ambient + 1.5 C
final threshold = max(adaptive threshold, 30.5 C)
```

The thermal blob fallback counts connected hot regions. It uses 4-neighbor connection:

- Up
- Down
- Left
- Right

It does not use diagonal connection. This helps avoid merging two nearby hands/objects too easily.

Maximum reported people:

```text
3 means 3 or more people
```

## 13. Thermal AI Labels

The AI model is expected to classify thermal data into labels like:

| AI label | People |
|---|---:|
| `EMPTY_CORE` | `0` |
| `OCCUPIED_1P` | `1` |
| `OCCUPIED_2P` | `2` |
| `OCCUPIED_3P_PLUS` | `3` |

If AI confidence is too low, or the AI label is unknown, the code uses the thermal blob fallback result.

## 14. ToF Human/Object Validation

The VL53L8 ToF sensor is used as a validation sensor. It checks whether the detected object looks like a close, connected object in the 8x8 distance grid.

Important note:

The ToF does not truly prove something is biologically human. For the prototype, it validates a hand/person-like object based on distance, connected zones, and depth consistency. That is why hand testing works for the prototype.

ToF checks:

| Rule | Value |
|---|---:|
| Grid size | 8x8, 64 zones |
| Valid distance range | `70 mm` to `650 mm` |
| Minimum valid zones | `3` |
| Minimum largest connected cluster | `3 zones` |
| Maximum depth spread inside cluster | `220 mm` |

If the object passes those rules:

```text
tof_human_validated = true
```

If it does not pass:

```text
tof_human_validated = false
```

## 15. Final Headcount Decision

Thermal headcount is only accepted when ToF validates the object.

The main logic is:

```text
if thermal is valid AND ToF validates human/object:
  headcount = thermal result
else:
  headcount = 0
```

So even if thermal sees heat, the code rejects the count if ToF does not validate the object.

Possible headcount sources sent to MQTT:

| Source | Meaning |
|---|---|
| `ai` | Thermal AI was used successfully |
| `thermal_blob_fallback` | Thermal blob fallback was used |
| `tof_rejected` | Thermal may have data, but ToF did not validate |
| `tof_unavailable` | ToF is not available |
| `none` | System inactive |

## 16. Fan Hardware Control

The fan uses PWM on GPIO `25`.

PWM settings:

| Setting | Value |
|---|---:|
| Frequency | `25000 Hz` |
| Resolution | `8-bit` |
| PWM range | `0` to `255` |

From the system logic point of view:

```text
0 = off
255 = maximum speed
```

The config has:

```cpp
FAN_PWM_INVERTED = true
```

Because of this, the code writes `255 - desiredDuty` to the hardware. This is only a hardware wiring/detail. The dashboard and firmware logic still treat `255` as maximum fan speed.

## 17. Fan Speed Logic

Fan speed is now based on:

1. Headcount base speed.
2. Comfort mode adjustment.

Formula:

```text
final fan PWM = headcount base PWM + comfort mode adjustment
```

The result is clamped between:

```text
0 and 255
```

### Headcount Base Speed

| Headcount | Base PWM |
|---|---:|
| `0` | `0` |
| `1` | `90` |
| `2` | `165` |
| `3+` | `255` |

### Comfort Adjustment

| Comfort mode | Adjustment |
|---|---:|
| `cold` | `-60` |
| `comfortable` | `0` |
| `warm` | `+40` |
| `hot` | `+80` |

### Example Fan Speeds

| Headcount | Comfort mode | Calculation | Final PWM |
|---|---|---:|---:|
| `0` | any mode | always off | `0` |
| `1` | `cold` | `90 - 60` | `30` |
| `1` | `comfortable` | `90 + 0` | `90` |
| `1` | `warm` | `90 + 40` | `130` |
| `1` | `hot` | `90 + 80` | `170` |
| `2` | `cold` | `165 - 60` | `105` |
| `2` | `comfortable` | `165 + 0` | `165` |
| `2` | `warm` | `165 + 40` | `205` |
| `2` | `hot` | `165 + 80` | `245` |
| `3+` | `cold` | `255 - 60` | `195` |
| `3+` | `comfortable` | `255 + 0` | `255` |
| `3+` | `warm` | capped at max | `255` |
| `3+` | `hot` | capped at max | `255` |

If headcount is `0`, fan stays off even if the comfort mode is warm or hot.

## 18. Fan Mode Label

The dashboard receives both:

- A text fan label.
- The actual PWM value.

Fan label is based on final PWM:

| Final PWM range | Fan label |
|---|---|
| `0` | `off` |
| `1` to `90` | `low` |
| `91` to `165` | `medium` |
| `166` to `255` | `high` |

The actual PWM is sent as:

```json
"fan_pwm": 130
```

## 19. MQTT Telemetry Payload

The firmware publishes a JSON payload to:

```text
omnisense/node/demo-1/telemetry
```

Main payload fields:

| Field | Meaning |
|---|---|
| `node_id` | Device ID |
| `temperature` | BME temperature, or `N/A` |
| `humidity` | BME humidity, or `N/A` |
| `headcount` | Final accepted headcount |
| `pmv` | PMV value, or `N/A` |
| `ppd` | PPD value, or `N/A` |
| `comfortStatus` | `cold`, `comfortable`, `warm`, `hot`, or `N/A` |
| `comfortMode` | Same as comfortStatus, added for dashboard clarity |
| `alertLevel` | Same as comfortStatus in current code |
| `crisis_mode` | Existing backend override state |
| `hvac_state` | HVAC/fan state object |
| `raw_sensor_summary` | Debug/status information |

Example active payload:

```json
{
  "node_id": "demo-1",
  "temperature": 32.1,
  "humidity": 60.2,
  "headcount": 1,
  "pmv": 2.42,
  "ppd": 91.7,
  "comfortStatus": "hot",
  "comfortMode": "hot",
  "alertLevel": "hot",
  "crisis_mode": false,
  "hvac_state": {
    "mode": "cool",
    "fan": "high",
    "fan_pwm": 170,
    "setpoint": 24
  }
}
```

Example inactive payload:

```json
{
  "node_id": "demo-1",
  "temperature": "N/A",
  "humidity": "N/A",
  "headcount": 0,
  "pmv": "N/A",
  "ppd": "N/A",
  "comfortStatus": "N/A",
  "comfortMode": "N/A",
  "alertLevel": "N/A",
  "hvac_state": {
    "mode": "off",
    "fan": "off",
    "fan_pwm": 0,
    "setpoint": 24
  }
}
```

## 20. Raw Sensor Summary

The `raw_sensor_summary` object is useful for debugging.

It includes:

| Field | Meaning |
|---|---|
| `pir_motion` | Whether PIR sees motion right now |
| `system_active` | Whether the 10-second active window is alive |
| `bme_valid` | Whether BME has valid temperature/humidity |
| `headcount_source` | How headcount was decided |
| `thermal_ai_label` | Thermal AI label |
| `thermal_ai_confidence` | Thermal AI confidence |
| `tof_source` | ToF status/source |
| `tof_available` | Whether ToF is available |
| `tof_data_ready` | Whether ToF data was ready |
| `tof_human_validated` | Whether ToF accepted the object |
| `tof_valid_zone_count` | Number of valid ToF zones |
| `tof_largest_cluster_zones` | Largest connected ToF cluster size |
| `tof_average_distance_mm` | Average detected distance |
| `tof_min_distance_mm` | Minimum detected distance |
| `tof_max_distance_mm` | Maximum detected distance |

## 21. MQTT Command Handling

The firmware subscribes to:

```text
omnisense/node/demo-1/command
```

It currently handles:

```json
{
  "command": "SET_CRISIS_MODE",
  "enabled": true,
  "target_pmv_limit": 1.0,
  "reason": "optional reason"
}
```

If `enabled` is true:

- `crisisMode = true`
- HVAC mode becomes `eco`.
- Setpoint becomes `26`.
- Fan calculation uses headcount `1` as the conservative override base.

If `enabled` is false:

- Normal fan/headcount/comfort logic resumes.

Important: this command is separate from the PMV comfort modes. The comfort modes are still `cold`, `comfortable`, `warm`, and `hot`.

## 22. Current Dashboard-Relevant Fields

For the UI/dashboard, the most useful fields are:

```json
{
  "temperature": 32.1,
  "humidity": 60.2,
  "headcount": 1,
  "pmv": 2.42,
  "ppd": 91.7,
  "comfortMode": "hot",
  "hvac_state": {
    "mode": "cool",
    "fan": "high",
    "fan_pwm": 170,
    "setpoint": 24
  },
  "raw_sensor_summary": {
    "system_active": true,
    "bme_valid": true,
    "tof_human_validated": true,
    "headcount_source": "ai"
  }
}
```

Recommended UI mapping:

| Dashboard display | MQTT field |
|---|---|
| Temperature | `temperature` |
| Humidity | `humidity` |
| Occupancy / people count | `headcount` |
| Comfort mode | `comfortMode` |
| PMV | `pmv` |
| PPD | `ppd` |
| Fan text | `hvac_state.fan` |
| Fan PWM / speed | `hvac_state.fan_pwm` |
| System active/inactive | `raw_sensor_summary.system_active` |
| Sensor status | `raw_sensor_summary.bme_valid`, `tof_available`, `tof_human_validated` |

## 23. Expected Serial Monitor Behavior

Serial baud rate should be:

```text
115200
```

Expected messages include:

```text
Starting OmniSense ESP32 MQTT firmware demo...
BME280 detected.
AMG8833 detected.
VL53L8 ToF sensor detected.
Wi-Fi connected.
MQTT connected.
System activated by PIR motion.
Published telemetry to omnisense/node/demo-1/telemetry: {...}
```

If the Serial Monitor shows square symbols, the baud rate is probably wrong.

If it prints pressure values like:

```text
Temperature: ... | Humidity: ... | Pressure: ...
```

then the ESP32 is likely running a BME example sketch, not the latest OmniSense MQTT firmware.

## 24. Key Current Behavior Summary

The latest firmware behavior is:

- PIR controls whether the system is active.
- System remains active for 10 seconds after the latest motion.
- Sensors read every `200 ms` while active.
- MQTT publishes every `200 ms`.
- BME temperature/humidity are only read while active.
- No fixed BME fallback values are used.
- If BME is unavailable, temperature/humidity/PMV/PPD become `N/A`.
- Thermal headcount is accepted only if ToF validates the object.
- If no valid ToF/thermal result exists, headcount becomes `0`.
- Comfort mode is PMV-based: `cold`, `comfortable`, `warm`, `hot`.
- Fan speed is based on headcount plus comfort-mode adjustment.
- Dashboard receives both fan label and actual fan PWM.
- When inactive, fan turns off and sensor values reset to `N/A` or `0`.

