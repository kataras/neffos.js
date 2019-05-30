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
          addMessage("connected to namespace: " + msg.Namespace);
        },
        _OnNamespaceDisconnect: function (nsConn, msg) {
          addMessage("disconnected from namespace: " + msg.Namespace);
        },
        chat: function (nsConn, msg) { // "chat" event.
          addMessage(msg.Body);
        }
      }
    });

    const nsConn = await conn.connect("default");
    handleNamespaceConnectedConn(nsConn);

  } catch (err) {
    handleError(err);
  }
}

runExample();

