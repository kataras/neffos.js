import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { FakeWebSocket } from './helpers/fake-ws';
import { FakeServer, parseFrame, type ParsedFrame } from './helpers/fake-server';
import {
    Conn,
    ErrBadNamespace,
    ErrBadRoom,
    ErrClosed,
    ErrInvalidPayload,
    Message,
    NSConn,
    NeffosError,
    OnNamespaceConnect,
    OnNamespaceConnected,
    OnNamespaceDisconnect,
    OnNativeMessage,
    OnRoomJoin,
    OnRoomJoined,
    OnRoomLeave,
    OnRoomLeft,
    dial,
    reply,
    type ConnHandler,
    type Options,
} from '../src/index';

const endpoint = 'ws://neffos.test/echo';
const encoder = new TextEncoder();

type Handler = (ns: NSConn, msg: Message) => unknown;
type Recorded = { event: string; namespace: string; room: string; body: unknown; isLocal: boolean; isForced: boolean };

/** Handlers for the "default" namespace that record every system event they see. */
function recordingHandlers(extra: Record<string, Handler> = {}) {
    const events: Recorded[] = [];
    const record: Handler = (_ns, msg) => {
        events.push({
            event: msg.Event,
            namespace: msg.Namespace,
            room: msg.Room,
            body: msg.Body,
            isLocal: msg.IsLocal,
            isForced: msg.IsForced,
        });
        return null;
    };
    const handlers: Record<string, Handler> = {
        [OnNamespaceConnect]: record,
        [OnNamespaceConnected]: record,
        [OnNamespaceDisconnect]: record,
        [OnRoomJoin]: record,
        [OnRoomJoined]: record,
        [OnRoomLeave]: record,
        [OnRoomLeft]: record,
        ...extra,
    };
    return { events, handlers };
}

/** The next socket the client creates is attached to `server` and opened. */
function serveNext(server: FakeServer): void {
    const off = FakeWebSocket.onCreate((ws) => {
        off();
        server.attach(ws);
        queueMicrotask(() => ws.open());
    });
}

/** Every socket the client creates from now on is attached to `server` and opened. */
function serveAll(server: FakeServer): () => void {
    return FakeWebSocket.onCreate((ws) => {
        server.attach(ws);
        queueMicrotask(() => ws.open());
    });
}

/** Every socket the client creates from now on fails the way a refused TCP connection does. */
function failAll(): () => void {
    return FakeWebSocket.onCreate((ws) => {
        queueMicrotask(() => {
            ws.serverError();
            ws.serverClose(1006);
        });
    });
}

/** Dials through a FakeWebSocket driven by `server`, injected with `Options.WebSocket`. */
async function dialFake(server: FakeServer, connHandler: unknown, options: Options = {}): Promise<{ conn: Conn; ws: FakeWebSocket }> {
    serveNext(server);
    const conn = await dial(endpoint, connHandler as ConnHandler, { WebSocket: FakeWebSocket, ...options });
    return { conn, ws: FakeWebSocket.last() };
}

/** Lets queued microtasks and fake-server replies run (real timers only). */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Lets queued microtasks run without touching timers, for tests that use fake timers. */
async function drain(): Promise<void> {
    for (let i = 0; i < 50; i++) {
        await Promise.resolve();
    }
}

/** Neffos frames the client sent on `ws`, skipping the handshake. */
function framesSent(ws: FakeWebSocket): ParsedFrame[] {
    return ws.sent.map(parseFrame).filter((f): f is ParsedFrame => f !== null);
}

/** A promise with its resolve function, for handlers the test wants to hold open. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => {
        resolve = r;
    });
    return { promise, resolve };
}

beforeEach(() => {
    FakeWebSocket.reset();
});

afterEach(() => {
    const unhandled = FakeWebSocket.unhandledErrors;
    FakeWebSocket.reset();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    // A socket closed while connecting fires "error"; with no listener the ws package crashes Node.
    expect(unhandled).toBe(0);
});

describe('handshake', () => {
    test('sends the ack byte on open and resolves with the server-assigned ID', async () => {
        const server = new FakeServer({ id: 'abc123' });
        const { conn, ws } = await dialFake(server, { default: {} });

        expect(ws.url).toBe(endpoint);
        expect(ws.sent[0]).toBe('M');
        expect(ws.binaryType).toBe('arraybuffer');
        expect(conn.ID).toBe('abc123');
        expect(conn.isAcknowledged()).toBe(true);
        expect(conn.isClosed()).toBe(false);
        expect(conn.wasReconnected()).toBe(false);
    });

    test('rejects with the server error text when the server refuses the connection', async () => {
        const server = new FakeServer({ refuse: 'not allowed' });
        await expect(dialFake(server, { default: {} })).rejects.toThrow('not allowed');
        expect(FakeWebSocket.last().closedByClient).not.toBeNull();
        expect(FakeWebSocket.instances).toHaveLength(1);
    });

    test('a refusal with a known error text rejects with the shared instance', async () => {
        const server = new FakeServer({ refuse: 'bad namespace' });
        await expect(dialFake(server, { default: {} })).rejects.toBe(ErrBadNamespace);
    });

    test('a refusal is not retried, even with reconnect on', async () => {
        const server = new FakeServer({ refuse: 'not allowed' });
        await expect(dialFake(server, { default: {} }, { reconnect: 10 })).rejects.toThrow('not allowed');
        await flush();
        expect(FakeWebSocket.instances).toHaveLength(1);
    });

    test('a ws:// prefix is added when the endpoint has no scheme', async () => {
        serveNext(new FakeServer());
        await dial('neffos.test/echo', { default: {} }, { WebSocket: FakeWebSocket });
        expect(FakeWebSocket.last().url).toBe('ws://neffos.test/echo');
    });

    test('an http:// endpoint is dialled as ws://', async () => {
        serveNext(new FakeServer());
        await dial('http://neffos.test/echo', { default: {} }, { WebSocket: FakeWebSocket });
        expect(FakeWebSocket.last().url).toBe('ws://neffos.test/echo');
    });

    test('rejects with a TypeError when the handler map mixes namespaces and events', async () => {
        const pending = dial(endpoint, { chat: () => null, default: {} }, { WebSocket: FakeWebSocket });
        await expect(pending).rejects.toThrow(TypeError);
        await expect(pending).rejects.toThrow('mix of namespaces');
        expect(FakeWebSocket.instances).toHaveLength(0);
    });

    test('headers become X-Websocket-Header- URL parameters for a non-ws WebSocket', async () => {
        await dialFake(new FakeServer(), { default: {} }, { headers: { Authorization: 'Bearer t' } });
        const ws = FakeWebSocket.last();
        expect(ws.url).toBe(endpoint + '?X-Websocket-Header-Authorization=Bearer+t');
        expect(ws.options).toBeUndefined();
    });

    test('headers go in the third constructor argument for the ws package', async () => {
        // Has `terminate`, like the ws package's WebSocket.
        class WsLikeSocket extends FakeWebSocket {
            terminate(): void {}
        }
        await dialFake(new FakeServer(), { default: {} }, { WebSocket: WsLikeSocket, headers: { Authorization: 'Bearer t', 'X-N': 2 } });
        const ws = FakeWebSocket.last();
        expect(ws.url).toBe(endpoint);
        expect(ws.options).toEqual({ headers: { Authorization: 'Bearer t', 'X-N': '2' } });
    });

    test('protocols are passed to the constructor', async () => {
        await dialFake(new FakeServer(), { default: {} }, { protocols: ['neffos'] });
        expect(FakeWebSocket.last().protocols).toEqual(['neffos']);
    });

    test('frames that arrive before the ID are handled after it', async () => {
        const { events, handlers } = recordingHandlers();
        FakeWebSocket.onCreate((ws) => {
            ws.onClientSend = (data) => {
                if (data === 'M') {
                    queueMicrotask(() => {
                        ws.serverSend('#5;default;;_OnNamespaceConnect;0;0;');
                        ws.serverSend('Aearly');
                    });
                }
            };
            queueMicrotask(() => ws.open());
        });
        const conn = await dial(endpoint, { default: handlers } as ConnHandler, { WebSocket: FakeWebSocket });
        await flush();

        expect(conn.ID).toBe('early');
        expect(conn.namespace('default')).toBeDefined();
        expect(FakeWebSocket.last().sent).toContain('#5;;;;;;');
        expect(events.map((e) => e.event)).toEqual([OnNamespaceConnected]);
    });

    test('without reconnect, a socket that closes before the handshake rejects with ERR_DIAL', async () => {
        failAll();
        const err: unknown = await dial(endpoint, { default: {} }, { WebSocket: FakeWebSocket }).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(NeffosError);
        expect((err as NeffosError).code).toBe('ERR_DIAL');
        expect(FakeWebSocket.instances).toHaveLength(1);
    });
});

describe('dial timeout and signal', () => {
    test('timeout rejects with ERR_TIMEOUT and closes the socket', async () => {
        vi.useFakeTimers();
        // The socket never opens.
        const pending = dial(endpoint, { default: {} }, { WebSocket: FakeWebSocket, timeout: 500 }).catch((e: unknown) => e);
        await drain();
        expect(FakeWebSocket.instances).toHaveLength(1);

        await vi.advanceTimersByTimeAsync(499);
        expect(FakeWebSocket.last().closedByClient).toBeNull();
        await vi.advanceTimersByTimeAsync(1);

        const err = await pending;
        expect(err).toBeInstanceOf(NeffosError);
        expect((err as NeffosError).code).toBe('ERR_TIMEOUT');
        expect(FakeWebSocket.last().closedByClient).not.toBeNull();
    });

    test('aborting the signal rejects with its reason and closes the socket', async () => {
        const controller = new AbortController();
        const pending = dial(endpoint, { default: {} }, { WebSocket: FakeWebSocket, signal: controller.signal });
        await flush();
        const reason = new Error('user cancelled');
        controller.abort(reason);

        await expect(pending).rejects.toBe(reason);
        expect(FakeWebSocket.last().closedByClient).not.toBeNull();
    });

    test('a timeout while the socket is still connecting leaves an error listener on it', async () => {
        vi.useFakeTimers();
        const pending = dial(endpoint, { default: {} }, { WebSocket: FakeWebSocket, timeout: 100 }).catch((e: unknown) => e);
        await drain();
        await vi.advanceTimersByTimeAsync(100);
        await pending;
        await drain();

        expect(FakeWebSocket.last().closedByClient).not.toBeNull();
        expect(FakeWebSocket.last().onerror).not.toBeNull();
        expect(FakeWebSocket.unhandledErrors).toBe(0);
    });

    test('an abort while the socket is still connecting leaves an error listener on it', async () => {
        const controller = new AbortController();
        const pending = dial(endpoint, { default: {} }, { WebSocket: FakeWebSocket, signal: controller.signal }).catch((e: unknown) => e);
        await flush();
        controller.abort();
        await pending;
        await flush();

        expect(FakeWebSocket.unhandledErrors).toBe(0);
    });

    test('an already aborted signal rejects without opening a socket', async () => {
        const reason = new Error('too late');
        await expect(dial(endpoint, { default: {} }, { WebSocket: FakeWebSocket, signal: AbortSignal.abort(reason) })).rejects.toBe(reason);
        expect(FakeWebSocket.instances).toHaveLength(0);
    });

    test('with reconnect on, a failed first dial is retried with backoff', async () => {
        vi.useFakeTimers();
        const server = new FakeServer();
        const stopFailing = failAll();
        const pending = dial(endpoint, { default: {} }, { WebSocket: FakeWebSocket, reconnect: { initialDelay: 1000, jitter: 0 } });
        await drain();
        expect(FakeWebSocket.instances).toHaveLength(1);

        stopFailing();
        serveNext(server);
        await vi.advanceTimersByTimeAsync(1000);
        const conn = await pending;

        expect(FakeWebSocket.instances).toHaveLength(2);
        expect(conn.isClosed()).toBe(false);
        // Not a reconnect: the first dial never succeeded.
        expect(conn.wasReconnected()).toBe(false);
        expect(FakeWebSocket.last().url).toBe(endpoint);
    });

    test('with reconnect on, maxRetries ends a failing first dial', async () => {
        vi.useFakeTimers();
        failAll();
        const pending = dial(endpoint, { default: {} }, { WebSocket: FakeWebSocket, reconnect: { initialDelay: 100, jitter: 0, maxRetries: 2 } }).catch((e: unknown) => e);
        await vi.advanceTimersByTimeAsync(1000);

        const err = await pending;
        expect((err as NeffosError).code).toBe('ERR_DIAL');
        expect(FakeWebSocket.instances).toHaveLength(3);
    });

    test('with reconnect on, timeout ends a failing first dial', async () => {
        vi.useFakeTimers();
        failAll();
        const pending = dial(endpoint, { default: {} }, { WebSocket: FakeWebSocket, timeout: 2500, reconnect: { initialDelay: 1000, jitter: 0 } }).catch((e: unknown) => e);
        await vi.advanceTimersByTimeAsync(2500);

        const err = await pending;
        expect((err as NeffosError).code).toBe('ERR_TIMEOUT');
        // Tries at 0 ms and 1000 ms; the one due at 3000 ms never happens.
        expect(FakeWebSocket.instances).toHaveLength(2);
        await vi.advanceTimersByTimeAsync(10000);
        expect(FakeWebSocket.instances).toHaveLength(2);
    });
});

describe('namespaces', () => {
    test('connect sends a connect ask and fires connect then connected locally', async () => {
        const server = new FakeServer();
        const { events, handlers } = recordingHandlers();
        const { conn, ws } = await dialFake(server, { default: handlers });

        const ns = await conn.connect('default');

        expect(ns).toBeInstanceOf(NSConn);
        expect(ns.namespace).toBe('default');
        expect(conn.namespace('default')).toBe(ns);

        const [frame] = framesSent(ws);
        expect(frame).toMatchObject({ namespace: 'default', room: '', event: OnNamespaceConnect, isError: false, body: '' });
        expect(frame?.wait).toMatch(/^\$[0-9a-z]+$/);
        expect(ws.sent[1]).toBe(`${frame?.wait};default;;_OnNamespaceConnect;0;0;`);

        expect(events.map((e) => [e.event, e.isLocal])).toEqual([
            [OnNamespaceConnect, true],
            [OnNamespaceConnected, true],
        ]);
    });

    test('every ask gets a different wait', async () => {
        const server = new FakeServer();
        const { conn, ws } = await dialFake(server, { default: {} });
        const ns = await conn.connect('default');
        await Promise.all([ns.ask('a', ''), ns.ask('b', ''), ns.joinRoom('r')]);

        const waits = framesSent(ws).map((f) => f.wait);
        expect(new Set(waits).size).toBe(waits.length);
    });

    test('concurrent connects to the same namespace share one ask', async () => {
        const server = new FakeServer();
        const { conn, ws } = await dialFake(server, { default: {} });

        const [a, b] = await Promise.all([conn.connect('default'), conn.connect('default')]);

        expect(a).toBe(b);
        expect(framesSent(ws).filter((f) => f.event === OnNamespaceConnect)).toHaveLength(1);
    });

    test('connect after disconnect sends a new connect ask', async () => {
        const server = new FakeServer();
        const { conn, ws } = await dialFake(server, { default: {} });
        const first = await conn.connect('default');
        expect(await conn.connect('default')).toBe(first);
        await first.disconnect();

        const second = await conn.connect('default');

        expect(second).not.toBe(first);
        expect(framesSent(ws).filter((f) => f.event === OnNamespaceConnect)).toHaveLength(2);
    });

    test('connect to a namespace with no handlers rejects with ErrBadNamespace and sends nothing', async () => {
        const server = new FakeServer();
        const { conn, ws } = await dialFake(server, { default: {} });

        await expect(conn.connect('other')).rejects.toBe(ErrBadNamespace);
        expect(framesSent(ws)).toHaveLength(0);
    });

    test('an error from the local connect handler aborts the connect', async () => {
        const server = new FakeServer();
        const denied = new Error('denied');
        const { conn, ws } = await dialFake(server, { default: { [OnNamespaceConnect]: () => denied } });

        await expect(conn.connect('default')).rejects.toBe(denied);
        expect(framesSent(ws)).toHaveLength(0);
    });

    test('an error thrown by the local connect handler rejects connect()', async () => {
        const server = new FakeServer();
        const denied = new Error('thrown');
        const { conn, ws } = await dialFake(server, {
            default: {
                [OnNamespaceConnect]: () => {
                    throw denied;
                },
            },
        });

        await expect(conn.connect('default')).rejects.toBe(denied);
        expect(framesSent(ws)).toHaveLength(0);
        expect(conn.namespace('default')).toBeUndefined();
    });

    test('an async local connect handler can abort the connect', async () => {
        const server = new FakeServer();
        const denied = new Error('async denied');
        const { conn } = await dialFake(server, { default: { [OnNamespaceConnect]: async () => denied } });

        await expect(conn.connect('default')).rejects.toBe(denied);
    });

    test('a server error reply to connect rejects with that error text', async () => {
        const server = new FakeServer().on(OnNamespaceConnect, () => new Error('server says no'));
        const { conn } = await dialFake(server, { default: {} });

        await expect(conn.connect('default')).rejects.toThrow('server says no');
        expect(conn.namespace('default')).toBeUndefined();
    });

    test('the server can connect the client to a namespace', async () => {
        const server = new FakeServer();
        const { events, handlers } = recordingHandlers();
        const { conn, ws } = await dialFake(server, { default: handlers });

        const waiting = conn.waitServerConnect('default');
        ws.serverSend('#7;default;;_OnNamespaceConnect;0;0;');
        const ns = await waiting;

        expect(ns.namespace).toBe('default');
        expect(conn.namespace('default')).toBe(ns);
        expect(ws.sent).toContain('#7;;;;;;');
        expect(events.map((e) => [e.event, e.isLocal])).toEqual([[OnNamespaceConnected, false]]);
    });

    test('a server connect to an unknown namespace is answered with "bad namespace"', async () => {
        const server = new FakeServer();
        const { ws } = await dialFake(server, { default: {} });

        ws.serverSend('#8;other;;_OnNamespaceConnect;0;0;');
        await flush();

        expect(ws.sent.at(-1)).toBe('#8;other;;_OnNamespaceConnect;1;0;bad namespace');
    });

    test('disconnect sends a disconnect ask and fires the local event', async () => {
        const server = new FakeServer();
        const { events, handlers } = recordingHandlers();
        const { conn, ws } = await dialFake(server, { default: handlers });
        const ns = await conn.connect('default');

        await expect(ns.disconnect()).resolves.toBeUndefined();

        expect(framesSent(ws).at(-1)).toMatchObject({ namespace: 'default', event: OnNamespaceDisconnect });
        expect(events.at(-1)).toMatchObject({ event: OnNamespaceDisconnect, isLocal: true });
        expect(conn.namespace('default')).toBeUndefined();
    });

    test('disconnect rejects with the server error', async () => {
        const server = new FakeServer().on(OnNamespaceDisconnect, () => new Error('stay'));
        const { conn } = await dialFake(server, { default: {} });
        const ns = await conn.connect('default');

        await expect(ns.disconnect()).rejects.toThrow('stay');
        expect(conn.namespace('default')).toBe(ns);
    });

    test('disconnect of a namespace that is not connected rejects with ErrBadNamespace', async () => {
        const server = new FakeServer();
        const { conn } = await dialFake(server, { default: {} });
        const ns = await conn.connect('default');
        await ns.disconnect();

        await expect(ns.disconnect()).rejects.toBe(ErrBadNamespace);
    });

    test('the server can disconnect the client from a namespace', async () => {
        const server = new FakeServer();
        const { events, handlers } = recordingHandlers();
        const { conn, ws } = await dialFake(server, { default: handlers });
        await conn.connect('default');
        events.length = 0;

        ws.serverSend('#3;default;;_OnNamespaceDisconnect;0;0;');
        await flush();

        expect(conn.namespace('default')).toBeUndefined();
        expect(ws.sent.at(-1)).toBe('#3;;;;;;');
        expect(events.map((e) => [e.event, e.isLocal])).toEqual([[OnNamespaceDisconnect, false]]);
    });
});

describe('messages', () => {
    test('emit sends the event with the body', async () => {
        const server = new FakeServer();
        const { conn, ws } = await dialFake(server, { default: {} });
        const ns = await conn.connect('default');

        expect(ns.emit('chat', 'hello; world')).toBe(true);

        expect(ws.sent.at(-1)).toBe(';default;;chat;0;0;hello; world');
    });

    test('emit to a namespace that is not connected sends nothing', async () => {
        const server = new FakeServer();
        const { conn, ws } = await dialFake(server, { default: {} });
        const ns = await conn.connect('default');
        await ns.disconnect();
        const before = ws.sent.length;

        expect(ns.emit('chat', 'hello')).toBe(false);
        expect(ws.sent.length).toBe(before);
    });

    test('ask resolves with the server reply', async () => {
        const server = new FakeServer().on('echo', (frame) => 'pong:' + frame.body);
        const { conn } = await dialFake(server, { default: {} });
        const ns = await conn.connect('default');

        const replyMsg = await ns.ask('echo', 'ping');

        expect(replyMsg.Body).toBe('pong:ping');
        expect(replyMsg.Event).toBe('echo');
        expect(replyMsg.Namespace).toBe('default');
    });

    test('ask rejects with the server error text', async () => {
        const server = new FakeServer().on('echo', () => new Error('boom'));
        const { conn } = await dialFake(server, { default: {} });
        const ns = await conn.connect('default');

        await expect(ns.ask('echo', 'ping')).rejects.toThrow('boom');
    });

    test('ask rejects with the shared instance when the server sends a known error', async () => {
        const server = new FakeServer().on('echo', () => new Error('bad room'));
        const { conn } = await dialFake(server, { default: {} });
        const ns = await conn.connect('default');

        await expect(ns.ask('echo', 'ping')).rejects.toBe(ErrBadRoom);
    });

    test('a server event reaches the matching handler', async () => {
        const server = new FakeServer();
        const received: Message[] = [];
        const { conn, ws } = await dialFake(server, {
            default: {
                chat: (_ns: NSConn, msg: Message) => {
                    received.push(msg);
                    return null;
                },
            },
        });
        await conn.connect('default');

        ws.serverSend(';default;;chat;0;0;hi there');
        await flush();

        expect(received).toHaveLength(1);
        expect(received[0]).toMatchObject({ Namespace: 'default', Event: 'chat', Body: 'hi there', IsLocal: false });
        expect(received[0]?.text()).toBe('hi there');
        expect(received[0]?.bytes()).toEqual(encoder.encode('hi there'));
    });

    test('OnAnyEvent receives every event that has no handler of its own', async () => {
        const server = new FakeServer();
        const seen: string[] = [];
        const { conn, ws } = await dialFake(server, {
            default: {
                _OnAnyEvent: (_ns: NSConn, msg: Message) => {
                    seen.push(msg.Event);
                    return null;
                },
            },
        });
        await conn.connect('default');

        ws.serverSend(';default;;unknown;0;0;x');
        await flush();

        expect(seen).toEqual([OnNamespaceConnect, OnNamespaceConnected, 'unknown']);
    });

    test('returning reply(body) from a handler sends the body back as a normal message', async () => {
        const server = new FakeServer();
        const { conn, ws } = await dialFake(server, { default: { chat: () => reply('got it') } });
        await conn.connect('default');

        ws.serverSend(';default;;chat;0;0;hi');
        await flush();

        expect(ws.sent.at(-1)).toBe(';default;;chat;0;0;got it');
    });

    test('returning an Error from a handler sends it back as an error message', async () => {
        const server = new FakeServer();
        const { conn, ws } = await dialFake(server, { default: { chat: () => new Error('nope') } });
        await conn.connect('default');

        ws.serverSend(';default;;chat;0;0;hi');
        await flush();

        expect(ws.sent.at(-1)).toBe(';default;;chat;1;0;nope');
    });

    test('an async handler that returns nothing sends nothing', async () => {
        const server = new FakeServer();
        const { conn, ws } = await dialFake(server, { default: { chat: async () => {} } });
        await conn.connect('default');
        const before = ws.sent.length;

        ws.serverSend(';default;;chat;0;0;hi');
        await flush();

        expect(ws.sent.slice(before)).toEqual([]);
    });

    test('an async handler that returns an Error sends it back', async () => {
        const server = new FakeServer();
        const { conn, ws } = await dialFake(server, {
            default: {
                chat: async () => {
                    await Promise.resolve();
                    return new Error('nope');
                },
            },
        });
        await conn.connect('default');
        const before = ws.sent.length;

        ws.serverSend(';default;;chat;0;0;hi');
        await flush();

        expect(ws.sent.slice(before)).toEqual([';default;;chat;1;0;nope']);
    });

    test('an error thrown by a handler is sent back too', async () => {
        const server = new FakeServer();
        const { conn, ws } = await dialFake(server, {
            default: {
                chat: async () => {
                    throw new Error('crashed');
                },
            },
        });
        await conn.connect('default');

        ws.serverSend(';default;;chat;0;0;hi');
        await flush();

        expect(ws.sent.at(-1)).toBe(';default;;chat;1;0;crashed');
    });

    test('events are handled in frame order, even when a handler is slow', async () => {
        const server = new FakeServer();
        const order: string[] = [];
        const gate = deferred();
        const { conn, ws } = await dialFake(server, {
            default: {
                slow: async (_ns: NSConn, msg: Message) => {
                    order.push('slow start ' + msg.text());
                    await gate.promise;
                    order.push('slow end ' + msg.text());
                },
                fast: (_ns: NSConn, msg: Message) => {
                    order.push('fast ' + msg.text());
                },
            },
        });
        await conn.connect('default');

        ws.serverSend(';default;;slow;0;0;1');
        ws.serverSend(';default;;fast;0;0;2');
        ws.serverSend(';default;;fast;0;0;3');
        await flush();
        expect(order).toEqual(['slow start 1']);

        gate.resolve();
        await flush();
        expect(order).toEqual(['slow start 1', 'slow end 1', 'fast 2', 'fast 3']);
    });

    test('a reply to an ask is not held up by a slow handler', async () => {
        const server = new FakeServer().on('echo', () => null);
        const gate = deferred();
        const { conn, ws } = await dialFake(server, { default: { slow: async () => gate.promise } });
        const ns = await conn.connect('default');

        ws.serverSend(';default;;slow;0;0;');
        const asking = ns.ask('echo', 'x');
        await flush();
        const wait = framesSent(ws).at(-1)?.wait;
        ws.serverSend(`${wait};default;;echo;0;0;pong`);

        await expect(asking).resolves.toMatchObject({ Body: 'pong' });
        gate.resolve();
    });

    test('emit, ask and Room.emit send a Uint8Array body as a binary frame, byte for byte', async () => {
        const server = new FakeServer();
        const { conn, ws } = await dialFake(server, { default: {} });
        const ns = await conn.connect('default');
        const room = await ns.joinRoom('r1');
        const bytes = new Uint8Array([0xff, 0x00, 0x80]);
        const frame = (header: string) => {
            const head = encoder.encode(header);
            const out = new Uint8Array(head.length + bytes.length);
            out.set(head, 0);
            out.set(bytes, head.length);
            return out;
        };

        expect(ns.emit('upload', bytes)).toBe(true);
        expect(ws.sent.at(-1)).toEqual(frame(';default;;upload;0;0;'));

        expect(room.emit('upload', bytes)).toBe(true);
        expect(ws.sent.at(-1)).toEqual(frame(';default;r1;upload;0;0;'));

        const asking = ns.ask('upload', bytes);
        const sent = ws.sent.at(-1);
        expect(sent).toBeInstanceOf(Uint8Array);
        const wait = parseFrame(sent as Uint8Array)?.wait ?? '';
        expect(sent).toEqual(frame(`${wait};default;;upload;0;0;`));
        await asking;
    });

    test('emitBinary with a Uint8Array body sends a binary frame', async () => {
        const server = new FakeServer();
        const { conn, ws } = await dialFake(server, { default: {} });
        const ns = await conn.connect('default');

        ns.emitBinary('blob', encoder.encode('bytes'));

        expect(ws.sent.at(-1)).toEqual(encoder.encode(';default;;blob;0;0;bytes'));
    });

    test('emitBinary with a string body sends the string bytes', async () => {
        const server = new FakeServer();
        const { conn, ws } = await dialFake(server, { default: {} });
        const ns = await conn.connect('default');
        const room = await ns.joinRoom('r1');

        ns.emitBinary('blob', 'text');
        expect(ws.sent.at(-1)).toEqual(encoder.encode(';default;;blob;0;0;text'));

        room.emitBinary('blob', 'hé');
        expect(ws.sent.at(-1)).toEqual(encoder.encode(';default;r1;blob;0;0;hé'));
    });

    test('a binary server event reaches the handler with the body as bytes', async () => {
        const server = new FakeServer();
        const bodies: unknown[] = [];
        const { conn, ws } = await dialFake(server, {
            default: {
                blob: (_ns: NSConn, msg: Message) => {
                    bodies.push(msg.Body);
                    return null;
                },
            },
        });
        await conn.connect('default');

        ws.serverSend(encoder.encode(';default;;blob;0;0;bytes'));
        await flush();

        expect(bodies).toEqual([encoder.encode('bytes')]);
        expect(bodies[0]).toBeInstanceOf(Uint8Array);
    });

    test('a native text message reaches the OnNativeMessage handler', async () => {
        const server = new FakeServer();
        const received: Message[] = [];
        const { conn, ws } = await dialFake(server, {
            [OnNativeMessage]: (_ns: NSConn, msg: Message) => {
                received.push(msg);
                return null;
            },
        });
        await conn.connect('');

        ws.serverSend('raw text');
        await flush();

        expect(received.map((m) => m.Body)).toEqual(['raw text']);
        expect(received[0]).toMatchObject({ IsNative: true, Event: OnNativeMessage, Namespace: '' });
    });

    test('a native binary message reaches the OnNativeMessage handler', async () => {
        const server = new FakeServer();
        const bodies: unknown[] = [];
        const { conn, ws } = await dialFake(server, {
            [OnNativeMessage]: (_ns: NSConn, msg: Message) => {
                bodies.push(msg.Body);
                return null;
            },
        });
        await conn.connect('');

        ws.serverSend(encoder.encode('raw bytes'));
        await flush();

        expect(bodies).toEqual([encoder.encode('raw bytes')]);
    });

    test('an invalid frame is reported to Options.onError', async () => {
        const server = new FakeServer();
        const onError = vi.fn();
        const { conn, ws } = await dialFake(server, { default: {} }, { onError });
        await conn.connect('default');

        ws.serverSend('not a neffos frame');
        ws.serverSend(';nowhere;;chat;0;0;x');
        await flush();

        expect(onError.mock.calls).toEqual([[ErrInvalidPayload], [ErrBadNamespace]]);
    });
});

describe('onError', () => {
    test('an onError that throws does not stop later events from reaching their handlers', async () => {
        const server = new FakeServer();
        const received: string[] = [];
        const onError = vi.fn(() => {
            throw new Error('broken onError');
        });
        const { conn, ws } = await dialFake(server, { default: { chat: (_ns: NSConn, msg: Message) => void received.push(msg.text()) } }, { onError });
        await conn.connect('default');

        ws.serverSend(';nowhere;;chat;0;0;lost'); // ErrBadNamespace, reported from the dispatch chain
        ws.serverSend('not a neffos frame'); // ErrInvalidPayload, reported straight from onmessage
        ws.serverSend(';default;;chat;0;0;after');
        await flush();

        expect(onError).toHaveBeenCalledTimes(2);
        expect(received).toEqual(['after']);
    });
});

describe('dispatch after a drop', () => {
    test('frames queued behind a slow handler are not dispatched once the socket drops', async () => {
        const server = new FakeServer();
        const gate = deferred();
        const chat = vi.fn();
        const onError = vi.fn();
        const { conn, ws } = await dialFake(server, { default: { slow: async () => gate.promise, chat } }, { onError });
        await conn.connect('default');

        ws.serverSend(';default;;slow;0;0;');
        ws.serverSend(';default;;chat;0;0;queued');
        await flush();
        ws.serverClose(1006);
        gate.resolve();
        await flush();

        expect(chat).not.toHaveBeenCalled();
        expect(onError).not.toHaveBeenCalled();
    });
});

describe('ask timeout and signal', () => {
    test('timeout rejects with ERR_TIMEOUT', async () => {
        vi.useFakeTimers();
        const server = new FakeServer().on('slow', () => null);
        const { conn } = await dialFake(server, { default: {} });
        const ns = await conn.connect('default');

        const pending = ns.ask('slow', 'x', { timeout: 200 }).catch((e: unknown) => e);
        await vi.advanceTimersByTimeAsync(199);
        await vi.advanceTimersByTimeAsync(1);

        const err = await pending;
        expect(err).toBeInstanceOf(NeffosError);
        expect((err as NeffosError).code).toBe('ERR_TIMEOUT');
    });

    test('Options.askTimeout is the default timeout', async () => {
        vi.useFakeTimers();
        const server = new FakeServer().on('slow', () => null);
        const { conn } = await dialFake(server, { default: {} }, { askTimeout: 300 });
        const ns = await conn.connect('default');

        let settled: unknown = 'pending';
        ns.ask('slow', 'x').catch((e: unknown) => {
            settled = e;
        });
        await vi.advanceTimersByTimeAsync(299);
        expect(settled).toBe('pending');
        await vi.advanceTimersByTimeAsync(1);
        expect((settled as NeffosError).code).toBe('ERR_TIMEOUT');
    });

    test('a reply that arrives after the timeout is ignored', async () => {
        vi.useFakeTimers();
        const server = new FakeServer().on('slow', () => null);
        const handler = vi.fn();
        const onError = vi.fn();
        const { conn, ws } = await dialFake(server, { default: { slow: handler } }, { onError });
        const ns = await conn.connect('default');

        const pending = ns.ask('slow', 'x', { timeout: 100 }).catch((e: unknown) => e);
        await vi.advanceTimersByTimeAsync(100);
        await pending;
        const wait = framesSent(ws).at(-1)?.wait;
        const before = ws.sent.length;

        ws.serverSend(`${wait};default;;slow;0;0;late`);
        await drain();

        expect(handler).not.toHaveBeenCalled();
        expect(onError).not.toHaveBeenCalled();
        expect(ws.sent.length).toBe(before);
    });

    test('aborting the signal rejects with its reason', async () => {
        const server = new FakeServer().on('slow', () => null);
        const { conn } = await dialFake(server, { default: {} });
        const ns = await conn.connect('default');
        const controller = new AbortController();

        const pending = ns.ask('slow', 'x', { signal: controller.signal });
        const reason = new Error('stop');
        controller.abort(reason);

        await expect(pending).rejects.toBe(reason);
    });

    test('an already aborted signal rejects without sending', async () => {
        const server = new FakeServer();
        const { conn, ws } = await dialFake(server, { default: {} });
        const ns = await conn.connect('default');
        const before = ws.sent.length;

        await expect(ns.ask('x', '', { signal: AbortSignal.abort('no') })).rejects.toBe('no');
        expect(ws.sent.length).toBe(before);
    });
});

describe('rooms', () => {
    test('joinRoom sends a join ask, fires join then joined, and returns the room', async () => {
        const server = new FakeServer();
        const { events, handlers } = recordingHandlers();
        const { conn, ws } = await dialFake(server, { default: handlers });
        const ns = await conn.connect('default');
        events.length = 0;

        const room = await ns.joinRoom('room1');

        expect(room.name).toBe('room1');
        expect(ns.room('room1')).toBe(room);
        expect(ns.roomNames()).toEqual(['room1']);
        expect(framesSent(ws).at(-1)).toMatchObject({ namespace: 'default', room: 'room1', event: OnRoomJoin });
        expect(events.map((e) => [e.event, e.room, e.isLocal])).toEqual([
            [OnRoomJoin, 'room1', true],
            [OnRoomJoined, 'room1', true],
        ]);
    });

    test('room.emit sends to the room', async () => {
        const server = new FakeServer();
        const { conn, ws } = await dialFake(server, { default: {} });
        const ns = await conn.connect('default');
        const room = await ns.joinRoom('room1');

        expect(room.emit('chat', 'hi room')).toBe(true);
        expect(ws.sent.at(-1)).toBe(';default;room1;chat;0;0;hi room');
    });

    test('room.leave sends a leave ask, fires leave then left, and forgets the room', async () => {
        const server = new FakeServer();
        const { events, handlers } = recordingHandlers();
        const { conn, ws } = await dialFake(server, { default: handlers });
        const ns = await conn.connect('default');
        const room = await ns.joinRoom('room1');
        events.length = 0;

        await expect(room.leave()).resolves.toBeUndefined();

        expect(ns.room('room1')).toBeUndefined();
        expect(framesSent(ws).at(-1)).toMatchObject({ room: 'room1', event: OnRoomLeave });
        expect(events.map((e) => e.event)).toEqual([OnRoomLeave, OnRoomLeft]);
        expect(room.emit('chat', 'x')).toBe(false);
        await expect(room.leave()).rejects.toBe(ErrBadRoom);
    });

    test('leaveAll leaves every room', async () => {
        const server = new FakeServer();
        const { conn, ws } = await dialFake(server, { default: {} });
        const ns = await conn.connect('default');
        await ns.joinRoom('a');
        await ns.joinRoom('b');

        await expect(ns.leaveAll()).resolves.toBeUndefined();

        expect(ns.roomNames()).toEqual([]);
        expect(framesSent(ws).filter((f) => f.event === OnRoomLeave).map((f) => f.room).sort()).toEqual(['a', 'b']);
    });

    test('leaveAll rejects with the first error after every leave settles', async () => {
        const server = new FakeServer().on(OnRoomLeave, (frame) => (frame.room === 'a' ? new Error('cannot leave a') : undefined));
        const { conn } = await dialFake(server, { default: {} });
        const ns = await conn.connect('default');
        await ns.joinRoom('a');
        await ns.joinRoom('b');

        await expect(ns.leaveAll()).rejects.toThrow('cannot leave a');
        expect(ns.roomNames()).toEqual(['a']);
    });

    test('the server can put the client in a room', async () => {
        const server = new FakeServer();
        const { conn, ws } = await dialFake(server, { default: {} });
        const ns = await conn.connect('default');

        ws.serverSend('#9;default;lobby;_OnRoomJoin;0;0;');
        await flush();

        expect(ns.room('lobby')).toBeDefined();
        expect(ws.sent.at(-1)).toBe('#9;;;;;;');
    });

    test('a server join refused by the local handler is answered with the error', async () => {
        const server = new FakeServer();
        const { conn, ws } = await dialFake(server, { default: { [OnRoomJoin]: async () => new Error('full') } });
        const ns = await conn.connect('default');

        ws.serverSend('#9;default;lobby;_OnRoomJoin;0;0;');
        await flush();

        expect(ns.room('lobby')).toBeUndefined();
        expect(ws.sent.at(-1)).toBe('#9;default;lobby;_OnRoomJoin;1;0;full');
    });

    test('the server can take the client out of a room', async () => {
        const server = new FakeServer();
        const { events, handlers } = recordingHandlers();
        const { conn, ws } = await dialFake(server, { default: handlers });
        const ns = await conn.connect('default');
        await ns.joinRoom('lobby');
        events.length = 0;

        ws.serverSend('#4;default;lobby;_OnRoomLeave;0;0;');
        await flush();

        expect(ns.room('lobby')).toBeUndefined();
        expect(ws.sent.at(-1)).toBe('#4;;;;;;');
        expect(events.map((e) => [e.event, e.isLocal])).toEqual([
            [OnRoomLeave, false],
            [OnRoomLeft, false],
        ]);
    });
});

describe('close', () => {
    test('close fires forced disconnects locally, closes the socket and stops writes', async () => {
        const server = new FakeServer();
        const { events, handlers } = recordingHandlers();
        const { conn, ws } = await dialFake(server, { default: handlers });
        const ns = await conn.connect('default');
        await ns.joinRoom('room1');
        events.length = 0;

        conn.close();

        expect(conn.isClosed()).toBe(true);
        expect(ws.closedByClient).not.toBeNull();
        expect(events.map((e) => [e.event, e.isForced])).toEqual([
            [OnRoomLeave, true],
            [OnRoomLeft, true],
            [OnNamespaceDisconnect, true],
        ]);
        expect(ns.emit('chat', 'x')).toBe(false);
        conn.close(); // idempotent
    });

    test('a pending ask rejects with ErrClosed when the connection closes', async () => {
        const server = new FakeServer().on('slow', () => null);
        const { conn } = await dialFake(server, { default: {} });
        const ns = await conn.connect('default');

        const pending = ns.ask('slow', 'x');
        conn.close();

        await expect(pending).rejects.toBe(ErrClosed);
    });

    test('ask after close rejects with ErrClosed', async () => {
        const server = new FakeServer();
        const { conn } = await dialFake(server, { default: {} });
        const ns = await conn.connect('default');
        conn.close();

        await expect(ns.ask('x', '')).rejects.toBe(ErrClosed);
        await expect(conn.connect('default')).rejects.toBe(ErrClosed);
    });

    test('without reconnect, a server drop closes the connection', async () => {
        const server = new FakeServer().on('slow', () => null);
        const { events, handlers } = recordingHandlers();
        const { conn, ws } = await dialFake(server, { default: handlers });
        const ns = await conn.connect('default');
        const pending = ns.ask('slow', '');
        events.length = 0;

        ws.serverError();
        ws.serverClose(1006, 'gone');

        expect(conn.isClosed()).toBe(true);
        expect(conn.closeInfo).toMatchObject({ code: 1006, reason: 'gone', wasClean: false, error: { type: 'error' } });
        expect(events.map((e) => [e.event, e.isForced])).toEqual([[OnNamespaceDisconnect, true]]);
        await expect(pending).rejects.toBe(ErrClosed);
        await flush();
        expect(FakeWebSocket.instances).toHaveLength(1);
    });
});

describe('reconnect', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    /** Sockets the client created after the first one. */
    const redials = () => FakeWebSocket.instances.slice(1);

    test('after the server drops the connection the same Conn redials and restores namespaces and rooms in order', async () => {
        const server = new FakeServer();
        const { events, handlers } = recordingHandlers();
        const { conn, ws } = await dialFake(server, { default: handlers, other: {} }, { reconnect: { initialDelay: 1000, jitter: 0 } });
        const ns = await conn.connect('default');
        await conn.connect('other');
        const room = await ns.joinRoom('r1');
        await ns.joinRoom('r2');
        events.length = 0;
        serveAll(server);

        ws.serverClose(1006);
        expect(conn.isClosed()).toBe(false);
        expect(conn.closeInfo?.code).toBe(1006);
        expect(events.map((e) => [e.event, e.room, e.isForced])).toEqual([
            [OnRoomLeave, 'r1', true],
            [OnRoomLeft, 'r1', true],
            [OnRoomLeave, 'r2', true],
            [OnRoomLeft, 'r2', true],
            [OnNamespaceDisconnect, '', true],
        ]);
        expect(ns.emit('chat', 'x')).toBe(false);
        events.length = 0;

        await vi.advanceTimersByTimeAsync(999);
        expect(redials()).toHaveLength(0);
        await vi.advanceTimersByTimeAsync(1);
        await drain();

        expect(redials()).toHaveLength(1);
        const second = FakeWebSocket.last();
        expect(second.url).toBe(endpoint + '?X-Websocket-Header-X-Websocket-Reconnect=1');
        expect(framesSent(second).map((f) => [f.event, f.namespace, f.room])).toEqual([
            [OnNamespaceConnect, 'default', ''],
            [OnRoomJoin, 'default', 'r1'],
            [OnRoomJoin, 'default', 'r2'],
            [OnNamespaceConnect, 'other', ''],
        ]);
        expect(conn.isClosed()).toBe(false);
        expect(conn.wasReconnected()).toBe(true);
        expect(conn.reconnectTries).toBe(1);
        expect(conn.closeInfo).toBeUndefined();
        // The application's references keep working.
        expect(conn.namespace('default')).toBe(ns);
        expect(ns.roomNames()).toEqual(['r1', 'r2']);
        expect(room.emit('chat', 'back')).toBe(true);
        expect(second.sent.at(-1)).toBe(';default;r1;chat;0;0;back');
        expect(events.map((e) => [e.event, e.room])).toEqual([
            [OnNamespaceConnect, ''],
            [OnNamespaceConnected, ''],
            [OnRoomJoin, 'r1'],
            [OnRoomJoined, 'r1'],
            [OnRoomJoin, 'r2'],
            [OnRoomJoined, 'r2'],
        ]);
    });

    test('with the ws package the reconnect count goes in a real header', async () => {
        class WsLikeSocket extends FakeWebSocket {
            terminate(): void {}
        }
        const server = new FakeServer();
        const { ws } = await dialFake(server, { default: {} }, { WebSocket: WsLikeSocket, reconnect: { initialDelay: 10, jitter: 0 }, headers: { A: 'b' } });
        expect(ws.options).toEqual({ headers: { A: 'b' } });
        serveAll(server);

        ws.serverClose(1006);
        await vi.advanceTimersByTimeAsync(10);

        expect(FakeWebSocket.last().url).toBe(endpoint);
        expect(FakeWebSocket.last().options).toEqual({ headers: { A: 'b', 'X-Websocket-Reconnect': '1' } });
    });

    test('after an error event the client still redials', async () => {
        const server = new FakeServer();
        const { conn, ws } = await dialFake(server, { default: {} }, { reconnect: { initialDelay: 10, jitter: 0 } });
        await conn.connect('default');
        serveAll(server);

        ws.serverError();
        ws.serverClose(1006);
        await vi.advanceTimersByTimeAsync(10);
        await drain();

        expect(redials()).toHaveLength(1);
        expect(conn.namespace('default')).toBeDefined();
    });

    test('a pending ask rejects with ErrClosed when the socket drops', async () => {
        const server = new FakeServer().on('slow', () => null);
        const { conn, ws } = await dialFake(server, { default: {} }, { reconnect: 1000 });
        const ns = await conn.connect('default');
        const pending = ns.ask('slow', '');

        ws.serverClose(1006);

        await expect(pending).rejects.toBe(ErrClosed);
    });

    test('close() during the backoff stops reconnecting', async () => {
        const server = new FakeServer();
        const { conn, ws } = await dialFake(server, { default: {} }, { reconnect: { initialDelay: 1000, jitter: 0 } });
        serveAll(server);

        ws.serverClose(1006);
        await vi.advanceTimersByTimeAsync(500);
        conn.close();
        await vi.advanceTimersByTimeAsync(60000);

        expect(redials()).toHaveLength(0);
        expect(conn.isClosed()).toBe(true);
    });

    test('aborting Options.signal during the backoff stops reconnecting and closes the Conn', async () => {
        const server = new FakeServer();
        const controller = new AbortController();
        const { conn, ws } = await dialFake(server, { default: {} }, { signal: controller.signal, reconnect: { initialDelay: 1000, jitter: 0 } });
        serveAll(server);

        ws.serverClose(1006);
        await vi.advanceTimersByTimeAsync(500);
        controller.abort();
        await vi.advanceTimersByTimeAsync(60000);

        expect(redials()).toHaveLength(0);
        expect(conn.isClosed()).toBe(true);
    });

    test('retry delays grow 1000, 2000, 4000 ms and stop at maxDelay', async () => {
        const server = new FakeServer();
        const start = Date.now();
        const { ws } = await dialFake(server, { default: {} }, { reconnect: { initialDelay: 1000, factor: 2, maxDelay: 5000, jitter: 0 } });
        const times: number[] = [];
        FakeWebSocket.onCreate(() => times.push(Date.now() - start));
        failAll();

        ws.serverClose(1006);
        await vi.advanceTimersByTimeAsync(1000 + 2000 + 4000 + 5000 + 5000);

        expect(times).toEqual([1000, 3000, 7000, 12000, 17000]);
        expect(redials().map((s) => new URL(s.url).searchParams.get('X-Websocket-Header-X-Websocket-Reconnect'))).toEqual(['1', '2', '3', '4', '5']);
    });

    test('jitter shortens each delay by up to its fraction', async () => {
        vi.spyOn(Math, 'random').mockReturnValue(1);
        const server = new FakeServer();
        const start = Date.now();
        const { ws } = await dialFake(server, { default: {} }, { reconnect: { initialDelay: 1000, jitter: 0.5 } });
        const times: number[] = [];
        FakeWebSocket.onCreate(() => times.push(Date.now() - start));
        failAll();

        ws.serverClose(1006);
        await vi.advanceTimersByTimeAsync(500 + 1000);
        vi.restoreAllMocks();

        expect(times).toEqual([500, 1500]);
    });

    test('a number for reconnect is the first delay', async () => {
        const server = new FakeServer();
        const { ws } = await dialFake(server, { default: {} }, { reconnect: 5000 });
        serveAll(server);
        vi.spyOn(Math, 'random').mockReturnValue(0);

        ws.serverClose(1006);
        await vi.advanceTimersByTimeAsync(4999);
        expect(redials()).toHaveLength(0);
        await vi.advanceTimersByTimeAsync(1);
        expect(redials()).toHaveLength(1);
        vi.restoreAllMocks();
    });

    test('reconnect: 0 turns reconnect off', async () => {
        const server = new FakeServer();
        const { conn, ws } = await dialFake(server, { default: {} }, { reconnect: 0 });

        ws.serverClose(1006);
        await vi.advanceTimersByTimeAsync(60000);

        expect(conn.isClosed()).toBe(true);
        expect(redials()).toHaveLength(0);
    });

    test('maxRetries gives up, reports ERR_RECONNECT and closes the Conn', async () => {
        const server = new FakeServer();
        const onError = vi.fn();
        const { conn, ws } = await dialFake(server, { default: {} }, { onError, reconnect: { initialDelay: 100, jitter: 0, maxRetries: 2 } });
        failAll();

        ws.serverClose(1006);
        await vi.advanceTimersByTimeAsync(10000);

        expect(redials()).toHaveLength(2);
        expect(conn.isClosed()).toBe(true);
        expect(onError).toHaveBeenCalledTimes(1);
        expect((onError.mock.calls[0]?.[0] as NeffosError).code).toBe('ERR_RECONNECT');
    });

    test('shouldReconnect can refuse a drop', async () => {
        const server = new FakeServer();
        const shouldReconnect = vi.fn(() => false);
        const { conn, ws } = await dialFake(server, { default: {} }, { reconnect: { initialDelay: 10, shouldReconnect } });

        ws.serverClose(4000, 'banned');
        await vi.advanceTimersByTimeAsync(1000);

        expect(shouldReconnect).toHaveBeenCalledWith({ code: 4000, reason: 'banned', wasClean: false });
        expect(conn.isClosed()).toBe(true);
        expect(redials()).toHaveLength(0);
    });

    test('probe sends a HEAD request first and redials only once it answers', async () => {
        const fetchMock = vi.fn()
            .mockRejectedValueOnce(new TypeError('network down'))
            .mockResolvedValue(new Response(null, { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);
        const server = new FakeServer();
        const { ws } = await dialFake(server, { default: {} }, { reconnect: { initialDelay: 100, jitter: 0, probe: true } });
        serveAll(server);

        ws.serverClose(1006);
        await vi.advanceTimersByTimeAsync(100);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith('http://neffos.test/echo', expect.objectContaining({ method: 'HEAD' }));
        expect(redials()).toHaveLength(0);

        await vi.advanceTimersByTimeAsync(200);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(redials()).toHaveLength(1);
        expect(new URL(FakeWebSocket.last().url).searchParams.get('X-Websocket-Header-X-Websocket-Reconnect')).toBe('2');
    });

    test('a namespace that cannot be restored is reported and the others still are', async () => {
        const server = new FakeServer();
        const onError = vi.fn();
        const { conn, ws } = await dialFake(server, { a: {}, b: {} }, { onError, reconnect: { initialDelay: 10, jitter: 0 } });
        await conn.connect('a');
        await conn.connect('b');
        server.on(OnNamespaceConnect, (frame) => (frame.namespace === 'a' ? new Error('a is gone') : undefined));
        serveAll(server);

        ws.serverClose(1006);
        await vi.advanceTimersByTimeAsync(10);
        await drain();

        expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'a is gone' }));
        expect(conn.namespace('a')).toBeUndefined();
        expect(conn.namespace('b')).toBeDefined();
    });

    test('a drop during the restore carries the unrestored namespaces and rooms into the next redial', async () => {
        const server = new FakeServer();
        const onError = vi.fn();
        const { conn, ws } = await dialFake(server, { default: {}, other: {} }, { onError, reconnect: { initialDelay: 1000, jitter: 0 } });
        const def = await conn.connect('default');
        await def.joinRoom('r1');
        const other = await conn.connect('other');
        await other.joinRoom('r2');

        // On the second socket, hold the connect ask for "other" and drop the socket while it is in flight.
        let dropDuringOtherConnect = true;
        server.on(OnNamespaceConnect, (frame) => {
            if (frame.namespace === 'other' && dropDuringOtherConnect) {
                dropDuringOtherConnect = false;
                const second = FakeWebSocket.last();
                queueMicrotask(() => second.serverClose(1006));
                return null;
            }
            return undefined;
        });
        serveAll(server);

        ws.serverClose(1006);
        await vi.advanceTimersByTimeAsync(1000);
        await drain();

        expect(redials()).toHaveLength(1);
        expect(framesSent(FakeWebSocket.last()).map((f) => [f.event, f.namespace, f.room])).toEqual([
            [OnNamespaceConnect, 'default', ''],
            [OnRoomJoin, 'default', 'r1'],
            [OnNamespaceConnect, 'other', ''],
        ]);
        expect(conn.namespace('default')).toBeUndefined();
        expect(conn.namespace('other')).toBeUndefined();

        await vi.advanceTimersByTimeAsync(1000);
        await drain();

        expect(redials()).toHaveLength(2);
        expect(framesSent(FakeWebSocket.last()).map((f) => [f.event, f.namespace, f.room])).toEqual([
            [OnNamespaceConnect, 'default', ''],
            [OnRoomJoin, 'default', 'r1'],
            [OnNamespaceConnect, 'other', ''],
            [OnRoomJoin, 'other', 'r2'],
        ]);
        expect(conn.namespace('default')).toBe(def);
        expect(conn.namespace('other')).toBe(other);
        expect(def.roomNames()).toEqual(['r1']);
        expect(other.roomNames()).toEqual(['r2']);
        expect(onError).not.toHaveBeenCalled();
        expect(conn._pendingRestore).toEqual([]);
    });

    test('a drop in the middle of a namespace\'s rooms brings back every room', async () => {
        const server = new FakeServer();
        const { conn, ws } = await dialFake(server, { default: {} }, { reconnect: { initialDelay: 100, jitter: 0 } });
        const ns = await conn.connect('default');
        await ns.joinRoom('r1');
        await ns.joinRoom('r2');
        await ns.joinRoom('r3');

        let dropOnR2 = true;
        server.on(OnRoomJoin, (frame) => {
            if (frame.room === 'r2' && dropOnR2) {
                dropOnR2 = false;
                const second = FakeWebSocket.last();
                queueMicrotask(() => second.serverClose(1006));
                return null;
            }
            return undefined;
        });
        serveAll(server);

        ws.serverClose(1006);
        await vi.advanceTimersByTimeAsync(100);
        await drain();
        await vi.advanceTimersByTimeAsync(100);
        await drain();

        expect(redials()).toHaveLength(2);
        expect(framesSent(FakeWebSocket.last()).map((f) => f.room)).toEqual(['', 'r1', 'r2', 'r3']);
        expect(ns.roomNames()).toEqual(['r1', 'r2', 'r3']);
    });

    test('a throwing shouldReconnect is reported and closes the Conn', async () => {
        const server = new FakeServer();
        const onError = vi.fn();
        const boom = new Error('shouldReconnect failed');
        const { conn, ws } = await dialFake(server, { default: {} }, {
            onError,
            reconnect: {
                initialDelay: 10,
                shouldReconnect: () => {
                    throw boom;
                },
            },
        });

        ws.serverClose(1006);
        await vi.advanceTimersByTimeAsync(1000);

        expect(onError).toHaveBeenCalledWith(boom);
        expect(conn.isClosed()).toBe(true);
        expect(redials()).toHaveLength(0);
    });

    test('close() while a reconnect socket is still connecting leaves an error listener on it', async () => {
        const server = new FakeServer();
        const { conn, ws } = await dialFake(server, { default: {} }, { reconnect: { initialDelay: 10, jitter: 0 } });
        // The redial socket never opens.

        ws.serverClose(1006);
        await vi.advanceTimersByTimeAsync(10);
        expect(redials()).toHaveLength(1);
        conn.close();
        await drain();

        expect(FakeWebSocket.last().closedByClient).not.toBeNull();
        expect(FakeWebSocket.unhandledErrors).toBe(0);
    });

    test('rooms come back on the same NSConn when the server connects the namespace first', async () => {
        const server = new FakeServer();
        const { conn, ws } = await dialFake(server, { default: {} }, { reconnect: { initialDelay: 10, jitter: 0 } });
        const ns = await conn.connect('default');
        const room = await ns.joinRoom('r1');
        // From now on the server connects "default" itself, right after the handshake.
        FakeWebSocket.onCreate((sock) => {
            server.attach(sock);
            const serverSide = sock.onClientSend;
            sock.onClientSend = (data) => {
                serverSide?.(data);
                if (data === 'M') {
                    queueMicrotask(() => queueMicrotask(() => sock.serverSend('#1;default;;_OnNamespaceConnect;0;0;')));
                }
            };
            queueMicrotask(() => sock.open());
        });

        ws.serverClose(1006);
        await vi.advanceTimersByTimeAsync(10);
        await drain();

        const second = FakeWebSocket.last();
        expect(second.sent).toContain('#1;;;;;;');
        expect(conn.namespace('default')).toBe(ns);
        expect(ns.roomNames()).toEqual(['r1']);
        expect(room.emit('chat', 'back')).toBe(true);
        expect(second.sent.at(-1)).toBe(';default;r1;chat;0;0;back');
    });

    test('a connection closed by the client is not redialled', async () => {
        const server = new FakeServer();
        const { conn } = await dialFake(server, { default: {} }, { reconnect: 10 });

        conn.close();
        await vi.advanceTimersByTimeAsync(1000);

        expect(FakeWebSocket.instances).toHaveLength(1);
    });
});
