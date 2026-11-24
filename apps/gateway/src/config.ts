export interface GatewayConfig {
  readonly host: string
  readonly token: string
}

export type GatewayEnvironment = Readonly<Record<string, string | undefined>>

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost'])

export function createGatewayConfig(env: GatewayEnvironment): GatewayConfig {
  const host = env.GATEWAY_HOST?.trim() || '127.0.0.1'
  const token = env.GATEWAY_TOKEN?.trim() || ''

  if (!LOOPBACK_HOSTS.has(host) && token.length === 0) {
    throw new Error('GATEWAY_TOKEN is required for a non-loopback host')
  }

  return { host, token }
}
