// Build for android/arm64. The scoped device-hub ADB channel disallows host
// forwarding, so this helper relays one connection from the selected Android
// emulator to its WebView DevTools socket or the test host's SSH service.
package main

import (
	"fmt"
	"io"
	"net"
	"os"
	"strings"
)

func main() {
	var network, address string
	if len(os.Args) == 2 && (os.Args[1] == "chrome_devtools_remote" ||
		strings.HasPrefix(os.Args[1], "webview_devtools_remote_")) {
		network, address = "unix", "@"+os.Args[1]
	} else if len(os.Args) == 3 && os.Args[1] == "tcp" &&
		strings.HasSuffix(os.Args[2], ":22") {
		network, address = "tcp", os.Args[2]
	} else {
		os.Exit(2)
	}
	conn, err := net.Dial(network, address)
	if err != nil {
		_, _ = fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	defer conn.Close()
	go func() {
		_, _ = io.Copy(conn, os.Stdin)
	}()
	_, _ = io.Copy(os.Stdout, conn)
}
