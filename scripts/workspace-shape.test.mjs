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
  assert.equal(manifest.scripts.test, 'node --test scripts/workspace-shape.test.mjs scripts/dev-runner.test.mjs && pnpm -r --if-present test')
  assert.equal(manifest.scripts.typecheck, 'pnpm -r --if-present typecheck')
  assert.equal(manifest.scripts.build, 'node scripts/build.mjs')
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

test('Playwright owns isolated loopback ports and excludes the browser token', async () => {
  const config = await readFile(new URL('../playwright.config.ts', import.meta.url), 'utf8')
  const webConfig = await readFile(new URL('apps/web/vite.config.ts', root), 'utf8')

  assert.match(config, /3101/)
  assert.match(config, /4273/)
  assert.match(config, /DEV_GATEWAY_PORT/)
  assert.match(config, /DEV_WEB_PORT/)
  assert.doesNotMatch(webConfig, /VITE_GATEWAY_TOKEN/)
  assert.match(webConfig, /GATEWAY_TOKEN/)
})
