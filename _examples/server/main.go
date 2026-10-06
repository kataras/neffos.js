// Shows: a minimal neffos (Go) chat server for the two client examples in
// this tree (../browser and ../node). One namespace, "default", with a
// "chat" event that the server re-broadcasts to every other connection, and
// room join/leave support via the framework's built-in room events.
//
// Run it: from this directory, `go run .`. It listens on localhost:8080,
// serves the neffos websocket endpoint at /ws, the browser example at /,
// the bundler example at /bundler/ (browsers block its module script when
// the page is opened as a file), and the locally built client library at
// /dist/ (so ../browser/index.html can load it before neffos.js 0.3.0 is
// published to npm).
//
// Try it: open http://localhost:8080 in two browser tabs and chat between
// them, or run `node ../node/client.mjs` alongside a browser tab.
//
// Read next: ../browser/index.html for the CDN-ready client, or
// ../node/client.mjs for a terminal client.
package main

import (
	"log"
	"net/http"

	"github.com/kataras/neffos"
	"github.com/kataras/neffos/gorilla"
)

const (
	addr      = "localhost:8080"
	namespace = "default"
)

var namespaces = neffos.Namespaces{
	namespace: neffos.Events{
		neffos.OnNamespaceConnected: func(c *neffos.NSConn, msg neffos.Message) error {
			log.Printf("[%s] connected to namespace [%s]", c.Conn.ID(), msg.Namespace)
			return nil
		},
		neffos.OnNamespaceDisconnect: func(c *neffos.NSConn, msg neffos.Message) error {
			log.Printf("[%s] disconnected from namespace [%s]", c.Conn.ID(), msg.Namespace)
			return nil
		},
		neffos.OnRoomJoined: func(c *neffos.NSConn, msg neffos.Message) error {
			log.Printf("[%s] joined room [%s]", c.Conn.ID(), msg.Room)
			return nil
		},
		neffos.OnRoomLeft: func(c *neffos.NSConn, msg neffos.Message) error {
			log.Printf("[%s] left room [%s]", c.Conn.ID(), msg.Room)
			return nil
		},
		"chat": func(c *neffos.NSConn, msg neffos.Message) error {
			// Send the message to every other connection in the same room
			// (or namespace, if msg.Room is empty).
			c.Conn.Server().Broadcast(c.Conn, msg)
			return nil
		},
	},
}

func main() {
	srv := neffos.New(gorilla.DefaultUpgrader, namespaces)
	srv.OnConnect = func(c *neffos.Conn) error {
		log.Printf("[%s] connected to the server", c.ID())
		return nil
	}
	srv.OnDisconnect = func(c *neffos.Conn) {
		log.Printf("[%s] disconnected from the server", c.ID())
	}
	srv.OnUpgradeError = func(err error) {
		log.Printf("upgrade error: %v", err)
	}

	mux := http.NewServeMux()
	mux.Handle("/ws", srv)
	mux.Handle("/dist/", http.StripPrefix("/dist/", http.FileServer(http.Dir("../../dist"))))
	mux.Handle("/bundler/", http.StripPrefix("/bundler/", http.FileServer(http.Dir("../bundler"))))
	mux.Handle("/", http.FileServer(http.Dir("../browser")))

	log.Printf("Listening on http://%s", addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}
