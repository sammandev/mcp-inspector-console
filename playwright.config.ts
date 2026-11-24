import { defineConfig } from "@playwright/test";

const gatewayPort = 3101;
const webPort = 4273;

export default defineConfig({
  testDir: "./apps/web/e2e",
  fullyParallel: true,
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    trace: "on-first-retry",
  },
  webServer: {
    command: `pnpm dev`,
    env: {
      DEV_GATEWAY_PORT: String(gatewayPort),
      DEV_WEB_PORT: String(webPort),
      GATEWAY_BUILD_ASSERTION_SECRET: "playwright-server-only-secret",
    },
    url: `http://127.0.0.1:${webPort}`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
