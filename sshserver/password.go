package sshserver

import (
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

// Keep the verifier format in PROTOCOL.md aligned with the management provider.
const passwordHashPrefix = "$pbkdf2-sha256$600000$"
const passwordIterations = 600000

// Passwords are never persisted. Only this bounded-cost verifier crosses the
// authenticated configuration boundary; it must never be returned to a browser.
func HashPassword(password []byte) (string, error) {
	if len(password) == 0 {
		return "", errors.New("SSH password must not be empty")
	}
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	key, err := pbkdf2.Key(sha256.New, string(password), salt, passwordIterations, 32)
	if err != nil {
		return "", err
	}
	return passwordHashPrefix + base64.RawStdEncoding.EncodeToString(salt) + "$" + base64.RawStdEncoding.EncodeToString(key), nil
}

func validatePasswordHash(hash string) error {
	if strings.HasPrefix(hash, passwordHashPrefix) {
		if _, _, ok := parsePasswordHash(hash); ok {
			return nil
		}
		return errors.New("invalid SSH password verifier")
	}
	if len(hash) != 60 {
		return errors.New("invalid SSH password verifier")
	}
	cost, err := bcrypt.Cost([]byte(hash))
	if err != nil || cost < 10 || cost > 14 {
		return errors.New("unsupported SSH password verifier cost")
	}
	return nil
}

func verifyPassword(hash string, password []byte) bool {
	if len(password) == 0 {
		return false
	}
	if strings.HasPrefix(hash, passwordHashPrefix) {
		salt, expected, ok := parsePasswordHash(hash)
		if !ok {
			return false
		}
		key, err := pbkdf2.Key(sha256.New, string(password), salt, passwordIterations, 32)
		return err == nil && subtle.ConstantTimeCompare(key, expected) == 1
	}
	// Legacy bcrypt must not silently authenticate a truncated long password.
	return len(password) <= 72 && validatePasswordHash(hash) == nil && bcrypt.CompareHashAndPassword([]byte(hash), password) == nil
}

func parsePasswordHash(value string) (salt, key []byte, ok bool) {
	if len(value) != len(passwordHashPrefix)+22+1+43 || !strings.HasPrefix(value, passwordHashPrefix) {
		return nil, nil, false
	}
	saltText, keyText, found := strings.Cut(strings.TrimPrefix(value, passwordHashPrefix), "$")
	if !found {
		return nil, nil, false
	}
	encoding := base64.RawStdEncoding.Strict()
	salt, err := encoding.DecodeString(saltText)
	if err != nil || len(salt) != 16 || encoding.EncodeToString(salt) != saltText {
		return nil, nil, false
	}
	key, err = encoding.DecodeString(keyText)
	if err != nil || len(key) != 32 || encoding.EncodeToString(key) != keyText {
		return nil, nil, false
	}
	return salt, key, true
}
