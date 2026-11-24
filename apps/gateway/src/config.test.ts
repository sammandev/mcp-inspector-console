import { describe, expect, it } from 'vitest'

import { createGatewayConfig } from './config.js'

describe('createGatewayConfig', () => {
  it('defaults to the exact IPv4 loopback host when host is omitted', () => {
    expect(createGatewayConfig({}).host).toBe('127.0.0.1')
  })

  it.each(['127.0.0.1', '::1'])(
    'accepts exact loopback host %s without a token',
    (host) => {
      expect(createGatewayConfig({ GATEWAY_HOST: host })).toMatchObject({
        host,
        token: '',
      })
    },
  )

  it.each([
    'localhost',
    '[::1]',
    '0:0:0:0:0:0:0:1',
    'LOCALHOST',
    '127.0.0.1.local',
    '0.0.0.0',
  ])('rejects non-authoritative loopback host %s without a token', (host) => {
    expect(() => createGatewayConfig({ GATEWAY_HOST: host })).toThrow(/token/i)
  })

  it('preserves the exact host and configured token for a public bind', () => {
    expect(
      createGatewayConfig({ GATEWAY_HOST: '0.0.0.0', GATEWAY_TOKEN: '!secret~' }),
    ).toEqual({ host: '0.0.0.0', token: '!secret~' })
  })

  it('rejects a whitespace-only token for a public host', () => {
    expect(() =>
      createGatewayConfig({ GATEWAY_HOST: '0.0.0.0', GATEWAY_TOKEN: '   ' }),
    ).toThrow(/token/i)
  })

  it.each([' secret', 'secret ', 'secret token', 'sëcret', 'secret\n'])(
    'rejects token containing invalid bytes: %j',
    (token) => {
      expect(() => createGatewayConfig({ GATEWAY_TOKEN: token })).toThrow(/token/i)
    },
  )
})
