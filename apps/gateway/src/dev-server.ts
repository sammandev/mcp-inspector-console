import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'

import type { Hono } from 'hono'
import type { GatewayConfig } from './config.js'

const METHODS_WITHOUT_BODY = new Set(['GET', 'HEAD'])

function sendError(response: ServerResponse, status: number, message: string) {
  if (response.headersSent || response.writableEnded) return
  response.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(message),
    Connection: 'close',
  })
  response.end(message)
}

async function readBoundedBody(request: IncomingMessage, maxBytes: number): Promise<Buffer> {
  const declared = request.headers['content-length']
  if (declared !== undefined) {
    const length = Array.isArray(declared) ? Number.NaN : Number(declared)
    if (!Number.isSafeInteger(length) || length < 0 || length > maxBytes) {
      const error = new Error('Request body too large')
      error.name = 'PayloadTooLargeError'
      throw error
    }
  }

  let bytes = 0
  const chunks: Buffer[] = []
  for await (const value of request) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value)
    bytes += chunk.byteLength
    if (bytes > maxBytes) {
      const error = new Error('Request body too large')
      error.name = 'PayloadTooLargeError'
      throw error
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks, bytes)
}

export function createDevServer(app: Hono, config: GatewayConfig, port: number): Server {
  return createServer(async (request, response) => {
    try {
      const hasBody = !METHODS_WITHOUT_BODY.has(request.method ?? 'GET')
      const body = hasBody ? await readBoundedBody(request, config.maxRequestBytes) : undefined
      const origin = `http://${config.host}:${port}`
      const webResponse = await app.fetch(new Request(new URL(request.url ?? '/', origin), {
        method: request.method,
        headers: request.headers as HeadersInit,
        body,
        duplex: body === undefined ? undefined : 'half',
      } as RequestInit))

      response.writeHead(webResponse.status, Object.fromEntries(webResponse.headers))
      if (webResponse.body === null) {
        response.end()
        return
      }
      const reader = webResponse.body.getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          response.write(Buffer.from(value))
        }
        response.end()
      } finally {
        reader.releaseLock()
      }
    } catch (error) {
      request.resume()
      if (error instanceof Error && error.name === 'PayloadTooLargeError') {
        sendError(response, 413, 'Request body too large')
        return
      }
      sendError(response, 500, 'Internal server error')
    }
  })
}
