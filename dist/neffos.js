"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
// Make it compatible to run with browser and inside nodejs
// the good thing is that the node's WebSocket module has the same API as the browser's one,
// so all works and minimum changes were required to achieve that result.
// See the `genWait()` too.
const isBrowser = (typeof window !== 'undefined');
var WebSocket;
if (!isBrowser) {
    WebSocket = require('ws');
}
else {
    WebSocket = window["WebSocket"];
}
/* The OnNamespaceConnect is the event name that it's fired on before namespace connect. */
exports.OnNamespaceConnect = "_OnNamespaceConnect";
/* The OnNamespaceConnected is the event name that it's fired on after namespace connect. */
exports.OnNamespaceConnected = "_OnNamespaceConnected";
/* The OnNamespaceDisconnect is the event name that it's fired on namespace disconnected. */
exports.OnNamespaceDisconnect = "_OnNamespaceDisconnect";
/* The OnRoomJoin is the event name that it's fired on before room join. */
exports.OnRoomJoin = "_OnRoomJoin";
/* The OnRoomJoined is the event name that it's fired on after room join. */
exports.OnRoomJoined = "_OnRoomJoined";
/* The OnRoomLeave is the event name that it's fired on before room leave. */
exports.OnRoomLeave = "_OnRoomLeave";
/* The OnRoomLeft is the event name that it's fired on after room leave. */
exports.OnRoomLeft = "_OnRoomLeft";
/* The OnAnyEvent is the event name that it's fired, if no incoming event was registered, it's a "wilcard". */
exports.OnAnyEvent = "_OnAnyEvent";
/* The OnNativeMessage is the event name, which if registered on empty ("") namespace
   it accepts native messages(Message.Body and Message.IsNative is filled only). */
exports.OnNativeMessage = "_OnNativeMessage";
const ackBinary = 'M'; // see `onopen`, comes from client to server at startup.
// see `handleAck`.
const ackIDBinary = 'A'; // comes from server to client after ackBinary and ready as a prefix, the rest message is the conn's ID.
const ackNotOKBinary = 'H'; // comes from server to client if `Server#OnConnected` errored as a prefix, the rest message is the error text.
const waitIsConfirmationPrefix = '#';
const waitComesFromClientPrefix = '$';
/* The isSystemEvent reports whether the "event" is a system event;
   connect, connected, disconnect, room join, room joined, room leave, room left. */
function isSystemEvent(event) {
    switch (event) {
        case exports.OnNamespaceConnect:
        case exports.OnNamespaceConnected:
        case exports.OnNamespaceDisconnect:
        case exports.OnRoomJoin:
        case exports.OnRoomJoined:
        case exports.OnRoomLeave:
        case exports.OnRoomLeft:
            return true;
        default:
            return false;
    }
}
exports.isSystemEvent = isSystemEvent;
function isEmpty(s) {
    if (s === undefined) {
        return true;
    }
    if (s === null) {
        return true;
    }
    if (typeof s === 'string' || s instanceof String) {
        return s.length === 0 || s === "";
    }
    if (s instanceof Error) {
        return isEmpty(s.message);
    }
    return false;
}
/* The Message is the structure which describes the icoming data (and if `Conn.Write` is manually used to write). */
class Message {
    isConnect() {
        return this.Event == exports.OnNamespaceConnect || false;
    }
    isDisconnect() {
        return this.Event == exports.OnNamespaceDisconnect || false;
    }
    isRoomJoin() {
        return this.Event == exports.OnRoomJoin || false;
    }
    isRoomLeft() {
        return this.Event == exports.OnRoomLeft || false;
    }
    isWait() {
        if (isEmpty(this.wait)) {
            return false;
        }
        if (this.wait[0] == waitIsConfirmationPrefix) {
            return true;
        }
        return this.wait[0] == waitComesFromClientPrefix || false;
    }
}
exports.Message = Message;
const messageSeparator = ';';
const validMessageSepCount = 7;
const trueString = "1";
const falseString = "0";
function serializeMessage(msg) {
    if (msg.IsNative && isEmpty(msg.wait)) {
        return msg.Body;
    }
    let isErrorString = falseString;
    let isNoOpString = falseString;
    let body = msg.Body || "";
    if (msg.isError) {
        body = msg.Err;
        isErrorString = trueString;
    }
    if (msg.isNoOp) {
        isNoOpString = trueString;
    }
    return [
        msg.wait || "",
        msg.Namespace,
        msg.Room || "",
        msg.Event || "",
        isErrorString,
        isNoOpString,
        body
    ].join(messageSeparator);
}
// <wait>;
// <namespace>;
// <room>;
// <event>;
// <isError(0-1)>;
// <isNoOp(0-1)>;
// <body||error_message>
function deserializeMessage(data, allowNativeMessages) {
    var msg = new Message();
    if (data.length == 0) {
        msg.isInvalid = true;
        return msg;
    }
    let dts = data.split(messageSeparator, validMessageSepCount);
    if (dts.length != validMessageSepCount) {
        if (!allowNativeMessages) {
            msg.isInvalid = true;
        }
        else {
            msg.Event = exports.OnNativeMessage;
            msg.Body = data;
        }
        return msg;
    }
    msg.wait = dts[0];
    msg.Namespace = dts[1];
    msg.Room = dts[2];
    msg.Event = dts[3];
    msg.isError = dts[4] == trueString || false;
    msg.isNoOp = dts[5] == trueString || false;
    let body = dts[6];
    if (!isEmpty(body)) {
        if (msg.isError) {
            msg.Err = body;
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
    msg.IsNative = (allowNativeMessages && msg.Event == exports.OnNativeMessage) || false;
    // msg.SetBinary = false;
    return msg;
}
function genWait() {
    if (!isBrowser) {
        let hrTime = process.hrtime();
        return waitComesFromClientPrefix + hrTime[0] * 1000000000 + hrTime[1];
    }
    else {
        let now = window.performance.now();
        return waitComesFromClientPrefix + now.toString();
    }
}
function genWaitConfirmation(wait) {
    return waitIsConfirmationPrefix + wait;
}
function genEmptyReplyToWait(wait) {
    return wait + messageSeparator.repeat(validMessageSepCount - 1);
}
/* The Room describes a connected connection to a room,
   emits messages with the `Message.Room` filled to the specific room
   and `Message.Namespace` to the underline `NSConn`'s namespace. */
class Room {
    constructor(ns, roomName) {
        this.nsConn = ns;
        this.name = roomName;
    }
    /* The emit method sends a message to the server with its `Message.Room` filled to this specific room
       and `Message.Namespace` to the underline `NSConn`'s namespace. */
    emit(event, body) {
        let msg = new Message();
        msg.Namespace = this.nsConn.namespace;
        msg.Room = this.name;
        msg.Event = event;
        msg.Body = body;
        return this.nsConn.conn.write(msg);
    }
    /* The leave method sends a local and server room leave signal `OnRoomLeave`
       and if succeed it fires the OnRoomLeft` event. */
    leave() {
        let msg = new Message();
        msg.Namespace = this.nsConn.namespace;
        msg.Room = this.name;
        msg.Event = exports.OnRoomLeave;
        return this.nsConn.askRoomLeave(msg);
    }
}
exports.Room = Room;
/* The NSConn describes a connected connection to a specific namespace,
   it emits with the `Message.Namespace` filled and it can join to multiple rooms.
   A single Conn can be connected to one or more namespaces,
   each connected namespace is described by this class. */
class NSConn {
    constructor(conn, namespace, events) {
        this.conn = conn;
        this.namespace = namespace;
        this.events = events;
        this.rooms = new Map();
    }
    /* The emit method sends a message to the server with its `Message.Namespace` filled to this specific namespace. */
    emit(event, body) {
        let msg = new Message();
        msg.Namespace = this.namespace;
        msg.Event = event;
        msg.Body = body;
        return this.conn.write(msg);
    }
    /* See `Conn.ask`. */
    ask(event, body) {
        let msg = new Message();
        msg.Namespace = this.namespace;
        msg.Event = event;
        msg.Body = body;
        return this.conn.ask(msg);
    }
    /* The joinRoom method can be used to join to a specific room, rooms are dynamic.
       Returns a `Room` or an error. */
    joinRoom(roomName) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.askRoomJoin(roomName);
        });
    }
    /* The room method returns a joined `Room`. */
    room(roomName) {
        return this.rooms.get(roomName);
    }
    // Rooms(): Room[] {
    //     let rooms = new Array<Room>(this.rooms.size);
    //     this.rooms.forEach((room) => {
    //         rooms.push(room);
    //     })
    //     return rooms;
    // }
    /* The leaveAll method sends a leave room signal to all rooms and fires the `OnRoomLeave` and `OnRoomLeft` (if no error occurred) events. */
    leaveAll() {
        return __awaiter(this, void 0, void 0, function* () {
            let leaveMsg = new Message();
            leaveMsg.Namespace = this.namespace;
            leaveMsg.Event = exports.OnRoomLeft;
            leaveMsg.IsLocal = true;
            this.rooms.forEach((value, roomName) => __awaiter(this, void 0, void 0, function* () {
                leaveMsg.Room = roomName;
                try {
                    yield this.askRoomLeave(leaveMsg);
                }
                catch (err) {
                    return err;
                }
            }));
            return null;
        });
    }
    forceLeaveAll(isLocal) {
        let leaveMsg = new Message();
        leaveMsg.Namespace = this.namespace;
        leaveMsg.Event = exports.OnRoomLeave;
        leaveMsg.IsForced = true;
        leaveMsg.IsLocal = isLocal;
        this.rooms.forEach((value, roomName) => {
            leaveMsg.Room = roomName;
            fireEvent(this, leaveMsg);
            this.rooms.delete(roomName);
            leaveMsg.Event = exports.OnRoomLeft;
            fireEvent(this, leaveMsg);
            leaveMsg.Event = exports.OnRoomLeave;
        });
    }
    /* The disconnect method sends a disconnect signal to the server and fires the `OnNamespaceDisconnect` event. */
    disconnect() {
        let disconnectMsg = new Message();
        disconnectMsg.Namespace = this.namespace;
        disconnectMsg.Event = exports.OnNamespaceDisconnect;
        return this.conn.askDisconnect(disconnectMsg);
    }
    askRoomJoin(roomName) {
        return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
            let room = this.rooms.get(roomName);
            if (room !== undefined) {
                resolve(room);
                return;
            }
            let joinMsg = new Message();
            joinMsg.Namespace = this.namespace;
            joinMsg.Room = roomName;
            joinMsg.Event = exports.OnRoomJoin;
            joinMsg.IsLocal = true;
            try {
                yield this.conn.ask(joinMsg);
            }
            catch (err) {
                reject(err);
                return;
            }
            let err = fireEvent(this, joinMsg);
            if (!isEmpty(err)) {
                reject(err);
                return;
            }
            room = new Room(this, roomName);
            this.rooms.set(roomName, room);
            joinMsg.Event = exports.OnRoomJoined;
            fireEvent(this, joinMsg);
            resolve(room);
        }));
    }
    askRoomLeave(msg) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.rooms.has(msg.Room)) {
                return exports.ErrBadRoom;
            }
            try {
                yield this.conn.ask(msg);
            }
            catch (err) {
                return err;
            }
            let err = fireEvent(this, msg);
            if (!isEmpty(err)) {
                return err;
            }
            this.rooms.delete(msg.Room);
            msg.Event = exports.OnRoomLeft;
            fireEvent(this, msg);
            return null;
        });
    }
    replyRoomJoin(msg) {
        if (isEmpty(msg.wait) || msg.isNoOp) {
            return;
        }
        if (!this.rooms.has(msg.Room)) {
            let err = fireEvent(this, msg);
            if (!isEmpty(err)) {
                msg.Err = err.message;
                this.conn.write(msg);
                return;
            }
            this.rooms.set(msg.Room, new Room(this, msg.Room));
            msg.Event = exports.OnRoomJoined;
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
        msg.Event = exports.OnRoomLeft;
        fireEvent(this, msg);
    }
}
exports.NSConn = NSConn;
function fireEvent(ns, msg) {
    if (ns.events.has(msg.Event)) {
        return ns.events.get(msg.Event)(ns, msg);
    }
    if (ns.events.has(exports.OnAnyEvent)) {
        return ns.events.get(exports.OnAnyEvent)(ns, msg);
    }
    return null;
}
function isNull(obj) {
    return (obj === null || obj === undefined || typeof obj === 'undefined');
}
function resolveNamespaces(obj, reject) {
    if (isNull(obj)) {
        if (!isNull(reject)) {
            reject("connHandler is empty.");
        }
        return null;
    }
    let namespaces = new Map();
    // 1. if contains function instead of a string key then it's Events otherwise it's Namespaces.
    // 2. if contains a mix of functions and keys then ~put those functions to the namespaces[""]~ it is NOT valid.
    let events = new Map();
    // const isMessageHandlerFunc = (value: any): value is MessageHandlerFunc => true;
    let totalKeys = 0;
    Object.keys(obj).forEach(function (key, index) {
        totalKeys++;
        let value = obj[key];
        // if (isMessageHandlerFunc(value)) {
        if (value instanceof Function) {
            // console.log(key + " event probably contains a message handler: ", value)
            events.set(key, value);
        }
        else if (value instanceof Map) {
            // console.log(key + " is a namespace map which contains the following events: ", value)
            namespaces.set(key, value);
        }
        else {
            // it's an object, convert it to a map, it's events.
            // console.log(key + " is an object of: ", value);
            let objEvents = new Map();
            Object.keys(value).forEach(function (objKey, objIndex) {
                // console.log("set event: " + objKey + " of value: ", value[objKey])
                objEvents.set(objKey, value[objKey]);
            });
            namespaces.set(key, objEvents);
        }
    });
    if (events.size > 0) {
        if (totalKeys != events.size) {
            if (!isNull(reject)) {
                reject("all keys of connHandler should be events, mix of namespaces and event callbacks is not supported " + events.size + " vs total " + totalKeys);
            }
            return null;
        }
        namespaces.set("", events);
    }
    // console.log(namespaces);
    return namespaces;
}
function getEvents(namespaces, namespace) {
    if (namespaces.has(namespace)) {
        return namespaces.get(namespace);
    }
    return null;
}
/* The dial function returns a neffos client, a new `Conn` instance.
   First parameter is the endpoint, i.e ws://localhost:8080/echo,
   the second parameter can be any object of the form of:
   namespace: {eventName: eventHandler, eventName2: ...} or {eventName: eventHandler}.
   Example Code:
    var conn = await neffos.dial("ws://localhost:8080/echo", {
      default: { // "default" namespace.
        _OnNamespaceConnected: function (ns, msg) {
          console.log("connected to namespace: " + msg.Namespace);
        },
        _OnNamespaceDisconnect: function (ns, msg) {
          console.log("disconnected from namespace: " + msg.Namespace);
        },
        _OnRoomJoined: function (ns, msg) {
          console.log("joined to room: " + msg.Room);
        },
        _OnRoomLeft: function (ns, msg) {
          console.log("left from room: " + msg.Room);
        },
        chat: function (ns, msg) { // "chat" event.
          let prefix = "Server says: ";
          if (msg.Room !== "") {
            prefix = msg.Room + " >> ";
          }
          console.log(prefix + msg.Body);
        }
      }
    });

    var nsConn = await conn.connect("default");
    nsConn.emit("chat", "Hello from client side!");
    See https://github.com/kataras/neffos.js/tree/master/_examples for more.
*/
function dial(endpoint, connHandler, protocols) {
    if (endpoint.indexOf("ws") == -1) {
        endpoint = "ws://" + endpoint;
    }
    return new Promise((resolve, reject) => {
        if (!WebSocket) {
            reject("WebSocket is not accessible through this browser.");
        }
        let namespaces = resolveNamespaces(connHandler, reject);
        if (isNull(namespaces)) {
            return;
        }
        let ws = new WebSocket(endpoint, protocols);
        let conn = new Conn(ws, namespaces, protocols);
        ws.binaryType = "arraybuffer";
        ws.onmessage = ((evt) => {
            let err = conn.handle(evt);
            if (!isEmpty(err)) {
                reject(err);
                return;
            }
            if (conn.isAcknowledged()) {
                resolve(conn);
            }
        });
        ws.onopen = ((evt) => {
            // let b = new Uint8Array(1)
            // b[0] = 1;
            // this.conn.send(b.buffer);
            ws.send(ackBinary);
        });
        ws.onerror = ((err) => {
            conn.close();
            reject(err);
        });
    });
}
exports.dial = dial;
exports.ErrInvalidPayload = new Error("invalid payload");
exports.ErrBadNamespace = new Error("bad namespace");
exports.ErrBadRoom = new Error("bad room");
exports.ErrClosed = new Error("use of closed connection");
exports.ErrWrite = new Error("write closed");
/* The Conn class contains the websocket connection and the neffos communication functionality.
   Its `connect` will return a new `NSConn` instance, each connection can connect to one or more namespaces.
   Each `NSConn` can join to multiple rooms. */
class Conn {
    // private isConnectingProcesseses: string[]; // if elem exists then any receive of that namespace is locked until `askConnect` finished.
    constructor(conn, namespaces, protocols) {
        this.conn = conn;
        this._isAcknowledged = false;
        this.namespaces = namespaces;
        let hasEmptyNS = namespaces.has("");
        this.allowNativeMessages = hasEmptyNS && namespaces.get("").has(exports.OnNativeMessage);
        this.queue = new Array();
        this.waitingMessages = new Map();
        this.connectedNamespaces = new Map();
        // this.isConnectingProcesseses = new Array<string>();
        this.closed = false;
        this.conn.onclose = ((evt) => {
            this.close();
            return null;
        });
    }
    isAcknowledged() {
        return this._isAcknowledged;
    }
    handle(evt) {
        if (!this._isAcknowledged) {
            // if (evt.data instanceof ArrayBuffer) {
            // new Uint8Array(evt.data)
            let err = this.handleAck(evt.data);
            if (err == undefined) {
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
        let typ = data[0];
        switch (typ) {
            case ackIDBinary:
                // let id = dec.decode(data.slice(1));
                let id = data.slice(1);
                this.ID = id;
                break;
            case ackNotOKBinary:
                // let errorText = dec.decode(data.slice(1));
                let errorText = data.slice(1);
                return new Error(errorText);
            default:
                this.queue.push(data);
                return null;
        }
    }
    handleQueue() {
        if (this.queue == undefined || this.queue.length == 0) {
            return;
        }
        this.queue.forEach((item, index) => {
            this.queue.splice(index, 1);
            this.handleMessage(item);
        });
    }
    handleMessage(data) {
        let msg = deserializeMessage(data, this.allowNativeMessages);
        if (msg.isInvalid) {
            return exports.ErrInvalidPayload;
        }
        if (msg.IsNative && this.allowNativeMessages) {
            let ns = this.namespace("");
            return fireEvent(ns, msg);
        }
        if (msg.isWait()) {
            let cb = this.waitingMessages.get(msg.wait);
            if (cb != undefined) {
                cb(msg);
                return;
            }
        }
        const ns = this.namespace(msg.Namespace);
        switch (msg.Event) {
            case exports.OnNamespaceConnect:
                this.replyConnect(msg);
                break;
            case exports.OnNamespaceDisconnect:
                this.replyDisconnect(msg);
                break;
            case exports.OnRoomJoin:
                if (ns !== undefined) {
                    ns.replyRoomJoin(msg);
                    break;
                }
            case exports.OnRoomLeave:
                if (ns !== undefined) {
                    ns.replyRoomLeave(msg);
                    break;
                }
            default:
                // this.checkWaitForNamespace(msg.Namespace);
                if (ns === undefined) {
                    return exports.ErrBadNamespace;
                }
                msg.IsLocal = false;
                let err = fireEvent(ns, msg);
                if (!isEmpty(err)) {
                    // write any error back to the server.
                    msg.Err = err.message;
                    this.write(msg);
                    return err;
                }
        }
        return null;
    }
    /* The connect method returns a new connected to the specific "namespace" `NSConn` instance or an error. */
    connect(namespace) {
        return this.askConnect(namespace);
    }
    /* waitServerConnect method blocks until server manually calls the connection's `Connect`
       on the `Server#OnConnected` event. */
    waitServerConnect(namespace) {
        if (isNull(this.waitServerConnectNotifiers)) {
            this.waitServerConnectNotifiers = new Map();
        }
        return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
            this.waitServerConnectNotifiers.set(namespace, () => {
                this.waitServerConnectNotifiers.delete(namespace);
                resolve(this.namespace(namespace));
            });
        }));
    }
    /* The namespace method returns an already connected `NSConn`. */
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
        let events = getEvents(this.namespaces, msg.Namespace);
        if (isNull(events)) {
            msg.Err = exports.ErrBadNamespace.message;
            this.write(msg);
            return;
        }
        ns = new NSConn(this, msg.Namespace, events);
        this.connectedNamespaces.set(msg.Namespace, ns);
        this.writeEmptyReply(msg.wait);
        msg.Event = exports.OnNamespaceConnected;
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
        let ns = this.namespace(msg.Namespace);
        if (ns === undefined) {
            this.writeEmptyReply(msg.wait);
            return;
        }
        ns.forceLeaveAll(true);
        this.connectedNamespaces.delete(msg.Namespace);
        this.writeEmptyReply(msg.wait);
        fireEvent(ns, msg);
    }
    /* The ask method writes a message to the server and blocks until a response or an error received. */
    ask(msg) {
        return new Promise((resolve, reject) => {
            if (this.isClosed()) {
                reject(exports.ErrClosed);
                return;
            }
            msg.wait = genWait();
            this.waitingMessages.set(msg.wait, ((receive) => {
                if (receive.isError) {
                    reject(new Error(receive.Err));
                    return;
                }
                resolve(receive);
            }));
            if (!this.write(msg)) {
                reject(exports.ErrWrite);
                return;
            }
        });
    }
    // private addConnectProcess(namespace: string) {
    //     this.isConnectingProcesseses.push(namespace);
    // }
    // private removeConnectProcess(namespace: string) {
    //     let idx = this.isConnectingProcesseses.findIndex((value: string, index: number, obj) => { return value === namespace || false; });
    //     if (idx !== -1) {
    //         this.isConnectingProcesseses.splice(idx, 1);
    //     }
    // }
    askConnect(namespace) {
        return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
            let ns = this.namespace(namespace);
            if (ns !== undefined) { // it's already connected.
                resolve(ns);
                return;
            }
            let events = getEvents(this.namespaces, namespace);
            if (isNull(events)) {
                reject(exports.ErrBadNamespace);
                return;
            }
            // this.addConnectProcess(namespace);
            let connectMessage = new Message();
            connectMessage.Namespace = namespace;
            connectMessage.Event = exports.OnNamespaceConnect;
            connectMessage.IsLocal = true;
            ns = new NSConn(this, namespace, events);
            let err = fireEvent(ns, connectMessage);
            if (!isEmpty(err)) {
                // this.removeConnectProcess(namespace);
                reject(err);
                return;
            }
            try {
                yield this.ask(connectMessage);
            }
            catch (err) {
                reject(err);
                return;
            }
            this.connectedNamespaces.set(namespace, ns);
            connectMessage.Event = exports.OnNamespaceConnected;
            fireEvent(ns, connectMessage);
            resolve(ns);
        }));
    }
    askDisconnect(msg) {
        return __awaiter(this, void 0, void 0, function* () {
            let ns = this.namespace(msg.Namespace);
            if (ns === undefined) { // it's already connected.
                return exports.ErrBadNamespace;
            }
            try {
                yield this.ask(msg);
            }
            catch (err) {
                return err;
            }
            ns.forceLeaveAll(true);
            this.connectedNamespaces.delete(msg.Namespace);
            msg.IsLocal = true;
            return fireEvent(ns, msg);
        });
    }
    /* The isClosed method reports whether this connection is closed. */
    isClosed() {
        return this.closed || this.conn.readyState == this.conn.CLOSED || false;
    }
    /* The write method writes a message to the server and reports whether the connection is still available. */
    write(msg) {
        if (this.isClosed()) {
            return false;
        }
        if (!msg.isConnect() && !msg.isDisconnect()) {
            // namespace pre-write check.
            let ns = this.namespace(msg.Namespace);
            if (ns === undefined) {
                return false;
            }
            // room per-write check.
            if (!isEmpty(msg.Room) && !msg.isRoomJoin() && !msg.isRoomLeft()) {
                if (!ns.rooms.has(msg.Room)) {
                    // tried to send to a not joined room.
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
    /* The close method will force-disconnect from all connected namespaces and force-leave from all joined rooms
       and finally will terminate the underline websocket connection. After this method call the `Conn` is not usable anymore, a new `dial` call is required. */
    close() {
        if (this.closed) {
            return;
        }
        let disconnectMsg = new Message();
        disconnectMsg.Event = exports.OnNamespaceDisconnect;
        disconnectMsg.IsForced = true;
        disconnectMsg.IsLocal = true;
        this.connectedNamespaces.forEach((ns) => {
            ns.forceLeaveAll(true);
            disconnectMsg.Namespace = ns.namespace;
            fireEvent(ns, disconnectMsg);
            this.connectedNamespaces.delete(ns.namespace);
        });
        this.waitingMessages.clear();
        if (this.conn.readyState === this.conn.OPEN) {
            this.conn.close();
        }
        this.closed = true;
    }
}
exports.Conn = Conn;
//# sourceMappingURL=neffos.js.map