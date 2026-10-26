/* Canopy group-project firmware for Arduino Uno.
 * Derived from the pin assignments and target maps in ombedfin.xodball.
 * Required libraries: Servo, DHT sensor library by Adafruit,
 * and Adafruit Unified Sensor. Serial: 9600 baud, newline terminated.
 * ACK confirms the commanded target, not measured mechanical position.
 *
 * Parallel open/close uses a sequenced delay to prevent flap collision:
 *   Opening: right moves first, then left after FLAP_DELAY_MS
 *   Closing: left moves first, then right after FLAP_DELAY_MS
 *
 * Both servos sweep slowly toward their targets at SERVO_STEP_DEG per
 * SERVO_STEP_MS, so they never jump instantly. The sequencing delay starts
 * when the first servo *begins* moving, giving it a head start before the
 * second one starts its own sweep.
 *
 * Supports both parallel control (SET) and independent control (SETLR).
 * SETLR starts both sweeps immediately with no sequencing.
 */
#include <Servo.h>
#include <DHT.h>
#include <EEPROM.h>
#include <stdlib.h>
#include <string.h>

// ── Pin assignments ──────────────────────────────────────────────────────────
const uint8_t DHT_PIN         = 2;
const uint8_t SERVO_LEFT_PIN  = 9;
const uint8_t SERVO_RIGHT_PIN = 10;
const uint8_t BUTTON_PINS[]   = {8, 12, 13, A0};

// ── Servo angle endpoints ────────────────────────────────────────────────────
// Control level 0 = closed, 30 = open.
const float LEFT_CLOSED_DEG  = 110.0f, LEFT_OPEN_DEG  =   0.0f;
const float RIGHT_CLOSED_DEG =  80.0f, RIGHT_OPEN_DEG = 180.0f;

// ── Speed & sequencing ───────────────────────────────────────────────────────
// Move 1 degree every 12 ms ≈ ~83 deg/s (standard servo is ~300 deg/s).
// Increase SERVO_STEP_MS to slow down further, decrease to speed up.
const unsigned long SERVO_STEP_MS  = 12;   // ms between each 1-degree step
const int           SERVO_STEP_DEG = 1;    // degrees per step (keep at 1)

// Time between the first flap beginning its sweep and the second starting.
const unsigned long FLAP_DELAY_MS  = 500;

// ── Global state ─────────────────────────────────────────────────────────────
Servo leftServo, rightServo;
DHT   dht(DHT_PIN, DHT11);

uint8_t level      = 0;  // last parallel target
uint8_t leftLevel  = 0;  // current left  target (in 0-30 control units)
uint8_t rightLevel = 0;  // current right target

float         temperature = NAN, humidity = NAN;
unsigned long lastSensor  = 0;

// Live servo angles tracked so we can sweep one step at a time
int leftCurrentDeg  = 0;
int rightCurrentDeg = 0;

// Target angles the sweepers aim for
int leftTargetDeg  = 0;
int rightTargetDeg = 0;

// Per-servo sweep timers
unsigned long leftLastStep  = 0;
unsigned long rightLastStep = 0;

// Deferred second-flap (sequencing)
bool          pendingSecond = false;
unsigned long pendingAt     = 0;
bool          pendingIsLeft = false;  // which servo starts second
uint8_t       pendingTarget = 0;      // its target level

// Serial line buffer
char    line[64];
uint8_t lineLength  = 0;
bool    lineOverflow = false;

// Button debounce
bool          rawButton[4]    = {HIGH, HIGH, HIGH, HIGH};
bool          stableButton[4] = {HIGH, HIGH, HIGH, HIGH};
unsigned long changedAt[4]    = {0, 0, 0, 0};

// ── Angle helpers ────────────────────────────────────────────────────────────
inline int leftAngle(uint8_t lv) {
  return (int)(LEFT_CLOSED_DEG  + (LEFT_OPEN_DEG  - LEFT_CLOSED_DEG)  * (lv / 30.0f) + 0.5f);
}
inline int rightAngle(uint8_t lv) {
  return (int)(RIGHT_CLOSED_DEG + (RIGHT_OPEN_DEG - RIGHT_CLOSED_DEG) * (lv / 30.0f) + 0.5f);
}

// ── EEPROM ───────────────────────────────────────────────────────────────────
void saveEEPROM() {
  EEPROM.update(1, level);
  EEPROM.update(2, leftLevel);
  EEPROM.update(3, rightLevel);
  EEPROM.update(0, 0xCA);
}

// ── Serial output ────────────────────────────────────────────────────────────
void sendState(const char* type, unsigned long id = 0) {
  Serial.print(F("{\"type\":\"")); Serial.print(type);
  Serial.print(F("\",\"id\":")); Serial.print(id);
  Serial.print(F(",\"level\":")); Serial.print(level);
  Serial.print(F(",\"leftLevel\":")); Serial.print(leftLevel);
  Serial.print(F(",\"rightLevel\":")); Serial.print(rightLevel);
  Serial.print(F(",\"temperature_c\":"));
  if (isnan(temperature)) Serial.print(F("null")); else Serial.print(temperature, 1);
  Serial.print(F(",\"humidity_pct\":"));
  if (isnan(humidity)) Serial.print(F("null")); else Serial.print(humidity, 1);
  Serial.println(F("}"));
}

// ── Begin a slow sweep for one servo ─────────────────────────────────────────
// Sets the target angle; updateServos() does the actual stepping each loop.
void startLeftSweep(uint8_t lv) {
  leftLevel     = lv;
  leftTargetDeg = leftAngle(lv);
  leftLastStep  = millis();
}
void startRightSweep(uint8_t lv) {
  rightLevel     = lv;
  rightTargetDeg = rightAngle(lv);
  rightLastStep  = millis();
}

// ── Advance sweeps one step each call ────────────────────────────────────────
// Called every loop iteration; does nothing if servo is already at target.
void updateServos() {
  unsigned long now = millis();

  if (leftCurrentDeg != leftTargetDeg && now - leftLastStep >= SERVO_STEP_MS) {
    leftCurrentDeg += (leftTargetDeg > leftCurrentDeg) ? SERVO_STEP_DEG : -SERVO_STEP_DEG;
    leftServo.write(leftCurrentDeg);
    leftLastStep = now;
  }

  if (rightCurrentDeg != rightTargetDeg && now - rightLastStep >= SERVO_STEP_MS) {
    rightCurrentDeg += (rightTargetDeg > rightCurrentDeg) ? SERVO_STEP_DEG : -SERVO_STEP_DEG;
    rightServo.write(rightCurrentDeg);
    rightLastStep = now;
  }
}

// ── Sequenced parallel move ──────────────────────────────────────────────────
// Opening: right sweeps first, left starts after FLAP_DELAY_MS.
// Closing: left sweeps first,  right starts after FLAP_DELAY_MS.
void setLevel(int requested) {
  uint8_t prev = level;
  level = constrain(requested, 0, 30);

  pendingSecond = false;  // cancel any outstanding deferred move

  if (level == prev) {
    leftLevel  = level;
    rightLevel = level;
    startLeftSweep(level);
    startRightSweep(level);
    saveEEPROM();
    return;
  }

  bool opening = (level > prev);

  if (opening) {
    // Right leads — start its sweep now; defer left
    startRightSweep(level);
    pendingIsLeft = true;
  } else {
    // Left leads — start its sweep now; defer right
    startLeftSweep(level);
    pendingIsLeft = false;
  }

  pendingTarget = level;
  pendingAt     = millis();
  pendingSecond = true;

  saveEEPROM();
}

// ── Immediate independent move (no sequencing, both sweep simultaneously) ────
void setIndependentLevels(int reqLeft, int reqRight) {
  pendingSecond = false;
  startLeftSweep(constrain(reqLeft,  0, 30));
  startRightSweep(constrain(reqRight, 0, 30));
  if (leftLevel == rightLevel) level = leftLevel;
  saveEEPROM();
}

// ── Start the deferred second flap once its delay has elapsed ────────────────
void checkPending() {
  if (!pendingSecond) return;
  if (millis() - pendingAt < FLAP_DELAY_MS) return;

  pendingSecond = false;
  if (pendingIsLeft) startLeftSweep(pendingTarget);
  else               startRightSweep(pendingTarget);
  // State update will follow naturally once the sweep completes;
  // send one now so the browser knows the second servo has started.
  sendState("state");
}

// ── Serial command parsing ───────────────────────────────────────────────────
void processLine() {
  if (!strcmp(line, "GET")) { sendState("state"); return; }

  unsigned long id = 0;
  int requested = -1, reqLeft = -1, reqRight = -1;
  char extra;

  if (sscanf(line, "SETLR %lu %d %d %c", &id, &reqLeft, &reqRight, &extra) == 3 && id > 0 &&
      reqLeft  >= 0 && reqLeft  <= 30 && reqLeft  % 5 == 0 &&
      reqRight >= 0 && reqRight <= 30 && reqRight % 5 == 0) {
    setIndependentLevels(reqLeft, reqRight);
    sendState("ack", id);
  }
  else if (sscanf(line, "SET %lu %d %c", &id, &requested, &extra) == 2 && id > 0 &&
           requested >= 0 && requested <= 30 && requested % 5 == 0) {
    setLevel(requested);
    sendState("ack", id);
  }
  else {
    Serial.println(F("{\"type\":\"error\",\"error\":\"Invalid command\"}"));
  }
}

void readSerial() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      if (!lineOverflow) { line[lineLength] = '\0'; processLine(); }
      lineLength = 0; lineOverflow = false;
    } else if (lineLength < sizeof(line) - 1 && !lineOverflow) {
      line[lineLength++] = c;
    } else { lineOverflow = true; }
  }
}

// ── Button handling ──────────────────────────────────────────────────────────
void readButtons() {
  bool pressed[4] = {false, false, false, false};
  unsigned long now = millis();
  for (uint8_t i = 0; i < 4; i++) {
    bool raw = digitalRead(BUTTON_PINS[i]);
    if (raw != rawButton[i]) { rawButton[i] = raw; changedAt[i] = now; }
    if (now - changedAt[i] >= 40 && stableButton[i] != raw) {
      stableButton[i] = raw;
      pressed[i] = (raw == LOW);
    }
  }
  int requested = level;
  if      (pressed[3]) requested = 0;
  else if (pressed[0]) requested = 30;
  else if (pressed[1]) requested = min(30, level + 5);
  else if (pressed[2]) requested = max(0,  level - 5);
  if (requested != level) { setLevel(requested); sendState("state"); }
}

// ── Setup ────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(9600);
  for (uint8_t pin = 4; pin <= 7; pin++) { pinMode(pin, OUTPUT); digitalWrite(pin, LOW); }
  for (uint8_t i = 0; i < 4; i++) pinMode(BUTTON_PINS[i], INPUT_PULLUP);

  // Restore saved positions
  if (EEPROM.read(0) == 0xCA) {
    uint8_t sl = EEPROM.read(1), sL = EEPROM.read(2), sR = EEPROM.read(3);
    if (sl <= 30 && sl % 5 == 0) level      = sl;
    if (sL <= 30 && sL % 5 == 0) leftLevel  = sL;
    if (sR <= 30 && sR % 5 == 0) rightLevel = sR;
  } else {
    leftLevel = rightLevel = level;
  }

  // Snap to saved position immediately on power-up (no slow sweep at boot)
  leftCurrentDeg  = leftTargetDeg  = leftAngle(leftLevel);
  rightCurrentDeg = rightTargetDeg = rightAngle(rightLevel);
  leftServo.write(leftCurrentDeg);
  rightServo.write(rightCurrentDeg);
  leftServo.attach(SERVO_LEFT_PIN);
  rightServo.attach(SERVO_RIGHT_PIN);
  dht.begin();
  sendState("state");
}

// ── Loop ─────────────────────────────────────────────────────────────────────
void loop() {
  readSerial();
  readButtons();
  checkPending();   // release the second flap after its delay
  updateServos();   // advance each servo one step toward its target

  unsigned long now = millis();
  if (now - lastSensor >= 2000) {
    lastSensor  = now;
    humidity    = dht.readHumidity();
    temperature = dht.readTemperature();
    sendState("state");
  }
}
