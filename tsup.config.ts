import { defineConfig, type Options } from 'tsup';

const entry = { neffos: 'src/index.ts' };

const shared: Options = {
    entry,
    target: 'es2022',
    sourcemap: true,
};

const browserShared: Options = {
    ...shared,
    platform: 'browser',
    define: { __NEFFOS_BROWSER_BUILD__: 'true' },
};

export default defineConfig([
    // Node and bundlers: dist/neffos.js (ESM), dist/neffos.cjs (CJS) and their .d.ts/.d.cts.
    {
        ...shared,
        format: ['esm', 'cjs'],
        platform: 'neutral',
        // stripInternal drops the members tagged @internal (Conn._attach and friends).
        dts: { compilerOptions: { stripInternal: true } },
        external: ['ws'],
        define: { __NEFFOS_BROWSER_BUILD__: 'false' },
    },
    // Browser ESM: dist/neffos.browser.js.
    {
        ...browserShared,
        format: ['esm'],
        outExtension: () => ({ js: '.browser.js' }),
    },
    // Script tag global `neffos`: dist/neffos.global.js and dist/neffos.global.min.js.
    {
        ...browserShared,
        format: ['iife'],
        globalName: 'neffos',
        outExtension: () => ({ js: '.global.js' }),
    },
    {
        ...browserShared,
        format: ['iife'],
        globalName: 'neffos',
        minify: true,
        outExtension: () => ({ js: '.global.min.js' }),
    },
]);
