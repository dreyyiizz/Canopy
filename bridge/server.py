"""Canopy: localhost web control for Arduino plant roof. No mobile app or network required."""
import argparse
import hmac
import json
import mimetypes
import secrets
import socket
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
STALE_SECONDS = 6


class BridgeError(Exception):
    pass


def valid_level(value):
    return type(value) is int and 0 <= value <= 30 and value % 5 == 0


class RoofBridge:
    def __init__(self, port=None, demo=False, serial_factory=None):
        self.port, self.demo, self.serial_factory = port, demo, serial_factory
        self.lock = threading.RLock()
        self.command_lock = threading.Lock()
        self.closed = threading.Event()
        self.serial = None
        self.pending = None
        self.counter = 0
        self.last_received = 0
        self.error = "Waiting for Arduino. Check the COM port and USB cable."
        self.values = dict(level=None, leftLevel=None, rightLevel=None, temperature_c=None, humidity_pct=None)
        if demo:
            self.values.update(level=15, leftLevel=15, rightLevel=15, temperature_c=28.0, humidity_pct=65.0)
        self.thread = None

    def start(self):
        if not self.demo:
            self.thread = threading.Thread(target=self._read_loop, daemon=True)
            self.thread.start()

    def snapshot(self):
        with self.lock:
            age = time.monotonic() - self.last_received
            connected = self.demo or (self.serial is not None and age < STALE_SECONDS)
            return {**self.values, "connected": connected, "demo": self.demo,
                    "updated_seconds_ago": round(age, 1) if self.last_received else None,
                    "error": None if connected else self.error,
                    "leftLevel": self.values.get("leftLevel", self.values.get("level")),
                    "rightLevel": self.values.get("rightLevel", self.values.get("level"))}

    def _accept(self, message):
        if not isinstance(message, dict) or message.get("type") not in ("state", "ack"):
            return
        if not valid_level(message.get("level")):
            return
        # Also check independent levels if present
        leftLevel = message.get("leftLevel", message.get("level"))
        rightLevel = message.get("rightLevel", message.get("level"))
        if leftLevel is not None and (type(leftLevel) not in (float, int) or not (0 <= leftLevel <= 30)):
            return
        if rightLevel is not None and (type(rightLevel) not in (float, int) or not (0 <= rightLevel <= 30)):
            return
        temperature = message.get("temperature_c")
        humidity = message.get("humidity_pct")
        if temperature is not None and (type(temperature) not in (float, int) or not -40 <= temperature <= 100):
            return
        if humidity is not None and (type(humidity) not in (float, int) or not 0 <= humidity <= 100):
            return
        with self.lock:
            self.values = dict(level=message["level"], leftLevel=leftLevel, rightLevel=rightLevel,
                             temperature_c=temperature, humidity_pct=humidity)
            self.last_received = time.monotonic()
            self.error = "Arduino stopped replying. Check the USB connection."
            if message.get("type") == "ack" and self.pending and message.get("id") == self.pending["id"]:
                # Check if it's an independent control ack or parallel ack
                if "leftLevel" in self.pending and "rightLevel" in self.pending:
                    if leftLevel == self.pending["leftLevel"] and rightLevel == self.pending["rightLevel"]:
                        self.pending["result"] = self.snapshot()
                        self.pending["event"].set()
                elif message["level"] == self.pending["level"]:
                    self.pending["result"] = self.snapshot()
                    self.pending["event"].set()

    def _read_loop(self):
        while not self.closed.is_set():
            device = None
            try:
                if self.serial_factory is None:
                    import serial
                    factory = serial.Serial
                else:
                    factory = self.serial_factory
                device = factory(self.port, 9600, timeout=0.3, write_timeout=1)
                # Opening an Uno's USB serial port resets it. Wait for its bootloader.
                if self.closed.wait(2):
                    break
                device.reset_input_buffer()
                with self.lock:
                    self.serial = device
                    self.last_received = 0
                    device.write(b"GET\n")
                buffer = bytearray()
                while not self.closed.is_set():
                    chunk = device.read(256)
                    if not chunk:
                        continue
                    buffer.extend(chunk)
                    while b"\n" in buffer:
                        line, _, rest = buffer.partition(b"\n")
                        buffer = bytearray(rest)
                        if len(line) > 512:
                            continue
                        try:
                            self._accept(json.loads(line))
                        except (ValueError, UnicodeError):
                            pass
                    if len(buffer) > 1024:
                        raise BridgeError("Invalid serial data. Upload the Canopy Arduino program.")
            except Exception as exc:
                with self.lock:
                    self.error = f"Arduino unavailable: {exc}"
            finally:
                with self.lock:
                    self.serial = None
                    self.last_received = 0
                    if self.pending:
                        self.pending["error"] = "USB disconnected; command outcome is unknown."
                        self.pending["event"].set()
                if device:
                    try:
                        device.close()
                    except Exception:
                        pass
            self.closed.wait(2)

    def set_level(self, level):
        if not valid_level(level):
            raise ValueError("Level must be one of 0, 5, 10, 15, 20, 25, or 30.")
        if not self.command_lock.acquire(blocking=False):
            raise BridgeError("Another command is waiting for the Arduino. Try again shortly.")
        try:
            with self.lock:
                if self.demo:
                    self.values["level"] = level
                    self.values["leftLevel"] = level
                    self.values["rightLevel"] = level
                    return self.snapshot()
                if not self.snapshot()["connected"]:
                    raise BridgeError("Arduino offline. Reconnect USB before moving the roof.")
                self.counter += 1
                item = dict(id=self.counter, level=level, event=threading.Event())
                self.pending = item
                try:
                    self.serial.write(f"SET {self.counter} {level}\n".encode("ascii"))
                except Exception as exc:
                    raise BridgeError(f"USB write failed: {exc}") from exc
            if not item["event"].wait(3):
                raise BridgeError("Arduino did not acknowledge. The command may have arrived; check the roof before retrying.")
            if "error" in item:
                raise BridgeError(item["error"])
            return item["result"]
        finally:
            with self.lock:
                self.pending = None
            self.command_lock.release()

    def set_independent_levels(self, leftLevel, rightLevel):
        if not valid_level(leftLevel) or not valid_level(rightLevel):
            raise ValueError("Levels must be one of 0, 5, 10, 15, 20, 25, or 30.")
        if not self.command_lock.acquire(blocking=False):
            raise BridgeError("Another command is waiting for the Arduino. Try again shortly.")
        try:
            with self.lock:
                if self.demo:
                    self.values["leftLevel"] = leftLevel
                    self.values["rightLevel"] = rightLevel
                    if leftLevel == rightLevel:
                        self.values["level"] = leftLevel
                    return self.snapshot()
                if not self.snapshot()["connected"]:
                    raise BridgeError("Arduino offline. Reconnect USB before moving the roof.")
                self.counter += 1
                item = dict(id=self.counter, leftLevel=leftLevel, rightLevel=rightLevel, event=threading.Event())
                self.pending = item
                try:
                    self.serial.write(f"SETLR {self.counter} {leftLevel} {rightLevel}\n".encode("ascii"))
                except Exception as exc:
                    raise BridgeError(f"USB write failed: {exc}") from exc
            if not item["event"].wait(3):
                raise BridgeError("Arduino did not acknowledge. The command may have arrived; check the roof before retrying.")
            if "error" in item:
                raise BridgeError(item["error"])
            return item["result"]
        finally:
            with self.lock:
                self.pending = None
            self.command_lock.release()

    def close(self):
        self.closed.set()
        if self.thread:
            self.thread.join(timeout=4)


def make_handler(bridge, key):
    class Handler(BaseHTTPRequestHandler):
        server_version = "Canopy/0.1"

        def setup(self):
            super().setup()
            self.connection.settimeout(10)

        def log_message(self, fmt, *args):
            # No access keys or command bodies in logs.
            pass

        def send_json(self, status, data):
            encoded = json.dumps(data, allow_nan=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(encoded)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            try:
                self.wfile.write(encoded)
            except (BrokenPipeError, ConnectionResetError):
                pass

        def authorized(self):
            origin = self.headers.get("Origin")
            if origin and urlsplit(origin).netloc != self.headers.get("Host"):
                self.send_json(403, {"error": "Use the app or open the page directly from your laptop’s address."})
                return False
            supplied = self.headers.get("Authorization", "")
            if not hmac.compare_digest(supplied.encode(), f"Bearer {key}".encode()):
                self.send_json(401, {"error": "Connection key incorrect. Copy the key from your laptop."})
                return False
            return True

        def do_GET(self):
            path = urlsplit(self.path).path
            if path == "/api/status":
                if self.authorized():
                    self.send_json(200, bridge.snapshot())
                return
            files = {"/": "index.html", "/index.html": "index.html", "/app.js": "app.js", "/styles.css": "styles.css"}
            if path not in files:
                self.send_json(404, {"error": "Not found"})
                return
            name = files[path]
            content = (ROOT / "web" / name).read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", (mimetypes.guess_type(name)[0] or "text/plain") + "; charset=utf-8")
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Frame-Options", "DENY")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(content)

        def do_POST(self):
            path = urlsplit(self.path).path
            if path not in ("/api/roof", "/api/roof-independent"):
                self.send_json(404, {"error": "Not found"})
                return
            if not self.authorized():
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= 256:
                    raise ValueError("Invalid request length")
                if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
                    raise ValueError("Expected JSON")
                data = json.loads(self.rfile.read(length))
                
                if path == "/api/roof-independent":
                    # Independent servo control
                    if not isinstance(data, dict) or set(data) != {"leftLevel", "rightLevel"}:
                        raise ValueError("Expected leftLevel and rightLevel")
                    self.send_json(200, bridge.set_independent_levels(data["leftLevel"], data["rightLevel"]))
                else:
                    # Parallel control
                    if not isinstance(data, dict) or set(data) != {"level"}:
                        raise ValueError("Expected one roof level")
                    self.send_json(200, bridge.set_level(data["level"]))
            except (ValueError, UnicodeError) as exc:
                self.send_json(400, {"error": str(exc)})
            except BridgeError as exc:
                self.send_json(503, {"error": str(exc)})

    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", help="Arduino COM port, e.g. COM3")
    parser.add_argument("--demo", action="store_true", help="Simulate an Arduino")
    parser.add_argument("--list-ports", action="store_true")
    parser.add_argument("--bind", default="0.0.0.0")
    parser.add_argument("--http-port", default=8765, type=int)
    args = parser.parse_args()
    if args.list_ports:
        from serial.tools import list_ports
        ports = list(list_ports.comports())
        for port in ports:
            print(f"{port.device}: {port.description}")
        if not ports:
            print("No serial ports found. Plug in the Arduino's USB cable.")
        return
    if not args.demo and not args.port:
        parser.error("Choose --port COM3 (your Arduino port) or --demo")
    key_path = Path(__file__).with_name(".canopy-key")
    if not key_path.exists():
        key_path.write_text(secrets.token_urlsafe(24), encoding="utf-8")
    key = key_path.read_text(encoding="utf-8").strip()
    if len(key) < 20:
        raise SystemExit("Connection key file is invalid. Delete bridge/.canopy-key to generate a new one.")
    bridge = RoofBridge(args.port, args.demo)
    server = ThreadingHTTPServer((args.bind, args.http_port), make_handler(bridge, key))
    bridge.start()
    
    # Determine the local URL
    local_url = f"http://127.0.0.1:{args.http_port}"
    
    print("\n" + "="*60, flush=True)
    print("CANOPY - PLANT ROOF WEB CONTROL", flush=True)
    print("="*60, flush=True)
    print(f"Mode: {'DEMO - no hardware moves' if args.demo else f'USB Arduino on {args.port}'}")
    print(f"\nWeb Interface: {local_url}")
    print(f"Connection key: {key}")
    print("\nInstructions:")
    print("1. Your browser will open automatically")
    print("2. Enter the connection key shown above")
    print("3. Control your plant roof from this laptop")
    print("\nKeep this window open. Press Ctrl+C to stop.\n", flush=True)
    print("="*60 + "\n", flush=True)
    
    # Open browser automatically after a short delay
    def open_browser():
        time.sleep(1.5)
        try:
            webbrowser.open(local_url)
        except Exception as e:
            print(f"Could not open browser automatically: {e}")
            print(f"Please open {local_url} manually.\n", flush=True)
    
    browser_thread = threading.Thread(target=open_browser, daemon=True)
    browser_thread.start()
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down...", flush=True)
    finally:
        server.server_close()
        bridge.close()


if __name__ == "__main__":
    main()
