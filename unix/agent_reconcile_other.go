//go:build darwin

package unix

func reconcileAgentDaemons(socketPath, selector, accountID string, replaceActive bool) (int, error) {
	return 0, nil
}
