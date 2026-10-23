# Phase 4 — Operating Records

Implemented in `codex/omnisense-spatial-integration` on top of Phase 3 checkpoint `d39f281`. Phase 5 has not started. Local preview: http://127.0.0.1:8130/?experience=spatial&view=records.

## Product experience

The Spatial Workspace now has an Operating Records view: a chronological ledger with Malaysia-local day/time, readable stored-event descriptions, exact correlation status, and a contextual side inspector (full-width on phones). Paper, green typography, fine rules and compact operational context follow the approved workspace design. The existing dashboard remains available unchanged.

The inspector separates recorded frame occupancy, controller occupancy, requested cooling and simulated reports. It shows the original decision reason, exact supporting forecast, issue/expiry/window/restart, report lifecycle, missing-link warnings, and expandable original IDs/payload. Invalid measurements remain unavailable. It does not equate accepted commands with applied output, or simulated output with physical actuation.

## Queries and filtering

- Existing `useOperatingRecords`, `fetchOperatingPage`, `recordRange`, validation and correlation logic are reused. The only adapter addition is an exact `event_id` equality reader that runs through the same scope checks and correlator.
- One search field and 24h / 7d / inclusive Malaysia-local custom dates. Maximum seven local days uses the existing validator. Quick All / Decisions / Forecasts / Reports; Advanced exposes every stored event category, all four requested modes and text / event-ID / correlation-ID search scopes.
- Search is the existing escaped, case-insensitive server query over the complete matching dataset, never a filter over the loaded page. Identifier searches use the existing identifier substring semantics. Exact contextual navigation separately uses ID equality; it never attaches a nearby event.
- Requested-mode filtering retains the existing decision/override-request semantics. It does not invent modes for forecasts or output reports.
- Draft filter changes are explicit. Until Apply, the last applied query stays visible and export is disabled. Quick categories apply the current draft. Pagination, count, list-derived detail and CSV use the same applied filters and snapshot.
- Initial selection is 24h / all event types, 25 rows per page, newest first. The active snapshot stays pinned through ordinary polling. Reload retries the same query; Apply or Update snapshot deliberately advances it. No ACTIVE run, loading, empty, stale and failed-read states are explicit. Failed reads are never labelled as a successful zero count.

## Historical navigation and state

Decision and simulated-report timeline markers, plus decision / output / forecast buttons in the history inspector, open exact stored identities. Opening from hover explicitly pins that inspection; ordinary hover alone remains transient. The record read caps its timestamp at the inspected instant and retains ACTIVE run, zone and committed sequence boundaries. Existing causal frame, command, decision, forecast and output matching rules are unchanged.

View in Operating Records opens a focused ID query at that same historical snapshot. The query window ends immediately after the exact event timestamp so a causal decision older than the visible history head is still discoverable. The actual bounds and search scope are displayed. Return to Usage & Cooling preserves the explicit pinned timestamp and frozen inspected records. Related links preserve the originating snapshot. Escape / close returns focus to the ledger trigger or SVG timeline marker. Records query/page state, existing camera and selected sensor remain mounted through normal view changes.

## CSV guarantees

`src/api/exportOperatingRecords.ts` is unchanged. The new view calls that exporter, not a replacement. It reads every filtered page at one immutable snapshot, with the original 500-row batches, 50,000-row / 25 MiB limits, 180-second timeout, count consistency checks, CSV escaping, formula protection, UTC and explicit +08:00 timestamps, provenance and distinct requested / reported fields. Progress and cancellation remain visible. Download creation happens only after complete success and a final abort check; failure or cancellation never creates a partial CSV.

Actual browser download: **2,896 records**, compared byte-for-byte with the Phase 3 exporter at the CSV's recorded run/zone/sequence/time/filter boundaries. Snapshot sequence **6923**, 2026-10-22T11:44:30Z. SHA-256 `a019b1c88e28eda3dca8ee6bd69eb54638c41bd7a29fe451851dc9c354dd8e79`. Browser cancellation and a locally failed export left the existing downloaded file unchanged and created no additional matching file. The separate live audit also compared a six-page export and cancellation after its first page.

## Validation

- `npm run typecheck`: passed.
- `npm run build`: passed. The existing lazy Three.js renderer still produces the pre-existing >500 kB chunk advisory; no new dependency was added.
- `node --test --test-reporter=dot test/*.test.mjs`: **119 passed**, including eight new exact-record / inspector / ledger regression tests and all existing CSV, records, history, utilization and spatial tests.
- Live read-only audit imports the actual `d39f281` adapter/exporter source for baseline comparison. At one pinned ACTIVE snapshot (run `fa15f01f-03ed-4a25-ab7d-575e56682222`, zone `zone-1`, sequence 6927), the current and original pages / contexts were deeply equal for 24h All (5,796), 7d PRECOOL + FORECAST_RESTART (14), Reports (16), `sim-1` search (2,896), and a literal wildcard-containing empty query (0). Pages 1 and 2 and representative exact lookups matched. See `phase4-evidence/live-parity.json` for precise boundaries and CSV evidence.
- Real browser: 7d decisions / page 2 (112 total), custom dates, advanced node category + ID search, contextual links, exact history cross-navigation, pin persistence across polling, keyboard dismissal / focus restoration, complete CSV and cancellation. Floor / 3D selection, controls and node history also checked.
- Local test-only preview exercised cached and uncached read failures, failed export, unavailable exact ID, missing frame / forecast links, no ACTIVE run, freshness clock +10 min and recovery. These controls only omit/fail local read responses or adjust the freshness clock; they never write to Supabase or run a generator. Production code does not import the QA server.
- Desktop 1440×900 and phone 390×844 ledger and inspector reviewed. Screenshot checks report no overflow, console errors or failed images. The inspector's event-category eyebrow deliberately groups closely with its title. See `phase4-evidence/ui-checks.json` and screenshot directories.
- Stable checkout matches its pre-integration manifest: branch, HEAD, status, index and all 64 recorded file hashes unchanged. No credentials / `.env`, schema, RLS, generator, backend or legacy Control API changes. No push or merge.

## Files changed

Application:

| File under `apps/dashboard/` | Purpose |
| --- | --- |
| `src/pages/SpatialDashboard.tsx` | Records route/nav, persistent workspace, contextual target and history handoff |
| `src/components/spatial/OperatingRecordsWorkspace.tsx` (new) | Applied server queries, ledger, filters, paging, original CSV integration |
| `src/components/spatial/OperatingRecordInspector.tsx` (new) | Accessible contextual exact-record inspector and causal links |
| `src/hooks/useOperatingRecord.ts` (new) | Scoped exact read, cancellation, cached errors and retry |
| `src/lib/spatialRecords.ts` (new) | Typed targets, quick categories and historical snapshot boundary |
| `src/api/operatingRecords.ts` | Additive exact-ID reader using unchanged validation/correlation |
| `src/components/spatial/UsageCooling.tsx` | Preserve historical pin and expose exact causal record links |
| `src/components/spatial/CoolingTimeline.tsx` | Open selected marker's stored identity |
| `src/spatial-records.css` (new) | Scoped ledger, responsive filters and modal styling |
| `test/spatial-records.test.mjs` (new) | Eight focused adapter / historical / rendering regressions |
| `package.json` | Include new suite in `test:spatial`; no dependency or lock changes |

Documentation / evidence: `docs/integration/phase4.md` (this report), `verify-phase4-live.mjs`, `phase4-qa-server.mjs`, `phase4-evidence/live-parity.json`, `phase4-evidence/ui-checks.json`, and desktop/phone screenshots with reports in `phase4-evidence/records/` and `phase4-evidence/inspector/`.

## Remaining Phase 5 work / limits

Final visual polishing remains deferred as requested. Phone-width browser checks do not replace physical touch-device and assistive-technology testing. Dense 7d timeline markers retain the established compressed presentation; keyboard timestamp inspection and contextual inspector links are available. Additional authenticated deployments or RLS policies not represented by the current read connection were not changed or certified. No physical HVAC actuation, electricity use or verified energy savings is claimed. No Phase 5 changes were implemented.
