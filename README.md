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

`pnpm dev` starts the local gateway on `127.0.0.1`, waits for its health endpoint, and then starts Vite. It generates a fresh ephemeral gateway token in memory for each run, passes that token to both processes, and never prints or persists it. Stop the command with `Ctrl+C`; the runner terminates the child process trees on Windows and POSIX systems.

The development gateway is local-only. It has no MCP session or external process-launch capability in Phase 0; it serves the existing health and placeholder control surfaces only. Remote binding is not enabled by this development command.

`pnpm verify:phase-0` runs the unit tests, recursive type checking, provenance verification, production builds, and Playwright browser smoke tests in that order. Playwright starts and stops its own isolated development stack through the same cross-platform runner.
