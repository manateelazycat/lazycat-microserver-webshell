//go:build linux

package unix

import (
	"context"
	"encoding/binary"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"golang.org/x/sys/unix"
	"lcmd-webshell/core"
)

// Read at most argv[0] and a possible interpreter entrypoint, never the full
// argument vector or environment. Retain only the executable/known entrypoint.
func populateProcessIdentity(p *procInfo, dir string) {
	p.Exe = strings.TrimSuffix(readProcLink(filepath.Join(dir, "exe")), " (deleted)")
	p.Cmd = filepath.Base(p.Exe)
	if p.Cmd == "." || p.Cmd == "" {
		p.Cmd = p.Comm
	}
	p.Agent = identifyAgent(p.Cmd, "")
	f, err := os.Open(filepath.Join(dir, "cmdline"))
	if err != nil {
		return
	}
	defer f.Close()
	reader := io.LimitReader(f, 4096)
	first, _ := readProcessToken(reader)
	// Some runtimes set their process title (e.g. Pi). An exact executable
	// token is accepted; arbitrary text and arguments are never searched.
	if first != "" && !strings.ContainsAny(first, " \t\r\n") {
		if a := identifyAgent(first, ""); a != nil {
			p.Agent = a
		}
	}
	switch filepath.Base(p.Exe) {
	case "node", "nodejs", "bun", "python", "python3":
		second, err := readProcessToken(reader)
		if err == nil {
			if a := identifyAgent(p.Exe, second); a != nil {
				p.Agent = a
				p.Launcher = second
				p.Cmd += " " + second
			}
		}
	}
}

// Avoid buffered read-ahead into task arguments after the second token.
func readProcessToken(reader io.Reader) (string, error) {
	var value []byte
	var one [1]byte
	for len(value) < 4096 {
		if _, err := io.ReadFull(reader, one[:]); err != nil {
			return string(value), err
		}
		if one[0] == 0 {
			return string(value), nil
		}
		value = append(value, one[0])
	}
	return "", io.ErrShortBuffer
}

func processSockets(root string, pid int) map[uint32]bool {
	result := map[uint32]bool{}
	dir := filepath.Join(root, strconv.Itoa(pid), "fd")
	f, err := os.Open(dir)
	if err != nil {
		return result
	}
	defer f.Close()
	entries, _ := f.Readdirnames(256)
	for _, entry := range entries {
		link, err := os.Readlink(filepath.Join(dir, entry))
		if err != nil {
			continue
		}
		if strings.HasPrefix(link, "socket:[") && strings.HasSuffix(link, "]") {
			n, err := strconv.ParseUint(strings.TrimSuffix(strings.TrimPrefix(link, "socket:["), "]"), 10, 32)
			if err == nil {
				result[uint32(n)] = true
			}
		}
	}
	return result
}

// Kernel socket diagnostics provide the actual peer inode without connecting
// to a user's DI socket or consuming/replaying any terminal output.
func unixSocketPeers(ctx context.Context) map[uint32]uint32 {
	result := map[uint32]uint32{}
	fd, err := unix.Socket(unix.AF_NETLINK, unix.SOCK_RAW|unix.SOCK_CLOEXEC, unix.NETLINK_SOCK_DIAG)
	if err != nil {
		return result
	}
	defer unix.Close(fd)
	_ = unix.SetsockoptTimeval(fd, unix.SOL_SOCKET, unix.SO_RCVTIMEO, &unix.Timeval{Usec: 200000})
	request := make([]byte, 40)
	order := binary.NativeEndian
	order.PutUint32(request, 40)
	order.PutUint16(request[4:], unix.SOCK_DIAG_BY_FAMILY)
	order.PutUint16(request[6:], unix.NLM_F_REQUEST|unix.NLM_F_DUMP)
	order.PutUint32(request[8:], 1)
	request[16] = unix.AF_UNIX
	order.PutUint32(request[20:], 0xffffffff)
	order.PutUint32(request[28:], 4) // UDIAG_SHOW_PEER
	order.PutUint32(request[32:], 0xffffffff)
	order.PutUint32(request[36:], 0xffffffff)
	if unix.Sendto(fd, request, 0, &unix.SockaddrNetlink{Family: unix.AF_NETLINK}) != nil {
		return result
	}
	buffer := make([]byte, 32768)
	deadline := time.Now().Add(250 * time.Millisecond)
	for total := 0; total < 2*1024*1024 && ctx.Err() == nil && time.Now().Before(deadline); {
		n, _, err := unix.Recvfrom(fd, buffer, 0)
		if err != nil {
			return result
		}
		total += n
		messages, err := syscall.ParseNetlinkMessage(buffer[:n])
		if err != nil {
			return result
		}
		for _, message := range messages {
			if message.Header.Type == unix.NLMSG_DONE || message.Header.Type == unix.NLMSG_ERROR {
				return result
			}
			data := message.Data
			if len(data) < 16 {
				continue
			}
			inode := order.Uint32(data[4:])
			for attrs := data[16:]; len(attrs) >= 4; {
				size := int(order.Uint16(attrs))
				kind := order.Uint16(attrs[2:])
				if size < 4 || size > len(attrs) {
					break
				}
				if kind == 2 && size >= 8 {
					result[inode] = order.Uint32(attrs[4:])
				}
				aligned := (size + 3) &^ 3
				if aligned > len(attrs) {
					break
				}
				attrs = attrs[aligned:]
			}
		}
	}
	return result
}

func resolveDIAgents(ctx context.Context, root string, ttys []string, foreground, all []procInfo, result map[string]PaneActivity) {
	clients := map[string][]procInfo{}
	for _, tty := range ttys {
		if result[tty].Agent != nil {
			continue
		}
		for _, p := range foreground {
			if p.FD0 == tty && p.Pgrp == p.TPgid && (filepath.Base(p.Exe) == "d" || filepath.Base(p.Exe) == "di") {
				clients[tty] = append(clients[tty], p)
			}
		}
	}
	if len(clients) == 0 {
		return
	}
	peers := unixSocketPeers(ctx)
	for tty, candidates := range clients {
		for _, client := range candidates {
			sockets := processSockets(root, client.PID)
			clientInfo, e1 := os.Stat(filepath.Join(root, strconv.Itoa(client.PID), "exe"))
			if e1 != nil {
				continue
			}
			for _, daemon := range all {
				if ctx.Err() != nil {
					return
				}
				if daemon.PID == client.PID || daemon.TTYNr != 0 || (daemon.Comm != "d" && daemon.Comm != "di") {
					continue
				}
				// DI may have been upgraded since this detached daemon started.
				// A matching executable path plus reciprocal kernel socket peers
				// keeps that existing session identifiable across atomic replacement.
				daemonInfo, e2 := os.Stat(filepath.Join(root, strconv.Itoa(daemon.PID), "exe"))
				daemonExe := strings.TrimSuffix(readProcLink(filepath.Join(root, strconv.Itoa(daemon.PID), "exe")), " (deleted)")
				if e2 != nil || (!os.SameFile(clientInfo, daemonInfo) && daemonExe != client.Exe) {
					continue
				}
				connected := false
				for inode := range processSockets(root, daemon.PID) {
					for own := range sockets {
						if peers[own] == inode && peers[inode] == own {
							connected = true
						}
					}
				}
				if !connected {
					continue
				}
				// Find the current foreground group on the daemon child's independent PTY.
				children := map[int]bool{daemon.PID: true}
				for depth := 0; depth < 16; depth++ {
					changed := false
					for _, p := range all {
						if children[p.PPID] && !children[p.PID] {
							children[p.PID] = true
							changed = true
						}
					}
					if !changed {
						break
					}
				}
				var found *core.AgentIdentity
				ambiguous := false
				for _, p := range all {
					if !children[p.PID] || p.TTYNr == 0 || p.Pgrp != p.TPgid {
						continue
					}
					populateProcessIdentity(&p, filepath.Join(root, strconv.Itoa(p.PID)))
					if p.Agent == nil {
						continue
					}
					if found != nil && found.ID != p.Agent.ID {
						ambiguous = true
						break
					}
					a := *p.Agent
					a.Source = "di"
					found = &a
				}
				if found != nil && !ambiguous {
					a := result[tty]
					a.Agent = found
					result[tty] = a
				}
			}
		}
	}
}
