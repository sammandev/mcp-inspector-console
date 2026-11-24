import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "apps/web/e2e/**/*.spec.ts",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "pnpm --filter @combined-mcp-inspector/web exec vite --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 120_000,
  },
  outputDir: ".superpowers/sdd/2026-11-24-phase-0/playwright-results",
  reporter: [["list"], ["json", { outputFile: ".superpowers/sdd/2026-11-24-phase-0/playwright-report.json" }]],
});
