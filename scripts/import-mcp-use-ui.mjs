import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { access, copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const pin = '8ff4b865e0e5712c66d5077e93392807daca9354'
const repository = resolve(process.argv[2] ?? '../mcp-use')
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const target = join(root, 'apps', 'web', 'vendor', 'mcp-use')
if (execFileSync('git', ['-C', repository, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !== pin) {
  throw new Error(`The mcp-use checkout must be at ${pin}`)
}
if (!process.argv.includes('--force') && await access(target).then(() => true, () => false)) {
  throw new Error('The vendored UI exists and contains combined-Inspector modifications; rerun with --force and reapply them')
}
const upstream = join(repository, 'libraries', 'typescript', 'packages', 'inspector')
const files = []
async function copyTree(source, destination, prefix, relative = '') {
  await mkdir(destination, { recursive: true })
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (entry.name === '__tests__' || /\.(test|spec|stories)\./.test(entry.name)) continue
    const name = relative ? `${relative}/${entry.name}` : entry.name
    const from = join(source, entry.name)
    const to = join(destination, entry.name)
    if (entry.isDirectory()) await copyTree(from, to, prefix, name)
    else {
      await copyFile(from, to)
      files.push({ path: `${prefix}/${name}`, sha256: createHash('sha256').update(await readFile(from)).digest('hex') })
    }
  }
}
await copyTree(join(upstream, 'src', 'client'), join(target, 'client'), 'client')
await copyTree(join(upstream, 'public'), join(root, 'apps', 'web', 'public', 'mcp-use'), 'public')
await copyFile(join(repository, 'LICENSE'), join(target, 'LICENSE'))
await writeFile(join(target, 'manifest.json'), JSON.stringify({
  repository: 'mcp-use/mcp-use', commit: pin, packageVersion: '20.3.33',
  sourceRoot: 'libraries/typescript/packages/inspector',
  license: 'MIT', files, modified: [],
}, null, 2) + '\n')
console.log(`Imported pinned mcp-use UI and assets into ${target}`)
