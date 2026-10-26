# Canopy — Plant Roof Web Control

A localhost web application for controlling your Arduino-powered plant roof directly from your laptop. No mobile app, no network setup needed — just plug in your Arduino via USB and control it through your browser.

```text
Laptop Browser  <-- localhost -->  Python Server  <-- USB -->  Arduino Uno
                                                                 |
                                                      2 servos + DHT11
```

**This is a class-project prototype.** The Arduino program compiles, and the web interface has been tested with simulated hardware. The real roof, browser, and circuit still need to be tested together.

## What is included

- `Start-Canopy.cmd` — double-click to start the server and open the web interface
- `firmware/CanopyUno/CanopyUno.ino` — Arduino program with USB communication
- `web/` — Web interface (HTML, CSS, JavaScript)
- `bridge/` — Python server that connects the web interface to Arduino
- `TECHNICAL-NOTES.md` — protocol, design explanation, and verification details

## Quick Start

### 1. Try the demo (no hardware needed)

1. Double-click **`Start-Canopy.cmd`**
2. When prompted for the Arduino COM port, type **`DEMO`** and press Enter
3. Your browser will automatically open to `http://127.0.0.1:8765`
4. Enter the **connection key** shown in the terminal window
5. Try the controls — they won't move any real hardware in demo mode

### 2. Set up the Arduino (one-time setup)

1. Install [Arduino IDE](https://www.arduino.cc/en/software/)
2. Use the Library Manager to install:
   - **Servo**
   - **DHT sensor library by Adafruit**
   - **Adafruit Unified Sensor**
3. Open `firmware/CanopyUno/CanopyUno.ino`
4. Select **Arduino Uno** and your USB port (e.g., **COM3**)
5. Review the wiring table below, then click Upload
6. **Close Serial Monitor** before starting the web control

### Wiring

These pins were taken from your original XOD file. Verify them against your actual circuit.

| Component | Arduino Pin | Notes |
| --- | --- | --- |
| DHT11 data | D2 | Temperature and humidity sensor |
| Servo 1 signal | D9 | First roof panel |
| Servo 2 signal | D10 | Second roof panel (opposite direction) |
| Open button | D8 | Physical button to open |
| Increase button | D12 | Physical button to adjust (+5) |
| Decrease button | D13 | Physical button to adjust (-5) |
| Close button | A0 / D14 | Physical button to close |

**Buttons:** Connect each button between its pin and GND (using INPUT_PULLUP).

**Servos:** Use proper power supply (not USB power for two loaded servos), common ground with Arduino.

**DHT11:** Follow your module's power and pull-up requirements.

**Calibration:** The code assumes control value 0 = closed, 30 = open. Approximate servo angles are 0–48° on D9 and 180–150° on D10. If your roof moves in the wrong direction, swap the closed/open constants in the Arduino code and re-upload.

### 3. Control your plant roof

1. Connect your Arduino Uno to your laptop via USB
2. Double-click **`Start-Canopy.cmd`**
3. Enter your Arduino's COM port (e.g., **COM3**)
4. The web interface will open automatically in your browser
5. Enter the **connection key** displayed in the terminal
6. Click **Connect to Arduino**
7. Wait for "Arduino online" status
8. Use the web controls to open, close, or adjust your roof
9. Monitor temperature and humidity readings in real-time

## Requirements

- **Python 3.10 or later** (enable "Add Python to PATH" during installation)
- **Arduino Uno** with USB cable
- **Modern web browser** (Chrome, Firefox, Edge)
- **Windows** (tested on Windows, adaptable to macOS/Linux)

The launcher (`Start-Canopy.cmd`) automatically:
- Creates an isolated Python environment
- Installs required USB library (pySerial)
- Lists available COM ports
- Starts the web server
- Opens your browser

## Features

### Web Control
- **Open/Close buttons** — Quick full open or full close
- **Slider control** — Fine adjustment in 5-unit steps (0–30)
- **Live readings** — Temperature (°C) and humidity (%) every 2 seconds
- **Visual feedback** — Animated roof diagram shows target position
- **Demo mode** — Try the interface without hardware

### Physical Controls
Your physical buttons still work independently:
- Open, Close, Increase, Decrease buttons function even when laptop is disconnected
- Last target position is saved to Arduino EEPROM

### Safety Features
- Connection key prevents unauthorized access
- Commands require acknowledgment from Arduino
- Shows controller target (not guaranteed physical position)
- Physical buttons override web commands
- USB disconnect detection with error reporting

## Troubleshooting

| Problem | Solution |
| --- | --- |
| **No COM ports listed** | Plug in Arduino with data-capable USB cable; check Device Manager |
| **Port is busy** | Close Arduino Serial Monitor, Serial Plotter, or XOD |
| **Arduino offline** | Verify correct COM port, firmware uploaded, USB connected, allow a few seconds for reset |
| **Browser doesn't open** | Manually open `http://127.0.0.1:8765` in your browser |
| **Connection key incorrect** | Copy the key from the terminal window where Start-Canopy.cmd is running |
| **Temperature shows dashes** | Check DHT11 wiring and power, wait for next reading (every 2 seconds) |
| **Roof moves wrong direction** | Edit the closed/open servo constants in the Arduino code and re-upload |
| **Address already in use** | Close any other Canopy server window before starting a new one |

## Project Architecture

**Frontend:** HTML5, CSS3, vanilla JavaScript — no framework dependencies

**Backend:** Python standard library HTTP server + pySerial for USB communication

**Arduino:** C++ sketch using Servo, DHT, and EEPROM libraries

**Communication:**
- Browser ↔ Server: HTTP REST API with bearer token authentication
- Server ↔ Arduino: 9600 baud serial, JSON messages

**Security:**
- Localhost only (127.0.0.1) — not exposed to network
- Connection key stored in `bridge/.canopy-key`
- Key regenerates if file is deleted
- No cloud services, no external accounts

## Commands and API

The web interface uses these endpoints:

```http
GET /api/status
Authorization: Bearer <key>
```

Returns current state: level, temperature, humidity, connection status.

```http
POST /api/roof
Authorization: Bearer <key>
Content-Type: application/json

{"level": 15}
```

Valid levels: 0, 5, 10, 15, 20, 25, 30 (closed to open in steps of 5).

## Advanced Usage

### Command Line Options

```bash
python bridge/server.py --port COM3        # Real Arduino
python bridge/server.py --demo             # Simulated hardware
python bridge/server.py --list-ports       # Show available COM ports
python bridge/server.py --http-port 9000   # Use different port
```

### Running Tests

```bash
python -m unittest discover -s tests -v
```

## Class Presentation Tips

1. **Start with demo mode** — Show the interface and explain the concept
2. **Connect to Arduino** — Show USB connection and live sensor readings
3. **Demonstrate controls:**
   - Close roof (watch the animation and physical movement)
   - Open roof
   - Adjust to partial opening (use slider)
   - Show temperature and humidity readings
4. **Show physical buttons** — Press a button on Arduino, watch web update
5. **Explain architecture** — Browser → Python → USB → Arduino
6. **Discuss limitations:**
   - Shows target position, not measured position
   - No position feedback sensor
   - Commands may fail if USB disconnects

## Development

Built for a plant roof class project with:
- Two servo motors controlling pivoting roof panels
- DHT11 temperature/humidity sensor
- Physical button controls
- USB connection to laptop

Original XOD project preserved in `reference/ombedfin.xodball`.

## License

Class project code. Modify as needed for your hardware setup.

## Credits

Arduino Uno firmware based on original XOD project
Web interface and Python bridge created for class demonstration
