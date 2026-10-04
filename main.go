package main

import (
	"lcmd-webshell/core"
	"lcmd-webshell/provider"
	unixplatform "lcmd-webshell/unix"
	"os"
)

func main() {
	runtime := core.NewRuntime(unixplatform.Platform{}, provider.ContainerTargets{})
	if runtime.HandleAgentCommand(os.Args[1:]) {
		return
	}
	provider.Run(runtime)
}
