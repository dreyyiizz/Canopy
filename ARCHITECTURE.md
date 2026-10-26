# Canopy Architecture

## Overview

Canopy is a localhost web application for controlling an Arduino-powered plant roof. Everything runs on a single laptop — no mobile apps, no network configuration, no cloud services.

## System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                       YOUR LAPTOP                           │
│                                                             │
│  ┌──────────────────┐         ┌──────────────────┐        │
│  │   Web Browser    │  HTTP   │  Python Server   │        │
│  │                  │ ◄─────► │                  │        │
│  │  • Control UI    │ :8765   │  • HTTP API      │        │
│  │  • Live sensors  │         │  • Serial bridge │        │
│  │  • Visualization │         │  • Auth & state  │        │
│  └──────────────────┘         └──────────────────┘        │
│                                         │                   │
│                                         │ USB Serial        │
└─────────────────────────────────────────┼───────────────────┘
                                          │
                                          ▼
                                ┌──────────────────┐
                                │  Arduino Uno     │
                                │                  │
                                │  • Servo control │
                                │  • DHT11 sensor  │
                                │  • Button input  │
                                └──────────────────┘
                                          │
                                          ▼
                                ┌──────────────────┐
                                │  Plant Roof      │
                                │                  │
                                │  • 2 servos      │
                                │  • DHT11         │
                                │  • 4 buttons     │
                                └──────────────────┘
```

## Component Details

### Web Browser (Frontend)
- **Technology:** Vanilla JavaScript, HTML5, CSS3
- **Location:** `web/` directory
- **Entry point:** `http://127.0.0.1:8765`
- **Features:**
  - Real-time roof position control
  - Temperature and humidity display
  - Animated visualization of roof state
  - Demo mode for testing
  - Auto-refresh status every 2 seconds

### Python Server (Backend)
- **Technology:** Python standard library HTTP server + pySerial
- **Location:** `bridge/server.py`
- **Port:** 8765 (localhost only)
- **Features:**
  - REST API for roof control
  - USB serial communication with Arduino
  - Bearer token authentication
  - Automatic browser launch on startup
  - Command acknowledgment tracking
  - State management and caching

### Arduino Uno (Hardware Controller)
- **Technology:** C++ (Arduino framework)
- **Location:** `firmware/CanopyUno/CanopyUno.ino`
- **Baud rate:** 9600
- **Features:**
  - Dual servo control (linked, opposite directions)
  - DHT11 sensor reading (every 2 seconds)
  - Physical button input (4 buttons)
  - JSON serial protocol
  - EEPROM target persistence
  - Command acknowledgment

## Communication Flow

### Opening the Roof

```
1. User clicks "Open roof" button
   │
   ▼
2. Browser sends POST /api/roof {"level": 30}
   │ HTTP with Bearer token
   ▼
3. Python server validates:
   ✓ Auth token correct
   ✓ Arduino online
   ✓ No pending command
   │
   ▼
4. Server sends "SET 1 30\n" via USB serial
   │ 9600 baud
   ▼
5. Arduino receives command:
   • Validates level (0-30, step of 5)
   • Moves both servos (opposite directions)
   • Saves target to EEPROM
   │
   ▼
6. Arduino replies {"type":"ack","id":1,"level":30,...}
   │
   ▼
7. Server matches acknowledgment by ID and level
   │
   ▼
8. Server returns status to browser
   │
   ▼
9. Browser updates UI:
   • Roof position animation
   • Status badge ("Arduino online")
   • Success message
```

### Status Updates

```
Every 2 seconds in Arduino:
┌──────────────────────────────────────┐
│ 1. Read DHT11 sensor                 │
│ 2. Check physical buttons            │
│ 3. Send {"type":"state",...}         │
└──────────────────────────────────────┘
         │
         ▼ Serial
┌──────────────────────────────────────┐
│ Python server receives state         │
│ • Updates cached values              │
│ • Marks connection as alive          │
└──────────────────────────────────────┘
         │
         ▼ HTTP poll (every 2 seconds)
┌──────────────────────────────────────┐
│ Browser fetches GET /api/status      │
│ • Shows current level                │
│ • Updates temperature & humidity     │
│ • Animates roof visualization        │
└──────────────────────────────────────┘
```

## Data Format

### HTTP API

#### GET /api/status
```json
{
  "level": 15,
  "temperature_c": 28.0,
  "humidity_pct": 65.0,
  "connected": true,
  "demo": false,
  "updated_seconds_ago": 0.5,
  "error": null
}
```

#### POST /api/roof
Request:
```json
{
  "level": 20
}
```

Response: (same as /api/status)

### Serial Protocol (USB)

Server → Arduino:
```
GET\n
SET 42 15\n
```

Arduino → Server:
```json
{"type":"state","level":15,"temperature_c":28.0,"humidity_pct":65.0}
{"type":"ack","id":42,"level":15,"temperature_c":28.0,"humidity_pct":65.0}
```

## Security Model

### Authentication
- **Connection key:** 24-character URL-safe token
- **Storage:** `bridge/.canopy-key` (auto-generated)
- **Transmission:** HTTP Bearer token
- **Browser storage:** sessionStorage (cleared on browser close)

### Network Isolation
- **Binding:** 127.0.0.1 only (not 0.0.0.0)
- **No external access:** Cannot be reached from other devices
- **No encryption needed:** Traffic never leaves the laptop
- **CORS protection:** Rejects requests from other origins

### Input Validation
- **Roof levels:** 0, 5, 10, 15, 20, 25, 30 only
- **Sensor bounds:** Temperature -40°C to 100°C, Humidity 0-100%
- **Command queuing:** One command at a time
- **Timeout protection:** 3 seconds for Arduino acknowledgment

## File Structure

```
Canopy/
├── Start-Canopy.cmd          # Windows launcher
├── README.md                  # User documentation
├── QUICKSTART.md              # Getting started guide
├── ARCHITECTURE.md            # This file
├── TECHNICAL-NOTES.md         # Implementation details
│
├── web/                       # Frontend
│   ├── index.html            # Main UI
│   ├── app.js                # JavaScript logic
│   └── styles.css            # Styling
│
├── bridge/                    # Backend
│   ├── server.py             # Python HTTP server
│   ├── requirements.txt      # Dependencies (pyserial)
│   ├── vendor/               # Bundled packages
│   └── .canopy-key           # Auth token (generated)
│
├── firmware/                  # Arduino
│   └── CanopyUno/
│       └── CanopyUno.ino     # Arduino sketch
│
└── tests/                     # Unit tests
    └── test_bridge.py        # Server tests
```

## Development Workflow

### Running Locally
1. `Start-Canopy.cmd` → Launches server in demo mode or with Arduino
2. Browser auto-opens to `http://127.0.0.1:8765`
3. Edit files in `web/` → Refresh browser to see changes
4. Edit `bridge/server.py` → Restart server to test
5. Edit `firmware/CanopyUno.ino` → Upload to Arduino

### Testing
```bash
# Run Python unit tests
python -m unittest discover -s tests -v

# Test with demo mode (no hardware)
python bridge/server.py --demo

# Test with real Arduino
python bridge/server.py --port COM3
```

### Debugging
- **Browser DevTools:** Network tab shows HTTP requests
- **Terminal output:** Server logs connection and command activity
- **Arduino Serial Monitor:** Debug messages (close before running server)

## Design Decisions

### Why Localhost Only?
- **Simplicity:** No network configuration
- **Security:** No exposure to other devices
- **Reliability:** No Wi-Fi dependencies
- **Speed:** No network latency

### Why No Build Process?
- **Accessibility:** Any developer can edit
- **Debugging:** View source = actual source
- **Dependencies:** No npm, webpack, etc.
- **Portability:** Works on any Python environment

### Why Bearer Token Auth?
- **Standard:** HTTP Authorization header
- **Simple:** Single token, no sessions
- **Secure:** Random 24-char token
- **Stateless:** Server doesn't track sessions

### Why Polling Instead of WebSocket?
- **Simplicity:** Standard HTTP only
- **Compatibility:** Works everywhere
- **Reliability:** Auto-reconnects on error
- **Sufficient:** 2-second poll is fast enough for plant roof

## Future Enhancements

Possible improvements (not implemented):

- **WebSocket:** Real-time updates instead of polling
- **HTTPS:** Self-signed cert for encrypted localhost
- **Multi-Arduino:** Control multiple roofs
- **Scheduling:** Timed open/close based on time of day
- **Data logging:** CSV export of temperature/humidity history
- **Mobile responsive:** Better layout for tablets
- **Dark mode:** UI theme toggle
- **Voice control:** Integration with speech recognition

## Comparison to Original Design

| Feature | Original (Mobile + Wi-Fi) | New (Localhost) |
|---------|---------------------------|-----------------|
| Control device | Android phone | Web browser |
| Network | Wi-Fi required | Localhost only |
| Setup complexity | IP address, key, Wi-Fi | Just connection key |
| Deployment | APK installation | Open browser |
| Platform | Android 8+ | Any browser |
| Dependencies | Android SDK, Gradle | Python 3.10+ |
| Security model | Network + auth | Localhost + auth |
| Use case | Remote control | Direct laptop control |

The localhost version trades remote access for simplicity and reliability.
