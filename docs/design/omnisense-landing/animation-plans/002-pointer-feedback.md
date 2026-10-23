# 002 — Make pointer feedback accessible and cheap

- Status: DONE
- Commit: 974a21a
- Severity: MEDIUM
- Category: Accessibility / performance
- Scope: docs/design/omnisense-landing/styles.css

## Problem

Original `styles.css:3`: `.text-link{...transition:gap .25s var(--ease)}` / `.text-link:hover{gap:26px}` animates layout. Button and sensor hover transforms are ungated. The reduced-motion rule disables every transition, including useful color feedback.

## Target

Extend the existing token: `--ease:cubic-bezier(.23,1,.32,1)`. Remove gap animation; keep gap18px, move only `.text-link span` with translateX(6px) over200ms var(--ease). Put hover movement inside `@media(hover:hover) and (pointer:fine)`. Press transforms use scale(.97) over100ms, release160ms; no animated shadows. In reduced motion remove transforms/animations and smooth anchor scrolling but retain 160ms color/background/border-color feedback. Add solid navigation surface for prefers-reduced-transparency and a clear navigation border for prefers-contrast:more.

## Steps / boundaries

Modify the existing declarations, not an overriding duplicate system. Keep current colors, geometry, button labels and routes. No new dependency, business logic or production UI edits.

## Verification

Read CSS to ensure no transition:all, gap animation or ungated hover movement. Capture hover/press states with desktop pointer. Verify phone retains static hover geometry. Inspect reduced-motion rules and reduced-transparency/contrast rules. Run existing screenshot tool: expect no console errors, overflow or failed images.
