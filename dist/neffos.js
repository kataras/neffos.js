var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var neffos;
(function (neffos) {
    // To make it compatible to run with browser and inside nodejs
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
    /* The OnAnyEvent is the event name that it's fired, if no incoming event was registered, it's a "wilcard". */
    const OnAnyEvent = "_OnAnyEvent";
    /* The OnNativeMessage is the event name, which if registered on empty ("") namespace
       it accepts native messages(Message.Body and Message.IsNative is filled only). */
    const OnNativeMessage = "_OnNativeMessage";
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
            return this.Event == OnNamespaceConnect || false;
        }
        isDisconnect() {
            return this.Event == OnNamespaceDisconnect || false;
        }
        isRoomJoin() {
            return this.Event == OnRoomJoin || false;
        }
        isRoomLeft() {
            return this.Event == OnRoomLeft || false;
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
        msg.IsNative = (allowNativeMessages && msg.Event == OnNativeMessage) || false;
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
       emits messages with the `Message.Room` filled to the specific room. */
    class Room {
        constructor(ns, roomName) {
            this.nsConn = ns;
            this.name = roomName;
        }
        emit(event, body) {
            let msg = new Message();
            msg.Namespace = this.nsConn.namespace;
            msg.Room = this.name;
            msg.Event = event;
            msg.Body = body;
            return this.nsConn.conn.write(msg);
        }
        leave() {
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
    class NSConn {
        constructor(conn, namespace, events) {
            this.conn = conn;
            this.namespace = namespace;
            this.events = events;
            this.rooms = new Map();
        }
        emit(event, body) {
            let msg = new Message();
            msg.Namespace = this.namespace;
            msg.Event = event;
            msg.Body = body;
            return this.conn.write(msg);
        }
        ask(event, body) {
            let msg = new Message();
            msg.Namespace = this.namespace;
            msg.Event = event;
            msg.Body = body;
            return this.conn.ask(msg);
        }
        joinRoom(roomName) {
            return this.askRoomJoin(roomName);
        }
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
        leaveAll() {
            return __awaiter(this, void 0, void 0, function* () {
                let leaveMsg = new Message();
                leaveMsg.Namespace = this.namespace;
                leaveMsg.Event = OnRoomLeft;
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
        disconnect() {
            let disconnectMsg = new Message();
            disconnectMsg.Namespace = this.namespace;
            disconnectMsg.Event = OnNamespaceDisconnect;
            return this.conn.askDisconnect(disconnectMsg);
        }
        askRoomJoin(roomName) {
            return __awaiter(this, void 0, void 0, function* () {
                let room = this.rooms.get(roomName);
                if (room !== undefined) {
                    return room;
                }
                let joinMsg = new Message();
                joinMsg.Namespace = this.namespace;
                joinMsg.Room = roomName;
                joinMsg.Event = OnRoomJoin;
                joinMsg.IsLocal = true;
                try {
                    yield this.conn.ask(joinMsg);
                }
                catch (err) {
                    return err;
                }
                let err = fireEvent(this, joinMsg);
                if (!isEmpty(err)) {
                    return err;
                }
                room = new Room(this, roomName);
                this.rooms.set(roomName, room);
                joinMsg.Event = OnRoomJoined;
                fireEvent(this, joinMsg);
                return room;
            });
        }
        askRoomLeave(msg) {
            return __awaiter(this, void 0, void 0, function* () {
                if (!this.rooms.has(msg.Room)) {
                    return ErrBadRoom;
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
                msg.Event = OnRoomLeft;
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
        if (ns.events.hasOwnProperty(msg.Event)) {
            return ns.events[msg.Event](ns, msg);
        }
        if (ns.events.hasOwnProperty(OnAnyEvent)) {
            return ns.events[OnAnyEvent](ns, msg);
        }
        return null;
    }
    function getEvents(namespaces, namespace) {
        if (namespaces.hasOwnProperty(namespace)) {
            return namespaces[namespace];
        }
        return null;
    }
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
    function dial(endpoint, connHandler, protocols) {
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
    const ErrInvalidPayload = new Error("invalid payload");
    const ErrBadNamespace = new Error("bad namespace");
    const ErrBadRoom = new Error("bad room");
    const ErrClosed = new Error("use of closed connection");
    const ErrWrite = new Error("write closed");
    /* The Conn class contains the websocket connection and the neffos communication functionality.
       Its `connect` will return an `NSCOnn` instance, each connection can connect to one or more namespaces.
       Each `NSConn` can join to multiple rooms. */
    class Conn {
        // private isConnectingProcesseses: string[]; // if elem exists then any receive of that namespace is locked until `askConnect` finished.
        constructor(conn, connHandler, protocols) {
            this.conn = conn;
            this._isAcknowledged = false;
            let hasEmptyNS = connHandler.hasOwnProperty("");
            this.allowNativeMessages = hasEmptyNS && connHandler[""].hasOwnProperty(OnNativeMessage);
            this.queue = new Array();
            this.waitingMessages = new Map();
            this.namespaces = connHandler;
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
                return ErrInvalidPayload;
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
        connect(namespace) {
            return this.askConnect(namespace);
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
        /* The ask method writes a message to the server and blocks until a response or an error. */
        ask(msg) {
            return new Promise((resolve, reject) => {
                if (this.isClosed()) {
                    reject(ErrClosed);
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
        askConnect(namespace) {
            return __awaiter(this, void 0, void 0, function* () {
                let ns = this.namespace(namespace);
                if (ns !== undefined) { // it's already connected.
                    return ns;
                }
                let events = getEvents(this.namespaces, namespace);
                if (events === undefined) {
                    return ErrBadNamespace;
                }
                // this.addConnectProcess(namespace);
                let connectMessage = new Message();
                connectMessage.Namespace = namespace;
                connectMessage.Event = OnNamespaceConnect;
                connectMessage.IsLocal = true;
                ns = new NSConn(this, namespace, events);
                let err = fireEvent(ns, connectMessage);
                if (!isEmpty(err)) {
                    // this.removeConnectProcess(namespace);
                    return err;
                }
                try {
                    yield this.ask(connectMessage);
                }
                catch (err) {
                    return err;
                }
                this.connectedNamespaces.set(namespace, ns);
                connectMessage.Event = OnNamespaceConnected;
                fireEvent(ns, connectMessage);
                // this.removeConnectProcess(namespace);
                return ns;
            });
        }
        askDisconnect(msg) {
            return __awaiter(this, void 0, void 0, function* () {
                let ns = this.namespace(msg.Namespace);
                if (ns === undefined) { // it's already connected.
                    return ErrBadNamespace;
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
            if (this.conn.readyState === this.conn.OPEN) {
                this.conn.close();
            }
            this.closed = true;
        }
    }
})(neffos || (neffos = {}));
//# sourceMappingURL=neffos.js.map