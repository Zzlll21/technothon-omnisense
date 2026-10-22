# OmniSense: Room, decision, record

Design north star: understand the room now, anticipate its next use, and trace every cooling decision to evidence.

Source of truth: the user's functional requirements of 22 October 2026. No existing application components, styles, layouts, screenshots, adapters, types or business logic are to be inspected for this creative prototype. Repository integration is deferred until a direction is selected.

## Supported scope

- Exactly one shared cooling zone and two sensor nodes.
- Temperature, relative humidity, Occupied / Vacant / Uncertain classifications, node freshness and evidence validity.
- Requested Normal / Reduced / Pre-cooling operation, compared with simulated reported outputs.
- Next expected use, forecast source and quality, planned cooling restart, recorded history and decision explanations.
- Node historical inspection at 1 hour / 24 hours / 7 days.
- Requested-operation statistics at 24 hours / 7 days, including Normal during vacancy, coverage and occupancy versus mode relationships.
- Searchable, filterable operating records, correlation inspection and CSV export.

No extra zones, buildings, HVAC equipment, measured electricity, verified savings, physical actuation, control editing, scenario selection or playback controls.

## Independent product concept

One zone is the primary object. The initial workspace links a spatial two-node view to the current request, its explanation, the next expected use and the planned restart. An aligned timeline explains occupancy versus cooling. The operational record is the evidence layer, rather than a disconnected log page.

Three lenses, not a five-page feature inventory:

1. Room: current observation → decision → next use.
2. Usage & cooling: aligned historical conditions, occupancy, requested modes, planned forecast windows and decision events; derived duration statistics.
3. Operating record: searchable events with supporting snapshots and correlated simulated reports.

Sensors, forecasts and operating records open contextual, keyboard-accessible inspectors. They do not require separate navigation pages.

## Visual direction

Mineral-white architectural canvas, deep petrol text and controls, muted sage Reduced operation, ochre Pre-cooling, dark petrol Normal operation. Typography: Bahnschrift headings, Segoe UI body and Consolas timestamps. A custom single-room vector diagram contains exactly two selectable sensor markers. The diagram does not interpolate a thermal field or imply an engineered floor plan.

All illustrative operating data lives in a separate fixture module and is shared between current observation, timelines, records and statistics. Coverage and durations must reconcile mathematically. Unknown intervals remain visible and do not become normal operation.

## Boundaries

This is a separate frontend prototype with no production connection. Sensor coordinates and readings are illustrative. Reported output is labelled simulated; durations describe requested operation and are not an electricity or energy-savings measure. These limitations are part of the information hierarchy where they affect interpretation.

The completed design rationale, requirement coverage, tradeoffs and verification results are recorded in DESIGN.md and QA.md. The selected direction remains a separate prototype; repository integration is deferred.
