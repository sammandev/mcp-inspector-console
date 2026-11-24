# Graph Report - combined-mcp-inspector  (2026-11-24)

## Corpus Check
- 59 files · ~10,722 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 3 file(s) not represented in the graph (top: (none) 2, .css 1)

## Summary
- 414 nodes · 598 edges · 29 communities (22 shown, 7 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `6844eef2`
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
- validate.ts
- dev.mjs
- verifier.ts
- feature-parity/package.json
- upstream-manifest/package.json
- Third-party notices
- Feature parity
- Task 5 Shell Implementation Plan
- Task 6 report: parity and provenance inventories
- @combined-mcp-inspector/contract@workspace:*
- react-resizable-panels@4.6.4
- upstream-provenance.md
- @mcp-use/inspector
- motion@12.34.2
- sonner@2.0.7

## God Nodes (most connected - your core abstractions)
1. `vitest` - 11 edges
2. `SessionOperations` - 10 edges
3. `compilerOptions` - 10 edges
4. `scripts` - 9 edges
5. `validateManifest()` - 7 edges
6. `generateReports()` - 7 edges
7. `react` - 6 edges
8. `useProviderTheme()` - 6 edges
9. `SessionLifecycle` - 6 edges
10. `SessionDiagnostics` - 6 edges

## Surprising Connections (you probably didn't know these)
- `Task 1: Static shell behavior and verification` --references--> `UnifiedInspectorSession`  [INFERRED]
  docs/superpowers/plans/2026-11-24-task-5-shell.md → packages/inspector-contract/src/session.ts
- `GatewayVersion` --references--> `ConnectionProfile`  [EXTRACTED]
  apps/gateway/src/app.ts → packages/inspector-contract/src/types.ts
- `validateInventories()` --calls--> `validateManifest()`  [EXTRACTED]
  packages/upstream-manifest/src/verifier.ts → packages/upstream-manifest/src/validate.ts
- `reportsFor()` --calls--> `generateReports()`  [EXTRACTED]
  packages/upstream-manifest/src/verifier.test.ts → packages/upstream-manifest/src/verifier.ts
- `authenticatedApp()` --calls--> `createGatewayApp()`  [EXTRACTED]
  apps/gateway/src/app.test.ts → apps/gateway/src/app.ts

## Import Cycles
- None detected.

## Communities (29 total, 7 thin omitted)

### Community 0 - "types.ts"
Cohesion: 0.06
Nodes (39): GatewayVersion, Task 1: Static shell behavior and verification, SessionDiagnostics, SessionLifecycle, SessionOperations, SessionSubscriptions, UnifiedInspectorSession, AuthState (+31 more)

### Community 1 - "dependencies"
Cohesion: 0.12
Nodes (16): dependencies, @base-ui/react@1.6.0, class-variance-authority@0.7.1, clsx@2.1.1, lucide-react@0.562.0, markdown-to-jsx@9.7.4, @mcp-use/agent@2.0.27, @mcp-use/client@2.4.6 (+8 more)

### Community 2 - "devDependencies"
Cohesion: 0.12
Nodes (15): devDependencies, jsdom@27.0.0, tailwindcss@4.2.0, @testing-library/react@16.3.2, @testing-library/user-event@14.6.1, @types/node@24.10.1, @types/react@19.2.14, @types/react-dom@19.2.3 (+7 more)

### Community 3 - "compilerOptions"
Cohesion: 0.04
Nodes (38): compilerOptions, noEmit, outDir, rootDir, exclude, extends, include, extends (+30 more)

### Community 4 - "App.tsx"
Cohesion: 0.11
Nodes (24): App(), ContractSessionCapability, destinations, offlineSession, storage, stored, AppShell(), AppShellProps (+16 more)

### Community 5 - "package.json"
Cohesion: 0.08
Nodes (24): destinations, devDependencies, @playwright/test@1.65.1, @types/node@24.10.13, typescript@5.9.3, vitest@4.1.12, engines, node (+16 more)

### Community 6 - "app.ts"
Cohesion: 0.16
Nodes (13): bearerTokenMatches(), createGatewayApp(), authenticatedApp(), VERSION, createGatewayConfig(), GatewayConfig, GatewayEnvironment, LOOPBACK_HOSTS (+5 more)

### Community 7 - "gateway/package.json"
Cohesion: 0.12
Nodes (19): dependencies, @combined-mcp-inspector/contract@workspace:*, hono@4.10.6, devDependencies, @types/node@24.10.1, engines, node, @combined-mcp-inspector/contract (+11 more)

### Community 8 - "inspector-contract/package.json"
Cohesion: 0.15
Nodes (12): engines, node, exports, name, private, scripts, test, test:consumer (+4 more)

### Community 9 - "web/package.json"
Cohesion: 0.18
Nodes (10): react-dom@19.2.3, tailwind-merge@3.5.0, engines, node, name, private, type, version (+2 more)

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
Cohesion: 0.40
Nodes (5): scripts, build, dev, test, typecheck

### Community 14 - "validate.ts"
Cohesion: 0.17
Nodes (17): upstreamManifest, LicenseClassification, SourceClassification, Upstream, UpstreamRecord, ValidationError, classificationAllowlist, copiedFields (+9 more)

### Community 15 - "dev.mjs"
Cohesion: 0.21
Nodes (8): children, exitCode(), gateway, start(), startWeb(), stop(), token, watch()

### Community 16 - "verifier.ts"
Cohesion: 0.09
Nodes (23): expectedExports, FeatureSource, featureSources, OwnerPhase, ownerPhases, parityCatalog, ParityItem, ParityStatus (+15 more)

### Community 17 - "feature-parity/package.json"
Cohesion: 0.17
Nodes (11): engines, node, exports, name, private, scripts, test, typecheck (+3 more)

### Community 18 - "upstream-manifest/package.json"
Cohesion: 0.17
Nodes (11): engines, node, exports, name, private, scripts, test, typecheck (+3 more)

### Community 19 - "Third-party notices"
Cohesion: 0.50
Nodes (3): mcp-use packages (MIT), Official MCP Inspector, Third-party notices

### Community 21 - "Task 5 Shell Implementation Plan"
Cohesion: 0.50
Nodes (3): Global Constraints, Review Focus, Task 5 Shell Implementation Plan

### Community 22 - "Task 6 report: parity and provenance inventories"
Cohesion: 0.18
Nodes (10): Addressed findings, Fix round 1, GREEN, GREEN, Implemented, RED, RED, Scope and constraints (+2 more)

## Knowledge Gaps
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `app.ts` to `types.ts`, `App.tsx`, `package.json`, `validate.ts`, `verifier.ts`?**
  _High betweenness centrality (0.222) - this node is a cross-community bridge._
- **Should `types.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.060496067755595885 - nodes in this community are weakly interconnected._
- **Why does `react` connect `App.tsx` to `web/package.json`, `dependencies`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.125 - nodes in this community are weakly interconnected._
- **Why does `hono` connect `gateway/package.json` to `app.ts`?**
  _High betweenness centrality (0.063) - this node is a cross-community bridge._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.125 - nodes in this community are weakly interconnected._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.043478260869565216 - nodes in this community are weakly interconnected._