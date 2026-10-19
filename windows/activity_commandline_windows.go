//go:build windows

package windows

import (
	"errors"
	"runtime"
	"unsafe"

	win "golang.org/x/sys/windows"
)

func activityProcessCreated(pid uint32) uint64 {
	handle, err := win.OpenProcess(win.PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
	if err != nil {
		return 0
	}
	defer win.CloseHandle(handle)
	var created, exited, kernel, user win.Filetime
	if win.GetProcessTimes(handle, &created, &exited, &kernel, &user) != nil {
		return 0
	}
	return uint64(created.HighDateTime)<<32 | uint64(created.LowDateTime)
}

func activityProcessCommandLine(pid uint32, created uint64) string {
	handle, err := win.OpenProcess(win.PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
	if err != nil {
		return ""
	}
	defer win.CloseHandle(handle)
	// A process may exit between the snapshot and this query. Do not read a
	// replacement process that happened to reuse its PID.
	var birth, exited, kernel, user win.Filetime
	if win.GetProcessTimes(handle, &birth, &exited, &kernel, &user) != nil ||
		uint64(birth.HighDateTime)<<32|uint64(birth.LowDateTime) != created {
		return ""
	}
	var size uint32
	err = win.NtQueryInformationProcess(handle, win.ProcessCommandLineInformation, nil, 0, &size)
	if err != nil && !errors.Is(err, win.STATUS_INFO_LENGTH_MISMATCH) &&
		!errors.Is(err, win.STATUS_BUFFER_TOO_SMALL) && !errors.Is(err, win.STATUS_BUFFER_OVERFLOW) {
		return ""
	}
	headerSize := unsafe.Sizeof(win.NTUnicodeString{})
	if size < uint32(headerSize) || size > 1<<20 {
		return ""
	}
	buffer := make([]byte, size)
	if win.NtQueryInformationProcess(handle, win.ProcessCommandLineInformation, unsafe.Pointer(&buffer[0]), size, &size) != nil {
		return ""
	}
	value := (*win.NTUnicodeString)(unsafe.Pointer(&buffer[0]))
	base, start := uintptr(unsafe.Pointer(&buffer[0])), uintptr(unsafe.Pointer(value.Buffer))
	if value.Length == 0 || value.Length%2 != 0 || value.Length > value.MaximumLength ||
		start < base+headerSize || start > base+uintptr(len(buffer)) ||
		uintptr(value.Length) > base+uintptr(len(buffer))-start {
		return ""
	}
	command := win.UTF16ToString(unsafe.Slice(value.Buffer, int(value.Length)/2))
	runtime.KeepAlive(buffer)
	return command
}
