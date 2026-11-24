import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'

const secret = process.env.GATEWAY_BUILD_ASSERTION_SECRET ?? randomBytes(24).toString('hex')
const env = {
  ...process.env,
  GATEWAY_BUILD_ASSERTION_SECRET: secret,
  GATEWAY_TOKEN: secret,
}
const result = spawnSync('pnpm', ['-r', '--if-present', 'build'], { env, stdio: 'inherit' })
if (result.status !== 0) process.exit(result.status ?? 1)

const assertion = spawnSync(process.execPath, ['scripts/assert-web-build-secrets.mjs'], { env, stdio: 'inherit' })
process.exit(assertion.status ?? 1)
