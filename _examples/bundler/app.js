// Shows: bundling neffos.js with esbuild instead of a <script> tag or a
// relative import. app.js uses the bare "neffos.js" specifier, the same
// way any other npm package is imported, and esbuild resolves it from
// node_modules.
//
// Run it: from this directory, run `npm run build` in the repo root first
// (so dist/ exists), then here run `npm install` and `npm run build`
// (the one-liner is `esbuild app.js --bundle --format=esm --outfile=bundle.js`,
// see package.json). Open index.html after that.
//
// Try it: open the page, join the "lobby" room, and send a message. A tab
// of ../browser or a run of ../node/client.mjs in the same room sees it.
//
// Read next: ../browser/index.html for the <script> tag version, or
// ../node/client.mjs for a terminal client.

import * as neffos from 'neffos.js';

const log = document.getElementById('log');

function print(text) {
    const p = document.createElement('p');
    p.textContent = text;
    log.appendChild(p);
}

const conn = await neffos.dial('ws://localhost:8080/ws', {
    default: {
        _OnNamespaceConnected(_ns, msg) {
            print(`connected to namespace [${msg.Namespace}]`);
        },
        _OnNamespaceDisconnect() {
            print('disconnected');
        },
        chat(_ns, msg) {
            print(msg.text());
        },
    },
});

const ns = await conn.connect('default');
const room = await ns.joinRoom('lobby');

document.getElementById('send').addEventListener('click', () => {
    const input = document.getElementById('message');
    const text = input.value.trim();
    if (text !== '') {
        room.emit('chat', text);
        input.value = '';
    }
});
