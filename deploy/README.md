# Ubuntu Blue-Green Deployment

Serves the MCP Inspector Console at `http://10.176.2.139:7000/` from the
shared Ubuntu host. It uses the same pattern as the other projects on that
host: two release slots, an Nginx edge, atomic upstream switching, and
retained rollback slots. The operator runs every command below on Ubuntu.

## Layout

| Component | Container | Address |
| --- | --- | --- |
| HTTP edge (Nginx) | `mcp-inspector-edge` | `0.0.0.0:7000` |
| Blue slot (`vite preview`) | `mcp-inspector-blue` | `127.0.0.1:27001` |
| Green slot (`vite preview`) | `mcp-inspector-green` | `127.0.0.1:27002` |

- Both slots use host networking and bind to loopback only. The edge is the
  only listener the LAN can reach.
- Account data lives in the host PostgreSQL at `127.0.0.1:5432`.
- Hashed assets are copied into the additive `state/assets/`. A browser that
  still holds an older page can load its bundles after a switch.
- `state/upstreams/active.conf` names the live slot. The script replaces it
  atomically and verifies the result through the `X-Release-Upstream`
  header.

### Plain HTTP on the LAN

The edge serves plain HTTP, with no certificate to install. This fits a
trusted internal network only:

- **Nothing is encrypted in transit.** The admin password, session cookies,
  provider API keys and chat content cross the LAN in clear text. Keep the
  firewall rule from step 2 so only the LAN reaches port `7000`.
- Browsers treat a plain-HTTP LAN address as an insecure context. The app
  supplies the Web Crypto subset it needs (`crypto.randomUUID` and SHA-256).
  Encrypted browser storage is unavailable, so MCP OAuth tokens are kept in
  memory and must be re-authorized after a page reload.
- Browsers omit Fetch Metadata over HTTP. The API guard falls back to the
  same-origin `Origin` or `Referer` header, which pages cannot forge.

Serving HTTPS later only needs a `listen 7000 ssl` block with a certificate in
`nginx.conf` and `https://` in `MCP_INSPECTOR_PUBLIC_ORIGINS`.

### Shared-deployment restrictions

When `MCP_INSPECTOR_PUBLIC_ORIGINS` is set:

- **The stdio relay (`/mcp/inspector/api/local`) is disabled.** It starts
  processes on the server, which LAN users must not be able to do. The edge
  refuses that path too. Connect to HTTP/SSE MCP servers instead.
- OAuth proxying to loopback targets is refused.
- Requests are accepted only when their `Host` matches a listed origin and
  they arrive through the edge on loopback.
- MCP Apps widgets use the blob-URL sandbox, because no separate sandbox
  origin is published.

## Prepare the host (once)

Run these steps before the first `./deploy/blue-green.sh`.

The examples use `10.176.2.139`. Confirm the host's LAN address with
`hostname -I`. If it differs, use the real address in
`MCP_INSPECTOR_PUBLIC_ORIGINS`. It must match the URL that browsers open.

1. Publish the repository source to the host, for example to
   `/data/ptb/mcp-inspector-console`. The script never fetches source.

2. Confirm that the ports are free and allow `7000` only from the LAN:

   ```bash
   ss -ltn '( sport = :7000 or sport = :27001 or sport = :27002 )'
   sudo ufw allow from 10.176.0.0/16 to any port 7000 proto tcp   # adjust the subnet
   ```

3. Create the account database in the host PostgreSQL:

   ```bash
   sudo -u postgres psql -c "CREATE ROLE mcp_inspector LOGIN PASSWORD '<password>'"
   sudo -u postgres psql -c "CREATE DATABASE mcp_inspector OWNER mcp_inspector"
   ```

## Configure runtime settings

```bash
cd /data/ptb/mcp-inspector-console/deploy
install -m 600 .env.example .env
openssl rand -base64 32      # value for MCP_INSPECTOR_ENCRYPTION_KEY
editor .env                  # replace every replace_me value privately
```

- `.env` must have mode `600`, and no uncommented line may contain `replace_me`.
- `MCP_INSPECTOR_ENCRYPTION_KEY` must be the output of `openssl rand -base64 32`
  (32 bytes). The script refuses anything else, because an invalid key
  silently disables accounts and sign-in.
- `MCP_INSPECTOR_PUBLIC_ORIGINS` must list the exact origin that browsers
  use, for example `http://10.176.2.139:7000`. Add an entry for every
  hostname that also points at the server.
- Back up `MCP_INSPECTOR_ENCRYPTION_KEY`. Without it, saved provider keys
  and chats cannot be read.

## Build network access (optional)

If the image build can only reach npm through the corporate proxy:

```bash
install -m 600 .env.proxy.example .env.proxy
editor .env.proxy
```

Proxy values reach the build only as BuildKit secrets. They never appear in
image layers, build arguments or the runtime containers.

## Deploy

```bash
./deploy/blue-green.sh             # build current source with a unique UTC tag
./deploy/blue-green.sh deploy TAG  # build, or reuse the immutable TAG image
./deploy/blue-green.sh status
./deploy/blue-green.sh rollback blue|green
```

Each deploy follows these steps:

1. Builds the image. Inside the build, `pnpm typecheck` and `pnpm build` must pass.
2. Runs the idempotent account schema migration.
3. Recreates only the idle slot.
4. Waits for its health check.
5. Copies the new assets.
6. Switches the upstream, then validates and reloads Nginx.
7. Verifies that live traffic reaches the new slot.

If any step fails before the switch, routing is unchanged. If the switch
fails, the previous upstream is restored and verified. The old slot and its
image are kept for `rollback`. Images are never pruned automatically.

The first deploy publishes blue and starts the edge. It refuses to start if
an edge already exists without recorded state.

## Verification boundaries

- `node --test deploy/tests/blue-green.test.mjs` checks the rollout logic
  against mocked Docker, curl and system tools. On Windows it needs Git Bash.
- The image build, Compose wiring, Nginx and the live switch can only
  be checked on the Ubuntu host. After the first deploy, verify:

  ```bash
  curl -s -o /dev/null -w '%{http_code} %header{x-release-upstream}\n' http://127.0.0.1:7000/
  ```

  Then open `http://10.176.2.139:7000/mcp/inspector` from a LAN browser.
