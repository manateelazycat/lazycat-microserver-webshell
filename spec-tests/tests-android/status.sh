#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/env.sh"

printf 'AVD: %s\n' "$ANDROID_AVD_NAME"
printf 'Display: %s\n' "$DISPLAY"
printf 'SDK: %s\n' "$ANDROID_SDK_ROOT"
printf '\nADB devices:\n'
"$ANDROID_ADB" devices -l

serial="$($ANDROID_ADB devices | awk '$2 == "device" && $1 ~ /^emulator-[0-9]+$/ { print $1; exit }')"
if [[ -n "$serial" ]]; then
  printf '\nSelected device: %s\n' "$serial"
  printf 'Android release: '
  "$ANDROID_ADB" -s "$serial" shell getprop ro.build.version.release
  printf 'Model: '
  "$ANDROID_ADB" -s "$serial" shell getprop ro.product.model
  printf 'Boot completed: '
  "$ANDROID_ADB" -s "$serial" shell getprop sys.boot_completed
else
  printf '\nNo ready emulator device found.\n'
fi
