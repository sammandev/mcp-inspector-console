# Official Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans.

**Goal:** Add Official Inspector workflows while preserving mcp-use UI.

**Architecture:** A pinned source-owned mcp-use client retains its existing
providers and routes. Native Inspector panels use that client's selected
connector; a loopback-only stdio relay supports local processes.

**Tech Stack:** React 19, TypeScript, Vite, mcp-use, MCP SDK, Vitest, Playwright.

**Spec:** `../specs/2026-11-24-official-features.md`

## Global Constraints

- Node >=22.23.4; pnpm 12.21.0; Windows-safe commands.
- No upstream-clone edits; no copied Official Inspector code.
- Pin/attribute the MIT mcp-use UI; preserve existing features.
- One selected connection for diagnostics and normal workflows.
- Keep existing local-origin, body-size, and telemetry protections.

## Review Focus

- A new panel must not silently open a second MCP connection.
- Invalid or missing capability responses must be visible failures.
- Stdio launch failure and shutdown must not leave child processes.
- Diagnostics/configuration exports must redact credentials.
- Load-test limits and cancellation must prevent unbounded requests.

### Task 1: Extensible native UI

- [ ] Add a failing browser test for the Inspector navigation section.
- [ ] Vendor the pinned MIT UI with source checksums and license.
- [ ] Serve/build the owned client while retaining upstream proxy/sandbox.
- [ ] Verify old workflows and new navigation.

### Task 2: Shared-connection workflows

- [ ] Add tests for roots, completions, task requests and protocol replay.
- [ ] Add native panels for diagnostic and protocol operations.
- [ ] Add configuration validation, safe exports and bounded load testing.
- [ ] Verify observed protocol calls and results with a controlled server.

### Task 3: Local transport and automation

- [ ] Add stdio lifecycle/forwarding tests.
- [ ] Implement the local relay with explicit launch and cleanup.
- [ ] Integrate launch/configuration and console diagnostics.
- [ ] Implement command-line configuration/request/assertion workflows.

### Task 4: Parity and verification

- [ ] Update provenance, notices, README and honest feature statuses.
- [ ] Run `pnpm verify:phase-0` and preview/browser verification.
- [ ] Check worktree hygiene and report any remaining gaps.
