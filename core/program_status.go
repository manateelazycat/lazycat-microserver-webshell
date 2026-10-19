package core

import (
	"regexp"
	"strconv"
	"strings"
	"time"
)

// ProgramStatus describes an application's work, independently of PTY process
// activity. Completed counts finished turns even between two metadata polls.
type ProgramStatus struct {
	State           string `json:"state"`
	Revision        uint64 `json:"revision,string"`
	Completed       uint64 `json:"completed,string"`
	CompletedOffset uint64 `json:"completed_offset,string"`
}

type programStatusTracker struct {
	ProgramStatus
	source       int
	scanner      byte
	pending      []byte
	overflow     bool
	titleSpinner bool
	updatedAt    time.Time
	outputOffset uint64
}

var programWorkingTitle = regexp.MustCompile(`(?i)^(working|thinking|running|processing|starting)(\s*[|·—-]|$)`)
var programReadyTitle = regexp.MustCompile(`(?i)^(ready|idle|done|complete|completed)(\s*[|·—-]|$)`)
var programBlockedTitle = regexp.MustCompile(`(?i)^(\[\s*[!.]\s*\]\s*)?(action required|waiting for (input|permission|approval))\b`)
var programErrorTitle = regexp.MustCompile(`(?i)^(error|failed)(\s*[|·—-]|$)`)

func (s *programStatusTracker) set(state string, source int) {
	if source < s.source {
		return
	}
	s.source = source
	s.updatedAt = time.Now()
	if state == s.State {
		return
	}
	if state == "done" || (state == "idle" && s.State == "working") {
		s.Completed++
		s.CompletedOffset = s.outputOffset
	}
	s.State = state
	s.Revision++
}

func (s *programStatusTracker) clear() {
	// Handoff/exit cleanup must not erase a failure before the next observer
	// can see it. A subsequent application state supersedes the error normally.
	if s.State != "error" {
		s.set("", s.source)
	}
	s.source = 0
	s.titleSpinner = false
}

// Observes OSC only; never edits output or retains application text. Other
// terminal string payloads are skipped, and oversized OSC stays bounded.
func (s *programStatusTracker) write(data []byte, startOffset uint64) {
	for index, ch := range data {
		s.outputOffset = startOffset + uint64(index) + 1
		switch s.scanner {
		case 0:
			if ch == '\x1b' {
				s.scanner = 1
			}
		case 1:
			switch ch {
			case ']':
				s.scanner, s.pending, s.overflow = 2, s.pending[:0], false
			case 'P', '_', '^', 'X':
				s.scanner = 4
			case '\x1b':
			default:
				s.scanner = 0
			}
		case 2, 3:
			if ch == '\a' || (s.scanner == 3 && ch == '\\') {
				if !s.overflow {
					s.observeOSC(string(s.pending))
				}
				s.scanner, s.pending = 0, s.pending[:0]
				continue
			}
			if s.scanner == 3 {
				s.overflow = true // malformed embedded escape is not a status
			}
			if ch == '\x1b' {
				s.scanner = 3
			} else {
				s.scanner = 2
				if len(s.pending) < 4096 && !s.overflow {
					s.pending = append(s.pending, ch)
				} else {
					s.overflow = true
				}
			}
		case 4:
			if ch == '\x1b' {
				s.scanner = 5
			}
		case 5:
			if ch == '\\' {
				s.scanner = 0
			} else if ch != '\x1b' {
				s.scanner = 4
			}
		}
	}
}

func (s *programStatusTracker) observeOSC(payload string) {
	code, body, ok := strings.Cut(payload, ";")
	if !ok {
		return
	}
	switch code {
	case "7501":
		for _, field := range strings.Split(body, ":") {
			if state, ok := strings.CutPrefix(field, "state="); ok {
				switch state {
				case "idle", "working", "blocked", "done", "error":
					s.set(state, 3)
				case "clear":
					s.clear()
				}
				return
			}
		}
	case "21337":
		field := strings.SplitN(body, ";", 2)[0]
		if state, ok := strings.CutPrefix(field, "status="); ok {
			switch state {
			case "Working":
				s.set("working", 2)
			case "Waiting":
				s.set("blocked", 2)
			case "Idle":
				if s.State == "working" {
					s.set("done", 2)
				} else {
					s.set("idle", 2)
				}
			case "Error":
				s.set("error", 2)
			case "":
				if s.source <= 2 {
					s.clear()
				}
			}
		}
	case "9":
		parts := strings.Split(body, ";")
		if len(parts) < 2 || parts[0] != "4" {
			return // ordinary desktop notifications are not completion events
		}
		switch parts[1] {
		case "1", "3":
			s.set("working", 2)
		case "2":
			s.set("error", 2)
		case "4":
			s.set("blocked", 2)
		case "0":
			if s.State == "working" {
				s.set("done", 2)
			} else if s.State != "done" && s.State != "error" {
				s.set("idle", 2)
			}
		}
	case "133":
		parts := strings.Split(body, ";")
		if parts[0] == "C" {
			s.set("working", 1)
		} else if parts[0] == "D" {
			if len(parts) > 1 {
				code, err := strconv.Atoi(parts[1])
				if err != nil {
					return
				}
				if code != 0 {
					s.set("error", 1)
					return
				}
			}
			s.set("done", 1)
		}
	case "0", "2":
		if s.source > 1 {
			return
		}
		title := strings.TrimSpace(body)
		spinner := strings.ContainsRune("⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏", firstProgramTitleRune(title))
		switch {
		case programBlockedTitle.MatchString(title):
			s.set("blocked", 1)
		case spinner || programWorkingTitle.MatchString(title):
			s.set("working", 1)
		case programErrorTitle.MatchString(title):
			s.set("error", 1)
		case programReadyTitle.MatchString(title) || (s.titleSpinner && s.State == "working" && title != ""):
			if s.State == "working" {
				s.set("done", 1)
			} else if s.State != "done" && s.State != "error" {
				s.set("idle", 1)
			}
		}
		s.titleSpinner = spinner
	}
}

func firstProgramTitleRune(title string) rune {
	for _, ch := range title {
		return ch
	}
	return 0
}
