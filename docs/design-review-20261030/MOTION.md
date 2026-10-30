# Motion refinement — design record

The refinement keeps the approved graphite shell, cool working paper, restrained red, Manrope and silver-blue logo. One graphite demonstration stage now explains the currently focused home goal. The four finite scenes show paper drafting, website assembly, a process with a review step, and a focus arc. Desktop hover or keyboard focus replaces the scene immediately; goal buttons keep their direct destination behavior. Mobile uses static thumbnails. The previews are decorative explanations, not generated results or proof of completed work.

Motion runs only while the desktop stage intersects the viewport and the document is visible. The implementation uses the platform IntersectionObserver and visibilitychange APIs; a changed goal replaces the keyed scene rather than adding a queue. CSS reduced-motion rules remove the sequences and nonessential interface motion. The shell route arrival is now opacity-only (180ms). Short press feedback, native dialog arrival (220ms) and the existing toast check (240ms) acknowledge input or state without adding an action gate.

The repeated product footer has moved to a native **За платформата** dialog opened from the sidebar. The existing product description, copyright and community feedback action remain available. On mobile, the drawer closes before the dialog opens; dismissal returns focus to the menu trigger. The page-level example and community navigation remain in place.

No dependencies or raster assets were added. These changes make no claim about dopamine, retention, learner effectiveness or business outcomes.

## Timing record

| Element | Shipped timing | Purpose |
| --- | --- | --- |
| Shell route | 180ms ease-out; opacity .72 → 1 | Establish arrival without spatial travel. |
| Goal copy | 180ms; 5px hover/focus shift | Identify the selected explanation. |
| Paper sequence | 650ms settle; line stagger ends at 960ms | Show the structure of a draft. |
| Website sequence | 650ms settle; final action ends at 750ms | Show a composed website artifact. |
| Process sequence | 380ms connectors; review check ends at 1080ms | Explain a sample handoff and human review. |
| Focus sequence | 1100ms arc trace | Introduce a bounded focus illustration. |
| Press | 120ms; scale .975 | Acknowledge an enabled control press. |
| Dialog | 220ms | Distinguish a temporary information layer. |
| Toast check | 240ms | Emphasize the existing status message. |

All sequences finish and settle. The focus illustration is not a running user timer; the sample process is not a live job. The toast animation does not establish new save, approval or publishing semantics.

## Evidence and limits

The supplied motion-proof report records 22 route/viewport capture cases, 10 interaction checks, zero reported errors and zero Axe violations across 14 sampled states. The checks cover the four keyboard previews, finite settling, viewport gating, rapid scene replacement, direct task navigation, touch entry, mobile dialog focus, About information and reduced motion. Six PNG captures were independently inspected for visual review: the four desktop scene states, mobile entry and mobile About.

The warm headless Chromium diagnostic used 4× CPU throttling and sampled 98 requestAnimationFrame intervals: median (16.7ms), p95 (33.3ms), maximum (49.9ms), with zero intervals above (50ms). This is a bounded diagnostic of the tested transitions, not real-device FPS or a universal performance guarantee. The guest presentation checks do not establish account workflows, provider quality, publishing integrations, a complete accessibility audit or learner outcomes.

Ground truth on the VPS: `.data/design-20261030/production-motion-review.mjs`, `motion-captures/report.json`, captures and the before-motion backups. An actual production interaction recording was also captured. The documentation records the four UI files shipped in this change.

## Reference interpretation

[Rockstar's public VI presentation](https://www.rockstargames.com/VI) is a reference for staged visual storytelling. This product's response is a design interpretation: one small finite explanatory stage within the existing operating identity. It does not copy game branding or assert a shared implementation.

[NN/G's animation guidance](https://www.nngroup.com/articles/animation-purpose-ux/) supports brief, restrained motion used for feedback, state changes and signifiers. Here those roles map to press response, dialog arrival and the currently selected goal demonstration.

[W3C's explanation of Animation from Interactions](https://www.w3.org/WAI/WCAG21/Understanding/animation-from-interactions) describes disabling nonessential interaction-triggered motion and honoring user preferences. The shipped reduced-motion path follows that direction; the document is guidance for WCAG 2.1 SC 2.3.3 (AAA), not an accessibility certification of this product.

## Release checks and independent review

- `npm run typecheck`: passed using the configured Node toolchain.
- Scoped ESLint on both changed TSX components: passed.
- `git diff --check` on the changed UI files: passed.
- Academy-only rebuild: passed; production container healthy.
- Internal page, public page and workspace endpoint: HTTP 200.
- Independent Impeccable finish review: **ship — changed presentation scope**. No material findings. The review covers the changed presentation and tested guest states.

The renderer and motion additions did not change workflow execution, generation, authentication, approvals, saving, publishing, data schema or the other developer's website work. Signed-in journeys and real-device performance remain outside this verification scope. The earlier design-stage report remains in [VERIFICATION.md](VERIFICATION.md).
