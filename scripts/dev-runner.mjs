import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'

const HOST = '127.0.0.1'
const SERVICE = 'combined-mcp-inspector-gateway'
const TERMINATION_GRACE_MS = 2_000

function hasExited(child) {
  return child.exitCode !== null || child.signalCode !== null
}

function childExitCode(child) {
  return child.exitCode ?? (child.signalCode === null ? 1 : 0)
}

async function defaultWaitForExit(child, timeoutMs) {
  if (hasExited(child)) return true
  return await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.off('exit', onExit)
      resolve(false)
    }, timeoutMs)
    const onExit = () => {
      clearTimeout(timer)
      resolve(true)
    }
    child.once('exit', onExit)
  })
}

async function defaultTaskkill(pid) {
  await new Promise((resolve) => {
    const killer = spawn('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true })
    const timer = setTimeout(() => {
      killer.kill('SIGKILL')
      resolve()
    }, TERMINATION_GRACE_MS)
    const done = () => {
      clearTimeout(timer)
      resolve()
    }
    killer.once('error', done)
    killer.once('exit', done)
  })
}

function defaultAdapter() {
  return {
    platform: process.platform,
    spawn,
    fetch: globalThis.fetch,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    kill: (pid, signal) => process.kill(pid, signal),
    taskkill: defaultTaskkill,
    waitForExit: defaultWaitForExit,
    now: Date.now,
    token: randomBytes(32).toString('base64url'),
    instanceId: randomBytes(18).toString('base64url'),
    deadlineMs: 15_000,
    exit: (code) => process.exitCode = code,
  }
}

async function terminate(child, adapter) {
  if (hasExited(child)) return
  if (adapter.platform === 'win32') {
    await adapter.taskkill(child.pid)
    await adapter.waitForExit(child, TERMINATION_GRACE_MS)
    return
  }
  const groupId = -child.pid
  try { await adapter.kill(groupId, 'SIGTERM') } catch (error) {
    if (error?.code !== 'ESRCH') throw error
  }
  if (await adapter.waitForExit(child, TERMINATION_GRACE_MS)) return
  try { await adapter.kill(groupId, 'SIGKILL') } catch (error) {
    if (error?.code !== 'ESRCH') throw error
  }
  await adapter.waitForExit(child, TERMINATION_GRACE_MS)
}

export async function runDev({
  adapter = defaultAdapter(),
  gatewayPort = Number.parseInt(process.env.DEV_GATEWAY_PORT ?? '3001', 10),
  webPort = Number.parseInt(process.env.DEV_WEB_PORT ?? '4173', 10),
  keepRunning = true,
} = {}) {
  const children = new Set()
  let stopPromise
  let failure

  const start = (args, env) => {
    const child = adapter.spawn('pnpm', args, {
      cwd: new URL('../', import.meta.url),
      env: { ...process.env, ...env },
      detached: adapter.platform !== 'win32',
      windowsHide: true,
      stdio: 'inherit',
    })
    children.add(child)
    return child
  }

  const stop = (code) => stopPromise ??= (async () => {
    for (const child of [...children].reverse()) await terminate(child, adapter)
    adapter.exit(code)
  })()

  const watch = (child, name) => {
    child.once('error', (error) => {
      failure ??= new Error(`${name} failed to start: ${error.message}`)
      void stop(1)
    })
    child.once('exit', (code, signal) => {
      if (stopPromise) return
      failure ??= new Error(`${name} exited${signal ? ` from ${signal}` : ` with code ${code ?? 1}`}`)
      void stop(childExitCode(child))
    })
  }

  const gateway = start(['--filter', '@combined-mcp-inspector/gateway', 'dev'], {
    GATEWAY_HOST: HOST,
    GATEWAY_PORT: String(gatewayPort),
    GATEWAY_TOKEN: adapter.token,
    GATEWAY_INSTANCE_ID: adapter.instanceId,
  })
  watch(gateway, 'Gateway')

  const healthUrl = `http://${HOST}:${gatewayPort}/health`
  const deadline = adapter.now() + (adapter.deadlineMs ?? 15_000)
  while (adapter.now() <= deadline) {
    if (failure || hasExited(gateway)) break
    
    try {
      const response = await adapter.fetch(healthUrl)
      if (response.ok) {
        const body = await response.json()
        if (body?.service === SERVICE && body?.instanceId === adapter.instanceId) break
      }
    } catch {
      if (hasExited(gateway)) break
    }
    await adapter.sleep(100)
  }

  let ready = false
  if (!failure && !hasExited(gateway)) {
    try {
      const response = await adapter.fetch(healthUrl)
      const body = response.ok ? await response.json() : undefined
      ready = body?.service === SERVICE && body?.instanceId === adapter.instanceId
    } catch {}
  }
  if (!ready) {
    const code = hasExited(gateway) ? childExitCode(gateway) : 1
    const error = failure ?? (hasExited(gateway)
      ? new Error(`Gateway exited with code ${code} before readiness`)
      : new Error('Gateway did not provide matching readiness identity'))
    failure = error
    await stop(code)
    throw error
  }

  console.log(`Gateway healthy at http://${HOST}:${gatewayPort}`)
  const web = start(['--filter', '@combined-mcp-inspector/web', 'dev'], {
    GATEWAY_URL: `http://${HOST}:${gatewayPort}`,
    GATEWAY_TOKEN: adapter.token,
    WEB_HOST: HOST,
    WEB_PORT: String(webPort),
  })
  watch(web, 'Web')
  console.log(`Web starting at http://${HOST}:${webPort}`)

  if (!keepRunning) {
    await stop(0)
    return { stop }
  }
  return { stop }
}
