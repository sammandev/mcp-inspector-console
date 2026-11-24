import { describe, expect, it } from 'vitest'

import { createGatewayConfig } from './config.js'

describe('createGatewayConfig', () => {
  it('defaults to loopback when host is omitted', () => {
    expect(createGatewayConfig({}).host).toBe('127.0.0.1')
  })

  it('rejects a public host without a token', () => {
    expect(() => createGatewayConfig({ GATEWAY_HOST: '0.0.0.0' })).toThrow(
      /token/i,
    )
  })

  it('accepts a public host with a non-empty token', () => {
    expect(
      createGatewayConfig({ GATEWAY_HOST: '0.0.0.0', GATEWAY_TOKEN: 'secret' }),
    ).toMatchObject({ host: '0.0.0.0', token: 'secret' })
  })
})
