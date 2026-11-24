import { createServer, request as httpRequest } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'

import { createGatewayApp } from './app.js'
import { createGatewayConfig } from './config.js'
import { createDevServer } from './dev-server.js'

const servers: ReturnType<typeof createServer>[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))))
})

async function listen(maxRequestBytes: number) {
  const config = createGatewayConfig({
    GATEWAY_HOST: '127.0.0.1',
    GATEWAY_TOKEN: 'test-token',
    GATEWAY_MAX_REQUEST_BYTES: String(maxRequestBytes),
  })
  const server = createDevServer(createGatewayApp(config), config, 0)
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, config.host, resolve))
  const { port } = server.address() as AddressInfo
  return `http://127.0.0.1:${port}`
}

describe('development Node server boundary', () => {
  it('rejects a body larger than the configured limit with 413', async () => {
    const baseUrl = await listen(8)
    const response = await fetch(`${baseUrl}/api/version`, {
      method: 'POST',
      headers: { Authorization: 'Bearer test-token' },
      body: '123456789',
    })

    expect(response.status).toBe(413)
    expect(await response.text()).toMatch(/too large/i)
  })

  it('rejects an oversized declared content length before accepting the body', async () => {
    const baseUrl = await listen(8)
    const status = await new Promise<number>((resolve, reject) => {
      const request = httpRequest(`${baseUrl}/api/version`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Length': '9',
        },
      }, (response) => {
        response.resume()
        response.once('end', () => resolve(response.statusCode ?? 0))
      })
      request.once('error', reject)
      request.end('x')
    })

    expect(status).toBe(413)
  })

  it('allows a body exactly at the configured limit through bounded buffering', async () => {
    const app = createGatewayApp(createGatewayConfig({ GATEWAY_TOKEN: 'test-token' }))
    app.post('/api/echo', async (context) => context.text(await context.req.text()))
    const config = createGatewayConfig({
      GATEWAY_HOST: '127.0.0.1',
      GATEWAY_TOKEN: 'test-token',
      GATEWAY_MAX_REQUEST_BYTES: '8',
    })
    const server = createDevServer(app, config, 0)
    servers.push(server)
    await new Promise<void>((resolve) => server.listen(0, config.host, resolve))
    const { port } = server.address() as AddressInfo

    const response = await fetch(`http://127.0.0.1:${port}/api/echo`, {
      method: 'POST',
      headers: { Authorization: 'Bearer test-token' },
      body: '12345678',
    })

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('12345678')
  })
})
