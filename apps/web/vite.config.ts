import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import type { IncomingHttpHeaders } from "node:http";

export function gatewayProxyRequestPolicy(headers: IncomingHttpHeaders, webOrigin: string): boolean {
  const fetchSite = headers["sec-fetch-site"];
  const origin = headers.origin;
  const mode = headers["sec-fetch-mode"];
  const browserRequest = origin !== undefined || fetchSite !== undefined || mode !== undefined;
  if (!browserRequest) return true;
  if (fetchSite === "cross-site" || fetchSite === "same-site") return false;
  if (origin !== undefined) return origin === webOrigin;
  return fetchSite === "same-origin";
}

export default defineConfig({
  plugins: [react(), tailwindcss(), {
    name: "gateway-origin-guard",
    configureServer(server) {
      server.middlewares.use("/gateway", (request, response, next) => {
        const host = process.env.WEB_HOST ?? "127.0.0.1";
        const port = process.env.WEB_PORT;
        if (gatewayProxyRequestPolicy(request.headers, `http://${host}${port ? `:${port}` : ""}`)) {
          next();
          return;
        }
        response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Cross-origin gateway proxy requests are forbidden");
      });
    },
  }],
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
