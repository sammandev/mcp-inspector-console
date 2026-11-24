import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)

test('declares the pinned standalone workspace shape', async () => {
  const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8'))

  assert.equal(manifest.packageManager, 'pnpm@12.21.0')
  assert.equal(manifest.engines?.node, '>=22.23.4')

  for (const script of ['test', 'typecheck', 'build', 'dev']) {
    assert.equal(typeof manifest.scripts?.[script], 'string', `missing ${script} script`)
    assert.notEqual(manifest.scripts[script], '', `${script} script must not be empty`)
  }

  const workspace = await readFile(new URL('pnpm-workspace.yaml', root), 'utf8')
  assert.match(workspace, /^\s*- ['"]?apps\/\*['"]?\s*$/m)
  assert.match(workspace, /^\s*- ['"]?packages\/\*['"]?\s*$/m)
})
