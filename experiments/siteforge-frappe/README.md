# SiteForge × Frappe Builder — isolated experiment

**Date:** 2026-11-06. **Production:** untouched.

## What we tested

- Read Frappe Builder's open-source source, MIT license, Bob AI prompt/design standards, snapshots and evaluation framework.
- Created two static demonstration websites for the same fictional interior-design business **FORMA**.
- Both used the same Groq `openai/gpt-oss-120b` model and source brief, but **not the same output budget**: baseline 2,200, Frappe-guided 4,200. The results therefore **do not isolate prompt effects**.
- Frappe-guided means an adapted prompt inspired by Frappe design principles; **Frappe Builder itself was not installed or run**.
- Captured desktop (1440 px) and phone (390 px) views with Playwright on the isolated VPS lab.

## Visual findings

| Check | SiteForge-style baseline | Frappe-guided experiment |
| --- | --- | --- |
| Model tokens used (including inputs) | 2020 | 3430 |
| Generated HTML chars | 1535 | 3405 |
| Generated CSS chars | 2436 | 4026 |
| Image rendered | Yes | Yes |
| h1 tags in screenshot DOM | 2 — invalid semantics | 1 |
| Unexpected magenta/purple palette | No | **Yes** |
| Glass/blur styling | No | **Yes** |
| Three equal feature cards | No | **Yes** |
| Responsive CSS | Yes | Yes |

**Conclusion:** Merely reusing Frappe's natural-language anti-generic instructions is insufficient. The model produced the very purple-gradient/glass/card defaults prohibited in the prompt. A rendered, deterministic quality gate is required before accepting any generated site, and mobile checks must be part of that gate.

## Artifacts

- [Visual desktop comparison](comparison-preview.jpg) (left: baseline; right: Frappe-guided)
- [SiteForge-style sample](siteforge-current-style.html)
- [Frappe-guided sample](frappe-guided-style.html)

## Next technical approach

1. **Keep SiteForge production untouched.** Avoid trying Frappe's development Docker Compose on the busy existing VPS (port conflicts, separate Frappe backend, MariaDB/Redis dependencies).
2. Test actual Frappe Builder only in a **separate dedicated sandbox**, using a pinned release and its own domain/ports/storage.
3. Add deterministic checks to SiteForge: reject unintended purple/magenta/glassmorphism, three identical cards, duplicated h1, mobile overflow, empty sections, broken image and unsourced claims; accept exceptions for explicit matching brand instructions.
4. Use browser screenshots and quality thresholds to compare fixed briefs over multiple runs before allowing a new generator to ship.
5. Consider a **page-block adapter** (Frappe Builder JSON to SiteForge document), not copying the entire Frappe frontend/backend into the current Next.js app.

**Source:** https://github.com/frappe/builder (MIT). No Frappe source files were copied into these demonstration HTML outputs.
