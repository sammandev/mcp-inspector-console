# Graph Report - combined-mcp-inspector  (2026-11-24)

## Corpus Check
- 36 files · ~4,344 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 3 file(s) not represented in the graph (top: (none) 2, .css 1)

## Summary
- 264 nodes · 376 edges · 12 communities (11 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.95)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d78a1a59`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- types.ts
- web/package.json
- workspace-shape.test.mjs
- compilerOptions
- App.tsx
- package.json
- app.ts
- gateway/package.json
- inspector-contract/package.json
- consumer.ts
- pnpm-workspace.yaml
- Combined MCP Inspector

## God Nodes (most connected - your core abstractions)
1. `SessionOperations` - 10 edges
2. `compilerOptions` - 10 edges
3. `vitest` - 8 edges
4. `SessionDiagnostics` - 6 edges
5. `SessionLifecycle` - 6 edges
6. `App()` - 5 edges
7. `AppShell()` - 5 edges
8. `InspectorEvent` - 5 edges
9. `ConnectionProfile` - 5 edges
10. `createGatewayApp()` - 5 edges

## Surprising Connections (you probably didn't know these)
- `Task 1: Static shell behavior and verification` --references--> `UnifiedInspectorSession`  [INFERRED]
  docs/superpowers/plans/2026-11-24-task-5-shell.md → packages/inspector-contract/src/session.ts
- `GatewayVersion` --references--> `ConnectionProfile`  [EXTRACTED]
  apps/gateway/src/app.ts → packages/inspector-contract/src/types.ts
- `App()` --calls--> `AppShell()`  [EXTRACTED]
  apps/web/src/App.tsx → apps/web/src/components/AppShell.tsx
- `App()` --calls--> `FeaturePlaceholder()`  [EXTRACTED]
  apps/web/src/App.tsx → apps/web/src/components/FeaturePlaceholder.tsx
- `Destination` --references--> `PublishedExportName`  [EXTRACTED]
  apps/web/src/components/AppShell.tsx → apps/web/src/mcp-use-exports.ts

## Import Cycles
- None detected.

## Communities (12 total, 1 thin omitted)

### Community 0 - "types.ts"
Cohesion: 0.09
Nodes (24): SessionDiagnostics, SessionOperations, AuthState, ConnectionProfileBase, InspectorContent, JsonContent, JsonValue, PromptMessage (+16 more)

### Community 1 - "web/package.json"
Cohesion: 0.05
Nodes (52): dependencies, @base-ui/react@1.6.0, class-variance-authority@0.7.1, clsx@2.1.1, @combined-mcp-inspector/contract@workspace:*, lucide-react@0.562.0, markdown-to-jsx@9.7.4, @mcp-use/agent@2.0.27 (+44 more)

### Community 3 - "compilerOptions"
Cohesion: 0.07
Nodes (25): extends, include, compilerOptions, jsx, lib, types, extends, include (+17 more)

### Community 4 - "App.tsx"
Cohesion: 0.10
Nodes (20): react@19.2.3, react-dom@19.2.3, App(), ContractSessionCapability, destinations, offlineSession, AppShell(), AppShellProps (+12 more)

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

### Community 9 - "consumer.ts"
Cohesion: 0.11
Nodes (16): Global Constraints, Review Focus, Task 1: Static shell behavior and verification, Task 5 Shell Implementation Plan, SessionLifecycle, SessionSubscriptions, UnifiedInspectorSession, InspectorEvent (+8 more)

### Community 10 - "pnpm-workspace.yaml"
Cohesion: 0.40
Nodes (4): allowBuilds, esbuild, packages, pmOnFail

### Community 11 - "Combined MCP Inspector"
Cohesion: 0.50
Nodes (3): Combined MCP Inspector, Prerequisites, Workspace commands

## Knowledge Gaps
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `app.ts` to `consumer.ts`, `App.tsx`, `package.json`?**
  _High betweenness centrality (0.203) - this node is a cross-community bridge._
- **Should `types.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09206349206349207 - nodes in this community are weakly interconnected._
- **Why does `react` connect `App.tsx` to `web/package.json`?**
  _High betweenness centrality (0.126) - this node is a cross-community bridge._
- **Should `web/package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.05117845117845118 - nodes in this community are weakly interconnected._
- **Why does `hono` connect `gateway/package.json` to `app.ts`?**
  _High betweenness centrality (0.096) - this node is a cross-community bridge._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.06666666666666667 - nodes in this community are weakly interconnected._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.09848484848484848 - nodes in this community are weakly interconnected._