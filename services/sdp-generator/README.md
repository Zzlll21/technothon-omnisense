# OmniSense SDP Backend — Hybrid Mode B and synthetic evaluation

This service contains the current **Hybrid Supervisor / Writer**, hardware MQTT
normalization, occupancy fusion, snapshot persistence and a separate synthetic
generator. Use **Node.js 24**. Start with the
[submission architecture](../../docs/SDP-SUBMISSION.md) and
[safe runtime setup](../../docs/PUBLIC-RUNTIME.md).

Hybrid Mode B receives independently identified ESP32 telemetry through HiveMQ,
retains evidence validity/freshness and commits to an approved isolated Supabase
target. It does not use the legacy Technothon subscriber or Control API.
Keep one authorized Writer, the target manifest and `full_zone_coverage=false`.
The backend credentials and MQTT connection never belong in browser code.

The shared validator supports `sdp.v1-draft.1` synthetic records and the
`sdp.v1-hybrid.1` LIVE extension. Hardware observations are not simulated input;
forecast schedules and applied-output acknowledgements in this demonstration
remain synthetic. No physical BMS/AC integration or trained forecast service is
claimed. Stable PMV persistence/display is not implemented.

## Offline evaluation

After installing the locked dependencies listed in the root README:

```powershell
node scripts/validate-release.mjs
node services/sdp-generator/hybrid-mqtt.mjs --replay services/sdp-generator/test/fixtures/firmware-replay.json
```

These commands do not start MQTT or contact Supabase. The replay fixture is
constructed test data, not a recorded hardware packet capture. For separately
authorized live operation, follow the runtime runbook's target, lease, manifest
and shutdown checks; do not start a Writer simply to evaluate the repository.

## Synthetic foundation reference

The following sections describe the retained synthetic generator and its timing,
not the full Hybrid hardware pipeline. Synthetic `sim-1`/`sim-2` records must
not be confused with physical `demo-1`/`demo-2` evidence.

## Offline quick start (Windows PowerShell)

Prerequisites: Node.js 24+, Git, and the existing dashboard development tools.
From the repository root:

```powershell
npm.cmd --prefix apps/dashboard ci --no-audit --no-fund
npm.cmd --prefix services/sdp-generator ci --no-audit --no-fund
npm.cmd --prefix services/sdp-generator run build
Set-Location services/sdp-generator
npm.cmd start
npm.cmd start -- --frames 10
npm.cmd run typecheck
npm.cmd test
```

Default startup is a finite, offline seven-day dry run. It does not construct a
writer, contact a database, or save files. No environment file is required.
`--frames N` limits work for inspection. Build before the first start or after
changing model code. Development compilation intentionally reuses the repository's
installed TypeScript compiler, like `packages/sdp-contract`.

See [the dedicated-project runbook](../../docs/sdp-foundation-setup.md) before
enabling writes. `npm ci` installs locked dependencies; embedded PostgreSQL is a
development-test dependency only, not part of the generator's runtime.

## Model and timing

- One `zone-1`, two required non-overlapping demo footprints: `sim-1`, `sim-2`.
- Daily timetable in fixed UTC+08:00 (Malaysia): occupied 08:00-10:00,
  10:15-12:00, 13:00-15:00, 15:15-17:00. Other times are vacant; every day
  deliberately uses the same illustrative timetable, including weekends.
- Counts split a common scripted population; no independent node randomness.
  Class probabilities are illustrative one-hot labels, not model confidence.
- During the first five minutes of vacancy the requested mode remains OCCUPIED
  conservatively. Then SHORT_VACANCY; after 20 minutes LONG_VACANCY. For gaps
  at least 30 minutes, PRECOOL starts ten minutes before the next scheduled use.
  These constants describe the demo narrative, not Package C's algorithm.
- Forecast source BOOKING means a **synthetic timetable**, not a real booking
  feed. A new forecast supersedes the previous one as its use window starts.
  Windows are five minutes wide; expiry is the window's start. Short gaps resume
  full cooling at return; only long gaps plan a ten-minute precooling lead.
- OFF/null setpoint for long vacancy, LOW/27 C for short vacancy, AUTO/24.5 C
  occupied and HIGH/24.5 C precooling. All applied reports are explicitly
  SIMULATED, zero-lag and correlated to their decision/command. No real actuation.
- Temperature and humidity relax gradually toward shared, mode/population-based
  targets with a deterministic daily wave. Seed controls wave phase, not random
  contradictory fields. Environmental integration always uses 30-second steps.
- New runs persist 2,017 snapshots spanning seven days inclusive, five minutes
  apart, then one snapshot every 30 seconds after the fixed live anchor.
- Event records are **sampled state changes**, not fabricated intermediate
  timestamps. Every frame records two node-evidence events; decisions/forecasts
  and applied outputs are emitted when relevant state changes. Equal timestamps
  use frame `sequence` plus event `ordinal` for causal ordering.
- All envelopes keep `clock.time_base=REPLAY`, `replay_id=run_id`, and
  `data_sources=[SIMULATED]`, even during wall-paced continuous generation.
  `phase=CONTINUOUS` does not mean measured/live hardware data.
- `simulated_at`, `observed_at`, envelope `occurred_at`, forecast/decision times
  are UTC logical time. SQL alone sets `inserted_at` and run `updated_at` using
  database time. Historical insert time is not historical observation time.

## Checkpoints and recovery

Each RPC locks its run, requires the next sequence/timestamp, validates scoped
references, and inserts a frame, both samples, events and checkpoint in one
transaction. An identical retry returns `duplicate:true`; different contents at
the same sequence fail. Every event ID derives from immutable run ID/sequence/role.

The checkpoint includes full-precision environmental state and the current
decision/forecast/output. Do not round it or edit it manually. Restart with the
same run ID; SQL returns the original seed, anchor and checkpoint. A run's
configuration cannot be changed in place. Failed commits retain the exact pending
tick and retry every five seconds; no tick is skipped. Ctrl+C stops safely. After
an interrupted/ambiguous HTTP response, restart reloads the database checkpoint.

History is hidden by RLS while SEEDING. The anchor frame atomically publishes the
new run and archives any previously active one. Interrupted seeding resumes;
it does not replace the old active run prematurely. After downtime the generator
catches up at 30-second logical intervals before returning to wall-paced waits.
Run only one writer process per run. Conflicting writers cannot corrupt the
checkpoint, but an obsolete process should be stopped instead of repeatedly retried.

The synthetic generator has no automatic deletion, reset, retention job or real
control endpoint. The current Dashboard reads stored data through its own adapters.
The server-only writer uses the official
`@supabase/supabase-js` client with session persistence, token refresh and URL
session detection disabled. It uses only the four SDP RPCs; SQL retains the
transaction/checkpoint authority. Secret API Keys use `apikey`, not a JWT Bearer
header. Requests have a 30-second deadline, no automatic SDK retries and no
redirect following. The CLI owns retry/checkpoint behavior.

Use `SDP_SUPABASE_SECRET_KEY` for a current `sb_secret_...` key. A legacy
`SDP_SUPABASE_SERVICE_ROLE_KEY` JWT remains supported as a fallback; configure
only one. Publishable/anon keys are rejected before network access in write mode.
No key's prefix/decoded claims prove authorization: Supabase validates the key
and SQL EXECUTE permissions decide access. Default dry-run still makes no network
requests, even when a key is present in this service's local environment.
