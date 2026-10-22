# ESP32 Hybrid Mode B: offline integration

Branch: `feature/esp32-hybrid`. Baseline: `ec62d18`.

This stage supports the existing firmware without changing its PIR gating,
thermal inference, local fan or MQTT behavior. It does not connect to a broker,
load credentials, construct a writer, publish commands, or write a database.
The deployed generator, its CLI, writer and dashboard are unchanged. Only the
shared mode selection inside the generator model was factored into a pure
function; synthetic inputs continue down the original path by default.

## Files

| Path | Change |
| --- | --- |
| `services/sdp-generator/src/model.ts` | Export `coolingPolicy()`; `scriptedState()` delegates to it with original timetable inputs. |
| `services/sdp-generator/src/hardwareTelemetry.ts` | Parse, validate and normalize firmware topic/payload; preserve inference metadata and independent environmental validity. |
| `services/sdp-generator/src/hybridOffline.ts` | Evaluate normalized required-node evidence, continuous vacancy timing, existing booking schedule and shared policy; return an offline decision projection and simulated output. |
| `services/sdp-generator/test/hybrid.test.mjs` | Firmware normalization, evidence assessment and occupancy-to-policy integration tests. |
| `services/sdp-generator/test/synthetic-parity.test.mjs` | Compare full generated ticks against the pre-refactor baseline digest. |

The earlier `ESP32-HYBRID-PLAN.md` is an architecture inspection record, not an
up-to-date hardware inventory. The subsequently supplied ZIP contains BME280,
AMG8833/TinyML, PIR and local PWM fan support. ToF is commented out. One configured
`demo-1` identity does not prove the number of physically deployed devices.
No archive contents or embedded credentials have been copied into the repository.

## Normalized telemetry contract

Entry point:

```ts
normalizeHardwareTelemetry(topic, jsonText, {
  received_at: "2026-10-20T04:00:00.000Z", // assigned by gateway, not payload
  allowed_node_ids: ["demo-1"],            // explicit mapping, not wildcard trust
  retained: false                         // actual MQTT packet flag
});
// {ok: true, value: HardwareTelemetry} | {ok: false, errors: string[]}
```

The adapter accepts the existing `omnisense/node/{node_id}/telemetry` topic and
firmware JSON. It requires matching topic/payload identity and integer headcount
0..3, where 3 means three or more. JSON, size, metadata types and confidence
range are checked. Unknown firmware fields are ignored; PMV and `hvac_state`
are not treated as occupancy evidence or SDP actuation acknowledgements.

| Normalized field | Meaning |
| --- | --- |
| `schema_version` | `omnisense.hardware.v1`, an internal adapter contract |
| `node_id`, `received_at` | Explicit mapped identity and original gateway receipt |
| `time_basis` | `GATEWAY_RECEIPT`; the firmware provides no observation timestamp |
| `headcount` | Original validated capped firmware count; never summed into zone population |
| `metadata` | Original `system_active`, `pir_motion`, `bme_valid`, `headcount_source`, `thermal_ai_label`, `thermal_ai_confidence`; absent metadata stays null |
| `occupancy` | Assessment, validity, provenance, inference method, effective class, null score vector and reason |
| `temperature_c`, `humidity_percent` | Existing SDP `Observation<number>` shape with independent source, validity and gateway timestamp |

`"N/A"`, null or missing environmental values become UNAVAILABLE with null value,
source ID and observation time. Numeric values require active sensing and
`bme_valid=true`. Temperature is checked against the BME280 range -40..85 C;
relative humidity against 0..100%. Other nonnumeric/out-of-range values become
INVALID independently; no zero replacement, last-value borrowing or simulated
environmental substitute is used. These sensor ranges do not add a new cooling
comfort policy. Firmware `bme_valid` alone does not establish a finite reading.

The observation time uses gateway receipt as an explicitly attributed proxy for
acquisition time. It is not a claim that the device measured at that exact instant.

### Occupancy mapping

| Available firmware evidence | Mapping |
| --- | --- |
| Active, `thermal_ai`, consistent EMPTY_CORE/0, nonzero valid confidence | Valid empty footprint observation; zone vacancy still requires coverage and confirmation |
| Active, `thermal_ai`, consistent occupied label/1..3 | Valid occupied evidence |
| Active, `thermal_blob_fallback`, positive count | Valid occupied evidence, explicitly attributed to fallback |
| Fallback zero | UNCERTAIN; does not certify vacancy |
| PIR inactive / `none` / `thermal_unavailable` / absent or unknown metadata | UNCERTAIN; no independently verified empty observation |
| TinyML label/count disagreement or incomplete accepted-result metadata | INVALID / UNCERTAIN |

Firmware acceptance of its TinyML threshold is trusted only when its source says
`thermal_ai`. The exported model/threshold is not in the ZIP, so the adapter does
not invent another confidence threshold. The full raw winning label and rounded
confidence remain available even if fallback supplied the effective count.

`class_scores` is deliberately null. The existing firmware transmits only the
winner, not the full distribution. This normalized type is **not** a persistable
`sdp.v1-draft.1` NodeEvidence event. Passing it to the current writer would be
incorrect. A versioned wire contract is a remaining integration task.

No simplified inactivity-zero-to-vacant assumption is implemented.

## Offline policy integration

`evaluateHardwareCooling(at, normalizedReadings, config, previousCheckpoint)` takes
one latest normalized reading per explicitly configured required node. Configuration
includes full-zone coverage confirmation and positive stale/disconnected durations.
It does not discover physical nodes or assume two devices exist.

Any fresh valid occupied node makes the zone OCCUPIED. Only fresh valid empty
observations across all required nodes with `full_zone_coverage=true` make it
VACANT. Other cases are UNCERTAIN. Coverage separately reports COMPLETE, DEGRADED
or UNKNOWN. UNAVAILABLE/INVALID classification is represented by INVALID node
state with its explanatory reason. A node with no packet is MISSING.

Freshness is evaluated against original receipt, never evaluation or database
insert time. Retained telemetry is rejected. Reusing the same normalized reading
does not refresh its age. Future and decreasing gateway receipt times are rejected.
There is no claim of reliable device-message deduplication or ordering: unchanged
firmware has no sequence, boot ID or device timestamp. A duplicated source packet
delivered with a new gateway receipt cannot reliably be detected; a content hash
would also incorrectly reject legitimate identical one-second readings.

The checkpoint holds continuous vacancy start, evaluation time, configuration key
and last gateway receipts. Missing/uncertain evidence clears vacancy timing;
changed configuration, evaluation gaps reaching the stale threshold or a lapse
between consecutive observation freshness windows restart confirmation.
Callers must process rejected readings/broker failures explicitly
and must not let an old cached record certify vacancy through an unknown interval.

The shared policy retains the existing settings:

- OCCUPIED: AUTO/24.5 C; also the conservative mode for uncertain input.
- First five minutes of valid vacancy: occupied cooling.
- SHORT_VACANCY after five minutes: LOW/27 C.
- LONG_VACANCY after 20 minutes: OFF/null setpoint.
- PRECOOL: HIGH/24.5 C using the existing synthetic booking restart, during an
  eligible long gap and only while the zone has confirmed vacancy.

The offline evaluator reads `schedule()` directly. It does not reimplement the
booking timetable, alter the persisted forecast generator or infer occupied state
from bookings. The returned forecast is a projection of that synthetic plan, not
a persisted forecast envelope. Output reports remain explicit SIMULATED projections.
These results are intentionally not transactional Tick objects and cannot be sent
to the writer. No physical HVAC control API is present in this path.

## Verification

Run the offline suites with locked development dependencies installed:

```powershell
npm.cmd --prefix services/sdp-generator test
npm.cmd --prefix packages/sdp-contract test
npm.cmd --prefix services/sdp-generator run typecheck
Set-Location apps/dashboard
node --test test/*.test.mjs
```

The integration tests compare occupied and active empty hardware inputs at the
same times with identical forecast projections. At 12:20 Malaysia time, continuous
empty evidence requests LONG_VACANCY (OFF), while occupied evidence requests
OCCUPIED (AUTO/24.5 C). They also exercise all four modes, PIR inactivity,
unavailability, fallback, invalid metadata, freshness, incomplete coverage,
checkpoint recovery and cancellation of vacancy confirmation.

The parity test hashes complete ticks for 2,017 historical frames plus 2,880
continuous frames (24 hours). The original `ec62d18` model and refactored model
produce the same SHA-256:
`d887eb95d0f5c713c67c160f314676c99a6f2e5545fc4971563cd41f15a4ad78`.
This includes forecasts, decisions, simulated outputs, IDs and checkpoints.
Executed verification: 18 hardware integration tests, 51 generator tests total
(including those hardware tests, synthetic parity and local database/RLS tests),
18 shared contract tests and 121 dashboard regression tests passed. Generator
build and typecheck passed. All database tests used local embedded PostgreSQL;
none used the live Supabase project.

## Proposed backward-compatible database migration (review only)

No SQL migration is added to the migration directory or applied in this stage.
This is a concrete scope proposal for a separate follow-up migration; it is not
deployment-ready SQL. Preserve `001_sdp_foundation.sql` and its synthetic behavior.

| Object | Proposed additive/versioned change |
| --- | --- |
| `sdp_runs` | Allow `sdp-hybrid-v1` alongside `sdp-scripted-v1`; preserve the seven-day constraint for scripted runs, permit hybrid history_start=live_anchor so today's measurements are never backfilled. Add immutable mode/clock/capability config inside the run definition. |
| `sdp_nodes` | Replace sim-only ID CHECK with a bounded identity constraint. RPC validation must retain exactly sim-1/sim-2 for scripted runs; hybrid nodes must exactly match the explicit required inventory. |
| `sdp_events` | Preserve existing `sdp.v1-draft.1`/SIMULATED/REPLAY validation for scripted runs. Add a separately versioned hybrid envelope with LIVE clock and truthful observation provenance. Extend classifier evidence to represent absent score distributions and preserve inference-source metadata. Never weaken the old validator to fabricate scores. |
| `sdp_node_samples` | Permit nullable environmental values for hybrid runs; validate null against linked observation validity. Keep numeric/range and exact matching requirements for scripted samples. Add or version per-field observation timestamps so receipt/acquisition and evaluation are not conflated. |
| Initialize/commit RPCs | Branch strict validation by stored immutable run version; configured hybrid node count rather than fixed two; scoped null MISSING references; hardware evidence identity/timing checks; hybrid checkpoint vacancy/receipt state. Keep all tables/checkpoint updates in one transaction. |
| Generator info/writer verification | Advertise supported versions explicitly; preserve dedicated-project and privileged-key guards. Existing scripted clients must continue to verify and resume unchanged. |
| Publication | Preserve existing scripted publication; explicitly define hybrid initial activation without seven-day synthetic seed. Do not auto-publish test runs into the shared demo. |
| RLS | Preserve current simulated demo access. Hybrid measured rows must not automatically inherit anonymous public access; begin with isolated/private integration and an approved access policy. |

Retain run locks, expected-sequence checking, exact-content retry hashes, FK
scope checks, command/decision/report correlation and RPC-only writes. Reject a
scripted run using hybrid-only IDs, null samples or measured provenance. Regression
tests must exercise old and new modes before this proposal becomes deployable.

## Exact next steps and remaining gaps

1. Confirm deployed device identity/count, actual packet examples, classifier
   library/version and physical footprint. Decide whether one physical node
   actually covers the zone; no configuration should assert coverage by default.
2. Review the adapter contract and model-score limitation above. Agree a versioned
   hardware event representation and clock/receipt semantics without changing firmware.
3. Add an opt-in server MQTT transport using existing HiveMQ/topic configuration,
   a unique client ID, actual retained flags and explicit node allowlist. On failure,
   surface unavailable evidence and track gaps; do not silently refresh cached input.
4. Build a separate hybrid orchestrator around this adapter/policy, reusing existing
   forecast and simulated-output event generation. Give it sole authority over its
   own hybrid run. The MQTT consumer buffers evidence and never writes snapshots.
5. Prepare the full migration and backward-compatibility tests from the proposal;
   obtain explicit schema approval before application. Validate in a disposable
   database, then an isolated Supabase project. Freeze evidence in each pending
   tick and advance checkpoint only after the existing transactional commit succeeds.
6. Update all dashboard readers together for approved hybrid contracts, nullable
   environment, receipt-time freshness and per-field provenance. Verify timeline,
   historical correlation, statistics and snapshot-pinned CSV with mixed sources.
7. Connect actual ESP32 telemetry in isolation, exercise inactivity, thermal/BME
   failures and reconnects, and compare packets to stored decisions and UI. Obtain
   approval before touching the shared generator, publication, deployment or merge.

This prototype does not validate firmware sensor accuracy, prove whole-room
vacancy from one footprint, provide physical HVAC control, or measure energy savings.
The current firmware's own fan PWM remains separate from SDP simulated feedback.
