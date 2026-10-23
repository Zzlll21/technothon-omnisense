# Stage 2: opt-in live MQTT diagnostics

Working branch: `feature/esp32-hybrid`. Stage 2 stops at in-memory assessment and
local diagnostic output. No hardware firmware, dashboard, SQL, writer or deployed
generator changes are included. The default synthetic `npm start` entry point is
unchanged. Nothing is pushed or merged.

## Data path

```text
ESP32 -> existing HiveMQ TLS / telemetry topics
      -> subscribe-only diagnostic client
      -> Stage 1 normalizeHardwareTelemetry()
      -> in-memory latest evidence / connection and freshness handling
      -> Stage 1 evaluateHardwareCooling() / coolingPolicy() / schedule()
      -> local JSON diagnostics with simulated cooling request
```

This process is not a snapshot writer. It imports neither `writer.mjs` nor any
Supabase client and never publishes MQTT commands. The existing synthetic
generator can remain running. Its database run, checkpoints and active publication
are independent of this diagnostic process.

## Files changed in this stage

| File | Purpose |
| --- | --- |
| `services/sdp-generator/hardware-monitor.mjs` | In-memory evidence owner, safe diagnostics and injectable subscribe-only MQTT event binding. |
| `services/sdp-generator/hybrid-mqtt.mjs` | Disabled-by-default CLI; separate replay/live paths and bounded live-session cleanup. |
| `services/sdp-generator/hybrid-mqtt.env.example` | Placeholder-only private diagnostic configuration template. |
| `services/sdp-generator/package.json` | Add `hybrid:mqtt`, syntax checks and MQTT.js dependency; leave `start` unchanged. |
| `services/sdp-generator/package-lock.json` | Lock MQTT.js 5.15.1, matching the existing legacy subscriber lock, and transitive dependencies. |
| `services/sdp-generator/test/mqtt-live.test.mjs` | MQTT lifecycle, replay, inference, freshness, coverage, security and policy integration tests. |
| `services/sdp-generator/test/fixtures/firmware-replay.json` | Sanitized constructed payloads matching firmware output; not an actual hardware recording. |
| `docs/integration/ESP32-HYBRID-STAGE-2.md` | This report and runbook. |

Stage 1 source files and their earlier uncommitted changes are preserved.

## Run locally

From the repository root, with the existing dashboard TypeScript dependency and
the generator's locked dependencies installed:

```powershell
npm.cmd --prefix services/sdp-generator run build
npm.cmd --prefix services/sdp-generator run hybrid:mqtt
```

The second command prints help and exits without a network connection. It does
not automatically load `.env`, subscriber configuration or firmware credentials.
Even an enabled environment requires the explicit `--live` argument.

Replay, without credentials or network:

```powershell
npm.cmd --prefix services/sdp-generator run hybrid:mqtt -- --replay test/fixtures/firmware-replay.json
```

Every replay diagnostic says `mode: REPLAY`. The fixture declares its constructed
provenance. To replay sanitized captured telemetry later, place sanitized payloads
in `packets` and supply explicit gateway receipt times and connection/message/tick
actions in `steps`; never add real credentials or raw captured secrets to fixtures.

For a deliberate live test, from `services/sdp-generator`:

```powershell
if (-not (Test-Path -LiteralPath .env.hybrid)) {
  Copy-Item -LiteralPath hybrid-mqtt.env.example -Destination .env.hybrid
}
# Edit .env.hybrid privately: existing MQTT broker credentials and explicit node IDs.
# Set HYBRID_MQTT_ENABLE=true only for the intended live test.
node --env-file=.env.hybrid hybrid-mqtt.mjs --live --seconds 60
```

`.env.hybrid` is ignored by Git. No private environment file was created in this
stage. The runner accepts existing `MQTT_BROKER_URL`, `MQTT_USERNAME` and
`MQTT_PASSWORD` names. Use `mqtts://HOST:8883`, separate credentials and certificate
verification. It rejects plaintext MQTT, embedded URL credentials, query strings,
alternate ports and wildcard node IDs. Each process uses a new client ID, separate
from the original subscriber/ESP32, and requests only configured node telemetry
topics at QoS 0 with a clean MQTT 3.1.1 session. MQTT.js resubscription is explicit.

Live sessions default to 60 seconds, allow 1..3600 seconds, and stop on Ctrl+C,
SIGTERM or their deadline. Timers, listeners and sockets are cleaned up. There is
no background watcher or automatic restart of another service.

### Coverage and freshness configuration

- `HYBRID_NODE_IDS`: comma-separated identities that must be explicitly mapped to
  deployed devices. It controls both required evidence and exact subscription topics.
- `HYBRID_FULL_ZONE_COVERAGE`: defaults false. Set true only after the configured
  physical footprints have been validated to cover the full cooling zone. This
  flag records that operator assertion; software cannot validate physical coverage.
- `HYBRID_STALE_AFTER_MS`: default 90,000; conservative diagnostic configuration,
  not a firmware sampling change.
- `HYBRID_DISCONNECTED_AFTER_MS`: default 180,000, strictly greater than stale time.
- `HYBRID_DIAGNOSTIC_INTERVAL_MS`: default 5,000. Every incoming packet is evaluated;
  state changes are emitted immediately and unchanged state has periodic diagnostics.

One configured `demo-1` with coverage false can establish occupied evidence, but
cannot establish whole-office vacancy. Missing required devices are never replaced
by synthetic nodes or readings. All output requests remain explicitly SIMULATED.

## Packet compatibility and conservative handling

The unchanged firmware's topic and existing JSON are accepted by the Stage 1
normalizer. Node identity, gateway receipt time, capped headcount, inference source,
winning label/confidence, PIR/system activation and BME validity are retained.
Temperature and humidity preserve independent measurement validity. `"N/A"`, null
or missing readings stay unavailable. PMV and local fan `hvac_state` do not become
SDP cooling feedback. No model distribution, device timestamp or sequence is invented.

Active consistent TinyML empty observations are empty footprint evidence. They
need complete configured coverage plus the original five-minute confirmation
before reduced cooling. PIR inactivity, thermal unavailability, missing metadata
and fallback zero stay uncertain. Positive fallback evidence keeps its own source.

Malformed/rejected mapped-node packets revoke the node's current evidence instead
of leaving an old empty observation authoritative. A transient occupied or unknown
packet breaks vacancy even if a later empty packet arrives before a periodic tick.

Connection errors, offline/close/disconnect/reconnect and subscription failure
invalidate all current-session evidence and reset vacancy continuity immediately.
Successful connection alone is insufficient: SUBACK and a fresh non-retained packet
are required. Late callbacks from an older connection cannot restore the session.
After reconnect, last-known values may be shown with their original timestamps,
but are explicitly not current-session evidence and are excluded from assessment.

Cached readings age against original receipt, with no refresh on diagnostic ticks.
Stale/disconnected readings cannot certify vacancy. Known DUP or retained packets
are rejected without refreshing the cache and invalidate that node's current
authority. Unknown topics are ignored, and wall-clock regressions invalidate
current evidence; timestamps are never artificially incremented.

The firmware publishes QoS 0 without boot IDs, device sequence or observation time.
Identical unflagged payloads may be legitimate consecutive one-second readings,
so content hashing is not used as fake deduplication. Retransmission without a DUP
flag, source-level reordering and upstream buffering cannot be reliably detected.
Gateway receipt time is explicitly a receipt-time proxy, not device acquisition.

### Diagnostics and credentials

One JSON line includes LIVE/REPLAY mode, transport status, receipt/evaluation time,
node source/classification, BME values/validity, freshness, zone coverage/occupancy,
simulated mode/output and counters. Last-known environmental values retain their
original observation times and are separately labelled stale or non-current.

Raw payloads, broker URL, usernames, passwords, environment values and arbitrary
network errors are never printed. Transport failures are fixed status tokens.
Unknown inference label/source strings are shown as OTHER to prevent arbitrary
payload text from entering logs; their original metadata stays in normalized memory.

## Validation and actual broker observation

Executed validation: **69 generator tests passed**, including **18 new Stage 2
tests**, the Stage 1 integration tests, synthetic parity, writer mocks and embedded
PostgreSQL/RLS regressions. Build, generator typecheck, JavaScript syntax checks
and `git diff --check` passed. All database regression work was local and ephemeral;
no live Supabase connection or write occurred. Synthetic parity still compares
all 4,897 complete historical/continuous ticks to the original baseline bytes.

The Stage 2 tests cover occupied/empty transitions, PIR inactive/unavailable
evidence, BME measurements and N/A, incomplete coverage, stale evidence, retained
and DUP flags, invalid packets, subscription denial, late SUBACK, disconnect and
reconnect recovery, transient intermediate evidence and clock regression.
Occupied and empty streams under identical booking forecasts produce different
cooling requests; synthetic full-tick parity remains part of the generator suite.

Replay CLI execution: 15 explicitly REPLAY evaluations, 8 accepted packets and
2 rejected retained/DUP packets; final state DISCONNECTED/UNCERTAIN. Fixture
packets were constructed from supplied firmware source, not recorded from hardware.

A bounded real broker check ran on **22 October 2026, 23:04:17–23:04:47 Malaysia
time** (15:04:17–15:04:47 UTC). It used only the supplied firmware archive's MQTT
settings in process memory, without extracting or saving credentials or reading
Wi-Fi settings into the child environment. TLS connection/authentication and the
`demo-1` telemetry subscription succeeded. **Zero telemetry packets arrived**;
accepted/rejected counters both stayed zero. The process stopped at its deadline.

This establishes real broker connectivity and subscription access. It does not
establish ESP32 availability, deployed device count, physical occupancy accuracy,
actual payload compatibility or BME readings. No physical occupied/empty/reconnect
trial was observed. Do not present replay results as a completed hardware trial.

## Migration readiness and stopping point

Stage 2 provides an isolated live-ingestion diagnostic boundary. The Stage 1
migration proposal remains a proposal. No persistence integration is enabled.

Before proceeding to a separate persistence stage:

1. Repeat the bounded live test with the ESP32 powered and publishing. Record
   sanitized occupied, active empty, inactive and sensor-unavailable packets and
   physically verify mapped identity and footprint coverage.
2. Agree versioned evidence representation for missing classifier score vectors,
   inference-source metadata, nullable environment and gateway receipt semantics.
3. Review the backward-compatible migration, run activation and real-data access
   policy explicitly before applying any schema change in an isolated project.
4. Only in a separately authorized stage, connect the evidence buffer to the sole
   transactional run writer with frozen pending ticks and persisted recovery state.

The diagnostic process remains subscribe-only and is not an authoritative writer.
It must not be presented as proof that the current database can already persist
hybrid evidence or that physical HVAC commands were issued.
