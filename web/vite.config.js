import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev: the API runs on PORT (default 4950, npm run dev -w server) and Vite on VITE_PORT (default 4951). /api is proxied,
// so the browser only ever talks to one origin (same-origin writes).
const api = { target: `http://127.0.0.1:${Number(process.env.PORT) || 4950}` };

export default defineConfig({
  plugins: [react()],
  server: { host: "127.0.0.1", port: Number(process.env.VITE_PORT) || 4951, strictPort: true, proxy: { "/api": api } },
  // The server core (real mock AS, gateway and runner) is loaded by Node itself in tests, so its data files resolve normally.
  test: { environment: "jsdom", globals: true, setupFiles: "./src/testSetup.js", server: { deps: { external: [/\/server\/src\//] } } },
});
