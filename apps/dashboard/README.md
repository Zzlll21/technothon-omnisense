# OmniSense SDP Dashboard

Phase 4A: product shell, current-zone Overview and Room & Nodes monitoring. This frontend reads only the
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

Overview and Room & Nodes are implemented. Predictive Cooling, AC Utilization and
Operating Records have navigable, explicit next-phase states. Their detailed
workflows remain future work. Legacy UI modules
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

## Checks and rehearsal

```powershell
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:overview
npm.cmd run test:nodes
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

Unit fixtures come from the existing deterministic generator only in test code;
they are never imported into the production dashboard. Browser QA may intercept
read requests for controlled error/empty/stale cases; production never falls back
to those fixtures. No schema, generator or backend service change is required.
