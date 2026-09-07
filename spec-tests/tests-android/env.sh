#!/usr/bin/env bash

set -euo pipefail

ANDROID_ROOT_DIR="${ANDROID_ROOT_DIR:-/home/ponzs/Android}"
export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$ANDROID_ROOT_DIR/sdk}"
export ANDROID_HOME="${ANDROID_HOME:-$ANDROID_SDK_ROOT}"
export ANDROID_USER_HOME="${ANDROID_USER_HOME:-$ANDROID_ROOT_DIR/android-user}"
export ANDROID_AVD_HOME="${ANDROID_AVD_HOME:-$ANDROID_ROOT_DIR/avd}"
export JAVA_HOME="${JAVA_HOME:-$ANDROID_ROOT_DIR/jdk17}"
export ANDROID_AVD_NAME="${ANDROID_AVD_NAME:-webshell-android-35}"

export PATH="$JAVA_HOME/bin:$ANDROID_SDK_ROOT/platform-tools:$ANDROID_SDK_ROOT/emulator:$ANDROID_SDK_ROOT/cmdline-tools/latest/bin:$PATH"

# The current desktop session is X11 :0. Override these when running elsewhere.
export DISPLAY="${DISPLAY:-:0}"
export XAUTHORITY="${XAUTHORITY:-/home/ponzs/.Xauthority}"

ANDROID_ADB="$ANDROID_SDK_ROOT/platform-tools/adb"
ANDROID_EMULATOR="$ANDROID_SDK_ROOT/emulator/emulator"
export ANDROID_ADB ANDROID_EMULATOR
