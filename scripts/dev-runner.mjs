import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'

const HOST = '127.0.0.1'
const SERVICE = 'combined-mcp-inspector-gateway'
const TERMINATION_GRACE_MS = 2_000

function hasExited(child) {
  return child.exitCode !== null || child.signalCode !== null
}

function unexpectedExit(child, name) {
  if (child.signalCode) return new Error(`${name} exited from ${child.signalCode}`)
  return new Error(`${name} exited with code ${child.exitCode ?? 1}`)
}

function unexpectedExitCode(child) {
  if (child.signalCode) return 1
  return child.exitCode || 1
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
  await new Promise((resolve, reject) => {
    const killer = spawn('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true })
    const timer = setTimeout(() => {
      killer.kill('SIGKILL')
      reject(new Error(`taskkill timed out for pid ${pid}`))
    }, TERMINATION_GRACE_MS)
    killer.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    killer.once('exit', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(`taskkill failed for pid ${pid} with code ${code}`))
    })
  })
}

function defaultAdapter() {
  return {
    platform: process.platform,
    spawn,
    fetch: globalThis.fetch,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    kill: (pid, signal) => process.kill(pid, signal),
    groupExists: (pid) => {
      try { process.kill(pid, 0); return true } catch (error) {
        if (error?.code === 'ESRCH') return false
        throw error
      }
    },
    taskkill: defaultTaskkill,
    waitForExit: defaultWaitForExit,
    now: Date.now,
    token: randomBytes(32).toString('base64url'),
    instanceId: randomBytes(18).toString('base64url'),
    deadlineMs: 15_000,
    exit: (code) => process.exitCode = code,
  }
}

function isGroupAlive(adapter, child) {
  return adapter.groupExists(-child.pid)
}

async function terminate(child, adapter) {
  if (adapter.platform === 'win32') {
    if (hasExited(child)) return
    await adapter.taskkill(child.pid)
    if (!await adapter.waitForExit(child, TERMINATION_GRACE_MS)) {
      throw new Error(`Windows process tree for ${child.name ?? child.pid} did not exit`)
    }
    return
  }

  const groupId = -child.pid
  if (!isGroupAlive(adapter, child)) return
  await adapter.kill(groupId, 'SIGTERM').catch((error) => {
    if (error?.code !== 'ESRCH') throw error
  })
  const leaderExited = await adapter.waitForExit(child, TERMINATION_GRACE_MS)
  if (!isGroupAlive(adapter, child)) return

  await adapter.kill(groupId, 'SIGKILL').catch((error) => {
    if (error?.code !== 'ESRCH') throw error
  })
  if (leaderExited) await adapter.sleep(0)
  if (!await adapter.waitForExit(child, TERMINATION_GRACE_MS) || isGroupAlive(adapter, child)) {
    throw new Error(`POSIX process group ${groupId} still exists after SIGKILL`)
  }
}

export async function runDev({
  adapter = defaultAdapter(),
  gatewayPort = Number.parseInt(process.env.DEV_GATEWAY_PORT ?? '3001', 10),
  webPort = Number.parseInt(process.env.DEV_WEB_PORT ?? '4173', 10),
  keepRunning = true,
} = {}) {
  const children = new Set()
  let stopPromise
  let rejectFailure
  let failureError
  const failure = new Promise((resolve, reject) => {
    rejectFailure = reject
  })
  // Consumers race this promise against shutdown; avoid an unhandled rejection if cleanup
  // is the first observed failure path.
  failure.catch(() => {})

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

  const stop = (code = 0) => stopPromise ??= (async () => {
    const errors = []
    for (const child of [...children].reverse()) {
      try { await terminate(child, adapter) } catch (error) { errors.push(error) }
    }
    if (errors.length > 0) {
      const detail = errors.map((error) => error.message).join('; ')
      const error = new AggregateError(errors, `Failed to terminate development process tree: ${detail}`)
      adapter.exit(1)
      rejectFailure(error)
      throw error
    }
    adapter.exit(code)
  })()

  const fail = (error, code = 1) => {
    failureError ??= error
    void stop(code).then(
      () => rejectFailure(error),
      (cleanupError) => rejectFailure(cleanupError),
    )
  }

  const watch = (child, name) => {
    child.once('error', (error) => fail(new Error(`${name} failed to start: ${error.message}`), 1))
    child.once('exit', (code, signal) => {
      if (stopPromise) return
      fail(unexpectedExit(child, name), unexpectedExitCode(child))
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
    if (failureError || hasExited(gateway)) break
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
  if (!failureError && !hasExited(gateway)) {
    try {
      const response = await adapter.fetch(healthUrl)
      const body = response.ok ? await response.json() : undefined
      ready = body?.service === SERVICE && body?.instanceId === adapter.instanceId
    } catch {}
  }
  if (!ready) {
    const error = failureError ?? (hasExited(gateway)
      ? unexpectedExit(gateway, 'Gateway')
      : new Error('Gateway did not provide matching readiness identity'))
    await stop(hasExited(gateway) ? unexpectedExitCode(gateway) : 1)
    failureError ??= error
    throw error
  }

  if (adapter.afterReadiness) await adapter.afterReadiness()
  if (failureError || hasExited(gateway)) {
    const error = failureError ?? unexpectedExit(gateway, 'Gateway during web handoff')
    await stop(hasExited(gateway) ? unexpectedExitCode(gateway) : 1)
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
  if (hasExited(web)) {
    const error = unexpectedExit(web, 'Web')
    await stop(unexpectedExitCode(web))
    throw error
  }
  if (hasExited(gateway) || failureError) {
    const error = failureError ?? unexpectedExit(gateway, 'Gateway during web handoff')
    await stop(1)
    throw error
  }
  console.log(`Web starting at http://${HOST}:${webPort}`)

  const stack = { stop, failure }
  if (!keepRunning) await stop(0)
  return stack
}
