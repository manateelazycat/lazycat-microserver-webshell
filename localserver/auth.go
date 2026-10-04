package localserver

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"net/http"
	"strconv"
	"strings"
	"time"
)

func (s *Server) identity(w http.ResponseWriter, r *http.Request) {
	challenge := r.URL.Query().Get("challenge")
	if s.ctx.Err() != nil || len(challenge) != 64 {
		http.Error(w, "terminal unavailable", http.StatusUnauthorized)
		return
	}
	if _, err := hex.DecodeString(challenge); err != nil {
		http.Error(w, "invalid challenge", http.StatusBadRequest)
		return
	}
	mac := hmac.New(sha256.New, []byte(s.config.Credential))
	_, _ = mac.Write([]byte(challenge))
	w.Header().Set("Content-Type", "text/plain")
	_, _ = w.Write([]byte(hex.EncodeToString(mac.Sum(nil))))
}

func (s *Server) authorizeGateway(r *http.Request) bool {
	if subtle.ConstantTimeCompare([]byte(r.Header.Get(CredentialHeader)), []byte(s.config.Credential)) != 1 {
		return false
	}
	// Only hportal sets this header after verifying the device API token.
	if r.Header.Get(BoxHeader) != s.config.BoxID {
		return false
	}
	return true
}

func (s *Server) authorize(r *http.Request) bool {
	token := r.URL.Query().Get("ticket")
	if len(token) > 4096 {
		return false
	}
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return false
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return false
	}
	signature, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return false
	}
	mac := hmac.New(sha256.New, []byte(s.config.Secret))
	_, _ = mac.Write(payload)
	if !hmac.Equal(signature, mac.Sum(nil)) {
		return false
	}
	fields := strings.Split(string(payload), "\n")
	if len(fields) != 6 || fields[0] != s.config.InstanceID || fields[1] != s.config.AccountID ||
		fields[4] != s.config.DeviceID || fields[5] != s.config.Epoch || fields[3] == "" {
		return false
	}
	expires, err := strconv.ParseInt(fields[2], 10, 64)
	now := time.Now().Unix()
	return err == nil && expires > now && expires <= now+90
}
