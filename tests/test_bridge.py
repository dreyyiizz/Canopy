import importlib.util
import json
from pathlib import Path
import threading
import time
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

spec = importlib.util.spec_from_file_location("server", Path(__file__).parents[1] / "bridge" / "server.py")
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)


class BridgeTests(unittest.TestCase):
    def test_invalid_targets_cannot_move_roof(self):
        bridge = server.RoofBridge(demo=True)
        for value in [-5, 35, 1, 29, True, "15", 15.0, None]:
            with self.assertRaises(ValueError): bridge.set_level(value)
        self.assertEqual(bridge.snapshot()["level"], 15)

    def test_offline_rejects_commands_without_queue(self):
        bridge = server.RoofBridge(port="missing")
        with self.assertRaises(server.BridgeError): bridge.set_level(30)
        self.assertIsNone(bridge.pending)

    def test_command_requires_matching_ack(self):
        bridge = server.RoofBridge()
        written = []
        class Device:
            def write(self, command): written.append(command)
        bridge.serial = Device()
        bridge._accept(dict(type="state", level=0, temperature_c=28, humidity_pct=60))
        results = []
        thread = threading.Thread(target=lambda: results.append(bridge.set_level(30)))
        thread.start()
        deadline = time.monotonic() + 1
        while not written and time.monotonic() < deadline: time.sleep(.01)
        self.assertEqual(written, [b"SET 1 30\n"])
        bridge._accept(dict(type="ack", id=999, level=30))
        self.assertEqual(results, [])
        bridge._accept(dict(type="ack", id=1, level=25))
        self.assertEqual(results, [])
        bridge._accept(dict(type="ack", id=1, level=30))
        thread.join(1)
        self.assertEqual(results[0]["level"], 30)

    def test_stale_sensor_data_disables_commands(self):
        bridge = server.RoofBridge()
        bridge.serial = object()
        bridge.last_received = time.monotonic() - 10
        self.assertFalse(bridge.snapshot()["connected"])
        with self.assertRaises(server.BridgeError): bridge.set_level(0)

    def test_malformed_sensor_packets_do_not_refresh_connection(self):
        bridge = server.RoofBridge()
        for data in [[], {"type":"state","level":10,"temperature_c":float('nan')},
                     {"type":"state","level":10,"humidity_pct":110}, {"type":"state","level":-1}]:
            bridge._accept(data)
        self.assertEqual(bridge.last_received, 0)


class HttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bridge = server.RoofBridge(demo=True)
        cls.http = ThreadingHTTPServer(("127.0.0.1", 0), server.make_handler(cls.bridge, "test-key"))
        cls.thread = threading.Thread(target=cls.http.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = "http://127.0.0.1:" + str(cls.http.server_port)

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown(); cls.http.server_close(); cls.thread.join()

    def call(self, path, data=None, key="test-key", origin=None):
        headers = {"Authorization": "Bearer " + key, "Content-Type": "application/json"}
        if origin: headers["Origin"] = origin
        req = urllib.request.Request(self.base + path, data=json.dumps(data).encode() if data is not None else None, headers=headers)
        try:
            with urllib.request.urlopen(req) as response: return response.status, response.read()
        except urllib.error.HTTPError as exc: return exc.code, exc.read()

    def test_auth_required(self):
        self.assertEqual(self.call("/api/status", key="wrong")[0], 401)
        self.assertEqual(self.call("/api/roof", {"level":0}, key="wrong")[0], 401)

    def test_other_site_cannot_send_commands(self):
        self.assertEqual(self.call("/api/roof", {"level":0}, origin="http://other.test")[0], 403)

    def test_control_and_status_roundtrip(self):
        status, body = self.call("/api/roof", {"level":25})
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["level"], 25)
        status, body = self.call("/api/status")
        self.assertTrue(json.loads(body)["demo"])

    def test_bad_payloads_rejected(self):
        for data in [{"level":31}, {"level":True}, [], {"level":5,"extra":1}]:
            self.assertEqual(self.call("/api/roof", data)[0], 400)

    def test_static_files_and_private_files(self):
        self.assertEqual(self.call("/")[0], 200)
        self.assertEqual(self.call("/../bridge/.canopy-key")[0], 404)
        self.assertEqual(self.call("/.canopy-key")[0], 404)


if __name__ == "__main__": unittest.main()
