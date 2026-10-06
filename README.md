<img src="gh_logo_js.png" />

`neffos.js` is the official client library for the [neffos](https://github.com/kataras/neffos) real-time WebSocket framework, written in TypeScript and shipped with full type definitions.

It runs in browsers, in Node 22 and newer, in Deno and Bun, in web workers, and inside bundlers such as esbuild, webpack and Vite. Code samples are at [_examples/](_examples).

[![npm version](https://img.shields.io/npm/v/neffos.js.svg?style=for-the-badge)](https://www.npmjs.com/package/neffos.js) [![chat](https://img.shields.io/gitter/room/neffos-framework/community.svg?color=blue&logo=gitter&style=for-the-badge)](https://gitter.im/neffos-framework/community) [![backend pkg](https://img.shields.io/badge/server%20-package-488AC7.svg?style=for-the-badge)](https://github.com/kataras/neffos)

## Installation

### Node.js / TypeScript projects (ESM)

```sh
npm install neffos.js
```

```ts
import * as neffos from "neffos.js";
```

### CommonJS

```js
const neffos = require("neffos.js");
```

Types are bundled with the package. No separate `@types/*` install is needed.

### Browser via CDN, as a global

```html
<script src="https://cdn.jsdelivr.net/npm/neffos.js@0.3/dist/neffos.global.min.js"></script>
<script>
  neffos.dial("ws://localhost:8080/echo", { /* ... */ }).then((conn) => {
    // top-level await is not available in a plain <script> tag.
  });
</script>
```

### Browser via CDN, as an ES module

```html
<script type="module">
  import * as neffos from "https://cdn.jsdelivr.net/npm/neffos.js@0.3/+esm";
  const conn = await neffos.dial("ws://localhost:8080/echo", { /* ... */ });
</script>
```

Pin the version to your release rather than `@latest` in production.

## Runtime support

| Runtime | WebSocket it uses | Handshake headers |
| --- | --- | --- |
| Browsers, Deno, Bun, web workers | the native `WebSocket` | sent as `X-Websocket-Header-<name>` URL parameters, since none of these let you set custom headers on a websocket handshake |
| Node 22 and newer, no extra install | the built-in global `WebSocket` | same as above: URL parameters |
| Node, with the optional `ws` package | pass `{ WebSocket: require("ws").WebSocket }` in `Options` | sent as real HTTP headers |

Node 20 is not supported. `engines.node` in package.json requires `>=22`. The
`ws` package is an optional peer dependency: install it only if you want real
headers, or if you are on a Node version without a global `WebSocket`.

## Quick start

```ts
import * as neffos from "neffos.js";

const conn = await neffos.dial("ws://localhost:8080/echo", {
  default: {
    async _OnNamespaceConnected(ns, msg) {
      console.log("connected to namespace:", msg.Namespace);
    },
    _OnNamespaceDisconnect(ns, msg) {
      console.log("disconnected:", msg.Namespace);
    },
    async chat(ns, msg) {
      console.log("server says:", msg.text());
    },
  },
});

const ns = await conn.connect("default");
ns.emit("chat", "Hello from the client!");
```

Handlers may be synchronous or `async`. A handler can return nothing, an
`Error` (sent back to the server as the event's error), or throw; a thrown
error is caught and sent back the same way.

A matching neffos Go server for this client lives at [kataras/neffos/_examples/01-getting-started](https://github.com/kataras/neffos/tree/master/_examples/01-getting-started), and a full example tree including the server is at [_examples/](_examples).

## Options

```ts
const conn = await neffos.dial(endpoint, handlers, {
  headers: { Authorization: "Bearer ..." },
  protocols: "chat-v1",
  reconnect: 1000,          // or a ReconnectOptions object, see below
  timeout: 10_000,          // the first dial (including its retries) must finish within this
  signal: abortController.signal,
  askTimeout: 5_000,        // default timeout for every ask() that does not set its own
  WebSocket: undefined,     // defaults to globalThis.WebSocket, then the ws package; pass ws's WebSocket for real headers
  onError: (err) => console.error(err),
});
```

`onError` receives errors that have no caller to reject: an invalid frame, an
event for a namespace that was never connected, and a failed restore after a
reconnect. Without it, reconnect failures are logged with `console.warn` and
the rest are dropped silently.

## Asking the server (`ask` / reply)

`ask` is the request/response primitive. The server replies with the same
event name; the body is whatever the handler returned via `neffos.reply(body)`.

```ts
const reply = await ns.ask("getProfile", "user-42");
console.log(reply.text());
```

```ts
// AskOptions: a per-call timeout and an AbortSignal.
const reply = await ns.ask("getProfile", "user-42", { timeout: 3000 });
```

`timeout` defaults to `Options.askTimeout` (0 waits forever) and rejects with
a `NeffosError` whose `code` is `ERR_TIMEOUT`. Aborting `signal` rejects with
the signal's reason. `conn.ask(msg, options?)` takes the same options for a
raw `Message`.

## Binary messages

```ts
ns.emitBinary("upload", new Uint8Array([1, 2, 3]));
const reply = await ns.ask("upload", new Uint8Array([1, 2, 3]));
console.log(reply.bytes()); // Uint8Array
```

`emitBinary` is on both `NSConn` and `Room`. A `Message.Body` is
`string | Uint8Array`; `msg.text()` decodes bytes as UTF-8 if needed, and
`msg.bytes()` encodes a string as UTF-8 if needed, so a handler can call
either one regardless of how the frame arrived.

## Errors

Every error this library creates is a `NeffosError` (extends `Error`), with a
stable `code` such as `ERR_BAD_NAMESPACE` or `ERR_TIMEOUT`:

```ts
try {
  await conn.connect("unknown-namespace");
} catch (err) {
  if (err instanceof neffos.NeffosError) {
    console.log(err.code); // "ERR_BAD_NAMESPACE"
  }
}
```

The shared sentinels `ErrInvalidPayload`, `ErrBadNamespace`, `ErrBadRoom`,
`ErrClosed` and `ErrWrite` are `NeffosError` instances whose message text
matches the Go server's, so an error that travels over the wire resolves back
to the same object on the client: `err === neffos.ErrBadNamespace` works.

`CloseError` is a `NeffosError` that closed, or asked to close, the
connection; its message is `"[code] text"`, the form the Go server sends for
a server-side close, for example `"[-1] write closed"`. `isCloseError(err)`
reports whether an error came from a shutdown or a forced close, rather than
from application code. `registerKnownError(err)` adds your own shared error
so a matching error frame resolves to that same instance instead of a plain
`Error`.

## Reconnect

```ts
const conn = await neffos.dial(endpoint, handlers, {
  reconnect: 1000, // or: { initialDelay: 1000, maxDelay: 30000, factor: 2, maxRetries: 10 }
});
```

A number is shorthand for `{ initialDelay: <number> }`; `0` turns reconnect
off. The delay grows by `factor` each retry (default 2), capped at `maxDelay`
(default 30000 ms), with up to 20% shaved off at random so that many clients
do not all retry in the same instant. `maxRetries` is unlimited by default.

The same `Conn` is reused after a reconnect: `conn.isClosed()` stays `false`,
and application references to a connected `NSConn` or a joined `Room` keep
working once the restore finishes. Namespaces reconnect one at a time, each
followed by its rooms, in the order they were connected before the drop.
`conn.wasReconnected()` and `conn.reconnectTries` report whether and how many
times this happened. Call `conn.close()`, or abort `Options.signal`, to stop
reconnecting.

## API

| Export | Shows |
| --- | --- |
| `Message` | one frame: `Namespace`, `Room`, `Event`, `Body`, `Err`, plus `text()`, `bytes()` and `unmarshal<T>()` |
| `Room` | a joined room: `emit`, `emitBinary`, `leave()` |
| `NSConn` | a connected namespace: `emit`, `emitBinary`, `ask`, `joinRoom`, `room`, `roomNames`, `leaveAll`, `disconnect` |
| `Conn` | the connection itself: `connect`, `ask`, `write`, `close`, `isClosed`, `wasReconnected` |
| `NeffosError` | the base class of every error this library creates, with a `code` |
| `CloseError` | a `NeffosError` that closed, or asked to close, the connection, with `closeCode` and `cause` |
| `dial(endpoint, connHandler, options?)` | opens a connection and resolves with a `Conn` |
| `marshal(obj)` | serializes an object to a string for use as a `Message.Body` |
| `reply(body)` | return this from a handler to echo `body` back to the sender on the same event |
| `isCloseError(err)` | true if `err` came from a server shutdown or a forced close |
| `registerKnownError(err)` | shares a custom error so both sides resolve the same instance |
| `isSystemEvent(event)` | true for the built-in connect, disconnect and room events |

See [HISTORY.md](HISTORY.md) for every release, including what changed and why.

## Versioning

[![npm version](https://img.shields.io/npm/v/neffos.js.svg?style=flat-square)](https://www.npmjs.com/package/neffos.js)

`neffos.js` follows [Semantic Versioning 2.0.0](http://semver.org/). neffos.js
0.3.x speaks the same wire protocol as neffos (Go) v0.0.x and v0.1.x: any of
those server versions works with this client, and the client's own version
does not need to track the server's.
