# Third-party code and assets

## Website editor and fonts

GrapesJS 0.23.8 and grapesjs-parser-postcss 1.0.3 are used by the visual website editor under the BSD 3-Clause license. Their licenses and notices are retained in [lib/vendor/grapesjs](lib/vendor/grapesjs) and [lib/vendor/grapesjs-parser-postcss](lib/vendor/grapesjs-parser-postcss).

Manrope is distributed under the SIL Open Font License 1.1. The complete license is retained in [lib/vendor/manrope/LICENSE](lib/vendor/manrope/LICENSE); website exports embed the font and its license notice.

The local website-agent prompt incorporates an adaptation documented in [lib/vendor/openui-local/NOTICE](lib/vendor/openui-local/NOTICE), with the Apache 2.0 license retained alongside it. This does not embed or claim the full upstream OpenUI service.

Downloaded Wikimedia Commons photographs retain their individual source and license information in each website's photo credits. They are user data stored outside this repository; the application does not grant blanket rights over arbitrary internet images.

## Optimal Engine

Copyright 2026 MIOSA LLC and Optimal Engine contributors.
Licensed under the Apache License, Version 2.0. The complete upstream [LICENSE](lib/vendor/optimal-engine/LICENSE) and [NOTICE](lib/vendor/optimal-engine/NOTICE) are retained.

The user supplied `OptimalEngine-main.zip`, SHA-256 `5751553e53c47d8eb90b2a2be58171df523d03fffbf7d765cf8913cbe271eb55`, on 27 October 2026. Its declared canonical source is `https://github.com/Miosa-osa/OptimalEngine`; its contract identifies version 0.3.10. This records the supplied source identity, not an independently attested running service.

Four unmodified TypeScript SDK modules are included under `lib/vendor/optimal-engine/`: `http.ts`, `error.ts`, `types.ts` and `retrieval.ts`. The local optional adapter subclasses the HTTP client for bounded, read-only, fixed-origin requests; scoped retrieval uses the copied SDK serializer and retrieval client. SDK runtime workspace typing is also used by the local context builder.

`lib/workflow-context.ts` is a TypeScript adaptation of the reviewed `ScopeEnvelope`, `SourcePackage` and `ContextPackage` design. Changes for this application are identified in the file header: owner/project/run scope, immutable brand snapshots, SHA-256 source references, explicit excerpt omissions and a hard character budget. It runs on the Academy's own persisted workflow records; it does not contain or claim the complete Optimal Engine retrieval/runtime implementation.

Twenty-nine selected source/reference files are preserved outside the runtime tree in `.reference/optimal-engine/`, with a path-checked extraction manifest and hashes. No archive boot script, installer, agent instruction, benchmark or service was executed. The reference Svelte/Elixir files are excluded from this React/Next.js application's compilation.
