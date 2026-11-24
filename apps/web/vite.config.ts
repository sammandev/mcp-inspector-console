import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  server: {
    host: process.env.WEB_HOST,
    port: process.env.WEB_PORT ? Number.parseInt(process.env.WEB_PORT, 10) : undefined,
    strictPort: true,
    proxy: process.env.GATEWAY_URL ? {
      "/gateway": {
        target: process.env.GATEWAY_URL,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/gateway/, ""),
        headers: process.env.GATEWAY_TOKEN ? {
          Authorization: `Bearer ${process.env.GATEWAY_TOKEN}`,
        } : undefined,
      },
    } : undefined,
  },
});
