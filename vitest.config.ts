import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@/client': fileURLToPath(new URL('./apps/web/vendor/mcp-use/client', import.meta.url)),
      '@combined/features': fileURLToPath(new URL('./apps/web/src/features/InspectorFeatures.tsx', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
  },
})
