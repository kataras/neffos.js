(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
/// <reference path="../../dist/neffos.d.ts" />
const neffos = require('neffos.js');

var scheme = document.location.protocol == "https:" ? "wss" : "ws";
var port = document.location.port ? ":" + document.location.port : "";

var wsURL = scheme + "://" + document.location.hostname + port + "/echo";

var outputTxt = document.getElementById("output");

async function runExample() {
  let conn = await neffos.dial(wsURL, {
    default: { // "default" namespace.
      _OnNamespaceConnected: function (ns, msg) {
        addMessage("connected to namespace: " + msg.Namespace);
      },
      _OnNamespaceDisconnect: function (ns, msg) {
        addMessage("disconnected from namespace: " + msg.Namespace);
      },
      _OnRoomJoined: function (ns, msg) {
        addMessage("joined to room: " + msg.Room);
      },
      _OnRoomLeft: function (ns, msg) {
        addMessage("left from room: " + msg.Room);
      },
      chat: function (ns, msg) { // "chat" event.
        let prefix = "";

        if (msg.Room !== "") {
          prefix = msg.Room + " >> ";
        }
        addMessage(prefix + msg.Body);
      }
    }
  });

  try {
    let nsConn = await conn.connect("default");
    let joinedRoom = "";
    let exampleRoomName = "room1";

    let inputTxt = document.getElementById("input");
    let sendBtn = document.getElementById("sendBtn");

    sendBtn.disabled = false;
    sendBtn.onclick = function () {
      const input = inputTxt.value;
      inputTxt.value = "";

      switch (input) {
        case "join":
          nsConn.joinRoom(exampleRoomName).then((room) => {
            room.emit("chat", "I just joined.");
            joinedRoom = exampleRoomName;
          });
          break;
        case "leave":
          if (joinedRoom.length > 0) {
            nsConn.room(exampleRoomName).leave();
            joinedRoom = "";
          }
          break;
        default:
          if (joinedRoom.length > 0) {
            nsConn.room(exampleRoomName).emit("chat", input);
          } else {
            nsConn.emit("chat", input);
          }

          addMessage("Me: " + input);
      }
    };
  } catch (err) {
    console.error(err);
  }
}

runExample();
// OR:
// neffos.dial(wsURL, {
//   default: {
//     _OnNamespaceConnected: function(c, msg) {
//       console.info("connected to ", msg.Namespace);
//     },
//     _OnNamespaceDisconnect: function(c, msg) {
//       console.info("disconnected from ", msg.Namespace);
//     },
//     chat: function(c, msg) {
//       console.info("on chat: " + msg.Body);
//     }
//   }
// })
//   .then(function(conn) {
//     let nsConn = conn.connect("default");
//     [...]
//   })
//   .catch(function(err) {
//     console.error("WebSocket error observed:", err);
//   });

function addMessage(msg) {
  outputTxt.innerHTML += msg + "\n";
}
},{"neffos.js":3}],2:[function(require,module,exports){
// shim for using process in browser
var process = module.exports = {};

// cached from whatever global is present so that test runners that stub it
// don't break things.  But we need to wrap it in a try catch in case it is
// wrapped in strict mode code which doesn't define any globals.  It's inside a
// function because try/catches deoptimize in certain engines.

var cachedSetTimeout;
var cachedClearTimeout;

function defaultSetTimout() {
    throw new Error('setTimeout has not been defined');
}
function defaultClearTimeout () {
    throw new Error('clearTimeout has not been defined');
}
(function () {
    try {
        if (typeof setTimeout === 'function') {
            cachedSetTimeout = setTimeout;
        } else {
            cachedSetTimeout = defaultSetTimout;
        }
    } catch (e) {
        cachedSetTimeout = defaultSetTimout;
    }
    try {
        if (typeof clearTimeout === 'function') {
            cachedClearTimeout = clearTimeout;
        } else {
            cachedClearTimeout = defaultClearTimeout;
        }
    } catch (e) {
        cachedClearTimeout = defaultClearTimeout;
    }
} ())
function runTimeout(fun) {
    if (cachedSetTimeout === setTimeout) {
        //normal enviroments in sane situations
        return setTimeout(fun, 0);
    }
    // if setTimeout wasn't available but was latter defined
    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
        cachedSetTimeout = setTimeout;
        return setTimeout(fun, 0);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedSetTimeout(fun, 0);
    } catch(e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
            return cachedSetTimeout.call(null, fun, 0);
        } catch(e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
            return cachedSetTimeout.call(this, fun, 0);
        }
    }


}
function runClearTimeout(marker) {
    if (cachedClearTimeout === clearTimeout) {
        //normal enviroments in sane situations
        return clearTimeout(marker);
    }
    // if clearTimeout wasn't available but was latter defined
    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
        cachedClearTimeout = clearTimeout;
        return clearTimeout(marker);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedClearTimeout(marker);
    } catch (e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
            return cachedClearTimeout.call(null, marker);
        } catch (e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
            return cachedClearTimeout.call(this, marker);
        }
    }



}
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = runTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    runClearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        runTimeout(drainQueue);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;
process.prependListener = noop;
process.prependOnceListener = noop;

process.listeners = function (name) { return [] }

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],3:[function(require,module,exports){
(function (process){
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
    /* The leave method sends a room leave signal to the server and if succeed it fires the `OnRoomLeave` and `OnRoomLeft` events. */
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
    /* The leaveAll method sends a leave room signal to all rooms and fires the `OnRoomLeave` and `OnRoomLeft` (if no error caused) events. */
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
    if (ns.events.hasOwnProperty(msg.Event)) {
        return ns.events[msg.Event](ns, msg);
    }
    if (ns.events.hasOwnProperty(exports.OnAnyEvent)) {
        return ns.events[exports.OnAnyEvent](ns, msg);
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
exports.dial = dial;
exports.ErrInvalidPayload = new Error("invalid payload");
exports.ErrBadNamespace = new Error("bad namespace");
exports.ErrBadRoom = new Error("bad room");
exports.ErrClosed = new Error("use of closed connection");
exports.ErrWrite = new Error("write closed");
/* The Conn class contains the websocket connection and the neffos communication functionality.
   Its `connect` will return an `NSCOnn` instance, each connection can connect to one or more namespaces.
   Each `NSConn` can join to multiple rooms. */
class Conn {
    // private isConnectingProcesseses: string[]; // if elem exists then any receive of that namespace is locked until `askConnect` finished.
    constructor(conn, connHandler, protocols) {
        this.conn = conn;
        this._isAcknowledged = false;
        let hasEmptyNS = connHandler.hasOwnProperty("");
        this.allowNativeMessages = hasEmptyNS && connHandler[""].hasOwnProperty(exports.OnNativeMessage);
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
            msg.Err = exports.ErrBadNamespace.message;
            this.write(msg);
            return;
        }
        ns = new NSConn(this, msg.Namespace, events);
        this.connectedNamespaces.set(msg.Namespace, ns);
        this.writeEmptyReply(msg.wait);
        msg.Event = exports.OnNamespaceConnected;
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
            if (events === undefined) {
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

}).call(this,require('_process'))
},{"_process":2,"ws":4}],4:[function(require,module,exports){
'use strict';

module.exports = function() {
  throw new Error(
    'ws does not work in the browser. Browser clients must use the native ' +
      'WebSocket object'
  );
};

},{}]},{},[1]);
