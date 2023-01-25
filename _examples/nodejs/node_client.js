/// <reference path="../../types/index.d.ts" />
import * as neffos from "neffos.js";

const stdin = process.openStdin();

const wsURL = "ws://127.0.0.1:8080/echo";

async function runExample() {
  try {
    const conn = await neffos.dial(wsURL, {
      default: { // "default" namespace.
        _OnNamespaceConnected: function (nsConn, msg) {
          if (nsConn.conn.wasReconnected()) {
            console.log("re-connected after " + nsConn.conn.reconnectTries.toString() + " trie(s)");
          }
          console.log("connected to namespace: " + msg.Namespace);
        },
        _OnNamespaceDisconnect: function (nsConn, msg) {
          console.log("disconnected from namespace: " + msg.Namespace);
        },
        chat: function (nsConn, msg) { // "chat" event.
          console.log(msg.Body);
        }
      }
    }, { // optional.
        reconnect: 2000,
        // set custom headers.
        headers: {
          // 'X-Username': 'kataras',
        }
      });

    const nsConn = await conn.connect("default");
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
