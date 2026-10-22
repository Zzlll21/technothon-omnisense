# 003 — Align entrance and disclosure timing

- Status: DONE
- Commit: 974a21a
- Severity: LOW
- Category: Cohesion / interruption
- Scope: docs/design/omnisense-landing/app.js

## Problem

Original `app.js:28` uses `stagger:.09`; specified group-entry guidance is30–80ms. Original `app.js:18` opens report with a new fromTo tween every time, without cancelling previous tween when hidden.

## Target / steps

Use hero stagger .06, preserve .8s marketing entry and power3.out. Before changing report visibility call gsap.killTweensOf(report) if GSAP exists and reset its opacity/transform. For pointer opening with full motion, animate opacity0/y6 to opacity1/y0 for.25s power2.out with clearProps. For reduced-motion pointer opening, use opacity only for.2s. For keyboard activation (`event.detail===0`), show immediately without a tween. Closing immediately hides after cancellation. Keep native button semantics and aria-expanded state.

## Conventions / boundaries

Use existing GSAP and reduced-motion media query. Do not implement accordion height animation or edit product content. Other page interactions remain as authored.

## Verification

Run node --check on app.js. Repeatedly toggle report, then activate with keyboard. Confirm no stale tween or inline transform survives closing. Keep matched simulated-output content unchanged. Inspect entry frames for60ms stagger. Real hardware feel remains a manual follow-up.
