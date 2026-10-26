# Implementation notes

## Components

| Layer | Implementation |
| --- | --- |
| Web Interface | HTML5, CSS3, vanilla JavaScript |
| Server | Python standard-library HTTP server + pySerial 3.5 |
| Arduino | C++ sketch for Uno; Servo, DHT, and EEPROM libraries |
| Communication | Localhost HTTP (127.0.0.1:8765), bearer token authentication |

There is no mobile app, database, online hosting, login service, paid API, or Wi-Fi network requirement. Everything runs on a single laptop. The server automatically opens your browser on startup.

Version 0.1.1 shows two separate outer pivots, with both free panel ends meeting at the center when closed, matching the confirmed pivot placement. The illustrated travel is schematic and independent of the firmware's calibrated servo angles. This visual correction does not change the original servo targets or the USB protocol.

## Relationship to the XOD project

The supplied project has one patch, `@/main`. It controls two servos from one buffered control value; it does not independently position each roof half. Its arithmetic adjusts that value in steps of 5, with a 0–30 bound. DHT11 readings are sampled every 2 seconds. No serial command handler or network link exists in the supplied patch.

The replacement sketch keeps the observed pin assignments, shared control range, approximate servo mappings, and button functions. It adds USB commands, JSON telemetry, debouncing, and persistent last target in EEPROM. D4–D7 are configured LOW; their physical roles are unknown. Verify the new sketch against the actual circuit before operating it.

The original XOD file is not altered. It cannot receive the new web interface's commands without a compatible serial handler; upload the supplied sketch to use this web control.

## API and serial protocol

Every API call requires `Authorization: Bearer <connection-key>`.

```http
GET /api/status
POST /api/roof
Content-Type: application/json

{"level":15}
```

Allowed targets: 0, 5, 10, 15, 20, 25, 30. The app converts the target to a percentage of this range. It does not interpret the number as the real roof angle.

USB runs at **9600 baud**, newline-delimited ASCII. The laptop sends:

```text
GET
SET 42 15
```

The Arduino replies:

```json
{"type":"ack","id":42,"level":15,"temperature_c":28.0,"humidity_pct":65.0}
```

It also sends `type: "state"` messages every 2 seconds and after physical button changes. Sensor errors are represented as `null`, not fabricated data. Acknowledgement means the Arduino accepted a target; it is not motion completion.

The bridge waits up to 3 seconds for the matching command ID and level. It rejects overlapping commands, invalid targets, missing keys, and commands while offline. It does not replay pending commands on reconnect. State becomes stale after 6 seconds without a valid Arduino message. The web interface polls every 2 seconds and disables commands after errors or stale state.

The generated key is stored in `bridge/.canopy-key`, which is excluded from the shared ZIP and source-control rules. Delete that file while the server is stopped to generate a replacement next time. The browser retains the entered key in sessionStorage. The web interface only loads files from the same origin (localhost).

## Web Interface Architecture

The web interface is a single-page application that runs entirely in the browser:

- **No build process** — Plain HTML, CSS, and JavaScript
- **No frameworks** — Vanilla JavaScript for minimal complexity
- **Localhost only** — Connects to `http://127.0.0.1:8765` (same machine)
- **Auto-connect** — Server opens browser automatically on startup
- **Session persistence** — Connection key saved in sessionStorage
- **Real-time updates** — Polls status every 2 seconds
- **Visual feedback** — Animated SVG diagram shows roof position

The interface removes all mobile/network complexity from the original design. No IP address entry, no Wi-Fi setup, no mobile app installation required.

## Build and Development

The web interface requires no build process — just edit HTML, CSS, and JavaScript files directly.

The Python server uses only standard library modules except pySerial. To install dependencies manually:

```bash
python -m pip install pyserial==3.5
```

Or use the bundled vendor folder:

```bash
python -m pip install --no-index --find-links bridge/vendor -r bridge/requirements.txt
```

## Verification performed

- Python server successfully starts and serves web interface
- Web interface loads and displays demo mode correctly
- Ten Python tests pass: level validation, offline rejection, acknowledgement matching, stale status, invalid telemetry, API key checks, origin rejection, command/status roundtrip, invalid payloads, and private-file isolation
- Arduino Uno sketch successfully compiled with Arduino AVR core 1.8.8, Servo 1.3.0, DHT sensor library 1.4.7, and Adafruit Unified Sensor 1.1.15. Output: 9,652 bytes flash and 382 bytes static RAM
- JavaScript syntax checked. Browser UI checked for demo open/close, one-step positioning, connection to server demo, command sent through the API, and disabled controls after stopping the server
- No physical Arduino device was connected for end-to-end hardware verification. Actual motion, sensor accuracy, real USB reconnection, and mechanical calibration remain to be checked with your hardware

Run the bridge tests from the project root:

```text
python -m unittest discover -s tests -v
```

## Helpful official references

- [Upload a sketch with Arduino IDE](https://docs.arduino.cc/software/ide-v2/tutorials/getting-started/ide-v2-uploading-a-sketch/)
- [pySerial documentation](https://pyserial.readthedocs.io/en/stable/shortintro.html)
- [XOD servo library](https://xod.io/libs/xod-dev/servo/)
