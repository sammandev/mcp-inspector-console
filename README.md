# Combined MCP Inspector

Standalone pnpm workspace for the combined MCP inspector implementation.

## Prerequisites

- Node.js >= 22.23.4
- pnpm 12.21.0

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

`pnpm dev` starts the gateway at `http://127.0.0.1:3001`, validates its public service/instance readiness identity, and only then starts Vite at `http://127.0.0.1:4173`. Each run generates a random ephemeral bearer token and non-secret instance ID in memory. The token is sent to the gateway and Vite's server process only; Vite injects it into its local `/gateway` proxy, and browser bundles never receive a `VITE_` token variable. Tokens and instance IDs are not printed or persisted.

Stop the command with `Ctrl+C`. On Windows, the runner uses a bounded `taskkill /t /f` and fails shutdown if that command fails, times out, or the process does not exit. On POSIX, children start in detached process groups; shutdown sends `SIGTERM`, waits only for the configured grace period, checks the group itself after a leader exits, escalates to `SIGKILL`, and verifies both leader exit and group absence after a second bounded wait. Surviving descendants or process-tree cleanup errors are fatal. Unexpected `SIGTERM`, `SIGINT`, or `SIGKILL` child exits are failures; only an explicitly requested runner shutdown is treated as successful. The gateway itself bounds request ingestion (default 1 MiB, configurable with `GATEWAY_MAX_REQUEST_BYTES`) and treats a graceful-close timeout as failure.

Vite's local `/gateway` proxy is browser-origin protected: requests carrying browser `Origin`, `Sec-Fetch-Site`, or `Sec-Fetch-Mode` metadata must identify the exact configured Vite origin and must not be `cross-site`. Same-origin browser calls are allowed. Local command-line tools that send no `Origin` or Fetch Metadata (for example, curl without an explicit Origin) are treated as non-browser tooling and continue to work. The gateway bearer token is injected only into the Vite server process and proxy request; it is never emitted into the browser bundle.

The development gateway is local-only. It has no MCP session or external process-launch capability in Phase 0; it serves the existing health and placeholder control surfaces only. Remote binding is not enabled by this development command.

`pnpm verify:phase-0` runs unit and command-contract tests, recursive type checking, provenance verification, production builds, and Playwright browser smoke tests in that order. The build checks emitted web assets for the server-only gateway secret. Playwright starts an isolated stack through the same runner on gateway port `3101` and web port `4273`, then stops it.
