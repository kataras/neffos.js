<img src="gh_logo_js.png" />

`neffos.js` is the official client library for the [neffos](https://github.com/kataras/neffos) real-time WebSocket framework, written in TypeScript and shipped with full type definitions.

It runs in any modern browser, in Node.js (18+), and inside browserify/esbuild/webpack/Vite bundles. Code samples are at [_examples/](_examples).

[![Node version](https://img.shields.io/npm/v/neffos.js.svg?style=for-the-badge)](https://www.npmjs.com/package/neffos.js) [![Known Vulnerabilities](https://img.shields.io/badge/vulnerabilities%20-0-228B22.svg?style=for-the-badge)](https://snyk.io/test/github/kataras/neffos.js?targetFile=package.json) [![chat](https://img.shields.io/gitter/room/neffos-framework/community.svg?color=blue&logo=gitter&style=for-the-badge)](https://gitter.im/neffos-framework/community) [![backend pkg](https://img.shields.io/badge/server%20-package-488AC7.svg?style=for-the-badge)](https://github.com/kataras/neffos)

## Installation

### Node.js / TypeScript projects

```sh
npm install neffos.js
```

```ts
import * as neffos from "neffos.js";
```

Types are bundled with the package — no separate `@types/*` install is required.

### Browser via CDN

```html
<script src="https://cdn.jsdelivr.net/npm/neffos.js@latest/dist/neffos.js"></script>
<script>
  const conn = await neffos.dial("ws://localhost:8080/echo", { /* ... */ });
</script>
```

Pin the version to your release rather than `latest` in production.

## Quick start

```ts
import * as neffos from "neffos.js";

const conn = await neffos.dial("ws://localhost:8080/echo", {
  default: {
    _OnNamespaceConnected(ns, msg) {
      console.log("connected to namespace:", msg.Namespace);
    },
    _OnNamespaceDisconnect(ns, msg) {
      console.log("disconnected:", msg.Namespace);
    },
    chat(ns, msg) {
      console.log("server says:", msg.Body);
    },
  },
});

const ns = await conn.connect("default");
ns.emit("chat", "Hello from the client!");
```

A matching neffos Go server for this client lives at [kataras/neffos/_examples/basic](https://github.com/kataras/neffos/tree/master/_examples/basic).

## Auto-reconnect

Pass `reconnect` (milliseconds) in the dial options to enable automatic
reconnection. On reconnect, the client probes the HTTP endpoint with a HEAD
request (so the server can see the retry count) and then re-establishes any
namespaces and rooms that were connected before the drop.

```ts
const conn = await neffos.dial("ws://localhost:8080/echo", handlers, {
  reconnect: 5000, // try every 5 seconds while offline
});
```

> Breaking change in 0.2.0: the option is `reconnect` (previously misspelled as `reconnnect` in the type declarations, which silently disabled reconnect for TypeScript users).

## Asking the server (`ask` / reply)

`ask` is the request/response primitive. The server replies with the same event
name; the body is whatever the handler returned via `neffos.reply(body)`.

```ts
const reply = await ns.ask("getProfile", "user-42");
console.log(reply.Body);
```

`ask` does not impose an internal timeout — wrap it with `Promise.race` if you
need a deadline.

## Binary messages

```ts
ns.emitBinary("upload", new Uint8Array([1, 2, 3]));
```

`emitBinary` is available on both `NSConn` and `Room`. Messages arrive on the
server with `Message.SetBinary == true` and `Message.Body` as raw bytes.

## API summary

| Class | Notable methods |
|-------|-----------------|
| `Conn` | `connect`, `ask`, `write`, `close`, `wasReconnected` |
| `NSConn` | `emit`, `emitBinary`, `ask`, `joinRoom`, `room`, `leaveAll`, `disconnect` |
| `Room` | `emit`, `emitBinary`, `leave` |
| `Message` | `unmarshal<T>()`, fields `Namespace` / `Room` / `Event` / `Body` / `Err` |

Top-level helpers: `dial`, `reply`, `marshal`, `isSystemEvent`, `isCloseError`.

Full type definitions: [types/index.d.ts](./types/index.d.ts).

## Versioning

[![Node version](https://img.shields.io/npm/v/neffos.js.svg?style=flat-square)](https://www.npmjs.com/package/neffos.js)

`neffos.js` follows [Semantic Versioning 2.0.0](http://semver.org/). The major
version of the server and the client are kept in lock-step; minor and patch
releases are independent.

See [CHANGELOG](./CHANGELOG.md) for breaking changes between releases.
