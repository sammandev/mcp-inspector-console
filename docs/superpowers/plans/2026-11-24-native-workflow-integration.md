# Native mcp-use Workflow Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Official Inspector workflows into the native mcp-use tabs and replace the 20-item nested Inspector menu with four focused top-level destinations.

**Architecture:** Keep mcp-use's selected server, state, and visual components authoritative. Extend native Tools, Prompts, Resources, Skills, Notifications, Connection Settings, and Server Metadata views; add Protocol, Auth, Client, and Diagnostics destinations for cross-cutting operations. Maintain existing request semantics and compatibility with `?tab=inspector`.

**Tech Stack:** React 19, TypeScript, mcp-use client fork, MCP SDK, Vitest, Playwright, pnpm.

**Spec:** `docs/superpowers/specs/2026-11-24-native-workflow-integration-design.md`

## Global Constraints

- Keep all workflows on the selected mcp-use connection; never create a second client connection.
- Keep Official Inspector source reference-only; do not copy it.
- Preserve the loopback-only stdio relay, explicit local process launch, and explicit failures.
- Keep credentials redacted from exports and masked in OAuth UI.
- Preserve mcp-use workflows and styling, and update provenance for every modified vendored file.
- Do not add a fifth new top-level destination or implement unsupported transport-level options.

## Review Focus

- Old links using `?tab=inspector` must still land on the Protocol request console — Task 1 navigation test.
- Switching the selected connection during a pending action must not show stale results or affect another connection — Task 2 cancellation/state test.
- Tools without output schemas and servers without optional capabilities must remain usable with clear validation state — Tasks 3 and 6.
- Exported diagnostics/configuration must continue to redact secrets after moving panels — Tasks 6 and 7.
- Stopping a local stdio session must terminate its process and keep the remaining Diagnostics page usable — Task 7 lifecycle test.

## File Structure

- Modify vendored navigation and route files: `InspectorContext.tsx`, `Layout.tsx`, `layoutTabs.ts`, `LayoutContent.tsx`, and the URL/tab synchronization tests.
- Modify vendored native workflows: `ToolsTab.tsx`, `PromptsTab.tsx`, `ResourcesTab.tsx`, `SkillsTab.tsx`, `NotificationsTab.tsx`, `ConnectionSettingsTab.tsx`, and `ServerMetadataTab.tsx`; use existing mcp-use hooks, UI primitives, and selection state.
- Refactor combined feature code under `apps/web/src/features/`: split cross-cutting Protocol, Auth, Client, and Diagnostics views into focused files, extract the shared action hook, and remove redundant panels after relocation.
- Extend the controlled MCP fixture and `apps/web/e2e/mcp-use.spec.ts` for UI and wire-behavior coverage.
- Update `README.md`, generated feature-parity source/catalog as appropriate, and provenance records/tests.

---

### Task 1: Four-destination navigation and legacy route compatibility

**Files:**
- Modify: `apps/web/vendor/mcp-use/client/context/InspectorContext.tsx`
- Modify: `apps/web/vendor/mcp-use/client/components/Layout.tsx`
- Modify: `apps/web/vendor/mcp-use/client/components/layout/layoutTabs.ts`
- Modify: `apps/web/vendor/mcp-use/client/components/LayoutContent.tsx`
- Modify: `apps/web/e2e/mcp-use.spec.ts`
- Test: `apps/web/e2e/mcp-use.spec.ts`

**Interfaces:**
- Produces `TabType` destinations `"protocol" | "auth" | "client" | "diagnostics"`.
- Legacy query value `"inspector"` normalizes to `"protocol"`; generated navigation and new URLs use the new IDs.

- [ ] **Step 1: Write the failing navigation test** asserting the four destinations appear, the old Inspector destination is absent, `?tab=inspector` selects Protocol, and selecting Auth updates the URL.
- [ ] **Step 2: Run the targeted Playwright test** with `npx playwright test -g "combined navigation"` from the repository root; confirm it fails on the current single Inspector tab.
- [ ] **Step 3: Implement the four `TabType` values, tab definitions, route mounting, and legacy query normalization** in the listed vendored navigation files.
- [ ] **Step 4: Run the targeted Playwright test** and confirm all navigation and legacy URL assertions pass.
- [ ] **Step 5: Update vendored provenance metadata/tests** for the changed source files and verify `pnpm verify:provenance`.

### Task 2: Shared cross-cutting page actions and state

**Files:**
- Create: `apps/web/src/features/useInspectorAction.ts`
- Modify: `apps/web/src/features/InspectorFeatures.tsx`
- Test: `apps/web/e2e/mcp-use.spec.ts`

**Interfaces:**
- `useInspectorAction(isActive: boolean)` returns `run<T>(action: (signal: AbortSignal) => Promise<T> | T): Promise<T | undefined>`, `cancel(): void`, `busy: boolean`, `error: string`, and `result: unknown`; it owns cancellation and error reporting.
- Four page components consume the selected `McpServer` and use its current connector.

- [ ] **Step 1: Add a failing browser test** that starts a delayed request on Protocol, switches to Auth before it resolves, then returns to Protocol and verifies no stale result appears.
- [ ] **Step 2: Run the targeted test** with `npx playwright test -g "cancels inspector action on page switch"`; confirm it fails because no cross-destination cancellation exists yet.
- [ ] **Step 3: Extract shared action handling** to `useInspectorAction.ts`; abort in-flight actions when `isActive` becomes false and keep explicit error reporting.
- [ ] **Step 4: Verify the cancellation test and existing selected-connection workflow** pass.

### Task 3: Tools validation, runs, replay, and diff

**Files:**
- Modify: `apps/web/vendor/mcp-use/client/components/ToolsTab.tsx`
- Modify: `apps/web/vendor/mcp-use/client/components/tools/ToolExecutionPanel.tsx`
- Modify: `apps/web/vendor/mcp-use/client/components/tools/ToolResultDisplay.tsx`
- Modify: `apps/web/src/features/OfficialPanels.tsx`
- Modify: `apps/web/e2e/fixtures/*`
- Test: `apps/web/e2e/mcp-use.spec.ts`

**Interfaces:**
- Tool run history is scoped to the selected server and uses the existing tool execution path.
- Output-schema validation is optional when a tool does not advertise an output schema; input-schema lint and MCP App metadata checks are presented in the same tool conformance experience.

- [ ] **Step 1: Add failing e2e coverage** for a tool run, replay/edit, diff of two runs, output validation, schema lint, and App metadata inspection from the native Tools tab.
- [ ] **Step 2: Run the targeted Playwright test** and verify the missing native affordances fail as expected.
- [ ] **Step 3: Add the tool run/conformance controls** to the existing selection, argument, result, and history workflow; remove the separate Tool runs, Schema lint, and App conformance destinations.
- [ ] **Step 4: Add an edge-case assertion** that a tool with no output schema remains runnable and reports validation as unavailable rather than failing the tool call.
- [ ] **Step 5: Run the focused e2e test** and verify native Tools behavior and edge cases pass.

### Task 4: Prompt/resource completions and resource subscriptions

**Files:**
- Modify: `apps/web/vendor/mcp-use/client/components/PromptsTab.tsx`
- Modify: `apps/web/vendor/mcp-use/client/components/ResourcesTab.tsx`
- Modify: `apps/web/src/features/InspectorFeatures.tsx`
- Modify: `apps/web/e2e/fixtures/*`
- Test: `apps/web/e2e/mcp-use.spec.ts`

**Interfaces:**
- Completion requests use the selected server's MCP connector and the prompt/resource-template argument currently being edited.
- Resource subscribe/unsubscribe controls are scoped to the selected resource URI and use the connector's existing subscription methods.

- [ ] **Step 1: Add failing e2e coverage** for completion from prompt and resource-template arguments and subscribe/unsubscribe from a selected Resource.
- [ ] **Step 2: Run the targeted test** and confirm those actions are not currently exposed in native tabs.
- [ ] **Step 3: Add contextual completion controls and resource subscription controls** to the existing Prompts and Resources selection flows.
- [ ] **Step 4: Verify empty/no-template states show a clear unavailable state, not a malformed request.**
- [ ] **Step 5: Run the focused e2e test** and verify all operations use the selected server.

### Task 5: Skills verification and notification/log controls

**Files:**
- Modify: `apps/web/vendor/mcp-use/client/components/SkillsTab.tsx`
- Modify: `apps/web/vendor/mcp-use/client/components/NotificationsTab.tsx`
- Modify: `apps/web/src/features/OfficialPanels.tsx`
- Modify: `apps/web/e2e/fixtures/*`
- Test: `apps/web/e2e/mcp-use.spec.ts`

**Interfaces:**
- Skills verification operates on the selected advertised skill and renders findings in its native detail view.
- The Notifications view remains the canonical notification stream and filters only log notifications for level/search operations; `logging/setLevel` uses the selected connector.

- [ ] **Step 1: Add failing e2e assertions** for SKILL.md verification, log level/search filtering, active log-level setting, export, and clear behavior in their native tabs.
- [ ] **Step 2: Run the targeted Playwright test** and confirm the actions are missing from the native views.
- [ ] **Step 3: Integrate skill verification into Skills and log actions into Notifications**; remove the separate Skills verification and Logs destinations.
- [ ] **Step 4: Add tests for an empty skill list and notifications that are not log messages** to confirm they remain visible and are not incorrectly treated as logs.
- [ ] **Step 5: Run the focused e2e test** and verify the native views preserve their existing read/search/clear behavior.

### Task 6: Connection settings, metadata, and server management deduplication

**Files:**
- Modify: `apps/web/vendor/mcp-use/client/components/ConnectionSettingsTab.tsx`
- Modify: `apps/web/vendor/mcp-use/client/components/ServerMetadataTab.tsx`
- Modify: `apps/web/vendor/mcp-use/client/components/InspectorDashboard.tsx`
- Modify: `apps/web/src/features/OfficialPanels.tsx`
- Modify: `apps/web/e2e/mcp-use.spec.ts`
- Test: `apps/web/e2e/mcp-use.spec.ts`

**Interfaces:**
- Connection Settings remains the canonical editor for protocol negotiation and request timeouts; add connection timeout and configurable network log limit there without changing request-timeout semantics.
- Server Metadata remains the canonical server identity/capability view and gains live connection diagnostics.
- Dashboard remains the canonical server-list/management surface; do not add a second server table.

- [ ] **Step 1: Add failing e2e assertions** that protocol era, timeout, network log size, connection details, and server refresh/connect/remove are reachable from the existing settings, metadata, and dashboard surfaces.
- [ ] **Step 2: Run the targeted Playwright test** and confirm any missing native affordances fail.
- [ ] **Step 3: Move protocol era, connection timeout, and log size into Connection Settings, augment Server Metadata, and remove the duplicate Servers, Server Settings, and Connection Info panels.**
- [ ] **Step 4: Verify applying settings reconnects the selected server and reports failure visibly; verify the Dashboard remains the sole server-management view with connect/reconnect/remove and config-copy actions.**
- [ ] **Step 5: Run the focused e2e tests and `pnpm verify:provenance`.**

### Task 7: Protocol, Auth, Client, and Diagnostics destinations

**Files:**
- Create: `apps/web/src/features/ProtocolTab.tsx`
- Create: `apps/web/src/features/AuthTab.tsx`
- Create: `apps/web/src/features/ClientTab.tsx`
- Create: `apps/web/src/features/DiagnosticsTab.tsx`
- Modify: `apps/web/vendor/mcp-use/client/components/LayoutContent.tsx`
- Modify: `apps/web/src/features/InspectorFeatures.tsx`
- Modify: `apps/web/src/features/OfficialPanels.tsx`
- Modify: `apps/web/e2e/mcp-use.spec.ts`
- Test: `apps/web/e2e/mcp-use.spec.ts`

**Interfaces:**
- `ProtocolTab({ connection }: { connection: McpServer })` owns raw request/batch/pagination/history workflows and Network/Console diagnostics.
- `AuthTab({ connection }: { connection: McpServer })` owns OAuth discovery, masked tokens/claims, authentication actions, and revocation.
- `ClientTab({ connection }: { connection: McpServer })` owns Roots and Tasks workflows.
- `DiagnosticsTab({ connection }: { connection: McpServer })` owns sessions, configuration import/export and explicit stdio launch, load testing, and CLI automation.

- [ ] **Step 1: Add failing e2e coverage** for Protocol request/batch/pagination/traffic filters/export, OAuth discovery/token masking/revocation, Roots/Tasks, and Diagnostics configuration/session/load/automation flows.
- [ ] **Step 2: Run the targeted browser test** and confirm the workflows are currently only nested under Inspector.
- [ ] **Step 3: Implement the four focused destination components** by reusing existing helpers and connectors; do not duplicate state or open a second connection.
- [ ] **Step 4: Add assertions that missing optional capabilities return visible, contextual errors and that config/diagnostic exports redact secrets.**
- [ ] **Step 5: Run focused e2e coverage and verify the local relay stop test leaves no running child process.**

### Task 8: Remove obsolete nested navigation and update product documentation

**Files:**
- Modify: `apps/web/src/features/InspectorFeatures.tsx`
- Modify: `apps/web/src/features/OfficialPanels.tsx`
- Modify: `README.md`
- Modify: `packages/feature-parity/src/catalog.ts`
- Regenerate: `docs/feature-parity.md`
- Modify: `apps/web/vendor-provenance.test.ts`
- Test: `packages/feature-parity/src/catalog.test.ts`

- [ ] **Step 1: Add a failing navigation assertion** that none of the old 20-item Inspector submenu labels remain and every supported workflow maps to one native or new destination.
- [ ] **Step 2: Run the test** with the existing feature-parity test command and confirm the old nested items or catalog mapping fail.
- [ ] **Step 3: Remove obsolete nested navigation and duplicate panel implementations**, update parity aliases/notes, then regenerate feature parity and provenance artifacts using `pnpm generate:provenance`.
- [ ] **Step 4: Update README and verify the generated parity documentation** lists the final locations, unsupported transport options, and compatibility URL behavior.
- [ ] **Step 5: Run `pnpm verify:provenance` and `pnpm --filter @combined-mcp-inspector/feature-parity test`; confirm generated metadata and catalog tests pass.**

### Task 9: Full regression and final verification

**Files:**
- Test: `apps/web/e2e/mcp-use.spec.ts`
- Test: full workspace suite

- [ ] **Step 1: Run targeted unit tests** for the changed features and ensure failures are fixed rather than skipped.
- [ ] **Step 2: Run the complete check** with `pnpm verify:phase-0` from the repository root.
- [ ] **Step 3: Inspect the browser UI** at desktop and mobile breakpoints; verify existing mcp-use workflows, all four new destinations, selected-server state, and the legacy URL alias.
- [ ] **Step 4: Inspect `git diff --check` and generated provenance**, ensuring no unrelated user changes or temporary test output are removed.
- [ ] **Step 5: Summarize the implemented destinations, verification results, and any Official feature limits that remain.**
