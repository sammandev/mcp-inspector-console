import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'

import { runDev } from './dev-runner.mjs'

class Child extends EventEmitter {
  constructor(name, pid) {
    super()
    this.name = name
    this.pid = pid
    this.exitCode = null
    this.signalCode = null
  }
}

function lifecycleHarness(overrides = {}) {
  const log = []
  const children = []
  const body = { service: 'combined-mcp-inspector-gateway', instanceId: 'instance' }
  let groupAlive = false
  const adapter = {
    platform: 'linux',
    token: 'secret',
    instanceId: 'instance',
    now: (() => { let tick = 0; return () => tick++ })(),
    deadlineMs: 10,
    spawn(command, args) {
      const name = args.includes('@combined-mcp-inspector/gateway') ? 'gateway' : 'web'
      const child = new Child(name, 100 + children.length)
      children.push(child)
      log.push(['spawn', name])
      return child
    },
    async fetch() { return { ok: true, json: async () => body } },
    async sleep() {},
    async kill(pid, signal) {
      log.push(['kill', pid, signal])
      if (signal === 'SIGTERM' || signal === 'SIGKILL') groupAlive = false
    },
    groupExists(pid) {
      log.push(['kill', pid, 0])
      return groupAlive
    },
    waitForExit: async () => true,
    async taskkill() {},
    exit: (code) => log.push(['exit', code]),
    ...overrides,
  }
  return {
    adapter,
    children,
    log,
    setGroupAlive(value) { groupAlive = value },
    isGroupAlive() { return groupAlive },
  }
}

test('unexpected signal exit is failure, not success', async () => {
  const { adapter, children, log } = lifecycleHarness()
  const stack = await runDev({ adapter })
  children[0].exitCode = null
  children[0].signalCode = 'SIGTERM'
  children[0].emit('exit', null, 'SIGTERM')
  await assert.rejects(stack.failure, /Gateway exited from SIGTERM/)
  await Promise.resolve()
  assert.ok(log.some(([event, code]) => event === 'exit' && code === 1))
})

test('leader exit with surviving POSIX group is killed and verified', async () => {
  const state = lifecycleHarness()
  state.setGroupAlive(true)
  const { adapter, children, log } = state
  adapter.kill = async (pid, signal) => {
    log.push(['kill', pid, signal])
    if (signal === 'SIGKILL') state.setGroupAlive(false)
  }
  adapter.groupExists = (pid) => {
    log.push(['kill', pid, 0])
    return state.isGroupAlive()
  }
  const stack = await runDev({ adapter })
  children[0].exitCode = 0
  children[0].emit('exit', 0, null)
  await assert.rejects(stack.failure, /Gateway exited/)
  assert.ok(log.some(([event, pid, signal]) => event === 'kill' && pid < 0 && signal === 'SIGTERM'))
  assert.ok(log.some(([event, pid, signal]) => event === 'kill' && pid < 0 && signal === 'SIGKILL'))
  assert.ok(log.some(([event, pid, signal]) => event === 'kill' && pid < 0 && signal === 0))
})

test('surviving POSIX descendants make explicit cleanup reject', async () => {
  const state = lifecycleHarness()
  state.setGroupAlive(true)
  const { adapter } = state
  adapter.waitForExit = async () => true
  adapter.kill = async (pid, signal) => {
    state.log.push(['kill', pid, signal])
  }
  adapter.groupExists = (pid) => {
    state.log.push(['kill', pid, 0])
    return true
  }
  const stack = await runDev({ adapter, keepRunning: true })
  await assert.rejects(stack.stop(0), /process group.*still exists/i)
})

test('Windows taskkill failure rejects cleanup', async () => {
  const { adapter } = lifecycleHarness({ platform: 'win32', taskkill: async () => { throw new Error('taskkill failed') } })
  const stack = await runDev({ adapter })
  await assert.rejects(stack.stop(0), /taskkill failed/)
})

test('Windows termination timeout is fatal even for a requested stop', async () => {
  const { adapter, log } = lifecycleHarness({
    platform: 'win32',
    taskkill: async () => {},
    waitForExit: async () => false,
  })
  const stack = await runDev({ adapter })

  await assert.rejects(stack.stop(0), /did not exit/i)
  assert.ok(log.some(([event, code]) => event === 'exit' && code === 1))
})

test('gateway exit in readiness-to-web handoff prevents web spawn and rejects', async () => {
  const state = lifecycleHarness()
  state.adapter.afterReadiness = async () => {
    state.children[0].exitCode = 17
    state.children[0].emit('exit', 17, null)
  }
  await assert.rejects(() => runDev({ adapter: state.adapter }), /Gateway exited.*17|handoff/i)
  assert.ok(!state.log.some(([event, name]) => event === 'spawn' && name === 'web'))
})

test('web early exit rejects failure promise and cleans gateway', async () => {
  const state = lifecycleHarness()
  state.setGroupAlive(true)
  const stack = await runDev({ adapter: state.adapter })
  state.children[1].exitCode = 9
  state.children[1].emit('exit', 9, null)
  await assert.rejects(stack.failure, /Web exited with code 9/)
  assert.ok(state.log.some(([event, pid, signal]) => event === 'kill' && pid < 0 && signal === 'SIGTERM'))
})
