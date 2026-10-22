# Stage 3 implementation plan and migration review for approval

Date: 23 October 2026, Asia/Kuala_Lumpur. Branch: `feature/esp32-hybrid`.
Baseline integration commit: `ec62d18`. Status: **planning and read-only validation
only; no implementation or database changes authorized by this document**.

## 1. Verification result and outstanding hardware gate

The user reports two physical devices publishing as `demo-1` and `demo-2`.
The existing Stage 2 runner was exercised with both IDs, exact telemetry topics,
TLS, a unique diagnostic client ID and full-zone coverage explicitly false.
The existing firmware ZIP supplied MQTT settings to the child process in memory;
no credentials or private environment files were changed or saved.

Observed window: 23 October 2026 **00:13:04.277–00:14:03.681 Malaysia time**
(22 October 16:13:04.277–16:14:03.681 UTC). MQTT connection and both subscriptions
succeeded. Accepted packets: **0**. Rejected packets: **0**. Both nodes remained
MISSING after subscription, zone occupancy UNCERTAIN, coverage UNKNOWN, simulated
request OCCUPIED/AUTO/24.5 C. The diagnostic process stopped normally.

The user subsequently confirmed **the devices were offline during this check**.
Therefore simultaneous physical reception, independent physical readings, real
classification/BME values and physical freshness-loss recovery are **not verified**.
Broker reachability and two-topic subscription are verified. Do not represent
this as a completed two-device hardware trial.

An additional in-memory constructed replay exercised the unchanged Stage 2 monitor:

| Replay input | Zone result | Request |
| --- | --- | --- |
| Node 1 occupied; Node 2 active empty; coverage not validated | OCCUPIED / DEGRADED | OCCUPIED |
| Both active empty; coverage not validated | UNCERTAIN / DEGRADED | OCCUPIED |
| Both active empty; coverage asserted for this fixture only | VACANT / COMPLETE | OCCUPIED during confirmation |
| Empty plus inactive, or empty plus missing, with fixture coverage | UNCERTAIN / DEGRADED | OCCUPIED |
| Node 1 receives a new occupied packet; Node 2 receives nothing for 91 seconds | Node 1 FRESH, age 0; Node 2 STALE, age 91,000 ms | OCCUPIED |

This confirms **software separation of inventories, receipt clocks and freshness**,
not physical independence. A subscriber cannot infer publisher Client IDs or MACs
from these firmware payloads. Unequal sensor values alone are also insufficient
proof of device independence. Hardware acceptance requires controlled per-device
power/observation tests and operator confirmation of distinct flashed identities.

## 2. Architecture and policy to retain

One hybrid orchestrator in a new test environment owns the run:

```text
ESP32 demo-1/demo-2 -> existing HiveMQ TLS telemetry topics
 -> existing hardware normalizer / per-node evidence buffer
 -> existing fusion and coolingPolicy() + existing synthetic booking forecast
 -> one hybrid transactional writer -> isolated Supabase test project
 -> separately configured local Spatial Dashboard preview
```

The MQTT consumer never writes frames independently. Stage 2 diagnostics remain
subscribe-only. The original synthetic generator continues against its existing
project with its current run, credentials and entry point. No hybrid run is
initialized or published in that project.

Keep the existing two-node fusion: any fresh valid occupied node establishes
OCCUPIED; only fresh valid active empty evidence across all required coverage can
establish VACANT; otherwise UNCERTAIN. Do not sum capped/overlapping headcounts.
PIR inactivity, missing thermal sensing, fallback zero and invalid classification
cannot confirm vacancy. Positive fallback evidence stays attributed to fallback.
Two physical devices do not automatically establish complete spatial coverage.

Keep five-minute vacancy confirmation, short vacancy LOW/27 C, long vacancy after
20 minutes OFF/null, occupied AUTO/24.5 C and eligible synthetic-booking precooling
HIGH/24.5 C. Occupied/uncertain input defeats reduced cooling. Every loss of valid
vacancy continuity resets its timer, including transient occupied/unknown packets
between commits, reconnects and stale intervals.

With the unchanged firmware, a quiet empty room can become PIR-inactive before
five minutes of active empty evidence accumulate. In that case conservative
occupied cooling can persist indefinitely. Persistence does not remove this
sensing limitation. Sustained-vacancy/reduced-mode tests must be labelled replay
unless continuous qualifying empty hardware evidence is actually observed.

Hardware temperature and humidity are observations for display/history in this
stage. The existing policy does not use them to calculate new setpoints. Do not
add a PMV controller, environmental-limit policy, learned forecast or new energy
savings calculation under this persistence change. Existing config limit/dwell
fields must not be presented as newly implemented algorithms.

Reuse the actual booking schedule and existing forecast/output builders after a
behavior-preserving extraction if necessary. Do not call the synthetic tick
generator to manufacture replacement hardware samples. Preserve synthetic-mode
full-tick parity. LIVE describes the hybrid clock, not measured forecasts or HVAC.

## 3. Proposed mapping into stored snapshots

Use an explicit new run model `sdp-hybrid-v1` and new event version
`sdp.v1-hybrid.1`; preserve `sdp-scripted-v1` and `sdp.v1-draft.1` unchanged as
supported legacy contracts. The new version is a proposal, not an existing validator.

| Hardware/derived input | Proposed stored representation |
| --- | --- |
| Topic and payload identity | Exact configured `demo-1`/`demo-2` node IDs. Reject disagreement; never rename them to sim IDs. |
| Gateway receipt | Original `received_at`; explicit `time_basis=GATEWAY_RECEIPT`. Device observation time stays null because firmware does not supply it. |
| Headcount | Validated capped value 0..3 with THREE_PLUS semantics, not an exact count above three or a summed zone total. |
| TinyML result | Effective classification plus original label, winning confidence and `headcount_source`. Scores distribution remains null; do not invent one-hot confidence. |
| Blob fallback | Preserve fallback method independently of the last TinyML label/confidence; do not present fallback classification as accepted TinyML. |
| Unknown model/firmware versions | Nullable version fields plus operator-supplied, explicitly attributed deployment metadata if later verified. Do not fabricate version strings as measurements. |
| BME280 temperature/RH | Independent observation values, MEASURED source, original gateway receipt proxy and validity. N/A/null/missing -> UNAVAILABLE/null. Invalid numbers -> INVALID/null. |
| Node missing | Snapshot node state MISSING, null evidence reference and null unavailable measurements. A missing row of evidence is not a fabricated physical node or an empty observation. |
| Stale/disconnected last reading | Retain original identity, receipt and values as attributed history; snapshot node state makes it ineligible for vacancy. Never advance observation time during commits. |
| Zone decision | Authoritative fusion, coverage, exact config/evidence/forecast references, reason, evaluation and vacancy-confirmation times. |
| Forecast | Same synthetic timetable, next-use window, expiry, supersession and restart behavior; source BOOKING, provenance SIMULATED. |
| Applied report | Same simulated settings, command/decision correlation and `feedback_basis=SIMULATED`; firmware local fan telemetry is not its acknowledgement. |

NODE_EVIDENCE provenance reflects each observation's measured/unavailable basis.
Decision provenance summarizes actual consumed inputs, including synthetic forecast
when used; it never means the decision itself was physically measured. Forecast
and simulated-output provenance remain explicit. Config is operator/test
configuration, not a measured sensor reading.

Each commit still contains a complete frame, per-configured-node sample projections,
new events and checkpoint. It must not blend two different committed cutoffs.
Keep a configured representative environmental node (proposed `demo-1`, subject to
placement review); do not average nodes or substitute `demo-2` silently when it
is unavailable. Map both nodes to the one supported zone; other floor rooms stay
illustrative. Physical positions/coverage require operator validation.

### Time, cadence and recovery

- Preserve the original synthetic seven-day backfill and 5-minute/30-second timing.
- Hybrid history starts at actual activation; `history_start=live_anchor`. Do not
  synthesize seven days of hardware observations or write current packets into
  missing past intervals.
- Use a nominal 30-second complete-frame heartbeat, with earlier commits for
  meaningful occupancy, evidence-quality, freshness, forecast or mode changes.
  Environmental numeric jitter alone need not produce a new frame every second.
  Process every incoming packet so a transient occupied reading cannot be lost.
- Hybrid frame times are strictly increasing real evaluation cutoffs, not the
  synthetic fixed-step timeline. Buffer same-millisecond arrivals rather than
  inventing increasing source timestamps. Source receipt, decision evaluation,
  frame cutoff and database insertion remain separate concepts.
- Keep the existing relational `simulated_at`/`last_simulated_at` names for backward
  compatibility; for LIVE runs these are explicitly logical frame cutoffs. Expose
  neutral frame-time names in new adapters/UI. Do not relabel hardware as replay.
- Add per-sample `sampled_at` (frame cutoff) and per-field observation/receipt
  timestamps. Repeated references to an old reading never become new acquisitions.
  History must allow repeated receipt times across different snapshot projections.
- Retain evidence events once per selected acquisition/state change, with stable
  gateway-assigned IDs. Do not store every identical 1 Hz packet by default or
  pretend snapshot history is the complete raw sensor stream. Preserve transient
  occupied/invalid evidence needed to explain vacancy resets and decisions.
- A hybrid event may precede its committing frame cutoff. Validate occurrence <=
  cutoff and committed sequence together; never expose later/uncommitted knowledge
  during historical inspection. Do not force receipt-time events to pretend they
  occurred at the next heartbeat.
- Freeze a pending transaction's evidence, events, IDs and checkpoint. New MQTT
  data goes into a bounded queue for the next transaction, never into a retry.
  Queue overflow marks an evidence gap and clears vacancy continuity.
- Restart reloads the committed checkpoint, drops current-session authority and
  waits for fresh packets. Downtime stays a visible history gap; do not catch up
  using today's readings. Publish the next current frame with the next sequence,
  allowing a real timestamp gap. Older intervals remain unknown in utilization.

Firmware has no reliable source sequence/boot/acquisition time, so gateway IDs
provide ingestion identity and database retry identity only. They do not solve
source-level duplicate/reordering detection. Preserve the Stage 2 conservative
retained/DUP handling and document this limit.

## 4. Migration review: exact constraints and guard requirements

The Stage 1 report contains a migration **design table**, not executable SQL.
There is currently no Stage 3 SQL migration to certify as deployable. After plan
approval, prepare a separate `002_sdp_hybrid.sql` candidate and its local tests;
leave `001_sdp_foundation.sql` intact. Never apply this to the active demo project.

| Existing object/constraint | Proposed change, preserving scripted behavior |
| --- | --- |
| `sdp_runs.model_version = sdp-scripted-v1` | Permit the explicitly versioned hybrid model; no arbitrary model strings. |
| Seven-day `live_anchor-history_start` CHECK | Conditional by immutable run model: seven days for scripted; zero for hardware activation. Retain valid seed/config semantics for synthetic forecast inputs. |
| Run definition/checkpoint | Separate hybrid type with model, clock, node capabilities/coverage, original receipts, vacancy state and stream epoch. Never mutate an existing synthetic run into hybrid mode. |
| `sdp_nodes` restricted to sim-1/sim-2 | Permit bounded configured hardware IDs, with mode-aware server validation. Scripted runs must still contain exactly the original sim inventory; hybrid inventory must match its immutable config exactly. |
| Fixed two nodes/samples in initialize/commit RPC | Validate against required inventory, not just array length. This deployment expects demo-1/demo-2; reject duplicate, foreign, omitted or fabricated nodes. Emit explicit missing projections where configured hardware has no reading. |
| `sdp_events` only draft.1 / REPLAY / [SIMULATED] | Allow only approved version/clock/provenance combinations, matched to stored run model. Legacy events retain their strict existing rules. Reject mixed-scope/version input. |
| Classifier wire contract requires every class score and non-null version strings | Add versioned hybrid evidence with nullable distribution/version fields and inference method/original metadata. Keep old shared validator strict. |
| `sdp_node_samples` NOT NULL temperature/humidity/observation/evidence ID | Permit explicit hybrid unavailable/missing values only, checked against linked event validity and snapshot state. Preserve legacy numeric/non-null behavior server-side. |
| Temperature SQL range 15..40 C | Preserve it for scripted samples. For measured BME observations use the normalizer's finite -40..85 C sensor range; keep RH 0..100%. Sensor range is not a new cooling comfort limit. |
| Sample observation time must equal frame time | Separate sampled/evaluation cutoff from original gateway/per-field times. Check exact values and source identities against linked evidence; no commit-time freshness refresh. |
| All new event occurrence times must equal frame time | Keep exact equality for legacy. Hybrid permits ordered source/evaluation events at/before its cutoff; column/envelope timestamps must agree and remain within the run. |
| Every sample/decision evidence reference must resolve, even MISSING | Allow null only for explicit MISSING/unavailable cases. Other references must match run, zone, node, event type, scope and causal cutoff. |
| Synthetic 5-minute seed / exact 30-second advancement and HISTORY phase | Preserve for scripted RPC. Hybrid requires monotonic actual cutoffs, first-frame activation and CONTINUOUS phase; permit early state-change commits and downtime gaps. No HISTORY hardware backfill. |
| Publication only at synthetic anchor, archives previous ACTIVE run | Preserve legacy behavior. New hybrid initialization publishes only with its first complete committed frame in the isolated project. Never target the shared demo to test this. |
| Info RPC/writer verification advertises only one model | Preserve existing fields/values used by legacy `verify()`; add explicit hybrid capability metadata. The new writer checks those capabilities and test-environment identity. |
| Writer RPC allowlist, SDK contract parser and CLI assume scripted Run/Tick | Add a separate opt-in hybrid entry point and narrow hybrid RPC allowlist/type parser; keep legacy CLI/default and write guards unchanged. |
| Current RLS exposes every ACTIVE run to anon/authenticated | Keep synthetic demo access unchanged. Hybrid measured runs deny anonymous reads and require explicit approved test-reader membership, scoped by run/project. No public hardware rows by default. |

Retain one supported zone, all four cooling modes, output simulation guards,
command uniqueness, exact reference correlation, transactional rollback, RLS,
RPC-only writes and one ACTIVE run per project. These are not constraints to loosen.

Use new versioned hybrid initialize/commit/lease RPCs rather than teaching the
legacy CLI to switch modes implicitly. Add an explicit stored-model guard to the
legacy commit RPC in the candidate migration: the current function does not check
the stored model before advancing. Merely widening table checks would otherwise
allow cross-mode writes. Mode-aware triggers/RPC checks must also preserve the
old inventory/non-null/range invariants when global column constraints widen.

Add a private hybrid writer lease/fencing record per run. Acquisition under a run
lock yields an owner/epoch; only that owner/epoch may commit or renew. Reject
unexpired competing owners, expired/stale epochs and conflicting sequence/content.
This is stronger than assuming a local single-instance guard prevents cross-host
writers. Legacy runs do not participate in the new lease mechanism.

All privileged functions need trusted search paths, explicit service-role EXECUTE
grants, PUBLIC/anon/authenticated EXECUTE revocation and no direct table mutations
by browser roles. SQL must validate envelopes/references/null semantics itself,
not rely solely on the TypeScript adapter. Use explicit column lists in new SQL
and test old functions if adding columns affects positional inserts.

## 5. Reader, history, CSV and display review

All five persisted readers currently reject non-simulated sources and LIVE clocks:
`overview.ts`, `nodeHistory.ts`, `predictiveHistory.ts`, `utilizationHistory.ts` and
`operatingRecords.ts` under `apps/dashboard/src/api/`. Version dispatch must be
based on the pinned run, never a broad removal of source/scope checks.

Additional changes required after approval:

- `src/types/overview.ts` requires numeric samples/non-null times and evidence IDs.
  Add versioned sample/run types rather than making legacy invalid data acceptable.
- Node history requires strictly increasing observation times; predictive history
  equates observation time with frame time. Hybrid queries need sampled-time
  pagination plus original receipt times, and explicit missing/invalid points.
- History charts, comparison charts, `spatialCooling.ts` inspection and freshness
  mapping need per-field null handling and the two time axes. Deduplicate repeated
  acquisition IDs for measurement plots; keep per-frame states for inspection.
  Do not bridge stale/unavailable/downtime intervals or select future readings.
- Utilization already uses elapsed time and an unknown-gap detector. Retain its
  semantics while using the run's hybrid heartbeat metadata for gap thresholds;
  early state commits must not inflate duration, and downtime must stay unknown.
- Preserve the configured representative environment node; missing data must not
  cause averaging or silent borrowing from the other node.
- Replace global simulation-only feed labels with per-field hybrid provenance.
  Forecasts and HVAC outputs must still be explicitly labelled simulated. Keep
  the existing floor, 3D workspace, node selection and illustrative rooms.
- The active CSV path is `api/exportOperatingRecords.ts` ->
  `lib/operatingRecordsDisplay.ts`, **not only** `lib/sdpRecords.ts`.
  `operatingCsvRow()` currently hardcodes `Simulated SDP operating records` and
  its active columns lack explicit per-node hardware measurements/provenance.
  The generic records exporter having provenance/full JSON does not fix this path.
- Preserve byte-for-byte synthetic CSV behavior. For hybrid exports, use an explicit
  versioned CSV layout with node ID, source/method, raw/effective classification,
  nullable measured fields/validities, receipt/time basis, event/decision references,
  LIVE clock and simulated forecast/output basis. Keep synthetic requested/reported
  distinctions. A node-evidence record may carry its own measurements; decisions
  with two nodes must use clearly named node fields or a documented evidence JSON
  field, not silently choose or average one sensor.
- Keep identical applied filters, snapshot sequence/as-of time, server counts,
  stable pagination, UTC/+08 timestamps, escaping/formula protection, cancellation,
  500-row batches, 50,000-row/25 MiB limits and no partial downloads. Verify exact
  related-record navigation and historical CSV, not merely the first page.
- Review the replay-only local override builder separately; do not enable hardware
  commands or claim a persisted live override implementation as part of this work.

## 6. Isolated environment proposal

Proposed project name: **omnisense-hybrid-stage3-test**. No project has been
created or configured. A separate run ID or schema inside the active demo project
is insufficient isolation because publication/RLS are project-wide today.

After approval, first validate migrations in disposable local PostgreSQL/PGlite.
Then provision a separate Supabase project with a different project reference,
URL, keys and installation marker. Apply the reviewed foundation + candidate
migration only there. Never import real production credentials or a live data dump.

The future hybrid writer requires explicit write enablement, exact confirmed test
project URL/reference, test installation marker/capability check, explicit run ID
and rejection of the recorded stable demo project reference. Record both project
references as non-secret deployment metadata and assert they differ. Do not fall
back to the existing generator's `.env` or keys. Keep server keys backend-only.

Use a separate local dashboard preview/process/port with explicitly supplied test
configuration; do not edit shared dashboard `.env` or the deployed site. Existing
public-config validation accepts a well-formed separate Supabase URL and publishable
key, but a publishable key alone will not read private hybrid rows. Use a dedicated
read-only authenticated test user/session in the preview harness, scoped by the
new reader policy. Do not put service-role keys in the browser or enable public
hardware reads to make the preview work. Synthetic anon readers keep working.

Rollback is to stop the new test writer/preview and retain/export the isolated
test dataset. Do not drop shared objects, delete the active run, rotate credentials
or restart the original generator. No production cutover or deployment is included.

## 7. Implementation sequence after approval

1. Complete the live two-device identity/coverage gate, or record it as pending
   while doing only offline work. Capture sanitized fixtures with explicit provenance.
2. Implement hybrid event/run/sample contracts and a strict version dispatcher.
   Preserve legacy contract tests and synthetic tick/CSV parity.
3. Prepare `002_sdp_hybrid.sql`, lease/RLS design and local migration/RPC tests.
   Review actual generated SQL before any hosted application. The Stage 1 table
   alone is not sufficient approval to execute SQL.
4. Implement one opt-in hybrid orchestrator/writer using the existing MQTT adapter,
   policy, booking forecast and simulated-output semantics. Test frozen retries,
   concurrent-input buffering, fencing, gap handling and recovery offline.
5. Update readers, normalized display models, chart gaps and versioned hybrid CSV
   together; verify both run modes in a separate local preview.
6. Only after explicit approval of the concrete migration and isolated target,
   provision/apply there and start its one test writer. Run the end-to-end matrix.
7. Deliver evidence and remaining limits. Stop before any shared-project change,
   production publication, firmware change, physical actuation, push or merge.

## 8. Exact acceptance matrix

These are required future pass criteria, **not results already observed**.
Hardware-only cases require powered devices; deterministic timing/error cases can
use explicitly labelled captured-fixture replay in the isolated environment.

| ID | Action | Required result |
| --- | --- | --- |
| H1 | Run both exact telemetry subscriptions for 120 s with devices online | At least 30 newly received, non-retained valid packets per node; advancing independent receipts; no identity mismatch; saved sanitized capture/provenance. |
| H2 | Observe a device-specific stimulus, then power off Node 1 for >180 s while Node 2 remains online; reverse | Only the powered-off identity stops advancing and ages through stale/disconnected; the other stays current. Confirm unique publisher identity by operator/broker connection evidence, not topic spelling alone. |
| H3 | Observe active occupied, active EMPTY_CORE, PIR inactive, thermal unavailable, BME valid and N/A paths | Source/label/confidence/count/validity retained independently; inactive/unavailable zero never becomes confirmed empty. If a state cannot be produced physically, mark its fixture test separately. |
| F1 | One occupied + one empty/missing/stale | Zone OCCUPIED; degraded coverage when appropriate; AUTO/24.5 C. No summing of headcounts. |
| F2 | Both active empty, coverage false | UNCERTAIN and conservative occupied cooling; no vacancy confirmation. |
| F3 | Both active empty, coverage validated; replay at 12:00 Malaysia | Before 12:05 occupied cooling; at 12:05 SHORT_VACANCY/LOW/27; at 12:20 LONG_VACANCY/OFF/null; at 12:50 eligible PRECOOL/HIGH/24.5. Forecasts identical to the original schedule at each instant. |
| F4 | Repeat F3 with either node occupied at the same times | Same forecast window/restart, but OCCUPIED/AUTO/24.5; immediate return to occupied after a valid occupied transition. |
| F5 | Interrupt confirmed vacancy with inactivity, invalid data, a transient occupied packet, transport gap or stale interval | Vacancy timer resets; no reduction based on old empty data, including packets received while a DB commit is pending. |
| P1 | Commit a frame with two different valid node values | Exact original per-node values, IDs, receipt proxies and provenance returned; no environmental averaging or swapped identities. |
| P2 | Commit missing BME on one node and missing evidence for the other | Explicit null/UNAVAILABLE observations and scoped MISSING/null references; no zeros or fabricated evidence events. Scripted mode rejects equivalent invalid legacy nulls. |
| P3 | Retry an identical transaction after a lost response | One committed frame/event set; identical hash/IDs acknowledged; checkpoint advances once. A changed retry at the same sequence is rejected atomically. |
| P4 | Introduce wrong scope, wrong event type, future evidence, reference mismatch, duplicate node, wrong model or output command | Whole transaction fails; no partial events/samples/frame/checkpoint. Test model guards in both old and new RPCs. |
| P5 | Start competing writers or use a stale lease epoch | Second owner/stale epoch rejected; one authoritative sequence; no repeated conflicting writer loop. |
| P6 | Kill/restart writer and interrupt its database connection while MQTT continues | Resume committed checkpoint; pending retries remain frozen; queued occupied pulses are preserved or overflow explicitly invalidates continuity; no fake backfill across downtime. |
| P7 | Initialize/activate hybrid test run | First complete frame atomically visible in test project; stable project's active run and configured writer remain untouched. |
| R1 | Read hybrid anonymously, as unauthorized authenticated user, then approved read-only test user | First two denied; approved scoped reads succeed; every browser role denied writes and privileged RPC execution. No frontend secret. |
| R2 | Load overview, floor, 3D workspace, each node inspector, 1 h/24 h history, cooling/statistics and records | Same committed run/zone/sequence, independent node state, correct nullable fields/provenance; missing/stale intervals remain gaps. |
| R3 | Pin history at T, then append later occupied/evidence/forecast/output events | Inspection and related records at T do not import later timestamps or sequences. Repeated receipt references do not fabricate new measurement points. |
| R4 | Cross a real writer downtime gap and a Malaysia midnight boundary | Unknown downtime excluded from known utilization; elapsed intervals partition correctly; early state commits do not multiply durations. Statistics still describe simulated output, not energy. |
| C1 | Export both node-evidence and decisions/reports with >500 matching rows | Complete multi-page count, shared filters and pinned snapshot; correct node source/measurement validity and distinct requested/reported output; no simulation-only label on measured fields. |
| C2 | Add new records during pinned export | Export remains at the original committed cutoff; no mixed snapshot, changing count or duplicate/missing rows. |
| C3 | Cancel/export failure or exceed 50,000 rows / 25 MiB | Existing limits and explicit failures; no partial download. Quotes, newlines, Unicode, formula-like strings and UTC/+08 timestamps remain correct. |
| B1 | Run the original synthetic generator/model, contract and dashboard suites against migrated local fixtures | Existing behavior passes, all 4,897 full synthetic ticks retain baseline digest; original synthetic CSV bytes/columns unchanged at a fixed fixture snapshot. |
| B2 | Compare stable project configuration/active run identity before and after isolated test | Same project configuration and run identity; normal synthetic sequence may advance naturally. No archive/reseed, credential change or process restart caused by Stage 3. |

## 9. Approval requested and limits

Approve the versioned contracts, mode-aware migration scope, isolated project,
private test-reader policy, fenced single-writer design and reader/CSV work as one
Stage 3 implementation scope. The actual SQL and target project must be reviewed
before hosted application or starting a test writer. Physical two-device acceptance
remains pending until the devices are online; that limitation must remain visible.

This planning pass changed only this documentation artifact. No SQL migration,
implementation, credential, hosted database, firmware, deployed generator or
dashboard file was changed. No authoritative writer was started, and nothing
was pushed or merged.
