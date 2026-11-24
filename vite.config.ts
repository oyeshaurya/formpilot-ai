import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { crx } from "@crxjs/vite-plugin";
import { build as rolldown } from "rolldown";
import manifest from "./manifest.config.ts";

/** E2E builds (FP_E2E=1) may reach localhost and use a stand-in for the Claude API. Never shipped. */
const E2E = process.env.FP_E2E === "1";

/**
 * The page script is injected with chrome.scripting.executeScript({ files }), which runs one
 * classic script: no imports, no web-accessible chunks. Bundle it on its own as a single IIFE.
 */
function contentScript(): Plugin {
  return {
    name: "formpilot-content-script",
    apply: "build",
    async generateBundle() {
      const out = await rolldown({
        input: "src/content/index.ts",
        write: false,
        output: { format: "iife", minify: true },
        platform: "browser",
        // A new id per build lets a freshly injected page script replace one left in a tab by an older build.
        transform: { define: { __FP_BUILD__: JSON.stringify(`${Date.now().toString(36)}`) } },
      });
      const chunk = out.output.find((o) => o.type === "chunk");
      if (!chunk || chunk.type !== "chunk") throw new Error("content script did not build");
      if (/\bimport\s*\(|^import\s|\beval\s*\(|new Function/m.test(chunk.code)) throw new Error("content.js must be one self-contained script");
      this.emitFile({ type: "asset", fileName: "content.js", source: chunk.code });
    },
  };
}

export default defineConfig({
  define: { __FP_E2E__: JSON.stringify(E2E) },
  plugins: [react(), tailwindcss(), crx({ manifest }), contentScript()],
  build: {
    outDir: E2E ? "dist-e2e" : "dist",
    emptyOutDir: true,
    target: "chrome116",
    // Both stores accept minified code; obfuscation is what they reject. Keep it plain minify.
    minify: true,
    sourcemap: false,
  },
  server: {
    port: 5173,
    strictPort: true,
    cors: { origin: [/chrome-extension:\/\//] },
  },
});
