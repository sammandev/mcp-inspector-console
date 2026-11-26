# Inspector accounts and saved work

Approved by the user on 2026-11-26.

## Intent

Restore the header Sign in button and provide an Inspector-styled sign-in
page. Accounts allow users to retain their chats, API keys, and MCP server
configurations. Anonymous inspection remains available; Chat requires login.

## Access and UI

- Match existing typography, bordered cards, pill buttons, and light/dark
  themes. Provide External and Admin sign-in tabs, including mobile headers.
- Return to the prior Inspector destination after login. Replace Sign in with
  an account menu offering Sign out.
- Gate Chat in the UI and provider APIs server-side. Inspector account
  authentication is independent of MCP server OAuth.
- Reuse chat-history controls for create/open/save/rename/delete.

## Authentication

- Admin accepts the configured username or email. Credentials are verified
  server-side from the ignored root `.env`; never bundle or commit them.
- External accounts use `POST /api/user/token2/`, accepting 200/201 responses.
  `otp_required` is a challenge, not a successful login. Complete it through
  `POST /api/user/otp/`, then validate identity and active account status.
- Follow PTB_OT's external authentication service and the supplied reference
  documentation, without depending on PTB_OT at runtime.
- Use PostgreSQL-backed opaque, revocable sessions and HttpOnly, SameSite
  cookies, with Secure under HTTPS. Bound OTP challenges and login attempts.
- Enforce same-origin requests, expiry, explicit errors, and inactive-account
  rejection. No new administrative management or permission screens.

## Persistence and isolation

- PostgreSQL stores accounts, sessions, chats/messages, provider settings, and
  saved MCP configurations. Every operation is scoped to the current user.
- Data survives process restarts and is available from another browser on the
  same Inspector deployment.
- Anonymous configuration storage remains separate. Do not automatically
  import shared-browser history or credentials into any account.
- Logout cancels active chats, disconnects account connections, clears
  account caches, and revokes the session. Late writes cannot enter another
  user's account.

## Secrets

- Use authenticated encryption for provider API keys and credential-bearing
  MCP configuration at rest. Keep the encryption key separately in server
  environment configuration, not PostgreSQL.
- Saved API keys are never returned to the browser. Show saved status and
  provide replacement/removal. Inject keys into provider requests server-side,
  including streaming and model discovery.
- Preserve existing provider choices and PegaAI defaults. No provider key in
  localStorage, bundles, diagnostic recordings, or exports.
- The existing browser MCP client may require account configuration
  credentials in authenticated memory; do not persist them in browser storage.
- Do not include real secrets in this design, fixtures, or tracked examples.

## Integration and operations

- Extend the existing Node Inspector server mount and reuse storage interfaces.
- Add PostgreSQL migrations and documented `DATABASE_URL` and encryption-key
  setup. Configuration and database failures are explicit; authenticated data
  must not silently fall back to browser storage.
- Preserve local-only hosting, anonymous non-chat workflows, existing
  provider behavior, and unrelated worktree changes.
- PostgreSQL provisioning is user-run. No access to production hosts.
  Production/public deployment is outside scope.
- Document that the supplied external auth service uses HTTP on a private LAN;
  do not present it as encrypted transport.

## Approaches

Browser-only storage cannot deliver safe cross-browser account persistence.
SQLite would simplify standalone operations, but the user selected PostgreSQL
over that alternative. Implement PostgreSQL with account-scoped APIs and
encrypted secrets.

## Verification

Cover admin/external/OTP login, rejected credentials and expiry, anonymous
Chat blocking, cross-user isolation, encrypted storage, key non-disclosure,
chat rename/delete, configuration restoration, logout cleanup, and late-write
isolation. Run focused unit and PostgreSQL integration tests, typecheck,
build/provenance checks, and browser flows in both themes. Distinguish mocked
provider proof from live external-service verification.
