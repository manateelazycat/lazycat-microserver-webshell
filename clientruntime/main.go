package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"

	"lcmd-webshell/clientruntime/launcher"
	lightosterminal "lcmd-webshell/clientruntime/managedruntime"
	"lcmd-webshell/core"
	"lcmd-webshell/hostmetrics"
	"lcmd-webshell/localserver"
	"lcmd-webshell/localtools"
	"lcmd-webshell/sshserver"
)

func main() {
	os.Exit(run())
}
func run() int {
	if len(os.Args) > 1 && os.Args[1] == "nano" {
		return localtools.RunNano(os.Args[2:])
	}
	if len(os.Args) == 2 && os.Args[1] == "version" {
		fmt.Println(core.AgentProtocolVersion)
		return 0
	}
	clearRuntimeEnvironment()
	if len(os.Args) == 2 && os.Args[1] == "host" {
		ctx, stop := signal.NotifyContext(context.Background(), shutdownSignals()...)
		defer stop()
		if err := launcher.RunHost(ctx, os.Stdin, os.Stdout); err != nil {
			fmt.Fprintln(os.Stderr, err)
			return 1
		}
		return 0
	}
	if len(os.Args) == 1 || len(os.Args) == 2 && os.Args[1] == "launcher" {
		ctx, stop := signal.NotifyContext(context.Background(), shutdownSignals()...)
		defer stop()
		if err := launcher.Run(ctx, os.Stdin, os.Stdout); err != nil {
			fmt.Fprintln(os.Stderr, err)
			return 1
		}
		return 0
	}
	if len(os.Args) != 2 || os.Args[1] != "worker" {
		fmt.Fprintln(os.Stderr, "unknown runtime mode")
		return 1
	}
	platform, cleanup, err := newPlatform()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	defer cleanup()
	ctx, stop := signal.NotifyContext(context.Background(), shutdownSignals()...)
	defer stop()
	err = lightosterminal.Run(ctx, os.Stdin, os.Stdout, core.AgentProtocolVersion,
		func(ctx context.Context, b lightosterminal.Binding) (lightosterminal.Service, error) {
			backend, err := sshserver.StartManagedWithMetrics(ctx, localserver.Config{InstanceID: b.InstanceID, AccountID: b.AccountID,
				BoxID: b.BoxID, DeviceID: b.DeviceID, Epoch: b.Epoch, Secret: b.Secret, Credential: b.Credential,
				AdmissionAllowed: b.AdmissionAllowed, Listener: b.Listener, GRPCTransport: true, ServiceName: b.ServiceName}, b.StateDir, platform, hostmetrics.New(platform))
			if err != nil {
				return nil, err
			}
			return backend, nil
		})
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	return 0
}
