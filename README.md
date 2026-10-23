# OmniSense — Spatial Cooling Intelligence

OmniSense connects ceiling-mounted ESP32 sensing nodes to a spatial monitoring
workspace. The competition implementation combines real sensor evidence with
stored occupancy decisions, expected-use windows and **simulated cooling output**.
It does not actuate physical HVAC or establish measured energy savings.

## 🌐 Live Demo — OmniSense Spatial Dashboard

Explore our deployed OmniSense intelligent building management dashboard.

**Live Website:** [https://omnisense-hybrid-spatial.vercel.app](https://omnisense-hybrid-spatial.vercel.app)

### 🔐 Demo Access for Judges

To explore the Spatial Workspace, please use the following demonstration credentials:

**Email:** `reader-a@omnisense.test`

**Password:** `joshua0322`

These credentials are intentionally public and are for dedicated, read-only competition demo access only.

**How to Access:**

1. Open the live website using the link above.
2. Click **Enter Workspace** on the landing page.
3. Sign in using the provided demo credentials.
4. Explore the OmniSense Spatial Dashboard.

### What You Can Explore

- **Interactive 3D Workspace** — Explore the monitored room and sensor locations.
- **AI-Powered Occupancy Monitoring** — View people-count detection from ESP32-based thermal sensors.
- **Environmental Monitoring** — Examine temperature and humidity readings.
- **Intelligent Cooling** — Explore occupancy-aware cooling decisions and target temperatures.
- **Historical Analytics** — Review recorded sensor data, occupancy trends and operating records.

**Note:** The workspace contains real sensor data collected from our ESP32 prototype. Live updates are available when the physical devices and Hybrid data-ingestion service are running. Otherwise, the dashboard displays the latest stored historical data. HVAC control outputs represent controller targets rather than verified physical air-conditioning operation.

Website: [omnisense-hybrid-spatial.vercel.app](https://omnisense-hybrid-spatial.vercel.app).
The landing page is public. Workspace data requires an approved private account
and an exact-run Supabase reader grant. Repository access does not grant data access.

## Architecture

```text
Two ESP32 ceiling nodes (demo-1 / demo-2)
  → HiveMQ MQTT over TLS
  → one local Hybrid Supervisor / Writer
  → isolated Supabase: evidence, atomic frames, decisions and events
  → authenticated React + Vite Spatial Dashboard (static hosting on Vercel)
```

The Writer is a separate long-running service, not browser code or a Vercel
Function. Its host must remain running for live updates. After it stops, the
website can display stored records with freshness and unavailable-data handling.
The Spatial Workspace does not use the retained legacy Control API.

## Implemented scope

- Public landing → sign-in → protected workspace, memory-only session, logout
  and exact allowed-origin checks. Browser refresh requires sign-in again.
- Interactive 2D Floor Overview and rotatable/zoomable 3D office, node selection,
  per-node occupancy/headcount category, temperature, humidity and history.
- Usage & Cooling: shared elapsed-time axis, zoom/pan, pinned historical inspector,
  forecast-as-of interpretation, four cooling modes and timestamp-based utilization.
- Operating Records: server-side search/filtering, pagination, exact correlated
  details, full filtered CSV export, cancellation and spreadsheet formula protection.
- Hybrid normalization/fusion, receipt freshness, conservative missing-data states,
  atomic checkpoints, exclusive fenced Writer lease and sanitized diagnostics.
- Separate synthetic model and offline replay/regression tests.

The configured representative node supplies zone environmental readings; the UI
does not silently average nodes. One shared cooling zone is supported. Surrounding
floorplan rooms and approximate sensing footprints are illustrative. Counts such
as `3+` are categories, not an exact census. `full_zone_coverage=false` means two
empty node readings do not establish confirmed whole-zone vacancy.

Forecasts in this demonstration use synthetic schedules, not a trained prediction
service or live booking integration. Cooling acknowledgements are simulated
records, not proof that equipment operated.

## Future / excluded from this stable release

Firmware PMV support and migration 004 remain separate unfinished development work.
Other future work includes physical BMS/HVAC actuation, validated full-room coverage,
trained forecasts, booking integration, measured energy evaluation and continuous
cloud hosting of the Writer. Retained legacy modules and design prototypes are
historical reference, not additional active services.

## Installation

Use Node.js 22.12+ (validated with Node 24) and Python 3 for the release audit.
Run from the repository root. On Windows use `npm.cmd` if PowerShell blocks
`npm.ps1`; use `npm` on other systems.

```powershell
npm.cmd --prefix apps/dashboard ci --no-audit --no-fund
npm.cmd --prefix services/sdp-generator ci --no-audit --no-fund
npm.cmd --prefix packages/sdp-contract run build
npm.cmd --prefix services/sdp-generator run build
```

Each runnable package has its own lockfile; there is no root npm workspace install.
Installation downloads dependencies. Validation below never installs or upgrades
packages and blocks external Node HTTP/MQTT connections.

## Safe offline evaluation — no accounts or cloud access

```powershell
node scripts/validate-release.mjs
python scripts/audit-public-release.py
```

Validation runs contracts, generator/database tests against disposable in-process
PGlite, dashboard tests, TypeScript and the production frontend build. It executes
no hosted SQL. With no configuration, the website shows its public landing and an
honest unavailable/setup state rather than fabricated operational readings:

```powershell
npm.cmd --prefix apps/dashboard run dev
```

Use the printed URL; `/workspace` opens the workspace route. To replay telemetry
or generate a bounded offline synthetic sample without connecting to MQTT/Supabase:

```powershell
node services/sdp-generator/hybrid-mqtt.mjs --replay services/sdp-generator/test/fixtures/firmware-replay.json
node services/sdp-generator/index.mjs --frames 3
```

These CLI commands do not load private environment files implicitly.

## Configured Dashboard and Backend

See [safe runtime setup](docs/PUBLIC-RUNTIME.md) for environment-variable templates,
target registration and operator-only startup. Templates contain no credentials:

| Purpose | Template | Private local destination |
| --- | --- | --- |
| Synthetic read-only Dashboard | `apps/dashboard/.env.example` | `apps/dashboard/.env` |
| Private Hybrid Dashboard | `apps/dashboard/.env.hybrid.example` | `apps/dashboard/.env.hybrid.local` |
| Hybrid Supervisor | `services/sdp-generator/hybrid-runtime.env.example` | `services/sdp-generator/hybrid-runtime.local.env` |

Do not point the Hybrid Writer at the synthetic project. Do not repeat existing
migrations, replace an ACTIVE run, grant readers or start another writer during
evaluation. Real operation needs explicit owner authorization and approved private
configuration; public source alone intentionally cannot enable live writes.

## Deployment and review

[Vercel frontend instructions](docs/integration/VERCEL-HYBRID-FRONTEND.md) describe
audited static prebuilt packaging with one exact production origin. The existing
Vercel deployment is independent of this GitHub release. Keep automatic GitHub
deployment disconnected unless separately approved.

See [release boundaries](docs/PUBLIC-RELEASE.md) and [security policy](SECURITY.md).
Older integration reports describe dated test stages and contain non-secret
project/run/test-user identifiers; they are not current setup instructions.
Do not publish private environments, manifests, populated approval registries,
Vercel metadata or new raw runtime evidence.
