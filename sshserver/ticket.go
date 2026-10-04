package sshserver

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

	"lcmd-webshell/localserver"
)

const TicketHeader = "X-Lightos-SSH-Ticket"

type ticketGrant struct {
	revision uint64
	expires  int64
	nonce    string
	bodyHash string
}

func (h *managedHandler) authorize(r *http.Request, purpose string) (ticketGrant, bool) {
	var grant ticketGrant
	// Also check here to prevent accidental future exposure as a naked handler.
	if subtle.ConstantTimeCompare([]byte(r.Header.Get(localserver.CredentialHeader)), []byte(h.config.Credential)) != 1 || r.Header.Get(localserver.BoxHeader) != h.config.BoxID {
		return grant, false
	}
	token := r.Header.Get(TicketHeader)
	if len(token) == 0 || len(token) > 4096 {
		return grant, false
	}
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return grant, false
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return grant, false
	}
	signature, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return grant, false
	}
	mac := hmac.New(sha256.New, []byte(h.config.Secret))
	_, _ = mac.Write(payload)
	if !hmac.Equal(signature, mac.Sum(nil)) {
		return grant, false
	}
	f := strings.Split(string(payload), "\n")
	if len(f) != 11 || f[0] != "lightos-client-ssh-v1" || f[1] != purpose || f[2] != h.config.InstanceID || f[3] != h.config.AccountID || f[4] != h.config.BoxID || f[5] != h.config.DeviceID || f[6] != h.config.Epoch {
		return grant, false
	}
	grant.revision, err = strconv.ParseUint(f[7], 10, 64)
	if err != nil || purpose != "ssh-status" && grant.revision == 0 {
		return grant, false
	}
	grant.expires, err = strconv.ParseInt(f[8], 10, 64)
	now := time.Now().Unix()
	if err != nil || grant.expires <= now || grant.expires > now+90 {
		return grant, false
	}
	nonce, err := base64.RawURLEncoding.DecodeString(f[9])
	if err != nil || len(nonce) != 32 {
		return grant, false
	}
	grant.nonce, grant.bodyHash = f[9], f[10]
	if purpose == "ssh-config" {
		digest, err := hex.DecodeString(grant.bodyHash)
		return grant, err == nil && len(digest) == sha256.Size
	}
	return grant, grant.bodyHash == "-"
}
