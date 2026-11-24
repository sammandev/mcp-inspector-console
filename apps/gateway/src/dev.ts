import { app, config } from './index.js'
import { createDevServer } from './dev-server.js'

const port = Number.parseInt(process.env.GATEWAY_PORT ?? '3001', 10)
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error('GATEWAY_PORT must be a valid TCP port')
}

const server = createDevServer(app, config, port)

server.listen(port, config.host, () => {
  console.log(`Gateway ready at http://${config.host}:${port}`)
})

let closing = false
function close() {
  if (closing) return
  closing = true
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    server.closeAllConnections()
    process.exitCode = 1
  }, 5_000)
  timeout.unref()
  server.close((error) => {
    clearTimeout(timeout)
    if (error || timedOut) process.exitCode = 1
  })
}

process.once('SIGINT', close)
process.once('SIGTERM', close)
