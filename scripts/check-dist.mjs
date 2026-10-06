// check-dist verifies the files produced by `npm run build` before they are published.
// Run it with `npm run size` after a build.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const dist = join(import.meta.dirname, '..', 'dist');

// Gzip budget for the minified script-tag bundle, in bytes.
const GLOBAL_MIN_GZIP_BUDGET = 8 * 1024;

const expectedFiles = [
    'neffos.js',
    'neffos.cjs',
    'neffos.d.ts',
    'neffos.d.cts',
    'neffos.browser.js',
    'neffos.global.js',
    'neffos.global.min.js',
];

const failures = [];
const read = (name) => readFileSync(join(dist, name), 'utf8');

for (const name of expectedFiles) {
    if (!existsSync(join(dist, name))) {
        failures.push(`missing dist/${name}`);
    }
}

if (failures.length === 0) {
    // The typings must not need @types/ws: no import of it, static or `import("ws")` type.
    for (const name of ['neffos.d.ts', 'neffos.d.cts']) {
        if (/(from\s*|import\(\s*)['"]ws['"]/.test(read(name))) {
            failures.push(`dist/${name} references the 'ws' module`);
        }
    }
    // Matches `from "ws"`, `require("ws")` and `import("ws")`, not the "ws" URL scheme string.
    const wsModuleRef = /(from\s*|require\(\s*|import\(\s*)["']ws["']/;
    // A bundled copy of the `ws` browser stub is just as wrong as an import of it.
    const wsBrowserStub = 'ws does not work in the browser';
    for (const name of ['neffos.browser.js', 'neffos.global.js', 'neffos.global.min.js']) {
        const code = read(name);
        if (wsModuleRef.test(code) || code.includes(wsBrowserStub)) {
            failures.push(`dist/${name} references the "ws" module`);
        }
    }

    // Members tagged @internal stay out of the public typings.
    const internalNames = /\b(_attach|_onData|_onDrop|_pendingRestore|_epoch|_closedSignal|_reconnectNamespace|ConnOptions|DroppedNamespace)\b/;
    for (const name of ['neffos.d.ts', 'neffos.d.cts']) {
        const found = internalNames.exec(read(name));
        if (found !== null) {
            failures.push(`dist/${name} exposes the internal "${found[1]}"`);
        }
    }

    // The Node builds may load `ws` only through the dynamic `import("ws")` fallback.
    const staticWs = /(from\s*|require\(\s*)["']ws["']/;
    for (const name of ['neffos.js', 'neffos.cjs']) {
        if (staticWs.test(read(name))) {
            failures.push(`dist/${name} loads "ws" statically`);
        }
    }

    for (const name of expectedFiles) {
        const raw = readFileSync(join(dist, name));
        console.log(`${name.padEnd(24)} ${String(raw.length).padStart(7)} B  gzip ${String(gzipSync(raw).length).padStart(6)} B`);
    }

    const minGzip = gzipSync(readFileSync(join(dist, 'neffos.global.min.js'))).length;
    if (minGzip > GLOBAL_MIN_GZIP_BUDGET) {
        failures.push(`dist/neffos.global.min.js is ${minGzip} B gzipped, budget is ${GLOBAL_MIN_GZIP_BUDGET} B`);
    }
}

if (failures.length > 0) {
    for (const f of failures) {
        console.error(`check-dist: ${f}`);
    }
    process.exit(1);
}

console.log('check-dist: ok');
