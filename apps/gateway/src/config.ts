export interface GatewayConfig {
  readonly host: string
  readonly token: string
}

export type GatewayEnvironment = Readonly<Record<string, string | undefined>>

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1'])
const ASCII_PRINTABLE_TOKEN = /^[\x21-\x7e]+$/

export function createGatewayConfig(env: GatewayEnvironment): GatewayConfig {
  const host = env.GATEWAY_HOST === undefined ? '127.0.0.1' : env.GATEWAY_HOST
  const token = env.GATEWAY_TOKEN ?? ''

  if (token.length > 0 && !ASCII_PRINTABLE_TOKEN.test(token)) {
    throw new Error('GATEWAY_TOKEN must contain only non-whitespace ASCII bytes 33-126')
  }

  if (!LOOPBACK_HOSTS.has(host) && token.length === 0) {
    throw new Error('GATEWAY_TOKEN is required for a non-loopback host')
  }

  return { host, token }
}
