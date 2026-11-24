# Official feature integration

## Intent

Preserve the actual mcp-use Inspector experience and add the Official
Inspector's diagnostic and protocol workflows to the same connection.
The user requested all features, not placeholder menus or a second inspector.

## Approach

Maintain the pinned MIT-licensed mcp-use client source in this workspace.
Keep its existing providers, tabs, callbacks, layouts, and styles intact.
Add a native Inspector section with protocol, network, console, OAuth,
roots, tasks, completion, subscription/logging, schema/app conformance,
configuration, load testing, and automation workflows.

Rebuilding a shell solely from public components would discard unexported
workflows. Embedding another inspector would create a second connection and
would not preserve the requested UX. Neither alternative is selected.

The user was unavailable to select an approach. The source-fork approach is
the implementation decision, not an assertion of user approval.

## Boundaries

- No changes to either upstream clone.
- Pin mcp-use source to `8ff4b865e0e5712c66d5077e93392807daca9354`.
- Retain MIT attribution and record source-file checksums.
- Official revision `eb54b447e5377a7a18acaea9602fced5cb4c5b9f` is a behavioral
  reference only. Copy no Official Inspector code or documentation.
- New workflows use the selected mcp-use client's existing connector.
- Stdio requires a local relay. Launch only after an explicit user action;
  validate command/arguments/environment and close transports on shutdown.
- Preserve loopback, browser-origin, request-size, and telemetry safeguards.
- Keep the previous scaffold at `/workspace`.
- Node >=22.23.4; pnpm 12.21.0; Windows-safe commands.
- Report unsupported capabilities and protocol errors rather than invent
  successful results.

## Verification

Browser tests must exercise added menus against controlled MCP servers,
assert actual method calls/results, and preserve existing mcp-use workflows.
Tests must exercise local process lifecycle, missing capability failures,
redacted exports, invalid roots/configuration, bounded load tests, and
request cancellation. Run the complete workspace verification before
claiming parity. Record remaining gaps honestly in the parity catalog.
