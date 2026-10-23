# ESP32 firmware audit — pending contribution

Audit date: 2026-10-23. Source review of the owner-supplied
`OmniSense_MQTT_Firmware_Demo_1.zip`; not a device attestation or hardware test.
The original ZIP is private and must not be committed.

Original ZIP SHA-256:
`890e47960f07a3f29e8f45ac437476ad170bf988d8ed73c4ae3fb228bec3f3ec`.

## Inventory and identity

The archive has two nested sketch directories and 12 source files:

| Files | Responsibility |
| --- | --- |
| `OmniSense_MQTT_Firmware_Demo_1.ino` | Wi-Fi/TLS MQTT, activation, sensing, telemetry and legacy command handler |
| `Config_1.h` | Pins, cadence, PWM and thermal fallback constants |
| `BmeSensor_1.cpp/.h` | BME280 temperature/humidity |
| `PirSensor_1.cpp/.h` | PIR activity window |
| `ThermalArray_1.cpp/.h` | AMG8833 pixels, TinyML inference and blob fallback |
| `Comfort_1.cpp/.h` | Estimated PMV/PPD and comfort classification |
| `FanControl_1.cpp/.h` | Local demonstration fan PWM |

Despite the filename, `NODE_ID` is `demo-2`. MQTT client identity uses the eFuse
MAC. No separate demo-1 build, flashed binary or build hash is supplied. The
telemetry matches the current contract family, but only the device owner can
confirm exact source-to-device identity. Do not flash both boards with one ID.

No third-party libraries, model weights, inference export, dataset, board manifest
or license file are bundled. ToF code is commented out; no active VL53L8
implementation is supplied.

## Hardware found in source

| Item | Setting |
| --- | --- |
| Board | ESP32 DevKit V1 comment; exact FQBN and flash settings absent |
| I2C | SDA 21 / SCL 22 |
| BME280 | Address 0x76 |
| AMG8833 | 8 × 8 thermal pixels, address 0x69 |
| PIR | GPIO 27; 10-second activation timeout |
| Fan | GPIO 25, inverted PWM, 25 kHz, 8 bit |
| Sensing / publishing | 1 second / 1 second |
| MQTT | TLS port 8883, embedded public CA; insecure TLS call stays commented |

Wiring, supply/driver safety and actual board settings require hardware-owner
confirmation. GPIO output is not a building HVAC interface.

## Stable Hybrid compatibility

Topic: `omnisense/node/{node_id}/telemetry`. Topic and JSON identity must match
one of the configured `demo-1`/`demo-2` nodes.

| Firmware field | Stable Hybrid treatment |
| --- | --- |
| `node_id` | Matched to topic and configured identity |
| `headcount` | Integer 0–3; 3 represents 3+, not an exact census |
| `temperature` / `humidity` | Used only with active/valid environmental evidence; `"N/A"` remains unavailable |
| `raw_sensor_summary.pir_motion` / `system_active` / `bme_valid` | Preserved metadata; inactive zero does not confirm vacancy |
| `headcount_source` / `thermal_ai_label` / `thermal_ai_confidence` | TinyML consistency checked; fallback distinguished |
| `pmv` / `ppd` / comfort strings | Transmitted, but not retained/displayed in the stable Hybrid path |
| `hvac_state` / `crisis_mode` | Local firmware behavior, not correlated Hybrid applied-output evidence |
| Device UTC timestamp | Absent; backend explicitly uses gateway receipt time |

TinyML consumes 64 thermal pixels and requires matching model input dimensions.
Labels map EMPTY_CORE → 0, OCCUPIED_1P → 1, OCCUPIED_2P → 2,
OCCUPIED_3P_PLUS → 3. Errors, rejected confidence or incompatible inputs/labels
use the existing blob fallback. No inference rules are changed for cleanup.

PMV is a dimensionless firmware estimate based on temperature/humidity and fixed
radiant-temperature, air-speed, metabolic and clothing assumptions. It is not
measured temperature or a validated comfort outcome. There is no explicit numeric
clamp; missing inputs serialize as `"N/A"`. Comfort thresholds are below −0.5
cold, −0.5 through 0.5 comfortable, above 0.5 through 1 warm, and above 1 hot.
Firmware publication does not establish end-to-end PMV support.

The firmware drives a local demonstration fan and retains a legacy crisis-mode
command handler. Current Hybrid outputs are simulated, not building HVAC commands.
All original sensing, inference, fan and command behavior is preserved.

## Security and minimum sanitization

The sketch contains two Wi-Fi network/password pairs and a broker host, username
and password. Values are omitted. No Supabase key, access token or private key
was identified in the 12 source files. The embedded CA is public trust material.

A candidate is prepared outside Git:
- Move only Wi-Fi and MQTT connection constants into ignored `Credentials.local.h`.
- Supply `Credentials.example.h` with placeholders and TLS port 8883.
- Preserve 11 source files byte-for-byte. Reversing configuration extraction
  reproduces the original sketch exactly.
- Exclude ZIPs, private headers and generated binaries.
- Preserve CA validation; do not enable `setInsecure()`.

This review does not authorize live MQTT, flashing or credential rotation.
Owner review is required before adding the candidate to the repository.

## Build and redistribution blockers

`OmniSense_Thermal_Headcount_inferencing.h` is missing. Obtain the complete,
matching Edge Impulse Arduino inference export, weights, metadata and notices.
Do not substitute a different model or remove inference to obtain a passing build.

Also obtain known-good ESP32 core/library versions, exact FQBN/board options,
toolchain and demo-1 identity configuration. The ZIP alone is **not rebuildable**.
No firmware compilation or flashing was performed.

No third-party implementation is bundled, so its license notices are absent.
Review the exact versions before redistribution:
- [PubSubClient](https://github.com/knolleary/pubsubclient/blob/master/LICENSE.txt): MIT.
- [ArduinoJson](https://github.com/bblanchon/ArduinoJson/blob/7.x/LICENSE.txt): MIT;
  the ZIP does not establish the major version.
- [Adafruit BME280](https://github.com/adafruit/Adafruit_BME280_Library/blob/master/LICENSE): BSD.
- [Adafruit AMG88xx](https://github.com/adafruit/Adafruit_AMG88xx): exact source
  notices and transitive dependencies still require review before vendoring.
- [Arduino ESP32](https://github.com/espressif/arduino-esp32): preserve the selected
  core distribution's notices, including bundled third-party licenses.
- [Edge Impulse SDK](https://github.com/edgeimpulse/inferencing-sdk-cpp/blob/master/LICENSE):
  default BSD 3-Clause Clear with third-party exceptions. This does not establish
  rights to the absent model or its dataset.

Application source has no explicit license in the ZIP. Confirm authorship and
publication terms with the teammate; do not invent a license. Redistribution
clearance and a verified build remain pending.

## Proposed public layout — not yet added

```text
firmware/esp32/
  README.md
  DEPENDENCIES.md
  THIRD_PARTY.md
  .gitignore
  OmniSense_MQTT_Firmware_Demo_1/
    OmniSense_MQTT_Firmware_Demo_1.ino
    Config_1.h
    BmeSensor_1.cpp / BmeSensor_1.h
    Comfort_1.cpp / Comfort_1.h
    FanControl_1.cpp / FanControl_1.h
    PirSensor_1.cpp / PirSensor_1.h
    ThermalArray_1.cpp / ThermalArray_1.h
    Credentials.example.h
```

The proposed README covers hardware, dependencies, conditional build/flashing
instructions and private MQTT configuration. Model files require owner/license
review before inclusion. Earlier Technothon guides remain historical; this
candidate is identified as the supplied SDP hardware snapshot.
