import type { ConnectionProfile } from '@combined-mcp-inspector/contract'
import { createHash, timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'

import type { GatewayConfig } from './config.js'

interface GatewayVersion {
  readonly version: string
  readonly supportedTransports: ReadonlyArray<ConnectionProfile['transport']>
}

const VERSION: GatewayVersion = {
  version: '0.0.0',
  supportedTransports: [],
}

function bearerTokenMatches(header: string | undefined, expected: string): boolean {
  if (expected.length === 0 || header === undefined) return false

  const match = /^Bearer ([\x21-\x7e]+)$/.exec(header)
  if (match === null) return false

  const actualDigest = createHash('sha256').update(match[1]).digest()
  const expectedDigest = createHash('sha256').update(expected).digest()

  return timingSafeEqual(actualDigest, expectedDigest)
}

export function createGatewayApp(config: GatewayConfig): Hono {
  const app = new Hono()

  app.get('/health', (context) => context.text('ok'))

  app.use('/api/*', async (context, next) => {
    if (!bearerTokenMatches(context.req.header('Authorization'), config.token)) {
      return context.json({ error: 'Unauthorized' }, 401)
    }

    await next()
  })

  app.get('/api/version', (context) => context.json({ version: VERSION.version }))

  return app
}
