const neffos = require('neffos.js');

var scheme = document.location.protocol == "https:" ? "wss" : "ws";
var port = document.location.port ? ":" + document.location.port : "";

var wsURL = scheme + "://" + document.location.hostname + port + "/echo";

var outputTxt = document.getElementById("output");
function addMessage(msg) {
  outputTxt.innerHTML += msg + "\n";
}

function handleError(reason) {
  console.log(reason);
  window.alert(reason);
}

function handleNamespaceConnectedConn(nsConn) {
  const inputTxt = document.getElementById("input");
  const sendBtn = document.getElementById("sendBtn");

  sendBtn.disabled = false;
  sendBtn.onclick = function () {
    const input = inputTxt.value;
    inputTxt.value = "";

    nsConn.emit("chat", input);
    addMessage("Me: " + input);
  };
}

async function runExample() {
  try {
    const conn = await neffos.dial(wsURL, {
      default: { // "default" namespace.
        _OnNamespaceConnected: function (nsConn, msg) {
          if (nsConn.conn.wasReconnected()) {
            addMessage("re-connected after " + nsConn.conn.reconnectTries.toString() + " trie(s)");
          }

          addMessage("connected to namespace: " + msg.Namespace);
          handleNamespaceConnectedConn(nsConn);
        },
        _OnNamespaceDisconnect: function (nsConn, msg) {
          addMessage("disconnected from namespace: " + msg.Namespace);
        },
        _OnAnyEvent: function (nsConn, msg) { // any event.
          if (!neffos.isSystemEvent(msg.Event)) {
            console.log(msg);
          }
        },
        chat: function (nsConn, msg) { // "chat" event.
          if (msg.Body == "test_reply") {
            return neffos.reply("same namespace-event but new body");
          }
          addMessage(msg.Body);
        }
      }
    }, {
        // if > 0 then on network failures it tries to reconnect every 5 seconds, defaults to 0 (disabled).
        reconnect: 5000,
        // custom headers:
        // headers: {
        //   'X-Username': 'kataras'
        // }
      });

    // You can either wait to conenct or just conn.connect("connect")
    // and put the `handleNamespaceConnectedConn` inside `_OnNamespaceConnected` callback instead.
    // const nsConn = await conn.connect("default");
    // handleNamespaceConnectedConn(nsConn);
    conn.connect("default");

  } catch (err) {
    console.log("try-catch on await neffos.dial.");
    handleError(err);
  }
}

runExample();

