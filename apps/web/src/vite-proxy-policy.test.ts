import { describe, expect, it } from 'vitest'

import { gatewayProxyRequestPolicy } from '../vite.config.js'

describe('Vite gateway proxy request policy', () => {
  const sameOrigin = 'http://127.0.0.1:4173'

  it('allows a same-origin browser request', () => {
    expect(gatewayProxyRequestPolicy({ origin: sameOrigin, 'sec-fetch-site': 'same-origin' }, sameOrigin)).toBe(true)
  })

  it('blocks a cross-origin browser request even from another loopback origin', () => {
    expect(gatewayProxyRequestPolicy({ origin: 'http://localhost:4173', 'sec-fetch-site': 'same-origin' }, sameOrigin)).toBe(false)
    expect(gatewayProxyRequestPolicy({ origin: 'http://127.0.0.1:9999', 'sec-fetch-site': 'cross-site' }, sameOrigin)).toBe(false)
  })

  it('blocks cross-site metadata and permits same-origin fetch metadata without Origin', () => {
    expect(gatewayProxyRequestPolicy({ 'sec-fetch-site': 'cross-site' }, sameOrigin)).toBe(false)
    expect(gatewayProxyRequestPolicy({ 'sec-fetch-site': 'same-site' }, sameOrigin)).toBe(false)
    expect(gatewayProxyRequestPolicy({ 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'cors' }, sameOrigin)).toBe(true)
  })

  it('allows no-Origin local tooling without browser fetch metadata', () => {
    expect(gatewayProxyRequestPolicy({}, sameOrigin)).toBe(true)
    expect(gatewayProxyRequestPolicy({ 'user-agent': 'curl/8.0' }, sameOrigin)).toBe(true)
  })
})
