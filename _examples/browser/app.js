/// <reference path="../../type_definitions/neffos.d.ts" />
import * as neffos from 'neffos'; // or const neffos = require('neffos');

var scheme = document.location.protocol == "https:" ? "wss" : "ws";
var port = document.location.port ? ":" + document.location.port : "";

var wsURL = scheme + "://" + document.location.hostname + port + "/echo";

var outputTxt = document.getElementById("output");

async function runExample() {
  let conn = await neffos.dial(wsURL, {
    default: {
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
      chat: function (ns, msg) {
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
  outputTxt.innerHTML += msg + "\n";
}