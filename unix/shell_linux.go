//go:build linux

package unix

import (
	"fmt"
	"strings"
)

func buildShellBootstrapScript(initialCWD string) string {
	return strings.Join([]string{
		buildCurrentUserShellResolveScript(),
		buildTerminalSessionBootstrapScript(initialCWD),
		`exec "$__webshell_shell"`,
	}, "\n")
}

func buildCurrentUserShellResolveScript() string {
	return strings.Join([]string{
		`__webshell_user="$(id -un 2>/dev/null || true)"`,
		`__webshell_entry="$(getent passwd "$__webshell_user" 2>/dev/null || true)"`,
		`__webshell_shell="$(printf '%s\n' "$__webshell_entry" | cut -d: -f7)"`,
		`if [ -z "$__webshell_shell" ]; then __webshell_shell="${SHELL:-/bin/sh}"; fi`,
		`unset __webshell_user __webshell_entry`,
	}, "\n")
}

func buildTerminalSessionBootstrapScript(initialCWD string) string {
	return strings.Join([]string{
		`__webshell_tty="$(tty 2>/dev/null || true)"`,
		`case "$__webshell_tty" in /dev/pts/[0-9]*) printf '\033]777;webshell-tty=%s\a' "$__webshell_tty";; esac`,
		`unset __webshell_tty`,
		"if [ -f /run/catlink/shell-env.sh ]; then . /run/catlink/shell-env.sh; fi",
		`export SHELL="$__webshell_shell"`,
		buildClaudeTUIDefaultBootstrapScript(),
		buildInitialCWDChangeScript(initialCWD),
	}, "\n")
}

func buildClaudeTUIDefaultBootstrapScript() string {
	return `__webshell_claude_user="${user:-}"
__webshell_claude_uid="${uid:-}"
__webshell_claude_gid="${gid:-}"
__webshell_claude_home="${home:-}"
if [ -z "$__webshell_claude_user" ]; then
  __webshell_claude_user="$(id -un 2>/dev/null || true)"
fi
__webshell_claude_entry="$(getent passwd "$__webshell_claude_user" 2>/dev/null || true)"
if [ -z "$__webshell_claude_uid" ]; then
  __webshell_claude_uid="$(printf '%s\n' "$__webshell_claude_entry" | cut -d: -f3)"
fi
if [ -z "$__webshell_claude_gid" ]; then
  __webshell_claude_gid="$(printf '%s\n' "$__webshell_claude_entry" | cut -d: -f4)"
fi
if [ -z "$__webshell_claude_home" ]; then
  __webshell_claude_home="$(printf '%s\n' "$__webshell_claude_entry" | cut -d: -f6)"
fi
if [ -z "$__webshell_claude_home" ]; then
  __webshell_claude_home="${HOME:-}"
fi
if [ -n "$__webshell_claude_uid" ] && [ -n "$__webshell_claude_gid" ] && [ -n "$__webshell_claude_home" ] && [ "$__webshell_claude_home" != "/" ]; then
  __webshell_claude_config_dir="$__webshell_claude_home/.claude"
  __webshell_claude_settings_file="$__webshell_claude_config_dir/settings.json"
  if command -v claude >/dev/null 2>&1 || [ -d "$__webshell_claude_config_dir" ] || [ -f "$__webshell_claude_settings_file" ]; then
    mkdir -p "$__webshell_claude_config_dir" 2>/dev/null || true
    if [ -f "$__webshell_claude_settings_file" ]; then
      if command -v node >/dev/null 2>&1; then
        SETTINGS_FILE="$__webshell_claude_settings_file" node <<'NODE' || true
const fs = require("fs");
const file = process.env.SETTINGS_FILE;
let settings;
try {
  settings = JSON.parse(fs.readFileSync(file, "utf8"));
} catch (error) {
  process.exit(0);
}
if (!settings || Array.isArray(settings) || typeof settings !== "object" || Object.prototype.hasOwnProperty.call(settings, "tui")) {
  process.exit(0);
}
settings.tui = "default";
fs.writeFileSync(file, JSON.stringify(settings, null, 2) + "\n");
NODE
      fi
    else
      printf '%s\n' '{"tui":"default"}' > "$__webshell_claude_settings_file" 2>/dev/null || true
    fi
    chown -R "$__webshell_claude_uid:$__webshell_claude_gid" "$__webshell_claude_config_dir" 2>/dev/null || true
    chmod 700 "$__webshell_claude_config_dir" 2>/dev/null || true
    chmod 600 "$__webshell_claude_settings_file" 2>/dev/null || true
  fi
fi
unset __webshell_claude_user __webshell_claude_uid __webshell_claude_gid __webshell_claude_home __webshell_claude_entry __webshell_claude_config_dir __webshell_claude_settings_file`
}

// The callers provide fixed shell command fragments, never user-supplied code
// interpolation. All configured user values remain quoted shell variables.
func BuildUserIdentityExecScript(command, suCommand string) string {
	return fmt.Sprintf(`export HOME="$home" USER="$user" LOGNAME="$user" XDG_CONFIG_HOME="$xdg_config_home"
__webshell_current_uid=$(id -u 2>/dev/null || true)
__webshell_current_gid=$(id -g 2>/dev/null || true)
if [ "$__webshell_current_uid" = "$uid" ] && [ "$__webshell_current_gid" = "$gid" ]; then
  exec %s
fi
__webshell_switch_errors=""
if command -v setpriv >/dev/null 2>&1; then
  # Some containers permit UID/GID changes but deny setgroups(). Preserve the
  # inherited supplementary groups only when the normal initialization fails.
  for __webshell_group_mode in --init-groups --keep-groups; do
    if __webshell_switch_error=$(setpriv --reuid "$uid" --regid "$gid" "$__webshell_group_mode" /bin/sh -c 'test "$(id -u)" = "$1" && test "$(id -g)" = "$2"' webshell-user-probe "$uid" "$gid" 2>&1); then
      exec setpriv --reuid "$uid" --regid "$gid" "$__webshell_group_mode" %s
    fi
    __webshell_switch_errors="$__webshell_switch_errors
$__webshell_group_mode: $__webshell_switch_error"
  done
fi
if command -v su >/dev/null 2>&1; then
  if __webshell_su_error=$(su -s /bin/sh "$user" -c ':' </dev/null 2>&1); then
    exec %s
  fi
  __webshell_switch_errors="$__webshell_switch_errors
su: $__webshell_su_error"
fi
printf 'webshell cannot switch to the configured login user (protocol=%s).\n' >&2
printf 'current uid=%%s gid=%%s; target user=%%s uid=%%s gid=%%s\n' "$__webshell_current_uid" "$__webshell_current_gid" "$user" "$uid" "$gid" >&2
printf '%%s\n' "$__webshell_switch_errors" >&2
if [ -r /proc/$$/status ]; then
  sed -n '/^Groups:/p; /^CapEff:/p; /^NoNewPrivs:/p; /^Seccomp:/p' /proc/$$/status >&2
fi
for __webshell_identity_file in setgroups uid_map gid_map; do
  if [ -r "/proc/$$/$__webshell_identity_file" ]; then
    printf '%%s: ' "$__webshell_identity_file" >&2
    cat "/proc/$$/$__webshell_identity_file" >&2
  fi
done
exit 126
`, command, command, suCommand, AgentProtocolVersion)
}

func BuildInstanceShellBootstrapScript(username, initialCWD string) string {
	if InstanceCommandNeedsUserSwitch(username) {
		return buildUserLoginShellBootstrapScript(username, initialCWD)
	}
	return buildShellBootstrapScript(initialCWD)
}

func InstanceCommandNeedsUserSwitch(username string) bool {
	switch strings.TrimSpace(username) {
	case "", "root":
		return false
	default:
		return true
	}
}

func BuildUserShellBootstrapScript(username string) string {
	return fmt.Sprintf(`PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
user=%s
uid=$(id -u "$user" 2>/dev/null) || {
  echo "webshell user was not found."
  exit 127
}
gid=$(id -g "$user" 2>/dev/null) || {
  echo "webshell user was not found."
  exit 127
}
entry=$(getent passwd "$user" 2>/dev/null) || {
  echo "webshell user entry was not found."
  exit 127
}
home=$(printf '%%s\n' "$entry" | cut -d: -f6)
shell=$(printf '%%s\n' "$entry" | cut -d: -f7)
if [ -z "$home" ]; then
  home=/
fi
if [ -z "$shell" ]; then
  shell=/bin/sh
fi
if [ ! -d "$home" ]; then
  mkdir -p "$home"
fi
if [ "$(stat -c '%%u' "$home" 2>/dev/null || true)" != "$uid" ] || [ "$(stat -c '%%g' "$home" 2>/dev/null || true)" != "$gid" ]; then
  chown "$uid:$gid" "$home"
fi
xdg_config_home="$home/.config"
if [ ! -d "$xdg_config_home" ]; then
  mkdir -p "$xdg_config_home" 2>/dev/null || true
fi
if [ -d "$xdg_config_home" ]; then
  chown "$uid:$gid" "$xdg_config_home" 2>/dev/null || true
fi
xdg_runtime_dir="/run/user/$uid"
if [ ! -d "$xdg_runtime_dir" ]; then
  xdg_runtime_dir=""
fi
`, ShellScriptQuote(username))
}

func buildUserLoginShellBootstrapScript(username, initialCWD string) string {
	return BuildUserShellBootstrapScript(username) + `__webshell_shell="$shell"
` + buildTerminalSessionBootstrapScript(initialCWD) + `
if [ -z "$__webshell_initial_cwd" ]; then
  cd "$home" 2>/dev/null || cd /
fi
export XDG_CONFIG_HOME="$xdg_config_home"
if [ -n "$xdg_runtime_dir" ]; then
  export XDG_RUNTIME_DIR="$xdg_runtime_dir"
else
  unset XDG_RUNTIME_DIR
fi
` + BuildUserIdentityExecScript(`"$__webshell_shell"`, `su -s "$__webshell_shell" "$user"`)
}

func buildInitialCWDChangeScript(initialCWD string) string {
	cwd := strings.TrimSpace(initialCWD)
	if cwd == "" || !strings.HasPrefix(cwd, "/") {
		return `__webshell_initial_cwd=""`
	}
	return fmt.Sprintf(`__webshell_initial_cwd=%s
cd "$__webshell_initial_cwd" 2>/dev/null || __webshell_initial_cwd=""`, ShellScriptQuote(cwd))
}

func ShellScriptQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", `'"'"'`) + "'"
}
