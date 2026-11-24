/** True only in the test build (npm run build:e2e). Production builds compile it to `false`. */
declare const __FP_E2E__: boolean;

/** Build id of the page script (vite.config.ts): a newer build replaces a stale copy left in a tab. */
declare const __FP_BUILD__: string;
