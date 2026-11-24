// Builds the test-only variant into dist-e2e/ (localhost host permission + stand-in Claude API). Never shipped.
process.env.FP_E2E = "1";
const { build } = await import("vite");
await build({ logLevel: "warn" });
console.log("built dist-e2e/");
