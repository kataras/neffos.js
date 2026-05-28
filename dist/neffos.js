// neffos.js — TypeScript client for the neffos WebSocket framework.
//
// Compatible with browsers and Node.js. In Node, we lazily import `ws` for a
// WebSocket constructor; in the browser, `globalThis.WebSocket` is used.
const isBrowser = (typeof window !== 'undefined');
// Resolve a fetch implementation. Node 18+ has a global; older Node would need
// a polyfill (omitted intentionally — we target Node 18+).
const _fetch = (typeof fetch !== 'undefined') ? fetch : undefined;
import * as nodeWS from 'ws';
// WS is the resolved WebSocket constructor; aliased to avoid shadowing the
// global `WebSocket` identifier (which TS 5+ rejects under `let`).
const WS = isBrowser
    ? window["WebSocket"]
    : nodeWS.WebSocket;
/* The OnNamespaceConnect is the event name that it's fired on before namespace connect. */
const OnNamespaceConnect = "_OnNamespaceConnect";
/* The OnNamespaceConnected is the event name that it's fired on after namespace connect. */
const OnNamespaceConnected = "_OnNamespaceConnected";
/* The OnNamespaceDisconnect is the event name that it's fired on namespace disconnected. */
const OnNamespaceDisconnect = "_OnNamespaceDisconnect";
/* The OnRoomJoin is the event name that it's fired on before room join. */
const OnRoomJoin = "_OnRoomJoin";
/* The OnRoomJoined is the event name that it's fired on after room join. */
const OnRoomJoined = "_OnRoomJoined";
/* The OnRoomLeave is the event name that it's fired on before room leave. */
const OnRoomLeave = "_OnRoomLeave";
/* The OnRoomLeft is the event name that it's fired on after room leave. */
const OnRoomLeft = "_OnRoomLeft";
/* The OnAnyEvent is the event name that it's fired, if no incoming event was registered, it's a "wildcard". */
const OnAnyEvent = "_OnAnyEvent";
/* The OnNativeMessage is the event name, which if registered on empty ("") namespace
   it accepts native messages(Message.Body and Message.IsNative is filled only). */
const OnNativeMessage = "_OnNativeMessage";
const ackBinary = 'M'; // see `onopen`, comes from client to server at startup.
const ackIDBinary = 'A'; // comes from server to client after ackBinary; the rest of the payload is the conn's ID.
const ackNotOKBinary = 'H'; // comes from server to client if `Server#OnConnect` errored; the rest is the error text.
const waitIsConfirmationPrefix = '#';
const waitComesFromClientPrefix = '$';
/**
 * isSystemEvent reports whether the given event name is one of the built-in
 * system events fired by the neffos protocol itself
 * (connect, connected, disconnect, room join/joined/leave/left).
 */
function isSystemEvent(event) {
    switch (event) {
        case OnNamespaceConnect:
        case OnNamespaceConnected:
        case OnNamespaceDisconnect:
        case OnRoomJoin:
        case OnRoomJoined:
        case OnRoomLeave:
        case OnRoomLeft:
            return true;
        default:
            return false;
    }
}
function isEmpty(s) {
    if (s === undefined || s === null) {
        return true;
    }
    if (typeof s === 'string' || s instanceof String) {
        return s.length === 0;
    }
    if (s instanceof Error) {
        return isEmpty(s.message);
    }
    return false;
}
/* The Message is the structure which describes the incoming data (and outgoing when `Conn.Write` is used directly). */
class Message {
    wait;
    /* The Namespace that this message sent to. */
    Namespace;
    /* The Room that this message sent to. */
    Room;
    /* The Event that this message sent to. */
    Event;
    /* The actual body of the incoming data. */
    Body;
    /* The Err contains any message's error if defined and not empty.
       Server-side and client-side can return an error instead of a message from inside event callbacks. */
    Err;
    isError;
    isNoOp;
    isInvalid;
    /* IsForced is true when this is a force action (e.g. connection lost remotely fires
       `OnNamespaceDisconnect` with IsForced=true). */
    IsForced;
    /* IsLocal reports whether the event was triggered by the client side itself (e.g. when
       `connect` triggers `OnNamespaceConnect` locally). The server side can force-connect a
       client, in which case `IsLocal` is false. */
    IsLocal;
    /* IsNative reports whether the message is a raw native websocket message
       (only `Body` is filled). */
    IsNative;
    /* SetBinary is true if the client must send this message as a binary frame. */
    SetBinary;
    isConnect() {
        return this.Event === OnNamespaceConnect;
    }
    isDisconnect() {
        return this.Event === OnNamespaceDisconnect;
    }
    isRoomJoin() {
        return this.Event === OnRoomJoin;
    }
    isRoomLeft() {
        return this.Event === OnRoomLeft;
    }
    isWait() {
        if (isEmpty(this.wait)) {
            return false;
        }
        if (this.wait[0] === waitIsConfirmationPrefix) {
            return true;
        }
        return this.wait[0] === waitComesFromClientPrefix;
    }
    /**
     * unmarshal returns this Message's `Body` parsed as JSON. Equivalent to
     * Go's `neffos.Message.Unmarshal`. Throws on invalid JSON.
     *
     * See library-level `marshal` function too.
     */
    unmarshal() {
        return JSON.parse(this.Body);
    }
}
/**
 * marshal serializes an object to a string for use in Message.Body.
 * Equivalent to Go's `neffos.Marshal`. See `Message.unmarshal` too.
 */
function marshal(obj) {
    return JSON.stringify(obj);
}
/* The wire-format constants must match the server side exactly. */
const messageSeparator = ';';
const messageFieldSeparatorReplacement = "@%!semicolon@%!";
const validMessageSepCount = 7;
const trueString = "1";
const falseString = "0";
const escapeRegExp = new RegExp(messageSeparator, "g");
function escapeMessageField(s) {
    if (isEmpty(s)) {
        return "";
    }
    return s.replace(escapeRegExp, messageFieldSeparatorReplacement);
}
const unescapeRegExp = new RegExp(messageFieldSeparatorReplacement, "g");
function unescapeMessageField(s) {
    if (isEmpty(s)) {
        return "";
    }
    return s.replace(unescapeRegExp, messageSeparator);
}
class replyError extends Error {
    constructor(message) {
        super(message);
        this.name = 'replyError';
        // Set the prototype explicitly so `instanceof replyError` works after
        // transpilation to ES5+. See https://github.com/Microsoft/TypeScript/wiki/FAQ#why-doesnt-extending-built-ins-like-error-array-and-map-work
        Object.setPrototypeOf(this, replyError.prototype);
    }
}
/**
 * reply is a sentinel-error helper: returning `reply(body)` from a message
 * handler tells neffos to echo `body` back to the sender with the same
 * Namespace and Event (rather than treating the return value as a transport
 * error). This is the JS analogue of Go's `neffos.Reply`.
 */
function reply(body) {
    return new replyError(body);
}
function isReply(err) {
    return (err instanceof replyError);
}
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8");
const messageSeparatorCharCode = messageSeparator.charCodeAt(0);
function serializeMessage(msg) {
    if (msg.IsNative && isEmpty(msg.wait)) {
        return msg.Body;
    }
    let isErrorString = falseString;
    let isNoOpString = falseString;
    let body = msg.Body || "";
    if (!isEmpty(msg.Err)) {
        body = msg.Err.message;
        if (!isReply(msg.Err)) {
            isErrorString = trueString;
        }
    }
    if (msg.isNoOp) {
        isNoOpString = trueString;
    }
    let data = [
        msg.wait || "",
        escapeMessageField(msg.Namespace),
        escapeMessageField(msg.Room),
        escapeMessageField(msg.Event),
        isErrorString,
        isNoOpString,
        "" // body
    ].join(messageSeparator);
    if (msg.SetBinary) {
        const b = textEncoder.encode(data);
        data = new Uint8Array(b.length + body.length);
        data.set(b, 0);
        data.set(body, b.length);
    }
    else {
        if (body instanceof Uint8Array) {
            body = textDecoder.decode(body, { stream: false });
        }
        data += body;
    }
    return data;
}
// splitN mirrors Go's `bytes.SplitN`: default JS `String.split` does not preserve the
// remainder past `limit`, so we re-join and slice.
function splitN(s, sep, limit) {
    if (limit === 0)
        return [s];
    const arr = s.split(sep, limit);
    if (arr.length === limit) {
        const curr = arr.join(sep) + sep;
        arr.push(s.substr(curr.length));
        return arr;
    }
    return [s];
}
// <wait>;
// <namespace>;
// <room>;
// <event>;
// <isError(0-1)>;
// <isNoOp(0-1)>;
// <body||error_message>
function deserializeMessage(data, allowNativeMessages) {
    const msg = new Message();
    const isArrayBuffer = data instanceof ArrayBuffer;
    const dataLen = isArrayBuffer ? data.byteLength : data.length;
    if (dataLen === 0) {
        msg.isInvalid = true;
        return msg;
    }
    let dts;
    if (isArrayBuffer) {
        const buf = data;
        const arr = new Uint8Array(buf);
        let sepCount = 1;
        let lastSepIndex = 0;
        for (let i = 0; i < arr.length; i++) {
            if (arr[i] === messageSeparatorCharCode) {
                sepCount++;
                lastSepIndex = i;
                if (sepCount === validMessageSepCount) {
                    break;
                }
            }
        }
        if (sepCount !== validMessageSepCount) {
            msg.isInvalid = true;
            return msg;
        }
        dts = splitN(textDecoder.decode(arr.slice(0, lastSepIndex), { stream: false }), messageSeparator, validMessageSepCount - 2);
        // For binary frames the trailing body keeps its byte form via slice on the ArrayBuffer.
        dts.push(buf.slice(lastSepIndex + 1, buf.byteLength));
        msg.SetBinary = true;
    }
    else {
        dts = splitN(data, messageSeparator, validMessageSepCount - 1);
    }
    if (dts.length !== validMessageSepCount) {
        if (!allowNativeMessages) {
            msg.isInvalid = true;
        }
        else {
            msg.Event = OnNativeMessage;
            msg.Body = data;
        }
        return msg;
    }
    msg.wait = dts[0];
    msg.Namespace = unescapeMessageField(dts[1]);
    msg.Room = unescapeMessageField(dts[2]);
    msg.Event = unescapeMessageField(dts[3]);
    msg.isError = dts[4] === trueString;
    msg.isNoOp = dts[5] === trueString;
    const body = dts[6];
    if (!isEmpty(body)) {
        if (msg.isError) {
            msg.Err = new Error(body);
        }
        else {
            msg.Body = body;
        }
    }
    else {
        msg.Body = "";
    }
    msg.isInvalid = false;
    msg.IsForced = false;
    msg.IsLocal = false;
    msg.IsNative = allowNativeMessages && msg.Event === OnNativeMessage;
    return msg;
}
function genWait() {
    if (!isBrowser) {
        const hrTime = process.hrtime();
        return waitComesFromClientPrefix + (hrTime[0] * 1000000000 + hrTime[1]);
    }
    const now = window.performance.now() + (Math.random() * 1000000);
    return waitComesFromClientPrefix + now.toString();
}
function genEmptyReplyToWait(wait) {
    return wait + messageSeparator.repeat(validMessageSepCount - 1);
}
/* The Room describes a connected connection to a room,
   emits messages with the `Message.Room` filled to the specific room
   and `Message.Namespace` to the underline `NSConn`'s namespace. */
class Room {
    nsConn;
    name;
    constructor(ns, roomName) {
        this.nsConn = ns;
        this.name = roomName;
    }
    /**
     * emit sends a message to the server with `Message.Room` set to this room
     * and `Message.Namespace` set to the underlying NSConn's namespace.
     * Returns true on success, false if the connection is closed or the
     * message is not allowed.
     */
    emit(event, body) {
        const msg = new Message();
        msg.Namespace = this.nsConn.namespace;
        msg.Room = this.name;
        msg.Event = event;
        msg.Body = body;
        return this.nsConn.conn.write(msg);
    }
    /**
     * emitBinary acts like `emit` but sets `Message.SetBinary` to true so the
     * message is sent as a binary frame.
     */
    emitBinary(event, body) {
        const msg = new Message();
        msg.Namespace = this.nsConn.namespace;
        msg.Room = this.name;
        msg.Event = event;
        msg.Body = body;
        msg.SetBinary = true;
        return this.nsConn.conn.write(msg);
    }
    /**
     * leave sends a local and remote room-leave signal (`OnRoomLeave`). On
     * success the local `OnRoomLeft` event is fired. Resolves with `null` on
     * success, or an `Error` describing the failure.
     */
    leave() {
        const msg = new Message();
        msg.Namespace = this.nsConn.namespace;
        msg.Room = this.name;
        msg.Event = OnRoomLeave;
        return this.nsConn.askRoomLeave(msg);
    }
}
/* The NSConn describes a connected connection to a specific namespace,
   it emits with the `Message.Namespace` filled and it can join to multiple rooms.
   A single Conn can be connected to one or more namespaces,
   each connected namespace is described by this class. */
class NSConn {
    /* The conn property refers to the main `Conn` constructed by the `dial` function. */
    conn;
    namespace;
    events;
    /* The rooms property is the map of the connected namespace's joined rooms. */
    rooms;
    constructor(conn, namespace, events) {
        this.conn = conn;
        this.namespace = namespace;
        this.events = events;
        this.rooms = new Map();
    }
    /** emit sends a message to the server with `Message.Namespace` set to this namespace. */
    emit(event, body) {
        const msg = new Message();
        msg.Namespace = this.namespace;
        msg.Event = event;
        msg.Body = body;
        return this.conn.write(msg);
    }
    /** emitBinary acts like emit but sets `Message.SetBinary` to true. */
    emitBinary(event, body) {
        const msg = new Message();
        msg.Namespace = this.namespace;
        msg.Event = event;
        msg.Body = body;
        msg.SetBinary = true;
        return this.conn.write(msg);
    }
    /** ask sends a message and resolves with the server's reply. See `Conn.ask`. */
    ask(event, body) {
        const msg = new Message();
        msg.Namespace = this.namespace;
        msg.Event = event;
        msg.Body = body;
        return this.conn.ask(msg);
    }
    /**
     * joinRoom asks the server to join the given room and resolves with the
     * `Room` instance. Rejects if the server denies the join.
     */
    async joinRoom(roomName) {
        return await this.askRoomJoin(roomName);
    }
    /** room returns an already-joined Room or undefined. */
    room(roomName) {
        return this.rooms.get(roomName);
    }
    /**
     * leaveAll concurrently leaves every joined room. Resolves with `null` on
     * full success, or the first error encountered (all leaves are still
     * awaited so the local state is consistent).
     *
     * Bug-fix note (0.2.0): the previous implementation used `Map.forEach`
     * with an async callback, which discarded the inner promises and could
     * resolve before the leaves actually completed.
     */
    async leaveAll() {
        const leaveMsg = new Message();
        leaveMsg.Namespace = this.namespace;
        leaveMsg.Event = OnRoomLeave;
        leaveMsg.IsLocal = true;
        const roomNames = [...this.rooms.keys()];
        const results = await Promise.all(roomNames.map(async (roomName) => {
            const msg = new Message();
            msg.Namespace = leaveMsg.Namespace;
            msg.Event = leaveMsg.Event;
            msg.IsLocal = leaveMsg.IsLocal;
            msg.Room = roomName;
            try {
                return await this.askRoomLeave(msg);
            }
            catch (err) {
                return err;
            }
        }));
        for (const err of results) {
            if (!isEmpty(err)) {
                return err;
            }
        }
        return null;
    }
    forceLeaveAll(isLocal) {
        const leaveMsg = new Message();
        leaveMsg.Namespace = this.namespace;
        leaveMsg.Event = OnRoomLeave;
        leaveMsg.IsForced = true;
        leaveMsg.IsLocal = isLocal;
        this.rooms.forEach((value, roomName) => {
            leaveMsg.Room = roomName;
            fireEvent(this, leaveMsg);
            this.rooms.delete(roomName);
            leaveMsg.Event = OnRoomLeft;
            fireEvent(this, leaveMsg);
            leaveMsg.Event = OnRoomLeave;
        });
    }
    /**
     * disconnect sends a disconnect signal to the server and fires the local
     * `OnNamespaceDisconnect` event. Resolves with `null` on success or an
     * `Error` on failure.
     */
    disconnect() {
        const disconnectMsg = new Message();
        disconnectMsg.Namespace = this.namespace;
        disconnectMsg.Event = OnNamespaceDisconnect;
        return this.conn.askDisconnect(disconnectMsg);
    }
    async askRoomJoin(roomName) {
        let room = this.rooms.get(roomName);
        if (room !== undefined) {
            return room;
        }
        const joinMsg = new Message();
        joinMsg.Namespace = this.namespace;
        joinMsg.Room = roomName;
        joinMsg.Event = OnRoomJoin;
        joinMsg.IsLocal = true;
        await this.conn.ask(joinMsg);
        const err = fireEvent(this, joinMsg);
        if (!isEmpty(err)) {
            throw err;
        }
        room = new Room(this, roomName);
        this.rooms.set(roomName, room);
        joinMsg.Event = OnRoomJoined;
        fireEvent(this, joinMsg);
        return room;
    }
    async askRoomLeave(msg) {
        if (!this.rooms.has(msg.Room)) {
            return ErrBadRoom;
        }
        try {
            await this.conn.ask(msg);
        }
        catch (err) {
            return err;
        }
        const err = fireEvent(this, msg);
        if (!isEmpty(err)) {
            return err;
        }
        this.rooms.delete(msg.Room);
        msg.Event = OnRoomLeft;
        fireEvent(this, msg);
        return null;
    }
    replyRoomJoin(msg) {
        if (isEmpty(msg.wait) || msg.isNoOp) {
            return;
        }
        if (!this.rooms.has(msg.Room)) {
            const err = fireEvent(this, msg);
            if (!isEmpty(err)) {
                msg.Err = err;
                this.conn.write(msg);
                return;
            }
            this.rooms.set(msg.Room, new Room(this, msg.Room));
            msg.Event = OnRoomJoined;
            fireEvent(this, msg);
        }
        this.conn.writeEmptyReply(msg.wait);
    }
    replyRoomLeave(msg) {
        if (isEmpty(msg.wait) || msg.isNoOp) {
            return;
        }
        if (!this.rooms.has(msg.Room)) {
            this.conn.writeEmptyReply(msg.wait);
            return;
        }
        fireEvent(this, msg);
        this.rooms.delete(msg.Room);
        this.conn.writeEmptyReply(msg.wait);
        msg.Event = OnRoomLeft;
        fireEvent(this, msg);
    }
}
function fireEvent(ns, msg) {
    if (ns.events.has(msg.Event)) {
        return ns.events.get(msg.Event)(ns, msg);
    }
    if (ns.events.has(OnAnyEvent)) {
        return ns.events.get(OnAnyEvent)(ns, msg);
    }
    return null;
}
function isNull(obj) {
    return (obj === null || obj === undefined);
}
function resolveNamespaces(obj, reject) {
    if (isNull(obj)) {
        if (!isNull(reject)) {
            reject("connHandler is empty.");
        }
        return null;
    }
    const namespaces = new Map();
    const events = new Map();
    let totalKeys = 0;
    Object.keys(obj).forEach((key) => {
        totalKeys++;
        const value = obj[key];
        if (value instanceof Function) {
            events.set(key, value);
        }
        else if (value instanceof Map) {
            namespaces.set(key, value);
        }
        else {
            // it's a plain object, convert to a Map of events.
            const objEvents = new Map();
            Object.keys(value).forEach((objKey) => {
                objEvents.set(objKey, value[objKey]);
            });
            namespaces.set(key, objEvents);
        }
    });
    if (events.size > 0) {
        if (totalKeys !== events.size) {
            if (!isNull(reject)) {
                reject("all keys of connHandler should be events, mix of namespaces and event callbacks is not supported " + events.size + " vs total " + totalKeys);
            }
            return null;
        }
        namespaces.set("", events);
    }
    return namespaces;
}
function getEvents(namespaces, namespace) {
    if (namespaces.has(namespace)) {
        return namespaces.get(namespace);
    }
    return null;
}
/* URLParamAsHeaderPrefix is the prefix that `Options.headers` entries are
   encoded as URL parameters with — the server side parses these back into
   request headers. Browsers cannot set arbitrary headers on WebSocket
   handshakes, so this is the standard workaround. Server `URLParamAsHeaderPrefix`
   must match. Node clients can use real headers without this. */
const URLParamAsHeaderPrefix = "X-Websocket-Header-";
function parseHeadersAsURLParameters(headers, url) {
    if (isNull(headers)) {
        return url;
    }
    for (let key in headers) {
        if (Object.prototype.hasOwnProperty.call(headers, key)) {
            let value = headers[key];
            key = encodeURIComponent(URLParamAsHeaderPrefix + key);
            value = encodeURIComponent(value);
            const part = key + "=" + value;
            url = (url.indexOf("?") !== -1 ?
                url.split("?")[0] + "?" + part + "&" + url.split("?")[1] :
                (url.indexOf("#") !== -1 ? url.split("#")[0] + "?" + part + "#" + url.split("#")[1] : url + '?' + part));
        }
    }
    return url;
}
/**
 * dial opens a connection to a neffos server and resolves with a `Conn`.
 *
 * The endpoint may be a `ws://`/`wss://` URL or a relative path (in browsers
 * the URL is auto-completed to the current document's scheme/host).
 *
 * `connHandler` is a plain object of either:
 *   - `{ namespace: { eventName: handler, ... }, ... }`
 *   - `{ eventName: handler, ... }` (treated as the empty namespace)
 *
 * Pass `options.reconnect = N` (milliseconds) to enable automatic reconnection
 * with rejoin of previously connected namespaces and rooms.
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
function dial(endpoint, connHandler, options) {
    return _dial(endpoint, connHandler, 0, options);
}
// this header key should match the server's `websocketReconectHeaderKey` constant.
const websocketReconnectHeaderKey = 'X-Websocket-Reconnect';
function _dial(endpoint, connHandler, tries, options) {
    if (isBrowser && endpoint.indexOf("/") === 0) {
        // running from browser, endpoint starts with /. Reconstruct absolute URL.
        const scheme = document.location.protocol === "https:" ? "wss" : "ws";
        const port = document.location.port ? ":" + document.location.port : "";
        endpoint = scheme + "://" + document.location.hostname + port + endpoint;
    }
    if (endpoint.indexOf("ws") === -1) {
        endpoint = "ws://" + endpoint;
    }
    return new Promise((resolve, reject) => {
        if (!WS) {
            reject("WebSocket is not accessible through this browser.");
            return;
        }
        const namespaces = resolveNamespaces(connHandler, reject);
        if (isNull(namespaces)) {
            return;
        }
        if (isNull(options)) {
            options = {};
        }
        if (isNull(options.headers)) {
            options.headers = {};
        }
        const reconnectEvery = options.reconnect ?? 0;
        if (tries > 0 && reconnectEvery > 0) {
            options.headers[websocketReconnectHeaderKey] = tries.toString();
        }
        else if (!isNull(options.headers[websocketReconnectHeaderKey])) /* against tricks */ {
            delete options.headers[websocketReconnectHeaderKey];
        }
        const ws = makeWebsocketConnection(endpoint, options);
        const conn = new Conn(ws, namespaces);
        conn.reconnectTries = tries;
        // Track whether the outer promise has already settled. Replaces the
        // previous `resolve.toString() === "function () { [native code] }"`
        // heuristic which was fragile under bundlers/transpilers.
        let settled = false;
        const settleResolve = (c) => {
            if (settled)
                return;
            settled = true;
            resolve(c);
        };
        const settleReject = (e) => {
            if (settled)
                return;
            settled = true;
            reject(e);
        };
        ws.binaryType = "arraybuffer";
        ws.onmessage = ((evt) => {
            const err = conn.handle(evt);
            if (!isEmpty(err)) {
                settleReject(err);
                return;
            }
            if (conn.isAcknowledged()) {
                settleResolve(conn);
            }
        });
        ws.onopen = (() => {
            ws.send(ackBinary);
        });
        ws.onerror = ((err) => {
            conn.close();
            settleReject(err);
        });
        ws.onclose = (() => {
            if (conn.isClosed()) {
                // reconnection is NOT allowed when the disconnect was intentional:
                //   (1) server force-disconnected this client,
                //   (2) client called close() itself.
                // Both are reflected by conn.isClosed() == true.
                return null;
            }
            // disable previous event callbacks so a stale handler can't fire after
            // the next dial replaces them.
            ws.onmessage = null;
            ws.onopen = null;
            ws.onerror = null;
            ws.onclose = null;
            if (reconnectEvery <= 0) {
                conn.close();
                settleReject(new Error("connection closed"));
                return null;
            }
            // snapshot the previously-connected namespaces and rooms BEFORE close clears them.
            const previouslyConnectedNamespacesNamesOnly = new Map();
            conn.connectedNamespaces.forEach((nsConn, name) => {
                const previouslyJoinedRooms = [];
                if (!isNull(nsConn.rooms) && nsConn.rooms.size > 0) {
                    nsConn.rooms.forEach((_roomConn, roomName) => {
                        previouslyJoinedRooms.push(roomName);
                    });
                }
                previouslyConnectedNamespacesNamesOnly.set(name, previouslyJoinedRooms);
            });
            conn.close();
            whenResourceOnline(endpoint, reconnectEvery, (retryTries) => {
                _dial(endpoint, connHandler, retryTries, options).then((newConn) => {
                    if (settled) {
                        // The original dial promise has already returned; we're now in
                        // reconnect-after-the-fact mode. Re-attach the previously
                        // connected namespaces and rooms automatically. Catch failures
                        // so a per-namespace reconnect error doesn't surface as an
                        // unhandled rejection.
                        previouslyConnectedNamespacesNamesOnly.forEach((joinedRooms, name) => {
                            newConn.connect(name)
                                .then((newNSConn) => {
                                joinedRooms.forEach(async (roomName) => {
                                    try {
                                        await newNSConn.joinRoom(roomName);
                                    }
                                    catch (e) {
                                        // best-effort: rooms may not exist after a redeploy.
                                        // Surface via console.warn rather than throw.
                                        // tslint:disable-next-line:no-console
                                        console.warn("neffos: failed to rejoin room", name, roomName, e);
                                    }
                                });
                            })
                                .catch((e) => {
                                // tslint:disable-next-line:no-console
                                console.warn("neffos: failed to reconnect namespace", name, e);
                            });
                        });
                        return;
                    }
                    settleResolve(newConn);
                }).catch(settleReject);
            });
            return null;
        });
    });
}
function makeWebsocketConnection(endpoint, options) {
    if (isBrowser) {
        if (!isNull(options)) {
            if (options.headers) {
                endpoint = parseHeadersAsURLParameters(options.headers, endpoint);
            }
            if (options.protocols) {
                return new WS(endpoint, options.protocols);
            }
            return new WS(endpoint);
        }
    }
    return new WS(endpoint, options);
}
function whenResourceOnline(endpoint, checkEvery, notifyOnline) {
    // Probe the HTTP endpoint with a HEAD request before dialing again. This lets
    // the server know how many reconnect attempts have happened (via the
    // X-Websocket-Reconnect header) and prevents tight retry loops while the
    // endpoint is unreachable.
    const endpointHTTP = endpoint.replace(/(ws)(s)?\:\/\//, "http$2://");
    // counts and reports the failure count to the server-side via header.
    let tries = 1;
    const fetchOptions = { method: 'HEAD', mode: 'no-cors' };
    const check = () => {
        _fetch(endpointHTTP, fetchOptions).then(() => {
            notifyOnline(tries);
        }).catch(() => {
            tries++;
            setTimeout(check, checkEvery);
        });
    };
    setTimeout(check, checkEvery);
}
const ErrInvalidPayload = new Error("invalid payload");
const ErrBadNamespace = new Error("bad namespace");
const ErrBadRoom = new Error("bad room");
const ErrClosed = new Error("use of closed connection");
const ErrWrite = new Error("write closed");
/**
 * isCloseError reports whether the given error came from a server shutdown or
 * a forced socket close (rather than a normal application error).
 */
function isCloseError(err) {
    if (err && !isEmpty(err.message)) {
        return err.message.indexOf("[-1] write closed") >= 0;
    }
    return false;
}
/* The Conn class contains the websocket connection and the neffos communication functionality.
   Its `connect` will return a new `NSConn` instance, each connection can connect to one or more namespaces.
   Each `NSConn` can join to multiple rooms. */
class Conn {
    conn;
    /* If > 0 then this connection is the result of a reconnection,
       see `wasReconnected()` too. */
    reconnectTries;
    _isAcknowledged;
    allowNativeMessages;
    /* ID is the generated connection ID from the server-side, all connected namespaces(`NSConn` instances)
      that belong to that connection have the same ID. It is available immediately after the `dial`. */
    ID;
    closed;
    waitServerConnectNotifiers;
    queue;
    waitingMessages;
    namespaces;
    connectedNamespaces;
    // in-flight namespace connect promises. Prevents two concurrent
    // `connect(ns)` calls from sending two connect messages and double-mutating
    // `connectedNamespaces`.
    connectInFlight;
    constructor(conn, namespaces) {
        this.conn = conn;
        this.reconnectTries = 0;
        this._isAcknowledged = false;
        this.namespaces = namespaces;
        const hasEmptyNS = namespaces.has("");
        this.allowNativeMessages = hasEmptyNS && namespaces.get("").has(OnNativeMessage);
        this.queue = [];
        this.waitingMessages = new Map();
        this.connectedNamespaces = new Map();
        this.connectInFlight = new Map();
        this.closed = false;
    }
    /** wasReconnected reports whether this connection is the result of a reconnect.
     *  See `reconnectTries` for the count. */
    wasReconnected() {
        return this.reconnectTries > 0;
    }
    isAcknowledged() {
        return this._isAcknowledged;
    }
    handle(evt) {
        if (!this._isAcknowledged) {
            const err = this.handleAck(evt.data);
            if (isNull(err)) {
                this._isAcknowledged = true;
                this.handleQueue();
            }
            else {
                this.conn.close();
            }
            return err;
        }
        return this.handleMessage(evt.data);
    }
    handleAck(data) {
        const typ = data[0];
        switch (typ) {
            case ackIDBinary:
                this.ID = data.slice(1);
                return null;
            case ackNotOKBinary:
                return new Error(data.slice(1));
            default:
                this.queue.push(data);
                return null;
        }
    }
    handleQueue() {
        if (isNull(this.queue) || this.queue.length === 0) {
            return;
        }
        // Drain the queue atomically. The previous implementation used
        // `forEach + splice(index, 1)` which skipped every other element due to
        // the index shift after the splice.
        const drained = this.queue.splice(0);
        for (const item of drained) {
            this.handleMessage(item);
        }
    }
    handleMessage(data) {
        const msg = deserializeMessage(data, this.allowNativeMessages);
        if (msg.isInvalid) {
            return ErrInvalidPayload;
        }
        if (msg.IsNative && this.allowNativeMessages) {
            const ns = this.namespace("");
            return fireEvent(ns, msg);
        }
        if (msg.isWait()) {
            const cb = this.waitingMessages.get(msg.wait);
            if (cb !== undefined) {
                this.waitingMessages.delete(msg.wait);
                cb(msg);
                return null;
            }
        }
        const ns = this.namespace(msg.Namespace);
        switch (msg.Event) {
            case OnNamespaceConnect:
                this.replyConnect(msg);
                break;
            case OnNamespaceDisconnect:
                this.replyDisconnect(msg);
                break;
            case OnRoomJoin:
                // Explicit break in the false branch prevents accidental
                // fall-through to OnRoomLeave when the namespace is missing.
                if (ns !== undefined) {
                    ns.replyRoomJoin(msg);
                }
                break;
            case OnRoomLeave:
                if (ns !== undefined) {
                    ns.replyRoomLeave(msg);
                }
                break;
            default:
                if (ns === undefined) {
                    return ErrBadNamespace;
                }
                msg.IsLocal = false;
                const err = fireEvent(ns, msg);
                if (!isEmpty(err)) {
                    // write any error back to the server.
                    msg.Err = err;
                    this.write(msg);
                    return err;
                }
        }
        return null;
    }
    /**
     * connect asks the server to connect this Conn to the given namespace and
     * resolves with the resulting `NSConn`. Concurrent calls with the same
     * namespace share a single in-flight promise.
     */
    connect(namespace) {
        return this.askConnect(namespace);
    }
    /**
     * waitServerConnect blocks until the server force-connects this Conn to
     * `namespace` (typically via `Conn#Connect` inside `Server#OnConnect`).
     * Resolves with the matching `NSConn`.
     */
    waitServerConnect(namespace) {
        if (isNull(this.waitServerConnectNotifiers)) {
            this.waitServerConnectNotifiers = new Map();
        }
        return new Promise((resolve) => {
            this.waitServerConnectNotifiers.set(namespace, () => {
                this.waitServerConnectNotifiers.delete(namespace);
                resolve(this.namespace(namespace));
            });
        });
    }
    /** namespace returns an already-connected `NSConn`, or undefined. */
    namespace(namespace) {
        return this.connectedNamespaces.get(namespace);
    }
    replyConnect(msg) {
        if (isEmpty(msg.wait) || msg.isNoOp) {
            return;
        }
        let ns = this.namespace(msg.Namespace);
        if (ns !== undefined) {
            this.writeEmptyReply(msg.wait);
            return;
        }
        const events = getEvents(this.namespaces, msg.Namespace);
        if (isNull(events)) {
            msg.Err = ErrBadNamespace;
            this.write(msg);
            return;
        }
        ns = new NSConn(this, msg.Namespace, events);
        this.connectedNamespaces.set(msg.Namespace, ns);
        this.writeEmptyReply(msg.wait);
        msg.Event = OnNamespaceConnected;
        fireEvent(ns, msg);
        if (!isNull(this.waitServerConnectNotifiers) && this.waitServerConnectNotifiers.size > 0) {
            if (this.waitServerConnectNotifiers.has(msg.Namespace)) {
                this.waitServerConnectNotifiers.get(msg.Namespace)();
            }
        }
    }
    replyDisconnect(msg) {
        if (isEmpty(msg.wait) || msg.isNoOp) {
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
        fireEvent(ns, msg);
    }
    /**
     * ask sends `msg` to the server and resolves with the reply.
     *
     * No internal timeout: callers should race the returned promise with their
     * own timer (`Promise.race`) for cancellation semantics.
     */
    ask(msg) {
        return new Promise((resolve, reject) => {
            if (this.isClosed()) {
                reject(ErrClosed);
                return;
            }
            msg.wait = genWait();
            this.waitingMessages.set(msg.wait, ((receive) => {
                if (receive.isError) {
                    reject(receive.Err);
                    return;
                }
                resolve(receive);
            }));
            if (!this.write(msg)) {
                this.waitingMessages.delete(msg.wait);
                reject(ErrWrite);
                return;
            }
        });
    }
    askConnect(namespace) {
        // Coalesce concurrent connect(namespace) calls. Without this guard,
        // two simultaneous `conn.connect("x")` calls would each pass the
        // initial "already connected?" check, both send connect messages, and
        // both write into `connectedNamespaces`.
        const existing = this.connectInFlight.get(namespace);
        if (existing) {
            return existing;
        }
        const p = (async () => {
            try {
                let ns = this.namespace(namespace);
                if (ns !== undefined) {
                    return ns;
                }
                const events = getEvents(this.namespaces, namespace);
                if (isNull(events)) {
                    throw ErrBadNamespace;
                }
                const connectMessage = new Message();
                connectMessage.Namespace = namespace;
                connectMessage.Event = OnNamespaceConnect;
                connectMessage.IsLocal = true;
                ns = new NSConn(this, namespace, events);
                const err = fireEvent(ns, connectMessage);
                if (!isEmpty(err)) {
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
                connectMessage.Event = OnNamespaceConnected;
                fireEvent(ns, connectMessage);
                return ns;
            }
            finally {
                this.connectInFlight.delete(namespace);
            }
        })();
        this.connectInFlight.set(namespace, p);
        return p;
    }
    async askDisconnect(msg) {
        const ns = this.namespace(msg.Namespace);
        if (ns === undefined) {
            return ErrBadNamespace;
        }
        try {
            await this.ask(msg);
        }
        catch (err) {
            return err;
        }
        ns.forceLeaveAll(true);
        this.connectedNamespaces.delete(msg.Namespace);
        msg.IsLocal = true;
        return fireEvent(ns, msg);
    }
    /** isClosed reports whether this connection has been closed locally or remotely. */
    isClosed() {
        return this.closed;
    }
    /**
     * write sends `msg` to the server. Returns `false` when the connection is
     * closed, when the target namespace is not connected, or when the target
     * room is not joined.
     */
    write(msg) {
        if (this.isClosed()) {
            return false;
        }
        if (!msg.isConnect() && !msg.isDisconnect()) {
            // namespace pre-write check.
            const ns = this.namespace(msg.Namespace);
            if (ns === undefined) {
                return false;
            }
            // room pre-write check.
            if (!isEmpty(msg.Room) && !msg.isRoomJoin() && !msg.isRoomLeft()) {
                if (!ns.rooms.has(msg.Room)) {
                    // tried to send to a not-joined room.
                    return false;
                }
            }
        }
        this.conn.send(serializeMessage(msg));
        return true;
    }
    writeEmptyReply(wait) {
        this.conn.send(genEmptyReplyToWait(wait));
    }
    /**
     * close force-disconnects from every namespace and joined room, then
     * terminates the underlying websocket. Idempotent: subsequent calls are
     * no-ops. After close the `Conn` is unusable — a new `dial` is required.
     */
    close() {
        if (this.closed) {
            return;
        }
        const disconnectMsg = new Message();
        disconnectMsg.Event = OnNamespaceDisconnect;
        disconnectMsg.IsForced = true;
        disconnectMsg.IsLocal = true;
        this.connectedNamespaces.forEach((ns) => {
            ns.forceLeaveAll(true);
            disconnectMsg.Namespace = ns.namespace;
            fireEvent(ns, disconnectMsg);
            this.connectedNamespaces.delete(ns.namespace);
        });
        this.waitingMessages.clear();
        this.connectInFlight.clear();
        this.closed = true;
        if (this.conn.readyState === this.conn.OPEN) {
            this.conn.close();
        }
    }
}
const neffos = {
    // main functions.
    dial: dial,
    isSystemEvent: isSystemEvent,
    // constants (events).
    OnNamespaceConnect: OnNamespaceConnect,
    OnNamespaceConnected: OnNamespaceConnected,
    OnNamespaceDisconnect: OnNamespaceDisconnect,
    OnRoomJoin: OnRoomJoin,
    OnRoomJoined: OnRoomJoined,
    OnRoomLeave: OnRoomLeave,
    OnRoomLeft: OnRoomLeft,
    OnAnyEvent: OnAnyEvent,
    OnNativeMessage: OnNativeMessage,
    // classes.
    Message: Message,
    Room: Room,
    NSConn: NSConn,
    Conn: Conn,
    // errors.
    ErrInvalidPayload: ErrInvalidPayload,
    ErrBadNamespace: ErrBadNamespace,
    ErrBadRoom: ErrBadRoom,
    ErrClosed: ErrClosed,
    ErrWrite: ErrWrite,
    isCloseError: isCloseError,
    reply: reply,
    marshal: marshal
};
const root = typeof self === 'object' && self.self === self && self ||
    typeof global === 'object' && global.global === global && global;
// expose on the global for `<script>` users / browser bundles.
if (root) {
    root["neffos"] = neffos;
}
export { dial, isSystemEvent, 
//
OnNamespaceConnect, OnNamespaceConnected, OnNamespaceDisconnect, OnRoomJoin, OnRoomJoined, OnRoomLeave, OnRoomLeft, OnAnyEvent, OnNativeMessage, 
//
Message, Room, NSConn, Conn, 
//
ErrInvalidPayload, ErrBadNamespace, ErrBadRoom, ErrClosed, ErrWrite, isCloseError, reply, marshal, };
//# sourceMappingURL=neffos.js.map