(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
 const neffos = require('neffos');

 var scheme = document.location.protocol == "https:" ? "wss" : "ws";
 var port = document.location.port ? ":" + document.location.port : "";

 var wsURL = scheme + "://" + document.location.hostname + port + "/echo";

 var input = document.getElementById("input");
 var output = document.getElementById("output");

 async function runExample() {
   let conn = await neffos.dial(wsURL, {
     default: {
       _OnNamespaceConnected: function(ns, msg) {
         addMessage("connected to namespace: " + msg.Namespace);
       },
       _OnNamespaceDisconnect: function(ns, msg) {
         addMessage("disconnected from namespace: " + msg.Namespace);
       },
       _OnRoomJoined: function(ns, msg) {
         addMessage("joined to room: " + msg.Room);
       },
       _OnRoomLeft: function(ns, msg) {
         addMessage("left from room: " + msg.Room);
       },
       chat: function(ns, msg) {
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
     sendBtn.onclick = function() {
       const input = inputTxt.value;
       inputTxt.value = "";

       switch (input) {
         case "join":
           nsConn.joinRoom(exampleRoomName);
           joinedRoom = exampleRoomName;
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
   output.innerHTML += msg + "\n";
 }
},{"neffos":3}],2:[function(require,module,exports){
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
"use strict";var __awaiter=this&&this.__awaiter||function(a,b,c,d){return new(c||(c=Promise))(function(e,f){function g(a){try{i(d.next(a))}catch(a){f(a)}}function h(a){try{i(d["throw"](a))}catch(a){f(a)}}function i(a){a.done?e(a.value):new c(function(b){b(a.value)}).then(g,h)}i((d=d.apply(a,b||[])).next())})};Object.defineProperty(exports,"__esModule",{value:!0});const isBrowser="undefined"!=typeof window;var WebSocket;WebSocket=isBrowser?window.WebSocket:require("ws"),exports.OnNamespaceConnect="_OnNamespaceConnect",exports.OnNamespaceConnected="_OnNamespaceConnected",exports.OnNamespaceDisconnect="_OnNamespaceDisconnect",exports.OnRoomJoin="_OnRoomJoin",exports.OnRoomJoined="_OnRoomJoined",exports.OnRoomLeave="_OnRoomLeave",exports.OnRoomLeft="_OnRoomLeft",exports.OnAnyEvent="_OnAnyEvent",exports.OnNativeMessage="_OnNativeMessage";const ackBinary="M",ackIDBinary="A",ackNotOKBinary="H",waitIsConfirmationPrefix="#",waitComesFromClientPrefix="$";function isSystemEvent(a){return!(a!==exports.OnNamespaceConnect&&a!==exports.OnNamespaceConnected&&a!==exports.OnNamespaceDisconnect&&a!==exports.OnRoomJoin&&a!==exports.OnRoomJoined&&a!==exports.OnRoomLeave&&a!==exports.OnRoomLeft)}exports.isSystemEvent=isSystemEvent;function isEmpty(a){return!(void 0!==a)||!(null!==a)||("string"==typeof a||a instanceof String?0===a.length||""===a:!!(a instanceof Error)&&isEmpty(a.message))}class Message{isConnect(){return this.Event==exports.OnNamespaceConnect||!1}isDisconnect(){return this.Event==exports.OnNamespaceDisconnect||!1}isRoomJoin(){return this.Event==exports.OnRoomJoin||!1}isRoomLeft(){return this.Event==exports.OnRoomLeft||!1}isWait(){return!isEmpty(this.wait)&&(!(this.wait[0]!=waitIsConfirmationPrefix)||this.wait[0]==waitComesFromClientPrefix||!1)}}exports.Message=Message;const messageSeparator=";",validMessageSepCount=7,trueString="1",falseString="0";function serializeMessage(a){if(a.IsNative&&isEmpty(a.wait))return a.Body;let b=falseString,c=falseString,d=a.Body||"";return a.isError&&(d=a.Err,b=trueString),a.isNoOp&&(c=trueString),[a.wait||"",a.Namespace,a.Room||"",a.Event||"",b,c,d].join(messageSeparator)}function deserializeMessage(a,b){var c=new Message;if(0==a.length)return c.isInvalid=!0,c;let d=a.split(messageSeparator,validMessageSepCount);if(d.length!=validMessageSepCount)return b?(c.Event=exports.OnNativeMessage,c.Body=a):c.isInvalid=!0,c;c.wait=d[0],c.Namespace=d[1],c.Room=d[2],c.Event=d[3],c.isError=d[4]==trueString||!1,c.isNoOp=d[5]==trueString||!1;let e=d[6];return isEmpty(e)?c.Body="":c.isError?c.Err=e:c.Body=e,c.isInvalid=!1,c.IsForced=!1,c.IsLocal=!1,c.IsNative=b&&c.Event==exports.OnNativeMessage||!1,c}function genWait(){if(!isBrowser){let a=process.hrtime();return waitComesFromClientPrefix+1e9*a[0]+a[1]}else{let a=window.performance.now();return waitComesFromClientPrefix+a.toString()}}function genWaitConfirmation(a){return waitIsConfirmationPrefix+a}function genEmptyReplyToWait(a){return a+messageSeparator.repeat(validMessageSepCount-1)}class Room{constructor(a,b){this.nsConn=a,this.name=b}emit(a,b){let c=new Message;return c.Namespace=this.nsConn.namespace,c.Room=this.name,c.Event=a,c.Body=b,this.nsConn.conn.write(c)}leave(){let a=new Message;return a.Namespace=this.nsConn.namespace,a.Room=this.name,a.Event=exports.OnRoomLeave,this.nsConn.askRoomLeave(a)}}exports.Room=Room;class NSConn{constructor(a,b,c){this.conn=a,this.namespace=b,this.events=c,this.rooms=new Map}emit(a,b){let c=new Message;return c.Namespace=this.namespace,c.Event=a,c.Body=b,this.conn.write(c)}ask(a,b){let c=new Message;return c.Namespace=this.namespace,c.Event=a,c.Body=b,this.conn.ask(c)}joinRoom(a){return this.askRoomJoin(a)}room(a){return this.rooms.get(a)}leaveAll(){return __awaiter(this,void 0,void 0,function*(){let a=new Message;return a.Namespace=this.namespace,a.Event=exports.OnRoomLeft,a.IsLocal=!0,this.rooms.forEach((b,c)=>__awaiter(this,void 0,void 0,function*(){a.Room=c;try{yield this.askRoomLeave(a)}catch(a){return a}})),null})}forceLeaveAll(a){let b=new Message;b.Namespace=this.namespace,b.Event=exports.OnRoomLeave,b.IsForced=!0,b.IsLocal=a,this.rooms.forEach((a,c)=>{b.Room=c,fireEvent(this,b),this.rooms.delete(c),b.Event=exports.OnRoomLeft,fireEvent(this,b),b.Event=exports.OnRoomLeave})}disconnect(){let a=new Message;return a.Namespace=this.namespace,a.Event=exports.OnNamespaceDisconnect,this.conn.askDisconnect(a)}askRoomJoin(a){return __awaiter(this,void 0,void 0,function*(){let b=this.rooms.get(a);if(void 0!==b)return b;let c=new Message;c.Namespace=this.namespace,c.Room=a,c.Event=exports.OnRoomJoin,c.IsLocal=!0;try{yield this.conn.ask(c)}catch(a){return a}let d=fireEvent(this,c);return isEmpty(d)?(b=new Room(this,a),this.rooms.set(a,b),c.Event=exports.OnRoomJoined,fireEvent(this,c),b):d})}askRoomLeave(a){return __awaiter(this,void 0,void 0,function*(){if(!this.rooms.has(a.Room))return exports.ErrBadRoom;try{yield this.conn.ask(a)}catch(a){return a}let b=fireEvent(this,a);return isEmpty(b)?(this.rooms.delete(a.Room),a.Event=exports.OnRoomLeft,fireEvent(this,a),null):b})}replyRoomJoin(a){if(!(isEmpty(a.wait)||a.isNoOp)){if(!this.rooms.has(a.Room)){let b=fireEvent(this,a);if(!isEmpty(b))return a.Err=b.message,void this.conn.write(a);this.rooms.set(a.Room,new Room(this,a.Room)),a.Event=exports.OnRoomJoined,fireEvent(this,a)}this.conn.writeEmptyReply(a.wait)}}replyRoomLeave(a){return isEmpty(a.wait)||a.isNoOp?void 0:this.rooms.has(a.Room)?void(fireEvent(this,a),this.rooms.delete(a.Room),this.conn.writeEmptyReply(a.wait),a.Event=exports.OnRoomLeft,fireEvent(this,a)):void this.conn.writeEmptyReply(a.wait)}}exports.NSConn=NSConn;function fireEvent(a,b){return a.events.hasOwnProperty(b.Event)?a.events[b.Event](a,b):a.events.hasOwnProperty(exports.OnAnyEvent)?a.events[exports.OnAnyEvent](a,b):null}function getEvents(a,b){return a.hasOwnProperty(b)?a[b]:null}exports.ErrInvalidPayload=new Error("invalid payload"),exports.ErrBadNamespace=new Error("bad namespace"),exports.ErrBadRoom=new Error("bad room"),exports.ErrClosed=new Error("use of closed connection"),exports.ErrWrite=new Error("write closed");function dial(a,b,c){return-1==a.indexOf("ws")&&(a="ws://"+a),new Promise((d,e)=>{WebSocket||e("WebSocket is not accessible through this browser."),void 0===b&&e("connHandler is empty.");let f=new WebSocket(a,c),g=new Conn(f,b,c);f.binaryType="arraybuffer",f.onmessage=a=>{let b=g.handle(a);return isEmpty(b)?void(g.isAcknowledged()&&d(g)):void e(b)},f.onopen=()=>{f.send(ackBinary)},f.onerror=a=>{g.close(),e(a)}})}exports.dial=dial;class Conn{constructor(a,b,c){this.conn=a,this._isAcknowledged=!1;let d=b.hasOwnProperty("");this.allowNativeMessages=d&&b[""].hasOwnProperty(exports.OnNativeMessage),this.queue=[],this.waitingMessages=new Map,this.namespaces=b,this.connectedNamespaces=new Map,this.closed=!1,this.conn.onclose=()=>(this.close(),null)}isAcknowledged(){return this._isAcknowledged}handle(a){if(!this._isAcknowledged){let b=this.handleAck(a.data);return null==b?(this._isAcknowledged=!0,this.handleQueue()):this.conn.close(),b}return this.handleMessage(a.data)}handleAck(a){let b=a[0];switch(b){case ackIDBinary:let c=a.slice(1);this.ID=c;break;case ackNotOKBinary:let d=a.slice(1);return new Error(d);default:return this.queue.push(a),null;}}handleQueue(){null==this.queue||0==this.queue.length||this.queue.forEach((a,b)=>{this.queue.splice(b,1),this.handleMessage(a)})}handleMessage(a){let b=deserializeMessage(a,this.allowNativeMessages);if(b.isInvalid)return exports.ErrInvalidPayload;if(b.IsNative&&this.allowNativeMessages){let a=this.namespace("");return fireEvent(a,b)}if(b.isWait()){let a=this.waitingMessages.get(b.wait);if(null!=a)return void a(b)}const c=this.namespace(b.Namespace);switch(b.Event){case exports.OnNamespaceConnect:this.replyConnect(b);break;case exports.OnNamespaceDisconnect:this.replyDisconnect(b);break;case exports.OnRoomJoin:if(c!==void 0){c.replyRoomJoin(b);break}case exports.OnRoomLeave:if(c!==void 0){c.replyRoomLeave(b);break}default:if(c===void 0)return exports.ErrBadNamespace;b.IsLocal=!1;let a=fireEvent(c,b);if(!isEmpty(a))return b.Err=a.message,this.write(b),a;}return null}connect(a){return this.askConnect(a)}namespace(a){return this.connectedNamespaces.get(a)}replyConnect(a){if(isEmpty(a.wait)||a.isNoOp)return;let b=this.namespace(a.Namespace);if(void 0!==b)return void this.writeEmptyReply(a.wait);let c=getEvents(this.namespaces,a.Namespace);return void 0===c?(a.Err=exports.ErrBadNamespace.message,void this.write(a)):void(b=new NSConn(this,a.Namespace,c),this.connectedNamespaces.set(a.Namespace,b),this.writeEmptyReply(a.wait),a.Event=exports.OnNamespaceConnected,fireEvent(b,a))}replyDisconnect(a){if(!(isEmpty(a.wait)||a.isNoOp)){let b=this.namespace(a.Namespace);return void 0===b?void this.writeEmptyReply(a.wait):void(b.forceLeaveAll(!0),this.connectedNamespaces.delete(a.Namespace),this.writeEmptyReply(a.wait),fireEvent(b,a))}}ask(a){return new Promise((b,c)=>this.isClosed()?void c(exports.ErrClosed):(a.wait=genWait(),this.waitingMessages.set(a.wait,a=>a.isError?void c(new Error(a.Err)):void b(a)),!this.write(a))?void c(exports.ErrWrite):void 0)}askConnect(a){return __awaiter(this,void 0,void 0,function*(){let b=this.namespace(a);if(void 0!==b)return b;let c=getEvents(this.namespaces,a);if(void 0===c)return exports.ErrBadNamespace;let d=new Message;d.Namespace=a,d.Event=exports.OnNamespaceConnect,d.IsLocal=!0,b=new NSConn(this,a,c);let e=fireEvent(b,d);if(!isEmpty(e))return e;try{yield this.ask(d)}catch(a){return a}return this.connectedNamespaces.set(a,b),d.Event=exports.OnNamespaceConnected,fireEvent(b,d),b})}askDisconnect(a){return __awaiter(this,void 0,void 0,function*(){let b=this.namespace(a.Namespace);if(void 0===b)return exports.ErrBadNamespace;try{yield this.ask(a)}catch(a){return a}return b.forceLeaveAll(!0),this.connectedNamespaces.delete(a.Namespace),a.IsLocal=!0,fireEvent(b,a)})}isClosed(){return this.closed||this.conn.readyState==this.conn.CLOSED||!1}write(a){if(this.isClosed())return!1;if(!a.isConnect()&&!a.isDisconnect()){let b=this.namespace(a.Namespace);if(void 0===b)return!1;if(!isEmpty(a.Room)&&!a.isRoomJoin()&&!a.isRoomLeft()&&!b.rooms.has(a.Room))return!1}return this.conn.send(serializeMessage(a)),!0}writeEmptyReply(a){this.conn.send(genEmptyReplyToWait(a))}close(){if(this.closed)return;let a=new Message;a.Event=exports.OnNamespaceDisconnect,a.IsForced=!0,a.IsLocal=!0,this.connectedNamespaces.forEach(b=>{b.forceLeaveAll(!0),a.Namespace=b.namespace,fireEvent(b,a),this.connectedNamespaces.delete(b.namespace)}),this.waitingMessages.clear(),this.conn.readyState===this.conn.OPEN&&this.conn.close(),this.closed=!0}}exports.Conn=Conn;
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
