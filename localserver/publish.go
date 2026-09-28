package localserver

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"io"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

const (
	publishTicketHeader = "X-Lightos-Client-Publish-Ticket"
	publishProtocol     = "lightos-client-publish.v1"
)

type publishTarget struct {
	host string
	port int
}

// A publish ticket is separate from browser-terminal and SSH tickets. The
// destination is signed by LightOS, never taken from an untrusted query value.
func (s *Server) publishTarget(r *http.Request) (publishTarget, bool) {
	token := r.Header.Get(publishTicketHeader)
	if len(token) == 0 || len(token) > 4096 {
		return publishTarget{}, false
	}
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return publishTarget{}, false
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return publishTarget{}, false
	}
	signature, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return publishTarget{}, false
	}
	mac := hmac.New(sha256.New, []byte(s.config.Secret))
	_, _ = mac.Write(payload)
	if !hmac.Equal(signature, mac.Sum(nil)) {
		return publishTarget{}, false
	}
	fields := strings.Split(string(payload), "\n")
	if len(fields) != 11 || fields[0] != "lightos-client-publish-v1" || fields[1] != s.config.InstanceID ||
		fields[2] != s.config.AccountID || fields[3] != s.config.BoxID || fields[4] != s.config.DeviceID ||
		fields[5] != s.config.Epoch || fields[6] == "" {
		return publishTarget{}, false
	}
	host := fields[7]
	if host == "" || len(host) > 255 || strings.ContainsAny(host, "\x00\r\n/?#@") {
		return publishTarget{}, false
	}
	port, err := strconv.Atoi(fields[8])
	if err != nil || port < 1 || port > 65535 {
		return publishTarget{}, false
	}
	expires, err := strconv.ParseInt(fields[9], 10, 64)
	now := time.Now().Unix()
	if err != nil || expires <= now || expires > now+90 {
		return publishTarget{}, false
	}
	nonce, err := base64.RawURLEncoding.DecodeString(fields[10])
	if err != nil || len(nonce) != 32 {
		return publishTarget{}, false
	}
	return publishTarget{host: host, port: port}, true
}

func (s *Server) publishConnect(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet || r.Header.Get("Origin") != "" || !websocket.IsWebSocketUpgrade(r) {
		http.Error(w, "publish tunnel protocol required", http.StatusBadRequest)
		return
	}
	target, ok := s.publishTarget(r)
	if !ok {
		http.Error(w, "publish authorization denied", http.StatusUnauthorized)
		return
	}
	protocol := false
	for _, offered := range websocket.Subprotocols(r) {
		protocol = protocol || offered == publishProtocol
	}
	if !protocol {
		http.Error(w, "publish tunnel protocol required", http.StatusBadRequest)
		return
	}
	upgrade := websocket.Upgrader{Subprotocols: []string{publishProtocol}, EnableCompression: false,
		CheckOrigin: func(request *http.Request) bool { return request.Header.Get("Origin") == "" }}
	ws, err := upgrade.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer ws.Close()
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return
	}
	s.sockets[ws] = struct{}{}
	s.mu.Unlock()
	defer func() { s.mu.Lock(); delete(s.sockets, ws); s.mu.Unlock() }()
	ws.SetReadLimit(64 << 10)
	// The managed WebSocket handshake must not wait for DNS or a slow upstream.
	// This deadline bounds only the initial dial, never an established service.
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	stopOwner := context.AfterFunc(s.ctx, cancel)
	upstream, err := (&net.Dialer{}).DialContext(ctx, "tcp", net.JoinHostPort(target.host, strconv.Itoa(target.port)))
	stopOwner()
	cancel()
	if err != nil {
		_ = ws.WriteControl(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseInternalServerErr, "target unavailable"), time.Now().Add(time.Second))
		return
	}
	defer upstream.Close()
	finished := make(chan error, 2)
	go func() {
		for {
			kind, reader, err := ws.NextReader()
			if err != nil {
				finished <- err
				return
			}
			if kind != websocket.BinaryMessage {
				finished <- errors.New("binary publish frames required")
				return
			}
			if _, err := io.Copy(upstream, reader); err != nil {
				finished <- err
				return
			}
		}
	}()
	go func() {
		buffer := make([]byte, 16<<10)
		for {
			n, err := upstream.Read(buffer)
			if n > 0 {
				_ = ws.SetWriteDeadline(time.Now().Add(30 * time.Second))
				if writeErr := ws.WriteMessage(websocket.BinaryMessage, buffer[:n]); writeErr != nil {
					finished <- writeErr
					return
				}
			}
			if err != nil {
				finished <- err
				return
			}
		}
	}()
	<-finished
	_ = ws.WriteControl(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""), time.Now().Add(time.Second))
	_ = ws.Close()
	_ = upstream.Close()
	<-finished
}
