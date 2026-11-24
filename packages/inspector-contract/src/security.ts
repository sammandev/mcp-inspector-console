import type { BackendConnectionProfile, BrowserSafeProfile, JsonValue } from './types.js'

const REDACTED = '[REDACTED]'
const SECRET_KEY = /(?:authorization|cookie|token|secret|password|credential|api[-_]?key|private[-_]?key)/i

function sanitizeUrl(value: string): string {
  try {
    const url = new URL(value)
    if (url.username) url.username = REDACTED
    if (url.password) url.password = REDACTED
    for (const key of url.searchParams.keys()) {
      if (SECRET_KEY.test(key)) url.searchParams.set(key, REDACTED)
    }
    return url.toString()
  } catch {
    return REDACTED
  }
}

function redactValue(value: unknown, key = '', forceSecret = false): JsonValue {
  if (forceSecret || SECRET_KEY.test(key)) return REDACTED
  if (Array.isArray(value)) return value.map((item) => redactValue(item))
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([name, item]) => [
      name,
      redactValue(item, name, forceSecret || key === 'headers' || key === 'environment' || key === 'oauth'),
    ])) as JsonValue
  }
  if (typeof value === 'string') return key.toLowerCase().includes('url') ? sanitizeUrl(value) : value
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value
  return String(value)
}

export function redactConnectionProfile(profile: BackendConnectionProfile): JsonValue {
  return redactValue(profile)
}

export function toBrowserSafeProfile(profile: BackendConnectionProfile): BrowserSafeProfile {
  const secretFields: string[] = []
  if (profile.environment !== undefined) secretFields.push('environment')
  if (profile.oauth !== undefined) secretFields.push('oauth')
  for (const [name] of Object.entries(profile.headers ?? {})) secretFields.push(`headers.${name}`)

  let url = 'url' in profile ? profile.url : undefined
  if (url !== undefined) {
    const parsed = new URL(url)
    if (parsed.username || parsed.password) secretFields.push('url-credentials')
    if ([...parsed.searchParams.keys()].some((key) => SECRET_KEY.test(key))) secretFields.push('url-query')
    parsed.username = ''
    parsed.password = ''
    for (const key of parsed.searchParams.keys()) {
      if (SECRET_KEY.test(key)) parsed.searchParams.delete(key)
    }
    url = parsed.toString().replace(/\/$/, 'url' in profile && profile.url.endsWith('/') ? '/' : '')
  }

  const common = { id: profile.id, ...(profile.name === undefined ? {} : { name: profile.name }) }
  if (profile.transport === 'stdio') {
    return { ...common, transport: 'stdio', command: profile.command, ...(profile.args === undefined ? {} : { args: profile.args }), ...(profile.cwd === undefined ? {} : { cwd: profile.cwd }), secretFields }
  }
  return { ...common, transport: profile.transport, url: url ?? '', secretFields }
}
