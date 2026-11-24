import { describe, expect, it } from 'vitest'

import { createGatewayApp } from './app.js'
import { createGatewayConfig } from './config.js'

describe('gateway routes', () => {
  it('serves local health status without authentication', async () => {
    const response = await createGatewayApp(createGatewayConfig({})).request('/health')

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('ok')
  })

  it('rejects version requests without the configured bearer token', async () => {
    const app = createGatewayApp(
      createGatewayConfig({ GATEWAY_TOKEN: 'correct-token' }),
    )

    const response = await app.request('/api/version')

    expect(response.status).toBe(401)
  })

  it.each(['wrong-token', 'short', 'a-much-longer-wrong-token'])(
    'rejects a version request with bearer token %s',
    async (token) => {
      const app = createGatewayApp(
        createGatewayConfig({ GATEWAY_TOKEN: 'correct-token' }),
      )

      const response = await app.request('/api/version', {
        headers: { Authorization: `Bearer ${token}` },
      })

      expect(response.status).toBe(401)
    },
  )

  it('returns version metadata for the configured bearer token', async () => {
    const app = createGatewayApp(
      createGatewayConfig({ GATEWAY_TOKEN: 'correct-token' }),
    )

    const response = await app.request('/api/version', {
      headers: { Authorization: 'Bearer correct-token' },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ version: '0.0.0' })
  })
})
