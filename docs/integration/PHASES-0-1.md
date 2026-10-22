# OmniSense spatial integration — Phases 0–1

Status: implemented on `codex/omnisense-spatial-integration`. Later integration phases are deliberately deferred. The approved mineral-white / petrol / sage floor composition is retained; this phase connects the floor, not the 3D workspace or historical screens.

## Phase 0 — reviewed, checkpointed, isolated

Original checkout: `C:/Users/zheng/OneDrive/文档/Technothon`, branch `experiment/gemini-ui-redesign`, original HEAD `974a21a`.

Local checkpoint: `44d655064bbb8a8ab78f0f612e4f6f7f399784e9`, retained by `codex/omnisense-integration-baseline`. Created with an alternate Git index and `commit-tree`; the original branch, HEAD, real index and working files were not reset, staged or committed in place. This is a local checkpoint, not a push.

Isolated worktree: `C:/Users/zheng/.codex/visualizations/2026/10/21/01a15eba-1f31-7181-8a51-48088d87b563/omnisense-spatial-integration`.

### Baseline decisions

| Existing local changes | Decision and reason |
| --- | --- |
| Dashboard components, navigation, current/pinned inspection, sensor drawer and comparison, utilization evidence, styles and documentation | Include as a connected, compiling implementation. Omitting the new helpers/styles/components would break the existing experiment. |
| `operatingRecords.ts` universal search and matching tests/fake-client support | Include as pre-existing functionality. It quotes PostgREST OR grammar separately from LIKE escaping, while retaining run/zone/sequence/date scope and CSV filters. This query change predates spatial integration. |
| Display labels and chart colours | Include. Reviewed utilization changes only alter colours; duration calculations are unchanged. |
| Approved room-workspace, office and landing prototype source/docs/local vendor dependencies | Include 30 reference files. Prototype fixtures remain archived under `docs/design`; the React runtime imports none of them. |
| Historical screenshots, recordings, evidence and superseded concepts | Exclude from this integration baseline. Remain in the original checkout. |
| `.agents`, `skills-lock.json`, `style-explorer.html`, `packages/sdp-contract.zip` and the accidental `hboard…` text file | Exclude: local tooling, earlier concept, archive or unrelated scratch file. Nothing was deleted. |
| Local `.env` files and `.env.technothon.backup` | Exclude. Confirmed ignored and not tracked. No credentials were copied to the worktree or checkpoint. |

The checkpoint includes 61 changed/new files: 20 tracked dashboard diffs, 11 new dashboard dependencies/tests, and 30 selected prototype reference files (approximately 1.42 MB). `styles.css` additionally appears modified in the original status due to line endings but has no substantive Git diff.

The complete checkpoint allowlist is in [BASELINE-FILES.txt](BASELINE-FILES.txt).

Sensitive-content scanning covered the allowlisted text for private keys, Supabase secret/publishable key values, JWTs, service tokens, database URLs with passwords and credential assignments. No matches were found. Tracked environment files are templates; local dashboard/generator environments and the dashboard backup remain ignored. A private manifest and allowlist are retained beside the isolated worktree, outside Git; credential contents were never printed. Secret-file hashes were used solely to verify they remained unchanged.

Before checkpointing, the current dashboard passed TypeScript and 34 focused tests covering overview validation, inspection, operating records and CSV. Baseline dependencies are reused through an ignored `node_modules` junction. No dependency or lockfile update was required.

## Phase 1 — floor overview connected to stored records

Entry: `/?experience=spatial`. The default `/` continues to render the existing dashboard. `App.tsx` adds only an opt-in lazy entry; the floor stylesheet is scoped under `.spatial-app`.

One `useOverview()` instance owns the floor snapshot. Its existing 30-second poll, 10-second freshness tick, abort/timeout handling, publication-race retry and last-good-snapshot behaviour remain intact. No new Supabase query or database write is introduced.

```text
existing Supabase client
  → existing fetchOverview (validated, checkpoint-scoped reads)
  → existing useOverview (one owner)
  → spatialOverview (pure typed presentation adapter)
  → React floor plan + selected-zone inspector
```

| Display | Source / rule |
| --- | --- |
| Supported zone identity | Stored `zone.name`, `zone_id`, `room_id`; Open Office is a schematic spatial slot, not an invented database room. |
| Occupancy and evidence coverage | Authoritative frame values. No frontend fusion from node classifications. |
| Node labels, identity and position | Configured required nodes and normalized x/y coordinates. Numbered floor markers are presentation identifiers, alongside actual labels in details. |
| Environmental headline | Configured `representative_environment_node_id`; never a mean or fallback to the other node. Metric validity is checked independently. Display uses one decimal; adapter retains original precision. |
| Freshness | Existing `nodeStatus` and configured thresholds, using observation time. Fresh-and-valid count also requires recorded `FRESH` state and valid temperature, humidity and classification evidence. |
| Requested mode and explanation | Stored decision mode and `reason_text`; all four modes stay distinct. |
| Simulated reported output | Exact linked output's reported fan/setpoint and status. Not relabelled as a cooling mode or physical actuation. |
| Next-use window / planned restart | Stored forecast window and restart, source, quality and state. No invented midpoint, lead time or future scenario. Expired/cancelled/unavailable forecasts expose no active plan. |
| Traceability | Run, zone/room, frame sequence, decision, command, forecast and output IDs in expandable snapshot references. |
| Time | Existing browser-local formatter, date included for future days; original ISO timestamp available as the title. No hardcoded prototype date/time. |

Five surrounding spaces are selectable but explicitly have no operational data. They never inherit the supported zone's readings. Furniture and approximately 10 m² sensing footprints remain schematic, not measured room geometry.

Loading, no-active-run and initial-error states show no placeholder metrics. A failed refresh preserves the last successful snapshot with a warning. Delayed feed and clock mismatch are visible. Missing/invalid readings remain unavailable, and stale last values retain their attribution.

Keyboard users can select spaces with Enter/Space, use the native button index and disclosure controls, follow the skip link and see focus outlines. On narrow screens the plan scrolls within its own region; selecting a space focuses and scrolls to its inspector. Reduced motion disables fill transitions and uses immediate inspector scrolling. There are no new continuous effects.

The primary action opens the existing dashboard. Full zone/sensor inspection, history, statistics, operating-record correlations and CSV export stay there during this phase. The prototype's “Explore 3D workspace” action is not connected to fabricated data.

## Protected boundaries

No spatial-phase changes to `src/api`, `src/hooks`, existing calculation/display modules, `src/types`, Supabase client/configuration, contracts, migrations, generator, package lock, existing dashboard components or exports. The operating-search enhancement is part of the reviewed checkpoint, not an integration query rewrite.

No schema, generator or credential modifications, no database writes, no deployment and no remote push. The landing and prototype remain available in the original checkout on port 8129.

## Running locally

The current integration preview is `http://127.0.0.1:8130/?experience=spatial`; the unchanged dashboard is `http://127.0.0.1:8130/`.

For a later restart, run this in the isolated worktree's `apps/dashboard` directory. It reads the existing configuration into process memory without copying or editing it:

```powershell
node --env-file="C:/Users/zheng/OneDrive/文档/Technothon/apps/dashboard/.env" node_modules/vite/bin/vite.js --host 127.0.0.1 --port 8130 --strictPort
```

Checks: `npm run typecheck`, `npm run test:spatial`. The latter builds only the local shared contract needed by the existing test harness, then runs the adapter tests. No production dashboard build is required.

## Validation and remaining work

TypeScript passed. The dashboard test set passed **97/97**, including node/history gaps, predictive correlations, duration coverage, operating-record filtering, CSV quoting/formula protection/export limits, overrides and the seven spatial checks.

A read-only check through unchanged `fetchOverview` passed against stored sequence **6475** at `2026-10-22T08:00:55Z`. It verified exact identity, authoritative occupancy, representative sample values, output decision/command references and active forecast fields. At that snapshot the stored values were 24.658 °C / 60.188% RH, Occupied, Normal cooling, APPLIED simulated output, BOOKING / MEDIUM forecast, next-use window `2026-10-23T00:00Z–00:05Z`, restart `2026-10-22T23:50Z`. These are QA observations, not runtime constants.

Browser checks: actual SDP data loads; Conference Room shows no operational data; keyboard activation returns to the supported zone; sensor evidence and snapshot disclosures show exact stored references; the dashboard link opens the existing functioning application. Its zone, representative readings, mode, reported output and future plan agree with the live source (continuous sequences can advance between views).

Desktop 1440×900 and phone 390×844 screenshots pass checks for console errors, page overflow and failed images. Small body-text warnings were corrected; the final capture reports no warnings. Loaded screenshots are outside Git at `../phase1-evidence-loaded/`, explicitly waiting for `.sa-zone-state` before capture; an earlier capture in `../phase1-evidence-final/` also preserves the loading state. Key-free live parity output is at `../phase1-evidence/live-parity.json`, relative to the worktree root. Keyboard activation and disclosures were also checked through browser accessibility controls. This was functional integration QA, not a fresh visual-design or animation review; independent visual polish is deferred as requested.

Not implemented: React 3D workspace/sensor selection migration, new history/statistics/record screens, landing integration, final visual polish, replacing the stable default entry. These require the later approved phases.
