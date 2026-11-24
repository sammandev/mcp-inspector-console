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

Stop the command with `Ctrl+C`. On Windows, the runner uses `taskkill /t` to terminate each child process tree. On POSIX, children start in detached process groups; shutdown sends `SIGTERM` to each group, waits up to a bounded grace period, and escalates to `SIGKILL` before a second bounded wait. Child startup failures and exits also trigger cleanup and are propagated as failure.

The development gateway is local-only. It has no MCP session or external process-launch capability in Phase 0; it serves the existing health and placeholder control surfaces only. Remote binding is not enabled by this development command.

`pnpm verify:phase-0` runs unit and command-contract tests, recursive type checking, provenance verification, production builds, and Playwright browser smoke tests in that order. The build checks emitted web assets for the server-only gateway secret. Playwright starts an isolated stack through the same runner on gateway port `3101` and web port `4273`, then stops it.
