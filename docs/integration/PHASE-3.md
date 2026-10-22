# Phase 3 — Usage & Cooling

Implemented only in `codex/omnisense-spatial-integration`, based on Phase 2 commit `4ccea6155163b861194322954660a1b6407c420a`.

Preview: `http://127.0.0.1:8130/?experience=spatial&view=history`.

## Experience

The zone view keeps the approved 3D office and adds the reference's compact occupancy/cooling horizon. “Explore usage & cooling” opens a dedicated investigation view, with the same mineral-paper palette, fine rules and typography. The legacy dashboard remains the default `/` experience.

The historical view aligns both evidence-validated temperature series, recorded occupancy, requested cooling, simulated output events, forecasts as issued and significant decisions on one elapsed-time axis. Normal, Reduced, Standby and Pre-cooling remain separate. No future temperature or cooling-mode trajectory is fabricated. Future usage windows and restart markers come directly from stored forecasts; no assumed restart lead is used.

Unknown intervals are hatched. Temperature paths split at invalid evidence, skipped sequences and cadence gaps. Occupancy and request lanes use the validated utilization intervals, including explicit gaps and the unbracketed live tail. Forecast windows are expectations as issued, potentially superseded; they do not imply recorded occupancy or applied cooling.

Hover is transient. Clicking a timestamp, selecting a decision marker, using arrow/Home/End keys or submitting an exact local timestamp pins an inspection. Decision markers use their exact event timestamps, avoiding pixel-rounding ambiguity. Output ticks select the nearest actual report within that status trace. Escape or Latest snapshot deliberately clears a selection. The timestamp and its inspected records are retained across polls, focus changes, range changes and floor/zone/history navigation. Off-range pins are retained with an explicit notice. Pins are session state, not persisted across a full document reload or ACTIVE run/zone replacement.

The inspector shows recorded occupancy, both temperatures and evidence validity, the raw stored decision reason, its correlated simulated output, and the forecast known by the inspected time. Supporting forecast references are resolved separately from the latest forecast known then. Later-issued forecasts, decisions and reports cannot be pulled backwards. Temperatures match the selected frame's exact sequence; an absent or invalid reading remains unavailable.

The duration row and occupancy × four-mode table reuse the existing timestamp calculator. Reduced/standby is a summary group with separate constituent durations. Normal during vacancy is labelled as a subset of Normal. Coverage explicitly separates known and unknown elapsed time. No electricity or physical-runtime interpretation is added.

On narrow screens the chart scrolls horizontally with fixed lane labels and both node legends visible. It initially reveals the recent record and follows an explicitly selected off-screen timestamp, without moving on ordinary polls. The four-mode table also scrolls. No automatic camera or decorative timeline animation was introduced; high-frequency inspection responds directly.

## Integration and files

| File | Responsibility |
| --- | --- |
| `apps/dashboard/src/pages/SpatialDashboard.tsx` | Adds `view=history`, navigation and one persistent analysis component. Keeps the existing 3D zone mounted while hidden. |
| `apps/dashboard/src/components/spatial/UsageCooling.tsx` | Composes unchanged predictive, utilization and two node-history hooks; owns range, transient/pinned inspection, compact horizon, inspector and statistics. |
| `apps/dashboard/src/components/spatial/CoolingTimeline.tsx` | SVG presentation, synchronized axis, event/forecast marks, keyboard/pointer input, responsive scroll and cached temperature-path geometry. |
| `apps/dashboard/src/lib/spatialCooling.ts` | Pure presentation adapter over existing historical-as-of, event correlation and utilization helpers. No data client or forecasting algorithm. |
| `apps/dashboard/src/spatial-cooling.css` | Scoped approved workspace styles, mobile chart/table handling and focus states. |
| `apps/dashboard/test/spatial-cooling.test.mjs` | Nine focused data/SSR regressions. Generator model records are used only by tests. |
| `apps/dashboard/package.json` | Adds those regressions to `test:spatial`; dependencies and lockfile unchanged. |
| `docs/integration/verify-phase3-live.mjs` | Read-only committed-snapshot parity audit using the existing ignored configuration in process memory. |
| `docs/integration/phase3-evidence/` | Key-free live audit, UI checks and screenshots. |

`useOverview` remains the sole owner of the ACTIVE snapshot. All reused reads retain run/zone/time/committed-sequence restrictions, bounded pagination, incremental refresh, cancellation, timeout and cached-error behavior. No adapter, hook, contract, existing calculation, Supabase setting or generator was edited. The scene and selected node are still keyed by run/zone rather than sequence.

Timeline and statistics use the utilization hook's precise start/end boundary. Existing hooks independently obtain their rolling read windows a few milliseconds apart; any unavailable boundary sample remains missing. The live parity audit uses one identical explicit interval for all reads to remove that difference during comparison.

## Validation

- TypeScript check and production build passed. The pre-existing lazy Three.js renderer still triggers the 500 kB chunk advisory; its code and dependency are unchanged.
- All **111 dashboard regression tests passed**, including existing CSV/filter/correlation tests and nine new spatial cooling tests.
- Read-only live comparison: ACTIVE run `fa15f01f-03ed-4a25-ab7d-575e56682222`, zone `zone-1`, committed sequence **6830**, snapshot `2026-10-22T10:58:00Z`. No writes.
- 24 hours: 2,881 frames and 2,881 evidence-linked records per node. Seven days: 6,349 frames and 6,349 records per node. Checked 387 historical frame inspections against existing frame/forecast/output helpers, plus forecast issue boundaries.
- Every rendered mode-lane duration exactly matched the existing calculator. Statistics rendering matched its duration and coverage labels. Both sensor series matched their own exact stored samples. Future-issued forecast exclusion passed.

| Frozen audit interval | Normal | Reduced | Standby | Pre-cooling | Normal while vacant (subset) | Known coverage |
| --- | --- | --- | --- | --- | --- | --- |
| 24 hours | 7h 50m | 50m | 15h | 20m | 20m | 100% |
| 7 days | 54h 50m | 5h 50m | 105h | 2h 20m | 2h 20m | 100% |

The frozen audit ends at a recorded frame. The live browser's rolling interval extends to its read time, so a small unknown live tail and a coverage label below 100% are expected and correct.

Desktop (1440 × 900) and phone (390 × 844) captures include latest and the stored 12:50 pre-cooling inspection. The final capture report has no console errors, page overflow, missing images or readability lint findings. A cold capture initially ran ahead of snapshot readiness; it was repeated with separate observable waits for snapshot and history. Review also fixed a clipped forecast label, mobile lane labels, crowded narrow-axis ticks and hidden-view width resets. Final evidence is in `phase3-evidence/final/`; retained 3D/horizon captures are in `phase3-evidence/zone-regression/`.

Browser checks confirmed floor → supported zone → history navigation and browser Back/Forward. The 12:50 pinned timestamp and complete inspected record text stayed identical while the overview refreshed from `11:14:19Z` to `11:16:19Z`, and through unrelated navigation/focus changes. The adjusted 3D marker projections were identical before and after history navigation and Back. Latest snapshot cleared the pin; ArrowLeft created a fresh explicit historical selection. Node 02 still opened its correct current evidence and independent node-history inspector.

The original checkout's branch, HEAD, index, uncommitted status and reviewed-file hashes (including ignored credential files) matched the Phase 0 manifest. Protected application/data/generator paths have no Phase 3 diff. No generator was started; no push or merge was performed.

## Limits and deferred scope

- Live records in the audited intervals were valid and continuous. Missing/invalid evidence, skipped frames, cancellation, expiry, absent reports and mismatched correlations are exercised by regression tests, not injected into Supabase.
- Phone viewport, scrolling, readable labels and target sizes were checked in browser emulation. Real-device touch and a screen-reader session were not performed.
- The stored forecast windows can be short relative to seven days. Their true elapsed width is retained; exact timestamps, source, quality, expiry and restart remain readable in the inspector.
- Closely spaced event markers can overlap at compressed time scales. The exact-time form and chart keyboard controls provide precise selection without expanding event spacing or misrepresenting elapsed time.
- Operating-record migration and new CSV UI are deferred. The existing dashboard's operating records and CSV remain available and tested. No Phase 4 work is included.
