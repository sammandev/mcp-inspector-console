import { runDev } from './dev-runner.mjs'

let stack
try {
  stack = await runDev()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = process.exitCode || 1
}

if (stack) {
  const shutdown = async (code) => {
    try {
      await stack.stop(code)
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    }
  }
  process.once('SIGINT', () => void shutdown(0))
  process.once('SIGTERM', () => void shutdown(0))
  try {
    await stack.failure
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode ||= 1
  }
}
