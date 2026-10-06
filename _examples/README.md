# neffos.js examples

Four runnable programs: one Go server and three ways to talk to it from the
client side. Every example file opens with a comment saying what it shows,
how to run it, what to try, and which example to read next.

Requirements: Go 1.26 or newer for the server, Node 22 or newer for the Node
example. The client examples load the client library from the repo's local
`dist/` build, because neffos.js 0.3.0 is not published yet; each one has a
commented line showing the npm or CDN form to switch to once it is.

## Running the server

```sh
cd server
go run .
```

It listens on `http://localhost:8080`, serves the neffos websocket endpoint
at `/ws`, the browser example at `/`, and the repo's `dist/` build at
`/dist/`. Run `npm run build` in the repo root first, so `dist/` exists.

## Examples

| Example | Shows |
| --- | --- |
| [server](server) | A neffos (Go) chat server: one namespace, room join/leave, a `chat` event broadcast to the room |
| [browser](browser) | The `neffos` global from a plain `<script>` tag, no bundler |
| [node](node) | Node's built-in `WebSocket` (22+) and `readline/promises` for a terminal chat client |
| [bundler](bundler) | Importing `neffos.js` as a bare specifier and bundling it with esbuild |
