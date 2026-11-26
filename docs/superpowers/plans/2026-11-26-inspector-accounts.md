# Inspector Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans
> for native execution, or superpowers:subagent-driven-development if selected
> by the user. Steps use checkbox tracking.

**Goal:** Restore sign-in and provide optional account synchronization with secure,
PostgreSQL-backed per-account chats, provider keys, and MCP configurations.

**User amendment:** Chat is available without login. Its provider picker offers
only OpenAI Compatible. The built-in Manufact fallback is removed.
Saved account data and the saved-key relay still require login.

**Architecture:** Extend the existing Node Inspector middleware with an
account API and authenticated provider relay. Reuse mcp-use chat and connection
storage interfaces, replacing browser persistence only for authenticated
accounts. Reset account-owned runtime state on authentication transitions.

**Tech Stack:** Existing TypeScript, React, Hono/Node, Vite, Vitest, Playwright;
PostgreSQL via `pg`, Node crypto authenticated encryption.

**Spec:** [Approved design](../specs/2026-11-26-inspector-accounts-design.md).

## Global Constraints

- Anonymous inspection and Chat remain available; account data requires login.
- PostgreSQL provisioning is user-run. No access to production hosts.
- Preserve local-only hosting and unrelated worktree changes.
- No real secrets in tracked files, browser persistence, diagnostics, or exports.
- Saved API keys are never returned to the browser.
- No new administrative management or permission screens.
- Offer only OpenAI Compatible; preserve PegaAI defaults and MCP OAuth behavior.

## Review Focus

- A token2 HTTP success with `otp_required` must not create a session.
- In-flight streams and delayed saves must not survive account transitions.
- Unknown provider paths and redirect targets must not receive stored secrets.
- Database outages and encryption-key mismatch must fail explicitly.
- Anonymous shared-browser data must never be assigned to a signed-in account.

## Files and ownership

- `apps/web/accounts/contracts.ts`: validated API payloads and public types.
- `apps/web/accounts/config.ts`: server-only environment validation.
- `apps/web/accounts/store.ts`: PostgreSQL queries and encryption.
- `apps/web/accounts/auth.ts`: admin/external/OTP/session lifecycle.
- `apps/web/accounts/api.ts`: authenticated account data endpoints.
- `apps/web/accounts/provider-relay.ts`: bounded authenticated provider relay.
- `apps/web/accounts/migrations/001-accounts.sql`: account-owned schema.
- `scripts/migrate-accounts.mjs`: user-run migration command.
- `apps/web/src/accounts/`: account context, sign-in page/menu, API client,
  chat and connection storage adapters, account provider configuration.
- Existing Inspector server/App/header/LayoutContent/chat configuration
  integration points change narrowly; vendor changes update provenance.

## Task 1: Authentication and encrypted account store

**Files:** Create server account files and migration listed above, excluding
provider relay. Modify root/web package manifests, Inspector server and README.
Create `apps/web/accounts/auth.test.ts`, `store.test.ts`, `api.test.ts`.

**Interfaces:**
- `AccountUser = { id: string; username: string; email: string; kind: "admin" | "external" }`.
- `AccountService.handle(request: Request): Promise<Response | undefined>`
  dispatches `/mcp/inspector/api/account/*`.
- `AccountService.requireUser(request: Request): Promise<AccountUser>`
  validates the opaque cookie using the PostgreSQL session record.
- `AccountService.close(): Promise<void>` closes its database pool.
- Public configuration reads return provider/model/baseUrl/keySaved, not keys.

- [ ] Write focused tests for username/email admin login, incorrect credentials,
  token2 200/201, OTP challenge/verify/expiry/replay, inactive external users,
  same-origin violations, logout revocation, and bounded login attempts.
- [ ] Run tests with the existing Vitest runner; verify failure before implementation.
- [ ] Add `pg` and its types through manifests/package manager. Validate
  `DATABASE_URL`, `MCP_INSPECTOR_ENCRYPTION_KEY`, admin environment values, and
  configurable external origin. Load root `.env` only server-side.
- [ ] Implement transactional migrations, encrypted store, session/auth and
  account routes. Hash opaque session tokens in the database; scope all
  chat/message/configuration queries by user ID. Use parameterized queries and
  authenticated encryption bound to user/record identity.
- [ ] Add PostgreSQL integration tests using an explicitly supplied
  `TEST_DATABASE_URL`: cross-user read/write rejection, ciphertext not plaintext,
  restart persistence, atomic rename/delete, outage and wrong-key errors.
  Never reuse or wipe a production database.
- [ ] Run focused tests; document user-run migrations and secret setup.
- [ ] Commit only task-owned files after checks, with the required co-author trailer.

## Task 2: Authenticated provider relay

**Files:** Create `apps/web/accounts/provider-relay.ts` and tests. Modify
Inspector server and provider configuration integration helpers.

**Interfaces:**
- `relayProviderRequest(request: Request, accounts: AccountService): Promise<Response | undefined>`.
- Account-owned provider records identify the provider and upstream endpoint.
  The browser sends a record ID, never a saved credential.
- Relay serves model discovery and streaming through same-origin account routes.

- [ ] Write tests for anonymous 401, account ownership, correct upstream key
  injection, streaming/cancellation, model discovery, and missing-key errors.
- [ ] Add tests rejecting unknown upstream paths, redirects, credential-bearing
  URLs and disallowed destinations before any secret is forwarded.
- [ ] Verify tests fail; inspect installed mcp-use provider contracts and current
  authoritative docs before choosing the smallest supported fetch adapter.
- [ ] Implement provider-specific path/auth handling for existing provider
  choices, stripping browser cookies and untrusted auth headers upstream.
  Preserve approved PegaAI and local Ollama behavior without creating an
  unrestricted credential-bearing proxy.
- [ ] Ensure account-bound active streams abort on logout/session expiry.
- [ ] Run focused tests; check secret redaction in network diagnostics.
- [ ] Commit task-owned changes after checks.

## Task 3: Sign-in UI and account lifecycle

**Files:** Create `apps/web/src/accounts/api.ts`, `AccountProvider.tsx`,
`SignInPage.tsx`, `AccountMenu.tsx`, and `account-ui.test.tsx`.
Modify vendor `App.tsx`, `LayoutHeader.tsx`, `LayoutContent.tsx`, and Inspector
server UI route matcher.

**Interfaces:**
- `useAccount()` exposes resolved user/loading/error, login, OTP verify and logout.
- `AccountProvider` owns account-generation cancellation and session checks.
- `/mcp/inspector/sign-in` uses a validated same-Inspector return destination.

- [ ] Write tests for both login tabs, email OTP step, accessible labels,
  visible failures, safe redirects, header states and anonymous Chat prompt.
- [ ] Verify failures; implement with existing Button/Input/Tabs/card primitives
  and current theme provider. No new UI framework.
- [ ] Keep standalone Chat available to anonymous users; do not restore
  Manufact login as a substitute for Inspector accounts.
- [ ] Reset account-owned providers/connections/chats on account changes;
  cancel pending requests and prevent old responses from updating new state.
- [ ] Run focused UI tests in both themes and check mobile layout.
- [ ] Commit task-owned changes after checks.

## Task 4: Saved chats, keys and MCP configurations

**Files:** Create account chat/connection storage adapters and provider settings
hooks under `apps/web/src/accounts/`, with `account-storage.test.ts`.
Modify vendor chat configuration/model discovery, ChatTab/agent integration,
connection helper integration and diagnostic/export redaction as required.

**Interfaces:**
- `AccountChatStorageProvider` implements existing `ChatStorageProvider`.
- `AccountConnectionStorageProvider` implements the installed mcp-use storage
  interface, preserving connection extras and OAuth callback behavior.
- Account provider settings expose public metadata and keySaved; API key input
  is replacement-only and calls the account settings API.

- [ ] Write tests for create/save/open/rename/delete, provider key replacement
  and removal, server configuration restore, and guest/account separation.
- [ ] Write tests proving delayed saves cannot use a later user's session,
  no browser-local secret writes, and no automatic legacy-history import.
- [ ] Verify failures; implement adapters using server APIs and existing controls.
  Route all account API calls through account-generation-bound cancellation.
- [ ] Replace signed-in localStorage LLM/API-key configuration and model requests
  with account settings and the relay. Preserve client-side MCP tool execution.
- [ ] Keep authenticated connection extras/OAuth material out of shared browser
  persistence; use account-scoped memory and encrypted server storage where
  restoration is needed.
- [ ] Surface save/load errors rather than falling back to localStorage.
- [ ] Run focused tests and task 1 integration tests together.
- [ ] Commit task-owned changes after checks.

## Task 5: End-to-end proof and documentation

**Files:** Add `apps/web/e2e/accounts.spec.ts`; update related README,
web test selectors, build-secret checks and vendor manifest/provenance.

- [ ] Run database-backed browser scenarios for admin login, mocked external
  token2/OTP, anonymous Chat availability, chat rename/delete, key controls, logout
  during streaming, and two-account configuration/history isolation.
- [ ] Verify persistence after restarting the test server without clearing its
  test database; verify light/dark and mobile sign-in behavior.
- [ ] Run targeted tests, then `pnpm typecheck`, `pnpm verify:provenance`,
  `pnpm build`, and the account Playwright selector. Prefix shell commands
  with `rtk`; use an isolated test port rather than stopping user processes.
- [ ] Document migrations, database permissions, encryption-key backups,
  restart requirements, cookie behavior, plaintext external-LAN transport,
  and authenticated persistence replacing shared browser storage.
- [ ] Distinguish mocked external-service tests from live verification.
  If no approved test database is available, report that gate as blocked.
- [ ] Review final diff against the approved design and commit task-owned files.

## Execution

Recommended: native execution. These tasks share authentication, cancellation
and storage contracts, so maintaining one context avoids handoff duplication.
The user selects the execution method after reviewing this plan.
