import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

// Browser harness: serves the real side panel with a chrome.* mock at http://localhost:5174/
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react(), tailwindcss()],
  server: { port: 5174, strictPort: true, fs: { allow: [fileURLToPath(new URL("..", import.meta.url))] } },
});
