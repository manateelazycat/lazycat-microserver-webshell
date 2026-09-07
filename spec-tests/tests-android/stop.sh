#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/env.sh"
SERVICE_NAME="webshell-android-emulator.service"

if systemctl --user is-active --quiet "$SERVICE_NAME"; then
  systemctl --user stop "$SERVICE_NAME"
  printf 'Stopped Android emulator service.\n'
else
  printf 'Android emulator service is already stopped.\n'
fi
