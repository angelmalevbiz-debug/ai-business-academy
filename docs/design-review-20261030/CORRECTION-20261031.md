# Home correction — 31 October 2026

The user rejected the generated spatial four-object home (camera, portrait, villa and house/monitor imagery) as “AI slop” and preferred the preceding layout. This correction returns to the list plus one changing preview composition from d00d369. It records that rejection; it does not claim approval of the new samples.

The replacement previews use code-native UI: a sample publication, a flat service webpage with an inquiry action, an inquiry with a prepared reply awaiting review, and a one-task focus panel. Every preview is explicitly captioned as a sample and hidden from assistive technology. Desktop hover or keyboard focus changes the one preview. Phones use large labels and Phosphor icons. Clicking or touching a goal still opens its existing destination directly; real saved-work resume and the example remain available.

The graphite, paper and restrained-red operating identity, established silver-blue logo, About content, four goal routes and backend behavior remain in scope as established. No new dependencies or raster assets are introduced. The generated public/entry-studio-20261030 assets have been moved to a private backup and the spatial brief archived; they are excluded from the shipped home.

Motion is a finite scene arrival (250ms, opacity .55 to 1, vertical offset 7px to 0) plus the publication rule reveal (480ms after a 120ms delay). IntersectionObserver (threshold .2) and document visibility gate the motion; reduced-motion preferences suppress it. The desktop stage is omitted on phones.

This design record was derived from .data/corrective-entry.tsx and .data/corrective-entry.module.css, retaining unrelated guidance from the d00d369 design record. The sidecar's changed home HTML was rendered from that TSX with the installed Phosphor icons; its changed CSS was extracted and scoped from the actual module. No generated image data or base64 is embedded.

## Requirement verification

| Requested correction | Implemented and checked |
| --- | --- |
| Remove the strange generated objects | Removed the spatial gallery from the component. Its four assets and sidecars moved outside public to a private backup. The rejected directory no longer exists in public and none of the 13 captured states loads those objects. |
| Return to the clearer previous design | Restored the four-row list, one changing preview, prior spacing and direct actions. The preview content is the narrow refinement described above; this is not an assertion that the whole page is byte-identical to the preceding version. |
| Make the website recognizable | A flat browser-like page has a business heading, services, prices, contact and a visible inquiry action. It is explicitly labeled a sample and contains no focusable fake controls. |
| Make content recognizable | A sample publication uses the Academy name and two short lines about sharing the working process. No camera, anonymous model or brand portrait remains in this entry. |
| Keep navigation immediate | All four unchanged exact goal routes passed with Enter. Touch opens the business destination on the first tap. Sample, library and community links remain direct. |
| Keep the phone readable | Captured at 320, 390, 760, 768, 1024, 1280, 1440 and 1920px. Mobile uses large labels and icons, not miniature desktop text. No horizontal overflow in tested views. A separate 720px layout case was also captured; it is not a claim that browser zoom or every assistive setting was fully audited. |
| Preserve supporting information and motion preferences | About opens/closes with focus return, repeated global footer remains removed, short animations settle and stop offscreen, reduced motion removes spatial transitions. |

## Validation and release

- TypeScript, scoped ESLint and `git diff --check`: passed.
- Academy-only Docker rebuild: passed.
- Thirteen capture states and nine read-only interaction checks: passed.
- Axe checks: no reported violations in the 13 sampled states. This is not a complete accessibility certification.
- Independent rendered review: **ship the scoped correction**, with no must-fix legibility, misleading functionality, semantics or lifecycle issue. The publication remains fairly generic, but the reviewer did not consider it a blocker for this recovery. User visual approval remains unmeasured.
- Production container: healthy. Internal page, public page and workspace endpoint: HTTP 200.

Warm headless Chromium with 4× CPU throttling sampled 98 requestAnimationFrame intervals during preview changes: median 16.7ms, p95 33.3ms, maximum 50ms, no interval above 50ms. This is a bounded laboratory diagnostic, not a guarantee of smoothness on every device.

Seven existing destination surfaces were opened, but authenticated workflows, actual generation, approvals, publishing and the independent website editor's full journeys were not retested by this home-only correction. No production data was submitted. Other developer files, backend behavior, schema and unrelated production services were not edited.

Evidence on the VPS: `.data/design-20261030/production-corrective-review.mjs`, `corrective-captures/report.json` and captures. The archive of rejected experiments is private and excluded from the release. Earlier reports are historical; this correction supersedes the rejected spatial attempt without claiming every historical platform requirement is complete.
