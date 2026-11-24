import { createServer } from 'node:http'

import { app, config } from './index.js'

const port = Number.parseInt(process.env.GATEWAY_PORT ?? '3001', 10)
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error('GATEWAY_PORT must be a valid TCP port')
}

const server = createServer(async (request, response) => {
  const chunks: Uint8Array[] = []
  for await (const chunk of request) chunks.push(chunk)

  const origin = `http://${config.host}:${port}`
  const webResponse = await app.fetch(new Request(new URL(request.url ?? '/', origin), {
    method: request.method,
    headers: request.headers as HeadersInit,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : Buffer.concat(chunks),
    duplex: request.method === 'GET' || request.method === 'HEAD' ? undefined : 'half',
  } as RequestInit))

  response.writeHead(webResponse.status, Object.fromEntries(webResponse.headers))
  if (webResponse.body === null) {
    response.end()
    return
  }
  response.end(Buffer.from(await webResponse.arrayBuffer()))
})

server.listen(port, config.host, () => {
  console.log(`Gateway ready at http://${config.host}:${port}`)
})

function close() {
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 5_000).unref()
}

process.once('SIGINT', close)
process.once('SIGTERM', close)
