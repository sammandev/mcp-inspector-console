# Task 6 report: parity and provenance inventories

Base: `27ed25d3a18c42d8b0181c183a82ac623f045e14`

## Implemented

- Added typed `feature-parity` and `upstream-manifest` packages.
- Cataloged 22 combined features; each has exactly one status, owner phase, source, and note.
- Pinned mcp-use to `8ff4b865e0e5712c66d5077e93392807daca9354` as dependency-only.
- Pinned Official Inspector to `eb54b447e5377a7a18acaea9602fced5cb4c5b9f` as reference-only.
- Added strict copied-file and dependency-only provenance validation.
- Kept Official copied-file count at zero and all future Official runtime features `blocked-license` pending file-level human/legal classification.
- Added deterministic generated reports, drift verification, and narrowly scoped third-party notices.
- Added `verify:provenance` (check-only) and `generate:provenance` (write) scripts.

## TDD evidence

### RED

- Initial exact focused command failed because `catalog.js`, `manifest.js`, and `validate.js` did not exist.
- Verifier test failed because `verifier.js` did not exist.
- A deliberate temporary edit to `docs/feature-parity.md` caused `pnpm verify:provenance` to fail with a drift error; the generated file was restored and verification passed.

### GREEN

- Focused tests: 10 passed, 0 failed.
- `pnpm verify:provenance`: passed and confirmed both generated reports current.
- `pnpm test`: passed all root and workspace tests.
- `pnpm typecheck`: passed all workspaces.
- `pnpm build`: passed. Existing Vite Rollup annotation and >500 kB chunk warnings remain.
- `git diff --check`: passed.
- `graphify update .`: completed; graph refreshed to 356 nodes / 516 edges.

## Scope and constraints

No upstream repository files were edited and no runtime MCP implementation was added. The provenance inventory does not claim unverified Official file-level licenses. mcp-use dependency-only records identify package names and are distinct from copied-source records.

## Fix round 1

### Addressed findings

- Enforced runtime allowlists for upstream, classification, and license values; exact lowercase 40-character commits; trimmed nonblank strings; normalized relative POSIX paths; valid package names; and classification-specific fields.
- Copied file and copied documentation records now require source/local paths, commit, classification, attribution, note, and a non-pending positive license.
- Verifier now requires exactly one pin record per upstream and independently checks every record's required commit/classification.
- Verifier runtime-validates parity IDs, feature/note text, aliases, status, owner phase, and source. It rejects duplicate IDs/coverage and enforces `blocked-license` for future Official runtime rows.
- Added an independent capability requirements fixture derived from the design and machine-readable aliases for grouped rows, including protocol/network, subscriptions/logging, Apps/schema, and stdio/Streamable HTTP/SSE.
- Expanded report tests to cover both drifted reports, missing reports, and read-only verification behavior.

### RED

Focused tests failed in 27 cases before implementation, covering missing IDs/aliases, permissive enum/path/license validation, duplicate/wrong upstream pins, invalid parity metadata, and missing capability coverage.

Manual probes also demonstrated the original expected failures after being made explicit: malformed records and duplicate pins were rejected, and drift in each report independently failed verification.

### GREEN

- Focused tests: 47 passed, 0 failed.
- `pnpm verify:provenance`: passed after deterministic regeneration.
- Malformed-record probe: rejected 7 invalid fields.
- Duplicate incompatible pin probe: rejected.
- `pnpm test`: passed.
- `pnpm typecheck`: passed.
- `pnpm build`: passed with existing Vite annotation and chunk-size warnings.
- `git diff --check`: passed.
- `graphify update .`: completed; graph refreshed to 379 nodes / 558 edges.
- Zero copied Official files, with future Official runtime still `blocked-license`.
