import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)

async function readJson(url) {
  return JSON.parse(await readFile(url, 'utf8'))
}

function assertWorkspaceScript(workspace, script) {
  assert.equal(typeof workspace.scripts?.[script], 'string', `${workspace.name} must define ${script}`)
}

test('declares the pinned standalone workspace shape and runnable commands', async () => {
  const manifest = await readJson(new URL('package.json', root))
  const gateway = await readJson(new URL('apps/gateway/package.json', root))
  const web = await readJson(new URL('apps/web/package.json', root))

  assert.equal(manifest.packageManager, 'pnpm@12.21.0')
  assert.equal(manifest.engines?.node, '>=22.23.4')
  assert.equal(manifest.scripts.dev, 'node scripts/dev.mjs')
  assert.equal(manifest.scripts.test, 'node --test scripts/workspace-shape.test.mjs && pnpm -r --if-present test')
  assert.equal(manifest.scripts.typecheck, 'pnpm -r --if-present typecheck')
  assert.equal(manifest.scripts.build, 'pnpm -r --if-present build')
  assert.equal(manifest.scripts['test:e2e'], 'playwright test')
  assert.equal(
    manifest.scripts['verify:phase-0'],
    'pnpm test && pnpm typecheck && pnpm verify:provenance && pnpm build && pnpm test:e2e',
  )
  assert.equal(manifest.scripts['verify:provenance'], 'node --experimental-strip-types scripts/verify-upstream-manifest.ts')
  assert.equal(manifest.scripts['generate:provenance'], 'node --experimental-strip-types scripts/verify-upstream-manifest.ts --write')

  for (const script of ['test', 'typecheck', 'build']) assertWorkspaceScript(gateway, script)
  for (const script of ['test', 'typecheck', 'build', 'dev']) assertWorkspaceScript(web, script)
  assertWorkspaceScript(gateway, 'dev')

  const workspace = await readFile(new URL('pnpm-workspace.yaml', root), 'utf8')
  assert.match(workspace, /^\s*- ['"]?apps\/\*['"]?\s*$/m)
  assert.match(workspace, /^\s*- ['"]?packages\/\*['"]?\s*$/m)
})

test('development runner starts a loopback gateway before passing config to Vite', async () => {
  const source = await readFile(new URL('dev.mjs', import.meta.url), 'utf8')

  assert.match(source, /127\.0\.0\.1/)
  assert.match(source, /randomBytes/)
  assert.match(source, /GATEWAY_HOST/)
  assert.match(source, /GATEWAY_TOKEN/)
  assert.match(source, /VITE_GATEWAY_URL/)
  assert.match(source, /VITE_GATEWAY_TOKEN/)
  assert.match(source, /\/health/)
  assert.ok(source.indexOf('/health') < source.indexOf('startWeb'), 'health must be awaited before web startup')
  assert.doesNotMatch(source, /console\.(?:log|info|debug).*token|\$\{token\}/i)
})
