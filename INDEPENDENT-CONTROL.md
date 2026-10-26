# Independent Servo Control Feature

## Overview

Canopy now supports **two control modes**:

1. **Parallel Control** (original) — Both servos move together
2. **Independent Control** (new) — Each servo can be controlled separately

## Features

### Parallel Control Mode
- **Open/Close buttons** — Instant full open (30) or full close (0)
- **Single slider** — Adjust both servos together (0-30 in steps of 5)
- **Apply position button** — Sends command to Arduino

### Independent Control Mode
- **Open/Close buttons** — Still work, moving both servos together
- **Left servo slider** — Control left servo independently (0-30 in steps of 5)
- **Right servo slider** — Control right servo independently (0-30 in steps of 5)
- **Apply position button** — Sends both servo positions to Arduino

### Visual Feedback

**Pending Changes Indicator:**
- When you adjust a slider, the "Apply position" button turns **yellow** with a warning icon (⚠)
- Button pulses to indicate pending changes that haven't been applied yet
- After clicking "Apply position", button returns to **green**
- This prevents accidental movements and clearly shows when changes are staged

**Live Preview:**
- The roof visualization updates **immediately** as you move the sliders
- Shows what position the roof will move to before you apply
- Both parallel and independent modes show real-time preview

## How to Use

### Switching Modes

1. **Parallel Control** tab (default) — Click to control both servos together
2. **Independent Control** tab — Click to control each servo separately

### Independent Control Workflow

1. Click the **"Independent Control"** tab
2. Adjust the **Left servo** slider to desired position (you'll see yellow button + preview)
3. Adjust the **Right servo** slider to desired position
4. Click **"Apply position"** to send both values to Arduino
5. Arduino moves both servos to their respective positions
6. Button turns back to green, preview matches actual position

### Ranges

Both servos use the same control range:
- **0** = Fully closed
- **5, 10, 15, 20, 25** = Partial positions
- **30** = Fully open

Steps of 5 match the original parallel control system.

## Technical Details

### Arduino Protocol

**New command added:** `SETLR <id> <left> <right>`

Example:
```
SETLR 42 15 20
```
Sets left servo to level 15, right servo to level 20.

**Original command still works:** `SET <id> <level>`

Example:
```
SET 42 15
```
Sets both servos to level 15 (parallel control).

### API Endpoints

**New endpoint:** `POST /api/roof-independent`

Request:
```json
{
  "leftLevel": 15,
  "rightLevel": 20
}
```

Response:
```json
{
  "level": 15,
  "leftLevel": 15,
  "rightLevel": 20,
  "temperature_c": 28.0,
  "humidity_pct": 65.0,
  "connected": true,
  "demo": false
}
```

**Original endpoint still works:** `POST /api/roof`

Request:
```json
{
  "level": 15
}
```

### State Persistence

The Arduino saves three values to EEPROM:
- `level` — Last parallel control level
- `leftLevel` — Last left servo position
- `rightLevel` — Last right servo position

On power-up or USB reconnection, the Arduino restores the last known positions.

### Demo Mode

Demo mode supports both control modes:
- Parallel control: Simulates both servos moving together
- Independent control: Simulates independent servo positions
- Preview updates immediately, no hardware moves

## Use Cases

### When to Use Parallel Control
- Normal operation where both roof panels should be symmetric
- Quick open/close operations
- Simple demonstrations
- When you want both sides to match

### When to Use Independent Control
- Adjusting for uneven roof panels
- Compensating for mechanical differences
- Fine-tuning individual panel positions
- Testing or calibrating each servo separately
- Creating asymmetric roof positions for ventilation control

## Upgrading

### From Previous Version

1. **Upload new Arduino firmware** (`firmware/CanopyUno/CanopyUno.ino`)
2. **Restart the web server** (Stop and run `Start-Canopy.cmd` again)
3. **Refresh your browser** or clear cache

The new firmware is **backward compatible**:
- Old `SET` commands still work
- Physical buttons still work
- Parallel control mode works exactly as before

### No Breaking Changes

- Existing parallel control functionality unchanged
- Same servo ranges (0-30 in steps of 5)
- Same physical button behavior
- Same Open/Close buttons
- Demo mode still works

## Troubleshooting

**Sliders don't appear separately:**
- Make sure you clicked the "Independent Control" tab
- Refresh the browser page
- Check that new firmware is uploaded to Arduino

**Apply button stays yellow:**
- This is normal! It indicates pending changes
- Click "Apply position" to send changes and turn it green

**One servo doesn't move:**
- Check wiring to D9 (left) and D10 (right)
- Verify external power supply for servos
- Test each servo in parallel mode first
- Try swapping servo connections to isolate issue

**Positions don't match after reconnect:**
- Arduino restores last known positions from EEPROM
- If servos moved manually while disconnected, positions may be out of sync
- Use independent control to manually sync them

**Preview doesn't match actual position:**
- Preview shows **target** position, not measured position
- No feedback sensor to confirm actual roof angle
- Mechanical issues may prevent servos from reaching target

## Future Enhancements

Possible improvements for future versions:
- Position feedback sensors
- Calibration wizard for servo endpoints
- Saved presets for common positions
- Smooth animation between positions
- Individual servo speed control
- Limit switches for safety

## Summary

The independent control feature adds flexibility while maintaining simplicity:
- ✅ Both control modes available via tabs
- ✅ Visual pending changes indicator (yellow button)
- ✅ Live preview of position changes
- ✅ Backward compatible with original system
- ✅ No breaking changes to existing functionality
- ✅ Clear left/right servo labels
- ✅ Same reliable 0-30 range in steps of 5

Perfect for fine-tuning your plant roof while keeping the simple parallel control for everyday use!
