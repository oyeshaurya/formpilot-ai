// Dev harness entry: install the chrome.* mock, then boot the real side panel.
import { installChromeMock } from "./chrome-mock";

installChromeMock({ persist: true });
await import("../src/sidepanel/main");
