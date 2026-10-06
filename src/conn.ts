import { ErrBadNamespace, ErrClosed, ErrInvalidPayload, ErrWrite, NeffosError } from './errors';
import { fireEvent, getEvents, type Namespaces } from './handlers';
import { Message, copyMessage } from './message';
import { NSConn } from './nsconn';
import {
    OnNamespaceConnect,
    OnNamespaceConnected,
    OnNamespaceDisconnect,
    OnNativeMessage,
    OnRoomJoin,
    OnRoomLeave,
    genEmptyReplyToWait,
    waitComesFromClientPrefix,
} from './protocol';
import { createWaitGenerator, deserializeMessage, serializeMessage } from './serialize';
import type { WebSocketLike } from './ws';

/** Options for a single `ask`. */
export interface AskOptions {
    /** Milliseconds to wait for the reply before rejecting with a `NeffosError` (code `ERR_TIMEOUT`).
     *  Defaults to `Options.askTimeout`; 0 waits forever. */
    timeout?: number;
    /** Aborting it rejects the ask with the signal's reason. */
    signal?: AbortSignal;
}

/** How the socket closed: the close event's fields, plus the error event before it, if any. */
export interface CloseInfo {
    code: number;
    reason: string;
    wasClean: boolean;
    error?: unknown;
}

/** @internal Settings `dial` passes to the `Conn` it creates. */
export interface ConnOptions {
    /** Default `AskOptions.timeout`, in milliseconds. 0 (the default) waits forever. */
    askTimeout?: number;
    /** Receives errors that have no caller to reject, such as an invalid frame. */
    onError?: (err: Error) => void;
}

/** @internal A namespace that was connected when the socket dropped, and the rooms it had joined. */
export interface DroppedNamespace {
    ns: NSConn;
    rooms: string[];
}

interface Waiter {
    settle(reply: Message): void;
    fail(err: unknown): void;
}

// WebSocket.OPEN, the same in every implementation.
const OPEN = 1;

/* The Conn class contains the websocket connection and the neffos communication functionality.
   Its `connect` will return a new `NSConn` instance, each connection can connect to one or more namespaces.
   Each `NSConn` can join to multiple rooms. */
export class Conn {
    private ws: WebSocketLike;
    /* If > 0 then this connection is the result of a reconnection,
       see `wasReconnected()` too. */
    reconnectTries = 0;

    /* ID is the generated connection ID from the server-side, all connected namespaces(`NSConn` instances)
      that belong to that connection have the same ID. It is available immediately after the `dial`. */
    ID = "";
    /* closeInfo describes how the last socket closed. Undefined while the socket is open. */
    closeInfo: CloseInfo | undefined = undefined;
    connectedNamespaces = new Map<string, NSConn>();

    /** @internal Set by `dial` when reconnect is on: called after the socket drops unexpectedly. */
    _onDrop: ((dropped: DroppedNamespace[], info: CloseInfo) => void) | undefined = undefined;
    /**
     * @internal
     * Namespaces (with their rooms) a reconnect still has to restore. If the socket drops
     * again before they are all back, they are carried into the next reconnect.
     */
    _pendingRestore: DroppedNamespace[] = [];
    /** @internal Goes up on every attach and every drop, so a restore can tell its socket is gone. */
    _epoch = 0;

    private _isAcknowledged = false;
    private readonly allowNativeMessages: boolean;
    private closed = false;
    private readonly lifetime = new AbortController();
    private lastSocketError: unknown = undefined;
    private readonly waitServerConnectNotifiers = new Map<string, (ns: NSConn) => void>();
    private readonly waitingMessages = new Map<string, Waiter>();
    private readonly namespaces: Namespaces;
    // In-flight namespace connects, so two concurrent `connect(ns)` calls share one ask.
    private readonly connectInFlight = new Map<string, Promise<NSConn>>();
    // Incoming events are handled one after another, in frame order, even when handlers are async.
    private dispatchChain: Promise<void> = Promise.resolve();
    private readonly genWait = createWaitGenerator();
    private readonly askTimeout: number;
    private readonly onError: ((err: Error) => void) | undefined;

    /** @internal Use `dial` to get a `Conn`. */
    constructor(ws: WebSocketLike, namespaces: Namespaces, options: ConnOptions = {}) {
        this.ws = ws;
        this.namespaces = namespaces;
        this.allowNativeMessages = namespaces.get("")?.has(OnNativeMessage) ?? false;
        this.askTimeout = options.askTimeout ?? 0;
        this.onError = options.onError;
    }

    /** wasReconnected reports whether this connection is the result of a reconnect.
     *  See `reconnectTries` for the count. */
    wasReconnected(): boolean {
        return this.reconnectTries > 0;
    }

    isAcknowledged(): boolean {
        return this._isAcknowledged;
    }

    /** @internal Aborted when the connection is closed for good. Used by `dial` to stop reconnecting. */
    get _closedSignal(): AbortSignal {
        return this.lifetime.signal;
    }

    /**
     * @internal
     * _attach makes `ws`, a socket that finished the neffos handshake, this connection's
     * socket. `pending` holds frames that arrived before the handshake ended. `dial` calls
     * it for the first socket and again for each reconnect.
     */
    _attach(ws: WebSocketLike, id: string, pending: readonly unknown[] = []): void {
        this.ws = ws;
        this.ID = id;
        this._epoch++;
        this._isAcknowledged = true;
        this.closeInfo = undefined;
        this.lastSocketError = undefined;

        ws.onopen = null;
        ws.onmessage = (ev) => {
            if (this.ws === ws) {
                this._onData(ev.data);
            }
        };
        // Only recorded: the close event that always follows decides what happens next.
        ws.onerror = (ev) => {
            if (this.ws === ws) {
                this.lastSocketError = ev;
            }
        };
        ws.onclose = (ev) => {
            if (this.ws === ws) {
                this.onSocketClose(ev);
            }
        };

        for (const data of pending) {
            this._onData(data);
        }
    }

    /**
     * @internal
     * _onData handles one incoming frame. A reply to a pending ask settles it right away;
     * everything else is queued behind the events before it, so handlers see frames in order.
     */
    _onData(data: unknown): void {
        if (this.closed) {
            return;
        }

        const msg = deserializeMessage(data, this.allowNativeMessages);
        if (msg.isInvalid) {
            this.reportError(ErrInvalidPayload);
            return;
        }

        if (!msg.IsNative && msg.isWait()) {
            const waiter = this.waitingMessages.get(msg.wait);
            if (waiter !== undefined) {
                waiter.settle(msg);
                return;
            }
            if (msg.wait[0] === waitComesFromClientPrefix) {
                // A reply to an ask that already timed out, was aborted or was rejected on close.
                return;
            }
        }

        const epoch = this._epoch;
        this.dispatchChain = this.dispatchChain
            // A frame from a socket that has since dropped (or a closed Conn) is stale.
            .then(() => (this.closed || this._epoch !== epoch ? undefined : this.handleMessage(msg)))
            .then(
                (err) => {
                    if (err !== undefined) {
                        this.reportError(err);
                    }
                },
                (err: unknown) => this.reportError(err instanceof Error ? err : new Error(String(err))),
            );
    }

    private reportError(err: Error): void {
        try {
            this.onError?.(err);
        } catch {
            // A throwing onError must not break the dispatch chain, which would stop
            // every later event on this connection. There is nobody left to tell.
        }
    }

    private onSocketClose(ev: { code: number; reason: string; wasClean: boolean }): void {
        const info: CloseInfo = { code: ev.code, reason: ev.reason, wasClean: ev.wasClean };
        if (this.lastSocketError !== undefined) {
            info.error = this.lastSocketError;
        }
        this.closeInfo = info;

        if (this.closed) {
            return;
        }

        this._epoch++;
        const dropped = this.disconnectAll();
        // Namespaces a restore had not finished yet: merge them in so none is lost.
        for (const entry of this._pendingRestore) {
            const same = dropped.find((d) => d.ns === entry.ns);
            if (same === undefined) {
                dropped.push({ ns: entry.ns, rooms: [...entry.rooms] });
                continue;
            }
            for (const room of entry.rooms) {
                if (!same.rooms.includes(room)) {
                    same.rooms.push(room);
                }
            }
        }
        this._pendingRestore = [];

        if (this._onDrop !== undefined) {
            this._onDrop(dropped, info);
            return;
        }

        this.closed = true;
        this.lifetime.abort(ErrClosed);
    }

    /**
     * disconnectAll forgets every namespace and room, firing forced leave and disconnect
     * events, and rejects every pending ask with `ErrClosed`.
     */
    private disconnectAll(): DroppedNamespace[] {
        const dropped: DroppedNamespace[] = [];
        for (const ns of [...this.connectedNamespaces.values()]) {
            dropped.push({ ns, rooms: ns.roomNames() });
            ns.forceLeaveAll(true);

            const disconnectMsg = new Message();
            disconnectMsg.Namespace = ns.namespace;
            disconnectMsg.Event = OnNamespaceDisconnect;
            disconnectMsg.IsForced = true;
            disconnectMsg.IsLocal = true;
            void fireEvent(ns, disconnectMsg);
            this.connectedNamespaces.delete(ns.namespace);
        }

        for (const waiter of [...this.waitingMessages.values()]) {
            waiter.fail(ErrClosed);
        }
        this.waitingMessages.clear();
        return dropped;
    }

    private async handleMessage(msg: Message): Promise<Error | undefined> {
        if (msg.IsNative) {
            const ns = this.namespace("");
            if (ns === undefined) {
                return ErrBadNamespace;
            }
            await fireEvent(ns, msg);
            return undefined;
        }

        const ns = this.namespace(msg.Namespace);

        switch (msg.Event) {
            case OnNamespaceConnect:
                await this.replyConnect(msg);
                break;
            case OnNamespaceDisconnect:
                await this.replyDisconnect(msg);
                break;
            case OnRoomJoin:
                // Explicit break in the false branch prevents accidental
                // fall-through to OnRoomLeave when the namespace is missing.
                if (ns !== undefined) {
                    await ns.replyRoomJoin(msg);
                }
                break;
            case OnRoomLeave:
                if (ns !== undefined) {
                    await ns.replyRoomLeave(msg);
                }
                break;
            default: {
                if (ns === undefined) {
                    return ErrBadNamespace;
                }
                msg.IsLocal = false;
                const err = await fireEvent(ns, msg);
                if (err !== undefined) {
                    // Write the handler's error (or its reply) back to the server.
                    this.write(copyMessage(msg, { Err: err }));
                }
            }
        }

        return undefined;
    }

    /**
     * connect asks the server to connect this Conn to the given namespace and
     * resolves with the resulting `NSConn`. Concurrent calls with the same
     * namespace share a single in-flight promise.
     */
    connect(namespace: string): Promise<NSConn> {
        return this.askConnect(namespace);
    }

    /**
     * waitServerConnect blocks until the server force-connects this Conn to
     * `namespace` (typically via `Conn#Connect` inside `Server#OnConnect`).
     * Resolves with the matching `NSConn`.
     */
    waitServerConnect(namespace: string): Promise<NSConn> {
        return new Promise((resolve) => {
            this.waitServerConnectNotifiers.set(namespace, (ns) => {
                this.waitServerConnectNotifiers.delete(namespace);
                resolve(ns);
            });
        });
    }

    /** namespace returns an already-connected `NSConn`, or undefined. */
    namespace(namespace: string): NSConn | undefined {
        return this.connectedNamespaces.get(namespace);
    }

    private async replyConnect(msg: Message): Promise<void> {
        if (msg.wait === "" || msg.isNoOp) {
            return;
        }

        if (this.namespace(msg.Namespace) !== undefined) {
            this.writeEmptyReply(msg.wait);
            return;
        }

        const events = getEvents(this.namespaces, msg.Namespace);
        if (events === undefined) {
            this.write(copyMessage(msg, { Err: ErrBadNamespace }));
            return;
        }

        // After a reconnect the server may connect a namespace before the restore does:
        // reuse the NSConn the application already holds, so its rooms come back on it.
        const pending = this._pendingRestore.find((d) => d.ns.namespace === msg.Namespace);
        const ns = pending?.ns ?? new NSConn(this, msg.Namespace, events);
        this.connectedNamespaces.set(msg.Namespace, ns);
        this.writeEmptyReply(msg.wait);

        await fireEvent(ns, copyMessage(msg, { Event: OnNamespaceConnected }));

        this.waitServerConnectNotifiers.get(msg.Namespace)?.(ns);
    }

    private async replyDisconnect(msg: Message): Promise<void> {
        if (msg.wait === "" || msg.isNoOp) {
            return;
        }

        const ns = this.namespace(msg.Namespace);
        if (ns === undefined) {
            this.writeEmptyReply(msg.wait);
            return;
        }

        ns.forceLeaveAll(true);

        this.connectedNamespaces.delete(msg.Namespace);

        this.writeEmptyReply(msg.wait);

        await fireEvent(ns, msg);
    }

    /**
     * ask sends `msg` to the server and resolves with the reply, or rejects with the
     * error the server sent back.
     *
     * `options.timeout` (default `Options.askTimeout`, 0 for none) rejects with a
     * `NeffosError` whose code is `ERR_TIMEOUT`; aborting `options.signal` rejects with
     * the signal's reason. `close()` rejects every pending ask with `ErrClosed`. A reply
     * that arrives after the ask gave up is ignored.
     */
    ask(msg: Message, options: AskOptions = {}): Promise<Message> {
        return new Promise((resolve, reject) => {
            if (this.isClosed()) {
                reject(ErrClosed);
                return;
            }

            const signal = options.signal;
            if (signal?.aborted) {
                reject(signal.reason);
                return;
            }

            const wait = this.genWait();
            msg.wait = wait;

            let timer: ReturnType<typeof setTimeout> | undefined;
            const onAbort = (): void => fail(signal?.reason);
            const cleanup = (): void => {
                this.waitingMessages.delete(wait);
                if (timer !== undefined) {
                    clearTimeout(timer);
                }
                signal?.removeEventListener('abort', onAbort);
            };
            const fail = (err: unknown): void => {
                cleanup();
                reject(err);
            };

            this.waitingMessages.set(wait, {
                settle: (receive) => {
                    cleanup();
                    if (receive.isError) {
                        reject(receive.Err ?? new Error(""));
                        return;
                    }
                    resolve(receive);
                },
                fail,
            });

            const timeout = options.timeout ?? this.askTimeout;
            if (timeout > 0) {
                timer = setTimeout(() => fail(new NeffosError(`no reply to "${msg.Event}" after ${timeout} ms`, 'ERR_TIMEOUT')), timeout);
            }
            signal?.addEventListener('abort', onAbort, { once: true });

            if (!this.write(msg)) {
                fail(ErrWrite);
            }
        });
    }

    private askConnect(namespace: string, existing?: NSConn): Promise<NSConn> {
        // Coalesce concurrent connect(namespace) calls. Without this guard,
        // two simultaneous `conn.connect("x")` calls would each pass the
        // initial "already connected?" check, both send connect messages, and
        // both write into `connectedNamespaces`.
        const inFlight = this.connectInFlight.get(namespace);
        if (inFlight !== undefined) {
            return inFlight;
        }

        const connected = this.namespace(namespace);
        if (connected !== undefined) {
            return Promise.resolve(connected);
        }

        const events = getEvents(this.namespaces, namespace);
        if (events === undefined) {
            return Promise.reject(ErrBadNamespace);
        }

        const p = (async (): Promise<NSConn> => {
            try {
                const connectMessage = new Message();
                connectMessage.Namespace = namespace;
                connectMessage.Event = OnNamespaceConnect;
                connectMessage.IsLocal = true;

                const ns = existing ?? new NSConn(this, namespace, events);
                const err = await fireEvent(ns, connectMessage);
                if (err !== undefined) {
                    throw err;
                }

                await this.ask(connectMessage);

                // The server may have force-connected this namespace while our
                // ask was in flight; re-check before mutating the map.
                const already = this.namespace(namespace);
                if (already !== undefined) {
                    return already;
                }

                this.connectedNamespaces.set(namespace, ns);

                await fireEvent(ns, copyMessage(connectMessage, { Event: OnNamespaceConnected }));
                return ns;
            } finally {
                this.connectInFlight.delete(namespace);
            }
        })();

        this.connectInFlight.set(namespace, p);
        return p;
    }

    /**
     * @internal
     * _reconnectNamespace connects `ns` again after a reconnect, keeping the same
     * `NSConn` object so references held by the application stay valid.
     */
    _reconnectNamespace(ns: NSConn): Promise<NSConn> {
        return this.askConnect(ns.namespace, ns);
    }

    async askDisconnect(msg: Message): Promise<void> {
        const ns = this.namespace(msg.Namespace);
        if (ns === undefined) {
            throw ErrBadNamespace;
        }

        await this.ask(msg);

        ns.forceLeaveAll(true);

        this.connectedNamespaces.delete(msg.Namespace);

        const err = await fireEvent(ns, copyMessage(msg, { IsLocal: true }));
        if (err !== undefined) {
            throw err;
        }
    }

    /** isClosed reports whether this connection has been closed for good, locally or remotely. */
    isClosed(): boolean {
        return this.closed;
    }

    /**
     * write sends `msg` to the server. Returns `false` when the connection is
     * closed or between sockets while reconnecting, when the target namespace
     * is not connected, or when the target room is not joined.
     */
    write(msg: Message): boolean {
        if (this.isClosed() || this.ws.readyState !== OPEN) {
            return false;
        }

        if (!msg.isConnect() && !msg.isDisconnect()) {
            // namespace pre-write check.
            const ns = this.namespace(msg.Namespace);

            if (ns === undefined) {
                return false;
            }

            // room pre-write check.
            if (msg.Room !== "" && !msg.isRoomJoin() && !msg.isRoomLeft()) {
                if (!ns.rooms.has(msg.Room)) {
                    // tried to send to a not-joined room.
                    return false;
                }
            }
        }

        this.ws.send(serializeMessage(msg));
        return true;
    }

    writeEmptyReply(wait: string): void {
        if (this.isClosed() || this.ws.readyState !== OPEN) {
            return;
        }
        this.ws.send(genEmptyReplyToWait(wait));
    }

    /**
     * close force-disconnects from every namespace and joined room, rejects every
     * pending ask with `ErrClosed`, stops any reconnect in progress, then
     * terminates the underlying websocket. Idempotent: subsequent calls are
     * no-ops. After close the `Conn` is unusable, so a new `dial` is required.
     */
    close(): void {
        if (this.closed) {
            return;
        }

        this.disconnectAll();
        this._pendingRestore = [];
        this.connectInFlight.clear();

        this.closed = true;
        this.lifetime.abort(ErrClosed);

        if (this.ws.readyState === OPEN) {
            this.ws.close();
        }
    }
}
