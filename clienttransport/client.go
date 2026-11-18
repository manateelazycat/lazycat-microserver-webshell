package clienttransport

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	_ "embed"
	"encoding/base64"
	"errors"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/metadata"
)

//go:embed ca.crt
var deviceCA []byte

//go:embed oldca.crt
var previousDeviceCA []byte

type Target struct{ URL, Service, Certificate, Token string }

// ParseCertificate 校验公开登记字段的编码及大小，TLS 再验证证书用途与有效期。
func ParseCertificate(value string) (*x509.Certificate, error) {
	if len(value) > 12<<10 {
		return nil, errors.New("invalid client certificate")
	}
	der, err := base64.StdEncoding.DecodeString(value)
	if err != nil || len(der) > 8192 {
		return nil, errors.New("invalid client certificate")
	}
	return x509.ParseCertificate(der)
}

// DialTLSContext 适配标准 HTTP/WebSocket dialer；每条连接独占 RPC，关闭不影响其他请求。
func (t Target) DialTLSContext(ctx context.Context, _, _ string) (net.Conn, error) {
	ctx, finish := context.WithTimeout(ctx, 15*time.Second)
	defer finish()
	u, err := url.Parse(t.URL)
	if err != nil || u.Scheme != "https" || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" ||
		t.Service == "" || strings.ContainsAny(t.Service, "/\\\r\n") || t.Token == "" {
		return nil, errors.New("verified client transport target required")
	}
	certificate, err := ParseCertificate(t.Certificate)
	if err != nil {
		return nil, err
	}
	workerRoots := x509.NewCertPool()
	workerRoots.AddCert(certificate)
	roots, err := x509.SystemCertPool()
	if err != nil {
		return nil, err
	}
	roots.AppendCertsFromPEM(deviceCA)
	roots.AppendCertsFromPEM(previousDeviceCA)
	address := u.Host
	if u.Port() == "" {
		address = net.JoinHostPort(u.Hostname(), "443")
	}
	connection, err := grpc.NewClient("passthrough:///"+address, grpc.WithTransportCredentials(credentials.NewTLS(
		&tls.Config{RootCAs: roots, ServerName: u.Hostname(), MinVersion: tls.VersionTLS12})))
	if err != nil {
		return nil, err
	}
	run, cancel := context.WithCancel(context.WithoutCancel(ctx))
	stop := context.AfterFunc(ctx, cancel)
	defer stop()
	success := false
	defer func() {
		if !success {
			cancel()
			connection.Close()
		}
	}()
	run = metadata.NewOutgoingContext(run, metadata.Pairs("lzc_dapi_auth_token", t.Token))
	stream, err := connection.NewStream(run, &grpc.StreamDesc{ClientStreams: true, ServerStreams: true}, "/"+t.Service+"/Tunnel")
	if err != nil {
		return nil, err
	}
	headers, err := stream.Header()
	if err != nil {
		return nil, err
	}
	if values := headers.Get("lightos-client-transport"); len(values) != 1 || values[0] != "1" {
		return nil, errors.New("client transport protocol mismatch")
	}
	local, peer := net.Pipe()
	go func() { _ = forward(stream, peer); cancel(); connection.Close() }()
	secured := tls.Client(local, &tls.Config{RootCAs: workerRoots, ServerName: serverName, MinVersion: tls.VersionTLS13})
	if err = secured.HandshakeContext(ctx); err != nil {
		secured.Close()
		return nil, err
	}
	if ctx.Err() != nil {
		secured.Close()
		return nil, ctx.Err()
	}
	success = true
	return secured, nil
}

func (t Target) HTTPClient(timeout time.Duration) *http.Client {
	return &http.Client{Timeout: timeout, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
		Transport: &http.Transport{DialTLSContext: t.DialTLSContext, DisableKeepAlives: true, ResponseHeaderTimeout: 30 * time.Second}}
}
