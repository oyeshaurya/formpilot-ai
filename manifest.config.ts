import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json" with { type: "json" };

/**
 * Manifest V3, one Chromium build for Chrome Web Store and Edge Add-ons.
 * Permission rationale: docs/ARCHITECTURE.md → "Permission model".
 * No content_scripts: the page script is injected on demand (activeTab + scripting).
 * FP_E2E=1 builds (tests only, never shipped) may also reach http://localhost.
 */
const E2E = process.env.FP_E2E === "1";

export default defineManifest({
  manifest_version: 3,
  name: E2E ? "FormPilot AI (E2E test build)" : "FormPilot AI",
  short_name: "FormPilot",
  description:
    "Fill job applications and web forms from a profile kept on your device. Review every answer; it never submits.",
  version: pkg.version,
  minimum_chrome_version: "116",
  icons: {
    16: "icons/icon-16.png",
    32: "icons/icon-32.png",
    48: "icons/icon-48.png",
    128: "icons/icon-128.png",
  },
  action: {
    default_title: "Open FormPilot AI",
    // The toolbar icon opens a popup, like other extensions; the popup can move FormPilot into the side panel.
    default_popup: "src/sidepanel/popup.html",
    default_icon: {
      16: "icons/icon-16.png",
      32: "icons/icon-32.png",
      48: "icons/icon-48.png",
    },
  },
  side_panel: {
    default_path: "src/sidepanel/index.html",
  },
  background: {
    service_worker: "src/background/index.ts",
    type: "module",
  },
  permissions: ["activeTab", "scripting", "storage", "sidePanel", "contextMenus"],
  host_permissions: E2E ? ["https://api.anthropic.com/*", "http://localhost/*"] : ["https://api.anthropic.com/*"],
  optional_host_permissions: ["https://*/*", "http://*/*"],
  commands: {
    "fill-page": {
      suggested_key: { default: "Alt+Shift+F" },
      description: "Fill the form on this page",
    },
    // No default key: Alt+Shift+P clashed in Edge. People can set one at chrome://extensions/shortcuts.
    _execute_action: {
      description: "Open FormPilot AI",
    },
  },
});
