import { runDev } from './dev-runner.mjs'

let stack
try {
  stack = await runDev()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}

if (stack) {
  const shutdown = (code) => void stack.stop(code)
  process.once('SIGINT', () => shutdown(0))
  process.once('SIGTERM', () => shutdown(0))
}
