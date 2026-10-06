# Version History

## 0.3.0 (2026-10-05)

### Breaking

- `Room.leave()`, `NSConn.leaveAll()` and `NSConn.disconnect()` return `Promise<void>` and reject on error (was `Promise<Error | null>`). `room.leave()` on a room that was never joined now rejects with `ErrBadRoom`; it used to resolve with it.
- `Message.Body` is `string | Uint8Array`. A binary message now arrives as a `Uint8Array`, not an `ArrayBuffer`. Read it with the new `msg.text()` or `msg.bytes()` instead of touching `Body` directly.
- `Message.Err` is `Error | undefined`, and every `Message` field now has an initialiser (`""` or `false`) instead of coming back `undefined`.
- `engines.node` requires `>= 22`. Node 20 is not supported.
- `ws` is an optional peer dependency, not a bundled one. Install it yourself if you want real HTTP headers on the handshake, or if you run on a Node version with no global `WebSocket`.
- On Node 22 and later, `dial()` uses Node's global `WebSocket` even when `ws` is installed, so `Options.headers` travel as `X-Websocket-Header-<Name>` URL parameters by default. They end up in the query string and in server access logs, and middleware that reads request headers before the upgrade will not see them. To keep real headers, pass the `ws` package's constructor: `dial(url, handlers, { WebSocket: (await import("ws")).WebSocket, headers })`.
- The hand-written `types/` directory is gone. Types ship from `dist/neffos.d.ts` (ESM) and `dist/neffos.d.cts` (CommonJS), generated straight from the TypeScript source.
- `dist/neffos.js`, the ESM build, no longer sets a global. Only the two IIFE builds, `dist/neffos.global.js` and `dist/neffos.global.min.js`, still expose `window.neffos`.
- `dial()` rejects with `Error` objects. It used to have two overloads, both typed `any`; now there is one signature, `dial(endpoint: string, connHandler: ConnHandler, options?: Options)`, and a bad handler map throws a `TypeError` instead of rejecting with a plain string.
- `reconnect: n` is the initial backoff delay in milliseconds, not a fixed retry interval. Each retry waits longer, up to `maxDelay` (30000 ms by default), with up to 20% shaved off at random so clients do not all retry at once. Pass a `ReconnectOptions` object for `factor`, `maxDelay`, `maxRetries`, `jitter`, `probe` or `shouldReconnect`. The HTTP HEAD probe before each retry was always on in 0.2.0; it now defaults to off, so pass `{ probe: true }` if you relied on it.
- A reconnect reuses the same `Conn`. It used to be replaced, so `conn.isClosed()` now stays `false` after a reconnect, and application references to a connected `NSConn` or a joined `Room` keep working once the restore finishes.
- `NSConn.room(name)` and `Conn.namespace(name)` return `| undefined` in their types, matching what they already returned at runtime.
- `Conn.ask(msg, options?)` and `NSConn.ask(event, body, options?)` take an `AskOptions` object (`timeout`, `signal`) as their last argument.
- `Room.emitBinary` and `NSConn.emitBinary` take `body: string | Uint8Array`, the same `WSData` type every other body uses.
- `Options.protocols` is `string | string[]`. `Options.reconnect` is `number | ReconnectOptions`.
- `Headers` values are `string | number | boolean` (was `any`).
- `ErrInvalidPayload`, `ErrBadNamespace`, `ErrBadRoom`, `ErrClosed` and `ErrWrite` are now `NeffosError` instances with a `code`. Their messages are unchanged, so existing `err.message` checks still work; prefer `err === neffos.ErrBadNamespace` or `err.code` going forward.
- `Conn`'s constructor takes `(ws, namespaces, options?)`, and its socket is attached separately; `dial()` is the only supported way to get a `Conn`. `Conn.handle(evt)` is gone, replaced by the internal `_onData`.
- `reply(body)` returns a `ReplyError` instance (it was the unexported class `replyError`). `ReplyError` is exported, so `err instanceof neffos.ReplyError` works.
- Handlers may be `async` now, and every handler runs on a microtask after the frame that triggered it, not synchronously inside the socket's `onmessage`. Code that assumed a handler had already run right after `emit()` returns needs an `await` or a microtask flush.
- `MessageHandlerFunc` is now `(ns, msg) => void | Error | null | Promise<void | Error | null>`. In 0.2.0 it was `(ns, msg) => Error`. A 0.2.0 handler that returns `null` still type-checks. Returning `null` still means no error, same as returning nothing; only an `Error` instance is written back to the server.
- `Message.isWait()` is `true` for any non-empty wait token, matching the Go client; it used to require a specific format.
- Endpoints are normalised with the `URL` class, so `ws://host:8080` gains a trailing slash and equivalent URLs now compare equal.
- A non-function entry inside a namespace's handler object throws `TypeError` at `dial()` time. It used to be stored and fail later, the first time that event fired.

### Added

- `Message.text()` and `Message.bytes()` decode or encode `Body` as needed, regardless of whether the frame arrived as text or binary.
- `NeffosError`, the base class of every error this library creates, with a stable `code` such as `ERR_BAD_NAMESPACE` or `ERR_TIMEOUT`.
- `CloseError`, a `NeffosError` for a close that came from the server or from a forced socket close, with `closeCode` and `cause`. Its message is `"[code] text"`, the same form the Go server sends.
- `registerKnownError(err)` shares a custom error so a matching error frame resolves to that same instance; `isCloseError(err)` now recognizes a `CloseError` the same way.
- `URLParamAsHeaderPrefix` is now exported at run time. It was declared in the 0.2.0 typings but missing from the actual module.
- `AskOptions` (`timeout`, `signal`) on `Conn.ask` and `NSConn.ask`. A timed-out ask rejects with a `NeffosError` whose `code` is `ERR_TIMEOUT`; an aborted `signal` rejects with the signal's reason.
- `Options.timeout` and `Options.signal` bound the first dial, including its retries.
- `Options.askTimeout` sets the default for every `ask()` that does not pass its own `timeout`.
- `Options.WebSocket` picks the WebSocket constructor to use. Without it, `dial()` tries `globalThis.WebSocket`, then a dynamic `import("ws")`.
- `Options.onError` receives errors with no caller to reject: invalid frames, events for namespaces that were never connected, and failed restores after a reconnect.
- New error codes for failures that had none before: `ERR_TIMEOUT` (ask and dial), `ERR_DIAL` (the socket closed before the handshake finished), `ERR_RECONNECT` and `ERR_NO_WEBSOCKET`.
- `ReconnectOptions` (`initialDelay`, `maxDelay`, `factor`, `jitter`, `maxRetries`, `probe`, `shouldReconnect`) for exponential backoff with jitter.
- `Conn.closeInfo` (a `CloseInfo`: `code`, `reason`, `wasClean`, and the error event if any), `Conn.wasReconnected()` and `Conn.reconnectTries` report whether and how a connection came back after a drop.
- `ConnHandler`, `ErrorResolver`, `WebSocketLike` and `WebSocketConstructor` types, for typing a handler map or a custom socket.
- `scripts/check-dist.mjs` now fails the build if any browser bundle or typing file references the `ws` package.

### Fixed

- An `async` handler that returned nothing used to be written back as an error (`;default;;chat;1;0;undefined`); it no longer sends anything.
- `emitBinary` with a string body now sends that string's UTF-8 bytes, encoded with `TextEncoder`, instead of corrupting non-ASCII characters.
- A native binary frame now reaches `OnNativeMessage` instead of being silently dropped.
- A native text frame now reaches `OnNativeMessage` and is marked `IsNative`, instead of failing with `ErrBadNamespace` for an empty namespace.
- A frame with exactly six fields, one short of the full seven, is now rejected as invalid, matching Go's `bytes.SplitN`. It used to parse with an empty body.
- A late reply to an `ask()` that already timed out, was aborted, or whose connection closed is now dropped instead of resolving or rejecting a settled promise.
- Wait ids no longer collide under load: `createWaitGenerator()` mixes 8 random base-36 characters with a per-`Conn` counter.
- `dial()` now honors `Options.timeout` and `Options.signal`; a timeout during a retrying first dial rejects instead of retrying forever.
- An error frame from the server now resolves to the matching shared error instance (for example `ErrBadRoom`), and `"[-1] write closed"` becomes a `CloseError` wrapping `ErrWrite`, instead of a plain `Error` with no identity.
- A socket drop in the middle of restoring namespaces and rooms after a reconnect no longer loses the ones not yet restored; they carry into the next redial.
- An `onError` callback that throws no longer stops later events from reaching their handlers.
- A `shouldReconnect` callback that throws is now reported through `onError` (or `console.warn`) and closes the `Conn`, instead of leaving it half-dropped.
- `connect()` on a namespace that was connected and then disconnected no longer returns the stale `NSConn` and silently sends nothing.
- `emit()` while reconnecting now returns `false` instead of writing to a dead socket.
- A `Uint8Array` body passed to `emit`, `ask` or `Room.emit` is sent as a binary frame. It used to go out as a text frame, which corrupted any bytes that were not valid UTF-8.
- A dial timeout or abort while the socket was still connecting crashed Node when the `ws` package was used ("WebSocket was closed before the connection was established", as an unhandled `error` event). The same happened on `conn.close()` or an abort during a reconnect attempt. The socket now keeps an error listener while it closes.
- When the server connects a namespace itself (`c.Connect` in `OnConnect`), a reconnect now restores the joined rooms on the same `NSConn` the application holds. They used to be joined on a stale object, so `room.emit()` returned `false`.
- Frames queued behind a slow handler are no longer dispatched after their socket drops, so a drop no longer produces stray `ErrBadNamespace` reports to `onError`.

### Removed

- The hand-written `types/` directory (`types/index.d.ts`, `types/tsconfig.json`, `types/dtslint.json`). Generated `.d.ts`/`.d.cts` files replace it.
- `Conn.handle(evt)`. Incoming frames are now handled internally by `_onData`, wired up by `_attach()`.
- The `root.neffos = ...` global assignment on the ESM build. Only the IIFE builds still set a global.
- `ws` as a direct dependency. It is now an optional peer dependency.
- `pnpm-lock.yaml`, `.travis.yml` and `.npmignore`. `package-lock.json` is tracked instead, and CI moved to GitHub Actions (`.github/workflows/ci.yml`).

## 0.2.0 (2026-05-28)

### Breaking changes

- **`Options.reconnnect` renamed to `Options.reconnect`** in `types/index.d.ts`.
  TypeScript users who relied on the typo will now get a compile error until
  they fix the spelling. Runtime impact: the source code has always read
  `options.reconnect`, so TS users who copy-pasted the misspelling had
  auto-reconnect silently disabled. Upgrading to 0.2.0 starts honoring it.

- **`NSConn.leaveAll()` return type narrowed to `Promise<Error | null>`**
  (was `Promise<Error>`). Strict TS code that assumed a non-null error must add
  a null check. Runtime: the resolved value was always `null` on success.
  Only the type is changing to reflect reality.

- **`NSConn.disconnect()` return type narrowed to `Promise<Error | null>`**
  (was `Promise<Error>`). Same as above.

- **`Room.leave()` return type narrowed to `Promise<Error | null>`** (was
  `Promise<Error>`). Same as above.

- **`NSConn.room(name)` return type narrowed to `Room | undefined`** (was
  `Room`). Strict TS code calling methods on the returned value must guard
  against `undefined`.

- **Dropped the `dist/neffos-es5.js` legacy bundle.** CDN consumers that
  pinned to the ES5 file must switch to `dist/neffos.js` (modern bundle) or
  `dist/neffos.min.js`. Browsers older than ES2017 are no longer supported.

- **`engines.node` set to `>= 18`.** Older Node versions are not supported.

- **TypeScript bumped from 4.9 to 5.6** in `devDependencies`; `tsconfig`
  target raised from `es6` to `es2022`, module from `es6` to `es2022`. If you
  consume `src/neffos.ts` directly (rare), your TS toolchain needs to keep up.

- **Dropped `goodparts`, `dtslint`, `@types/ws` from `devDependencies`**.
  These were build/lint tooling, with no impact on library consumers.

### Bug fixes (behavior changes)

- `Conn.handleQueue` now drains every queued message. Previously the
  `forEach + splice(index, 1)` pattern skipped every other message because of
  the index shift after the splice.

- `Conn.handleMessage` no longer falls through from `OnRoomJoin` to
  `OnRoomLeave` to the default case when the target namespace is missing.
  Explicit `break` statements stop the cascade.

- `NSConn.leaveAll` now awaits every room-leave operation. The previous
  `Map.forEach(async ...)` discarded the inner promises, returning before the
  leaves completed.

- `Conn.connect(name)` now coalesces concurrent calls with the same namespace.
  Previously two simultaneous `conn.connect("x")` calls could both pass the
  initial "already connected?" check and double-send the connect handshake.

- Reconnect path no longer raises unhandled promise rejections when a
  rejoined namespace fails to connect. The previous fragile
  `resolve.toString() === "function () { [native code] }"` heuristic has been
  replaced with an explicit `settled` flag.

- `Conn.ask` removes its wait-token entry when `write` fails, preventing the
  `waitingMessages` map from leaking entries on permanent errors.

### Additive APIs

- `NSConn.emitBinary(event, body)` is now declared in `types/index.d.ts`
  (the runtime method has always existed).
- `Room.emitBinary` now also accepts a `Uint8Array` body.

### Quick migration

```diff
- const conn = await neffos.dial("ws://localhost:8080", handlers, { reconnnect: 5000 });
+ const conn = await neffos.dial("ws://localhost:8080", handlers, { reconnect: 5000 });
```

```diff
- const r: Room = ns.room("lobby");
- r.emit("hi", "hello");
+ const r = ns.room("lobby");
+ r?.emit("hi", "hello");
```

```diff
- const err: Error = await ns.leaveAll();
- if (err) console.error(err);
+ const err = await ns.leaveAll();
+ if (err !== null) console.error(err);
```
