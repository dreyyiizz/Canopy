/* Canopy group-project firmware for Arduino Uno.
 * Derived from the pin assignments and target maps in ombedfin.xodball.
 * Required libraries: Servo, DHT sensor library by Adafruit,
 * and Adafruit Unified Sensor. Serial: 9600 baud, newline terminated.
 * ACK confirms the commanded target, not measured mechanical position.
 */
#include <Servo.h>
#include <DHT.h>
#include <EEPROM.h>
#include <stdlib.h>
#include <string.h>

const uint8_t DHT_PIN = 2;
const uint8_t SERVO_LEFT_PIN = 9, SERVO_RIGHT_PIN = 10;
const uint8_t BUTTON_PINS[] = {8, 12, 13, A0};
// Assumption to verify on YOUR mechanism: control level 0 is closed, 30 open.
// These reproduce the XOD maps (normalized servo targets multiplied by 180).
const float LEFT_CLOSED_DEG = 0.0f, LEFT_OPEN_DEG = 47.88f;
const float RIGHT_CLOSED_DEG = 180.0f, RIGHT_OPEN_DEG = 149.94f;

Servo leftServo, rightServo;
DHT dht(DHT_PIN, DHT11);
uint8_t level = 0;
float temperature = NAN, humidity = NAN;
unsigned long lastSensor = 0;
bool rawButton[4] = {HIGH, HIGH, HIGH, HIGH};
bool stableButton[4] = {HIGH, HIGH, HIGH, HIGH};
unsigned long changedAt[4] = {0, 0, 0, 0};
char line[48];
uint8_t lineLength = 0;
bool lineOverflow = false;

void sendState(const char* type, unsigned long id = 0) {
  Serial.print(F("{\"type\":\"")); Serial.print(type);
  Serial.print(F("\",\"id\":")); Serial.print(id);
  Serial.print(F(",\"level\":")); Serial.print(level);
  Serial.print(F(",\"temperature_c\":"));
  if (isnan(temperature)) Serial.print(F("null")); else Serial.print(temperature, 1);
  Serial.print(F(",\"humidity_pct\":"));
  if (isnan(humidity)) Serial.print(F("null")); else Serial.print(humidity, 1);
  Serial.println(F("}"));
}

void setLevel(int requested) {
  level = constrain(requested, 0, 30);
  float fraction = level / 30.0f;
  leftServo.write((int)(LEFT_CLOSED_DEG + (LEFT_OPEN_DEG - LEFT_CLOSED_DEG) * fraction + 0.5f));
  rightServo.write((int)(RIGHT_CLOSED_DEG + (RIGHT_OPEN_DEG - RIGHT_CLOSED_DEG) * fraction + 0.5f));
  // Preserve the target across the reset caused by opening USB serial.
  // update() writes only when the value changes.
  EEPROM.update(1, level);
  EEPROM.update(0, 0xCA);
}

void processLine() {
  if (!strcmp(line, "GET")) { sendState("state"); return; }
  unsigned long id = 0;
  int requested = -1;
  char extra;
  if (sscanf(line, "SET %lu %d %c", &id, &requested, &extra) == 2 && id > 0 &&
      requested >= 0 && requested <= 30 && requested % 5 == 0) {
    setLevel(requested);
    sendState("ack", id);
  } else {
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

void readButtons() {
  bool pressed[4] = {false, false, false, false};
  unsigned long now = millis();
  for (uint8_t i = 0; i < 4; i++) {
    bool raw = digitalRead(BUTTON_PINS[i]);
    if (raw != rawButton[i]) { rawButton[i] = raw; changedAt[i] = now; }
    if (now - changedAt[i] >= 40 && stableButton[i] != raw) {
      stableButton[i] = raw;
      pressed[i] = raw == LOW;
    }
  }
  int requested = level;
  if (pressed[3]) requested = 0;
  else if (pressed[0]) requested = 30;
  else if (pressed[1]) requested = min(30, level + 5);
  else if (pressed[2]) requested = max(0, level - 5);
  if (requested != level) { setLevel(requested); sendState("state"); }
}

void setup() {
  Serial.begin(9600);
  for (uint8_t pin = 4; pin <= 7; pin++) { pinMode(pin, OUTPUT); digitalWrite(pin, LOW); }
  for (uint8_t i = 0; i < 4; i++) pinMode(BUTTON_PINS[i], INPUT_PULLUP);
  uint8_t stored = EEPROM.read(1);
  if (EEPROM.read(0) == 0xCA && stored <= 30 && stored % 5 == 0) level = stored;
  // Write the pulse target before attach to avoid an initial 90-degree command.
  float fraction = level / 30.0f;
  leftServo.write((int)(LEFT_CLOSED_DEG + (LEFT_OPEN_DEG - LEFT_CLOSED_DEG) * fraction + 0.5f));
  rightServo.write((int)(RIGHT_CLOSED_DEG + (RIGHT_OPEN_DEG - RIGHT_CLOSED_DEG) * fraction + 0.5f));
  leftServo.attach(SERVO_LEFT_PIN);
  rightServo.attach(SERVO_RIGHT_PIN);
  dht.begin();
  sendState("state");
}

void loop() {
  readSerial();
  readButtons();
  unsigned long now = millis();
  if (now - lastSensor >= 2000) {
    lastSensor = now;
    humidity = dht.readHumidity();
    temperature = dht.readTemperature();
    sendState("state");
  }
}
