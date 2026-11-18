package clienttransport

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/subtle"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"errors"
	"math/big"
	"net"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/wrapperspb"
)

const ServicePrefix = "cloud.lazycat.lightos.client-runtime."
const credentialHeader = "x-lightos-client-terminal"
const serverName = "lightos-runtime"

type pipeListener struct {
	ctx         context.Context
	cancel      context.CancelFunc
	connections chan net.Conn
	address     net.Addr
}

func (l *pipeListener) Accept() (net.Conn, error) {
	select {
	case conn := <-l.connections:
		return conn, nil
	case <-l.ctx.Done():
		return nil, net.ErrClosed
	}
}
func (l *pipeListener) Close() error   { l.cancel(); return nil }
func (l *pipeListener) Addr() net.Addr { return l.address }

type tunnelService interface {
	tunnel(any, grpc.ServerStream) error
}
type tunnelServer struct {
	listener   *pipeListener
	credential string
}

func (s *tunnelServer) tunnel(_ any, stream grpc.ServerStream) error {
	md, _ := metadata.FromIncomingContext(stream.Context())
	values := md.Get(credentialHeader)
	if len(values) != 1 || subtle.ConstantTimeCompare([]byte(values[0]), []byte(s.credential)) != 1 {
		return status.Error(codes.Unauthenticated, "client service credential required")
	}
	local, peer := net.Pipe()
	defer local.Close()
	defer peer.Close()
	select {
	case s.listener.connections <- local:
	case <-s.listener.ctx.Done():
		return status.Error(codes.Unavailable, "client service closed")
	case <-stream.Context().Done():
		return stream.Context().Err()
	}
	if err := stream.SendHeader(metadata.Pairs("lightos-client-transport", "1")); err != nil {
		return err
	}
	// 原 SDK 透明代理在收到第一帧后才转发响应头；空帧确认连接已获准。
	if err := stream.SendMsg(&wrapperspb.BytesValue{}); err != nil {
		return err
	}
	return forward(stream, peer)
}

// Listen 在给定的私有 gRPC listener 上装配应用服务，返回业务 HTTP listener。
// 证书只在本代 worker 内生成；公钥证书经认证心跳交给 LightOS，宿主无需 TLS 代码。
func Listen(parent context.Context, raw net.Listener, name, credential string) (net.Listener, string, error) {
	if name == "" || len(credential) < 32 {
		return nil, "", errors.New("client transport binding required")
	}
	public, private, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return nil, "", err
	}
	serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return nil, "", err
	}
	template := &x509.Certificate{SerialNumber: serial, Subject: pkix.Name{CommonName: serverName},
		DNSNames: []string{serverName}, NotBefore: time.Now().Add(-time.Minute), NotAfter: time.Now().AddDate(10, 0, 0),
		KeyUsage: x509.KeyUsageDigitalSignature, ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth}}
	der, err := x509.CreateCertificate(rand.Reader, template, template, public, private)
	if err != nil {
		return nil, "", err
	}
	ctx, cancel := context.WithCancel(parent)
	listener := &pipeListener{ctx: ctx, cancel: cancel, connections: make(chan net.Conn), address: raw.Addr()}
	server := grpc.NewServer(grpc.MaxRecvMsgSize(64 << 10))
	server.RegisterService(&grpc.ServiceDesc{ServiceName: name, HandlerType: (*tunnelService)(nil),
		Streams: []grpc.StreamDesc{{StreamName: "Tunnel", ClientStreams: true, ServerStreams: true,
			Handler: func(service any, stream grpc.ServerStream) error { return service.(tunnelService).tunnel(nil, stream) }}},
	}, &tunnelServer{listener: listener, credential: credential})
	go func() { _ = server.Serve(raw); cancel() }()
	go func() { <-ctx.Done(); server.Stop(); raw.Close() }()
	return tls.NewListener(listener, &tls.Config{MinVersion: tls.VersionTLS13,
		Certificates: []tls.Certificate{{Certificate: [][]byte{der}, PrivateKey: private}}}), base64.StdEncoding.EncodeToString(der), nil
}
