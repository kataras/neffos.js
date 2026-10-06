// Shows: neffos.js from Node, with the built-in WebSocket (Node 22+, no
// `ws` package needed) and `readline/promises` for a terminal chat client.
//
// Run it: `cd ../server && go run .` in one terminal, then
// `node client.mjs` in another. Node >= 22 is required; Node 20 is not
// supported (engines.node in package.json).
//
// Try it: type a name and a room when asked, then type messages and press
// enter. Open ../browser/index.html with the same room name to chat across
// both clients.
//
// Read next: ../browser/index.html for the same chat in a page, or
// ../bundler/ for a build-tool setup.

// This import is relative because neffos.js 0.3.0 is not published yet.
// Once it is, this becomes: import * as neffos from 'neffos.js';
// CommonJS projects would instead write: const neffos = require('neffos.js');
import * as neffos from '../../dist/neffos.js';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const rl = createInterface({ input: stdin, output: stdout });

const name = (await rl.question('Your name: ')) || 'guest';
const roomName = (await rl.question('Room: ')) || 'lobby';

const conn = await neffos.dial('ws://localhost:8080/ws', {
    default: {
        _OnNamespaceConnected(_ns, msg) {
            console.log(`connected to namespace [${msg.Namespace}]`);
        },
        _OnNamespaceDisconnect() {
            console.log('disconnected');
        },
        chat(_ns, msg) {
            console.log(msg.text());
        },
    },
});

const ns = await conn.connect('default');
const room = await ns.joinRoom(roomName);
console.log(`joined room [${roomName}], type a message and press enter ("quit" to exit)`);

for (;;) {
    const text = await rl.question('');
    if (text === 'quit') {
        break;
    }
    if (text.trim() === '') {
        continue;
    }
    room.emit('chat', `${name}: ${text}`);
}

await ns.disconnect();
conn.close();
rl.close();
