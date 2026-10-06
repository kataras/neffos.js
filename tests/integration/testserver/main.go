// testserver is a real neffos (Go) server used only by
// tests/integration/go-server.test.ts. It proves the TypeScript client
// against the actual wire protocol, not a fake.
//
// Run it by hand with: go run . -addr 127.0.0.1:0
// It prints the bound address as its first stdout line, then serves the
// neffos websocket endpoint at /echo until it is killed.
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"time"

	"github.com/kataras/neffos"
	"github.com/kataras/neffos/gorilla"
)

const namespace = "default"

func main() {
	addr := flag.String("addr", "127.0.0.1:0", "address to listen on, port 0 picks a free one")
	flag.Parse()

	ln, err := net.Listen("tcp", *addr)
	if err != nil {
		log.Fatalf("listen: %v", err)
	}

	srv := neffos.New(gorilla.DefaultUpgrader, neffos.Namespaces{
		namespace: neffos.Events{
			neffos.OnNamespaceConnect: func(c *neffos.NSConn, msg neffos.Message) error {
				return nil
			},
			neffos.OnNamespaceConnected: func(c *neffos.NSConn, msg neffos.Message) error {
				// Proves a server push arrives right after connect, with no
				// client ask involved.
				c.Emit("welcome", []byte("hello"))
				return nil
			},
			neffos.OnNamespaceDisconnect: func(c *neffos.NSConn, msg neffos.Message) error {
				return nil
			},
			// echo answers both a plain emit and an ask, text or binary: it
			// replies with the same body it received, keeping the frame's
			// binary flag, so it covers emit, ask and binary in one handler.
			"echo": func(c *neffos.NSConn, msg neffos.Message) error {
				return neffos.Reply(msg.Body)
			},
			// kick asks the server to drop this connection a moment later,
			// after the ack for this emit has had time to leave, so the
			// client's reconnect logic has something to catch.
			"kick": func(c *neffos.NSConn, msg neffos.Message) error {
				conn := c.Conn
				go func() {
					time.Sleep(50 * time.Millisecond)
					conn.Close()
				}()
				return nil
			},
		},
	})

	// With ?force=1 on the endpoint the server connects the client to the
	// namespace itself, on every (re)connect, before the client asks. This is
	// the c.Connect-in-OnConnect pattern the reconnect restore must survive.
	srv.OnConnect = func(c *neffos.Conn) error {
		if c.Socket().Request().URL.Query().Get("force") != "1" {
			return nil
		}
		if _, err := c.Connect(context.Background(), namespace); err != nil {
			log.Printf("force connect: %v", err)
		}
		return nil
	}

	srv.OnUpgradeError = func(err error) {
		log.Printf("upgrade error: %v", err)
	}

	mux := http.NewServeMux()
	mux.Handle("/echo", srv)

	fmt.Println(ln.Addr().String())

	httpSrv := &http.Server{Handler: mux}
	if err := httpSrv.Serve(ln); err != nil && err != http.ErrServerClosed {
		log.Fatalf("serve: %v", err)
	}
}
