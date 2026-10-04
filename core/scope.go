package core

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"
)

type AgentScope struct {
	Selector  string
	AccountID string
}

func NormalizeAgentScope(selector, accountID string) AgentScope {
	return AgentScope{
		Selector:  strings.TrimSpace(selector),
		AccountID: strings.TrimSpace(accountID),
	}
}

func (s AgentScope) CacheKey() string {
	selector := strings.TrimSpace(s.Selector)
	accountID := strings.TrimSpace(s.AccountID)
	if accountID == "" {
		return selector
	}
	return selector + "\x00" + accountID
}

func (s AgentScope) Hash() string {
	sum := sha256.Sum256([]byte(s.CacheKey()))
	return hex.EncodeToString(sum[:])
}
