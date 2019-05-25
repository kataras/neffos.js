// Make it compatible to run with browser and inside nodejs
// the good thing is that the node's WebSocket module has the same API as the browser's one,
// so all works and minimum changes were required to achieve that result.
// See the `genWait()` too.
const isBrowser = (typeof window !== 'undefined')
var WebSocket;
if (!isBrowser) {
    WebSocket = require('ws');
} else {
    WebSocket = window["WebSocket"];
}
//

/* The WSData is just a string type alias. */
export type WSData = string;
/* The OnNamespaceConnect is the event name that it's fired on before namespace connect. */
export const OnNamespaceConnect = "_OnNamespaceConnect";
/* The OnNamespaceConnected is the event name that it's fired on after namespace connect. */
export const OnNamespaceConnected = "_OnNamespaceConnected";
/* The OnNamespaceDisconnect is the event name that it's fired on namespace disconnected. */
export const OnNamespaceDisconnect = "_OnNamespaceDisconnect";
/* The OnRoomJoin is the event name that it's fired on before room join. */
export const OnRoomJoin = "_OnRoomJoin";
/* The OnRoomJoined is the event name that it's fired on after room join. */
export const OnRoomJoined = "_OnRoomJoined";
/* The OnRoomLeave is the event name that it's fired on before room leave. */
export const OnRoomLeave = "_OnRoomLeave";
/* The OnRoomLeft is the event name that it's fired on after room leave. */
export const OnRoomLeft = "_OnRoomLeft";
/* The OnAnyEvent is the event name that it's fired, if no incoming event was registered, it's a "wilcard". */
export const OnAnyEvent = "_OnAnyEvent";
/* The OnNativeMessage is the event name, which if registered on empty ("") namespace
   it accepts native messages(Message.Body and Message.IsNative is filled only). */
export const OnNativeMessage = "_OnNativeMessage";

const ackBinary = 'M'; // see `onopen`, comes from client to server at startup.
// see `handleAck`.
const ackIDBinary = 'A';// comes from server to client after ackBinary and ready as a prefix, the rest message is the conn's ID.
const ackNotOKBinary = 'H'; // comes from server to client if `Server#OnConnected` errored as a prefix, the rest message is the error text.

const waitIsConfirmationPrefix = '#';
const waitComesFromClientPrefix = '$';
/* The isSystemEvent reports whether the "event" is a system event;
   connect, connected, disconnect, room join, room joined, room leave, room left. */
export function isSystemEvent(event: string): boolean {
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

function isEmpty(s: any): boolean {
    if (s === undefined) {
        return true
    }

    if (s === null) {
        return true
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
export class Message {
    wait: string;
    /* The Namespace that this message sent to. */
    Namespace: string;
    /* The Room that this message sent to. */
    Room: string;
    /* The Event that this message sent to. */
    Event: string;
    /* The actual body of the incoming data. */
    Body: WSData;
    /* The Err contains any message's error if defined and not empty.
       server-side and client-side can return an error instead of a message from inside event callbacks. */
    Err: string;

    isError: boolean;
    isNoOp: boolean;

    isInvalid: boolean;
    /* The IsForced if true then it means that this is not an incoming action but a force action.
       For example when websocket connection lost from remote the OnNamespaceDisconnect `Message.IsForced` will be true */
    IsForced: boolean;
    /* The IsLocal reprots whether an event is sent by the client-side itself, i.e when `connect` call on `OnNamespaceConnect` event the `Message.IsLocal` will be true,
       server-side can force-connect a client to connect to a namespace as well in this case the `IsLocal` will be false. */
    IsLocal: boolean;
    /* The IsNative reports whether the Message is websocket native messages, only Body is filled. */
    IsNative: boolean;

    isConnect(): boolean {
        return this.Event == OnNamespaceConnect || false;
    }

    isDisconnect(): boolean {
        return this.Event == OnNamespaceDisconnect || false;
    }


    isRoomJoin(): boolean {
        return this.Event == OnRoomJoin || false;
    }


    isRoomLeft(): boolean {
        return this.Event == OnRoomLeft || false;
    }

    isWait(): boolean {
        if (isEmpty(this.wait)) {
            return false;
        }

        if (this.wait[0] == waitIsConfirmationPrefix) {
            return true
        }

        return this.wait[0] == waitComesFromClientPrefix || false;
    }
}


const messageSeparator = ';';
const validMessageSepCount = 7;

const trueString = "1";
const falseString = "0";

function serializeMessage(msg: Message): WSData {
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
        isNoOpString = trueString
    }

    return [
        msg.wait || "",
        msg.Namespace,
        msg.Room || "",
        msg.Event || "",
        isErrorString,
        isNoOpString,
        body].join(messageSeparator);
}

// <wait>;
// <namespace>;
// <room>;
// <event>;
// <isError(0-1)>;
// <isNoOp(0-1)>;
// <body||error_message>
function deserializeMessage(data: WSData, allowNativeMessages: boolean): Message {
    var msg: Message = new Message();
    if (data.length == 0) {
        msg.isInvalid = true;
        return msg;
    }

    let dts = data.split(messageSeparator, validMessageSepCount);
    if (dts.length != validMessageSepCount) {
        if (!allowNativeMessages) {
            msg.isInvalid = true;
        } else {
            msg.Event = OnNativeMessage;
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
        } else {
            msg.Body = body;
        }
    } else {
        msg.Body = "";
    }

    msg.isInvalid = false;
    msg.IsForced = false;
    msg.IsLocal = false;
    msg.IsNative = (allowNativeMessages && msg.Event == OnNativeMessage) || false;
    // msg.SetBinary = false;
    return msg;
}

function genWait(): string {
    if (!isBrowser) {
        let hrTime = process.hrtime();
        return waitComesFromClientPrefix + hrTime[0] * 1000000000 + hrTime[1];
    } else {
        let now = window.performance.now();
        return waitComesFromClientPrefix + now.toString();
    }
}

function genWaitConfirmation(wait: string): string {
    return waitIsConfirmationPrefix + wait;
}

function genEmptyReplyToWait(wait: string): string {
    return wait + messageSeparator.repeat(validMessageSepCount - 1);
}

/* The Room describes a connected connection to a room,
   emits messages with the `Message.Room` filled to the specific room
   and `Message.Namespace` to the underline `NSConn`'s namespace. */
export class Room {
    nsConn: NSConn;
    name: string;


    constructor(ns: NSConn, roomName: string) {
        this.nsConn = ns;
        this.name = roomName;
    }

    /* The emit method sends a message to the server with its `Message.Room` filled to this specific room
       and `Message.Namespace` to the underline `NSConn`'s namespace. */
    emit(event: string, body: WSData): boolean {
        let msg = new Message();
        msg.Namespace = this.nsConn.namespace;
        msg.Room = this.name;
        msg.Event = event;
        msg.Body = body;
        return this.nsConn.conn.write(msg);
    }

    /* The leave method sends a local and server room leave signal `OnRoomLeave`
       and if succeed it fires the OnRoomLeft` event. */
    leave(): Promise<Error> {
        let msg = new Message();
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
export class NSConn {
    /* The conn property refers to the main `Conn` constructed by the `dial` function. */
    conn: Conn;
    namespace: string;
    events: Events;
    /* The rooms property its the map of the connected namespace's joined rooms. */
    rooms: Map<string, Room>;

    constructor(conn: Conn, namespace: string, events: Events) {
        this.conn = conn;
        this.namespace = namespace;
        this.events = events;
        this.rooms = new Map<string, Room>();
    }

    /* The emit method sends a message to the server with its `Message.Namespace` filled to this specific namespace. */
    emit(event: string, body: WSData): boolean {
        let msg = new Message();
        msg.Namespace = this.namespace;
        msg.Event = event;
        msg.Body = body;
        return this.conn.write(msg);
    }

    /* See `Conn.ask`. */
    ask(event: string, body: WSData): Promise<Message> {
        let msg = new Message();
        msg.Namespace = this.namespace;
        msg.Event = event;
        msg.Body = body;
        return this.conn.ask(msg);
    }
    /* The joinRoom method can be used to join to a specific room, rooms are dynamic.
       Returns a `Room` or an error. */
    async joinRoom(roomName: string): Promise<Room> {
        return await this.askRoomJoin(roomName);
    }

    /* The room method returns a joined `Room`. */
    room(roomName: string): Room {
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
    async leaveAll(): Promise<Error> {
        let leaveMsg = new Message();
        leaveMsg.Namespace = this.namespace;
        leaveMsg.Event = OnRoomLeft;
        leaveMsg.IsLocal = true;

        this.rooms.forEach(async (value, roomName) => {
            leaveMsg.Room = roomName;
            try {
                await this.askRoomLeave(leaveMsg);
            } catch (err) {
                return err
            }
        })

        return null;
    }

    forceLeaveAll(isLocal: boolean) {
        let leaveMsg = new Message();
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

    /* The disconnect method sends a disconnect signal to the server and fires the `OnNamespaceDisconnect` event. */
    disconnect(): Promise<Error> {
        let disconnectMsg = new Message();
        disconnectMsg.Namespace = this.namespace;
        disconnectMsg.Event = OnNamespaceDisconnect;
        return this.conn.askDisconnect(disconnectMsg);
    }


    askRoomJoin(roomName: string): Promise<Room> {
        return new Promise(async (resolve, reject) => {
            let room = this.rooms.get(roomName);
            if (room !== undefined) {
                resolve(room);
                return;
            }

            let joinMsg = new Message();
            joinMsg.Namespace = this.namespace;
            joinMsg.Room = roomName;
            joinMsg.Event = OnRoomJoin;
            joinMsg.IsLocal = true;

            try {
                await this.conn.ask(joinMsg);
            } catch (err) {
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

            joinMsg.Event = OnRoomJoined;
            fireEvent(this, joinMsg);
            resolve(room);
        });
    }

    async askRoomLeave(msg: Message): Promise<Error> {
        if (!this.rooms.has(msg.Room)) {
            return ErrBadRoom;
        }

        try {
            await this.conn.ask(msg)
        } catch (err) {
            return err;
        }

        let err = fireEvent(this, msg);
        if (!isEmpty(err)) {
            return err;
        }

        this.rooms.delete(msg.Room);

        msg.Event = OnRoomLeft;
        fireEvent(this, msg);
        return null;
    }

    replyRoomJoin(msg: Message): void {
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

            msg.Event = OnRoomJoined;
            fireEvent(this, msg);
        }

        this.conn.writeEmptyReply(msg.wait);
    }

    replyRoomLeave(msg: Message): void {
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


/* The MessageHandlerFunc is the definition type of the events' callback.
   Its error can be written to the other side on specific events,
   i.e on `OnNamespaceConnect` it will abort a remote namespace connection.
   See examples for more. */
export type MessageHandlerFunc = (c: NSConn, msg: Message) => Error;

// type Namespaces = Map<string, Events>;
// type Events = Map<string, MessageHandlerFunc>;


export interface Events {
    [key: string]: MessageHandlerFunc;
}

function fireEvent(ns: NSConn, msg: Message): Error {
    if (ns.events.hasOwnProperty(msg.Event)) {
        return ns.events[msg.Event](ns, msg);
    }

    if (ns.events.hasOwnProperty(OnAnyEvent)) {
        return ns.events[OnAnyEvent](ns, msg);
    }

    return null;
}

export interface Namespaces {
    [key: string]: Events;
}

function getEvents(namespaces: Namespaces, namespace: string): Events {
    if (namespaces.hasOwnProperty(namespace)) {
        return namespaces[namespace];
    }

    return null;
}

type waitingMessageFunc = (msg: Message) => void;

/* The dial function returns a neffos client, a new `Conn` instance.
   First parameter is the endpoint, i.e ws://localhost:8080/echo,
   the second parameter should be the Namespaces structure.
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
export function dial(endpoint: string, connHandler: Namespaces, protocols?: string[]): Promise<Conn> {
    if (endpoint.indexOf("ws") == -1) {
        endpoint = "ws://" + endpoint;
    }

    return new Promise((resolve, reject) => {
        if (!WebSocket) {
            reject("WebSocket is not accessible through this browser.");
        }


        if (connHandler === undefined) {
            reject("connHandler is empty.");
        }

        let ws = new WebSocket(endpoint, protocols);
        let conn = new Conn(ws, connHandler, protocols);
        ws.binaryType = "arraybuffer";
        ws.onmessage = ((evt: MessageEvent) => {
            let err = conn.handle(evt);
            if (!isEmpty(err)) {
                reject(err);
                return;
            }

            if (conn.isAcknowledged()) {
                resolve(conn);
            }
        });
        ws.onopen = ((evt: Event) => {
            // let b = new Uint8Array(1)
            // b[0] = 1;
            // this.conn.send(b.buffer);
            ws.send(ackBinary);
        });
        ws.onerror = ((err: Event) => {
            conn.close();
            reject(err);
        });
    });
}

export const ErrInvalidPayload = new Error("invalid payload");
export const ErrBadNamespace = new Error("bad namespace");
export const ErrBadRoom = new Error("bad room");
export const ErrClosed = new Error("use of closed connection");
export const ErrWrite = new Error("write closed");

/* The Conn class contains the websocket connection and the neffos communication functionality.
   Its `connect` will return a new `NSConn` instance, each connection can connect to one or more namespaces.
   Each `NSConn` can join to multiple rooms. */
export class Conn {
    private conn: WebSocket;

    private _isAcknowledged: boolean;
    private allowNativeMessages: boolean;
    /* ID is the generated connection ID from the server-side, all connected namespaces(`NSConn` instances)
      that belong to that connection have the same ID. It is available immediately after the `dial`. */
    ID: string;
    closed: boolean;

    private queue: WSData[];
    private waitingMessages: Map<string, waitingMessageFunc>;
    private namespaces: Namespaces;
    private connectedNamespaces: Map<string, NSConn>;
    // private isConnectingProcesseses: string[]; // if elem exists then any receive of that namespace is locked until `askConnect` finished.

    constructor(conn: WebSocket, connHandler: Namespaces, protocols?: string[]) {
        this.conn = conn;
        this._isAcknowledged = false;
        let hasEmptyNS = connHandler.hasOwnProperty("");
        this.allowNativeMessages = hasEmptyNS && connHandler[""].hasOwnProperty(OnNativeMessage);
        this.queue = new Array<string>();
        this.waitingMessages = new Map<string, waitingMessageFunc>();
        this.namespaces = connHandler;
        this.connectedNamespaces = new Map<string, NSConn>();
        // this.isConnectingProcesseses = new Array<string>();
        this.closed = false;

        this.conn.onclose = ((evt: Event): any => {
            this.close();
            return null;
        });
    }

    isAcknowledged(): boolean {
        return this._isAcknowledged;
    }

    handle(evt: MessageEvent): Error {
        if (!this._isAcknowledged) {
            // if (evt.data instanceof ArrayBuffer) {
            // new Uint8Array(evt.data)
            let err = this.handleAck(evt.data);
            if (err == undefined) {
                this._isAcknowledged = true
                this.handleQueue();
            } else {
                this.conn.close();
            }
            return err;
        }

        return this.handleMessage(evt.data);
    }

    private handleAck(data: WSData): Error {
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

    private handleQueue(): void {
        if (this.queue == undefined || this.queue.length == 0) {
            return;
        }

        this.queue.forEach((item, index) => {
            this.queue.splice(index, 1);
            this.handleMessage(item);
        });
    }

    private handleMessage(data: WSData): Error {
        let msg = deserializeMessage(data, this.allowNativeMessages)
        if (msg.isInvalid) {
            return ErrInvalidPayload
        }

        if (msg.IsNative && this.allowNativeMessages) {
            let ns = this.namespace("")
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
            case OnNamespaceConnect:
                this.replyConnect(msg);
                break;
            case OnNamespaceDisconnect:
                this.replyDisconnect(msg);
                break;
            case OnRoomJoin:
                if (ns !== undefined) {
                    ns.replyRoomJoin(msg);
                    break;
                }
            case OnRoomLeave:
                if (ns !== undefined) {
                    ns.replyRoomLeave(msg);
                    break;
                }
            default:
                // this.checkWaitForNamespace(msg.Namespace);
                if (ns === undefined) {
                    return ErrBadNamespace;
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
    connect(namespace: string): Promise<NSConn> {
        return this.askConnect(namespace);
    }

    /* The namespace method returns an already connected `NSConn`. */
    namespace(namespace: string): NSConn {
        return this.connectedNamespaces.get(namespace)
    }

    private replyConnect(msg: Message): void {
        if (isEmpty(msg.wait) || msg.isNoOp) {
            return;
        }

        let ns = this.namespace(msg.Namespace);
        if (ns !== undefined) {
            this.writeEmptyReply(msg.wait);
            return;
        }

        let events = getEvents(this.namespaces, msg.Namespace)
        if (events === undefined) {
            msg.Err = ErrBadNamespace.message;
            this.write(msg);
            return;
        }

        ns = new NSConn(this, msg.Namespace, events);

        this.connectedNamespaces.set(msg.Namespace, ns);
        this.writeEmptyReply(msg.wait);

        msg.Event = OnNamespaceConnected;
        fireEvent(ns, msg);
    }

    private replyDisconnect(msg: Message): void {
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
    ask(msg: Message): Promise<Message> {
        return new Promise((resolve, reject) => {
            if (this.isClosed()) {
                reject(ErrClosed);
                return;
            }

            msg.wait = genWait();


            this.waitingMessages.set(msg.wait, ((receive: Message): void => {
                if (receive.isError) {
                    reject(new Error(receive.Err));
                    return;
                }
                resolve(receive);
            }));

            if (!this.write(msg)) {
                reject(ErrWrite);
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

    private askConnect(namespace: string): Promise<NSConn> {
        return new Promise(async (resolve, reject) => {
            let ns = this.namespace(namespace);
            if (ns !== undefined) { // it's already connected.
                resolve(ns);
                return;
            }

            let events = getEvents(this.namespaces, namespace);
            if (events === undefined) {
                reject(ErrBadNamespace);
                return;
            }

            // this.addConnectProcess(namespace);
            let connectMessage = new Message()
            connectMessage.Namespace = namespace;
            connectMessage.Event = OnNamespaceConnect;
            connectMessage.IsLocal = true;

            ns = new NSConn(this, namespace, events);
            let err = fireEvent(ns, connectMessage);
            if (!isEmpty(err)) {
                // this.removeConnectProcess(namespace);
                reject(err);
                return;
            }

            try {
                await this.ask(connectMessage);
            } catch (err) {
                reject(err);
                return;
            }

            this.connectedNamespaces.set(namespace, ns);

            connectMessage.Event = OnNamespaceConnected;
            fireEvent(ns, connectMessage);
            resolve(ns);
        });
    }

    async askDisconnect(msg: Message): Promise<Error> {
        let ns = this.namespace(msg.Namespace);
        if (ns === undefined) { // it's already connected.
            return ErrBadNamespace;
        }

        try {
            await this.ask(msg);
        } catch (err) {
            return err
        }

        ns.forceLeaveAll(true);

        this.connectedNamespaces.delete(msg.Namespace);

        msg.IsLocal = true
        return fireEvent(ns, msg);
    }

    /* The isClosed method reports whether this connection is closed. */
    isClosed(): boolean {
        return this.closed || this.conn.readyState == this.conn.CLOSED || false;
    }

    /* The write method writes a message to the server and reports whether the connection is still available. */
    write(msg: Message): boolean {
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

    writeEmptyReply(wait: string): void {
        this.conn.send(genEmptyReplyToWait(wait));
    }

    /* The close method will force-disconnect from all connected namespaces and force-leave from all joined rooms
       and finally will terminate the underline websocket connection. After this method call the `Conn` is not usable anymore, a new `dial` call is required. */
    close(): void {
        if (this.closed) {
            return;
        }

        let disconnectMsg = new Message();
        disconnectMsg.Event = OnNamespaceDisconnect;
        disconnectMsg.IsForced = true;
        disconnectMsg.IsLocal = true;

        this.connectedNamespaces.forEach((ns) => {
            ns.forceLeaveAll(true);

            disconnectMsg.Namespace = ns.namespace;
            fireEvent(ns, disconnectMsg);
            this.connectedNamespaces.delete(ns.namespace);
        })

        this.waitingMessages.clear();

        if (this.conn.readyState === this.conn.OPEN) {
            this.conn.close();
        }

        this.closed = true;
    }
}