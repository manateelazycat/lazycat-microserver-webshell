package main

import "fmt"

// The callers provide fixed shell command fragments, never user-supplied code
// interpolation. All configured user values remain quoted shell variables.
func buildUserIdentityExecScript(command, suCommand string) string {
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
`, command, command, suCommand, agentProtocolVersion)
}
