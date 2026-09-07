import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiTarget = process.env.VITE_API_PROXY_TARGET || "http://localhost:3001";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "^/(auth|users|jobs|keywords|saved-jobs|reports)": {
        target: apiTarget,
        changeOrigin: true,
        // Deixa navegações de página (ex: redirect OAuth para /auth/callback)
        // caírem no index.html do SPA; só proxia chamadas de API (fetch/XHR).
        bypass(req) {
          if (req.method === "GET" && req.headers.accept?.includes("text/html")) {
            return req.url;
          }
        },
      },
    },
  },
});
