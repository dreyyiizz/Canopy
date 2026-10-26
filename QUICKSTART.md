# Canopy Quick Start Guide

## 30-Second Demo (No Hardware)

1. Double-click **`Start-Canopy.cmd`**
2. Type **`DEMO`** when asked for the COM port
3. Browser opens automatically
4. Copy the connection key from the terminal
5. Paste it into the web interface
6. Click **Connect to Arduino**
7. Try opening and closing the roof!

The demo simulates an Arduino — nothing moves, it's safe to experiment.

---

## Real Hardware Setup (5 Minutes)

### First Time: Upload Arduino Code

1. Install **Arduino IDE** from [arduino.cc](https://www.arduino.cc/en/software/)
2. Install these libraries (Tools → Manage Libraries):
   - Servo
   - DHT sensor library (by Adafruit)
   - Adafruit Unified Sensor
3. Open `firmware/CanopyUno/CanopyUno.ino`
4. Select: **Tools → Board → Arduino Uno**
5. Select: **Tools → Port → (your COM port)**
6. Click the **Upload** button (→)
7. **Close Arduino IDE's Serial Monitor** (important!)

### Every Time: Run the Web Control

1. Connect Arduino to laptop via USB
2. Double-click **`Start-Canopy.cmd`**
3. Enter your Arduino's COM port (e.g., **COM3**)
4. Browser opens automatically
5. Copy the connection key from the terminal
6. Paste it into the web interface
7. Click **Connect to Arduino**
8. Wait for "Arduino online" (green badge)
9. Control your roof!

---

## Controls

- **Open roof** — Fully open (level 30)
- **Close roof** — Fully closed (level 0)
- **Slider** — Fine control (0, 5, 10, 15, 20, 25, 30)
- **Apply position** — Send the slider value to Arduino

---

## Troubleshooting

### "No ports found"
→ Plug in your Arduino with a **data USB cable** (not charge-only)

### "Port is busy"
→ Close Arduino IDE's Serial Monitor/Plotter

### "Arduino offline"
→ Check:
- Correct COM port entered
- Arduino firmware uploaded
- USB cable connected
- Wait 3-5 seconds after connecting

### "Server offline"
→ Make sure `Start-Canopy.cmd` is still running

### Temperature shows "—"
→ Check DHT11 sensor wiring, wait for next reading (every 2 seconds)

### Roof moves wrong direction
→ Edit the servo constants in the Arduino code and re-upload

---

## What's Happening?

```
Browser          Python Server        Arduino Uno
(you control) ← HTTP localhost → (USB bridge) ← Serial → (roof hardware)
```

1. You click "Open roof" in browser
2. Browser sends HTTP request to Python server (localhost:8765)
3. Server sends serial command to Arduino via USB
4. Arduino moves servos and reads sensors
5. Arduino sends status back to server
6. Server sends status to browser
7. You see the result!

Everything stays on your laptop — no cloud, no mobile app, no network.

---

## Tips

- Keep the terminal window open while using the web interface
- The connection key changes each time you start the server
- Physical buttons on Arduino still work independently
- Demo mode is perfect for practicing before a presentation
- Press **Ctrl+C** in the terminal to stop the server

---

Need more details? See **README.md** for full documentation.
