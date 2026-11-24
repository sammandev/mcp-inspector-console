import { describe, expect, it } from 'vitest'

import { createGatewayApp } from './app.js'
import { createGatewayConfig } from './config.js'

const TOKEN = 'correct-token'

function authenticatedApp() {
  return createGatewayApp(createGatewayConfig({ GATEWAY_TOKEN: TOKEN }))
}

describe('gateway routes', () => {
  it('serves local health status without authentication', async () => {
    const response = await authenticatedApp().request('/health')

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('ok')
  })

  it.each(['/api/version', '/api/future-control-route'])(
    'rejects unauthenticated control request to %s',
    async (path) => {
      const response = await authenticatedApp().request(path)
      const body = await response.text()

      expect(response.status).toBe(401)
      expect(body).not.toContain(TOKEN)
    },
  )

  it.each(['wrong-token', 'short', 'a-much-longer-wrong-token'])(
    'rejects a version request with bearer token %s',
    async (token) => {
      const response = await authenticatedApp().request('/api/version', {
        headers: { Authorization: `Bearer ${token}` },
      })

      expect(response.status).toBe(401)
      expect(await response.text()).not.toContain(TOKEN)
    },
  )

  it.each([
    'bearer correct-token',
    'Bearer  correct-token',
    'Bearer\tcorrect-token',
    'Bearer s\u00ebcret',
  ])('rejects malformed authorization syntax %j', async (authorization) => {
    const response = await authenticatedApp().request('/api/version', {
      headers: { Authorization: authorization },
    })

    expect(response.status).toBe(401)
  })

  it('returns version metadata for an exact valid bearer credential', async () => {
    const response = await authenticatedApp().request('/api/version', {
      headers: { Authorization: 'Bearer correct-token' },
    })
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(JSON.parse(body)).toEqual({ version: '0.0.0' })
    expect(body).not.toContain(TOKEN)
  })

  it('keeps arbitrary control routes behind auth when they exist later', async () => {
    const app = authenticatedApp()
    app.get('/api/future-control-route', (context) => context.text('private'))

    const response = await app.request('/api/future-control-route')

    expect(response.status).toBe(401)
  })
})
