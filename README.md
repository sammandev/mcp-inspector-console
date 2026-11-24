# Combined MCP Inspector

Standalone pnpm workspace for the combined MCP inspector implementation.

## Prerequisites

- Node.js >= 22.23.4
- pnpm 12.21.0

## Workspace commands

```text
pnpm test
pnpm typecheck
pnpm build
pnpm dev
```

The commands use recursive pnpm workspace scripts. Individual applications and packages are added under `apps/` and `packages/` in later phases.
