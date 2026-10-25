// Bootstrap with the host Go from this standalone build-only module.
// The terminal module uses the returned compiler without changing system Go.
package main

import (
	"context"
	"fmt"
	"lcmd-webshell/clientruntime/buildtools/terminalgo"
	"os"
	"os/signal"
	"syscall"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	path, err := terminalgo.Ensure(ctx)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	fmt.Println(path)
}
