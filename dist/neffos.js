var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
// Make it compatible to run with browser and inside nodejs
// the good thing is that the node's WebSocket module has the same API as the browser's one,
// so all works and minimum changes were required to achieve that result.
// See the `genWait()` too.
var isBrowser = (typeof window !== 'undefined');
var _fetch = (typeof fetch !== 'undefined') ? fetch : undefined;
if (!isBrowser) {
    WebSocket = require('ws');
    _fetch = require('node-fetch');
    TextDecoder = require('@sinonjs/text-encoding').TextDecoder;
    TextEncoder = require('@sinonjs/text-encoding').TextEncoder;
}
else {
    WebSocket = window["WebSocket"];
}
/* The OnNamespaceConnect is the event name that it's fired on before namespace connect. */
var OnNamespaceConnect = "_OnNamespaceConnect";
/* The OnNamespaceConnected is the event name that it's fired on after namespace connect. */
var OnNamespaceConnected = "_OnNamespaceConnected";
/* The OnNamespaceDisconnect is the event name that it's fired on namespace disconnected. */
var OnNamespaceDisconnect = "_OnNamespaceDisconnect";
/* The OnRoomJoin is the event name that it's fired on before room join. */
var OnRoomJoin = "_OnRoomJoin";
/* The OnRoomJoined is the event name that it's fired on after room join. */
var OnRoomJoined = "_OnRoomJoined";
/* The OnRoomLeave is the event name that it's fired on before room leave. */
var OnRoomLeave = "_OnRoomLeave";
/* The OnRoomLeft is the event name that it's fired on after room leave. */
var OnRoomLeft = "_OnRoomLeft";
/* The OnAnyEvent is the event name that it's fired, if no incoming event was registered, it's a "wilcard". */
var OnAnyEvent = "_OnAnyEvent";
/* The OnNativeMessage is the event name, which if registered on empty ("") namespace
   it accepts native messages(Message.Body and Message.IsNative is filled only). */
var OnNativeMessage = "_OnNativeMessage";
var ackBinary = 'M'; // see `onopen`, comes from client to server at startup.
// see `handleAck`.
var ackIDBinary = 'A'; // comes from server to client after ackBinary and ready as a prefix, the rest message is the conn's ID.
var ackNotOKBinary = 'H'; // comes from server to client if `Server#OnConnected` errored as a prefix, the rest message is the error text.
var waitIsConfirmationPrefix = '#';
var waitComesFromClientPrefix = '$';
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
    if (s == "" || typeof s === 'string' || s instanceof String) {
        return s.length === 0 || s === "";
    }
    if (s instanceof Error) {
        return isEmpty(s.message);
    }
    return false;
}
/* The Message is the structure which describes the icoming data (and if `Conn.Write` is manually used to write). */
var Message = /** @class */ (function () {
    function Message() {
    }
    Message.prototype.isConnect = function () {
        return this.Event == OnNamespaceConnect || false;
    };
    Message.prototype.isDisconnect = function () {
        return this.Event == OnNamespaceDisconnect || false;
    };
    Message.prototype.isRoomJoin = function () {
        return this.Event == OnRoomJoin || false;
    };
    Message.prototype.isRoomLeft = function () {
        return this.Event == OnRoomLeft || false;
    };
    Message.prototype.isWait = function () {
        if (isEmpty(this.wait)) {
            return false;
        }
        if (this.wait[0] == waitIsConfirmationPrefix) {
            return true;
        }
        return this.wait[0] == waitComesFromClientPrefix || false;
    };
    /* unmarshal method returns this Message's `Body` as an object,
       equivalent to the Go's `neffos.Message.Unmarshal` method.
       It can be used inside an event's callbacks.
       See library-level `marshal` function too. */
    Message.prototype.unmarshal = function () {
        return JSON.parse(this.Body);
    };
    return Message;
}());
/* marshal takes an object and returns its serialized to string form, equivalent to the Go's `neffos.Marshal`.
   It can be used on `emit` methods.
   See `Message.unmarshal` method too. */
function marshal(obj) {
    return JSON.stringify(obj);
}
/* Obsiously, the below should match the server's side. */
var messageSeparator = ';';
var messageFieldSeparatorReplacement = "@%!semicolon@%!";
var validMessageSepCount = 7;
var trueString = "1";
var falseString = "0";
var escapeRegExp = new RegExp(messageSeparator, "g");
function escapeMessageField(s) {
    if (isEmpty(s)) {
        return "";
    }
    return s.replace(escapeRegExp, messageFieldSeparatorReplacement);
}
var unescapeRegExp = new RegExp(messageFieldSeparatorReplacement, "g");
function unescapeMessageField(s) {
    if (isEmpty(s)) {
        return "";
    }
    return s.replace(unescapeRegExp, messageSeparator);
}
var replyError = /** @class */ (function (_super) {
    __extends(replyError, _super);
    function replyError(message) {
        var _this = _super.call(this, message) || this;
        _this.name = 'replyError';
        Error.captureStackTrace(_this, replyError);
        // Set the prototype explicitly,
        // see `isReply`'s comments for more information.
        Object.setPrototypeOf(_this, replyError.prototype);
        return _this;
    }
    return replyError;
}(Error));
/* reply function is a helper for nsConn.Emit(incomignMsg.Event, newBody)
   it can be used as a return value of any MessageHandlerFunc. */
function reply(body) {
    return new replyError(body);
}
function isReply(err) {
    // unfortunately this doesn't work like normal ES6,
    // typescript has an issue:
    // https://github.com/Microsoft/TypeScript/issues/22585
    // https://github.com/Microsoft/TypeScript/issues/13965
    // hack but doesn't work on IE 10 and prior, we can adapt it
    // because the library itself is designed for modern browsers instead.
    //
    // https://github.com/Microsoft/TypeScript/wiki/FAQ#why-doesnt-extending-built-ins-like-error-array-and-map-work
    return (err instanceof replyError);
}
var textEncoder = new TextEncoder();
var textDecoder = new TextDecoder("utf-8");
var messageSeparatorCharCode = messageSeparator.charCodeAt(0);
function serializeMessage(msg) {
    if (msg.IsNative && isEmpty(msg.wait)) {
        return msg.Body;
    }
    var isErrorString = falseString;
    var isNoOpString = falseString;
    var body = msg.Body || "";
    if (!isEmpty(msg.Err)) {
        body = msg.Err.message;
        if (!isReply(msg.Err)) {
            isErrorString = trueString;
        }
    }
    if (msg.isNoOp) {
        isNoOpString = trueString;
    }
    var data = [
        msg.wait || "",
        escapeMessageField(msg.Namespace),
        escapeMessageField(msg.Room),
        escapeMessageField(msg.Event),
        isErrorString,
        isNoOpString,
        "" // body
    ].join(messageSeparator);
    if (msg.SetBinary) {
        // body is already in the form we need,
        // so:
        var b = textEncoder.encode(data);
        data = new Uint8Array(b.length + body.length);
        data.set(b, 0);
        data.set(body, b.length);
    }
    else {
        // If not specified to send as binary message,
        // then don't send as binary.
        if (body instanceof Uint8Array) {
            body = textDecoder.decode(body, { stream: false });
        }
        data += body;
    }
    return data;
}
// behaves like Go's SplitN, default javascript's does not return the remainder and we need this for the dts[6]
function splitN(s, sep, limit) {
    if (limit == 0)
        return [s];
    var arr = s.split(sep, limit);
    if (arr.length == limit) {
        var curr = arr.join(sep) + sep;
        arr.push(s.substr(curr.length));
        return arr;
    }
    else {
        return [s];
    }
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
    var isArrayBuffer = data instanceof ArrayBuffer;
    var dts;
    if (isArrayBuffer) {
        var arr = new Uint8Array(data);
        var sepCount = 1;
        var lastSepIndex = 0;
        for (var i = 0; i < arr.length; i++) {
            if (arr[i] == messageSeparatorCharCode) { // sep char.
                sepCount++;
                lastSepIndex = i;
                if (sepCount == validMessageSepCount) {
                    break;
                }
            }
        }
        if (sepCount != validMessageSepCount) {
            msg.isInvalid = true;
            return msg;
        }
        dts = splitN(textDecoder.decode(arr.slice(0, lastSepIndex), { stream: false }), messageSeparator, validMessageSepCount - 2);
        dts.push(data.slice(lastSepIndex + 1, data.length));
        msg.SetBinary = true;
    }
    else {
        dts = splitN(data, messageSeparator, validMessageSepCount - 1);
    }
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
    msg.Namespace = unescapeMessageField(dts[1]);
    msg.Room = unescapeMessageField(dts[2]);
    msg.Event = unescapeMessageField(dts[3]);
    msg.isError = dts[4] == trueString || false;
    msg.isNoOp = dts[5] == trueString || false;
    var body = dts[6];
    if (!isEmpty(body)) {
        if (msg.isError) {
            msg.Err = new Error(body);
        }
        else {
            msg.Body = body;
        }
    }
    else {
        // if (isArrayBuffer) {
        //     msg.Body = new ArrayBuffer(0);
        // }
        msg.Body = "";
    }
    msg.isInvalid = false;
    msg.IsForced = false;
    msg.IsLocal = false;
    msg.IsNative = (allowNativeMessages && msg.Event == OnNativeMessage) || false;
    return msg;
}
function genWait() {
    if (!isBrowser) {
        var hrTime = process.hrtime();
        return waitComesFromClientPrefix + hrTime[0] * 1000000000 + hrTime[1];
    }
    else {
        var now = window.performance.now();
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
var Room = /** @class */ (function () {
    function Room(ns, roomName) {
        this.nsConn = ns;
        this.name = roomName;
    }
    /* The emit method sends a message to the server with its `Message.Room` filled to this specific room
       and `Message.Namespace` to the underline `NSConn`'s namespace. */
    Room.prototype.emit = function (event, body) {
        var msg = new Message();
        msg.Namespace = this.nsConn.namespace;
        msg.Room = this.name;
        msg.Event = event;
        msg.Body = body;
        return this.nsConn.conn.write(msg);
    };
    /* The leave method sends a local and server room leave signal `OnRoomLeave`
       and if succeed it fires the OnRoomLeft` event. */
    Room.prototype.leave = function () {
        var msg = new Message();
        msg.Namespace = this.nsConn.namespace;
        msg.Room = this.name;
        msg.Event = OnRoomLeave;
        return this.nsConn.askRoomLeave(msg);
    };
    return Room;
}());
/* The NSConn describes a connected connection to a specific namespace,
   it emits with the `Message.Namespace` filled and it can join to multiple rooms.
   A single Conn can be connected to one or more namespaces,
   each connected namespace is described by this class. */
var NSConn = /** @class */ (function () {
    function NSConn(conn, namespace, events) {
        this.conn = conn;
        this.namespace = namespace;
        this.events = events;
        this.rooms = new Map();
    }
    /* The emit method sends a message to the server with its `Message.Namespace` filled to this specific namespace. */
    NSConn.prototype.emit = function (event, body) {
        var msg = new Message();
        msg.Namespace = this.namespace;
        msg.Event = event;
        msg.Body = body;
        return this.conn.write(msg);
    };
    /* The emitBinary method sends a binary message to the server with its `Message.Namespace` filled to this specific namespace
       and `Message.SetBinary` to true. */
    NSConn.prototype.emitBinary = function (event, body) {
        var msg = new Message();
        msg.Namespace = this.namespace;
        msg.Event = event;
        msg.Body = body;
        msg.SetBinary = true;
        return this.conn.write(msg);
    };
    /* See `Conn.ask`. */
    NSConn.prototype.ask = function (event, body) {
        var msg = new Message();
        msg.Namespace = this.namespace;
        msg.Event = event;
        msg.Body = body;
        return this.conn.ask(msg);
    };
    /* The joinRoom method can be used to join to a specific room, rooms are dynamic.
       Returns a `Room` or an error. */
    NSConn.prototype.joinRoom = function (roomName) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.askRoomJoin(roomName)];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    /* The room method returns a joined `Room`. */
    NSConn.prototype.room = function (roomName) {
        return this.rooms.get(roomName);
    };
    // Rooms(): Room[] {
    //     let rooms = new Array<Room>(this.rooms.size);
    //     this.rooms.forEach((room) => {
    //         rooms.push(room);
    //     })
    //     return rooms;
    // }
    /* The leaveAll method sends a leave room signal to all rooms and fires the `OnRoomLeave` and `OnRoomLeft` (if no error occurred) events. */
    NSConn.prototype.leaveAll = function () {
        return __awaiter(this, void 0, void 0, function () {
            var leaveMsg;
            var _this = this;
            return __generator(this, function (_a) {
                leaveMsg = new Message();
                leaveMsg.Namespace = this.namespace;
                leaveMsg.Event = OnRoomLeft;
                leaveMsg.IsLocal = true;
                this.rooms.forEach(function (value, roomName) { return __awaiter(_this, void 0, void 0, function () {
                    var err_1;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                leaveMsg.Room = roomName;
                                _a.label = 1;
                            case 1:
                                _a.trys.push([1, 3, , 4]);
                                return [4 /*yield*/, this.askRoomLeave(leaveMsg)];
                            case 2:
                                _a.sent();
                                return [3 /*break*/, 4];
                            case 3:
                                err_1 = _a.sent();
                                return [2 /*return*/, err_1];
                            case 4: return [2 /*return*/];
                        }
                    });
                }); });
                return [2 /*return*/, null];
            });
        });
    };
    NSConn.prototype.forceLeaveAll = function (isLocal) {
        var _this = this;
        var leaveMsg = new Message();
        leaveMsg.Namespace = this.namespace;
        leaveMsg.Event = OnRoomLeave;
        leaveMsg.IsForced = true;
        leaveMsg.IsLocal = isLocal;
        this.rooms.forEach(function (value, roomName) {
            leaveMsg.Room = roomName;
            fireEvent(_this, leaveMsg);
            _this.rooms.delete(roomName);
            leaveMsg.Event = OnRoomLeft;
            fireEvent(_this, leaveMsg);
            leaveMsg.Event = OnRoomLeave;
        });
    };
    /* The disconnect method sends a disconnect signal to the server and fires the `OnNamespaceDisconnect` event. */
    NSConn.prototype.disconnect = function () {
        var disconnectMsg = new Message();
        disconnectMsg.Namespace = this.namespace;
        disconnectMsg.Event = OnNamespaceDisconnect;
        return this.conn.askDisconnect(disconnectMsg);
    };
    NSConn.prototype.askRoomJoin = function (roomName) {
        var _this = this;
        return new Promise(function (resolve, reject) { return __awaiter(_this, void 0, void 0, function () {
            var room, joinMsg, err_2, err;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        room = this.rooms.get(roomName);
                        if (room !== undefined) {
                            resolve(room);
                            return [2 /*return*/];
                        }
                        joinMsg = new Message();
                        joinMsg.Namespace = this.namespace;
                        joinMsg.Room = roomName;
                        joinMsg.Event = OnRoomJoin;
                        joinMsg.IsLocal = true;
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.conn.ask(joinMsg)];
                    case 2:
                        _a.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        err_2 = _a.sent();
                        reject(err_2);
                        return [2 /*return*/];
                    case 4:
                        err = fireEvent(this, joinMsg);
                        if (!isEmpty(err)) {
                            reject(err);
                            return [2 /*return*/];
                        }
                        room = new Room(this, roomName);
                        this.rooms.set(roomName, room);
                        joinMsg.Event = OnRoomJoined;
                        fireEvent(this, joinMsg);
                        resolve(room);
                        return [2 /*return*/];
                }
            });
        }); });
    };
    NSConn.prototype.askRoomLeave = function (msg) {
        return __awaiter(this, void 0, void 0, function () {
            var err_3, err;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.rooms.has(msg.Room)) {
                            return [2 /*return*/, ErrBadRoom];
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.conn.ask(msg)];
                    case 2:
                        _a.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        err_3 = _a.sent();
                        return [2 /*return*/, err_3];
                    case 4:
                        err = fireEvent(this, msg);
                        if (!isEmpty(err)) {
                            return [2 /*return*/, err];
                        }
                        this.rooms.delete(msg.Room);
                        msg.Event = OnRoomLeft;
                        fireEvent(this, msg);
                        return [2 /*return*/, null];
                }
            });
        });
    };
    NSConn.prototype.replyRoomJoin = function (msg) {
        if (isEmpty(msg.wait) || msg.isNoOp) {
            return;
        }
        if (!this.rooms.has(msg.Room)) {
            var err = fireEvent(this, msg);
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
    };
    NSConn.prototype.replyRoomLeave = function (msg) {
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
    };
    return NSConn;
}());
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
    return (obj === null || obj === undefined || typeof obj === 'undefined');
}
function resolveNamespaces(obj, reject) {
    if (isNull(obj)) {
        if (!isNull(reject)) {
            reject("connHandler is empty.");
        }
        return null;
    }
    var namespaces = new Map();
    // 1. if contains function instead of a string key then it's Events otherwise it's Namespaces.
    // 2. if contains a mix of functions and keys then ~put those functions to the namespaces[""]~ it is NOT valid.
    var events = new Map();
    // const isMessageHandlerFunc = (value: any): value is MessageHandlerFunc => true;
    var totalKeys = 0;
    Object.keys(obj).forEach(function (key, index) {
        totalKeys++;
        var value = obj[key];
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
            var objEvents_1 = new Map();
            Object.keys(value).forEach(function (objKey, objIndex) {
                // console.log("set event: " + objKey + " of value: ", value[objKey])
                objEvents_1.set(objKey, value[objKey]);
            });
            namespaces.set(key, objEvents_1);
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
/* This is the prefix that Options.header function is set to a url parameter's key in order to serve to parse it as header.
 The server's `URLParamAsHeaderPrefix` must match.
 Note that on the Nodejs side this is entirely optional, nodejs and go client support custom headers without url parameters parsing. */
var URLParamAsHeaderPrefix = "X-Websocket-Header-";
function parseHeadersAsURLParameters(headers, url) {
    if (isNull(headers)) {
        return url;
    }
    for (var key in headers) {
        if (headers.hasOwnProperty(key)) {
            var value = headers[key];
            key = encodeURIComponent(URLParamAsHeaderPrefix + key);
            value = encodeURIComponent(value);
            var part = key + "=" + value;
            url = (url.indexOf("?") != -1 ?
                url.split("?")[0] + "?" + part + "&" + url.split("?")[1] :
                (url.indexOf("#") != -1 ? url.split("#")[0] + "?" + part + "#" + url.split("#")[1] : url + '?' + part));
        }
    }
    return url;
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
function dial(endpoint, connHandler, options) {
    return _dial(endpoint, connHandler, 0, options);
}
// this header key should match the server.ServeHTTP's.
var websocketReconnectHeaderKey = 'X-Websocket-Reconnect';
function _dial(endpoint, connHandler, tries, options) {
    if (isBrowser && endpoint.indexOf("/") == 0) {
        // if is running from browser and endpoint starts with /
        // lets try to fix it, useful when developers changing environments and servers.
        var scheme = document.location.protocol == "https:" ? "wss" : "ws";
        var port = document.location.port ? ":" + document.location.port : "";
        endpoint = scheme + "://" + document.location.hostname + port + endpoint;
    }
    if (endpoint.indexOf("ws") == -1) {
        endpoint = "ws://" + endpoint;
    }
    return new Promise(function (resolve, reject) {
        if (!WebSocket) {
            reject("WebSocket is not accessible through this browser.");
        }
        var namespaces = resolveNamespaces(connHandler, reject);
        if (isNull(namespaces)) {
            return;
        }
        if (isNull(options)) {
            options = {};
        }
        if (isNull(options.headers)) {
            options.headers = {};
        }
        var reconnectEvery = (options.reconnect) ? options.reconnect : 0;
        if (tries > 0 && reconnectEvery > 0) {
            //     options.headers = {
            //         [websocketReconnectHeaderKey]: tries.toString()
            //     };
            options.headers[websocketReconnectHeaderKey] = tries.toString();
        }
        else if (!isNull(options.headers[websocketReconnectHeaderKey])) /* against tricks */ {
            delete options.headers[websocketReconnectHeaderKey];
        }
        var ws = makeWebsocketConnection(endpoint, options);
        var conn = new Conn(ws, namespaces);
        conn.reconnectTries = tries;
        ws.binaryType = "arraybuffer";
        ws.onmessage = (function (evt) {
            var err = conn.handle(evt);
            if (!isEmpty(err)) {
                reject(err);
                return;
            }
            if (conn.isAcknowledged()) {
                resolve(conn);
            }
        });
        ws.onopen = (function (evt) {
            // let b = new Uint8Array(1)
            // b[0] = 1;
            // this.conn.send(b.buffer);
            ws.send(ackBinary);
        });
        ws.onerror = (function (err) {
            // if (err.type !== undefined && err.type == "error" && (ws.readyState == ws.CLOSED || ws.readyState == ws.CLOSING)) {
            //     // for any case, it should never happen.
            //     return;
            // }
            conn.close();
            reject(err);
        });
        ws.onclose = (function (evt) {
            if (conn.isClosed()) {
                // reconnection is NOT allowed when:
                // 1. server force-disconnect this client.
                // 2. client disconnects itself manually.
                // We check those two ^ with conn.isClosed().
                // console.log("manual disconnect.")
            }
            else {
                // disable all previous event callbacks.
                ws.onmessage = undefined;
                ws.onopen = undefined;
                ws.onerror = undefined;
                ws.onclose = undefined;
                if (reconnectEvery <= 0) {
                    conn.close();
                    return null;
                }
                // get the connected namespaces before .close clears.
                var previouslyConnectedNamespacesNamesOnly_1 = new Map(); // connected namespaces[key] -> [values]joined rooms;
                conn.connectedNamespaces.forEach(function (nsConn, name) {
                    var previouslyJoinedRooms = new Array();
                    if (!isNull(nsConn.rooms) && nsConn.rooms.size > 0) {
                        nsConn.rooms.forEach(function (roomConn, roomName) {
                            previouslyJoinedRooms.push(roomName);
                        });
                    }
                    previouslyConnectedNamespacesNamesOnly_1.set(name, previouslyJoinedRooms);
                });
                conn.close();
                whenResourceOnline(endpoint, reconnectEvery, function (tries) {
                    _dial(endpoint, connHandler, tries, options).then(function (newConn) {
                        if (isNull(resolve) || resolve.toString() == "function () { [native code] }") {
                            // Idea behind the below:
                            // If the original promise was in try-catch statement instead of .then and .catch callbacks
                            // then this block will be called however, we don't have a way
                            // to guess the user's actions in a try block, so we at least,
                            //  we will try to reconnect to the previous namespaces automatically here.
                            previouslyConnectedNamespacesNamesOnly_1.forEach(function (joinedRooms, name) {
                                var whenConnected = function (joinedRooms) {
                                    return function (newNSConn) {
                                        joinedRooms.forEach(function (roomName) {
                                            newNSConn.joinRoom(roomName);
                                        });
                                    };
                                };
                                newConn.connect(name).then(whenConnected(joinedRooms));
                            });
                            return;
                        }
                        resolve(newConn);
                    }).catch(reject);
                });
            }
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
                return new WebSocket(endpoint, options.protocols);
            }
            else {
                return new WebSocket(endpoint);
            }
        }
    }
    return new WebSocket(endpoint, options);
}
function whenResourceOnline(endpoint, checkEvery, notifyOnline) {
    // Don't fire webscoket requests just yet.
    // We check if the HTTP endpoint is alive with a simple fetch, if it is alive then we notify the caller
    // to proceed with a websocket request. That way we can notify the server-side how many times
    // this client was trying to reconnect as well.
    // Note:
    // Chrome itself is emitting net::ERR_CONNECTION_REFUSED and the final Bad Request messages to the console on network failures on fetch,
    // there is no way to block them programmatically, we could do a console.clear but this will clear any custom logging the end-dev may has too.
    var endpointHTTP = endpoint.replace(/(ws)(s)?\:\/\//, "http$2://");
    // counts and sends as header the previous failures (if any) and the succeed last one.
    var tries = 1;
    var fetchOptions = { method: 'HEAD', mode: 'no-cors' };
    var check = function () {
        // Note:
        // We do not fire a try immediately after the disconnection as most developers will expect.
        _fetch(endpointHTTP, fetchOptions).then(function () {
            notifyOnline(tries);
        }).catch(function () {
            // if (err !== undefined && err.toString() !== "TypeError: Failed to fetch") {
            //     console.log(err);
            // }
            tries++;
            setTimeout(function () {
                check();
            }, checkEvery);
        });
    };
    setTimeout(check, checkEvery);
}
var ErrInvalidPayload = new Error("invalid payload");
var ErrBadNamespace = new Error("bad namespace");
var ErrBadRoom = new Error("bad room");
var ErrClosed = new Error("use of closed connection");
var ErrWrite = new Error("write closed");
/* The isCloseError function reports whether incoming error is received because of server shutdown. */
function isCloseError(err) {
    if (err && !isEmpty(err.message)) {
        return err.message.indexOf("[-1] write closed") >= 0;
    }
    return false;
}
/* The Conn class contains the websocket connection and the neffos communication functionality.
   Its `connect` will return a new `NSConn` instance, each connection can connect to one or more namespaces.
   Each `NSConn` can join to multiple rooms. */
var Conn = /** @class */ (function () {
    // private isConnectingProcesseses: string[]; // if elem exists then any receive of that namespace is locked until `askConnect` finished.
    function Conn(conn, namespaces) {
        this.conn = conn;
        this.reconnectTries = 0;
        this._isAcknowledged = false;
        this.namespaces = namespaces;
        var hasEmptyNS = namespaces.has("");
        this.allowNativeMessages = hasEmptyNS && namespaces.get("").has(OnNativeMessage);
        this.queue = new Array();
        this.waitingMessages = new Map();
        this.connectedNamespaces = new Map();
        // this.isConnectingProcesseses = new Array<string>();
        this.closed = false;
        // this.conn.onclose = ((evt: Event): any => {
        //     this.close();
        //     return null;
        // });
    }
    /* The wasReconnected method reports whether the current connection is the result of a reconnection.
       To get the numbers of total retries see the `reconnectTries` field. */
    Conn.prototype.wasReconnected = function () {
        return this.reconnectTries > 0;
    };
    Conn.prototype.isAcknowledged = function () {
        return this._isAcknowledged;
    };
    Conn.prototype.handle = function (evt) {
        if (!this._isAcknowledged) {
            // if (evt.data instanceof ArrayBuffer) {
            // new Uint8Array(evt.data)
            var err = this.handleAck(evt.data);
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
    };
    Conn.prototype.handleAck = function (data) {
        var typ = data[0];
        switch (typ) {
            case ackIDBinary:
                // let id = dec.decode(data.slice(1));
                var id = data.slice(1);
                this.ID = id;
                break;
            case ackNotOKBinary:
                // let errorText = dec.decode(data.slice(1));
                var errorText = data.slice(1);
                return new Error(errorText);
            default:
                this.queue.push(data);
                return null;
        }
    };
    Conn.prototype.handleQueue = function () {
        var _this = this;
        if (this.queue == undefined || this.queue.length == 0) {
            return;
        }
        this.queue.forEach(function (item, index) {
            _this.queue.splice(index, 1);
            _this.handleMessage(item);
        });
    };
    Conn.prototype.handleMessage = function (data) {
        var msg = deserializeMessage(data, this.allowNativeMessages);
        if (msg.isInvalid) {
            return ErrInvalidPayload;
        }
        if (msg.IsNative && this.allowNativeMessages) {
            var ns_1 = this.namespace("");
            return fireEvent(ns_1, msg);
        }
        if (msg.isWait()) {
            var cb = this.waitingMessages.get(msg.wait);
            if (cb != undefined) {
                cb(msg);
                return;
            }
        }
        var ns = this.namespace(msg.Namespace);
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
                var err = fireEvent(ns, msg);
                if (!isEmpty(err)) {
                    // write any error back to the server.
                    msg.Err = err;
                    this.write(msg);
                    return err;
                }
        }
        return null;
    };
    /* The connect method returns a new connected to the specific "namespace" `NSConn` instance or an error. */
    Conn.prototype.connect = function (namespace) {
        return this.askConnect(namespace);
    };
    /* waitServerConnect method blocks until server manually calls the connection's `Connect`
       on the `Server#OnConnected` event. */
    Conn.prototype.waitServerConnect = function (namespace) {
        var _this = this;
        if (isNull(this.waitServerConnectNotifiers)) {
            this.waitServerConnectNotifiers = new Map();
        }
        return new Promise(function (resolve, reject) { return __awaiter(_this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                this.waitServerConnectNotifiers.set(namespace, function () {
                    _this.waitServerConnectNotifiers.delete(namespace);
                    resolve(_this.namespace(namespace));
                });
                return [2 /*return*/];
            });
        }); });
    };
    /* The namespace method returns an already connected `NSConn`. */
    Conn.prototype.namespace = function (namespace) {
        return this.connectedNamespaces.get(namespace);
    };
    Conn.prototype.replyConnect = function (msg) {
        if (isEmpty(msg.wait) || msg.isNoOp) {
            return;
        }
        var ns = this.namespace(msg.Namespace);
        if (ns !== undefined) {
            this.writeEmptyReply(msg.wait);
            return;
        }
        var events = getEvents(this.namespaces, msg.Namespace);
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
    };
    Conn.prototype.replyDisconnect = function (msg) {
        if (isEmpty(msg.wait) || msg.isNoOp) {
            return;
        }
        var ns = this.namespace(msg.Namespace);
        if (ns === undefined) {
            this.writeEmptyReply(msg.wait);
            return;
        }
        ns.forceLeaveAll(true);
        this.connectedNamespaces.delete(msg.Namespace);
        this.writeEmptyReply(msg.wait);
        fireEvent(ns, msg);
    };
    /* The ask method writes a message to the server and blocks until a response or an error received. */
    Conn.prototype.ask = function (msg) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            if (_this.isClosed()) {
                reject(ErrClosed);
                return;
            }
            msg.wait = genWait();
            _this.waitingMessages.set(msg.wait, (function (receive) {
                if (receive.isError) {
                    reject(receive.Err);
                    return;
                }
                resolve(receive);
            }));
            if (!_this.write(msg)) {
                reject(ErrWrite);
                return;
            }
        });
    };
    // private addConnectProcess(namespace: string) {
    //     this.isConnectingProcesseses.push(namespace);
    // }
    // private removeConnectProcess(namespace: string) {
    //     let idx = this.isConnectingProcesseses.findIndex((value: string, index: number, obj) => { return value === namespace || false; });
    //     if (idx !== -1) {
    //         this.isConnectingProcesseses.splice(idx, 1);
    //     }
    // }
    Conn.prototype.askConnect = function (namespace) {
        var _this = this;
        return new Promise(function (resolve, reject) { return __awaiter(_this, void 0, void 0, function () {
            var ns, events, connectMessage, err, err_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        ns = this.namespace(namespace);
                        if (ns !== undefined) { // it's already connected.
                            resolve(ns);
                            return [2 /*return*/];
                        }
                        events = getEvents(this.namespaces, namespace);
                        if (isNull(events)) {
                            reject(ErrBadNamespace);
                            return [2 /*return*/];
                        }
                        connectMessage = new Message();
                        connectMessage.Namespace = namespace;
                        connectMessage.Event = OnNamespaceConnect;
                        connectMessage.IsLocal = true;
                        ns = new NSConn(this, namespace, events);
                        err = fireEvent(ns, connectMessage);
                        if (!isEmpty(err)) {
                            // this.removeConnectProcess(namespace);
                            reject(err);
                            return [2 /*return*/];
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.ask(connectMessage)];
                    case 2:
                        _a.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        err_4 = _a.sent();
                        reject(err_4);
                        return [2 /*return*/];
                    case 4:
                        this.connectedNamespaces.set(namespace, ns);
                        connectMessage.Event = OnNamespaceConnected;
                        fireEvent(ns, connectMessage);
                        resolve(ns);
                        return [2 /*return*/];
                }
            });
        }); });
    };
    Conn.prototype.askDisconnect = function (msg) {
        return __awaiter(this, void 0, void 0, function () {
            var ns, err_5;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        ns = this.namespace(msg.Namespace);
                        if (ns === undefined) { // it's already connected.
                            return [2 /*return*/, ErrBadNamespace];
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.ask(msg)];
                    case 2:
                        _a.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        err_5 = _a.sent();
                        return [2 /*return*/, err_5];
                    case 4:
                        ns.forceLeaveAll(true);
                        this.connectedNamespaces.delete(msg.Namespace);
                        msg.IsLocal = true;
                        return [2 /*return*/, fireEvent(ns, msg)];
                }
            });
        });
    };
    /* The isClosed method reports whether this connection is closed. */
    Conn.prototype.isClosed = function () {
        return this.closed; // || this.conn.readyState == this.conn.CLOSED || false;
    };
    /* The write method writes a message to the server and reports whether the connection is still available. */
    Conn.prototype.write = function (msg) {
        if (this.isClosed()) {
            return false;
        }
        if (!msg.isConnect() && !msg.isDisconnect()) {
            // namespace pre-write check.
            var ns = this.namespace(msg.Namespace);
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
        // if (msg.SetBinary) {
        //     if (!("TextEncoder" in window)) {
        //         throw new Error("this browser does not support Text Encoding/Decoding...");
        //     }
        //     (msg.Body as unknown) = new TextEncoder().encode(msg.Body);
        // }
        // this.conn.send(serializeMessage(msg));
        //
        // var data:string|Uint8Array = serializeMessage(msg)
        // if (msg.SetBinary) {
        //     if (!("TextEncoder" in window)) {
        //         throw new Error("this browser does not support Text Encoding/Decoding...");
        //     }
        //     data = new TextEncoder().encode(data);
        // }
        // this.conn.send(data);
        this.conn.send(serializeMessage(msg));
        return true;
    };
    Conn.prototype.writeEmptyReply = function (wait) {
        this.conn.send(genEmptyReplyToWait(wait));
    };
    /* The close method will force-disconnect from all connected namespaces and force-leave from all joined rooms
       and finally will terminate the underline websocket connection. After this method call the `Conn` is not usable anymore, a new `dial` call is required. */
    Conn.prototype.close = function () {
        var _this = this;
        if (this.closed) {
            return;
        }
        var disconnectMsg = new Message();
        disconnectMsg.Event = OnNamespaceDisconnect;
        disconnectMsg.IsForced = true;
        disconnectMsg.IsLocal = true;
        this.connectedNamespaces.forEach(function (ns) {
            ns.forceLeaveAll(true);
            disconnectMsg.Namespace = ns.namespace;
            fireEvent(ns, disconnectMsg);
            _this.connectedNamespaces.delete(ns.namespace);
        });
        this.waitingMessages.clear();
        this.closed = true;
        if (this.conn.readyState === this.conn.OPEN) {
            this.conn.close();
        }
    };
    return Conn;
}());
(function () {
    // interface Neffos {
    //     dial(...)
    // }
    // const neffos: Neffos = {
    //    dial:dial,
    // }
    var neffos = {
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
    if (typeof exports !== 'undefined') {
        exports = neffos;
        module.exports = neffos;
    }
    else {
        var root = typeof self == 'object' && self.self === self && self ||
            typeof global == 'object' && global.global === global && global;
        // as a browser global.
        root["neffos"] = neffos;
    }
}());
//# sourceMappingURL=neffos.js.map