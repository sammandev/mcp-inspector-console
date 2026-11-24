# Graph Report - combined-mcp-inspector  (2026-11-24)

## Corpus Check
- 69 files · ~15,258 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 3 file(s) not represented in the graph (top: (none) 2, .css 1)

## Summary
- 489 nodes · 794 edges · 26 communities (21 shown, 5 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `1552778a`
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
- consumer.ts
- dev-runner.mjs
- verifier.ts
- feature-parity/package.json
- upstream-manifest/package.json
- Third-party notices
- Feature parity
- class-variance-authority@0.7.1
- Task 6 report: parity and provenance inventories
- @mcp-use/client@2.4.6
- react-resizable-panels@4.6.4
- upstream-provenance.md

## God Nodes (most connected - your core abstractions)
1. `InspectorResult` - 32 edges
2. `SessionOperations` - 28 edges
3. `vitest` - 14 edges
4. `compilerOptions` - 10 edges
5. `scripts` - 9 edges
6. `JsonValue` - 8 edges
7. `runDev()` - 8 edges
8. `createGatewayApp()` - 7 edges
9. `createGatewayConfig()` - 7 edges
10. `validateManifest()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `Task 1: Static shell behavior and verification` --references--> `UnifiedInspectorSession`  [INFERRED]
  docs/superpowers/plans/2026-11-24-task-5-shell.md → packages/inspector-contract/src/session.ts
- `GatewayVersion` --references--> `ConnectionProfile`  [EXTRACTED]
  apps/gateway/src/app.ts → packages/inspector-contract/src/types.ts
- `reportsFor()` --calls--> `generateReports()`  [EXTRACTED]
  packages/upstream-manifest/src/verifier.test.ts → packages/upstream-manifest/src/verifier.ts
- `authenticatedApp()` --calls--> `createGatewayApp()`  [EXTRACTED]
  apps/gateway/src/app.test.ts → apps/gateway/src/app.ts
- `authenticatedApp()` --calls--> `createGatewayConfig()`  [EXTRACTED]
  apps/gateway/src/app.test.ts → apps/gateway/src/config.ts

## Import Cycles
- None detected.

## Communities (26 total, 5 thin omitted)

### Community 0 - "types.ts"
Cohesion: 0.07
Nodes (37): SessionLifecycle, SessionOperations, ApprovalResult, AuthState, BackendSecretFields, CompletionResult, ConnectionProfileBase, DiagnosticBundle (+29 more)

### Community 1 - "dependencies"
Cohesion: 0.11
Nodes (18): dependencies, clsx@2.1.1, @combined-mcp-inspector/contract@workspace:*, markdown-to-jsx@9.7.4, @mcp-use/agent@2.0.27, @mcp-use/inspector@20.3.33, motion@12.34.2, react@19.2.3 (+10 more)

### Community 2 - "devDependencies"
Cohesion: 0.12
Nodes (15): devDependencies, jsdom@27.0.0, tailwindcss@4.2.0, @testing-library/react@16.3.2, @testing-library/user-event@14.6.1, @types/node@24.10.1, @types/react@19.2.14, @types/react-dom@19.2.3 (+7 more)

### Community 3 - "compilerOptions"
Cohesion: 0.04
Nodes (38): compilerOptions, noEmit, outDir, rootDir, exclude, extends, include, extends (+30 more)

### Community 4 - "App.tsx"
Cohesion: 0.09
Nodes (25): App(), ContractSessionCapability, destinations, offlineSession, storage, stored, AppShell(), AppShellProps (+17 more)

### Community 5 - "package.json"
Cohesion: 0.08
Nodes (24): destinations, devDependencies, @playwright/test@1.65.1, @types/node@24.10.13, typescript@5.9.3, vitest@4.1.12, engines, node (+16 more)

### Community 6 - "app.ts"
Cohesion: 0.13
Nodes (19): bearerTokenMatches(), createGatewayApp(), authenticatedApp(), VERSION, createGatewayConfig(), GatewayConfig, GatewayEnvironment, LOOPBACK_HOSTS (+11 more)

### Community 7 - "gateway/package.json"
Cohesion: 0.12
Nodes (19): dependencies, @combined-mcp-inspector/contract@workspace:*, hono@4.10.6, devDependencies, @types/node@24.10.1, engines, node, @combined-mcp-inspector/contract (+11 more)

### Community 8 - "inspector-contract/package.json"
Cohesion: 0.15
Nodes (12): engines, node, exports, name, private, scripts, test, test:consumer (+4 more)

### Community 9 - "web/package.json"
Cohesion: 0.15
Nodes (12): @base-ui/react@1.6.0, lucide-react@0.562.0, sonner@2.0.7, engines, node, name, private, type (+4 more)

### Community 10 - "pnpm-workspace.yaml"
Cohesion: 0.40
Nodes (4): allowBuilds, esbuild, packages, pmOnFail

### Community 11 - "Combined MCP Inspector"
Cohesion: 0.50
Nodes (3): Combined MCP Inspector, Prerequisites, Workspace commands

### Community 12 - "@tailwindcss/vite"
Cohesion: 0.24
Nodes (8): @tailwindcss/vite@4.2.0, vite@7.3.1, @vitejs/plugin-react@5.0.4, configureServer(), gatewayProxyRequestPolicy(), @tailwindcss/vite, vite, @vitejs/plugin-react

### Community 13 - "scripts"
Cohesion: 0.40
Nodes (5): scripts, build, dev, test, typecheck

### Community 14 - "consumer.ts"
Cohesion: 0.08
Nodes (28): GatewayVersion, Global Constraints, Review Focus, Task 1: Static shell behavior and verification, Task 5 Shell Implementation Plan, redactConnectionProfile(), redactValue(), sanitizeUrl() (+20 more)

### Community 15 - "dev-runner.mjs"
Cohesion: 0.08
Nodes (16): files(), assertion, env, result, defaultAdapter(), defaultTaskkill(), defaultWaitForExit(), hasExited() (+8 more)

### Community 16 - "verifier.ts"
Cohesion: 0.08
Nodes (38): FeatureSource, featureSources, OwnerPhase, ownerPhases, parityCatalog, ParityItem, ParityStatus, parityStatuses (+30 more)

### Community 17 - "feature-parity/package.json"
Cohesion: 0.17
Nodes (11): engines, node, exports, name, private, scripts, test, typecheck (+3 more)

### Community 18 - "upstream-manifest/package.json"
Cohesion: 0.17
Nodes (11): engines, node, exports, name, private, scripts, test, typecheck (+3 more)

### Community 19 - "Third-party notices"
Cohesion: 0.50
Nodes (3): mcp-use packages (MIT), Official MCP Inspector, Third-party notices

### Community 22 - "Task 6 report: parity and provenance inventories"
Cohesion: 0.18
Nodes (10): Addressed findings, Fix round 1, GREEN, GREEN, Implemented, RED, RED, Scope and constraints (+2 more)

## Knowledge Gaps
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `app.ts` to `App.tsx`, `package.json`, `@tailwindcss/vite`, `consumer.ts`, `verifier.ts`?**
  _High betweenness centrality (0.226) - this node is a cross-community bridge._
- **Should `types.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06693803708729082 - nodes in this community are weakly interconnected._
- **Why does `hono` connect `gateway/package.json` to `app.ts`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.1111111111111111 - nodes in this community are weakly interconnected._
- **Why does `react` connect `App.tsx` to `web/package.json`, `dependencies`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.125 - nodes in this community are weakly interconnected._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.043478260869565216 - nodes in this community are weakly interconnected._