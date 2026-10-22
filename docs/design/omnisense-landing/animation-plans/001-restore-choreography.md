# 001 — Restore original scroll choreography

- Status: DONE
- Commit: 974a21a
- Severity: MEDIUM
- Category: Interruptibility / cohesion
- Scope: app.js and styles.css in docs/design/omnisense-landing/

## Problem

`app.js:48` uses `scrub:.2`, so panel motion continues after scroll stops. Native sticky fixes section handoffs and must stay. The original panel geometry is already present: enter from y=100, scale=.94; leave at y=-60, scale=.94. Preserve it.

## Target and conventions

Use the existing local GSAP/ScrollTrigger, no dependencies. Set the scrubbed timeline default to `ease:'none'` and `scrub:true`. Retain original normalized durations: .35 hold, .5 transition, .45 hold, .5 transition, .4 hold. Transition incoming y100/scale.94/opacity0 to y0/scale1/opacity1 while outgoing moves to y-60/scale.94/opacity0. Keep one stable opaque card surface. Fade outgoing over the first60% and incoming over the last60% of the transition; soften moving content with at most2px blur, returning to0px at rest. The small overlap avoids an empty midpoint. This is the explicit bounded blur exception in review-animations/STANDARDS.md, Masking imperfect crossfades; no blur on page backgrounds or scrolling navigation. A trial clipped wipe was rejected because it cut headings. Preserve all original rise/scale transforms. Drive labels from the timeline's rendered progress with midpoint thresholds .273 and .705. Native sticky stage remains top96px and height calc(100svh - 112px). Set section height to calc(100svh + 1388px), which gives 1500px sticky travel. Keep mobile, short-window and reduced-motion reading layouts.

## Steps and boundaries

Edit only the two named files. Update timeline mapping; do not add wheel handlers, springs on page scroll, snap points, timers or animated layout properties. Do not touch data, workspace, services or product copy. Retain original stage geometry and all supported capabilities.

## Verification

Run `node --check docs/design/omnisense-landing/app.js`. In browser, enter and leave the section from both directions, stop halfway through each transition and reverse. Verify panel presentation follows scroll immediately and native sticky retains position at boundaries. Capture middle positions and each settled chapter; inspect opacity overlap at slow scroll. Verify 390×844 and short desktop use normal reading order. No claim of real-device frame-rate certification.
