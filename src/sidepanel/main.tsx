import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../styles/app.css";
import { App } from "./App";
import type { OnDeviceReply, OnDeviceRequest } from "../shared/messages";
import { onDeviceFill } from "../shared/ondevice";

// The worker asks the panel to run Chrome's built-in model, which extension pages can reach.
chrome.runtime.onMessage?.addListener((msg: unknown, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !msg || (msg as { type?: string }).type !== "FP_ONDEVICE_FILL") return false;
  const { profile, resume, page, fields } = msg as OnDeviceRequest;
  onDeviceFill({ profile, resume, page, fields }).then(
    (response) => sendResponse({ ok: true, response } satisfies OnDeviceReply),
    (err: unknown) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) } satisfies OnDeviceReply),
  );
  return true;
});

const root = document.getElementById("root");
if (!root) throw new Error("FormPilot: #root missing from index.html");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
