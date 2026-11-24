import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/**/*.{ts,tsx}",
    "../../node_modules/.pnpm/@mcp-use+inspector@20.3.33*/node_modules/@mcp-use/inspector/dist/client/**/*.{js,css}",
  ],
} satisfies Config;
