# Combined MCP Inspector

Standalone pnpm workspace for a combined MCP Inspector. It serves the mcp-use
Inspector UI/UX at `/mcp/inspector` and integrates Official MCP Inspector
workflows into four focused destinations in the same interface and styling.
The original workspace scaffold remains at `/workspace`.

The four additional destinations share the native menu icons, compact sticky
headers (with a divider only after scrolling), and bordered settings sections.
RPC tabs, source filters, and expanded log rows use theme-aware highlights and
keyboard-focus indicators. The command palette retains documentation and
navigation commands but omits website and Discord promotion entries. The top
header provides a search box that opens the command palette and a one-click
Light/Dark theme toggle (dark by default). "Add to Client" and the Command Palette's "Open in OpenCode" provide an
`opencode mcp add` command; the Add to Client dialog also shows the equivalent `opencode.json` snippet.

## What is included

- **Native mcp-use workflows:** tools, prompts, resources, chat, skills, MCP
  Apps and widgets, sampling, elicitation, notifications, saved requests,
  history, multi-server navigation, and themes. They remain the foundation of
  the UI. The attributed fork of the MIT mcp-use Inspector client is in
  `apps/web/vendor/mcp-use`; modified source files are listed in its manifest
  and marked `Modified for the combined Inspector:`.
- **Protocol:** raw and batched JSON-RPC requests, pagination, filterable
  traffic and request history, plus redacted Network and Console diagnostics.
  Protocol rows pair each request with its status, duration, parameters, and
  response; Network rows record the URL, HTTP status, timing, and redacted
  request/response headers and bodies (`mcp-protocol-version`,
  `mcp-session-id`, and so on). The RPC panel, toggled from the header beside
  Sign in and resizable by dragging its left edge, offers the same Protocol and
  Network views, and every log can be exported as JSON.
- **Auth:** protected-resource and authorization-server discovery,
  authentication actions, masked tokens and JWT claims, and token revocation.
- **Client:** validated Roots and Tasks workflows on the selected connection.
- **Diagnostics:** local sessions and stderr, redacted configuration import and
  export, explicit stdio launch with `cwd`, a gated ping load test, and CLI
  automation.
- **Native-tab integrations:** Tools includes run history, replay/edit/diff,
  output validation, schema lint, MCP App metadata checks, and a per-tool
  **Load test** (concurrency, rate, duration or request count, warm-up,
  stepped stages, weighted multi-call scenarios, latency percentiles, error
  breakdowns, and JSON export) that runs inside the result panel; Prompts and Resources
  provide contextual completions; Resources owns subscriptions; Notifications
  owns log filtering, `logging/setLevel`, and export; Skills supports
  verification; Connection Settings and Server Metadata remain canonical for
  server-specific options and server identity/diagnostics. Network log limits
  are scoped by the selected server URL. The Dashboard remains the sole
  server-management surface.
- These workflows are reimplemented with the MCP SDK on the selected mcp-use
  connection; no Official Inspector code is copied.
- **Not reimplemented:** Official transport-level options that the mcp-use
  connector does not expose: a cookie jar, suppressing the notification
  stream, enterprise IdP/step-up authorization, OAuth endpoint overrides,
  per-request log levels and server reordering. Request `_meta` can be sent in
  Protocol params, and mcp-use refreshes lists on `list_changed` itself.
- **stdio servers:** import a configuration with a `command` profile in
  Diagnostics and launch it explicitly. A loopback-only relay at
  `/mcp/inspector/api/local` spawns the process (at most 8 at a time) and
  bridges it to the mcp-use client. Only launch commands you trust.
- **CLI:** `pnpm inspect` runs MCP methods headlessly for scripts and CI.

## CLI

```text
pnpm inspect --url http://localhost:3000/mcp --method tools/list
pnpm inspect --config mcp.json --server audit --method tools/list
pnpm inspect --url http://localhost:3000/mcp --method ping --expect "{}"
pnpm inspect --config mcp.json --list-servers
pnpm inspect --url http://localhost:3000/mcp --method tools/list --format text --output-file tools.txt
pnpm inspect --url http://localhost:3000/mcp --method ping --load 50 --concurrency 5 --max-p95-ms 200 --max-failures 0
```

Configuration files accept JSON or YAML with an `mcpServers` mapping of
HTTP profiles (`url`, optional `headers`) or stdio profiles (`command`,
optional `args`, `env` and `cwd`), or a VS Code `servers` mapping. Keep credentials in local configuration files
rather than shell history. CLI requests time out after 30 seconds, redact
credential fields in output, close the client, and exit nonzero on errors
or an unmet exact-JSON assertion. `--transport sse` selects legacy SSE.

## Prerequisites

- Node.js ^22.23.4, ^24.15.0, or >= 26.0.0
- pnpm 12.23.0

## Workspace commands

The commands below work in Windows PowerShell, Command Prompt, and POSIX shells without shell-specific syntax:

```text
pnpm dev
pnpm test
pnpm typecheck
pnpm build
pnpm test:e2e
pnpm verify:provenance
pnpm verify:phase-0
```

`pnpm dev` starts the gateway at `http://127.0.0.1:3001`, validates its public service/instance readiness identity, and only then starts Vite at `http://127.0.0.1:4173`. Open [the Inspector](http://127.0.0.1:4173/mcp/inspector); the root URL redirects there. To connect to the example server from another mcp-use project, open:

```text
http://127.0.0.1:4173/mcp/inspector?server=http%3A%2F%2Flocalhost%3A3000%2Fmcp
```

If startup reports `EADDRINUSE`, a process already owns the requested port.
Stop an old development run with `Ctrl+C` in its original terminal, or choose
unused ports for a separate run. In PowerShell:

```powershell
$env:DEV_GATEWAY_PORT = "3101"
$env:DEV_WEB_PORT = "4273"
pnpm dev
```

With those settings, open `http://127.0.0.1:4273/mcp/inspector`. Remove the
two environment variables to restore the defaults. Restart development
servers after dependency updates so they load the newly installed packages.

Without a `server` parameter, no default server is configured. The Inspector
can still restore connections saved in browser storage. Select a connected
server and open **Protocol**, **Auth**, **Client**, or **Diagnostics** for the
cross-cutting workflows; `?tab=inspector` remains an alias for **Protocol**.
Features requiring a provider, server capability, or other service still need
that service to be configured.

The local Inspector proxy supports the upstream HTTP and SSE workflows, rejects
cross-origin API requests, and limits API request bodies to 1 MiB by default
(`GATEWAY_MAX_REQUEST_BYTES` can change the limit). Its API is restricted to
loopback requests; the upstream MCP Apps sandbox uses the alternate loopback
hostname for isolation. Anonymous mcp-use telemetry is disabled. The upstream
interface may request Google Fonts, and user-configured connections and AI
providers can make network requests.

The Inspector uses the forked mcp-use client, the upstream mcp-use proxy, and
the local stdio relay; see [feature parity](docs/feature-parity.md) and
[upstream provenance](docs/upstream-provenance.md). The upstream Start
Tunnel control requires an `mcp-use dev` server and is unavailable in this
standalone mount. The fork omits the upstream manufact.com deployment promo,
the GitHub/Discord sidebar links, and the header Deploy button. The previous
offline scaffold is at
`http://127.0.0.1:4173/workspace`.

Each development run generates a random ephemeral gateway bearer token and
non-secret instance ID in memory. The token is sent to the gateway and Vite's
server process only; Vite injects it into its local `/gateway` proxy, and
browser bundles never receive a `VITE_` token variable. Tokens and instance
IDs are not printed or persisted.

Stop the command with `Ctrl+C`. On Windows, the runner uses a bounded `taskkill /t /f` and fails shutdown if that command fails, times out, or the process does not exit. On POSIX, children start in detached process groups; shutdown sends `SIGTERM`, waits only for the configured grace period, checks the group itself after a leader exits, escalates to `SIGKILL`, and verifies both leader exit and group absence after a second bounded wait. Surviving descendants or process-tree cleanup errors are fatal. Unexpected `SIGTERM`, `SIGINT`, or `SIGKILL` child exits are failures; only an explicitly requested runner shutdown is treated as successful. The gateway itself bounds request ingestion (default 1 MiB, configurable with `GATEWAY_MAX_REQUEST_BYTES`) and treats a graceful-close timeout as failure.

Vite's local `/gateway` proxy is browser-origin protected: requests carrying browser `Origin`, `Sec-Fetch-Site`, or `Sec-Fetch-Mode` metadata must identify the exact configured Vite origin and must not be `cross-site`. Same-origin browser calls are allowed. Local command-line tools that send no `Origin` or Fetch Metadata (for example, curl without an explicit Origin) are treated as non-browser tooling and continue to work. The gateway bearer token is injected only into the Vite server process and proxy request; it is never emitted into the browser bundle.

The development gateway is local-only and serves the existing health and placeholder control surfaces of the `/workspace` scaffold; MCP stdio processes are launched by the Inspector's local relay, not the gateway. Remote binding is not enabled by this development command.

`pnpm build` builds a single `index.html` entry that loads the Inspector under
`/mcp/inspector` and the scaffold elsewhere. The Inspector's proxy, OAuth,
sandbox, and stdio relay are served by Vite server middleware and need a
Node.js server; serving the static `dist` directory alone does not provide
them. To check the
built assets together with the mounted Inspector locally, run:

```text
pnpm --filter @combined-mcp-inspector/web exec vite preview --host 127.0.0.1
```

Vite preview is for local verification, not production deployment.

`pnpm verify:phase-0` runs unit and command-contract tests, recursive type checking, provenance verification, production builds, and Playwright browser smoke tests in that order. The build checks emitted web assets for the server-only gateway secret. Playwright starts an isolated stack through the same runner on gateway port `3101` and web port `4273`, then stops it.
