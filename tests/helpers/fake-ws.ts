// FakeWebSocket is an in-memory stand-in for the browser/`ws` WebSocket.
// The client under test talks to it exactly as it would to a real socket;
// the test plays the server through open/serverSend/serverClose/serverError.

export type Frame = string | ArrayBuffer | Uint8Array;

type Listener = ((ev: unknown) => unknown) | null;

export class FakeWebSocket {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;

    readonly CONNECTING = 0;
    readonly OPEN = 1;
    readonly CLOSING = 2;
    readonly CLOSED = 3;

    /** Every socket constructed since the last `reset()`, oldest first. */
    static instances: FakeWebSocket[] = [];
    private static createListeners = new Set<(ws: FakeWebSocket) => void>();

    /** Calls `fn` for every socket constructed from now on. Returns an unsubscribe function. */
    static onCreate(fn: (ws: FakeWebSocket) => void): () => void {
        FakeWebSocket.createListeners.add(fn);
        return () => FakeWebSocket.createListeners.delete(fn);
    }

    static last(): FakeWebSocket {
        const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
        if (!ws) {
            throw new Error('no FakeWebSocket has been created');
        }
        return ws;
    }

    /**
     * "error" events fired with no `onerror` listener. The `ws` package emits "error" when a
     * socket is closed while still connecting, and Node exits on an "error" event nobody
     * listens to, so this must stay 0.
     */
    static unhandledErrors = 0;

    static reset(): void {
        FakeWebSocket.instances = [];
        FakeWebSocket.createListeners.clear();
        FakeWebSocket.unhandledErrors = 0;
    }

    readonly url: string;
    /** The second constructor argument: protocols in browsers, protocols or options for `ws`. */
    readonly protocols: unknown;
    /** The third constructor argument, which only the `ws` package reads (`{ headers }`). */
    readonly options: unknown;
    readyState: number = FakeWebSocket.CONNECTING;
    binaryType = 'blob';

    onopen: Listener = null;
    onmessage: Listener = null;
    onerror: Listener = null;
    onclose: Listener = null;

    /** Frames the client sent, in order. */
    readonly sent: Frame[] = [];
    /** Set by a fake server to see client frames as they are sent. */
    onClientSend: ((data: Frame) => void) | null = null;
    /** The code and reason of a client-initiated close, if any. */
    closedByClient: { code?: number; reason?: string } | null = null;

    constructor(url: string | URL, protocols?: unknown, options?: unknown) {
        this.url = String(url);
        this.protocols = protocols;
        this.options = options;
        FakeWebSocket.instances.push(this);
        for (const fn of FakeWebSocket.createListeners) {
            fn(this);
        }
    }

    send(data: Frame): void {
        if (this.readyState === FakeWebSocket.CONNECTING) {
            throw new Error('InvalidStateError: send while CONNECTING');
        }
        if (this.readyState !== FakeWebSocket.OPEN) {
            return; // browsers silently drop frames sent after close.
        }
        this.sent.push(data);
        this.onClientSend?.(data);
    }

    close(code?: number, reason?: string): void {
        if (this.readyState === FakeWebSocket.CLOSING || this.readyState === FakeWebSocket.CLOSED) {
            return;
        }
        const wasConnecting = this.readyState === FakeWebSocket.CONNECTING;
        this.closedByClient = { code, reason };
        this.readyState = FakeWebSocket.CLOSING;
        // Real sockets report the close asynchronously, after the closing handshake.
        queueMicrotask(() => {
            if (wasConnecting) {
                // Like the ws package: "WebSocket was closed before the connection was established".
                if (this.onerror === null) {
                    FakeWebSocket.unhandledErrors++;
                } else {
                    this.onerror({ type: 'error' });
                }
            }
            this.readyState = FakeWebSocket.CLOSED;
            this.onclose?.({ type: 'close', code: code ?? 1005, reason: reason ?? '', wasClean: true });
        });
    }

    /** Completes the handshake. */
    open(): void {
        this.readyState = FakeWebSocket.OPEN;
        this.onopen?.({ type: 'open' });
    }

    /** Delivers a frame from the server. Binary frames arrive as an ArrayBuffer, as with `binaryType = "arraybuffer"`. */
    serverSend(data: Frame): void {
        let payload: string | ArrayBuffer;
        if (typeof data === 'string') {
            payload = data;
        } else if (data instanceof Uint8Array) {
            payload = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
        } else {
            payload = data;
        }
        this.onmessage?.({ type: 'message', data: payload });
    }

    /** The server drops the connection. 1006 (abnormal closure) is what a network failure looks like. */
    serverClose(code = 1006, reason = ''): void {
        if (this.readyState === FakeWebSocket.CLOSED) {
            return;
        }
        this.readyState = FakeWebSocket.CLOSED;
        this.onclose?.({ type: 'close', code, reason, wasClean: code === 1000 });
    }

    /** Fires an error event, as a browser does right before closing a failed connection. */
    serverError(): void {
        this.onerror?.({ type: 'error' });
    }
}
