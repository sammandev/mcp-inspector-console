# Graph Report - combined-mcp-inspector  (2026-11-24)

## Corpus Check
- 37 files · ~5,173 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 3 file(s) not represented in the graph (top: (none) 2, .css 1)

## Summary
- 279 nodes · 405 edges · 19 communities (14 shown, 5 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ae3a1f47`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- types.ts
- dependencies
- devDependencies
- compilerOptions
- App.tsx
- package.json
- app.ts
- gateway/package.json
- inspector-contract/package.json
- web/package.json
- pnpm-workspace.yaml
- Combined MCP Inspector
- @tailwindcss/vite
- scripts
- tailwindcss
- @combined-mcp-inspector/contract@workspace:*
- lucide-react
- motion@12.34.2
- sonner@2.0.7

## God Nodes (most connected - your core abstractions)
1. `SessionOperations` - 10 edges
2. `compilerOptions` - 10 edges
3. `vitest` - 8 edges
4. `react` - 6 edges
5. `useProviderTheme()` - 6 edges
6. `SessionLifecycle` - 6 edges
7. `SessionDiagnostics` - 6 edges
8. `createGatewayApp()` - 5 edges
9. `createGatewayConfig()` - 5 edges
10. `App()` - 5 edges

## Surprising Connections (you probably didn't know these)
- `Task 1: Static shell behavior and verification` --references--> `UnifiedInspectorSession`  [INFERRED]
  docs/superpowers/plans/2026-11-24-task-5-shell.md → packages/inspector-contract/src/session.ts
- `GatewayVersion` --references--> `ConnectionProfile`  [EXTRACTED]
  apps/gateway/src/app.ts → packages/inspector-contract/src/types.ts
- `authenticatedApp()` --calls--> `createGatewayApp()`  [EXTRACTED]
  apps/gateway/src/app.test.ts → apps/gateway/src/app.ts
- `authenticatedApp()` --calls--> `createGatewayConfig()`  [EXTRACTED]
  apps/gateway/src/app.test.ts → apps/gateway/src/config.ts
- `App()` --calls--> `AppShell()`  [EXTRACTED]
  apps/web/src/App.tsx → apps/web/src/components/AppShell.tsx

## Import Cycles
- None detected.

## Communities (19 total, 5 thin omitted)

### Community 0 - "types.ts"
Cohesion: 0.06
Nodes (40): Global Constraints, Review Focus, Task 1: Static shell behavior and verification, Task 5 Shell Implementation Plan, SessionDiagnostics, SessionLifecycle, SessionOperations, SessionSubscriptions (+32 more)

### Community 1 - "dependencies"
Cohesion: 0.12
Nodes (17): dependencies, @base-ui/react@1.6.0, class-variance-authority@0.7.1, markdown-to-jsx@9.7.4, @mcp-use/agent@2.0.27, @mcp-use/client@2.4.6, @mcp-use/inspector@20.3.33, react-resizable-panels@4.6.4 (+9 more)

### Community 2 - "devDependencies"
Cohesion: 0.15
Nodes (13): devDependencies, jsdom@27.0.0, @testing-library/react@16.3.2, @testing-library/user-event@14.6.1, @types/node@24.10.1, @types/react@19.2.14, @types/react-dom@19.2.3, @types/node (+5 more)

### Community 3 - "compilerOptions"
Cohesion: 0.07
Nodes (25): extends, include, compilerOptions, jsx, lib, types, extends, include (+17 more)

### Community 4 - "App.tsx"
Cohesion: 0.07
Nodes (27): react@19.2.3, App(), ContractSessionCapability, destinations, offlineSession, storage, stored, AppShell() (+19 more)

### Community 5 - "package.json"
Cohesion: 0.10
Nodes (18): destinations, devDependencies, @playwright/test@1.65.1, typescript@5.9.3, vitest@4.1.12, engines, node, name (+10 more)

### Community 6 - "app.ts"
Cohesion: 0.18
Nodes (13): bearerTokenMatches(), createGatewayApp(), GatewayVersion, authenticatedApp(), VERSION, createGatewayConfig(), GatewayConfig, GatewayEnvironment (+5 more)

### Community 7 - "gateway/package.json"
Cohesion: 0.13
Nodes (17): dependencies, @combined-mcp-inspector/contract@workspace:*, hono@4.10.6, devDependencies, @types/node@24.10.1, engines, node, @combined-mcp-inspector/contract (+9 more)

### Community 8 - "inspector-contract/package.json"
Cohesion: 0.15
Nodes (12): engines, node, exports, name, private, scripts, test, test:consumer (+4 more)

### Community 9 - "web/package.json"
Cohesion: 0.18
Nodes (10): clsx@2.1.1, react-dom@19.2.3, engines, node, name, private, type, version (+2 more)

### Community 10 - "pnpm-workspace.yaml"
Cohesion: 0.40
Nodes (4): allowBuilds, esbuild, packages, pmOnFail

### Community 11 - "Combined MCP Inspector"
Cohesion: 0.50
Nodes (3): Combined MCP Inspector, Prerequisites, Workspace commands

### Community 12 - "@tailwindcss/vite"
Cohesion: 0.29
Nodes (6): @tailwindcss/vite@4.2.0, vite@7.3.1, @vitejs/plugin-react@5.0.4, @tailwindcss/vite, vite, @vitejs/plugin-react

### Community 13 - "scripts"
Cohesion: 0.50
Nodes (4): scripts, build, test, typecheck

## Knowledge Gaps
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `app.ts` to `types.ts`, `App.tsx`, `package.json`?**
  _High betweenness centrality (0.192) - this node is a cross-community bridge._
- **Should `types.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05649717514124294 - nodes in this community are weakly interconnected._
- **Why does `react` connect `App.tsx` to `web/package.json`?**
  _High betweenness centrality (0.126) - this node is a cross-community bridge._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.11764705882352941 - nodes in this community are weakly interconnected._
- **Why does `hono` connect `gateway/package.json` to `app.ts`?**
  _High betweenness centrality (0.092) - this node is a cross-community bridge._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.06666666666666667 - nodes in this community are weakly interconnected._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.07399577167019028 - nodes in this community are weakly interconnected._