# Shared cooling-zone office visualization

Current detailed workspace: true 3D was added for the user's subsequent floor-to-zone brief. See [spatial workspace notes](../omnisense-room-workspace/SPATIAL-WORKSPACE.md). The pseudo-3D component documented below remains the landing preview and accessible static fallback; its sensor attribute/event contract is reused by the 3D component.

## Recommendation and tradeoffs

Implemented a lightweight pseudo-3D isometric SVG office with CSS perspective and mouse parallax. One small office was chosen over two rooms so the current single-zone demonstration remains clear. Furniture gives spatial context; it does not introduce additional rooms, sensors, measurements or equipment controls.

| Option | Libraries/assets | Strength | Tradeoff |
| --- | --- | --- | --- |
| Recommended pseudo-3D | Existing locally vendored GSAP3.13.0, SVG and CSS; no new installation | Immediate rendering, precise accessible sensor labels, modest rendering cost, no model loading or WebGL requirement | Fixed architectural viewpoint with gentle bounded tilt; no free rotation or physically changing lighting |
| True3D alternative | WebGL renderer, model/geometry assets, camera interaction and label projection/fallback support | Free orbit and changing views | More rendering and asset work; occlusion, readable projected labels, mobile performance and context-loss fallback need handling |

## Visual direction

North star: one shared cooling zone contains two spatial sensing sub-areas; furniture provides context and sensor readings support inspection.

One continuous floor and one shared zone, four contextual work surfaces, chairs, daylight windows, storage and a few plants. Warm flooring and sage/petrol furniture extend the selected Thermal Atlas language. The model is a schematic presentation, not a survey of a real office. No occupied people are drawn while the zone is Vacant. Two ceiling-mounted nodes each cover approximately10m², with projection guides into broad left and right sensing areas spanning furniture, seating and circulation. This supersedes the earlier floor-mounted and desk-centered depictions.

## Integration boundaries

`office-scene.js` defines an encapsulated `<omni-office>` presentation component shared by the landing preview and room workspace. It renders the same authored geometry and handles visual selection/motion only.

Attributes: node-one-temperature, node-one-humidity, node-one-occupancy, corresponding node-two attributes, selected-node, and variant. Missing readings display an em dash; occupancy defaults to Uncertain. Data labels use textContent and update when attributes change.

Selection dispatches a bubbling, composed `office-node-select` event with `{id:'node-01'}` or `{id:'node-02'}`. Workspace attributes bind to the existing Alpine `nodes` and `selectedNode` values; its event handler calls the existing `openNode(id)` inspector. Landing preserves its existing selection/freshness caption. Desktop readout buttons and in-scene markers both select nodes; existing workspace phone node links remain in place.

Only the standalone prototype visualization markup/styles and landing selection bridge were changed. Workspace application logic, fixtures, Supabase queries, credentials, generators and the production dashboard were not modified. The existing GSAP vendor file is reused by the workspace. The office component does not fetch data or connect to any service.

## Motion

Gate: occasional marketing/room orientation; purpose: spatial explanation and subtle pointer feedback. The decorative model moves while data labels stay fixed. No rotation controls, simulation playback, scroll interception, autoplay orbit or persistent idle animation.

The existing GSAP ticker clocks a critically damped spring (damping ratio1, response .4s), using the current presentation position and velocity on reversal. Bounds are2.2° on X,2.8° on Y and3px/2px translation; the ground shadow uses slight opposite parallax. Only model/shadow transforms change per frame. No inherited per-frame CSS variables or data re-rendering. Geometry is built once; bounds are read on entry/resize rather than on each frame. The ticker listener stops once settled. It resets when hidden/offscreen and cleans up when disconnected.

Mouse-only, fine-pointer and no-reduced-motion gates apply. Touch, reduced motion or unavailable GSAP retain the static office and all sensor functionality. Sensor buttons retain focus and press feedback; reduced motion removes movement. No new dependency was installed.

## Review and verification

One independent visual extension review plus focused verification of its placement refinement, without a numerical score. The reviewer found no blocking issue; Node02 support/placement was corrected and confirmed resolved. Independent reviewer inspected stills; main agent checked motion and functionality live.

- Node02 readout opens the original Node02 inspector:26.0°C,58%RH,Vacant,Fresh,12s,valid evidence.
- Node01 marker opens the original Node01 inspector:25.6°C,60%RH,Vacant,Fresh,6s,valid evidence.
- Selected node state follows the inspector selection.
- Real mouse movement changed the model to approximately2.02°Y/−1.05°X while the label stayed exactly at x59.76250076293945/y364.9375px:0px label movement.
- Desktop1440×900 and phone390×844 screenshots inspected for both workspace and landing. No console errors, horizontal overflow or broken assets in final captures. Existing landing eyebrow/chapter hints are retained for their documented navigation purpose.
- Node02 placement final evidence: `evidence/final-scene/page.png`.
- Mobile evidence: `evidence/workspace-mobile/` and `evidence/landing-mobile/` (before the small final Node02 move; responsive structure unchanged).
- Overall context evidence: `evidence/workspace-fit/` and `evidence/landing-fit/` (before the final Node02 move).
- `node --check docs/design/omnisense-office/office-scene.js` and landing app syntax checks passed.
- Existing `node docs/design/omnisense-room-workspace/checks.mjs` passed: zone/node count, statistics/coverage, forecast timing, correlations and uncertain/stale evidence.

Limits: pseudo-3D does not reveal hidden geometry on free rotation. OS reduced-motion/coarse-pointer guards were source-reviewed; not emulated on physical devices. No60/120fps guarantee is claimed. Main visual review corrected an initial SVG sizing overflow before final delivery. No additional text was removed; existing capability labels and product-boundary copy remain.

## Preview

- http://127.0.0.1:8129/docs/design/omnisense-room-workspace/
- http://127.0.0.1:8129/docs/design/omnisense-landing/


## Ceiling-mount clarification — 22 October

User clarified that each node is ceiling mounted and covers10m², suitable for a conference room or a group of cubicles. Updated the existing single-office scene to show two overhead mounting tiles on a cutaway ceiling plane and two lightly shaded sensing footprints over the work areas. Each readout says “Ceiling mounted ·10m²”; the workspace phone node list also includes this mounting/coverage fact. The whole office still represents one shared cooling zone. Sensor coverage is not a separate cooling zone, and the drawing does not claim a total20m² room area or calibrated non-overlapping coverage.

No mounting height, field-of-view angle, room dimensions, independent room controls or sensing geometry were supplied. Therefore ceiling height and footprint shapes are illustrative drawing coordinates; the footer explicitly labels coverage schematic. The footprint geometry is not a physical range calculation. No actual floor sensor objects remain.

Preserved sensor attributes, readings, selection events, inspectors and the bounded mouse spring. Final desktop crop `evidence/ceiling-final/page.png` and landing phone `evidence/ceiling-mobile/page-office.png` were visually inspected. No console errors, overflow or broken images; syntax and existing fixture checks passed. This focused factual correction was self-reviewed; prior independent review covered the earlier office design, not this new mounting clarification.

## Spatial sensing sub-areas — current revision

Replaced the desk-centered footprints with broad sage and teal polygons across the left and right office halves. Each extends across a desk area, seating and nearby circulation. Two overhead nodes sit above the central circulation band, away from desk centers. Four contextual work surfaces make the two-node scene read as spatial coverage rather than one device per workstation.

Hierarchy is explicit: “One shared cooling zone” and the full-room perimeter, then “Left sensing area” / “Right sensing area” with approximately10m² each, then each node's ceiling mounting, occupancy and readings. Fixed readout strips below the scene replace floating data cards. Area labels sit beyond the front floor edges so they do not resemble furniture-mounted badges. The two sensing sub-areas are not independent cooling zones or calibrated coverage boundaries.

Kept node selection, temperature/RH/occupancy attributes, inspector events and the existing bounded pointer motion. Verified Node02 selection changes the selected readout and landing evidence caption to Node02, fresh12s, valid evidence. No backend, fixture or production application changes were made for this revision.

Final desktop evidence: `evidence/subareas-final/page.png`. Phone layout evidence: `evidence/subareas-mobile/page-office.png` (before final label relocation and stronger footprint tint; responsive structure unchanged). Independent visual review confirmed the room/sub-area/readout hierarchy and no remaining high-value issue in the final desktop capture. Syntax and existing workspace fixture checks passed.
