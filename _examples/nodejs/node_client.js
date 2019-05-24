/// <reference path="../../dist/neffos.d.ts" />
const neffos = require('neffos.js');
const stdin = process.openStdin();

const wsURL = "ws://localhost:8080/echo";
async function runExample() {
  try {
    var conn = await neffos.dial(wsURL, {
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

    stdin.addListener("data", function (data) {
      const text = data.toString().trim();
      nsConn.emit("chat", text);
    });

  } catch (err) {
    console.error(err);
  }
}

runExample();
