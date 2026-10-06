import { Conn, type CloseInfo, type DroppedNamespace } from './conn';
import type { NSConn } from './nsconn';
import { NeffosError, resolveError } from './errors';
import { resolveNamespaces, type ConnHandler } from './handlers';
import { ackBinary, ackIDBinary, ackNotOKBinary, websocketReconnectHeaderKey } from './protocol';
import { appendHeadersAsURLParams, normalizeEndpoint, toHTTPEndpoint, type Headers } from './url';
import { resolveWebSocket, type ResolvedWebSocket, type WebSocketConstructor, type WebSocketLike } from './ws';

/** ReconnectOptions controls how the client reconnects after the socket drops. */
export interface ReconnectOptions {
    /** Delay before the first retry, in milliseconds. Default 1000. */
    initialDelay?: number;
    /** Upper bound for the delay, in milliseconds. Default 30000, or `initialDelay` if that is larger. */
    maxDelay?: number;
    /** Each retry waits `factor` times longer than the one before. Default 2. */
    factor?: number;
    /** Fraction, from 0 to 1, by which a delay is randomly shortened so that clients
     *  do not all retry at the same moment. Default 0.2. */
    jitter?: number;
    /** Retries before giving up. Default: no limit. */
    maxRetries?: number;
    /** Send an HTTP HEAD request to the endpoint before each retry and only redial once it
     *  answers, as 0.2.0 did. Default false. */
    probe?: boolean;
    /** Decides whether a drop is worth reconnecting after. Default: always. */
    shouldReconnect?: (info: CloseInfo) => boolean;
}

/* Options contains optional fields. Can be passed on the `dial` function. */
export interface Options {
    /** Extra handshake headers. Sent as real headers with the `ws` package, and as
     *  `X-Websocket-Header-<name>` URL parameters everywhere else. */
    headers?: Headers;
    protocols?: string | string[];
    /** Turns automatic reconnection on. A number is the first retry delay in
     *  milliseconds (`5000` means `{ initialDelay: 5000 }`) and 0 turns it off; an
     *  object sets every detail. With reconnect on, a failed first dial is retried
     *  too, until `timeout`, `signal` or `maxRetries` stops it. Previously connected
     *  namespaces and joined rooms are restored after each reconnect. */
    reconnect?: number | ReconnectOptions;
    /** Milliseconds the first dial (including its retries) may take before it rejects
     *  with a `NeffosError` whose code is `ERR_TIMEOUT`. */
    timeout?: number;
    /** Aborting it cancels the dial and any later reconnect. It does not close a
     *  connection that is up; call `Conn.close()` for that. */
    signal?: AbortSignal;
    /** Default timeout for `ask`, in milliseconds. 0 (the default) waits forever. */
    askTimeout?: number;
    /** The WebSocket constructor to use. Defaults to `globalThis.WebSocket`, then the `ws` package. */
    WebSocket?: WebSocketConstructor;
    /** Receives errors that have no caller to reject: invalid frames, events for unknown
     *  namespaces, and failures while restoring namespaces and rooms after a reconnect.
     *  Without it, reconnect failures are logged with `console.warn` and the rest are dropped. */
    onError?: (err: Error) => void;
}

interface Backoff {
    initialDelay: number;
    maxDelay: number;
    factor: number;
    jitter: number;
    maxRetries: number;
    probe: boolean;
    shouldReconnect: (info: CloseInfo) => boolean;
}

/** resolveReconnect fills in the defaults. Undefined means reconnect is off. */
export function resolveReconnect(reconnect: number | ReconnectOptions | undefined): Backoff | undefined {
    if (reconnect === undefined) {
        return undefined;
    }
    const opts: ReconnectOptions = typeof reconnect === 'number' ? { initialDelay: reconnect } : reconnect;
    if (typeof reconnect === 'number' && !(reconnect > 0)) {
        return undefined;
    }

    const initialDelay = opts.initialDelay ?? 1000;
    return {
        initialDelay,
        maxDelay: opts.maxDelay ?? Math.max(30000, initialDelay),
        factor: opts.factor ?? 2,
        jitter: Math.min(Math.max(opts.jitter ?? 0.2, 0), 1),
        maxRetries: opts.maxRetries ?? Infinity,
        probe: opts.probe ?? false,
        shouldReconnect: opts.shouldReconnect ?? (() => true),
    };
}

/** backoffDelay is the wait before retry number `attempt` (1 for the first retry). */
export function backoffDelay(b: Backoff, attempt: number): number {
    const base = Math.min(b.initialDelay * b.factor ** (attempt - 1), b.maxDelay);
    return Math.round(base * (1 - b.jitter * Math.random()));
}

/**
 * dial opens a connection to a neffos server and resolves with a `Conn`.
 *
 * The endpoint may be a `ws://`/`wss://` (or `http://`/`https://`) URL, a host and
 * path with no scheme (`ws://` is added), or, in browsers, a path starting with "/"
 * that is resolved against the current page.
 *
 * `connHandler` is a plain object of either:
 *   - `{ namespace: { eventName: handler, ... }, ... }`
 *   - `{ eventName: handler, ... }` (treated as the empty namespace)
 *
 * See `Options` for headers, reconnect, timeouts and the WebSocket constructor.
 *
 * @example
 *   const conn = await neffos.dial("ws://localhost:8080/echo", {
 *     default: {
 *       _OnNamespaceConnected(ns, msg) { console.log("connected"); },
 *       chat(ns, msg) { console.log("server:", msg.Body); }
 *     }
 *   });
 *   const ns = await conn.connect("default");
 *   ns.emit("chat", "Hello!");
 */
export async function dial(endpoint: string, connHandler: ConnHandler, options: Options = {}): Promise<Conn> {
    const namespaces = resolveNamespaces(connHandler);
    const url = normalizeEndpoint(endpoint);
    const backoff = resolveReconnect(options.reconnect);

    const dialing = linkSignals([options.signal], options.timeout);
    try {
        const rt: Runtime = {
            url,
            resolved: await resolveWebSocket(options.WebSocket),
            headers: options.headers ?? {},
            protocols: options.protocols,
        };

        const ready = (ws: WebSocketLike, id: string, pending: unknown[]): Conn => {
            const conn = new Conn(ws, namespaces, { askTimeout: options.askTimeout, onError: options.onError });
            if (backoff !== undefined) {
                conn._onDrop = (dropped, info) => {
                    reconnect(conn, rt, backoff, dropped, info, options).catch((err: unknown) => {
                        // For example a throwing shouldReconnect: report it and close for good.
                        reportError(options, err);
                        conn.close();
                    });
                };
            }
            conn._attach(ws, id, pending);
            return conn;
        };

        let attempt = 0;
        for (;;) {
            const result = await openSocket(rt, undefined, dialing.signal, ready);
            if (result.ok) {
                return result.value;
            }

            if (!result.retry || backoff === undefined || attempt >= backoff.maxRetries) {
                throw result.error;
            }
            attempt++;
            await sleep(backoffDelay(backoff, attempt), dialing.signal);
        }
    } finally {
        dialing.dispose();
    }
}

interface Runtime {
    url: string;
    resolved: ResolvedWebSocket;
    headers: Headers;
    protocols: string | string[] | undefined;
}

type OpenResult<T> =
    | { ok: true; value: T }
    | { ok: false; retry: boolean; error: unknown };

function createSocket(rt: Runtime, extraHeaders: Headers | undefined): WebSocketLike {
    const headers: Headers = { ...rt.headers, ...extraHeaders };
    if (rt.resolved.supportsHeaders) {
        const stringHeaders: Record<string, string> = {};
        for (const [key, value] of Object.entries(headers)) {
            stringHeaders[key] = String(value);
        }
        return new rt.resolved.WebSocket(rt.url, rt.protocols, { headers: stringHeaders });
    }

    const url = appendHeadersAsURLParams(headers, rt.url);
    return rt.protocols === undefined ? new rt.resolved.WebSocket(url) : new rt.resolved.WebSocket(url, rt.protocols);
}

/**
 * openSocket opens one socket and runs the neffos handshake on it: send the ack byte
 * on open, then wait for the server's ID (or its refusal). Frames that arrive before
 * the ID are kept in `pending`. On success `onReady` gets the socket synchronously, so
 * no frame or close event can be missed, and its return value is the result. Never rejects;
 * failures come back as `ok: false`, with `retry: false` when retrying cannot help
 * (the server refused, or `signal` aborted).
 */
function openSocket<T>(
    rt: Runtime,
    extraHeaders: Headers | undefined,
    signal: AbortSignal,
    onReady: (ws: WebSocketLike, id: string, pending: unknown[]) => T,
): Promise<OpenResult<T>> {
    return new Promise((resolve) => {
        if (signal.aborted) {
            resolve({ ok: false, retry: false, error: signal.reason });
            return;
        }

        let ws: WebSocketLike;
        try {
            ws = createSocket(rt, extraHeaders);
        } catch (err) {
            // A bad URL or protocol list; the same dial would fail again.
            resolve({ ok: false, retry: false, error: err });
            return;
        }

        const pending: unknown[] = [];
        let socketError: unknown = undefined;
        let done = false;

        const finish = (result: OpenResult<T>): void => {
            if (done) return;
            done = true;
            signal.removeEventListener('abort', onAbort);
            if (!result.ok) {
                ws.onopen = null;
                ws.onmessage = null;
                // Not null: closing a socket that is still connecting makes the ws package
                // emit "error", and an "error" event with no listener crashes Node.
                ws.onerror = () => {};
                ws.onclose = null;
                if (ws.readyState <= 1) {
                    ws.close();
                }
            }
            resolve(result);
        };
        const onAbort = (): void => finish({ ok: false, retry: false, error: signal.reason });
        signal.addEventListener('abort', onAbort, { once: true });

        ws.binaryType = "arraybuffer";
        ws.onopen = () => {
            ws.send(ackBinary);
        };
        ws.onmessage = (ev) => {
            const data = ev.data;
            if (typeof data === 'string' && data[0] === ackIDBinary) {
                if (done) return;
                // onReady installs the connection's own handlers.
                finish({ ok: true, value: onReady(ws, data.slice(1), pending) });
            } else if (typeof data === 'string' && data[0] === ackNotOKBinary) {
                finish({ ok: false, retry: false, error: resolveError(data.slice(1)) });
            } else {
                pending.push(data);
            }
        };
        ws.onerror = (ev) => {
            socketError = ev;
        };
        ws.onclose = (ev) => {
            const error = new NeffosError(`connection closed before the handshake finished (code ${ev.code})`, 'ERR_DIAL', { cause: socketError });
            finish({ ok: false, retry: true, error });
        };
    });
}

/** reportError hands a reconnect error to `Options.onError`, or logs it as 0.2.0 did. */
function reportError(options: Options, err: unknown): void {
    const error = err instanceof Error ? err : new Error(String(err));
    if (options.onError === undefined) {
        console.warn("neffos:", error);
        return;
    }
    try {
        options.onError(error);
    } catch {
        // A throwing onError must not stop the reconnect or restore.
    }
}

/** reconnect runs after an unexpected drop until a new socket is up or it has to give up. */
async function reconnect(
    conn: Conn,
    rt: Runtime,
    backoff: Backoff,
    dropped: DroppedNamespace[],
    info: CloseInfo,
    options: Options,
): Promise<void> {
    const report = (err: unknown): void => reportError(options, err);

    if (!backoff.shouldReconnect(info)) {
        conn.close();
        return;
    }

    const stop = linkSignals([conn._closedSignal, options.signal], undefined);
    try {
        for (let attempt = 1; ; attempt++) {
            if (attempt > backoff.maxRetries) {
                report(new NeffosError(`gave up reconnecting after ${backoff.maxRetries} retries`, 'ERR_RECONNECT'));
                conn.close();
                return;
            }

            try {
                await sleep(backoffDelay(backoff, attempt), stop.signal);
            } catch {
                conn.close();
                return;
            }

            if (backoff.probe && !(await probe(rt.url, stop.signal))) {
                continue;
            }

            const result = await openSocket(rt, { [websocketReconnectHeaderKey]: String(attempt) }, stop.signal, (ws, id, pending) => {
                conn.reconnectTries = attempt;
                conn._pendingRestore = dropped;
                conn._attach(ws, id, pending);
            });
            if (!result.ok) {
                if (stop.signal.aborted) {
                    conn.close();
                    return;
                }
                if (!result.retry) {
                    report(result.error);
                    conn.close();
                    return;
                }
                continue;
            }
            break;
        }
    } finally {
        stop.dispose();
    }

    await restore(conn, report);
}

/**
 * restore connects the namespaces in `conn._pendingRestore` again, then rejoins their
 * rooms, one at a time and in their original order. An entry leaves the list only when
 * it is done. If the socket drops meanwhile (the epoch changes), restore stops without
 * touching the list: the drop has already carried the unfinished entries into the next
 * reconnect, which restores them after its own redial.
 */
async function restore(conn: Conn, report: (err: unknown) => void): Promise<void> {
    const epoch = conn._epoch;
    const stale = (): boolean => conn.isClosed() || conn._epoch !== epoch;

    for (;;) {
        const [entry] = conn._pendingRestore;
        if (entry === undefined || stale()) {
            return;
        }

        let live: NSConn | undefined;
        try {
            // Normally entry.ns itself. If the server connected the namespace first, it is
            // still entry.ns (replyConnect reuses it), but join on what connect returns anyway.
            live = await conn._reconnectNamespace(entry.ns);
        } catch (err) {
            if (stale()) return;
            report(err);
        }

        if (live !== undefined) {
            for (const room of entry.rooms) {
                if (stale()) return;
                try {
                    await live.joinRoom(room);
                } catch (err) {
                    if (stale()) return;
                    report(err);
                }
            }
        }

        if (stale()) return;
        conn._pendingRestore.shift();
    }
}

/** probe sends a HEAD request to the endpoint and reports whether anything answered. */
async function probe(url: string, signal: AbortSignal): Promise<boolean> {
    const fetchFn = globalThis.fetch;
    if (typeof fetchFn !== 'function') {
        return true;
    }
    try {
        await fetchFn(toHTTPEndpoint(url), { method: 'HEAD', mode: 'no-cors', signal });
        return true;
    } catch {
        return false;
    }
}

/** sleep waits `ms` milliseconds, or rejects with the signal's reason if it aborts first. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal.aborted) {
            reject(signal.reason);
            return;
        }
        const onAbort = (): void => {
            clearTimeout(timer);
            reject(signal.reason);
        };
        const timer = setTimeout(() => {
            signal.removeEventListener('abort', onAbort);
            resolve();
        }, ms);
        signal.addEventListener('abort', onAbort, { once: true });
    });
}

/**
 * linkSignals returns a signal that aborts when any of `signals` aborts, or after
 * `timeout` milliseconds with a `NeffosError` (code `ERR_TIMEOUT`). `dispose` removes
 * the listeners and the timer. (`AbortSignal.any` would do most of this, but older
 * browsers lack it.)
 */
function linkSignals(signals: Array<AbortSignal | undefined>, timeout: number | undefined): { signal: AbortSignal; dispose(): void } {
    const controller = new AbortController();
    const cleanups: Array<() => void> = [];

    for (const s of signals) {
        if (s === undefined) continue;
        if (s.aborted) {
            controller.abort(s.reason);
            break;
        }
        const onAbort = (): void => controller.abort(s.reason);
        s.addEventListener('abort', onAbort, { once: true });
        cleanups.push(() => s.removeEventListener('abort', onAbort));
    }

    if (timeout !== undefined && timeout > 0 && !controller.signal.aborted) {
        const timer = setTimeout(() => controller.abort(new NeffosError(`dial timed out after ${timeout} ms`, 'ERR_TIMEOUT')), timeout);
        cleanups.push(() => clearTimeout(timer));
    }

    return {
        signal: controller.signal,
        dispose: () => {
            for (const fn of cleanups) fn();
        },
    };
}
