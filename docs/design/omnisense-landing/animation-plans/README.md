# Landing-page motion audit

Commit: 974a21a. Scope: this standalone landing page only. No legacy application inspected.

Recon: static HTML/CSS/JS; local GSAP 3.13.0 and ScrollTrigger. Native CSS sticky holds the story; GSAP animates its three panels. Existing `--ease` token is the shared interaction curve. This is occasional explanatory marketing motion, not a frequently used operator task.

| # | Severity | Category | Location before edits | Finding | Fix summary |
| --- | --- | --- | --- | --- | --- |
| 001 | MEDIUM | Interruptibility / cohesion | app.js:48; styles.css:18 | Numeric scrub adds 0.2s catch-up; the shorter sticky travel changed the original pacing. | Restore original 1500px narrative travel, directly scrub a reversible slide/scale timeline and keep native sticky boundaries. |
| 002 | MEDIUM | Accessibility / performance | styles.css:3 | Hover transforms are ungated; `.text-link:hover` animates flex gap. | Gate hover to fine pointers and move the arrow by transform; retain immediate press feedback and gentler reduced-motion feedback. |
| 003 | LOW | Cohesion / interruption | app.js:18,28 | 90ms entry stagger exceeds the specified 30–80ms guidance; opening report creates fresh fromTo tweens without explicit cancellation. | Use 60ms entrance stagger, kill prior disclosure tween and skip movement on keyboard/reduced-motion activation. |

Execution order: 001 → 002 → 003. All are authorized by the user's request to restore and improve this animation. The audit phase is read-only; implementation is performed separately under animate. No additional motion opportunities were selected: the page already has sufficient explanatory motion. Native scrolling, browser momentum and the current navigation remain in control; no wheel interception or scroll smoothing library is introduced.

| Plan | Status | Dependencies |
| --- | --- | --- |
| 001 Restore original scroll choreography | DONE | None |
| 002 Make pointer feedback accessible and cheap | DONE | None |
| 003 Align entrance and disclosure timing | DONE | None |
