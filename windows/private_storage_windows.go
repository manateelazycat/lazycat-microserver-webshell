//go:build windows

package windows

import (
	"errors"
	"os"

	win "golang.org/x/sys/windows"
)

// ProtectPrivateStorage applies a protected DACL to the caller-owned terminal
// key directory/file, not to its parent or the rest of the user's configuration.
// The current local user and SYSTEM retain access; inherited broad grants do not.
func ProtectPrivateStorage(path string, directory bool) error {
	info, err := os.Lstat(path)
	if err != nil {
		return err
	}
	if info.Mode()&os.ModeSymlink != 0 || info.IsDir() != directory || !directory && !info.Mode().IsRegular() {
		return errors.New("invalid private terminal storage")
	}
	user, err := win.GetCurrentProcessToken().GetTokenUser()
	if err != nil {
		return err
	}
	inherit := ""
	if directory {
		inherit = "OICI"
	}
	descriptor, err := win.SecurityDescriptorFromString("D:P(A;" + inherit + ";FA;;;SY)(A;" + inherit + ";FA;;;" + user.User.Sid.String() + ")")
	if err != nil {
		return err
	}
	dacl, _, err := descriptor.DACL()
	if err != nil {
		return err
	}
	return win.SetNamedSecurityInfo(path, win.SE_FILE_OBJECT, win.DACL_SECURITY_INFORMATION|win.PROTECTED_DACL_SECURITY_INFORMATION, nil, nil, dacl, nil)
}
