package sshserver

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/google/shlex"
)

type scpOptions struct {
	send, receive, recursive, preserve, directory bool
	paths                                         []string
}
type scpStream struct {
	r       *bufio.Reader
	w       io.Writer
	options scpOptions
}

func (st *sessionState) startSCP(command string) (bool, bool) {
	args, err := shlex.Split(command)
	if err != nil || len(args) == 0 || filepath.Base(args[0]) != "scp" {
		return false, false
	}
	options := scpOptions{}
	parsing := true
	for _, arg := range args[1:] {
		if parsing && arg == "--" {
			parsing = false
			continue
		}
		if parsing && strings.HasPrefix(arg, "-") {
			for _, flag := range arg[1:] {
				switch flag {
				case 'f':
					options.send = true
				case 't':
					options.receive = true
				case 'r':
					options.recursive = true
				case 'p':
					options.preserve = true
				case 'd':
					options.directory = true
				case 'v', 'q':
				default:
					err = errors.New("unsupported SCP option")
				}
			}
		} else {
			options.paths = append(options.paths, arg)
		}
	}
	if !options.send && !options.receive {
		return false, false
	}
	if err != nil || options.send == options.receive || len(options.paths) == 0 || options.receive && len(options.paths) != 1 || st.hasPTY {
		return true, st.fail(errors.New("invalid SCP request"))
	}
	home := st.peer.server.platform.DefaultWorkingDirectory()
	for i, path := range options.paths {
		if path == "~" {
			path = home
		} else if strings.HasPrefix(path, "~/") {
			path = filepath.Join(home, path[2:])
		}
		if !filepath.IsAbs(path) {
			path = filepath.Join(home, path)
		}
		options.paths[i] = filepath.Clean(path)
	}
	st.run = func() uint32 {
		stream := &scpStream{r: bufio.NewReaderSize(st.channel, 8192), w: st.channel, options: options}
		var err error
		if options.send {
			err = stream.send()
		} else {
			err = stream.receive(options.paths[0])
		}
		if err != nil {
			_, _ = fmt.Fprintf(st.channel, "\x02scp: %s\n", strings.ReplaceAll(err.Error(), "\n", " "))
			return 1
		}
		return 0
	}
	return true, true
}
func (s *scpStream) ack() error { _, err := s.w.Write([]byte{0}); return err }
func (s *scpStream) response() error {
	code, err := s.r.ReadByte()
	if err != nil {
		return err
	}
	if code == 0 {
		return nil
	}
	line, err := s.r.ReadSlice('\n')
	if err != nil {
		return err
	}
	if len(line) > 8192 {
		return errors.New("SCP response too long")
	}
	return fmt.Errorf("SCP peer: %s", strings.TrimSpace(string(line)))
}
func (s *scpStream) record(line string) error {
	if _, err := io.WriteString(s.w, line); err != nil {
		return err
	}
	return s.response()
}
func scpName(name string) bool {
	return name != "" && name != "." && name != ".." && !strings.ContainsAny(name, "/\\:\r\n\x00")
}
func (s *scpStream) send() error {
	if err := s.response(); err != nil {
		return err
	}
	for _, pattern := range s.options.paths {
		paths := []string{pattern}
		if strings.ContainsAny(pattern, "*?[") {
			matched, err := filepath.Glob(pattern)
			if err != nil {
				return err
			}
			if len(matched) == 0 {
				return os.ErrNotExist
			}
			paths = matched
		}
		for _, path := range paths {
			if err := s.sendPath(path, 0); err != nil {
				return err
			}
		}
	}
	return nil
}
func (s *scpStream) sendPath(path string, depth int) error {
	if depth > 128 {
		return errors.New("SCP directory nesting exceeds limit")
	}
	info, err := os.Stat(path)
	if err != nil {
		return err
	}
	name := filepath.Base(path)
	if !scpName(name) {
		return errors.New("filename cannot be represented by SCP")
	}
	if s.options.preserve {
		if err = s.record(fmt.Sprintf("T%d 0 %d 0\n", info.ModTime().Unix(), info.ModTime().Unix())); err != nil {
			return err
		}
	}
	if info.IsDir() {
		if !s.options.recursive {
			return errors.New("use recursive SCP for directories")
		}
		if err = s.record(fmt.Sprintf("D%04o 0 %s\n", info.Mode().Perm(), name)); err != nil {
			return err
		}
		entries, err := os.ReadDir(path)
		if err != nil {
			return err
		}
		for _, entry := range entries {
			if err = s.sendPath(filepath.Join(path, entry.Name()), depth+1); err != nil {
				return err
			}
		}
		return s.record("E\n")
	}
	if !info.Mode().IsRegular() {
		return errors.New("SCP supports regular files and directories")
	}
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()
	if err = s.record(fmt.Sprintf("C%04o %d %s\n", info.Mode().Perm(), info.Size(), name)); err != nil {
		return err
	}
	if _, err = io.CopyN(s.w, file, info.Size()); err != nil {
		return err
	}
	if err = s.ack(); err != nil {
		return err
	}
	return s.response()
}
func (s *scpStream) receive(target string) error {
	info, err := os.Stat(target)
	isDir := err == nil && info.IsDir()
	if err != nil && !os.IsNotExist(err) {
		return err
	}
	if s.options.directory && !isDir {
		return errors.New("SCP target must be a directory")
	}
	if err = s.ack(); err != nil {
		return err
	}
	return s.receiveEntries(target, isDir, 0, false)
}

type scpTimes struct{ modified, accessed time.Time }

func (s *scpStream) receiveEntries(target string, isDir bool, depth int, nested bool) error {
	if depth > 128 {
		return errors.New("SCP directory nesting exceeds limit")
	}
	count := 0
	var times *scpTimes
	for {
		line, err := s.r.ReadSlice('\n')
		if err == io.EOF && !nested && len(line) == 0 {
			return nil
		}
		if err != nil {
			return err
		}
		text := string(line[:len(line)-1])
		if text == "" {
			return errors.New("empty SCP record")
		}
		switch text[0] {
		case 1, 2:
			return errors.New("SCP sender aborted")
		case 'E':
			if text != "E" || !nested {
				return errors.New("unexpected SCP directory end")
			}
			return s.ack()
		case 'T':
			fields := strings.Fields(text[1:])
			if len(fields) != 4 {
				return errors.New("invalid SCP timestamp")
			}
			values := make([]int64, 4)
			for i, f := range fields {
				values[i], err = strconv.ParseInt(f, 10, 64)
				if err != nil || values[i] < 0 {
					return errors.New("invalid SCP timestamp")
				}
			}
			if values[1] >= 1000000 || values[3] >= 1000000 {
				return errors.New("invalid SCP microseconds")
			}
			times = &scpTimes{time.Unix(values[0], values[1]*1000), time.Unix(values[2], values[3]*1000)}
			if err = s.ack(); err != nil {
				return err
			}
			continue
		case 'C', 'D':
		default:
			return errors.New("invalid SCP record")
		}
		fields := strings.SplitN(text[1:], " ", 3)
		if len(fields) != 3 || len(fields[0]) != 4 || !scpName(fields[2]) {
			return errors.New("invalid SCP filename or mode")
		}
		mode, e1 := strconv.ParseUint(fields[0], 8, 12)
		size, e2 := strconv.ParseInt(fields[1], 10, 64)
		if e1 != nil || e2 != nil || size < 0 || (!isDir && count > 0) {
			return errors.New("invalid SCP file record")
		}
		path := target
		if isDir {
			path = filepath.Join(target, fields[2])
		}
		count++
		// Do not follow a destination symlink chosen by a directory entry.
		if info, err := os.Lstat(path); err == nil && info.Mode()&os.ModeSymlink != 0 {
			return errors.New("SCP destination is a symbolic link")
		}
		if text[0] == 'D' {
			if !s.options.recursive || size != 0 {
				return errors.New("unexpected SCP directory")
			}
			created := false
			if err = os.Mkdir(path, 0700); err == nil {
				created = true
			} else if !os.IsExist(err) {
				return err
			}
			info, err := os.Stat(path)
			if err != nil || !info.IsDir() {
				return errors.New("SCP destination is not a directory")
			}
			if err = s.ack(); err != nil {
				return err
			}
			if err = s.receiveEntries(path, true, depth+1, true); err != nil {
				return err
			}
			if created || s.options.preserve {
				if err = os.Chmod(path, os.FileMode(mode)&0777); err != nil {
					return err
				}
			}
		} else {
			if err = s.receiveFile(path, size, os.FileMode(mode)&0777); err != nil {
				return err
			}
		}
		if times != nil && s.options.preserve {
			if err = os.Chtimes(path, times.accessed, times.modified); err != nil {
				return err
			}
		}
		times = nil
	}
}
func (s *scpStream) receiveFile(path string, size int64, mode os.FileMode) error {
	file, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode)
	if err != nil {
		return err
	}
	defer file.Close()
	if err = s.ack(); err != nil {
		return err
	}
	if _, err = io.CopyN(file, s.r, size); err != nil {
		return err
	}
	if err = s.response(); err != nil {
		return err
	}
	if s.options.preserve {
		if err = file.Chmod(mode); err != nil {
			return err
		}
	}
	if err = file.Close(); err != nil {
		return err
	}
	return s.ack()
}
