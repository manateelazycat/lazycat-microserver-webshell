#!/usr/bin/env python3
"""Build and verify the embedded LightOS package used by Android AC runs."""
from __future__ import annotations

import hashlib
import json
import os
import shlex
import signal
import socket
import subprocess
import sys
import tarfile
import time
from pathlib import Path
from uuid import uuid4

ADMIN_ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ADMIN_ROOT / "spec-tests"))

from environment.build import prepare_build, verify_build  # noqa: E402
from environment.config import read_config  # noqa: E402
from environment.adapters.physical_webshell import PhysicalWebShell  # noqa: E402


class AndroidSSHTransport:
    """Use the allocated emulator's route to the explicitly configured test host."""

    def __init__(self, settings, adb, relay):
        self.target = settings["ssh_target"]
        self.password_file = Path(settings["ssh_password_file"]).expanduser().resolve()
        if not self.target or not self.password_file.is_file():
            raise ValueError("The configured test-host SSH target or secret is unavailable")
        hostname = self.target.rsplit("@", 1)[-1]
        addresses = socket.getaddrinfo(hostname, 22, socket.AF_INET6, socket.SOCK_STREAM)
        if len({item[4][0] for item in addresses}) != 1:
            raise ValueError("The test-host IPv6 route is ambiguous")
        address = addresses[0][4][0]
        self.proxy = shlex.join([*adb, "shell", "-T", "su", "0", relay,
                                 "tcp", f"[{address}]:22"])
        self.known_hosts = ADMIN_ROOT / "spec-tests/.state/known_hosts"

    def run(self, arguments, *, input=None, timeout=60):
        environment = dict(os.environ,
                           SSH_ASKPASS=str(ADMIN_ROOT / "spec-tests/environment/ssh_askpass"),
                           SSH_ASKPASS_REQUIRE="force",
                           LIGHTOS_TEST_SSH_SECRET=str(self.password_file))
        command = ["ssh", "-T", "-o", "ConnectTimeout=15",
                   "-o", "StrictHostKeyChecking=yes",
                   "-o", "UserKnownHostsFile=" + str(self.known_hosts),
                   "-o", "NumberOfPasswordPrompts=1",
                   "-o", "ProxyCommand=" + self.proxy,
                   self.target, shlex.join(arguments)]
        child = subprocess.Popen(command, stdin=subprocess.PIPE if input is not None else subprocess.DEVNULL,
                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                 env=environment, start_new_session=True)
        try:
            stdout, _ = child.communicate(input=input, timeout=timeout)
        except subprocess.TimeoutExpired:
            os.killpg(child.pid, signal.SIGTERM)
            try: child.communicate(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid, signal.SIGKILL)
                child.communicate()
            raise ValueError("Test-host SSH through the allocated Android device timed out") from None
        if child.returncode:
            raise ValueError(f"Test-host SSH through the allocated Android device failed (exit {child.returncode})")
        return stdout


def install_via_android(build, directory):
    config = read_config()
    settings = config["settings"]
    adb_path = os.environ.get("WEBSHELL_ADB_PATH", "")
    host = os.environ.get("WEBSHELL_ADB_HOST", "")
    port = os.environ.get("WEBSHELL_ADB_PORT", "")
    serial = os.environ.get("WEBSHELL_ADB_SERIAL", "")
    if not adb_path or not host or not port.isdigit() or not serial:
        raise ValueError("The allocated Android ADB connection is required to install the LPK")
    adb = [adb_path, "-H", host, "-P", port, "-s", serial]
    source = Path(__file__).with_name("android-devtools-relay.go")
    binary = directory / "android-ssh-relay"
    build_env = dict(os.environ, GOOS="android", GOARCH="arm64", CGO_ENABLED="0")
    subprocess.run(["go", "build", "-o", str(binary), str(source)], env=build_env,
                   check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=120)
    relay = "/data/local/tmp/webshell-ssh-" + uuid4().hex
    try:
        subprocess.run([*adb, "push", str(binary), relay], check=True,
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30)
        subprocess.run([*adb, "shell", "chmod", "700", relay], check=True,
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10)
        transport = AndroidSSHTransport(settings, adb, relay)
        session = PhysicalWebShell(config, build, directory)
        session.ssh = transport
        # Check the actual mounted content and running binaries on each run.
        # A byte-identical LPK needs no disruptive same-version reinstall.
        for _ in range(10):
            try:
                observed = session.fingerprints(list(build["files"]), verify_agent=False)
                if observed == build["files"]:
                    report = {"installed": False, "method": "existing-content", "version": build["version"],
                              "lpk_sha256": build["lpk_sha256"], "files_verified": len(observed)}
                    (directory / "install-receipt.json").write_text(json.dumps(report, indent=2))
                    return report
                break
            except ValueError:
                time.sleep(1)
        containers = transport.run(["lzc-docker", "ps", "--format", "{{.Names}}"])
        names = set(containers.decode().splitlines())
        if settings["app_container"] not in names:
            raise ValueError("The configured LightOS application container is absent")
        if "cloudlazycatdevelopertools-app-1" in names:
            uid = transport.run(["lzc-docker", "exec", "-i", "cloudlazycatdevelopertools-app-1",
                                 "/lzcapp/pkg/content/debug.bridge", "uid"]).decode().strip()
            if not uid:
                raise ValueError("The test host did not report a LightOS installation user")
            transport.run(["lzc-docker", "exec", "-i", "cloudlazycatdevelopertools-app-1",
                           "/lzcapp/pkg/content/debug.bridge", "install", "--uid", uid,
                           "--pkgId", "cloud.lazycat.lightos.entry"],
                          input=Path(build["lpk"]).read_bytes(), timeout=300)
            method = "debug.bridge"
        else:
            remote_lpk = "/root/webshell-ac-" + uuid4().hex + ".lpk"
            try:
                payload = Path(build["lpk"]).read_bytes()
                transport.run(["sh", "-c", f"head -c {len(payload)} > {remote_lpk}"],
                              input=payload, timeout=180)
                uploaded = transport.run(["sha256sum", remote_lpk]).decode().split()[0]
                if uploaded != build["lpk_sha256"]:
                    raise ValueError("Uploaded LightOS LPK differs from the current build")
                transport.run(["lpk-manager", "install", remote_lpk], timeout=300)
            finally:
                transport.run(["rm", "-f", remote_lpk], timeout=30)
            method = "lpk-manager"
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            try:
                observed = session.fingerprints(list(build["files"]), verify_agent=False)
                if observed == build["files"]:
                    report = {"installed": True, "method": method, "version": build["version"],
                              "lpk_sha256": build["lpk_sha256"], "files_verified": len(observed)}
                    (directory / "install-receipt.json").write_text(json.dumps(report, indent=2))
                    return report
            except ValueError:
                pass
            time.sleep(1)
        raise ValueError("The test host did not run the installed LightOS LPK within 90 seconds")
    finally:
        subprocess.run([*adb, "shell", "rm", "-f", relay],
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=15)


def content_revision(lpk: Path) -> str:
    files: dict[str, bytes] = {}
    with tarfile.open(lpk) as outer:
        with tarfile.open(fileobj=outer.extractfile("content.tar"), mode="r|") as content:
            for member in content:
                if member.isfile() and (member.name == "lcmd-webshell" or member.name.startswith("runtime/")):
                    files[member.name] = content.extractfile(member).read()
    if "lcmd-webshell" not in files or "runtime/static/index.html" not in files:
        raise ValueError("LightOS LPK lacks the embedded WebShell service or frontend")
    digest = hashlib.sha256()
    digest.update(b"exe\x00")
    digest.update(files["lcmd-webshell"])
    digest.update(b"\x00")
    for name in sorted(key for key in files if key.startswith("runtime/")):
        digest.update(name.encode())
        digest.update(b"\x00")
        digest.update(files[name])
        digest.update(b"\x00")
    return digest.hexdigest()


def main() -> None:
    if len(sys.argv) != 3 or sys.argv[1] not in {"build", "verify", "deploy", "install"}:
        raise ValueError("usage: android-lpk.py <build|verify|deploy|install> <artifacts-dir>")
    action, directory = sys.argv[1], Path(sys.argv[2]).resolve()
    directory.mkdir(parents=True, exist_ok=True)
    metadata = directory / "build.json"
    if action == "build":
        build = prepare_build(directory)
        build["content_revision"] = content_revision(Path(build["lpk"]))
        metadata.write_text(json.dumps(build, indent=2))
        print(json.dumps({"version": build["version"], "lpk_sha256": build["lpk_sha256"],
                          "content_revision": build["content_revision"]}))
        return
    build = json.loads(metadata.read_text())
    verify_build(build)
    if content_revision(Path(build["lpk"])) != build["content_revision"]:
        raise ValueError("The batch LightOS LPK content changed during the run")
    if action == "install":
        print(json.dumps(install_via_android(build, directory)))
    elif action == "deploy":
        session = PhysicalWebShell(read_config(), build, directory)
        session.ensure_deployed()
        observed = session.fingerprints(list(build["files"]), verify_agent=False)
        if observed != build["files"]:
            raise ValueError("The running LightOS package differs from the current build")
        print(json.dumps({"deployed": True, "files_verified": len(observed)}))
    else:
        print(json.dumps({"verified": True, "content_revision": build["content_revision"]}))


if __name__ == "__main__":
    main()
