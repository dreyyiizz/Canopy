# Implementation notes

## Components

| Layer | Implementation |
| --- | --- |
| Android app | Small Java Activity, bundled HTML/CSS/JavaScript interface, native HTTP transport |
| Laptop | Python standard-library HTTP server + pySerial 3.5 |
| Arduino | C++ sketch for Uno; Servo, DHT, and EEPROM libraries |
| Network | Local Wi-Fi, port 8765, bearer connection key |

There is no database, online hosting, login service, paid API, or automatic weather logic. The laptop must remain on. Both the app and laptop have explicit demo modes.

Version 0.1.1 shows two separate outer pivots, with both free panel ends meeting at the center when closed, matching the confirmed pivot placement. The illustrated travel is schematic and independent of the firmware's calibrated servo angles. This visual correction does not change the original servo targets or the USB protocol.

## Relationship to the XOD project

The supplied project has one patch, `@/main`. It controls two servos from one buffered control value; it does not independently position each roof half. Its arithmetic adjusts that value in steps of 5, with a 0–30 bound. DHT11 readings are sampled every 2 seconds. No serial command handler or Wi-Fi/Bluetooth link exists in the supplied patch.

The replacement sketch keeps the observed pin assignments, shared control range, approximate servo mappings, and button functions. It adds USB commands, JSON telemetry, debouncing, and persistent last target in EEPROM. D4–D7 are configured LOW; their physical roles are unknown. Verify the new sketch against the actual circuit before operating it.

The original XOD file is not altered. It cannot receive the new app's commands without a compatible serial handler; upload the supplied sketch to use this bridge.

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

The bridge waits up to 3 seconds for the matching command ID and level. It rejects overlapping commands, invalid targets, missing keys, and commands while offline. It does not replay pending commands on reconnect. State becomes stale after 6 seconds without a valid Arduino message. The app polls every 2 seconds and disables commands after errors or stale state.

The generated key is stored in `bridge/.canopy-key`, which is excluded from the shared ZIP and source-control rules. Delete that file while the bridge is stopped to generate a replacement next time. The app retains the entered key for its session. The Android UI only loads bundled files; it cannot navigate to remote pages with access to its native bridge.

## Build the Android app from source

Open the `android` folder in Android Studio and let it sync. The project includes its Gradle wrapper. Install Android SDK 35, use JDK 17 or newer compatible with Gradle 8.13, and choose **Build APK(s)**.

Command-line equivalent from `android`:

```text
gradlew.bat assembleDebug lintDebug
```

The resulting file is `app/build/outputs/apk/debug/app-debug.apk`. The included `Canopy-Android.apk` is a debug-signed test build, suitable for a group demonstration. Keep your build machine's signing identity if you want to update installed copies without uninstalling them.

The app targets Android 15 (API 35) and supports Android 8.0 (API 26) onward. Build versions are pinned to AGP 8.13.2 and Gradle 8.13, a documented compatible combination: [Android build compatibility](https://developer.android.com/build/releases/agp-8-13-0-release-notes).

## Verification performed

- Android debug APK successfully compiled.
- Android lint: no errors; five advisory warnings covering newer SDK/build versions, the intentional JavaScript-enabled bundled UI, and Android backup policy guidance.
- Arduino Uno sketch successfully compiled with Arduino AVR core 1.8.8, Servo 1.3.0, DHT sensor library 1.4.7, and Adafruit Unified Sensor 1.1.15. Output: 9,652 bytes flash and 382 bytes static RAM.
- Ten Python tests pass: level validation, offline rejection, acknowledgement matching, stale status, invalid telemetry, API key checks, origin rejection, command/status roundtrip, invalid payloads, and private-file isolation.
- JavaScript syntax checked. Browser UI checked for demo open/close, one-step positioning, connection to laptop demo, a command sent through the laptop API, and disabled controls after stopping the laptop bridge.
- No physical Android device or Uno/roof circuit was connected for end-to-end hardware verification. Actual motion, sensor accuracy, real USB reconnection, phone networking, and mechanical calibration remain to be checked with your group.

Run the bridge tests from the project root:

```text
python -m unittest discover -s tests -v
```

## Helpful official references

- [Upload a sketch with Arduino IDE](https://docs.arduino.cc/software/ide-v2/tutorials/getting-started/ide-v2-uploading-a-sketch/)
- [pySerial documentation](https://pyserial.readthedocs.io/en/stable/shortintro.html)
- [XOD servo library](https://xod.io/libs/xod-dev/servo/)
