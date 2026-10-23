# OmniSense landing page

## Direction

North star: make sensing → anticipated use → explainable cooling decisions understandable through product demonstrations.

This is a new entry page for the selected Thermal Atlas prototype. The visitor is a building operator or evaluator who needs to understand the solution before entering its workspace. The primary action is Explore OmniSense; the operating-record section also deep-links to that workspace view.

The user’s CleanShot recording and https://cleanshot.com/ informed the spacious presentation, clear headline hierarchy, prominent product demonstration, alternating feature compositions and dark closing invitation. OmniSense retains its own petrol/sage palette, room schematic and decision story. No CleanShot artwork, copy, testimonials or brand assets are included in the page. The reference frames in `reference/` are review material only.

## Page sequence

1. See the room. Think one step ahead. A selectable two-node room schematic makes the product concrete immediately, alongside current request and next-use timing.
2. Sense / Anticipate / Explain. A scroll-driven desktop sequence moves through readings, a future plan and the requested-versus-simulated-reported comparison. Mobile and reduced-motion layouts show the panels in normal document order.
3. Occupancy and requested modes on a common time axis. This illustrates the relationship rather than claiming energy performance. The 11:00–13:20 recorded segments match the separate workspace fixtures. Hatched regions represent future expectations; future occupancy is unknown.
4. An expandable decision receipt reveals the correlated simulated output. The workspace link opens Operating record directly.
5. Clear demonstration scope and a final invitation to enter.

## Interaction and motion

Locally pinned GSAP 3.13.0 and ScrollTrigger provide staggered hero entry, one-time feature reveals and a reversible three-panel scroll narrative. Sensor hover/selection and the evidence disclosure provide immediate feedback. Native details elements support keyboard-operated FAQs. Reduced motion removes transitions and pinning and presents all three story panels. If GSAP fails to load, the story becomes static.

## Boundaries and tradeoffs

Exactly one shared cooling zone and two nodes; temperature, humidity, occupancy, freshness, validity, forecast source/quality and a traceable requested/reported distinction. Records are illustrative and synthetic. There is no physical HVAC actuation, measured electricity consumption or experimentally verified energy saving. These are product facts and therefore remain visible in the interface.

The large product demonstration and generous spacing trade above-the-fold density for comprehension. The desktop narrative uses additional scroll distance; phones use a shorter ordinary reading flow. This page introduces capabilities; detailed filtering and analysis belong in the existing workspace. There is no fabricated signup, pricing, customer proof or equipment control.

Only this new standalone directory was authored. Existing workspace, production dashboard, credentials, Supabase and generator were not modified. No legacy UI was inspected. The production entry route is not replaced; use the new landing URL as the prototype entry point.

## Review and refinement

One independent existing-product extension review, without numerical scoring. Reviewer found no blocking content or visual issue and verified the desktop Sense → Anticipate → Explain flow live. The requested refinement was larger mobile chart annotations; applied by increasing annotations to 12px, ticks to 11px and reducing seven ticks to four. A new screenshot verifies the result.

Main-agent readability checks raised small explanatory text and contrast issues; these were corrected. The remaining automated hints are section eyebrows and chapter numbers: retained because they identify product capabilities and the genuine three-step process. No decorative cards or invented metrics were added. Repetitive copy was avoided in the first draft; revisions clarified recorded-versus-future timing rather than adding promotional claims.

## Evidence and verification

- `evidence/final/`: desktop 1440×900, phone 390×844, 2× captures, entry/selection frames and motion probe.
- `evidence/history-mobile-refined/page-history.png`: final readable mobile timeline.
- `evidence/page-complete/`: full-page context after scrolling. Full desktop captures include the pin spacer and cannot represent the live pinned sequence in one image.
- `evidence/hero/`: deliverable overview.
- Browser checks: sensor selection changes its pressed state and freshness text; receipt expands to the matched simulated output; hardware FAQ opens; primary CTA enters the room workspace; record CTA enters Operating record.
- `node --check docs/design/omnisense-landing/app.js`: passed.
- `node docs/design/omnisense-room-workspace/checks.mjs`: passed (one zone/two nodes, duration and coverage reconciliation, forecast timing, output correlations, stale/disagreement evidence).
- Final affected screenshots: no console errors, horizontal overflow or broken images; remaining lint is explained above.
- Capture limitation: the screenshot tool did not detect ffmpeg, so it retained timed motion frames rather than encoded MP4. Motion was inspected live by the independent reviewer, and the tool detected entrance, selection feedback and scroll changes. Reduced-motion layout is implemented but was not separately browser-emulated during this pass.

## Local preview

With the existing workspace-root server running on port 8129:
http://127.0.0.1:8129/docs/design/omnisense-landing/

All runtime assets are local. No analytics, service connection, installation or build step is required for this standalone page.


## Scroll-boundary refinement — 22 October

User feedback identified the entrance/exit of the three-step scroll story as unsmooth. Replaced ScrollTrigger pinning (fixed-position handoff plus generated spacer) with native CSS sticky inside a fixed narrative section. The stage stays in document flow throughout entry and exit, with a 96px navigation clearance. ScrollTrigger now controls panel content only; its distance derives from the actual sticky travel. Reduced catch-up from 0.5s to 0.2s and tied chapter indicators/accessibility state to rendered timeline progress rather than raw scroll. Indicators update only when the active chapter changes. Desktop windows shorter than 680px use the ordinary reading layout to prevent clipped sticky content.

Verified entry, exit and reverse scrolling live at 1265×713, and captured 1440×900 entrance/middle/exit in `evidence/sticky-fix/`. Screenshot check passed without console errors, overflow, broken images or readability issues. Remaining eyebrow/number-label hints retain their original documented rationale. Syntax check passed. This was a focused motion fix; no new independent review or device frame-rate benchmark was performed.


## Original choreography restored and reviewed — 22 October

The user's follow-up requested Apple design, animate, Emil design engineering, animate-expo, review-animations and improve-animations. Read-only motion recon and plans are in `animation-plans/`; implementation was then performed under animate. Expo-specific runtime instructions do not apply to this HTML prototype. Applied Apple's directness, interruptibility and native-scrolling principles without adding springs to the page or hijacking wheel/touch input.

Restored original y100/scale.94 entry and y-60/scale.94 exit, original hold proportions and1500px narrative travel. Kept native sticky entry/exit. Scroll mapping is linear and direct (`scrub:true`), with no timed catch-up. The card surface stays still while its contents move; a0–2px blur and shortened opacity overlap soften the transition. A clipped-card trial was rejected after intermediate-frame inspection showed headings being cut. Added fine-pointer hover gating,100ms press/160ms release feedback, transform-only arrow motion,60ms hero stagger and cancellation of stale report tweens. Keyboard report opening is immediate. Reduced motion keeps static story reading order and color/opacity feedback; reduced transparency and higher contrast have solid navigation variants.

Review findings and verdict are in `MOTION-REVIEW.md`. Verified syntax, settled chapters, section exit, actual reverse scroll and rapid/keyboard report toggling in browser. Latest evidence is `evidence/motion-approved/`; final settled states have no readability warnings. Mid-transition captures intentionally contain partially faded content and therefore trigger the screenshot tool's opacity-derived contrast warning; they are motion samples, not the resting reading state. All content also has a static reduced-motion/mobile route. No console errors, overflow or image failures were found. Source review covers reduced-motion behavior; browser preference emulation and physical-device60/120Hz performance were not available in this pass. No independent reviewer was used for this focused revision.


## Stable receipt-column alignment — 22 October

The user's11:14 recording showed the right-hand explanatory text moving when the left record expanded. Cause: `.evidence-section` vertically centered both grid items in a row whose height changed. Changed the grid to start alignment and gave its copy a constant56px top inset to preserve the intended visual offset. The mobile stacked layout removes that inset. Disclosure behavior and existing animations are unchanged.

Browser measurement: right column documentTop4269.29990196228px and viewport top30.899999618530273px in both expanded and collapsed states:0px movement. Final desktop expanded screenshot is in `evidence/receipt-desktop-final/`; mobile expanded screenshot is in `evidence/receipt-stable/`. Both were visually inspected. Final desktop check has no runtime, overflow, image or readability errors. This is a focused layout correction, not a new motion design.
