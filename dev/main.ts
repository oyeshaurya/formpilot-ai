// Dev harness entry: install the chrome.* mock, then boot the real side panel.
import { installChromeMock } from "./chrome-mock";

installChromeMock({ persist: true });

// ?popup renders the toolbar popup (400 x 600, with its side panel button) instead of the side panel.
const params = new URLSearchParams(location.search);
if (params.has("popup")) document.documentElement.classList.add("fp-popup");

// ?w=600 frames the panel at 600px; ?w=full lets it fill the window (wide layouts).
const w = params.get("w");
if (w) document.documentElement.style.setProperty("--harness-w", w === "full" ? "none" : `${Number(w) || 400}px`);
await import("../src/sidepanel/main");
