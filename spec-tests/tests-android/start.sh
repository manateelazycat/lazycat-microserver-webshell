#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/env.sh"

LOG_FILE="$SCRIPT_DIR/runtime/emulator.log"
SERVICE_NAME="webshell-android-emulator.service"

if [[ ! -x "$ANDROID_EMULATOR" ]]; then
  printf 'Android emulator not found: %s\n' "$ANDROID_EMULATOR" >&2
  printf 'Install the SDK packages before starting this AVD.\n' >&2
  exit 1
fi

mkdir -p "$SCRIPT_DIR/runtime" "$ANDROID_USER_HOME" "$ANDROID_AVD_HOME"
export ANDROID_EMULATOR_HOME="$ANDROID_USER_HOME"

if systemctl --user is-active --quiet "$SERVICE_NAME"; then
  printf 'Android emulator service is already active.\n'
else
  systemctl --user start "$SERVICE_NAME"
  printf 'Started Android emulator service.\n'
fi

"$ANDROID_ADB" start-server >/dev/null
serial=""
for _ in $(seq 1 180); do
  serial="$($ANDROID_ADB devices | awk '$2 == "device" && $1 ~ /^emulator-[0-9]+$/ { print $1; exit }')"
  if [[ -n "$serial" ]]; then
    boot_completed="$($ANDROID_ADB -s "$serial" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')"
    if [[ "$boot_completed" == "1" ]]; then
      printf 'Android emulator is ready: %s\n' "$serial"
      printf 'Window display: %s\n' "$DISPLAY"
      exit 0
    fi
  fi
  sleep 1
done

printf 'Timed out waiting for Android boot. Recent emulator log:\n' >&2
tail -80 "$LOG_FILE" >&2 || true
exit 1
