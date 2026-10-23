# Spatial workspace extension

Intent: add a floor-to-zone workflow within the approved Thermal Atlas direction. Existing-product extension, not a production integration.

North star: locate the evidence on a floor, then understand one shared zone's cooling decision.

## Approach

The operator starts on an architectural plan. Open Office has the current synthetic snapshot and enters the full workspace with one selection. Five other spaces remain spatial context: each explicitly says Illustrative / no operational data, and selecting one shows its unconnected state. No invented measurements or forecasts appear for them.

SVG is appropriate for the 2D plan: precise boundaries, readable room names, compact authored furniture, native keyboard targets and no graphics runtime. Phones preserve plan scale in a horizontal scroll area, with an equivalent space list. Selecting an illustrative space brings its explanation into view on a phone.

True 3D is justified here by the requested inspection/orbit task. Locally bundled Three.js0.180.0 and OrbitControls render authored geometric furniture, cutaway walls and a retained structural ceiling frame. No model or texture downloads are needed. An orthographic camera retains the architectural drawing character. Pan is disabled; orbit is limited to comfortable upper perspectives; zoom is bounded. Camera arrows, zoom controls, Reset, keyboard arrows, +/− and Home provide alternatives to dragging. Phone controls preserve native vertical page scrolling.

Each node has a mounting plate touching the ceiling rail, a short stem and a two-tone device housing. The device is above the occupied volume. Broad floor footprints cover work surfaces, chairs and circulation; these are sensing sub-areas within one room-wide cooling zone. The selected/hovered node, footprint and reading strip share the same selection. Projected labels follow 3D coordinates while reading strips stay fixed. Inspecting a node opens the existing status/evidence/history dialog.

## Scope and assumptions

- Exactly one operational demo zone and two nodes. Existing local fixtures remain unchanged.
- The floor layout, furniture, room names, ceiling dimensions and device housing are an authored spatial proposal, not a surveyed site or hardware CAD drawing.
- Approximately10m² is the supplied sensing coverage. Geometry is illustrative; no physical field-of-view or mounting-height calculation is claimed. Left/right coverage is not independent HVAC control.
- No extra temperatures, humidity readings, forecasts, equipment status, electricity measurements, savings claims or physical actuation.
- The landing illustration remains the lightweight preview. The detailed workspace uses true 3D and falls back to the existing accessible SVG/readings if WebGL or library loading fails.
- WebGL requires browser support. Shadows and geometry are deliberately simple, pixel ratio is capped at1.75, rendering is on demand and pauses when hidden/offscreen. No physical-device frame-rate guarantee.
- Reduced motion removes camera damping, view-transition animation and automatic smooth scrolling, while direct camera manipulation remains available. OS preference behavior was source-reviewed; physical reduced-motion and touch-device testing were not performed.

## Files

- `index.html`: floor plan/inspector entry, persistent floor navigation, true-3D component binding.
- `styles.css`: floor layout, narrow-screen space list/inspector, zone-stage sizing, restrained view transitions using existing tokens.
- `app.js`: prototype navigation/history, floor selection, contextual focus restoration through Shadow DOM. Existing data derivation and record logic retained.
- `floor-plan.js`: accessible architectural SVG custom element and space-selection event.
- `../omnisense-office/office-3d.js`: geometric scene, mounting/coverage, projected node controls, orbit/zoom/reset, on-demand lifecycle and fallback.
- `../omnisense-office/vendor/`: pinned Three.js core/module, OrbitControls and MIT license. OrbitControls import is rewritten to the local module.
- Existing design documentation updated with the new flow and data boundary.

Production React Dashboard, Supabase/schema/queries, generator and credentials were not edited. No commit or push was made.

## Task path

| Task | Before | Current |
| --- | --- | --- |
| Locate the monitored area on a floor | Unavailable; entry opened the single room | Floor opens by default; one click/Enter opens the supported zone |
| Inspect a node | One marker/readout selection | One marker/readout selection; same inspector and history |
| Return to spatial overview | Unavailable | One persistent Floor overview action; browser Back also supported |
| Inspect unconnected space | Unavailable | One selection shows explicit no-data state; no measurements to infer |

No new configuration decisions or cross-screen memorization are introduced. Zone filters, selected node and camera survive floor/zone navigation within the page. A reload restores the URL view and default camera.

## Review

One independent existing-interface review, no numerical score. No blocking visual issue or brand drift. Improvements applied: stronger sensing-boundary contrast; larger, two-tone device bodies and clearer stems; removed redundant “Two sensing sub-areas” and implementation-oriented “ceiling frame retained” helper. Preserved clear supported/illustrative distinction and the architectural frame.

Phone space selection and focus restoration were refined during main-agent testing. Heading-spacing and small-body-text hints were corrected; boundary paragraph measure reduced. Required illustrative/data-boundary labels remain because the user explicitly requested them. No generic decoration or new marketing text was added.

## Validation

Main-agent browser walkthrough: supported and illustrative floor selection, keyboard Enter selection, floor return, mouse drag, keyboard orbit, projected label movement, zoom upper limit, Home reset, Node02 marker/readout inspection, 7-day node history, Escape and return focus to the originating Shadow DOM button. Existing fixture checks and syntax checks passed. Desktop1440×900 and phone390×844 views were inspected for both floor and zone.

### Continuous zoom refinement

User-requested extension: hold + or − for continuous zoom; wheel up/down over the model to enlarge/reduce. Hold input uses elapsed time and exponential scale, stops on release/cancel/capture loss/window blur, and keeps the0.9–1.6 limits. A short tap retains a single-step adjustment. Pointer capture supports release outside the button. Hidden/offscreen/disconnected scenes cancel active input.

Wheel input is normalized for pixel/line/page delta units and retargets from the current camera presentation using a180ms cubic-bezier(.23,1,.32,1) ease-out. Rapid reversal preserves position. Reduced motion uses immediate wheel/tap adjustments; deliberate continuous hold remains directly controlled by the user. No new dependency or data-layer change. Mouse wheel is handled only over the viewport, while browser Ctrl/Meta zoom and scrolling outside the scene remain native. Keyboard zoom stays immediate.

Main-agent live UI checks:1800ms + hold reaches the upper bound and disables +;2000ms − hold reaches the lower bound and disables −. Midrange release stops without drift. Wheel up/down changes projected scale while page scrollY stays0; scrolling over the decision column changes scrollY to40 with unchanged marker positions. Reset, bounds and the existing data checks remain intact.

### Continuous rotation refinement

Both rotation arrows now share the press-and-hold interaction. Rotation runs at30°/second from elapsed hold time, keeping the existing azimuth limits. Short taps retain15° steps with the same180ms pointer-input easing; keyboard steps remain immediate. Release/cancel/capture loss/window blur, hidden/offscreen state and disconnect stop the interaction. Direct camera control clears residual orbit momentum so release does not drift. Projected node markers, zoom and Reset remain synchronized.

Main-agent live UI checks: a600ms left hold changes both projected marker positions; subsequent observation confirms identical positions after release. A2100ms right hold reaches the right bound and disables that arrow. A5000ms left hold reaches the left bound and disables the opposite arrow. Syntax and existing fixture checks pass. Only the shared 3D presentation file, its prototype cache version and these notes changed.

Evidence and remaining test limitations are recorded with final delivery in the evidence directory and QA.md. Existing analytical data checks verify the same one-zone/two-node, forecast, coverage, statistics and request/output relationships as before.
