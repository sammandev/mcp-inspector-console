import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const deployment = fileURLToPath(new URL('../blue-green.sh', import.meta.url));
const bash = process.env.DEPLOY_TEST_BASH ?? (process.platform === 'win32'
  ? [
      'C:/Program Files/Git/bin/bash.exe',
      `${process.env.LOCALAPPDATA}/Programs/Git/bin/bash.exe`,
    ].find(existsSync)
  : 'bash');
const validKey = Buffer.alloc(32, 7).toString('base64');
const defaultEnvironment = 'DATABASE_URL=postgresql://example\nPGPASSWORD=example\n'
  + `MCP_INSPECTOR_ENCRYPTION_KEY='${validKey}'\nMCP_INSPECTOR_PUBLIC_ORIGINS=https://10.0.0.1:7000\n`;

function shellPath(value) {
  return value.replaceAll('\\', '/').replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`);
}

function runDeployment(context, scenario, args = ['deploy', 'test-release'], options = {}) {
  const { buildEnvironment = {}, proxyFile, envFile = defaultEnvironment, tls = true } = options;
  assert.ok(bash, 'Bash is required for rollout tests');
  const root = mkdtempSync(path.join(tmpdir(), 'mcp-inspector-rollout-'));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, 'deploy');
  const commands = path.join(root, 'bin');
  mkdirSync(path.join(directory, 'state', 'upstreams'), { recursive: true });
  mkdirSync(path.join(directory, 'state', 'assets'), { recursive: true });
  writeFileSync(path.join(directory, 'state', 'assets', 'old-hash.js'), 'old release');
  mkdirSync(commands);
  if (scenario !== 'first') {
    writeFileSync(path.join(directory, 'state', 'upstreams', 'active.conf'), 'server 127.0.0.1:27001;\n');
  }
  writeFileSync(path.join(directory, '.env'), envFile);
  if (tls) {
    mkdirSync(path.join(directory, 'tls'));
    writeFileSync(path.join(directory, 'tls', 'server.crt'), 'certificate');
    writeFileSync(path.join(directory, 'tls', 'server.key'), 'key');
  }
  if (proxyFile) {
    writeFileSync(path.join(directory, '.env.proxy'), proxyFile.content);
  }
  writeFileSync(path.join(directory, 'compose.yml'), 'services: {}\n');
  if (existsSync(deployment)) {
    writeFileSync(path.join(directory, 'blue-green.sh'), readFileSync(deployment));
  }
  const log = path.join(root, 'commands.log');
  writeFileSync(log, '');
  const docker = `#!/usr/bin/env bash
set -eu
printf '%s\\n' "docker $*" >> "$MOCK_LOG"
if [[ "$1" == build ]]; then
  printf '%s\\n' "\${http_proxy:-}" "\${https_proxy:-}" "\${no_proxy:-}" > "$MOCK_BUILD_ENV"
  if [[ "$SCENARIO" == proxy-required && -z "\${https_proxy:-}" ]]; then
    printf 'pnpm install: ECONNRESET\\n' >&2
    exit 1
  fi
fi
if [[ "$1" == compose && "$*" == *'config --quiet'* ]]; then
  printf '%s\\n' "\${http_proxy:-}" "\${https_proxy:-}" "\${no_proxy:-}" > "$MOCK_RUNTIME_ENV"
fi
if [[ "$1" == compose && "$*" == *'migrate.mjs'* && "$SCENARIO" == migration-failure ]]; then exit 1; fi
if [[ "$1" == build && "$SCENARIO" == build-failure ]]; then exit 1; fi
if [[ "$1" == image && "$2" == inspect ]]; then
  case "$SCENARIO" in build|build-failure|first|proxy-required|migration-failure) exit 1 ;; esac
  if [[ "$*" == *--format* ]]; then
    if [[ "$SCENARIO" == mismatched-release ]]; then
      printf 'mcp-inspector-console other-release\\n'
    else
      printf 'mcp-inspector-console test-release\\n'
    fi
  fi
  exit 0
fi
if [[ "$1" == inspect ]]; then
  if [[ "$*" == *State.Health.Status* ]]; then
    if [[ "$SCENARIO" == unhealthy && "$*" == *green* ]]; then printf 'unhealthy\\n'; else printf 'healthy\\n'; fi
  elif [[ "$*" == *State.Running* ]]; then
    if [[ "$SCENARIO" == first && "$*" == *edge* ]]; then exit 1; fi
    printf 'mcp-inspector-console true\\n'
  fi
  exit 0
fi
if [[ "$1" == exec && "$*" == *'ps -o args'* ]]; then
  printf 'nginx: worker process\\n'
  exit 0
fi
if [[ "$1" == exec && "$*" == *'nginx -t'* && "$SCENARIO" == invalid ]]; then
  if grep -q 27002 "$MOCK_DEPLOY/state/upstreams/active.conf"; then exit 1; fi
fi
if [[ "$1" == exec && "$*" == *'nginx -s reload'* && "$SCENARIO" == reload-failure ]]; then
  if grep -q 27002 "$MOCK_DEPLOY/state/upstreams/active.conf"; then exit 1; fi
fi
if [[ "$1" == cp ]]; then
  printf 'new release' > "\${@: -1}/new-hash.js"
fi
exit 0
`;
  const curl = `#!/usr/bin/env bash
set -eu
printf '%s\\n' "curl $*" >> "$MOCK_LOG"
headers=''
while (( $# )); do
  case "$1" in
    --dump-header) headers="$2"; shift 2 ;;
    *) shift ;;
  esac
done
port=27002
if grep -q 27001 "$MOCK_DEPLOY/state/upstreams/active.conf"; then port=27001; fi
if [[ "$SCENARIO" == wrong-route ]]; then port=27001; fi
if [[ -n "$headers" ]]; then printf 'HTTP/1.1 302 Found\\r\\nX-Release-Upstream: 127.0.0.1:%s\\r\\n\\r\\n' "$port" > "$headers"; fi
`;
  for (const [name, content] of Object.entries({
    docker,
    curl,
    stat: '#!/usr/bin/env bash\ncase "${@: -1}" in *.env.proxy) printf "%s\\n" "$MOCK_PROXY_MODE" ;; *server.key) printf "%s\\n" "$MOCK_KEY_MODE" ;; *) printf "600\\n" ;; esac\n',
    ss: '#!/usr/bin/env bash\nexit 0\n',
    flock: '#!/usr/bin/env bash\nexit 0\n',
    sleep: '#!/usr/bin/env bash\nexit 0\n',
  })) {
    writeFileSync(path.join(commands, name), content, { mode: 0o755 });
  }
  const environment = { ...process.env };
  for (const name of ['HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy']) {
    delete environment[name];
  }
  Object.assign(environment, buildEnvironment);
  const currentPath = Object.keys(environment).find(key => key.toLowerCase() === 'path');
  const inheritedPath = currentPath ? environment[currentPath] : '';
  if (currentPath) delete environment[currentPath];
  environment.PATH = `${commands}${path.delimiter}${inheritedPath}`;
  environment.MOCK_LOG = shellPath(log);
  environment.MOCK_DEPLOY = shellPath(directory);
  environment.MOCK_BIN = shellPath(commands);
  const buildProxy = path.join(root, 'build-proxy.txt');
  const runtimeEnvironment = path.join(root, 'runtime-env.txt');
  environment.MOCK_BUILD_ENV = shellPath(buildProxy);
  environment.MOCK_RUNTIME_ENV = shellPath(runtimeEnvironment);
  environment.MOCK_PROXY_MODE = proxyFile?.mode ?? '600';
  environment.MOCK_KEY_MODE = options.keyMode ?? '600';
  const startup = path.join(root, 'mock-env.sh');
  writeFileSync(startup, 'export PATH="$MOCK_BIN:$PATH"\n');
  environment.BASH_ENV = shellPath(startup);
  environment.SCENARIO = scenario;
  const result = spawnSync(bash, [shellPath(path.join(directory, 'blue-green.sh')), ...args], {
    cwd: directory,
    env: environment,
    encoding: 'utf8',
    timeout: 15_000,
  });
  assert.ifError(result.error && new Error(`${result.error.message}\n${result.stderr}\n${readFileSync(log, 'utf8')}`));
  return {
    ...result,
    commands: readFileSync(log, 'utf8'),
    buildProxy: existsSync(buildProxy) ? readFileSync(buildProxy, 'utf8').trimEnd().split('\n') : [],
    runtimeEnvironment: existsSync(runtimeEnvironment) ? readFileSync(runtimeEnvironment, 'utf8') : null,
    active: existsSync(path.join(directory, 'state', 'upstreams', 'active.conf'))
      ? readFileSync(path.join(directory, 'state', 'upstreams', 'active.conf'), 'utf8')
      : null,
    previousAsset: readFileSync(path.join(directory, 'state', 'assets', 'old-hash.js'), 'utf8'),
    candidateAsset: existsSync(path.join(directory, 'state', 'assets', 'new-hash.js')),
  };
}

const blue = 'server 127.0.0.1:27001;\n';
const green = 'server 127.0.0.1:27002;\n';

test('an unhealthy candidate leaves active blue routing unchanged', context => {
  const result = runDeployment(context, 'unhealthy');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /not healthy/);
  assert.equal(result.active, blue);
  assert.doesNotMatch(result.commands, /nginx -s reload|docker stop mcp-inspector-blue/);
});

test('invalid Nginx configuration restores the previous upstream without reloading', context => {
  const result = runDeployment(context, 'invalid');
  assert.notEqual(result.status, 0);
  assert.equal(result.active, blue);
  assert.match(result.commands, /exec mcp-inspector-edge nginx -t/);
  assert.doesNotMatch(result.commands, /nginx -s reload|docker stop/);
});

test('a healthy release migrates, switches to green and retains blue and both asset versions', context => {
  const result = runDeployment(context, 'healthy');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.active, green);
  assert.match(result.commands, /run --rm --no-deps --entrypoint node app-green accounts\/migrate\.mjs[\s\S]*up -d --no-deps --force-recreate app-green/);
  assert.match(result.commands, /exec mcp-inspector-edge nginx -t[\s\S]*nginx -s reload/);
  assert.match(result.commands, /curl [^\n]*--insecure[^\n]*https:\/\/127\.0\.0\.1:7000\//);
  assert.doesNotMatch(result.commands, /docker stop|docker image rm|prune|up .*edge/);
  assert.equal(result.previousAsset, 'old release');
  assert.equal(result.candidateAsset, true);
});

test('a failed account migration leaves routing and release containers unchanged', context => {
  const result = runDeployment(context, 'migration-failure');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /migration failed/);
  assert.equal(result.active, blue);
  assert.doesNotMatch(result.commands, /force-recreate|nginx -s reload/);
});

test('a failed reload restores and verifies previous blue routing', context => {
  const result = runDeployment(context, 'reload-failure');
  assert.notEqual(result.status, 0);
  assert.equal(result.active, blue);
  assert.match(result.stderr, /Previous routing restored/);
  assert.equal((result.commands.match(/nginx -s reload/g) ?? []).length, 2);
  assert.doesNotMatch(result.commands, /docker stop|up .*edge/);
});

test('a wrong post-switch upstream rolls back instead of reporting success', context => {
  const result = runDeployment(context, 'wrong-route');
  assert.notEqual(result.status, 0);
  assert.equal(result.active, blue);
  assert.match(result.stderr, /Previous routing restored/);
});

test('first deployment migrates and tests edge config before publishing blue', context => {
  const result = runDeployment(context, 'first', []);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.active, blue);
  assert.match(result.commands, /migrate\.mjs[\s\S]*force-recreate app-blue[\s\S]*run --rm --no-deps edge -t[\s\S]*up -d --no-deps edge/);
});

for (const [label, options, message] of [
  ['missing TLS files', { tls: false }, /deploy\/tls\/server\.crt/],
  ['a world-readable TLS key', { keyMode: '644' }, /must not be accessible/],
  ['a missing public origin', { envFile: 'DATABASE_URL=postgresql://example\n' }, /MCP_INSPECTOR_PUBLIC_ORIGINS/],
  ['an HTTP-only public origin', { envFile: 'MCP_INSPECTOR_PUBLIC_ORIGINS=http://10.0.0.1:7000\n' }, /MCP_INSPECTOR_PUBLIC_ORIGINS/],
  ['a placeholder runtime secret', { envFile: `${defaultEnvironment}PGPASSWORD='replace_me'\n` }, /placeholder/],
  ['a non-32-byte encryption key', { envFile: `${defaultEnvironment}MCP_INSPECTOR_ENCRYPTION_KEY='pega#1234'\n` }, /32 bytes/],
]) {
  test(`${label} is refused before Docker changes anything`, context => {
    const result = runDeployment(context, 'first', [], options);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, message);
    assert.equal(result.active, null);
    assert.doesNotMatch(result.commands, /docker build|up -d|migrate|nginx/);
  });
}

test('the shipped .env template comments do not trip the placeholder check once values are set', context => {
  const template = readFileSync(new URL('../.env.example', import.meta.url), 'utf8')
    .replace("PGPASSWORD='replace_me'", "PGPASSWORD='example'")
    .replace("MCP_INSPECTOR_ENCRYPTION_KEY='replace_me'", `MCP_INSPECTOR_ENCRYPTION_KEY='${validKey}'`);
  const result = runDeployment(context, 'first', [], { envFile: template });
  assert.equal(result.status, 0, result.stderr);
});

test('a group-readable but not world-readable TLS key is accepted', context => {
  const result = runDeployment(context, 'healthy', ['deploy', 'test-release'], { keyMode: '640' });
  assert.equal(result.status, 0, result.stderr);
});

test('rollback selects a retained healthy slot without building or recreating edge', context => {
  const result = runDeployment(context, 'healthy', ['rollback', 'green']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.active, green);
  assert.doesNotMatch(result.commands, /docker build|force-recreate|migrate|up .*edge|docker stop/);
});

test('an image retagged from another release is refused before replacing a slot', context => {
  const result = runDeployment(context, 'mismatched-release');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /release label/);
  assert.equal(result.active, blue);
  assert.doesNotMatch(result.commands, /force-recreate|nginx -s reload/);
});

test('a new release is built with project and release ownership labels', context => {
  const result = runDeployment(context, 'build');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.commands, /docker build --pull[\s\S]*--label com.mcp-inspector-console.project=mcp-inspector-console[\s\S]*--label com.mcp-inspector-console.release=test-release/);
  assert.equal(result.active, green);
});

test('build forwards proxy settings as secrets without logging proxy values', context => {
  const buildEnvironment = {
    HTTP_PROXY: 'http://user:example@proxy.example.invalid:8080',
    HTTPS_PROXY: 'http://build-user:build-password@proxy.example.invalid:8080',
    NO_PROXY: 'localhost,127.0.0.1',
  };
  const result = runDeployment(context, 'build', ['deploy', 'test-release'], { buildEnvironment });
  assert.equal(result.status, 0, result.stderr);
  for (const id of ['http_proxy', 'https_proxy', 'no_proxy']) {
    assert.ok(result.commands.includes(`--secret id=${id},env=${id}`), `${id} must reach Docker build as a secret`);
  }
  for (const [name, value] of Object.entries(buildEnvironment)) {
    assert.equal(result.commands.includes(value), false, `${name} must not appear in command output`);
  }
});

test('no arguments builds a uniquely tagged release and switches the healthy candidate', context => {
  const result = runDeployment(context, 'build', []);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.commands, /-t mcp-inspector-console:\d{8}T\d{15}Z-\d+/);
  assert.equal(result.active, green);
});

test('a generated tag collision fails rather than reusing an existing image', context => {
  const result = runDeployment(context, 'healthy', []);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Generated release tag already exists/);
  assert.equal(result.active, blue);
  assert.doesNotMatch(result.commands, /docker build|force-recreate|nginx -s reload/);
});

test('private proxy file is loaded automatically and overrides inherited proxy settings', context => {
  const proxy = 'http://user:example@approved.example.invalid:8080';
  const result = runDeployment(context, 'build', ['deploy', 'test-release'], {
    buildEnvironment: { HTTPS_PROXY: 'http://old.example.invalid:8080' },
    proxyFile: { content: `http_proxy='${proxy}'\nhttps_proxy='${proxy}'\nno_proxy='localhost,127.0.0.1'\n` },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.buildProxy, [proxy, proxy, 'localhost,127.0.0.1']);
  assert.match(result.commands, /--secret id=https_proxy,env=https_proxy/);
  assert.equal(`${result.commands}${result.stdout}${result.stderr}`.includes(proxy), false);
  assert.equal(result.runtimeEnvironment, '\n\n\n');
});

test('a proxy-required build fails safely without the profile and succeeds when it is loaded', context => {
  const missing = runDeployment(context, 'proxy-required');
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /ECONNRESET/);
  assert.match(missing.stderr, /check the approved proxy/);
  assert.equal(missing.active, blue);
  assert.doesNotMatch(missing.commands, /force-recreate|nginx -s reload/);

  const configured = runDeployment(context, 'proxy-required', ['deploy', 'test-release'], {
    proxyFile: { content: "HTTPS_PROXY='http://approved.example.invalid:8080'\n" },
  });
  assert.equal(configured.status, 0, configured.stderr);
  assert.equal(configured.buildProxy[1], 'http://approved.example.invalid:8080');
  assert.equal(configured.active, green);
});

for (const [label, proxyFile, message] of [
  ['world-readable', { content: "https_proxy='http://approved.example.invalid:8080'\n", mode: '644' }, /chmod 600/],
  ['placeholder', { content: "https_proxy='replace_me'\n" }, /placeholder/],
]) {
  test(`${label} proxy file is refused before building or changing containers`, context => {
    const result = runDeployment(context, 'build', ['deploy', 'test-release'], { proxyFile });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, message);
    assert.equal(result.active, blue);
    assert.doesNotMatch(result.commands, /docker build|force-recreate|nginx -s reload/);
  });
}

test('help needs no Docker or runtime configuration', context => {
  const result = runDeployment(context, 'first', ['--help']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Usage:/);
  assert.equal(result.commands, '');
});

test('a failed image build leaves active routing and release containers unchanged', context => {
  const result = runDeployment(context, 'build-failure');
  assert.notEqual(result.status, 0);
  assert.equal(result.active, blue);
  assert.match(result.commands, /docker build/);
  assert.doesNotMatch(result.commands, /migrate|force-recreate|nginx -s reload|docker stop/);
  assert.equal(result.candidateAsset, false);
});

test('image builder mounts proxy secrets on every network step and keeps them out of the runtime', () => {
  const dockerfile = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');
  assert.doesNotMatch(dockerfile, /(?:ARG|ENV)\s+(?:HTTP_PROXY|HTTPS_PROXY|NO_PROXY|http_proxy|https_proxy|no_proxy)\b/);
  for (const step of ['npm install --global', 'pnpm install --frozen-lockfile']) {
    const run = dockerfile.slice(0, dockerfile.indexOf(step)).split(/^RUN /m).at(-1);
    assert.match(run, /--mount=type=secret,id=https_proxy,env=https_proxy/, `${step} must mount proxy secrets`);
  }
  assert.doesNotMatch(dockerfile.split(' AS runtime')[1], /NODE_USE_ENV_PROXY/);
});

test('edge terminates TLS on port 7000 and refuses the stdio relay', () => {
  const nginx = readFileSync(new URL('../nginx.conf', import.meta.url), 'utf8');
  assert.match(nginx, /listen 7000 ssl;/);
  assert.match(nginx, /proxy_set_header X-Forwarded-Proto https;/);
  assert.match(nginx, /location \^~ \/mcp\/inspector\/api\/local \{\s*return 403;/);
  assert.match(nginx, /proxy_buffering off;/);
});
