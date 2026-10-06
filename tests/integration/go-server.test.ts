// Runs the TypeScript client against a real neffos (Go) server, not a fake.
// It builds tests/integration/testserver with `go build` into a temp binary
// and spawns that binary directly (not `go run .`), so the pid Node holds is
// the server process itself, not a `go run` wrapper around it. The server
// prints its bound address as the first stdout line. The suite then
// exercises dial, connect, emit, ask, a server-mapped error, binary bodies,
// room join/leave and a server-initiated kick that triggers a reconnect.
//
// Skipped entirely when `go` is not on PATH (`describe.skipIf`). Every case
// below runs twice, once per WebSocket source: the Node 22+ global
// `WebSocket` and the `ws` package, because `dial` resolves the socket
// constructor differently for each (see src/ws.ts).

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type AddressInfo, type Server, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import { WebSocket as WsPackageWebSocket } from 'ws';
import { dial, ErrBadNamespace, type Conn, type NeffosError, type WebSocketConstructor } from '../../src/index';

function hasGo(): boolean {
    const found = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['go']);
    return found.status === 0;
}

async function waitUntil(predicate: () => boolean, timeoutMs = 5000, stepMs = 25): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        if (predicate()) {
            return;
        }
        if (Date.now() >= deadline) {
            throw new Error(`condition not met within ${timeoutMs} ms`);
        }
        await new Promise((resolve) => setTimeout(resolve, stepMs));
    }
}

// Sends SIGTERM, then SIGKILL if the process has not exited after 2s. Plain
// `kill('SIGKILL')` is enough on its own, but SIGTERM first gives the server
// a chance to close its listening socket immediately rather than waiting for
// the kernel to notice the process is gone.
async function killProcess(proc: ChildProcess): Promise<void> {
    if (!proc.pid) {
        return;
    }
    if (process.platform === 'win32') {
        spawnSync('taskkill', ['/pid', String(proc.pid), '/F']);
        return;
    }
    proc.kill('SIGTERM');
    const exited = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), 2000);
        proc.once('exit', () => {
            clearTimeout(timer);
            resolve(true);
        });
    });
    if (!exited) {
        proc.kill('SIGKILL');
    }
}

describe.skipIf(!hasGo())('go-server integration', () => {
    let serverProcess: ChildProcess;
    let endpoint: string;
    let tmpDir: string | undefined;
    const openConns: Conn[] = [];

    beforeAll(async () => {
        const testserverDir = fileURLToPath(new URL('./testserver/', import.meta.url));
        tmpDir = mkdtempSync(join(tmpdir(), 'neffosjs-testserver-'));
        const binaryPath = join(tmpDir, process.platform === 'win32' ? 'testserver.exe' : 'testserver');

        const build = spawnSync('go', ['build', '-o', binaryPath, '.'], { cwd: testserverDir });
        if (build.status !== 0) {
            throw new Error(`go build failed: ${build.stderr?.toString() ?? build.error?.message ?? 'unknown error'}`);
        }

        // Spawning the built binary directly, instead of `go run .`, means
        // this pid is the server itself: killing it does not leave an
        // orphaned child holding the port, on any platform.
        serverProcess = spawn(binaryPath, ['-addr', '127.0.0.1:0'], { stdio: ['ignore', 'pipe', 'pipe'] });
        serverProcess.stderr?.on('data', (chunk: Buffer) => {
            process.stderr.write(`[testserver] ${chunk.toString()}`);
        });

        const addr = await new Promise<string>((resolve, reject) => {
            if (!serverProcess.stdout) {
                reject(new Error('testserver process has no stdout'));
                return;
            }
            const rl = createInterface({ input: serverProcess.stdout });
            rl.once('line', (line) => {
                rl.close();
                resolve(line.trim());
            });
            serverProcess.once('error', reject);
            serverProcess.once('exit', (code) => {
                reject(new Error(`testserver exited early with code ${code}`));
            });
        });
        endpoint = `ws://${addr}/echo`;

        // The server is listening as soon as the address line is printed, but
        // poll HEAD /echo (302, see testserver/main.go) to be sure before dialing.
        let ready = false;
        for (let i = 0; i < 100 && !ready; i++) {
            try {
                await fetch(`http://${addr}/echo`, { method: 'HEAD' });
                ready = true;
            } catch {
                await new Promise((resolve) => setTimeout(resolve, 50));
            }
        }
        if (!ready) {
            throw new Error('testserver did not answer HEAD /echo in time');
        }
    }, 30000);

    afterAll(async () => {
        if (serverProcess?.pid) {
            await killProcess(serverProcess);
        }
        if (tmpDir) {
            rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    afterEach(() => {
        for (const conn of openConns.splice(0)) {
            conn.close();
        }
    });

    const sources: Array<{ label: string; webSocket: WebSocketConstructor }> = [
        { label: 'global WebSocket', webSocket: globalThis.WebSocket },
        { label: 'ws package', webSocket: WsPackageWebSocket },
    ];

    for (const { label, webSocket } of sources) {
        describe(label, () => {
            test('dial and connect', async () => {
                const conn = await dial(endpoint, { default: {} }, { WebSocket: webSocket });
                openConns.push(conn);

                const ns = await conn.connect('default');
                expect(ns.namespace).toBe('default');
            });

            test('emit reaches the handler', async () => {
                const received: string[] = [];
                const conn = await dial(
                    endpoint,
                    {
                        default: {
                            echo(_ns, msg) {
                                received.push(msg.text());
                            },
                        },
                    },
                    { WebSocket: webSocket },
                );
                openConns.push(conn);

                const ns = await conn.connect('default');
                ns.emit('echo', 'hello from emit');

                await waitUntil(() => received.length > 0);
                expect(received[0]).toBe('hello from emit');
            });

            test('ask resolves with the server reply', async () => {
                const conn = await dial(endpoint, { default: {} }, { WebSocket: webSocket });
                openConns.push(conn);

                const ns = await conn.connect('default');
                const reply = await ns.ask('echo', 'ping');
                expect(reply.text()).toBe('ping');
            });

            test('connecting to a namespace the server does not know rejects with ErrBadNamespace', async () => {
                // "nope" is registered on the client (so the local check in
                // Conn.connect passes) but not on the testserver, so the
                // rejection comes from the server's "bad namespace" error text.
                const conn = await dial(endpoint, { default: {}, nope: {} }, { WebSocket: webSocket });
                openConns.push(conn);

                await expect(conn.connect('nope')).rejects.toBe(ErrBadNamespace);
            });

            test('binary ask round-trips the exact bytes', async () => {
                const conn = await dial(endpoint, { default: {} }, { WebSocket: webSocket });
                openConns.push(conn);

                const ns = await conn.connect('default');
                const body = new TextEncoder().encode('binary payload éè');
                const reply = await ns.ask('echo', body);
                expect(reply.bytes()).toEqual(body);
            });

            test('binary ask round-trips bytes that are not valid UTF-8', async () => {
                const conn = await dial(endpoint, { default: {} }, { WebSocket: webSocket });
                openConns.push(conn);

                const ns = await conn.connect('default');
                const body = new Uint8Array([0xff, 0x00, 0x80, 0x3b, 0xfe]);
                const reply = await ns.ask('echo', body);
                expect(reply.Body).toBeInstanceOf(Uint8Array);
                expect(reply.bytes()).toEqual(body);
            });

            test('join and leave a room', async () => {
                const conn = await dial(endpoint, { default: {} }, { WebSocket: webSocket });
                openConns.push(conn);

                const ns = await conn.connect('default');
                const room = await ns.joinRoom('room1');
                expect(room.name).toBe('room1');
                expect(ns.room('room1')).toBe(room);

                await room.leave();
                expect(ns.room('room1')).toBeUndefined();
            });

            test('a server-initiated kick reconnects and restores the namespace and room', async () => {
                const conn = await dial(
                    endpoint,
                    { default: {} },
                    {
                        WebSocket: webSocket,
                        reconnect: { initialDelay: 50, maxDelay: 200 },
                    },
                );
                openConns.push(conn);

                const ns = await conn.connect('default');
                await ns.joinRoom('room1');

                ns.emit('kick', '');

                // wasReconnected() alone can turn true before the restore finishes, and
                // the namespace and room checks alone are true before the kick lands.
                await waitUntil(() => conn.wasReconnected() && conn.namespace('default') === ns && ns.room('room1') !== undefined, 8000);
                expect(conn.isClosed()).toBe(false);

                // The same NSConn and its room are usable again: the restore
                // reattaches the existing Conn rather than replacing it.
                const reply = await ns.ask('echo', 'after reconnect');
                expect(reply.text()).toBe('after reconnect');
                expect(ns.room('room1')).toBeDefined();
            }, 15000);

            test('when the server connects the namespace itself, the reconnect restores the room on the same NSConn', async () => {
                const conn = await dial(
                    endpoint + '?force=1',
                    { default: {} },
                    {
                        WebSocket: webSocket,
                        reconnect: { initialDelay: 50, maxDelay: 200 },
                    },
                );
                openConns.push(conn);

                await waitUntil(() => conn.namespace('default') !== undefined);
                const ns = conn.namespace('default');
                if (ns === undefined) throw new Error('the server did not connect "default"');
                const room = await ns.joinRoom('room1');

                ns.emit('kick', '');

                await waitUntil(() => conn.wasReconnected() && conn.namespace('default') === ns && ns.room('room1') !== undefined, 8000);
                expect(ns.roomNames()).toEqual(['room1']);
                expect(room.emit('echo', 'room after reconnect')).toBe(true);
                const reply = await ns.ask('echo', 'after reconnect');
                expect(reply.text()).toBe('after reconnect');
            }, 15000);
        });
    }
});

describe('a socket that never finishes connecting', () => {
    // A TCP listener that accepts and then says nothing, so the WebSocket stays
    // CONNECTING. Closing it there makes the ws package emit "error"; with no
    // listener left, Node would treat it as an unhandled error and exit.
    let sink: Server;
    let sinkEndpoint: string;
    const sockets: Socket[] = [];

    beforeAll(async () => {
        sink = createServer((socket) => {
            sockets.push(socket);
        });
        await new Promise<void>((resolve) => sink.listen(0, '127.0.0.1', resolve));
        const { port } = sink.address() as AddressInfo;
        sinkEndpoint = `ws://127.0.0.1:${port}/echo`;
    });

    afterAll(async () => {
        for (const socket of sockets) socket.destroy();
        await new Promise<void>((resolve) => sink.close(() => resolve()));
    });

    test('a dial timeout with the ws package rejects with ERR_TIMEOUT and does not crash', async () => {
        const err: unknown = await dial(sinkEndpoint, { default: {} }, { WebSocket: WsPackageWebSocket, timeout: 200 }).catch((e: unknown) => e);
        expect((err as NeffosError).code).toBe('ERR_TIMEOUT');
        // Give the ws package its next tick to emit "error" for the aborted handshake.
        await new Promise((resolve) => setTimeout(resolve, 100));
    });

    test('an abort with the ws package rejects with the reason and does not crash', async () => {
        const controller = new AbortController();
        const pending = dial(sinkEndpoint, { default: {} }, { WebSocket: WsPackageWebSocket, signal: controller.signal });
        setTimeout(() => controller.abort(new Error('stop')), 100);
        await expect(pending).rejects.toThrow('stop');
        await new Promise((resolve) => setTimeout(resolve, 100));
    });
});
