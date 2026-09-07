# Local Android Emulator

This directory controls the user-local official Android Emulator AVD used for
WebShell Android testing.

- AVD: `webshell-android-35`
- Image: Android 15 / API 35 Google Play, x86_64
- Device profile: Pixel 6
- SDK root: `/home/ponzs/Android/sdk`
- AVD data: `/home/ponzs/Android/avd`

Start the visible emulator from the current X11 desktop:

```sh
./android-emulator/start.sh
```

Inspect readiness and device properties:

```sh
./android-emulator/status.sh
```

Stop it cleanly:

```sh
./android-emulator/stop.sh
```

The helper scripts set the SDK and Java paths themselves. `DISPLAY` defaults to
`:0` and can be overridden for another desktop session. The user service uses
`swiftshader` for stability on this host; the emulator process is kept alive by
`systemd --user` rather than by a terminal session.

The older `webshell-android-30` AVD is retained on disk for comparison, but is
not the default because its bundled Chrome 83 cannot parse the current WebShell
frontend.

To install a test APK after the emulator is ready:

```sh
source ./android-emulator/env.sh
adb install --replace path/to/app.apk
```

Do not commit emulator data or real account credentials. Once the interactive
baseline is prepared, create a dedicated test snapshot for repeatable runs.
