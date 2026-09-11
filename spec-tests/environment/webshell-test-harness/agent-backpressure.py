#!/usr/bin/env python3
"""Real Agent/PTY regression: a subscriber pauses reads during history replay."""
import argparse
import base64
import json
from pathlib import Path
import re
import socket
import struct
import subprocess
import tempfile
import time

parser = argparse.ArgumentParser()
parser.add_argument("--binary", required=True)
parser.add_argument("--result", required=True)
args = parser.parse_args()
report = {"status": "failed", "kind": "real-agent-backpressure"}
started = time.monotonic()
clients = []

with tempfile.TemporaryDirectory(prefix="webshell-agent-") as directory:
    address = str(Path(directory) / "agent.sock")
    identity = {"selector": "pressure@local.entry", "account_id": "pressure", "terminal_scrollback": 100000}
    log = open(Path(directory) / "agent.log", "wb")
    daemon = subprocess.Popen([str(Path(args.binary).resolve()), "agent", "daemon", "--socket", address,
                               "--selector", identity["selector"], "--account", "pressure"], stdout=log, stderr=log)

    def connect(request):
        client = socket.socket(socket.AF_UNIX)
        client.settimeout(10)
        client.connect(address)
        client.sendall((json.dumps({**identity, **request}) + "\n").encode())
        return client

    def request(body):
        with connect(body) as client:
            data = b""
            while b"\n" not in data:
                chunk = client.recv(65536)
                if not chunk:
                    raise EOFError("Agent closed a control request without a response")
                data += chunk
            response = json.loads(data.split(b"\n", 1)[0])
            if not response.get("ok"):
                raise RuntimeError(response.get("error", "Agent request failed"))
            return response.get("state")

    def exact(client, size):
        data = bytearray()
        while len(data) < size:
            chunk = client.recv(size - len(data))
            if not chunk:
                raise EOFError("Agent closed the slow subscriber before output drained")
            data.extend(chunk)
        return bytes(data)

    def frame(client):
        header = exact(client, 5)
        return header[:1], exact(client, struct.unpack(">I", header[1:])[0])

    def command(client, code):
        encoded = base64.b64encode(code.encode()).decode()
        payload = f"bash -c \"$(printf %s '{encoded}' | base64 -d)\"\n".encode()
        client.sendall(b"I" + struct.pack(">I", len(payload)) + payload)

    def until(client, marker, timeout=20):
        data = bytearray()
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            kind, payload = frame(client)
            if kind == b"B":
                data.extend(payload)
                if marker in data[-(len(payload) + len(marker)):]:
                    return bytes(data)
                if len(data) > 8 * 1024 * 1024:
                    del data[:-1024 * 1024]
        raise TimeoutError("Real PTY marker did not arrive")

    tab_id = None
    try:
        for _ in range(100):
            if Path(address).exists():
                break
            if daemon.poll() is not None:
                raise RuntimeError("Agent exited before listening")
            time.sleep(0.05)
        state = request({"type": "state", "cols": 120, "rows": 32})
        tab_id = state["tabs"][0]["id"]
        pane = state["tabs"][0]["panes"][0]
        report["tty"] = pane.get("tty")
        warm = connect({"type": "attach", "pane_id": pane["id"], "cols": 120, "rows": 32})
        clients.append(warm)
        while True:
            kind, payload = frame(warm)
            if kind == b"T" and json.loads(payload).get("type") == "history-replay-complete":
                break
        report["phase"] = "history-prepare"
        command(warm, "printf 'REALTTY='; tty; for ((i=0;i<4096;i++)); do printf 'H%06d %01013d\\n' \"$i\" 0; if ((i%10==9)); then sleep 0.001; fi; done; printf 'HISTORY_READY\\n'")
        history = until(warm, b"HISTORY_READY")
        report["preparedBytes"] = len(history)
        report["tty"] = re.search(rb"REALTTY=(/dev/[^\r\n]+)", history).group(1).decode()
        report["phase"] = "paused-subscriber"
        slow = connect({"type": "attach", "pane_id": pane["id"], "cols": 120, "rows": 32})
        clients.append(slow)
        # The product writer is blocked on the real Unix socket while this
        # subscriber does not read. Another real attachment drives the PTY.
        time.sleep(0.1)
        command(warm, "for ((i=0;i<600;i++)); do printf 'L%06d %0503d\\n' \"$i\" 0; sleep 0.005; done; printf 'LIVE_FINISHED\\n'")
        until(warm, b"LIVE_FINISHED")
        received = until(slow, b"LIVE_FINISHED")
        sequences = [int(value) for value in re.findall(rb"L(\d{6}) ", received)]
        report["receivedBytes"] = len(received)
        report["receivedRecords"] = len(sequences)
        report["sequenceRange"] = sequences[:3] + sequences[-3:]
        if sequences != list(range(600)):
            raise RuntimeError("Slow subscriber lost, duplicated or reordered live PTY records")
        report["status"] = "passed"
    except Exception as error:
        report["error"] = str(error)
    finally:
        for client in clients:
            client.close()
        if tab_id:
            try:
                request({"type": "action", "action": {"action": "close_tab", "tab_id": tab_id}})
            except Exception as error:
                report["cleanupError"] = str(error)
                report["status"] = "failed"
        daemon.terminate()
        try:
            daemon.wait(timeout=5)
        except subprocess.TimeoutExpired:
            daemon.kill()
            daemon.wait()
        log.close()
        report["durationMs"] = round((time.monotonic() - started) * 1000)
        output = Path(args.result)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps(report))
raise SystemExit(0 if report["status"] == "passed" else 1)
