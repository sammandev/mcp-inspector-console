import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'

const secret = process.env.GATEWAY_BUILD_ASSERTION_SECRET
if (!secret) throw new Error('GATEWAY_BUILD_ASSERTION_SECRET is required')

async function files(path) {
  const entries = await readdir(path, { withFileTypes: true })
  const result = []
  for (const entry of entries) {
    const child = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, path)
    if (entry.isDirectory()) result.push(...await files(child))
    else result.push(child)
  }
  return result
}

for (const file of await files(new URL('../apps/web/dist/', import.meta.url))) {
  const contents = await readFile(file)
  assert.equal(contents.includes(Buffer.from(secret)), false, `${file.pathname} emitted the server-only gateway secret`)
}
