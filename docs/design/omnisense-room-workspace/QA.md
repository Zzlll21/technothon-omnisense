# Prototype verification

## Main-agent checks

- `node checks.mjs` passed. It validates exactly two nodes, supported measurements and classifications, invalid-reading exclusions, 24h/7d duration and coverage reconciliation, forecast timing, every request/report correlation, preserved mismatch/correction, and both stale and fresh-disagreement evidence.
- `node --check app.js` and `node --check fixtures.js` passed. No production application build or unrelated test suite was run because the prototype is isolated plain JavaScript.
- Real browser interactions verified: both contextual entry routes; sensor range changes at 1h/24h/7d; forecast-to-record inspection; current decision evidence; timeline event click and keyboard Enter; Escape and focus return; 24h/7d analysis; occupancy/mode matrix to filtered records; pagination; combined filters; mismatch search; empty-result reset; and CSV download initiation with visible and screen-reader export feedback. Download persistence in the in-app browser was not separately verified.
- Chart-point selection displays the nearest recorded occupancy and requested mode and offers the nearest decision record. It is historical inspection, with no playback controls.
- 24h data reconciles: Normal 5h40m + Reduced 17h12m + Pre-cooling 1h00m + Unknown 8m = 24h. Normal during vacancy is 20m within the Normal total. Coverage is 99.4%.
- 7d data reconciles: Normal 39h40m + Reduced 120h24m + Pre-cooling 7h00m + Unknown 56m = 168h.

## Visual verification and review

Desktop 1440×900, laptop 1280×800 and phone 390×844 were rendered and inspected. Full pages and contextual inspectors were checked. Final screenshot reports contain no console errors, horizontal page overflow, failed images, contrast warnings or small-body-text warnings.

One independent review was attempted under oil-ui-pro. The reviewer inspected screenshots and returned preliminary feedback: phone hierarchy placed the decision/plan too late, and the occupancy lane lacked an explicit Occupied legend. Both were corrected. The review then stopped at the account usage limit before issuing its final report. Its provisional assessment was approximately 8/10; this is not a completed independent score. No final independent review or 9/10 acceptance is claimed.

The main agent completed the final visual self-check. Desktop retains the spatial composition; phone now places current averages, request/reason, simulated report, planned restart and expected use within the initial reading flow before the schematic. The occupancy legend explicitly includes Occupied, Vacant and Uncertain. Timestamp and state labels remain visible rather than relying on color alone.

## Refinements and subtraction

- Removed redundant home subtitle and context text; shortened the current explanation while retaining vacancy evidence and the pre-cooling timing rationale.
- Raised low-contrast inactive range text and small explanatory body text.
- Replaced tiny phone SVG sensor callouts with readable HTML node inspection links.
- Added an immediate requested/reported comparison to output records.
- Corrected the near-future timeline to show the actual past uncertainty and transition-hold interval before the current Reduced request.
- Preserved gaps in node temperature/RH traces; no connecting line bridges missing observations.
- Made timeline controls accessible to assistive technology and keyboard activation.
- Kept all pre-cooling starts in the selected interval; named that event lane explicitly.

## Motion evidence and retained tool notices

The final motion probe detected three entering elements, maximum translation 8px, opacity change 0.99, and no loops. Inspector motion was separately detected at up to 20px with opacity change 0.9. Reduced motion is supported in CSS and immediate dialog dismissal.

The screenshot tool's generic “no scroll narrative” notice is retained: the page is an operational workspace, and scrolling must not move the evidence or change its meaning. There is no landing-page narrative requirement.

The environment does not contain ffmpeg. Recording attempts therefore produced start/mid/end frames rather than encoded video, and the evidence command reported a nonzero exit for that capture limitation. Static screenshots, motion probes and real interactions succeeded; encoded motion playback was not verified.

Synthetic-data and simulated-output labels intentionally remain in the interface because they are actual system boundaries requested by the user, rather than prototype-production notes.

## Current evidence

- `evidence/final/idle-1440x900.png`: complete desktop Room view.
- `evidence/final/idle-390x844.png`: complete phone Room view after hierarchy refinement.
- `evidence/final/*-@2x.png`: high-resolution Room views.
- `evidence/history-final/`: final aligned history and duration analysis, desktop/laptop/phone.
- `evidence/inspectors-final/`: final node, forecast, stale, fresh-disagreement, mismatch, empty and operating-record viewports on desktop/phone.
- `evidence/full/records-1440x900.png`: complete operating record layout; unchanged since capture.
- `evidence/final/report.json`: final Room capture and entry-motion report.
- `evidence/history-final/report.json`, `evidence/inspectors-final/report.json`: final additional state reports.
- `evidence/motion-final/`: unchanged contextual-inspector motion frames and probe; entry frames there predate the final entrance refinement.

Earlier evidence directories remain as iteration history. Use the paths above for the delivered version.

## Floor → true-3D extension, 22 October

This section supersedes the earlier Room default and illustration-only spatial evidence. Data/analytics evidence above remains applicable; fixtures and analytical logic were not changed.

- Entry and map: default Floor overview, illustrative Conference selection shows no operational data, supported Open Office opens Zone, persistent return and native browser Back work. Keyboard Enter also selects both types of map target.
- Camera: actual mouse drag changes the model orientation; node markers remain projected from their 3D positions. Keyboard ArrowRight changed Node01 marker from translate3d(348.884px,51.9933px,0) to translate3d(361.327px,44.9981px,0). Repeated + reaches the upper zoom bound and disables Zoom in. Home restores the isometric view. Camera/selected node survive view changes.
- Node selection: marker and readout both open the existing Node02 inspector with26.0°C,58%RH,Vacant,Fresh,12-second age and valid evidence. Seven-day history changes all three node-history plots. Escape restores focus to the originating button inside the component's Shadow DOM.
- Coverage: independent visual reviewer confirmed the strengthened left/right footprints span furniture and circulation and that the device body/stem visibly separate from the ceiling frame on desktop and mobile. One review plus focused verification, no score, no blocking regression.
- Existing Usage & cooling remains reachable through the new spatial navigation. One-zone/two-node fixture checks, duration/coverage reconciliation, forecast timing and request/output correlations pass. Syntax checks pass for app.js, floor-plan.js and office-3d.js.
- Mobile: 390×844 layouts inspected; horizontally scrollable floor plus equivalent space list, selected no-data inspector and native page scroll retained. Explicit orbit/zoom buttons replace drag on coarse-pointer devices. No console errors, broken images or page-wide overflow in final captures.
- Reduced-motion: guards source-reviewed for camera damping, view transitions and automatic scrolling. Physical OS preference and physical touch-device performance were not tested. No fps claim.

Latest spatial evidence is in `../omnisense-office/evidence/`:

- `spatial-floor-final/page.png`: complete desktop floor and room index.
- `spatial-3d-final/page.png`, `page-@2x.png`: desktop scene after mounting/coverage refinements.
- `spatial-3d-mobile-final/page.png`: final phone scene.
- `spatial-floor-mobile-final/page-unconnected.png`: phone no-data state after actual list selection (full-page capture places the sticky navigation at its scroll position; not a content-layout defect).
- `spatial-orbit-record/record-orbit.mp4`, `motion-orbit-sequence.png`:2.5-second camera/keyboard/reset record; final screenshot consistency matched. The main agent also tested a larger real mouse drag in the app browser.

The evidence tool's DOM motion probe cannot inspect WebGL drawing changes; its no-scroll-narrative hint is inapplicable to this operational workspace. Deliberately retained stable page scrolling and restrained entry. Initial evidence recording lacked ffmpeg; a later recording used the existing local encoder successfully. A transient library-load failure capture exercised the SVG fallback; final captures load the local renderer without errors. Normal WebGL context loss and reduced-motion preference were source-reviewed rather than artificially triggered.

No Supabase/backend/generator/credential or production dashboard edits, commit or push.
