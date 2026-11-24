import { createGatewayApp } from './app.js'
import { createGatewayConfig } from './config.js'

export { createGatewayApp } from './app.js'
export { createGatewayConfig } from './config.js'
export type { GatewayConfig, GatewayEnvironment } from './config.js'

export const config = createGatewayConfig(process.env)
export const app = createGatewayApp(config)
