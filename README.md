# Canopy — plant roof group project

An Android app that opens/closes a plant roof and shows temperature and humidity. Your **Arduino Uno stays connected to a Windows laptop by USB**. The phone and laptop use the **same Wi-Fi**. The Uno does not need a wireless module.

```text
Android phone  <-- same Wi-Fi -->  Laptop running Canopy  <-- USB -->  Arduino Uno
                                                                        |
                                                             2 servos + DHT11
```

**This is a class-project prototype.** The Android installer and Arduino program compile, and the laptop connection has been tested with simulated hardware. The real roof, phone, and circuit still need to be tested together. No Arduino serial port was detected on this laptop during preparation.

## What is included

- `Canopy-Android.apk` — installable Android test app (Android 8.0 or later).
- `Start-Canopy.cmd` — double-click to start the Windows laptop bridge.
- `firmware/CanopyUno/CanopyUno.ino` — replacement Arduino program with USB communication.
- `reference/ombedfin.xodball` — unchanged copy of your original XOD project.
- `android/`, `web/`, `bridge/` — all source code for your group.
- `TECHNICAL-NOTES.md` — protocol, design explanation, and verification details.

## 1. Try the app without hardware

Copy `Canopy-Android.apk` to your Android phone and open it to install. Android may ask you to allow installation from the file source you used. This is a debug-signed classroom test build, not a Play Store release. An up-to-date Android System WebView is recommended.

The app opens in **Demo mode**. Try **Open roof**, **Close roof**, and the slider followed by **Apply position**. The sample readings are 28 °C and 65% humidity. Demo mode never sends commands to your roof.

To rehearse the laptop connection too, double-click `Start-Canopy.cmd` and enter `DEMO` at the port prompt. Follow step 4 below. The app will continue to label the laptop's simulated readings as a demo.

## 2. Prepare the Arduino once

1. Install/open [Arduino IDE](https://www.arduino.cc/en/software/).
2. Use its Library Manager to install **Servo**, **DHT sensor library by Adafruit**, and **Adafruit Unified Sensor**.
3. Open `firmware/CanopyUno/CanopyUno.ino`.
4. Select **Arduino Uno** and the correct USB port, such as **COM3**.
5. Review the pin table and servo calibration below, then upload using the IDE's arrow button. Uploading replaces the program currently running on the Uno; the original XOD file is included as a backup.
6. **Close Serial Monitor and XOD's connection** before starting the laptop bridge. Only one program can own the USB serial port at a time.

### Wiring and calibration

These pins were taken from your XOD file. Verify them against your actual circuit.

Your roof has **two pivoting panels, each hinged at its outer edge, that close inward to meet at the center**. The app's Close command moves both toward their closed targets; Open moves both toward their open targets. The two servo directions and endpoints depend on how the pivots and linkages are mounted. The opposite servo maps in the supplied XOD project are retained until those physical endpoints are checked.

| Component | Uno pin | Behavior in this program |
| --- | --- | --- |
| DHT11 data | D2 | Temperature and humidity every 2 seconds |
| Servo 1 signal | D9 | Linked to the roof control value |
| Servo 2 signal | D10 | Linked in the opposite servo direction |
| Open button | D8 | Target 30 |
| Increase button | D12 | Add 5, up to 30 |
| Decrease button | D13 | Subtract 5, down to 0 |
| Close button | A0 / D14 | Target 0 |
| Existing digital outputs | D4–D7 | Held LOW; their purpose was not identified in the file |

Buttons use `INPUT_PULLUP`: connect each button between its pin and GND. Use the servos' rated supply and a common ground with the Uno; two loaded servos should not rely on the Uno's USB power. Follow the DHT11 module's supply and pull-up requirements.

**Check the servo endpoints before attaching the roof linkage.** The XOD maps correspond approximately to **0–48° on D9** and **180–150° on D10**. This app assumes **control value 0 = closed** and **30 = open**. Those numbers are control values, not measured roof angles. If the physical motion is reversed, swap the closed/open constants for both servos near the top of the Arduino program and upload again. Adjust endpoints if your linkage requires different travel.

On first use the firmware starts at target 0. After a command, it remembers the last target across USB resets. This remembers a command, not the measured roof position.

## 3. Start the laptop bridge

1. Install **Python 3.10 or later** if needed, enabling **Add Python to PATH**. Python is already installed on the laptop used to prepare this project.
2. Keep the whole extracted `PlantRoof` folder together. Double-click **`Start-Canopy.cmd`**.
3. It lists available serial ports. Enter the Uno's port, for example `COM3`.
4. Leave the window open. It shows possible phone addresses and a **connection key**. Use the address for your laptop's Wi-Fi adapter.
5. If Windows Firewall prompts, allow this Python app on your trusted **Private** network. Do not turn the firewall off. If necessary, allow the project Python executable through Windows Firewall for Private networks.

The launcher makes an isolated Python environment and installs its bundled USB library. Once Python and the Arduino libraries are installed, the demo needs no internet connection; the Wi-Fi network only carries local messages.

## 4. Connect the phone

1. Join the phone and laptop to the **same Wi-Fi**.
2. In Canopy, tap the gear or **Connect**.
3. Enter the laptop address shown in its window, for example `http://192.168.1.20:8765`.
4. Enter the connection key from that same window.
5. Tap **Connect to laptop**. Wait for **Arduino online**.
6. Try one small slider step with **Apply position**, then check the physical roof. Test the full open/close endpoints after confirming the direction and travel.

The phone must use the laptop's Wi-Fi address, **not** `localhost` or `127.0.0.1`. To find the correct address when several are listed, run `ipconfig` on the laptop and look for **Wireless LAN adapter Wi-Fi → IPv4 Address**.

**Browser fallback:** the same interface also works at the laptop address in the phone's browser. Enter the connection key to leave demo mode. This is useful if APK installation is restricted on a school phone.

## During your presentation

- Keep the laptop awake, the bridge window open, and the USB cable connected.
- Show open, close, a partial opening, temperature, humidity, and the physical buttons.
- The app displays the Arduino's **requested target**, not proof that the roof moved. The supplied project has no position-feedback sensor.
- If USB or Wi-Fi is lost, remote controls become unavailable. The firmware keeps the last target and physical buttons still work while the Uno has power. This app has no hardware emergency-stop function.
- Use demo mode if you want to explain the interface before moving the model.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| No ports listed | Plug in the Uno using a data-capable USB cable; check Device Manager and the board's USB driver. |
| Port is busy | Close Arduino Serial Monitor, Serial Plotter, and XOD. |
| Laptop connected, Arduino offline | Correct COM port, Canopy firmware uploaded, USB connected, and a few seconds allowed for the Uno to reset. |
| Phone cannot reach laptop | Same Wi-Fi, current laptop IPv4 address, bridge window open, and Windows Firewall Private-network access. Guest/school Wi-Fi may block communication between devices. |
| Connection key incorrect | Copy the key from the currently running bridge window. |
| Temperature/humidity show dashes | Check the DHT11 wiring and power, then wait for its next reading. |
| Roof moves in the wrong direction | Recheck the four closed/open servo constants and calibrate the mechanism. |
| Address already in use | Close another running Canopy bridge window before starting a second copy. |

The bridge is for your trusted local Wi-Fi. Its HTTP connection is not encrypted; do not expose port 8765 to the internet or set up router port forwarding. There are no cloud accounts or paid services.

## Explain the project in class

The Android app sends a desired roof opening to the laptop over Wi-Fi. The laptop converts it to a USB serial command. The Arduino adjusts both servos and acknowledges the new target. It also sends DHT11 readings back through the laptop to the phone. The original physical buttons continue to work without the phone.
