# Dashboard App

React dashboard workspace for reading OmniSense telemetry from Supabase.

The dashboard shows latest readings, a simple room heatmap, recent historical trends, and crisis mode controls.

## Environment

Use frontend-safe Supabase credentials only:

```text
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_API_BASE_URL=http://localhost:3001
```

If your Supabase project provides a publishable key instead of an anon key, use:

```text
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
```

Never put `SUPABASE_SERVICE_ROLE_KEY` or an `sb_secret` key in dashboard files.

Create the dashboard env file inside `apps/dashboard`:

```powershell
Copy-Item .env.example .env
```

After editing `.env`, restart `npm run dev` or `npm run preview`. Vite only reads env files when the server starts.

## Data Helpers

- `src/lib/supabase.ts` creates the browser Supabase client from `VITE_` env vars.
- `src/api/readings.ts` exports:
  - `fetchLatestReadingsByNode()` for the newest reading per node.
  - `fetchRecentHistoryForNode(nodeId, options)` for recent rows for one node.
  - `createReadingsLoadingState()` for a simple loading state before async calls finish.
- `src/api/crisis.ts` exports `sendCrisisCommand()` for calling the backend control API with `VITE_API_BASE_URL`.

The Crisis Mode section calls the backend control API. The dashboard must never contain MQTT credentials.

`fetchRecentHistoryForNode()` fetches the newest rows first, then returns ascending order by default for chart-friendly history.
The history section uses a lightweight inline SVG chart to plot temperature, humidity, PMV, headcount, and optional air quality for the selected node.

Both helpers return a simple state object:

```ts
{
  status: "success" | "error",
  data: [],
  error: string | null,
  isEmpty: boolean
}
```

## Local Setup

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

For a production-style preview:

```powershell
npm run build
npm run preview
```

For a quick static check:

```powershell
npm run typecheck
```

Open the local Vite URL printed by `npm run dev` or `npm run preview`.

## Supabase RLS

If reads fail with a row-level security error, add a SELECT policy for the frontend anon or publishable role instead of using the service role key in the browser.

Example demo-only policy:

```sql
create policy "Allow public read access for demo"
on public.sensor_readings
for select
to anon
using (true);
```

Use a stricter policy before production.

## SDP Zone Overview (Mock Prototype)

The **SDP Zone Overview** tab is separate from the working Technothon views.
It reads only the shared `sdp.v1-draft.1` fixtures and prominently labels them
**Simulated test data**. Live telemetry KPIs/insights are hidden on this tab to
avoid mixing sources; they remain unchanged on the existing tabs.

From `apps/dashboard`, run `npm.cmd run dev` and open the printed URL. No new
environment variables are needed for SDP fixtures. In development, the Test
scenario selector exposes all 22 shared scenarios, including occupied, confirmed
vacancy, short/long vacancy, pre-cooling, missing/stale nodes, uncertain occupancy,
expired/cancelled/unavailable forecasts and control response outcomes. Production
builds show the labelled occupied fixture without the development selector.

`SdpZoneOverview` selects fixtures through `getSdpMockScenario()`.
`SdpZoneView` accepts any `SdpDataSource`, an explicit `EventQuery`, and a display
name. It loads `getZoneSnapshot(query)` asynchronously, with loading, empty,
failure/retry and obsolete-response handling. Replacing the mock wrapper with a
backend source does not require changing the shared domain types or panels.

The interface displays C's occupancy, coverage, connectivity assessment and
requested mode directly. Node values use the evidence event referenced by that
decision. B's output is labelled applied only for an `APPLIED` report linked to the
current decision; acceptance is not physical confirmation. D's predictions remain
separate from measurements. Forecast expiry uses the explicit replay `as_of`
clock, not today's browser time. Times are shown in UTC. No PMV comfort claims,
occupancy fusion, cooling decisions or override commands are calculated/sent here.

### Manual Verification

1. Open SDP Zone Overview. Confirm the simulated label, zone ID and two required
   nodes. The occupied fixture has an applied **simulated** fan output.
2. Switch to short vacancy, long vacancy and pre-cooling. Confirm the requested
   mode/reason changes without claiming an applied output when no report exists.
3. Select missing node, stale node and uncertain occupancy. Confirm C's reported
   state and warnings; no headcounts are fused by the UI.
4. Select expired, cancelled and unavailable forecasts. Expired estimates must
   not appear active. No forecast is shown as a measured value.
5. Select command accepted, rejected and failed. Only applied reports show an
   application time/output. Rapid scenario switching must not leave old records.
6. At laptop and mobile widths, confirm panels wrap without horizontal overflow.
7. Return to Overview, Room Map, Trends and Crisis Control. Confirm the original
   readings, map details, chart hover and pending/cooldown behavior still work.

Remaining integration work: agree the draft with A/B/C/D, implement a persisted
SDP event source and transport, provide real zone display names/configuration,
then integrate live/replay selection and timed overrides in later phases. The
current legacy Supabase/MQTT/control API paths have not been adapted.

## SDP Operating Records

The **Operating Records** tab displays one selected simulated scenario's event
history. Its scenario selector is available in development and production demo
builds; it is independent of the Zone Overview selector. All 22 scenarios remain
separate alternative histories. The initial selection is Return to Automatic,
which includes decisions, requests, acknowledgements, application and cancellation.

Filters include **Zone** (All zones or a configured zone ID) and **Event type**
(all seven contract event types). The **Request ID (exact)** filter also follows a request through its C decisions and
correlated B output reports. The CSV keeps that request ID even when only output
rows are exported. Return-to-Automatic requests retain their own IDs and explicit
target reference rather than being merged by correlation trace alone. Existing
fixtures have only `zone-demo`; the
source-independent `OperatingRecordsView` also accepts multiple `EventQuery`
objects for different zones in the same session, time base and as-of cutoff.
It calls `SdpDataSource.getEvents()` and never reconstructs events from a snapshot.
Loading, empty history, no matching filters, source error/retry and export failure
states are handled. Export is disabled while loading, on error or with no matches.

Records are ordered oldest first by actual `occurred_at`, with event ID as a
deterministic tie-breaker. The original UTC strings, including milliseconds,
remain unchanged in the UI, original-event details and CSV. List spacing does
not encode elapsed time. Each record has provenance and an expandable JSON view.

Forecasts retain their original wire status. For example, an ACTIVE forecast whose
deadline is reached at the replay cutoff has an **expiry annotation** on its
original row, not an invented expiry event. Cancellation is shown only when a
CANCELLED event exists. ACTIVE updates are recognised by `supersedes_event_id`;
the current fixtures contain cancellation references but no ACTIVE replacement
forecast example. Occupancy and cooling decisions are displayed as supplied by C.

### CSV Export

**Export CSV** downloads exactly the records matching the current filters, in
chronological order. Columns are:

```text
schema_version, event_id, correlation_id, session_id, room_id, zone_id,
occurred_at, event_type, producer_component, producer_id, time_base, replay_id,
as_of, data_sources, reason_code, reason, status, node_id, occupancy, coverage,
action, requested_mode, requested_fan, requested_setpoint_c, reported_fan,
reported_setpoint_c, feedback_basis, command_id, decision_event_id,
forecast_event_id, override_request_id, forecast_source, forecast_quality,
forecast_expires_at, forecast_expiry_reached_as_of, event_json
```

`status` is the actual payload status when present, not a fabricated state for
event types without that field. `event_json` preserves the complete original
event, including observations, references and timestamps not repeated as columns.
`forecast_expiry_reached_as_of` is explicitly derived from the query cutoff and
never changes the original status or inserts a historical row. CSV has CRLF rows,
proper quote/comma/newline escaping and a UTF-8 BOM for spreadsheet viewing.
Formula-like text cells receive a leading apostrophe for spreadsheet safety;
the original text remains available in `event_json`.

### Verification and Next Integration

From the repository root:

```powershell
npm.cmd --prefix apps/dashboard run test:records
npm.cmd --prefix packages/sdp-contract test
npm.cmd --prefix apps/dashboard run typecheck
npm.cmd --prefix apps/dashboard run build
```

1. Start the dashboard and open Operating Records. Confirm Simulated Test Data,
   replay ID/cutoff, UTC timestamps and chronological records.
2. Filter zone-demo and Output report; export and confirm only output records are
   included. Accepted reports must not contain a claimed applied output.
3. Expand Event details and compare the original event JSON with the fixture.
4. Select expired-forecast: confirm the ACTIVE row has an expiry annotation with
   no additional synthetic row. Select cancelled-forecast to see the real
   cancellation event. Select override-expired and return-to-automatic for their
   recorded lifecycle transitions.
5. Select normal-occupied then filter Override status. Confirm a clean empty state
   and disabled export. Switch scenarios quickly and confirm old results do not
   overwrite the selected scenario.
6. Check laptop/mobile layout and return to Zone Overview and Technothon tabs.

Future integration still needs persisted SDP events, a backend loader with
pagination and complete referenced history, access rules, and agreed session/
zone/clock/provenance handling. Supply that source and scoped queries to
`OperatingRecordsView`; no new domain interfaces are needed. There is no live
history ingestion, comparison calculation, command sending or cloud schema work
in this phase. Mock records must stay isolated from real device operation.

## SDP Timed Manual Override (Simulation Only)

The **SDP Manual Override** tab is separate from legacy Crisis Control. It uses
the shared `OverrideRequest` / `OverrideStatus` contracts and the existing
`SdpDataSource` mock adapter. All 22 fixture scenarios are available so missing
and stale evidence can be inspected alongside the override examples.

The form selects a cooling zone, requests OCCUPIED operation with an optional
temperature, and sets a whole-minute duration. Current simulated config permits
1-30 minutes and 23-29 degrees Celsius; these are review placeholders, not adopted
equipment limits. The UI reads limits from `ZoneConfig`, and missing config
disables request creation. The contract still carries `requested_mode: OCCUPIED`
when a setpoint is supplied. Its null setpoint means no explicit temperature request.

**Simulate override request** creates exactly two local events: a validated
E-owned `OVERRIDE_REQUEST` and an E-owned `PENDING` status with the same request ID
and correlation. The buttons lock after creation until **New simulation** is
selected, preventing duplicate submissions. No C acknowledgement, B application
or terminal outcome is generated for a local request. These events are held only
in page memory; reload clears them.

**Simulate Return to Automatic** targets the selected recorded ACCEPTED/APPLIED
SET_OVERRIDE request. It creates a new request ID with `target_request_id` naming
that original request, preserves the correlation trace, and records only local
PENDING. It does not cancel the original request, apply an output or assert that
automatic means OFF. Requests without a qualifying recorded acknowledgement or
with a terminal outcome are not offered as Return targets in this demo.

The lifecycle selector displays the exact fixture statuses: PENDING, ACCEPTED,
REJECTED, APPLIED, FAILED, EXPIRED and CANCELLED. Submission, controller response
and device-reported application are separate. APPLIED is confirmed for display
only with C's referenced decision and B's matching APPLIED event/command ID in
the same scope. Feedback remains explicitly SIMULATED for the fixtures. Selecting
the original `request-occupied` in `return-to-automatic` shows CANCELLED; selecting
`request-return` shows the separate automatic-return request's APPLIED result.

The explicit **Review time** selector uses the fixture cutoff, 30 seconds later
or 40 minutes later in the same replay clock. It never runs a browser control
timer. Local requests use that declared replay timestamp; their mock acceptance
deadline is 10 seconds later. Passing that deadline without C acknowledgement
shows a timeout warning, not a fabricated FAILED status. Passing requested expiry
without C's end report shows an unconfirmed-end warning and leaves the recorded
status unchanged. The warning uses C's reported effective end when present,
otherwise the requested expiry. Both dates remain visible separately.
Package C must enforce real expiry/automatic return. Node
warnings show C's recorded assessment with its evaluation time. Missing source,
config, original request and referenced output states have explicit messages;
source errors support Retry.

**Operating records** opens the same fixture branch and exact request ID, or the
separate **Local simulated override requests** history. Local history contains
only E requests/PENDING and does not attach fixture confirmations to new IDs.
Existing CSV export includes these real local simulation records and references.
The local-history cutoff is its latest event time; the manual review clock does
not manufacture additional operating records.

From the repository root:

```powershell
npm.cmd --prefix apps/dashboard run test:overrides
npm.cmd --prefix apps/dashboard run test:records
npm.cmd --prefix packages/sdp-contract test
npm.cmd --prefix apps/dashboard run typecheck
npm.cmd --prefix apps/dashboard run build
```

Manual checks:

1. Open SDP Manual Override. Default `override-applied` should show separate E/C/B
   stages. Review pending, accepted, rejected, failed, expired and automatic-return
   fixtures; their IDs and original timestamps must remain unchanged.
2. Enter a duration and optional permitted temperature. Submit once, then click
   repeatedly: exactly one request/PENDING pair should appear. New local IDs must
   have no controller acknowledgement or device report.
3. Open Operating records and export the filtered local request. Confirm the
   exact request ID, SIMULATED provenance, REPLAY clock and null output references.
4. Reload/select `override-applied` and simulate Return to Automatic. Inspect the
   original target ID; the new request must stay PENDING with no invented cancellation.
5. Select `override-pending`, then review 30 seconds later for a missed-acknowledgement
   warning. Review 40 minutes later for an unconfirmed expiry warning. PENDING
   remains PENDING. `override-expired` has an actual C EXPIRED record.
6. Select missing-node/stale-node, check laptop/mobile layout, and verify all
   original dashboard tabs and legacy Crisis Control remain functional.

Before live operation, agree authority and concurrency/replacement rules, request
acceptance timeout, limits/duration/setpoint semantics and command idempotency.
Implement an authenticated backend request gateway and durable event records;
C must validate requests, own timers and Return to Automatic, and publish correlated
statuses/decisions. B must echo command/decision IDs and report acceptance/application
or failure with an honest feedback basis. Add scoped live event reads, reconnection,
clock-skew and missing-acknowledgement handling. No such gateway, transport, C/B
algorithm, schema change or real command path is implemented by this panel.
