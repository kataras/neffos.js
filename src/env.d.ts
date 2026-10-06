// Build-time constants. tsup and vitest replace them with literals (see tsup.config.ts and vitest.config.ts).

/** True in the browser and script-tag builds, which must not reference the `ws` package. */
declare const __NEFFOS_BROWSER_BUILD__: boolean;
