# OmniSense — Room, decision, record

Current scope: extend the selected Thermal Atlas prototype with floor-to-zone navigation, preserving its visual language and one-zone data boundary. Locate evidence on a proposed office floor, then understand one zone's decision cycle. Source: user's 22 October interactive-floor brief.

Preview: http://127.0.0.1:8129/docs/design/omnisense-room-workspace/

## Why this structure

The operator's first question is a relationship, rather than an isolated metric: “The zone is vacant, so why is this mode requested, and what happens before the next use?” The Room view answers that directly with current occupancy, valid-node averages, the current request and reason, a separately labelled simulated report, and the restart/expected-use pair.

The four views follow changes in the operator's intent:

| View | Operator task | Main visual and interaction |
| --- | --- | --- |
| Floor overview | Locate the supported monitoring area within an office floor | Architectural SVG plan; Open Office opens the 3D zone, five illustrative spaces show no operational data |
| Room | Understand current conditions and the next plan | One schematic zone with exactly two selectable sensor nodes, a decision explanation, and a near-future occupancy/cooling timeline |
| Usage & cooling | Relate operation to actual occupancy over time | Aligned node temperatures, occupancy, requested modes, simulated report events and pre-cooling decisions; derived duration analysis |
| Operating record | Investigate and share the evidence | Search and combined filters, request/report correlation, original evidence snapshots, pagination and filtered CSV export |

Sensor, forecast and record inspection use a contextual side panel. An operator can inspect evidence without losing the original view or filters. The panel becomes full-width on a phone. Native dialog behavior provides focus containment and Escape dismissal; focus returns to the originating control.

## Visual and interaction decisions

- The open mineral-white canvas gives the single supported zone room to be understood. The floor includes five explicitly illustrative spaces for the proposed future product. They have no invented readings or controls. The 3D office contains exactly two sensing nodes; no thermal heatmap, airflow field or HVAC equipment is invented.
- Deep petrol anchors observations and controls. Sage marks Reduced operation, ochre marks preparation and forecasts. Labels distinguish occupancy from cooling modes even when color meanings are related.
- Recorded periods use solid marks; future planning uses dashed and hatched marks. A visible “Now” boundary separates outcomes from expectations.
- Both temperature traces share a clock with occupancy and cooling. There is no dual-axis chart implying a causal relationship from unrelated scales. Humidity and per-node occupancy history remain available in each sensor inspector.
- The duration bar and occupancy-by-mode matrix are derived from the same minute records as the history. Missing intervals remain unknown. Normal-during-vacancy is a subset of Normal operation, rather than an additional total or an asserted waste metric.
- A recorded mismatch shows requested and simulated reported modes side by side. A later correction remains another linked report; it does not erase the mismatch.
- On phones, current averages, the decision explanation and the restart plan precede the schematic. Wide time-aligned charts retain readable scale and scroll horizontally with an explicit hint.

## Requirement coverage

| Requirement | Where to inspect it |
| --- | --- |
| Current zone occupancy, temperature, humidity | Room heading and valid-node averages |
| Individual node readings, location and selection | Two selectable points on the schematic; phone node readouts |
| Sensor status, freshness, evidence validity | Sensor inspector; timestamped decision evidence, including stale/excluded measurements |
| Requested versus latest simulated reported mode | Room decision column; operating record; correlated-output inspector |
| Decision explanations | Room summary and original recorded explanations |
| Node temperature, humidity, occupancy histories at 1h/24h/7d | Sensor inspector |
| Next use, source, quality, window and planned restart | Room plan and forecast inspector |
| Occupancy, requested modes, temperature trends and forecast windows | Usage & cooling aligned history at 24h/7d |
| Significant decision events and historical explanations | Pre-cooling markers and simulated report markers open their records; all decisions are searchable in the record |
| Normal, Reduced, Pre-cooling duration, vacancy Normal, coverage | Usage & cooling duration analysis and occupancy-by-mode matrix |
| Record search, filtering, details, timestamps, CSV | Operating record |

## Motion

The initial diagram, decision and near-future timeline enter in a short sequence, using opacity and a 5–9px translation. Buttons have press feedback and active selections visibly change. Inspectors enter from the right over 280ms and exit over 150ms. There are no looping ambient effects, fake live pulses or animated chart values. Reduced-motion preferences disable animation and transitions.

Scrolling stays stable. This is a monitoring workspace, so it does not use a landing-page scroll narrative.

## Deliberate tradeoffs

1. **One operational zone inside a proposed floor.** The floor demonstrates future spatial navigation while the actual demonstration remains one shared cooling zone and two nodes. Placement, furniture, mounting geometry and floor dimensions are illustrative and need confirmed inputs before integration.
2. **An explanatory timeline over many disconnected charts.** Alignment exposes pre-cooling during vacancy and subsequent occupied periods. At seven days, closely spaced events can overlap visually; searchable records provide precise timestamp-level investigation.
3. **Progressive detail over every reading at once.** The first view prioritizes the cooling decision. Full sensor histories and evidence validity are one inspection away. The node history includes a five-reading sample list, not a complete tabular dump of every minute.
4. **Honest software operation over an energy-savings story.** The prototype presents requested durations and simulated output. It makes no measured electricity, verified savings, physical actuation or comfort-performance claim.
5. **Readable phone timelines over fitting everything into a tiny chart.** Horizontal inspection preserves the shared time axis but requires swiping. The decision and restart plan remain directly readable above it.

## Data and scope

This is an independent, offline-capable frontend prototype. It uses local HTML/CSS/JavaScript with bundled Alpine; it is not yet a React integration. Seven days of deterministic illustrative records end at 22 October 2026, 13:20 MYT. The snapshot does not continuously regenerate or pretend to be a live feed.

Fixture planning assumptions include a 20-minute pre-cooling lead, historical occupancy-pattern forecasts of Moderate quality, a stale-node interval, a fresh classification disagreement, coverage gaps and one request/report mismatch followed by a correction. These are illustrative records, not imported production policy or measured system performance.

Only this prototype directory was created or edited for this request. Existing dashboard UI, application logic, Supabase, credentials and the generator were not inspected or modified. Integration remains a later step after direction selection.

See QA.md for verification, review limitations and evidence paths.

## Floor and true-3D extension — 22 October

- Floor overview is the default workspace entry. Existing `?view=room`, `history`, `records` and inspector states remain available. Native browser Back and the persistent Floor overview control return to the spatial overview. (User-requested flow.)
- Open Office is the supported demo zone; every other floor space says Illustrative / no operational data. Selection never creates additional operational records. (User requirement.)
- `floor-plan.js` supplies the architectural SVG and keyboard-selectable spaces. `office-3d.js` supplies a lazy-loaded Three.js scene and reuses the existing node attribute/event interface. Sensor histories, forecasts, statistics and records remain the original prototype features. (Agent implementation.)
- Low cutaway walls expose the occupied space. A retained architectural frame, mounting plate, short stem and two-tone device housing establish physical ceiling attachment. Broad sage/teal footprints cover work surfaces and circulation, with hover/selection synchronization. (User requirement; authored illustrative geometry.)
- Orbit is bounded and pan is disabled. Orthographic zoom is limited to0.9–1.6; Reset and Home restore the isometric view. Phones use explicit orbit/zoom controls so vertical scrolling remains native. (Agent judgment.)
- View navigation uses a short crossfade/5px entrance; room hover and button feedback are restrained; camera damping stops at rest. Reduced motion removes view transitions, smooth auto-scroll and camera damping. No idle orbit. Rendering pauses offscreen and when the document is hidden. (Agent implementation.)
- The landing page retains its lightweight preview illustration; the detailed workspace and static fallback share the same sensor contract. Three.js and OrbitControls are bundled locally with their MIT license. No CDN is needed at runtime.

Implementation, review and validation details: [SPATIAL-WORKSPACE.md](SPATIAL-WORKSPACE.md).
