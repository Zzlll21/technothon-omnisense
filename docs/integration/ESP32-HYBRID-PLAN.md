# ESP32 Hybrid Mode B: inspection and staged implementation plan

Inspection date: 2026-10-22. Baseline: `ec62d189aaea13c1502388497baede633b4e4378`.
Working branch: `feature/esp32-hybrid`, already present and clean at inspection,
with the same HEAD as `codex/omnisense-spatial-integration`.

Status: repository inspection and planning only. No application code, schema,
credentials, running services or remote state changed. Physical deployment is
unverified. No firmware source or deployed-device inventory was found in this
checkout. The old `demo-1`/`demo-2` examples do not establish a physical inventory.

## Verified implementation

| Boundary | Authoritative files | Current behavior |
| --- | --- | --- |
| MQTT ingestion | `services/mqtt-subscriber/index.js`, `validateTelemetry.js`, `insertReading.js` | Subscribes to `omnisense/node/+/telemetry`; validates legacy temperature, humidity, headcount, PMV and crisis mode; writes only `sensor_readings`. No SDP handoff. |
| Firmware contract | `docs/mqtt-contract.md`, `docs/firmware-integration-guide.md` | Describes headcount telemetry, not a verified TinyML classification packet. Environmental fields are required by this legacy contract, regardless of actual sensor capability. |
| SDP orchestration | `services/sdp-generator/index.mjs` | Generates seven days of scripted history, then 30-second continuous frames. Holds an identical pending tick across write retries and resumes a persisted checkpoint. |
| Evidence and policy | `services/sdp-generator/src/model.ts` | `schedule()` supplies population; `scriptedState()` derives occupancy, vacancy age, mode and output directly from the timetable. `generateTick()` then creates two simulated classifications. Decisions do not consume those classifications. |
| Transactional writer | `services/sdp-generator/writer.mjs`, `supabase/sdp/migrations/001_sdp_foundation.sql` | Dedicated SDP installation only, immutable run definition, scoped RPC writes, sequence locks, exact-retry hashes and atomic publication. Publishing a new run archives the previous ACTIVE run. |
| Shared contract | `packages/sdp-contract/src/types.ts`, `validate.ts` | Already represents measured/unavailable observations, independent environmental validity, uncertainty, coverage and node freshness. This is broader than persisted SDP support. |
| Dashboard | `apps/dashboard/src/api/{overview,nodeHistory,predictiveHistory,utilizationHistory,operatingRecords}.ts` | Explicitly requires REPLAY clock and simulation-only provenance. Overview/history require numeric environmental samples. |

### Occupancy-to-cooling trace

Currently: timetable -> scripted population/vacancy age -> scripted cooling mode
and output -> generated evidence/forecast/decision/output -> one transactional tick
-> committed snapshot -> dashboard.

There is no implemented sensor occupancy-fusion layer to connect to. The smallest
correct change introduces fusion and feeds its result into a factored cooling
policy while preserving the synthetic path's existing behavior. Replacing only
the displayed samples would leave cooling controlled by the timetable.

Preserve current synthetic settings: occupied AUTO/24.5 C; five-minute vacancy
confirmation; short vacancy LOW/27 C; long vacancy after 20 minutes OFF/null;
ten-minute precooling lead for timetable gaps of at least 30 minutes. In hybrid
mode, vacancy age must come from continuous valid vacancy evidence, not the
timetable's previous occupied period. Keep timetable forecasts explicitly
synthetic and keep simulated output correlations intact.

## Storage constraints requiring an approval decision

The existing database cannot persist an honest general hybrid run unchanged:

- Run model version is fixed to `sdp-scripted-v1`.
- Node IDs are restricted to `sim-1` and `sim-2`; initialization and commits require
  exactly two nodes/samples.
- Event provenance must be exactly `["SIMULATED"]`; event clocks must be REPLAY.
- Temperature and humidity samples are NOT NULL. Samples must use frame time;
  incoming device observation time cannot simply replace that time.
- Decision evidence-reference validation assumes referenced evidence exists,
  including entries that a hybrid controller needs to mark MISSING with null IDs.
- History is fixed to seven days. Publishing a new run automatically replaces
  the active run, so a different run ID alone does not isolate a live experiment.

Do not rename a physical device to a simulated ID, fabricate environmental
values, fabricate a second physical node, or label measurements SIMULATED to
work around these constraints. Do not edit the original migration in place.

Prepare a separate, backward-compatible migration proposal after confirming the
device contract. Proposed scope: permit an explicit hybrid run version and
configured node inventory; support truthful observation provenance and clock
scope; permit unavailable environmental values; separate frame/evaluation time
from per-field observation time; validate configured node coverage and nullable
MISSING references while retaining causal event and checkpoint checks. Keep
existing synthetic runs valid and keep simulated actuator feedback mandatory for
this mode. Review whether the seven-day seeding/publication rules need a
mode-specific extension. Preserve RPC-only writes and existing RLS guarantees.

The handoff explicitly requires approval before schema changes. No migration is
implemented or applied in this planning stage. Without approval, adapter/fusion
development can proceed offline, but persisted hybrid integration cannot be
completed honestly with these constraints.

## Intended architecture and ownership

ESP32 -> existing HiveMQ telemetry topic -> server-side MQTT adapter -> evidence
buffer -> fusion -> cooling policy + existing synthetic forecast -> existing
transactional writer -> spatial dashboard.

Use one hybrid orchestrator as the sole writer of its run. The MQTT adapter
accepts and normalizes evidence; it must not independently write SDP frames or
decisions. Preserve the legacy subscriber for the old demonstration rather than
loosening its contract globally. Reuse topic parsing/transport where appropriate,
but add a distinct hardware validator once actual firmware output is known.

Keep synthetic mode the default. Hybrid selection, node mapping and capabilities
are explicit immutable run configuration. Do not change a synthetic run into a
hybrid run in place. Persist enough fusion/vacancy and accepted-message state to
resume deterministically. Freeze selected evidence with each pending tick so
new MQTT packets cannot change a retry's content.

Use an isolated test Supabase project for hybrid integration and cutover testing.
Running initialization/seeding against the shared demo is a publication action,
even with a new run ID, and requires approval. Transactional sequence locking
remains essential but does not by itself enforce process ownership; add a local
single-instance guard for the prototype and document one orchestrator per run.
Any cross-host lease would need inclusion in the reviewed schema proposal.

## Stages and acceptance criteria

### 1. Confirm physical inventory and payload

Obtain a sanitized packet from each actual device, exact MQTT topic/node ID,
deployed unit count, monitored footprint, firmware/model versions and classifier
label/score semantics. Confirm ambient-temperature and humidity sensor models,
if present. Thermal pixel temperatures are not automatically ambient temperature.
Confirm publication interval, device time synchronization, boot/message identity,
sequence behavior, QoS, retained-message behavior and reconnect handling.

Acceptance: a capability/mapping table and validated packet fixtures for the
actual hardware; no assumption that two devices or environmental sensors exist.
If firmware reports headcount alone, document a derived occupancy/category
mapping rather than claiming access to TinyML labels or confidence scores.

### 2. Build offline adapter and evidence state

Implement a pure parser/normalizer and an injectable MQTT transport in the
server-side generator boundary. Allowlist topic identities and validate payload
identity agreement. Represent absent fields as UNAVAILABLE independently.
Do not invent classifier probabilities when firmware does not supply them;
resolve any contract limitation explicitly before normalization.

Track device observation time and gateway receive time separately; reject
invalid/future timestamps beyond agreed skew. Use boot ID plus sequence/message
ID where available to deduplicate and reject old packets. Define restart and
clockless-device behavior explicitly. Do not let retained or duplicate packets
refresh observation age. Track broker disconnects and age cached evidence through
FRESH/STALE/DISCONNECTED/MISSING/INVALID using agreed configuration.

Acceptance: deterministic tests for malformed payloads, identity conflicts,
unknown nodes, optional measurements, duplicates, out-of-order delivery,
retained packets, boot resets, clock skew, broker reconnect and buffer recovery.
No database or real broker is required for this stage.

### 3. Factor policy and introduce conservative fusion

First prove the factored synthetic pipeline preserves existing scripted output.
Then add a hybrid evidence provider and fusion over configured required coverage.
Fresh valid occupied evidence makes the zone OCCUPIED. Confirm VACANT only when
all required coverage is fresh, valid and empty for the confirmation interval.
Missing/stale/disconnected/invalid or ambiguous evidence must prevent confirmed
vacancy; use UNCERTAIN with conservative occupied cooling and clear reasons.
THERMAL_ANOMALIES must not count as confirmed empty. Do not sum overlapping
headcounts. One physical node can cover the zone only if its footprint is
confirmed; otherwise represent incomplete coverage explicitly. Synthetic evidence
must not certify an uncovered physical footprint as vacant.

Feed actual fused occupancy and persisted vacancy timing into the retained mode
policy. Synthetic timetable forecasts may request precooling but may not turn
fresh occupied evidence into vacancy. Emit updated decisions when coverage,
freshness or evidence references change even if the requested mode stays equal.

Acceptance: the same clock/timetable with occupied versus empty hardware fixtures
produces the expected different cooling decisions; lost evidence clears vacancy
confirmation and cannot lead to OFF. Test vacancy transitions, occupied return,
forecast expiry, restart, dwell behavior and conservative fallback.

### 4. Review storage proposal, then integrate approved persistence

Present the concrete migration and run/clock strategy for explicit approval
before changing schema. Prefer a separately versioned hybrid run with live
observation semantics; never stamp today's readings onto seven days of history
or generator catch-up intervals. If synthetic history is included, label it per
event and observation and establish an explicit hardware cutover boundary.
Downtime must remain unavailable unless actual historical readings are recovered.

After approval, validate migrations against a disposable database. Extend writer
verification and checkpoint handling without weakening project confirmation,
retry hashing, scoped references, atomic publication or RLS. Preserve original
timestamps and evidence identity when a reading spans several evaluations.

Acceptance: transactional rollback, exact retry, restart recovery, conflicting
writer rejection, missing evidence and unavailable environmental values tested;
old synthetic runs still load; publishing in the isolated project cannot touch
the stable demonstration.

### 5. Extend dashboard provenance and history support

Update all five persisted-event readers together for approved hybrid clock and
provenance rules, retaining run/zone/sequence/cutoff validation. Update sample
types, chart gaps and spatial status mapping for independent unavailable fields.
Display measured occupancy, missing environmental measurements, synthetic
forecast and simulated HVAC output distinctly. Keep configured demo placeholders
visibly distinct from deployed hardware. Additional floor rooms stay illustrative.

Preserve exact historical inspection, decision/command/output correlation,
snapshot-pinned pagination/count/export and utilization semantics. Existing CSV
already includes provenance, clock and full event JSON; extend only if needed,
and preserve the original synthetic export behavior. Utilization continues to
describe simulated applied output, never measured energy or verified savings.

Acceptance: synthetic regressions pass; mixed-source and unavailable-field
fixtures render consistently in overview, node history, cooling timeline,
statistics, records and CSV. Inspect desktop and phone layouts.

### 6. Isolated hardware acceptance and approved cutover

Replay sanitized packets locally, then connect the confirmed device(s) in an
isolated test environment. Demonstrate occupied/empty transitions and unplug,
network loss, duplicate/reordered delivery and reconnect. Compare MQTT evidence,
stored causal decision and dashboard at the same committed snapshot.

Run contract, generator/model/writer/database and dashboard regression suites,
typechecks and site build. Record actual results; the earlier 119 tests and
2,896-row CSV comparison are historical Phase 4 evidence, not this pass's tests.
No dependencies are installed in this checkout, so no baseline suite was run
during this inspection.

Acceptance: real occupancy demonstrably changes cooling requests; environmental
fields match actual capabilities; HVAC remains explicitly simulated; no competing
writer or fabricated physical node. Physical-device validation and remaining
Phase 5 acceptance need their own evidence.

Present the tested artifact and cutover/rollback procedure before requesting
permission to restart the shared generator, publish a shared run, deploy, merge
or push. Preserve the stable integration branch and existing synthetic service.
