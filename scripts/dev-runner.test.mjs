import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'

import { runDev } from './dev-runner.mjs'

class FakeChild extends EventEmitter {
  constructor(name, log, pid = 100 + log.length) {
    super()
    this.name = name
    this.pid = pid
    this.exitCode = null
    this.signalCode = null
    this.log = log
  }

  kill(signal) {
    this.log.push(['child-kill', this.name, signal])
    this.exitCode = 0
    this.signalCode = signal
    queueMicrotask(() => this.emit('exit', 0, signal))
    return true
  }
}

function harness(overrides = {}) {
  const log = []
  const children = []
  const healthResponses = overrides.healthResponses ?? [{ status: 200, service: 'combined-mcp-inspector-gateway', instanceId: 'instance' }]
  const adapter = {
    platform: overrides.platform ?? 'win32',
    spawn(command, args, options) {
      const name = args.includes('@combined-mcp-inspector/gateway') ? 'gateway' : 'web'
      log.push(['spawn', name, { detached: options.detached, env: { ...options.env } }])
      const child = new FakeChild(name, log)
      children.push(child)
      return child
    },
    async fetch() {
      log.push(['health'])
      if (healthResponses.length > 1) healthResponses.shift()
      const body = healthResponses[0]
      if (body instanceof Error) throw body
      return { ok: body.status === 200, json: async () => body }
    },
    async sleep() {},
    async kill(pid, signal) {
      log.push(['kill', pid, signal])
    },
    async taskkill(pid) {
      log.push(['taskkill', pid])
      const child = children.find((candidate) => candidate.pid === pid)
      if (child) {
        child.exitCode = 0
        child.signalCode = 'SIGTERM'
        queueMicrotask(() => child.emit('exit', 0, 'SIGTERM'))
      }
    },
    waitForExit: async (child) => child.exitCode !== null || child.signalCode !== null,
    now: (() => { let value = 0; return () => value++ })(),
    token: 'secret-token',
    instanceId: 'instance',
    exit: (code) => { log.push(['exit', code]) },
    ...overrides.adapter,
  }
  return { adapter, children, log }
}

test('starts web only after matching gateway readiness', async () => {
  const { adapter, log } = harness()
  await runDev({ adapter, gatewayPort: 3101, webPort: 4273, keepRunning: false })
  assert.deepEqual(log.filter(([event]) => event === 'spawn').map(([, name]) => name), ['gateway', 'web'])
  assert.ok(log.findIndex(([event]) => event === 'health') < log.findIndex(([event, name]) => event === 'spawn' && name === 'web'))
  const env = log.find(([event, name]) => event === 'spawn' && name === 'web')[2].env
  assert.equal(env.GATEWAY_URL, 'http://127.0.0.1:3101')
  assert.equal(env.GATEWAY_TOKEN, 'secret-token')
  assert.equal(env.VITE_GATEWAY_TOKEN, undefined)
  assert.equal(env.GATEWAY_INSTANCE_ID, undefined)
})

test('rejects readiness from an unrelated service and cleans up', async () => {
  const { adapter, log } = harness({
    healthResponses: [{ status: 200, service: 'other', instanceId: 'other' }],
    adapter: { deadlineMs: 0 },
  })
  await assert.rejects(() => runDev({ adapter }), /healthy|readiness|matching/i)
  assert.ok(log.some(([event]) => event === 'taskkill'))
  assert.ok(!log.some(([event, name]) => event === 'spawn' && name === 'web'))
})

test('rejects a gateway exit while readiness is pending', async () => {
  const { adapter, children, log } = harness({ healthResponses: [new Error('refused')] })
  queueMicrotask(() => {
    children[0].exitCode = 23
    children[0].emit('exit', 23, null)
  })
  await assert.rejects(() => runDev({ adapter }), /exited.*23/i)
  assert.ok(log.some(([event, code]) => event === 'exit' && code === 23))
  assert.ok(!log.some(([event, name]) => event === 'spawn' && name === 'web'))
})

test('uses detached POSIX groups, TERM then bounded KILL escalation', async () => {
  const { adapter, log } = harness({ platform: 'linux' })
  adapter.waitForExit = async () => false
  await runDev({ adapter, keepRunning: false })
  assert.ok(log.filter(([event]) => event === 'spawn').every(([, , options]) => options.detached === true))
  assert.ok(log.some(([event, pid, signal]) => event === 'kill' && pid < 0 && signal === 'SIGTERM'))
  assert.ok(log.some(([event, pid, signal]) => event === 'kill' && pid < 0 && signal === 'SIGKILL'))
})
