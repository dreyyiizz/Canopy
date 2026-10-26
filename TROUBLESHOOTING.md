# Canopy Troubleshooting Guide

Complete solutions for common issues when setting up and running your plant roof control system.

---

## Table of Contents

1. [Python/Startup Issues](#pythonstartup-issues)
2. [Arduino Connection Issues](#arduino-connection-issues)
3. [Web Browser Issues](#web-browser-issues)
4. [Sensor Reading Issues](#sensor-reading-issues)
5. [Servo/Movement Issues](#servomovement-issues)
6. [Network/Port Issues](#networkport-issues)
7. [Authentication Issues](#authentication-issues)

---

## Python/Startup Issues

### "Python is missing"

**Symptom:** Error message when running `Start-Canopy.cmd`

**Solutions:**
1. Install Python 3.10 or later from [python.org](https://python.org)
2. During installation, **check "Add Python to PATH"**
3. Restart your command prompt after installation
4. Verify: Open cmd and type `python --version`

**Alternative:** If Python is installed but not in PATH:
- Find Python installation directory (usually `C:\Users\YourName\AppData\Local\Programs\Python\Python3XX`)
- Add it to system PATH manually (System Properties → Environment Variables)

---

### "Setup failed"

**Symptom:** Error during virtual environment creation or package installation

**Solutions:**

**Check 1: Python installation**
```cmd
python --version
python -m pip --version
```

**Check 2: Reinstall dependencies**
```cmd
rmdir /s /q .venv
Start-Canopy.cmd
```

**Check 3: Manual installation**
```cmd
python -m venv .venv
.venv\Scripts\python.exe -m pip install pyserial==3.5
```

**Check 4: Firewall/Antivirus**
- Some security software blocks Python or pip
- Temporarily disable and retry
- Add Python to whitelist

---

### "No serial ports found"

**Symptom:** Port list is empty when running Start-Canopy

**Solutions:**

1. **Plug in Arduino** via USB cable
2. **Verify cable** — Use a data cable (not charge-only)
3. **Check Device Manager:**
   - Press `Win + X` → Device Manager
   - Look under "Ports (COM & LPT)"
   - Arduino should appear as "Arduino Uno (COMX)"
4. **Install drivers:**
   - Download Arduino IDE from [arduino.cc](https://arduino.cc)
   - Drivers install automatically with IDE
   - Or manually install CH340/CH341 drivers if using clone board
5. **Try different USB port**
6. **Try different USB cable**

---

### "Port is busy"

**Symptom:** "Cannot access COM3: Port is busy" or similar

**Solutions:**

1. **Close Arduino Serial Monitor** (most common cause)
2. **Close Arduino Serial Plotter**
3. **Close XOD** if you're using it
4. **Close other terminal programs** (PuTTY, Tera Term, etc.)
5. **Restart your computer** (releases all port locks)

**Check what's using the port:**
```cmd
wmic path Win32_SerialPort
```

---

## Arduino Connection Issues

### "Arduino offline" (after connecting)

**Symptom:** Web interface shows "Arduino offline" even though you selected correct port

**Diagnostic Steps:**

**1. Verify firmware is uploaded**
- Open Arduino IDE
- Open `firmware/CanopyUno/CanopyUno.ino`
- Verify board is set to "Arduino Uno"
- Verify port matches what you entered
- Click Upload
- Wait for "Done uploading"
- **Close Serial Monitor before running Canopy**

**2. Check serial communication**
- Arduino IDE → Tools → Serial Monitor
- Set baud rate to **9600**
- Type `GET` and press Enter
- You should see JSON response like `{"type":"state",...}`
- If you see garbage text, baud rate is wrong
- If you see nothing, firmware not uploaded correctly
- **Close Serial Monitor after testing**

**3. Wait for Arduino reset**
- Opening USB serial port resets Arduino Uno
- Bootloader takes ~2 seconds to start
- Server waits 2 seconds automatically
- If "Arduino offline" persists, try waiting 10 seconds

**4. Check wiring**
- DHT11 must have power and be on correct pin (D2)
- Bad DHT11 wiring won't prevent connection, but check anyway

**5. Try demo mode first**
- Run with `DEMO` to verify server works
- Then switch to real Arduino to isolate hardware issues

---

### "GET" command not working

**Symptom:** Serial Monitor shows no response or errors

**Solutions:**

1. **Check baud rate:** Must be 9600
2. **Check line ending:** Arduino expects `\n` (newline)
3. **Verify firmware uploaded:** Re-upload the `.ino` file
4. **Check Serial.begin():** Should be `Serial.begin(9600)` in setup()

---

### Arduino keeps resetting

**Symptom:** Connection drops repeatedly, Arduino restarts

**Causes:**
- **Power issue:** Servos drawing too much current from USB
- **Loose USB cable**
- **Bad USB port**
- **Insufficient power supply**

**Solutions:**

1. **Use external power for servos:**
   - DO NOT power two loaded servos from Arduino 5V pin
   - Use separate 5-6V power supply for servo power pins
   - Connect grounds together (Arduino GND + servo supply GND)
   - Signal wires go to Arduino (D9, D10)

2. **Check USB cable:**
   - Try different cable
   - Try different USB port
   - Avoid USB hubs (connect directly to PC)

3. **Add capacitors:**
   - 100µF capacitor across servo power rails reduces noise
   - Helps stabilize power supply

---

## Web Browser Issues

### Browser doesn't open automatically

**Symptom:** Server starts but browser doesn't launch

**Solutions:**

1. **Manually open browser:**
   - Open any browser (Chrome, Firefox, Edge)
   - Navigate to: `http://127.0.0.1:8765`

2. **Check default browser:**
   - Windows Settings → Apps → Default apps → Web browser
   - Set your preferred browser as default

3. **Firewall blocking Python:**
   - Windows may ask to allow Python through firewall
   - Click "Allow access" for Private networks
   - If blocked, manually allow in Windows Defender Firewall settings

---

### "Cannot reach server" error

**Symptom:** Browser shows connection error or "Server offline"

**Solutions:**

1. **Verify server is running:**
   - Check terminal window where you ran `Start-Canopy.cmd`
   - Should show "Web Interface: http://127.0.0.1:8765"
   - If terminal closed, server stopped — run again

2. **Check URL:**
   - Must be exactly `http://127.0.0.1:8765`
   - NOT `localhost` (though that usually works too)
   - NOT an external IP address

3. **Check port 8765:**
   - Another program might be using port 8765
   - Close other Canopy instances
   - Or start with different port:
     ```cmd
     python bridge/server.py --demo --http-port 9000
     ```
   - Then open `http://127.0.0.1:9000`

4. **Firewall/Antivirus:**
   - Some security software blocks localhost connections
   - Add exception for Python or port 8765

---

### Connection key not working

**Symptom:** "Connection key incorrect" error

**Solutions:**

1. **Copy from terminal:**
   - The key is shown in the terminal where server is running
   - It's a random string like `AbC123XyZ789_-qwerty1234`
   - Copy-paste it exactly (case-sensitive!)

2. **Key changes each restart:**
   - If you stop and restart the server, you may get a new key
   - Enter the NEW key from the current terminal window

3. **Clear browser cache:**
   - Browser may have old key stored
   - Try Incognito/Private window
   - Or clear sessionStorage:
     - F12 → Console → Type: `sessionStorage.clear()`

4. **Reset key manually:**
   ```cmd
   del bridge\.canopy-key
   Start-Canopy.cmd
   ```
   - This generates a fresh key

---

### Controls are disabled/grayed out

**Symptom:** Cannot click buttons or move slider

**Reasons:**
- Demo mode active → Expected behavior
- Arduino offline → Fix Arduino connection first
- Command in progress → Wait for it to complete
- Connection lost → Check terminal, verify server running

---

## Sensor Reading Issues

### Temperature shows "—"

**Symptom:** Temperature reading displays dashes instead of value

**Diagnostic:**

**1. Check DHT11 wiring:**
- **VCC:** 3.3V or 5V on Arduino
- **GND:** Arduino GND
- **DATA:** Arduino pin D2
- **Pull-up resistor:** 10kΩ between VCC and DATA (some modules have built-in)

**2. Verify DHT11 library:**
```cpp
// In your Arduino code, verify:
#include <DHT.h>
#define DHTPIN 2
#define DHTTYPE DHT11
DHT dht(DHTPIN, DHTTYPE);
```

**3. Test DHT11 separately:**
- Arduino IDE → File → Examples → DHT sensor library → DHTtester
- Upload and open Serial Monitor
- Should show temperature/humidity readings
- If still fails, DHT11 may be faulty

**4. Replace DHT11:**
- DHT11 sensors can fail
- Try a known-good sensor
- Or upgrade to DHT22 (more reliable, change DHTTYPE in code)

---

### Humidity shows "—"

Same solutions as temperature — DHT11 provides both readings together.

---

### Readings are incorrect/weird

**Symptoms:** Temperature shows 0°C, humidity shows 0%, or unrealistic values

**Solutions:**

1. **Wait 2 seconds:**
   - DHT11 needs time for first reading
   - Readings update every 2 seconds

2. **Check sensor orientation:**
   - Verify correct pin connections
   - DHT11 pins: VCC, DATA, NC, GND (may vary by module)

3. **Verify it's DHT11 not DHT22:**
   - If you have DHT22, change `DHTTYPE` in Arduino code
   - Re-upload firmware

4. **Check for null values:**
   - Web interface should handle null/missing values
   - If showing 0 instead of —, that's a sensor failure

---

## Servo/Movement Issues

### Roof doesn't move

**Symptom:** Commands accepted but servos don't move

**Diagnostic Steps:**

**1. Check servo wiring:**
- **Servo 1 signal:** Arduino D9
- **Servo 2 signal:** Arduino D10
- **Servo power:** External 5-6V supply (NOT Arduino 5V)
- **Servo ground:** Connected to Arduino GND AND supply GND

**2. Verify power supply:**
- Servos need sufficient current (1A+ each under load)
- USB cannot provide enough power for two loaded servos
- Use wall adapter or battery pack rated for servo current

**3. Test servos separately:**
```cpp
// Upload this test sketch:
#include <Servo.h>
Servo servo1;
void setup() { servo1.attach(9); }
void loop() {
  servo1.write(0);
  delay(1000);
  servo1.write(90);
  delay(1000);
}
```
- Servo should sweep back and forth
- If not, check wiring or replace servo

**4. Check control value:**
- Open roof = level 30
- Close roof = level 0
- Servo may already be at target position

---

### Roof moves wrong direction

**Symptom:** "Open" closes the roof and vice versa

**Solution:**

Edit `firmware/CanopyUno/CanopyUno.ino`:

```cpp
// Near top of file, find these lines:
const int SERVO_1_CLOSED = 0;
const int SERVO_1_OPEN = 48;
const int SERVO_2_CLOSED = 180;
const int SERVO_2_OPEN = 150;

// Swap closed/open values:
const int SERVO_1_CLOSED = 48;  // Swapped
const int SERVO_1_OPEN = 0;     // Swapped
const int SERVO_2_CLOSED = 150; // Swapped
const int SERVO_2_OPEN = 180;   // Swapped
```

Re-upload to Arduino.

---

### Roof doesn't fully open/close

**Symptom:** Servos don't reach mechanical endpoints

**Solution:**

Adjust servo angle limits in Arduino code:

```cpp
// Measure actual angles needed for your mechanism
// Then update these constants:
const int SERVO_1_OPEN = 60;    // Increase if needed
const int SERVO_2_OPEN = 140;   // Decrease if needed
```

**Process:**
1. Start with small adjustments (±10 degrees)
2. Upload and test
3. Repeat until endpoints are correct
4. Don't exceed servo limits (usually 0-180°)

---

### Servos jitter or vibrate

**Causes:**
- Insufficient power
- Servo trying to move beyond mechanical limit
- Loose servo horn attachment

**Solutions:**
1. Better power supply (higher current capacity)
2. Adjust angle limits in code
3. Secure servo horn with screw
4. Add capacitor (100µF) across servo power

---

## Network/Port Issues

### "Address already in use"

**Symptom:** Error when starting server

**Cause:** Another Canopy instance or program using port 8765

**Solutions:**

1. **Close other Canopy windows:**
   - Check taskbar for other terminal windows
   - Press Ctrl+C in any running Canopy instances

2. **Find what's using port 8765:**
```cmd
netstat -ano | findstr :8765
```
   - Note the PID (process ID) in last column
   - Task Manager → Details tab → Find that PID → End task

3. **Use different port:**
```cmd
python bridge/server.py --demo --http-port 9000
```
   - Then open `http://127.0.0.1:9000`

---

## Authentication Issues

### "Connection key incorrect"

See [Web Browser Issues → Connection key not working](#connection-key-not-working)

---

### Key keeps changing

**Behavior:** Every time you restart server, key changes

**Explanation:** This is normal! Key regenerates if `bridge/.canopy-key` doesn't exist.

**To keep same key:**
- Don't delete `bridge/.canopy-key` file
- Key persists across restarts as long as file exists

**To force new key:**
```cmd
del bridge\.canopy-key
Start-Canopy.cmd
```

---

## Still Having Issues?

### Diagnostic Checklist

Go through this checklist systematically:

- [ ] Python 3.10+ installed and in PATH
- [ ] Arduino Uno recognized in Device Manager
- [ ] Arduino firmware uploaded successfully
- [ ] Serial Monitor closed before running Canopy
- [ ] Correct COM port entered
- [ ] External power supply for servos
- [ ] DHT11 wired correctly to D2
- [ ] Server running (terminal window open)
- [ ] Browser opened to `http://127.0.0.1:8765`
- [ ] Correct connection key entered
- [ ] Waited 5 seconds after connecting Arduino

### Get More Help

1. **Check logs:**
   - Terminal output shows connection status
   - Browser Console (F12) shows JavaScript errors

2. **Test in demo mode:**
   - If demo works, issue is hardware-related
   - If demo fails, issue is software-related

3. **Run unit tests:**
```cmd
python -m unittest discover -s tests -v
```
   - All 10 tests should pass
   - If tests fail, Python/server issue

4. **Simplify:**
   - Disconnect everything except Arduino USB
   - Test with just server, no servos/sensors
   - Add components one at a time

---

## Quick Reference

| Problem | Quick Fix |
|---------|-----------|
| Python not found | Install Python, check "Add to PATH" |
| No COM ports | Plug in Arduino, try different cable |
| Port busy | Close Serial Monitor |
| Arduino offline | Re-upload firmware, wait 5 seconds |
| Browser not opening | Open `http://127.0.0.1:8765` manually |
| Key incorrect | Copy from terminal window |
| Temperature "—" | Check DHT11 wiring to D2 |
| Roof doesn't move | Use external power for servos |
| Wrong direction | Swap open/close constants in code |
| Server offline | Make sure Start-Canopy.cmd is running |

---

For complete documentation, see **README.md**.
