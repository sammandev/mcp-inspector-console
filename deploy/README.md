# Ubuntu Blue-Green Deployment

Serves the MCP Inspector Console at `https://10.176.2.139:7000/` from the
shared Ubuntu host. It uses the same pattern as the other projects on that
host: two release slots, an Nginx edge, atomic upstream switching, and
retained rollback slots. The operator runs every command below on Ubuntu.

## Layout

| Component | Container | Address |
| --- | --- | --- |
| TLS edge (Nginx) | `mcp-inspector-edge` | `0.0.0.0:7000` |
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

### Why the edge uses TLS

The Inspector needs a browser secure context. It calls Web Crypto
(`crypto.randomUUID`, `crypto.subtle`), and its API guard uses Fetch Metadata
headers. Browsers only provide both over HTTPS or on `localhost`, so a
plain-HTTP LAN address would break the app. Plain HTTP sent to port `7000`
is redirected to HTTPS.

### Shared-deployment restrictions

When `MCP_INSPECTOR_PUBLIC_ORIGINS` is set:

- **The stdio relay (`/mcp/inspector/api/local`) is disabled.** It starts
  processes on the server, which LAN users must not be able to do. The edge
  refuses that path too. Connect to HTTP/SSE MCP servers instead.
- OAuth proxying to loopback targets is refused.
- Requests are accepted only when their `Host` matches a listed origin and
  they arrive through the edge (`X-Forwarded-Proto: https`).
- MCP Apps widgets use the blob-URL sandbox, because no separate sandbox
  origin is published.

## Prepare the host (once)

1. Publish the repository source to the host, for example to
   `/data/ptb/mcp-inspector-console`. The script never fetches source.

2. Confirm that the ports are free and allow `7000` only from the LAN:

   ```bash
   ss -ltn '( sport = :7000 or sport = :27001 or sport = :27002 )'
   sudo ufw allow from 10.176.0.0/16 to any port 7000 proto tcp   # adjust the subnet
   ```

3. Install the edge certificate. Prefer a certificate from the internal CA
   that names `IP:10.176.2.139`, so browsers trust it without warnings. A
   self-signed fallback:

   ```bash
   cd /data/ptb/mcp-inspector-console/deploy
   install -d -m 755 tls
   openssl req -x509 -newkey rsa:3072 -sha256 -days 825 -nodes \
     -keyout tls/server.key -out tls/server.crt \
     -subj '/CN=10.176.2.139' -addext 'subjectAltName=IP:10.176.2.139'
   sudo chown 101:101 tls/server.key && sudo chmod 600 tls/server.key
   chmod 644 tls/server.crt
   ```

   Nginx runs as uid `101`, so that uid must own the key. The script refuses
   a key that other users can read.

4. Create the account database in the host PostgreSQL:

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

- `.env` must have mode `600` and must not contain `replace_me`.
- `MCP_INSPECTOR_PUBLIC_ORIGINS` must list the exact HTTPS origin that
  browsers use. Add an entry for every hostname that also points at the
  server.
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
- The image build, Compose wiring, Nginx TLS and the live switch can only
  be checked on the Ubuntu host. After the first deploy, verify:

  ```bash
  curl -sk -o /dev/null -w '%{http_code} %header{x-release-upstream}\n' https://127.0.0.1:7000/
  ```

  Then open `https://10.176.2.139:7000/mcp/inspector` from a LAN browser.
