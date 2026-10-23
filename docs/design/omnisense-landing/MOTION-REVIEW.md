# Landing-page motion review

Scope: original explanatory sequence restored in the standalone landing prototype. Reviewed with the requested Apple/Emil, animate and review-animations standards. Audit/recon preceded implementation; plans and status live in `animation-plans/`. This is a main-agent code and browser review, not an independent or hardware performance certification.

| Before | After | Why |
| --- | --- | --- |
| Numeric scrub continues catching up after scrolling stops. | Direct, reversible timeline mapping at `app.js:49` and `app.js:56`; native sticky at `styles.css:345`. | Retains agency and smooth section boundaries while keeping original100px/.94 slide/scale and1500px pacing. |
| Full overlapping translucent cards expose both sets of text. | Stable card surface at `styles.css:397`; phased opacity with at most2px blur at `app.js:62`. | Reduces double exposure without a wipe cutting through headings. Bounded blur is the specific STANDARDS.md crossfade exception; settled content returns to sharp/full opacity. |
| Hover motion activates on touch; arrow hover changes flex gap. | Fine-pointer media query at `styles.css:364`; arrow transform at `styles.css:63`. | Avoids false touch hover and per-frame text reflow. |
| Weak/shared press behavior and90ms entry stagger. |100ms press,160ms release, existing ease token updated to cubic-bezier(.23,1,.32,1);60ms stagger at `app.js:31`. | Immediate feedback and a coherent occasional marketing entrance. |
| Report opening can leave an old tween running and animates keyboard use. | Explicit tween cancellation at `app.js:15`; keyboard activation skips motion at `app.js:19`. | Rapid toggles leave no stale opacity/transform. Verified keyboard-open report has empty inline style. |
| Reduced motion removes all feedback; translucent navigation has no alternative. | Static reading order plus color/opacity feedback at `styles.css:319` and `app.js:73`; solid transparency/contrast variants at `styles.css:386`. | Preserves comprehension with less movement. |

Performance: no page layout properties are animated, no wheel interception, no inherited per-frame CSS variable, no animated shadows and no new dependency. Existing local GSAP is retained for the reversible scroll sequence. The only deliberate paint-cost exception is a bounded2px transition blur as prescribed by STANDARDS.md; hardware behavior remains unbenchmarked.

Interruptibility and timing: native scroll can stop/reverse anywhere; progress and chapter labels derive from the same timeline. UI feedback is100–250ms. The .8s entry and longer story are justified by the rare explanatory marketing context, not a repeated operator action. Hover moves only on fine pointers. Native FAQ indicator changes immediately.

Accessibility: reduced motion disables the sticky/moving story, exposes every chapter in reading order and keeps gentle color/opacity feedback. Short screens also receive the ordinary reading layout. Code paths were reviewed; preference emulation was not available through this browser tool.

Verification: `node --check docs/design/omnisense-landing/app.js` passed. Browser checks covered native entry/exit, reverse scrolling, three rapid report toggles and keyboard close/open; the last report remained visible with no stale inline transform. Settled screenshots in `evidence/motion-approved/` pass console/overflow/image/readability checks. The reverse midpoint's contrast hint is expected during a fade and is not a settled state. Retained eyebrow/chapter lint reflects meaningful capability labels and the three real steps.

**Decision: Approve for this standalone browser prototype.** No outstanding feel-breaking issue was observed in the checked flows. Physical-device frame pacing and live OS reduced-motion preferences remain manual verification limits; no claim of guaranteed60/120fps is made.
