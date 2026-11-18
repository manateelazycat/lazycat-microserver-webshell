package clienttransport

import (
	"context"
	"errors"
	"io"
	"net"

	"google.golang.org/protobuf/types/known/wrapperspb"
)

// 每个 RPC 承载一条连接，net.Pipe 负责截止时间、关闭和读写同步。
// 没有额外流复用或无限缓冲；gRPC 和 Pipe 的背压直接传递到业务连接。
type messageStream interface {
	Context() context.Context
	SendMsg(any) error
	RecvMsg(any) error
}

func forward(stream messageStream, pipe net.Conn) error {
	defer pipe.Close()
	done := make(chan error, 2)
	go func() {
		buffer := make([]byte, 32<<10)
		for {
			n, err := pipe.Read(buffer)
			if n > 0 {
				if sendErr := stream.SendMsg(&wrapperspb.BytesValue{Value: append([]byte(nil), buffer[:n]...)}); sendErr != nil {
					done <- sendErr
					return
				}
			}
			if err != nil {
				done <- err
				return
			}
		}
	}()
	go func() {
		for {
			var frame wrapperspb.BytesValue
			if err := stream.RecvMsg(&frame); err != nil {
				done <- err
				return
			}
			if len(frame.Value) > 32<<10 {
				done <- errors.New("client transport frame too large")
				return
			}
			if _, err := pipe.Write(frame.Value); err != nil {
				done <- err
				return
			}
		}
	}()
	select {
	case err := <-done:
		if errors.Is(err, io.EOF) || errors.Is(err, net.ErrClosed) || errors.Is(err, io.ErrClosedPipe) {
			return nil
		}
		return err
	case <-stream.Context().Done():
		return stream.Context().Err()
	}
}
