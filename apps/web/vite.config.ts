import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// En développement, /api est relayé vers l'API (le préfixe est retiré, comme le fait Caddy en production).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.API_URL ?? "http://localhost:3001",
        rewrite: (path) => path.replace(/^\/api/, ""),
        // le contrôle d'origine de l'API compare l'en-tête Origin à APP_ORIGIN (http://localhost:5173)
        headers: { origin: "http://localhost:5173" },
      },
    },
  },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
