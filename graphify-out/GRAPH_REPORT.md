# Graph Report - combined-mcp-inspector  (2026-11-24)

## Corpus Check
- 53 files · ~8,336 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 3 file(s) not represented in the graph (top: (none) 2, .css 1)

## Summary
- 356 nodes · 516 edges · 26 communities (18 shown, 8 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `27ed25d3`
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
- verifier.ts
- feature-parity/package.json
- upstream-manifest/package.json
- Third-party notices
- Feature parity
- class-variance-authority@0.7.1
- @mcp-use/agent@2.0.27
- react-dom
- react-resizable-panels@4.6.4
- upstream-provenance.md

## God Nodes (most connected - your core abstractions)
1. `vitest` - 11 edges
2. `SessionOperations` - 10 edges
3. `compilerOptions` - 10 edges
4. `scripts` - 7 edges
5. `react` - 6 edges
6. `useProviderTheme()` - 6 edges
7. `SessionLifecycle` - 6 edges
8. `SessionDiagnostics` - 6 edges
9. `generateReports()` - 6 edges
10. `createGatewayApp()` - 5 edges

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

## Communities (26 total, 8 thin omitted)

### Community 0 - "types.ts"
Cohesion: 0.06
Nodes (40): Global Constraints, Review Focus, Task 1: Static shell behavior and verification, Task 5 Shell Implementation Plan, SessionDiagnostics, SessionLifecycle, SessionOperations, SessionSubscriptions (+32 more)

### Community 1 - "dependencies"
Cohesion: 0.12
Nodes (16): dependencies, @base-ui/react@1.6.0, clsx@2.1.1, lucide-react@0.562.0, markdown-to-jsx@9.7.4, @mcp-use/inspector@20.3.33, react@19.2.3, sonner@2.0.7 (+8 more)

### Community 2 - "devDependencies"
Cohesion: 0.15
Nodes (13): devDependencies, jsdom@27.0.0, @testing-library/react@16.3.2, @testing-library/user-event@14.6.1, @types/node@24.10.1, @types/react@19.2.14, @types/react-dom@19.2.3, @types/node (+5 more)

### Community 3 - "compilerOptions"
Cohesion: 0.05
Nodes (31): extends, include, compilerOptions, jsx, lib, types, extends, include (+23 more)

### Community 4 - "App.tsx"
Cohesion: 0.09
Nodes (25): App(), ContractSessionCapability, destinations, offlineSession, storage, stored, AppShell(), AppShellProps (+17 more)

### Community 5 - "package.json"
Cohesion: 0.08
Nodes (23): destinations, devDependencies, @playwright/test@1.65.1, @types/node@24.10.13, typescript@5.9.3, vitest@4.1.12, engines, node (+15 more)

### Community 6 - "app.ts"
Cohesion: 0.20
Nodes (12): bearerTokenMatches(), createGatewayApp(), GatewayVersion, authenticatedApp(), VERSION, createGatewayConfig(), GatewayConfig, GatewayEnvironment (+4 more)

### Community 7 - "gateway/package.json"
Cohesion: 0.13
Nodes (17): dependencies, @combined-mcp-inspector/contract@workspace:*, hono@4.10.6, devDependencies, @types/node@24.10.1, engines, node, @combined-mcp-inspector/contract (+9 more)

### Community 8 - "inspector-contract/package.json"
Cohesion: 0.15
Nodes (12): engines, node, exports, name, private, scripts, test, test:consumer (+4 more)

### Community 9 - "web/package.json"
Cohesion: 0.18
Nodes (10): @mcp-use/client@2.4.6, motion@12.34.2, engines, node, name, private, type, version (+2 more)

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

### Community 16 - "verifier.ts"
Cohesion: 0.10
Nodes (24): FeatureSource, OwnerPhase, parityCatalog, ParityItem, ParityStatus, parityStatuses, expectedFeatures, upstreamManifest (+16 more)

### Community 17 - "feature-parity/package.json"
Cohesion: 0.17
Nodes (11): engines, node, exports, name, private, scripts, test, typecheck (+3 more)

### Community 18 - "upstream-manifest/package.json"
Cohesion: 0.17
Nodes (11): engines, node, exports, name, private, scripts, test, typecheck (+3 more)

### Community 19 - "Third-party notices"
Cohesion: 0.50
Nodes (3): mcp-use packages (MIT), Official MCP Inspector, Third-party notices

## Knowledge Gaps
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `package.json` to `verifier.ts`, `types.ts`, `App.tsx`, `app.ts`?**
  _High betweenness centrality (0.216) - this node is a cross-community bridge._
- **Should `types.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05649717514124294 - nodes in this community are weakly interconnected._
- **Why does `react` connect `App.tsx` to `web/package.json`, `dependencies`?**
  _High betweenness centrality (0.078) - this node is a cross-community bridge._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.125 - nodes in this community are weakly interconnected._
- **Why does `hono` connect `gateway/package.json` to `app.ts`?**
  _High betweenness centrality (0.066) - this node is a cross-community bridge._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.05263157894736842 - nodes in this community are weakly interconnected._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.0945945945945946 - nodes in this community are weakly interconnected._