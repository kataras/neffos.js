# Version History

## 0.2.0 — 2026-05-28

### Breaking changes

- **`Options.reconnnect` renamed to `Options.reconnect`** in `types/index.d.ts`.
  TypeScript users who relied on the typo will now get a compile error until
  they fix the spelling. Runtime impact: the source code has always read
  `options.reconnect`, so TS users who copy-pasted the misspelling had
  auto-reconnect silently disabled — upgrading to 0.2.0 starts honoring it.

- **`NSConn.leaveAll()` return type narrowed to `Promise<Error | null>`**
  (was `Promise<Error>`). Strict TS code that assumed a non-null error must add
  a null check. Runtime: the resolved value was always `null` on success — only
  the type is changing to reflect reality.

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
  These were build/lint tooling — no impact on library consumers.

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
