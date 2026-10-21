# OmniSense SDP Dashboard

Phase 5B: Overview, Room & Nodes, Predictive Cooling, AC Utilization and Operating Records. This frontend reads only the
dedicated SDP database. There is no MQTT connection, Control API dependency,
command sending, scenario selector or legacy `sensor_readings` query.

## Local setup (Windows PowerShell)

From the repository root:

```powershell
git branch --show-current # sdp-dashboard-rebuild
npm.cmd --prefix apps/dashboard ci
Set-Location apps/dashboard
# Only if .env does not already exist:
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm.cmd run dev
```

Create/edit `.env` **inside apps/dashboard** privately with only:

```text
VITE_SUPABASE_URL=https://YOUR_SDP_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_FRONTEND_PUBLISHABLE_KEY
```

Use the `omnisense-sdp` project's actual URL and publishable key. Restart Vite
after editing `.env`. No legacy anon key or API base URL is used. Never put any
backend credential in frontend environment variables. The real `.env` is ignored
and is not changed by this implementation.

Vite disables automatic environment-variable exposure and serializes only
validated public configuration. A wrong key type or missing configuration yields
a visible setup state, with the rejected values omitted from browser code.

## Current-state reads

1. Fetch the ACTIVE `sdp_runs` row using explicit public metadata columns, not its
   checkpoint/definition. No fallback to another project/table/mock dataset.
2. Fetch the run's `sdp_zones` config and `sdp_nodes` mapping. Phase 3 supports one
   zone; multiple zones return an explicit unsupported-state message.
3. Pin the zone frame to `run.last_sequence`. This is the latest committed frame
   observed when the refresh began, even if the generator advances during reads.
4. Fetch `sdp_node_samples` for that exact run/zone/sequence.
5. Fetch only the frame's linked decision, forecast, output and evidence IDs in
   `sdp_events`, plus five latest non-sample events at or before the pinned frame.
6. Validate event envelopes using the existing shared contract. Reject mixed-run,
   future, mismatched command/output and inconsistent sample references. Retry
   once if a newly published run hides rows partway through a read.

No entire historical dataset is downloaded for the Overview. Room temperature
and humidity use the configured representative environmental node, explicitly
labelled in the KPI notes. No frontend occupancy fusion/cooling algorithm or PMV
comfort claim is implemented. Node classifications are not summed into an exact
headcount; the contract only provides categories.

The Overview includes stored zone occupancy, requested mode/reason, requested vs
reported output, future use window/restart, forecast quality/expiry, required
nodes and latest important events. The illustrative room diagram uses stored node
coordinates, not surveyed geometry. Output acknowledgement is simulated, not
verified physical HVAC actuation. Data Sources & Methodology explains provenance.

## Refresh and failure states

- Poll every 30 seconds; manual Refresh uses the same path. No overlapping reads.
- Abort on unmount; a 20-second request deadline prevents a hung refresh.
- Keep the last successful snapshot when refresh fails, with a visible warning.
- Zero ACTIVE runs means unpublished/seeding data, not an empty historical table.
- Flag the feed delayed after 90 seconds. Node stale/disconnected/skew thresholds
  come from stored ZoneConfig; missing samples remain missing, never zero values.
- Freshness uses logical sample time, not recent insertion time. The generator's
  replay clock is wall-paced; forecasts expire against current browser time.
- Time display uses browser local time, with original UTC timestamps in titles.
- RLS failures explain the missing read policy; security is never disabled.

The reviewed foundation migration already grants SELECT only for ACTIVE runs.
Use its read-only verification script if reads fail. Do not add browser write
policies or privileged frontend credentials.

## Product navigation

All five product destinations are implemented with read-only SDP data access.
Operating Records provides server-filtered browsing, exact linked details and CSV
export. Legacy UI modules
and APIs are removed on this branch; protected branches are not modified.
Pure record/export and override-contract utilities/tests remain reusable but are
not part of the running interface and cannot send commands.

## Room & Nodes

Select a node on the floorplan or in the sensor list to inspect its current
classification, environment, evidence validity and freshness. The boundary is
one shared cooling zone; markers represent sensor positions, not separate ACs.
Positions and labels come from `sdp_nodes`, with required-node configuration as
the fallback if metadata is absent. The room drawing remains illustrative.

Temperature, humidity and categorical occupancy history use stored node records.
The three time ranges are the last 1 hour, 24 hours and 7 days relative to browser
time, so an old run leaves a visible gap rather than appearing current. Timestamps
are `observed_at`, never insertion times or sample indexes. Display is local time;
UTC values remain available in timestamp titles. Node classes are shown verbatim
with readable labels; no zone occupancy is calculated from them.

History queries use the ACTIVE run selected by Overview, zone, node, timestamp
bounds and the committed sequence. They join each sample's evidence by its existing
foreign key. Pages contain at most 500 rows, ordered by observation time and sequence;
the maximum window is seven days with a 25,000-row safety limit. This accommodates
seven days of 30-second records without silent server-limit truncation. No entire
event log is read. The published schema/read policies already support the queries.

Every successful Overview refresh also refreshes history. Within the same node and
range, only sequences newer than the previous committed checkpoint are fetched;
old points leave the rolling window. Changing node or range aborts pending reads
and clears the old selection's graphs. History errors keep any cached records for
that selection and offer Retry. A 60-second deadline bounds a history fetch.

Charts break at missing sequence/time intervals (five-minute history seed,
30-second continuous records). Classification bands cover sampling intervals only;
gaps are not classified as vacancy. Hover inspects the nearest stored timestamp,
click/tap pins it, and arrow keys/Home/End inspect points while a chart is focused.
Escape or leaving keyboard focus clears the selection. The readout stays below the
plot so it cannot cover labels or overflow a card. Sparse samples remain visible.

## Predictive Cooling

The synchronized timeline shows stored zone occupancy, requested cooling modes,
the configured representative node's temperature, forecast windows as issued,
planned restart markers and decision events. All tracks share UTC millisecond
coordinates, displayed in browser local time. The target line is the configured
occupied temperature setting, not a measured room temperature or savings claim.

Choose the last 24 hours or 7 days. The chart has one crosshair and aligned tooltip;
hover inspects a time, click/tap pins it, keyboard arrows/Home/End select frames,
and Escape clears the selection. Decision-event rows also select their original
timestamp. The inspection panel separately displays the requested output and the
correlated simulated output report. It never equates an accepted request with
applied output or verified physical AC control.

Historical frames and reference-node samples are read in 500-row pages, bounded
by ACTIVE run, zone, committed sequence and timestamp range. Cooling events are
restricted to ZoneDecision, ZoneForecast and AppliedOutput. Exact linked IDs are
fetched in batches of 100 when an active decision/forecast predates the range;
supporting forecast references are preserved too. The safety bounds are 25,000
frames/samples and 75,000 operating events per window. Refreshes read only newer
sequences and prune the rolling window. No history is downloaded for this page
until it is opened, and no cloud records are changed.

Forecast status is evaluated as of the inspection time, not by applying today's
forecast to yesterday. Later issues/cancellations cannot rewrite an earlier
inspection. At the current snapshot, expired/cancelled/unavailable predictions
are explicitly inactive. Archived windows remain on the "as issued" track and
are not assertions that arrivals actually occurred. Only forecasts issued by the
inspection time appear there. If the latest known forecast is active, the axis
can extend into a shaded forecast horizon (up to 24 hours); no observed occupancy,
cooling or temperature is extrapolated into that horizon. Historical inspection
within it reports no recorded conditions and uses knowledge at the range cutoff.

State bands cover only sampling intervals supported by frames; missing frames
remain gaps. Missing reference-node temperatures do not hide occupancy or cooling
records. Reasons are based on stored codes and exact forecast links; no frontend
controller, forecasting algorithm or unexpected-arrival claim is introduced.
Empty/error/loading states and stale-feed warnings remain visible. Cached history
survives read failures, and Retry is available. Custom-day selection is deferred.

The current generator produces booking forecasts and simulated APPLIED reports.
It does not normally emit cancelled/unavailable forecasts or uncertain occupancy;
those display states are checked using isolated test responses. Browser testing
must not create or modify cloud data to manufacture these cases.

## AC Utilization

The utilization page presents requested operating time from stored simulation
records. Daily profiles, a known-time mode distribution, hourly/daily request
trends and an occupancy-by-mode matrix support the last 24 hours or 7 days.
Hover/focus/click a bar or matrix cell to inspect its values. The overlap matrix
scrolls inside its region on mobile. Metric definitions are available on the page;
Data Sources & Methodology remains accessible through the product shell.

### Calculation definitions

All calculations live in `src/lib/utilizationAnalytics.ts`, separate from React.
An interval is half-open `[start, end)` and clipped to the selected window:

| Metric | Definition |
| --- | --- |
| Normal cooling requested | Sum of known intervals in `OCCUPIED` requested mode, independent of occupancy. |
| Reduced / standby | `SHORT_VACANCY` plus `LONG_VACANCY` duration. The individual categories remain visible in charts. |
| Pre-cooling | `PRECOOL` duration only; never also counted as normal cooling during vacancy. |
| Normal during vacancy | `OCCUPIED` requested mode overlapping controller-reported `VACANT` occupancy. This is a review opportunity, not verified avoidable waste. |
| Mode transitions | Changes between known requested modes across continuous evidence, including decision events within a frame interval. First observations and jumps across gaps are excluded. Changes exactly at the range start are included when a valid predecessor exists; changes exactly at the end are excluded. |
| Known coverage | Elapsed intervals with continuous frame evidence and valid linked requested-mode/occupancy state. `UNCERTAIN` occupancy remains a known reported category. |
| Unknown coverage | Unbracketed head/tail time, missing sequences, stale gaps or absent decision references. It is never treated as zero utilization. |
| Matched APPLIED report | Known time supported by an `APPLIED`, `SIMULATED` output with the exact decision and command IDs. Accepted/rejected/failed or absent reports remain unconfirmed. This is report coverage, not physical runtime. |

Known plus unknown time equals the selected window. Requested mode categories
partition known time; percentages in Mode Distribution use known time only.
Daily bars and trends include unknown time explicitly. When nothing is known,
KPI durations display Unavailable. Small gaps never round up to 100% coverage.
Display durations are floored to whole minutes (`<1 min` for positive sub-minute
durations); chart readouts/titles provide seconds where appropriate.

### Interval and timestamp rules

1. Load frames within the range plus the one preceding the left boundary. This
   permits clipping an already-running mode without losing the first partial interval.
2. A pair must have consecutive sequences and increasing actual timestamps. Its
   gap must be no greater than `min(config.stale_after_ms, 1.5 * expected cadence)`.
   Expected cadence is five minutes before the run's live anchor and 30 seconds
   afterwards, matching this stored model version. These values detect gaps only;
   durations always use actual timestamp subtraction, never row counts.
3. Within each supported pair, begin with the left frame's authoritative occupancy
   and linked decision. Split at controller decision publication timestamps,
   using their stored occupancy/mode, and at correlated output-report timestamps.
   No classification, occupancy fusion or cooling policy is calculated here.
4. A frame alone does not establish duration after its timestamp. The latest live
   tail remains unknown until another committed frame brackets it. This conservative
   estimate can omit genuine operation during outages; it never extrapolates it.
5. Split counted time at local midnight. Daily grouping is explicitly
   `Asia/Kuala_Lumpur` (UTC+08:00, no daylight saving), independent of browser locale.
   Rolling windows may include two partial endpoint days (eight rows for seven days).
   Trends use UTC+08:00-aligned hours for 24h and local days for 7d.

History reads use only `sdp_zone_frames` and `ZONE_DECISION` / `APPLIED_OUTPUT`
records in `sdp_events`. They are ACTIVE-run/zone scoped, pinned to the Overview
committed sequence, bounded by timestamp, and paginated at 500 rows. Exact boundary
references are loaded in batches of 100. Limits are 25,000 in-range frames and
50,000 in-range events, plus one predecessor and linked records. No node samples
or forecast history are downloaded for utilization. The shared Overview still
refreshes its small current snapshot for the shell as before.

Refreshes read new sequences, retain a predecessor as the window moves, and prune
old history. The 60-second deadline, cancellation, cached-on-error state and Retry
follow the other monitoring pages. Stale-feed warnings remain in the shell.
The schema and generator are unchanged. Multi-zone aggregation, compressor runtime,
electricity consumption and comparisons/savings claims are outside this phase.

## Operating Records

Operating Records is loaded on demand. The table uses a fixed committed snapshot
of the ACTIVE run; background Overview updates do not reorder a page being read.
Apply filters or Refresh records to adopt the latest Overview snapshot. A newly
published run remounts the page. The shell continues to show stale/connection warnings.

### Queries, filters and pagination

- Read `sdp_events` with explicit columns, `run_id = snapshot.runId`,
  `zone_id = snapshot.zoneId`, `sequence <= snapshot.sequence`, and
  `occurred_at <= snapshot.at`. The date window is half-open: `>= start`, `< end`.
- Order by `occurred_at DESC, sequence DESC, ordinal DESC`. These storage fields
  preserve order when events share a timestamp. UI pages contain 25 records and
  use exact server counts plus offset/range pagination over the pinned dataset.
- Category filtering uses `event_type = ...` or an `IN` list. Operational events
  (the default) include decisions, forecasts, output reports and override records.
  Node evidence and configuration are available through their categories or All.
- Requested-mode filtering uses `event->payload->>requested_mode = ...` directly.
  Only decision and SET_OVERRIDE request records contain that field. It deliberately
  excludes reports/forecasts rather than inferring their modes through a join.
- Search is a server-side case-insensitive substring filter on `event->>payload`
  (Recorded text), `event_id`, or `event->>correlation_id`. Percent, underscore and
  backslash are escaped as literal characters. Input is passed through structured
  query methods, not interpolated into an OR/filter expression. Search never filters
  only the visible page. Human-readable generated labels are not searched.
- Select 24h, 7d, or up to seven inclusive Malaysia-local calendar dates. Custom
  dates begin at UTC+08:00 midnight, and today is clipped to current browser time.
  Invalid/reversed/future dates are rejected. Apply resets pagination to page one.
  Unapplied filter changes disable export, so a draft selection cannot download an
  older result set by accident.

The existing run/zone/time and event-type indexes bound the reads. JSON substring,
identifier substring and reverse decision-report searches do not have dedicated
text/JSON indexes; the database may scan the bounded matching scope. This is not
full-text/fuzzy search. Larger deployments should add a reviewed search/index API
in a later phase; this implementation does not alter schema or RLS.

### Exact correlation and event details

For a page, fetch only its frame sequences in batches of 100 from
`sdp_zone_frames`. A frame must match run, zone, sequence and original event time.
Missing frames produce a warning, not an invented context row. All event envelopes
are checked with the existing contract validator and must be simulated replay
records for the selected run/zone and committed cutoff.

For output events, fetch the exact referenced decision ID. Match both decision ID
and command ID, the room, and chronological/sequence order. For decisions, look up
APPLIED_OUTPUT events by exact `decision_event_id` (batches of 100, pages of 500),
bounded by the earliest decision time and snapshot. Verify command/room/order before
attaching. More than 5,000 linked reports per batch fails explicitly. The latest
matching report uses timestamp, sequence and ordinal order. A shared correlation ID
alone never proves a match.

Fetch forecasts by the decision's exact forecast ID, including a record before the
selected date range when necessary. Reject it as supporting evidence if it was
issued after the decision. Forecast details distinguish stored status, validity at
decision/event time, and validity at snapshot; expiry does not create a fake event.
Cancelled forecasts retain and check their prior forecast reference. Override status
decision references also require matching request IDs.

The drawer shows requested settings, separately timestamped reported outcomes,
reason, frame occupancy and applicable forecast information. Missing/unmatched
links remain visible as warnings. References/UUIDs stay in collapsed advanced
details. The current generator does not normally emit overrides or failed reports;
those remain view-only contract-supported records, never command controls.

### CSV scope and safety

Export CSV runs the exact applied filters and pinned cutoff through every matching
500-row page, independent of the current UI page. Related context can predate the
range or arrive after a requested decision, but must remain within the snapshot;
it adds columns, never extra export rows. Original UTC, Malaysia-local time with
explicit `+08:00`, event/run/zone IDs, sequence/ordinal, reason, requested mode and
settings, separately reported outcome/settings/time, forecast validity, correlation
warnings and applied filter/snapshot metadata are preserved. Each row identifies
the source as **Simulated SDP operating records**. The filename uses Malaysia dates.

The exporter builds UTF-8 CSV with a BOM and CRLF rows. It reuses the tested CSV
cell escaper for commas, quotes and newlines, and prefixes formula-like external
text (`=`, `+`, `-`, `@`, leading whitespace/control characters) with an apostrophe.
Progress reports completed/total rows; controls are locked during export and Cancel
is available. A download starts only after all matching rows are prepared.

Limits are 50,000 matching rows, 25 MiB UTF-8 and a three-minute deadline. Oversized,
changed-count, missing-page, read-error and cancelled exports produce no partial
download. Narrow the filters and retry. Export is in-browser, not a background
server job. No record writes or cloud migrations are performed.

## Checks and rehearsal

```powershell
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:overview
npm.cmd run test:nodes
npm.cmd run test:predictive
npm.cmd run test:utilization
npm.cmd run test:operating
npm.cmd run test:records
npm.cmd run test:overrides
```

Open the local URL Vite prints. Confirm both required nodes, current mode,
environmental reference values, forecast and correlated output match the database.
Wait for polling or select Refresh. Stop the generator and confirm delayed/stale
states while records remain visible; restart it and confirm recovery. Open all
navigation destinations and the methodology dialog. Check narrow mobile and
laptop widths, keyboard focus, missing config, no ACTIVE run and read errors.

For Room & Nodes, select both sensors and check that each node ID, values and
charts update. Try all three ranges, inspect points with hover/tap/keyboard, then
refresh. Check both 1280px laptop and 390px mobile widths. Stop the generator to
verify delayed/disconnected labels and trailing history gaps; existing records
must remain visible. Use controlled test responses for missing/empty/error states
without deleting or altering cloud data.

For Predictive Cooling, inspect an occupied-to-vacant transition, reduced cooling,
standby and pre-cooling before a stored forecast window. Check the exact decision
timestamp, forecast issue/expiry and requested/reported output. Switch 24 hours /
7 days, inspect via mouse/keyboard/touch and confirm gaps after the last stored
frame. On narrow screens the synchronized plot scrolls horizontally inside its
own region; labels and details stay readable outside the plot.

For AC Utilization, compare 24h and 7d, inspect daily/trend bars and the vacant ×
normal-cooling cell. Verify pre-cooling is separate, partial days are clipped, and
known plus unknown covers the window. Open metric definitions and compare times
against recorded decisions. Test missing/stale/sparse states with intercepted local
test responses, leaving the cloud dataset intact.

For Operating Records, combine category, requested mode, search and date filters;
move between pages and verify newest-first timestamp/sequence/ordinal ordering.
Open decision and output details and compare exact references in advanced details.
Export from a later UI page and verify the CSV contains every matching row, with
Malaysia times and distinct requested/reported fields. Check empty filters,
read failures/Retry, missing correlations, export cancellation and mobile drawers.

Unit fixtures come from the existing deterministic generator only in test code;
they are never imported into the production dashboard. Browser QA may intercept
read requests for controlled error/empty/stale cases; production never falls back
to those fixtures. No schema, generator or backend service change is required.
