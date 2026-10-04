package sshserver

import (
	"context"
	"io"
	"net"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const TunnelProtocol = "lightos-client-ssh.v1"

func (h *managedHandler) tunnel(w http.ResponseWriter, r *http.Request, grant ticketGrant) {
	// This is a server-to-server tunnel, never a browser WebSocket endpoint.
	protocol := false
	for _, offered := range websocket.Subprotocols(r) {
		protocol = protocol || offered == TunnelProtocol
	}
	if !protocol || r.Header.Get("Origin") != "" || !websocket.IsWebSocketUpgrade(r) {
		http.Error(w, "SSH tunnel protocol required", http.StatusBadRequest)
		return
	}
	status := h.server.Status()
	if !status.Enabled || status.Revision != grant.revision {
		http.Error(w, "SSH configuration is not active", http.StatusConflict)
		return
	}
	if !h.consume(grant) {
		http.Error(w, "SSH tunnel authorization already used or expired", http.StatusUnauthorized)
		return
	}
	upgrade := websocket.Upgrader{Subprotocols: []string{TunnelProtocol}, EnableCompression: false,
		HandshakeTimeout: 12 * time.Second, ReadBufferSize: 4096, WriteBufferSize: 4096,
		CheckOrigin: func(r *http.Request) bool { return r.Header.Get("Origin") == "" }}
	ws, err := upgrade.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()
	stopOwner := context.AfterFunc(h.ctx, cancel)
	defer stopOwner()
	input, peer := net.Pipe()
	stream := &websocketStream{Conn: input, ws: ws}
	closeAll := func() { _ = ws.Close(); _ = input.Close(); _ = peer.Close() }
	defer closeAll()
	stop := context.AfterFunc(ctx, closeAll)
	defer stop()
	ws.SetReadLimit(64 << 10)
	_ = ws.SetReadDeadline(time.Now().Add(120 * time.Second))
	ws.SetPongHandler(func(string) error { return ws.SetReadDeadline(time.Now().Add(120 * time.Second)) })
	var pumps sync.WaitGroup
	pumps.Add(2)
	go func() {
		defer pumps.Done()
		defer cancel()
		for {
			kind, reader, err := ws.NextReader()
			if err != nil || kind != websocket.BinaryMessage {
				return
			}
			if _, err := io.Copy(peer, reader); err != nil {
				return
			}
		}
	}()
	go func() {
		defer pumps.Done()
		defer cancel()
		timer := time.NewTicker(15 * time.Second)
		defer timer.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-timer.C:
				// One delayed control frame is not proof that the SSH connection died.
				// The reader and its pong deadline decide when to close the transport.
				_ = ws.WriteControl(websocket.PingMessage, nil, time.Now().Add(15*time.Second))
			}
		}
	}()
	_ = h.server.ServeConn(ctx, stream, Access{Binding: h.server.binding, Revision: grant.revision})
	cancel()
	closeAll()
	pumps.Wait()
}
