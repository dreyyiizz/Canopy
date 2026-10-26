# Changelog

## Version 2.0 - Localhost Web Control (Current)

**Major architectural change:** Replaced Android mobile app + Wi-Fi bridge with direct localhost web control.

### What Changed

#### Removed
- ❌ Android mobile app (`Canopy-Android.apk`)
- ❌ Android source code (`android/` directory)
- ❌ Wi-Fi network requirement
- ❌ IP address configuration
- ❌ Phone-to-laptop communication
- ❌ Native Android bridge interface
- ❌ Mobile app installation process
- ❌ Network discovery/pairing

#### Added
- ✅ Localhost-only web interface
- ✅ Automatic browser launch on startup
- ✅ Simplified connection (key only, no IP address)
- ✅ Direct USB-to-browser architecture
- ✅ Enhanced startup script with visual feedback
- ✅ Quick start guide (`QUICKSTART.md`)
- ✅ Architecture documentation (`ARCHITECTURE.md`)
- ✅ This changelog

#### Unchanged
- ✅ Arduino firmware (still works as-is)
- ✅ Serial protocol (still 9600 baud JSON)
- ✅ Python server core (minor updates only)
- ✅ Web UI design (adapted from bundled version)
- ✅ Demo mode
- ✅ Physical button controls
- ✅ Sensor readings (DHT11)
- ✅ Servo control logic
- ✅ Connection key authentication
- ✅ Unit tests

### Upgrade Path

If you have the mobile app version installed:

1. **Arduino firmware:** No changes needed, same firmware works
2. **Python dependencies:** Same (pySerial 3.5)
3. **Connection key:** Will regenerate (delete `bridge/.canopy-key` to reset)
4. **Usage:** Simply run `Start-Canopy.cmd` and use web browser instead of phone

### Benefits of Localhost Architecture

**Simpler:**
- No Wi-Fi configuration
- No IP address lookup
- No mobile app installation
- One device (laptop) instead of two (phone + laptop)

**Faster:**
- No network latency
- Instant localhost response
- No Wi-Fi connection drops

**More Reliable:**
- No network dependencies
- No phone battery concerns
- No Wi-Fi interference
- USB connection more stable than wireless

**Easier Development:**
- Edit HTML/CSS/JS directly in text editor
- Browser DevTools for debugging
- No Android SDK or APK rebuilding
- No mobile device testing needed

**Better for Class Demo:**
- No device pairing during presentation
- No "can't find network" issues
- Laptop screen easier to project/share
- One less device to manage

### Trade-offs

**Lost Features:**
- Cannot control from phone/tablet
- Must be at laptop (no remote control)
- No mobile notifications

**Gained Features:**
- Works on any OS with Python + browser
- No Android version dependency
- Can use browser DevTools
- Easier to modify UI

### Technical Changes

#### Web Interface
- Removed server address input field
- Hardcoded localhost connection (`127.0.0.1:8765`)
- Removed Android native bridge code
- Simplified JavaScript (no mobile compatibility checks)
- Updated UI text (laptop-focused)

#### Python Server
- Added automatic browser launch (`webbrowser` module)
- Enhanced console output formatting
- Removed network address discovery
- Changed bind default to localhost only
- Updated help text and documentation

#### Startup Script
- Added visual separators and clearer instructions
- Better error messages
- Clearer demo mode indication
- Enhanced progress feedback

#### Documentation
- Complete README rewrite for localhost usage
- New QUICKSTART.md (30-second demo)
- New ARCHITECTURE.md (technical deep dive)
- Updated TECHNICAL-NOTES.md
- Created this CHANGELOG.md

### File Changes Summary

```
Modified Files:
- README.md              (complete rewrite)
- TECHNICAL-NOTES.md     (updated for localhost)
- Start-Canopy.cmd       (enhanced UX)
- web/index.html         (remove network address input)
- web/app.js             (localhost-only, simplified)
- bridge/server.py       (auto-launch browser)

New Files:
- QUICKSTART.md          (getting started guide)
- ARCHITECTURE.md        (system design doc)
- CHANGELOG.md           (this file)

Unchanged Files:
- firmware/CanopyUno/CanopyUno.ino
- web/styles.css
- tests/test_bridge.py
- bridge/requirements.txt

Removed Files:
- Canopy-Android.apk     (no longer needed)
- android/*              (entire directory)
```

---

## Version 1.0 - Android Mobile App + Wi-Fi Bridge (Original)

Initial release with mobile app architecture:
- Android APK for phone control
- Python bridge on laptop
- Wi-Fi communication between phone and laptop
- USB connection from laptop to Arduino
- XOD project conversion to Arduino C++
- Dual servo control with opposite directions
- DHT11 temperature and humidity sensing
- Physical button support
- Demo mode for both app and bridge

---

## Migration Notes

### For Users
No migration needed. If you have the old version:
1. Delete `Canopy-Android.apk` (optional cleanup)
2. Run `Start-Canopy.cmd` as before
3. Use your web browser instead of phone app
4. Same connection key system

### For Developers
If you forked or modified the Android app:
- Web interface is at `web/index.html`
- JavaScript is at `web/app.js`
- No build process, just edit and refresh
- Mobile features would need re-implementation
- Consider responsive CSS for tablet support

### For Instructors/Presenters
Advantages for demonstrations:
- One less device to manage
- No Wi-Fi setup explanation needed
- Easier to show on projector
- Browser DevTools for debugging
- More reliable in classroom environment

---

## Version History

- **v2.0** (Current) - Localhost web control
- **v1.0** - Android mobile app + Wi-Fi bridge
