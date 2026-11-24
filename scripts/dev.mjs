import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'

const host = '127.0.0.1'
const gatewayPort = 3001
const webPort = 4173
const token = randomBytes(32).toString('base64url')
const children = new Set()
let stopping = false

function start(args, env = {}, stdio = 'inherit') {
  const child = spawn('pnpm', args, {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, ...env },
    windowsHide: true,
    stdio,
  })
  children.add(child)
  return child
}

function exitCode(child) {
  return child.exitCode ?? (child.signalCode === null ? 1 : 0)
}

async function stop(code = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) {
    if (child.exitCode !== null || child.signalCode !== null) continue
    if (process.platform === 'win32') {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' })
      await new Promise((resolve) => killer.once('exit', resolve))
    } else {
      child.kill('SIGTERM')
    }
  }
  await Promise.all([...children].map((child) => child.exitCode === null && child.signalCode === null
    ? new Promise((resolve) => child.once('exit', resolve))
    : Promise.resolve()))
  process.exit(code)
}

async function waitForGateway() {
  const health = `http://${host}:${gatewayPort}/health`
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(health)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('Gateway did not become healthy')
}

function watch(child, name) {
  child.once('error', (error) => {
    console.error(`${name} failed to start: ${error.message}`)
    void stop(1)
  })
  child.once('exit', (code, signal) => {
    if (stopping) return
    console.error(`${name} exited${signal ? ` from ${signal}` : ` with code ${code ?? 1}`}`)
    void stop(exitCode(child))
  })
}

const gateway = start(
  ['--filter', '@combined-mcp-inspector/gateway', 'dev'],
  { GATEWAY_HOST: host, GATEWAY_PORT: String(gatewayPort), GATEWAY_TOKEN: token },
)
watch(gateway, 'Gateway')

try {
  await waitForGateway()
  const gatewayUrl = `http://${host}:${gatewayPort}`
  console.log(`Gateway healthy at ${gatewayUrl}`)
  const web = startWeb(gatewayUrl)
  watch(web, 'Web')
  console.log(`Web starting at http://${host}:${webPort}`)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  await stop(1)
}

function startWeb(gatewayUrl) {
  return start(
    ['--filter', '@combined-mcp-inspector/web', 'dev'],
    {
      VITE_GATEWAY_URL: gatewayUrl,
      VITE_GATEWAY_TOKEN: token,
      VITE_HOST: host,
      VITE_PORT: String(webPort),
    },
  )
}

process.once('SIGINT', () => void stop(0))
process.once('SIGTERM', () => void stop(0))
