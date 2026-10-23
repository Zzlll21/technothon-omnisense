# Phase 2 — Interactive 3D Zone Workspace

Implementation is isolated on `codex/omnisense-spatial-integration`, based on Phase 1 commit `1ec3f95`. Phase 3 is not implemented. No push, merge, generator start or database write was performed.

## Open and navigate

- Floor: `http://127.0.0.1:8130/?experience=spatial`
- Zone: `http://127.0.0.1:8130/?experience=spatial&view=room`
- Existing dashboard: `http://127.0.0.1:8130/`

Selecting the supported Open Office slot, its room-index button or “Explore 3D workspace” enters the zone. Other floor spaces remain explicitly illustrative and have no readings. Floor navigation and browser Back/Forward work without remounting the shared overview hook. The first zone entry loads the 3D code lazily; returning to the floor hides the mounted scene and suspends its rendering.

The mineral-white / petrol / sage direction, authored office furniture, open ceiling structure, shadows, ceiling devices, two coverage overlays and compact camera controls are retained. The current-request column uses the real stored reason and simulated report, with stored forecast fields rather than the prototype's invented values. The coloured mode bar is retained from the approved design as a redundant mode cue alongside its text label.

## Component and data boundaries

```text
unchanged useOverview / fetchOverview
  → one validated committed OverviewData snapshot
  → spatialOverview (typed presentation mapping)
  → ZoneWorkspace (selection + inspector state)
      → OfficeCanvas (React controls, markers, readings, keyboard and pointer input)
          → officeRenderer (Three.js geometry, camera, hit testing, projection)
      → NodeInspector
          → unchanged useNodeHistory / fetchNodeHistory
          → unchanged NodeHistoryCharts and gap/classification helpers
```

React owns every accessible control, current measurement, selected node, modal and history range. The renderer receives only node IDs and configured coordinates. It does not know sensor measurements, forecasts, cooling modes, Supabase or query boundaries. Its `.d.ts` boundary checks the React/controller contract; the visualization port remains JavaScript to reuse the approved local Three.js modules without introducing package or lockfile changes.

`spatialOverview` now exposes each metric's validity and exact classification code in addition to the Phase 1 fields. Current evidence is joined by the sample's exact evidence ID and node identity. Temperature, humidity, classification, freshness and observation timestamps remain independent. Unavailable/invalid values are rendered as em dashes, never replaced by the other node. Zone occupancy remains the authoritative frame occupancy. Environmental headlines use the configured representative node, not an average. A delayed or failed feed labels occupancy as a stored snapshot rather than claiming it is happening “now.”

The inspector includes the actual node label and ID, human-readable and raw occupancy classification, metric validity, observation time, freshness, recorded decision state and supporting snapshot/evidence references. Recorded decision state is explicitly distinguished from current freshness. A cached snapshot warning also appears inside the modal if overview refresh fails.

## Coordinates and coverage

Validated normalized x/y configuration maps to the office's usable presentation extents: x from −3 to +3, z from −1.85 to +2.35, device height 2.64 in scene units. Both x and y affect device, hit-target, projected label and coverage position. The device is attached to the exposed ceiling structure with a small brace. Furniture is contextual and does not determine sensor location.

Device, vertical guide, coverage plane and dashed boundary share a world-space group. Labels are projected from the same device world position each rendered frame; they are not independently positioned illustrations. Coverage is clipped to the room boundary and follows the configured position. Scene units and footprints are not surveyed metres or calibrated sensing geometry. “Approximately 10 m²” describes the supplied node capability, not a measured floor polygon.

## Scene and camera lifecycle

- The renderer mounts once per zone visit/lifecycle and is retained across ordinary 30-second snapshots. It is not keyed by sequence or refresh time.
- Geometry updates are guarded by an ID/coordinate signature. Temperature, humidity, classification or observation-time changes do not rebuild geometry. Selection changes only update highlight materials.
- Scope is keyed by run/zone. A new published run or removal of the validated snapshot may intentionally replace the workspace; preserving stale selection across unrelated datasets would be misleading.
- Camera orientation, zoom and selected node survive data refreshes. Floor/zone navigation also retains the mounted scene and selection within the current run.
- Render only on demand, damping, input or resize. Intersection and document-visibility observers suspend hidden rendering. Unmount disposes controls, observers, listeners, geometries, materials and the WebGL context.
- Startup keeps the canvas layout-visible behind the preparing overlay; controls and markers become accessible only after the first rendered projection. This fixes an intermittent blank first draw caused by initially hiding the canvas. Three fresh desktop starts and the phone start were visually verified after the fix.
- Drag to orbit; wheel to zoom. Ctrl/Meta wheel is left to the browser. Rotation and zoom buttons support continuous pointer holds, short taps, cancellation, lost capture, pointer release outside the button, blur and visibility changes. The prototype's 180 ms ease, 30°/second held orbit, zoom bounds and reset pose are retained.
- Canvas arrow keys orbit/adjust elevation, +/− zoom and Home resets. Coarse-pointer devices preserve vertical page scrolling and browser pinch zoom; camera buttons provide touch rotation/zoom with 44 px targets. Reduced motion disables damping, tweened tap/wheel motion and inspector entrance animation.
- WebGL initialization/context failure leaves the React readings and inspector available with a retry action. This path does not substitute fixture data.

## Historical inspection

Selecting a marker, sensing-area reading or inspector node switch updates the same selected ID. Marker fill, coverage emphasis and inspector identity stay synchronized. Closing the inspector retains selection and restores focus to its trigger. The native dialog provides modal focus containment; Escape closes it except when clearing an active chart inspection.

Ranges are 1 hour, 24 hours and 7 days. The existing hook's run/zone/node/range identity, committed sequence ceiling, cancellation, incremental cache, pagination and error handling remain unchanged. Switching node/range never exposes the previous node's chart for a render. Missing samples stay gaps; classification spans and numeric traces reuse the existing helpers. Query or evidence-validation failure displays a visible history error and retry rather than a fabricated or partially successful series.

## Validation

`npm run build` passes (including TypeScript). All **102 dashboard regression tests pass**, including 12 spatial tests. Existing overview, node-history, predictive, utilization, operating-record, override and CSV tests remain unchanged. New tests cover world-coordinate mapping, bounded schematic coverage, camera interpolation, per-metric validity and rendered inspector identity/unavailable/stale states. Test-only bad-data cases never enter runtime fixtures or modify stored SDP data.

A live read-only verification renders the **existing Overview and new ZoneWorkspace from the identical validated stored object**, and compares zone, representative environment, mode and simulated output. At sequence **6542**, `2026-10-22T08:34:00Z`, representative `sim-1` was 24.589 °C / 60.447% RH; `sim-2` was 24.889 °C / 61.047% RH. Classifications were `OCCUPIED_3P_PLUS` and `OCCUPIED_2P`. Exact output decision/command references matched. These are QA observations, not runtime constants.

Both nodes were queried at that same sequence for every range: 121 records for 1 hour, 2,881 for 24 hours and 6,090 for 7 days. These QA windows include both exact endpoint timestamps. The existing UI hook uses rolling browser-time windows, so its edge counts differ with polling delay and timestamp alignment; the sequence ceiling is still respected.

| Requested check | Result |
| --- | --- |
| Floor → zone and back | Passed room selection, floor return, keyboard entry and browser Back/Forward; illustrative Conference Room stayed without data. |
| Both nodes' stored data | Passed live same-object comparison with existing dashboard at sequence 6542; UI inspector showed actual labels/IDs and distinct measures/classes. |
| Rotation and zoom | Passed held rotation/zoom, wheel zoom, mouse orbit, keyboard arrows and Home/reset. |
| Marker/coverage alignment | Passed visual inspection after mouse orbit; devices, footprints and guides share world-space positions and labels use that same projection. |
| Selection/inspector synchronization | Passed marker, inspector node switch and direct 3D device hit testing; selected materials and raw node identity match. |
| All history ranges | Passed all six live node/range reads and browser renders of 1-hour, 24-hour and 7-day charts (including 6,111 records in the later live 7-day UI window). |
| Missing/stale/invalid evidence | Passed adapter and rendered-inspector tests; these cases are test-only and were not injected into Supabase. |
| Refresh preservation | Passed manual refresh and an automatic-poll check: stored frame advanced from 08:47Z to 08:48Z with identical projected marker transforms and Node 02 selected. Floor round-trip and browser Forward also preserved that pose. |
| Keyboard/touch/mobile | Passed keyboard zone entry, chart inspection/Escape, camera controls, native dialog focus restoration and responsive/coarse-pointer browser emulation. Physical-phone testing remains unverified. |
| TypeScript/build/regressions | Passed TypeScript, production build and 102 tests; one lazy-renderer chunk-size advisory remains. |

Evidence:

- [Live comparison and all six node/range reads](phase2-evidence/live-parity.json)
- [Protected-source, original-checkout and credential-boundary verification](phase2-evidence/boundaries.json)
- [Automatic refresh and browser interaction results](phase2-evidence/interactions.json)
- [Desktop and phone workspace captures](phase2-evidence/workspace/report.json)
- [Desktop and phone inspector captures](phase2-evidence/inspector/report.json)
- [Repeated fresh startup 2](phase2-evidence/startup-2/report.json), [startup 3](phase2-evidence/startup-3/report.json)

Desktop 1440×900 and phone 390×844 checks report no console errors, page overflow or failed images. Inspector captures wait for actual history charts. Visual readability findings were corrected; the remaining coloured-mode-bar hint is intentional, preserving the approved design. Responsive/coarse-pointer behaviour is browser-emulated; no physical phone was available for this pass. This phase validates integration and preserves the approved design rather than performing the later visual polish.

## Files changed

| Files | Responsibility |
| --- | --- |
| `apps/dashboard/src/pages/SpatialDashboard.tsx` | Shared snapshot ownership, floor/zone URL navigation, lazy workspace and scope boundary. |
| `apps/dashboard/src/lib/spatialOverview.ts` | Expose independent validity and raw node classification. |
| `apps/dashboard/src/components/spatial/ZoneWorkspace.tsx` | Zone composition, stored decision/forecast and persistent node selection. |
| `apps/dashboard/src/components/spatial/OfficeCanvas.tsx` | React readings, projected markers, camera controls, pointer/keyboard and renderer lifecycle. |
| `apps/dashboard/src/components/spatial/NodeInspector.tsx` | Accessible contextual current-data and history inspector. |
| `apps/dashboard/src/components/spatial/officeRenderer.js`, `officeRenderer.d.ts`, `officeLayout.ts` | Authored office geometry, imperative visualization contract, coordinate mapping and camera motion. |
| `apps/dashboard/src/components/spatial/vendor/*` | Local approved Three.js/OrbitControls copies, license and provenance. |
| `apps/dashboard/src/spatial-zone.css` | Scoped approved workspace/inspector styling and responsive/reduced-motion states. |
| `apps/dashboard/test/spatial-zone.test.mjs`, `spatial-render.test.mjs`, `package.json` | Additional spatial tests and test command. |
| `docs/integration/verify-phase2-live.mjs`, this document and `phase2-evidence/*` | Reproducible read-only comparison and QA evidence. |

No changes to queries, hooks, existing dashboard components, shared history/calculation helpers, contracts, schema, generator, credentials, lockfile or default dashboard entry. The original `experiment/gemini-ui-redesign` checkout and its reviewed uncommitted files remain unchanged.

## Reproduce

Use the Phase 0–1 instructions to start Vite with the existing environment file loaded into process memory. No credential file is copied into the worktree. Then:

```powershell
# From apps/dashboard
npm run build
npm run test:spatial
node --test test/*.test.mjs

# From the isolated worktree root; existing configuration is read, never edited
node docs/integration/verify-phase2-live.mjs "C:/Users/zheng/OneDrive/文档/Technothon/apps/dashboard/.env" docs/integration/phase2-evidence/live-parity.json
```

Normal Vite builds require the same public SDP configuration as before; the isolated worktree intentionally contains no local credential file. The running preview reuses the original configuration in memory.

## Remaining boundaries

The lazy renderer is 514.40 kB minified / 129.96 kB gzip, producing Vite's default 500 kB chunk advisory. It is not loaded for the existing dashboard or initial floor. The warning is reported, not suppressed. Coverage/furniture remain illustrative; there is no physical HVAC actuation or measured energy claim. Physical-device gesture verification remains outstanding. Existing 25,000-row history limits are preserved with visible errors if exceeded.

Usage/cooling timelines, statistics and operating-record presentation in the new workspace, CSV migration and final visual polish remain for later phases. Existing dashboard navigation and CSV functionality remain available. Stop here before Phase 3.
