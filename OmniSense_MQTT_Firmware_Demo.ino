/*
  OmniSense ESP32 MQTT firmware demo.

  This sketch is firmware-side only:
  - Connects ESP32 to Wi-Fi.
  - Connects to HiveMQ Cloud over TLS MQTT on port 8883.
  - Publishes telemetry to omnisense/node/{node_id}/telemetry.
  - Subscribes to omnisense/node/{node_id}/command.
  - Handles SET_CRISIS_MODE commands from the backend.

  Required Arduino libraries:
  - PubSubClient
  - ArduinoJson
  - Adafruit BME280 library
  - Adafruit AMG88xx library
  - OmniSense_Thermal_Headcount_inferencing
  - SparkFun VL53L5CX library, or compatible VL53L8 8x8 ToF library

  Keep real Wi-Fi and MQTT credentials out of committed code.
  Do not add Supabase keys or database API calls to ESP32 firmware.
*/

#include <Arduino.h>
#include <ArduinoJson.h>
#include <PubSubClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <Wire.h>

#include "Config.h"
#include "PirSensor.h"
#include "BmeSensor.h"
#include "ThermalArray.h"
#include "FanControl.h"
#include "TofSensor.h"
#include "Comfort.h"

// ===== Device identity =====
constexpr const char *NODE_ID = "demo-1";
constexpr const char *MQTT_CLIENT_ID = "omnisense-esp32-demo-1";

// ===== Placeholder credentials =====
// Replace locally for demo testing. Do not commit real secrets.
struct WiFiCredential {
  const char *ssid;
  const char *password;
};

WiFiCredential WIFI_LIST[] = {
  {"TP-Link_E3F0", "60600190"},
  {"i hate my chem lecturer", "ckk9987!"}
};

constexpr size_t WIFI_COUNT = sizeof(WIFI_LIST) / sizeof(WIFI_LIST[0]);
constexpr unsigned long WIFI_CONNECT_TIMEOUT_MS = 12000;

// HiveMQ Cloud settings from the team.
constexpr const char *MQTT_HOST = "e30385d740794e6ab456cd2a6456ba78.s1.eu.hivemq.cloud";
constexpr uint16_t MQTT_PORT = 8883;
constexpr const char *MQTT_USERNAME = "Zzzzz";
constexpr const char *MQTT_PASSWORD = "Zzzzz12345";

// Preferred for HiveMQ Cloud TLS: paste the correct root CA certificate here.
// Keep the certificate public/root CA only. Never put private keys here.
static const char HIVEMQ_ROOT_CA[] PROGMEM = R"EOF(
-----BEGIN CERTIFICATE-----
MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw
TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh
cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMTUwNjA0MTEwNDM4
WhcNMzUwNjA0MTEwNDM4WjBPMQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJu
ZXQgU2VjdXJpdHkgUmVzZWFyY2ggR3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBY
MTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAK3oJHP0FDfzm54rVygc
h77ct984kIxuPOZXoHj3dcKi/vVqbvYATyjb3miGbESTtrFj/RQSa78f0uoxmyF+
0TM8ukj13Xnfs7j/EvEhmkvBioZxaUpmZmyPfjxwv60pIgbz5MDmgK7iS4+3mX6U
A5/TR5d8mUgjU+g4rk8Kb4Mu0UlXjIB0ttov0DiNewNwIRt18jA8+o+u3dpjq+sW
T8KOEUt+zwvo/7V3LvSye0rgTBIlDHCNAymg4VMk7BPZ7hm/ELNKjD+Jo2FR3qyH
B5T0Y3HsLuJvW5iB4YlcNHlsdu87kGJ55tukmi8mxdAQ4Q7e2RCOFvu396j3x+UC
B5iPNgiV5+I3lg02dZ77DnKxHZu8A/lJBdiB3QW0KtZB6awBdpUKD9jf1b0SHzUv
KBds0pjBqAlkd25HN7rOrFleaJ1/ctaJxQZBKT5ZPt0m9STJEadao0xAH0ahmbWn
OlFuhjuefXKnEgV4We0+UXgVCwOPjdAvBbI+e0ocS3MFEvzG6uBQE3xDk3SzynTn
jh8BCNAw1FtxNrQHusEwMFxIt4I7mKZ9YIqioymCzLq9gwQbooMDQaHWBfEbwrbw
qHyGO0aoSCqI3Haadr8faqU9GY/rOPNk3sgrDQoo//fb4hVC1CLQJ13hef4Y53CI
rU7m2Ys6xt0nUW7/vGT1M0NPAgMBAAGjQjBAMA4GA1UdDwEB/wQEAwIBBjAPBgNV
HRMBAf8EBTADAQH/MB0GA1UdDgQWBBR5tFnme7bl5AFzgAiIyBpY9umbbjANBgkq
hkiG9w0BAQsFAAOCAgEAVR9YqbyyqFDQDLHYGmkgJykIrGF1XIpu+ILlaS/V9lZL
ubhzEFnTIZd+50xx+7LSYK05qAvqFyFWhfFQDlnrzuBZ6brJFe+GnY+EgPbk6ZGQ
3BebYhtF8GaV0nxvwuo77x/Py9auJ/GpsMiu/X1+mvoiBOv/2X/qkSsisRcOj/KK
NFtY2PwByVS5uCbMiogziUwthDyC3+6WVwW6LLv3xLfHTjuCvjHIInNzktHCgKQ5
ORAzI4JMPJ+GslWYHb4phowim57iaztXOoJwTdwJx4nLCgdNbOhdjsnvzqvHu7Ur
TkXWStAmzOVyyghqpZXjFaH3pO3JLF+l+/+sKAIuvtd7u+Nxe5AW0wdeRlN8NwdC
jNPElpzVmbUq4JUagEiuTDkHzsxHpFKVK7q4+63SM1N95R1NbdWhscdCb+ZAJzVc
oyi3B43njTOQ5yOf+1CceWxG1bQVs5ZufpsMljq4Ui0/1lvh+wjChP4kqKOJ2qxq
4RgqsahDYVvTH9w7jXbyLeiNdd8XM2w9U/t7y0Ff/9yi0GE44Za4rF2LN9d11TPA
mRGunUHBcnWEvgJBQl9nJEiU0Zsnvgc/ubhPgXRR4Xq37Z0j4r7g1SgEEzwxA57d
emyPxgcYxn/eR44/KJ4EBs+lVDR3veyJm+kXQ99b21/+jh5Xos1AnX5iItreGCc=
-----END CERTIFICATE-----
)EOF";

constexpr unsigned long MQTT_RECONNECT_INTERVAL_MS = 2000;
constexpr unsigned long TELEMETRY_PUBLISH_INTERVAL_MS = 200;
constexpr size_t MQTT_TOPIC_BUFFER_SIZE = 96;
constexpr size_t MQTT_PAYLOAD_BUFFER_SIZE = 1280;

PirSensor pir;
BmeSensor bme;
ThermalArray thermal;
FanControl fan;
TofSensor tof;

WiFiClientSecure secureClient;
PubSubClient mqttClient(secureClient);

bool crisisMode = false;
bool wasActive = false;
unsigned long lastSensorReadMs = 0;
unsigned long lastTelemetryPublishMs = 0;
unsigned long lastMqttReconnectAttemptMs = 0;
int lastPeople = 0;
float lastTemperatureC = NAN;
float lastHumidityPct = NAN;
bool lastBmeValid = false;
const char *lastHeadcountSource = "none";
const char *lastThermalAiLabel = "not_run";
float lastThermalAiConfidence = 0.0;
TofReading lastTofReading;

struct TelemetryReading {
  bool systemActive = false;
  bool pirMotion = false;
  bool bmeValid = false;
  float temperatureC = NAN;
  float humidityPct = NAN;
  int headcount = 0;
  const char *headcountSource = "none";
  const char *thermalAiLabel = "not_run";
  float thermalAiConfidence = 0.0;
  TofReading tofReading;
  float pmv = 0.0;
  float ppd = 0.0;
  const char *comfortStatus = "comfortable";
  const char *alertLevel = "normal";
  const char *hvacMode = "off";
  const char *fanMode = "off";
  uint8_t fanDuty = FAN_SPEED_OFF;
  int setpointC = 24;
};

void updateComfortFields(TelemetryReading &reading) {
  if (isnan(reading.temperatureC) || isnan(reading.humidityPct)) {
    reading.pmv = NAN;
    reading.ppd = NAN;
    reading.comfortStatus = "N/A";
    reading.alertLevel = "N/A";
    return;
  }

  PMVResult pmvResult = estimatePMV(reading.temperatureC, reading.humidityPct);
  ComfortStatusResult comfort =
    getComfortStatus(pmvResult.pmv, pmvResult.ppd, reading.temperatureC);
  reading.pmv = comfort.pmv;
  reading.ppd = comfort.ppd;
  reading.comfortStatus = comfort.comfortStatus;
  reading.alertLevel = comfort.alertLevel;
}

void setup() {
  Serial.begin(SERIAL_BAUD);
  delay(1000);

  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);

  pir.begin();
  fan.begin();

  Serial.println("Starting OmniSense ESP32 MQTT firmware demo...");

  if (bme.begin()) {
    Serial.println("BME280 detected.");
  } else {
    Serial.println("WARNING: BME280 not detected. Temperature and humidity will show N/A.");
  }

  if (thermal.begin()) {
    Serial.println("AMG8833 detected.");
  } else {
    Serial.println("WARNING: AMG8833 not detected. Headcount will show 0 when thermal data is unavailable.");
  }

  if (tof.begin()) {
    Serial.println("VL53L8 ToF sensor detected.");
  } else {
    Serial.println("WARNING: VL53L8 ToF sensor not detected or library missing.");
  }

  fan.allOff();
  connectWiFi();
  setupSecureMqttClient();
  connectMqtt();
}

void loop() {
  maintainWiFi();
  maintainMqtt();
  mqttClient.loop();

  TelemetryReading reading = readTelemetryInputs();
  applyLocalHvacBehavior(reading);

  if (millis() - lastTelemetryPublishMs >= TELEMETRY_PUBLISH_INTERVAL_MS) {
    lastTelemetryPublishMs = millis();
    publishTelemetry(reading);
  }
}

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  WiFi.mode(WIFI_STA);

  while (WiFi.status() != WL_CONNECTED) {
    for (size_t i = 0; i < WIFI_COUNT && WiFi.status() != WL_CONNECTED; i++) {
      Serial.print("Connecting to Wi-Fi SSID: ");
      Serial.println(WIFI_LIST[i].ssid);

      WiFi.disconnect(true);
      delay(250);
      WiFi.begin(WIFI_LIST[i].ssid, WIFI_LIST[i].password);

      unsigned long startedAt = millis();
      while (WiFi.status() != WL_CONNECTED &&
             millis() - startedAt < WIFI_CONNECT_TIMEOUT_MS) {
        delay(500);
        Serial.print(".");
      }

      Serial.println();
    }

    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("Wi-Fi connection failed for all saved networks. Retrying...");
      delay(1000);
    }
  }

  Serial.println();
  Serial.print("Wi-Fi connected. IP: ");
  Serial.println(WiFi.localIP());
}

void maintainWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  Serial.println("Wi-Fi disconnected. Reconnecting...");
  connectWiFi();
}

void setupSecureMqttClient() {
  // Production/demo-preferred TLS setup:
  secureClient.setCACert(HIVEMQ_ROOT_CA);

  // Temporary local demo fallback only if CA setup is not ready:
  // secureClient.setInsecure();

  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
  mqttClient.setCallback(handleMqttMessage);
  mqttClient.setBufferSize(MQTT_PAYLOAD_BUFFER_SIZE);
}

void connectMqtt() {
  if (mqttClient.connected()) {
    return;
  }

  Serial.print("Connecting to HiveMQ Cloud MQTT: ");
  Serial.print(MQTT_HOST);
  Serial.print(":");
  Serial.println(MQTT_PORT);

  while (!mqttClient.connected()) {
    if (mqttClient.connect(MQTT_CLIENT_ID, MQTT_USERNAME, MQTT_PASSWORD)) {
      Serial.println("MQTT connected.");
      subscribeToCommandTopic();
    } else {
      Serial.print("MQTT connect failed, state=");
      Serial.println(mqttClient.state());
      delay(MQTT_RECONNECT_INTERVAL_MS);
    }
  }
}

void maintainMqtt() {
  if (mqttClient.connected()) {
    return;
  }

  unsigned long now = millis();
  if (now - lastMqttReconnectAttemptMs < MQTT_RECONNECT_INTERVAL_MS) {
    return;
  }

  lastMqttReconnectAttemptMs = now;
  connectMqtt();
}

void subscribeToCommandTopic() {
  char topic[MQTT_TOPIC_BUFFER_SIZE];
  buildCommandTopic(topic, sizeof(topic));

  if (mqttClient.subscribe(topic)) {
    Serial.print("Subscribed to command topic: ");
    Serial.println(topic);
  } else {
    Serial.print("Failed to subscribe to command topic: ");
    Serial.println(topic);
  }
}

TelemetryReading readTelemetryInputs() {
  TelemetryReading reading;
  reading.temperatureC = lastTemperatureC;
  reading.humidityPct = lastHumidityPct;
  reading.bmeValid = lastBmeValid;

  pir.update();
  reading.pirMotion = pir.motionNow();
  reading.systemActive = pir.systemActive();

  if (reading.systemActive && !wasActive) {
    Serial.println("System activated by PIR motion.");
    wasActive = true;
    lastSensorReadMs = 0;
  }

  if (millis() - lastSensorReadMs >= SENSOR_READ_INTERVAL_MS) {
    lastSensorReadMs = millis();

    if (reading.systemActive) {
      BmeReading bmeReading = bme.read();
      if (bmeReading.valid) {
        lastBmeValid = true;
        lastTemperatureC = bmeReading.temperatureC;
        lastHumidityPct = bmeReading.humidityPct;
        reading.temperatureC = lastTemperatureC;
        reading.humidityPct = lastHumidityPct;
        reading.bmeValid = true;
      } else {
        lastBmeValid = false;
        lastTemperatureC = NAN;
        lastHumidityPct = NAN;
        reading.temperatureC = NAN;
        reading.humidityPct = NAN;
        reading.bmeValid = false;
      }

      TofReading tofReading = tof.readAndValidateHuman();
      lastTofReading = tofReading;

      ThermalResult thermalResult = thermal.readAndCount();
      if (thermalResult.valid && tofReading.humanValidated) {
        lastPeople = thermalResult.people;
        lastHeadcountSource =
          thermalResult.aiUsed && !thermalResult.aiLowConfidence ? "ai" : "thermal_blob_fallback";
        lastThermalAiLabel = thermalResult.aiLabel;
        lastThermalAiConfidence = thermalResult.aiConfidence;
      } else {
        lastPeople = 0;
        lastHeadcountSource = tofReading.available ? "tof_rejected" : "tof_unavailable";
        lastThermalAiLabel = thermalResult.valid ? thermalResult.aiLabel : "thermal_unavailable";
        lastThermalAiConfidence = thermalResult.valid ? thermalResult.aiConfidence : 0.0;
      }
    }
  }

  if (!reading.systemActive) {
    if (wasActive) {
      Serial.println("No PIR motion for 10 seconds. System stopped.");
    }

    wasActive = false;
    lastSensorReadMs = 0;
    lastBmeValid = false;
    lastTemperatureC = NAN;
    lastHumidityPct = NAN;
    lastPeople = 0;
    lastHeadcountSource = "none";
    lastThermalAiLabel = "not_run";
    lastThermalAiConfidence = 0.0;
    lastTofReading = TofReading();
    reading.headcount = 0;
    reading.temperatureC = NAN;
    reading.humidityPct = NAN;
    reading.bmeValid = false;
    reading.headcountSource = lastHeadcountSource;
    reading.thermalAiLabel = lastThermalAiLabel;
    reading.thermalAiConfidence = lastThermalAiConfidence;
    reading.tofReading = lastTofReading;
    updateComfortFields(reading);
    reading.hvacMode = "off";
    reading.fanMode = "off";
    reading.fanDuty = FAN_SPEED_OFF;
    return reading;
  }

  reading.headcount = lastPeople;
  reading.headcountSource = lastHeadcountSource;
  reading.thermalAiLabel = lastThermalAiLabel;
  reading.thermalAiConfidence = lastThermalAiConfidence;
  reading.tofReading = lastTofReading;

  updateComfortFields(reading);

  if (strcmp(reading.alertLevel, "N/A") == 0) {
    reading.hvacMode = crisisMode ? "eco" : "N/A";
  } else {
    reading.hvacMode = crisisMode ? "eco" : "cool";
  }

  int fanHeadcount = crisisMode ? 1 : reading.headcount;
  reading.fanDuty = fanDutyForHeadcountAndComfort(fanHeadcount, reading.comfortStatus);
  reading.fanMode = fanModeForDuty(reading.fanDuty);
  reading.setpointC = crisisMode ? 26 : 24;

  return reading;
}

void applyLocalHvacBehavior(const TelemetryReading &reading) {
  if (!reading.systemActive) {
    fan.allOff();
    return;
  }

  fan.setFanDuty(reading.fanDuty);
}

void publishTelemetry(const TelemetryReading &reading) {
  if (!mqttClient.connected()) {
    Serial.println("Skipping telemetry publish: MQTT not connected.");
    return;
  }

  StaticJsonDocument<MQTT_PAYLOAD_BUFFER_SIZE> doc;
  doc["node_id"] = NODE_ID;
  if (isnan(reading.temperatureC)) {
    doc["temperature"] = "N/A";
  } else {
    doc["temperature"] = roundToOneDecimal(reading.temperatureC);
  }

  if (isnan(reading.humidityPct)) {
    doc["humidity"] = "N/A";
  } else {
    doc["humidity"] = roundToOneDecimal(reading.humidityPct);
  }

  doc["headcount"] = reading.headcount;
  if (isnan(reading.pmv)) {
    doc["pmv"] = "N/A";
  } else {
    doc["pmv"] = roundToTwoDecimals(reading.pmv);
  }

  if (isnan(reading.ppd)) {
    doc["ppd"] = "N/A";
  } else {
    doc["ppd"] = roundToOneDecimal(reading.ppd);
  }

  doc["comfortStatus"] = reading.comfortStatus;
  doc["comfortMode"] = reading.comfortStatus;
  doc["alertLevel"] = reading.alertLevel;
  doc["crisis_mode"] = crisisMode;

  JsonObject hvacState = doc["hvac_state"].to<JsonObject>();
  hvacState["mode"] = reading.hvacMode;
  hvacState["fan"] = reading.fanMode;
  hvacState["fan_pwm"] = reading.fanDuty;
  hvacState["setpoint"] = reading.setpointC;

  JsonObject rawSummary = doc["raw_sensor_summary"].to<JsonObject>();
  rawSummary["pir_motion"] = reading.pirMotion;
  rawSummary["system_active"] = reading.systemActive;
  rawSummary["bme_valid"] = reading.bmeValid;
  rawSummary["headcount_source"] = reading.headcountSource;
  rawSummary["thermal_ai_label"] = reading.thermalAiLabel;
  rawSummary["thermal_ai_confidence"] = roundToTwoDecimals(reading.thermalAiConfidence);
  rawSummary["tof_source"] = reading.tofReading.source;
  rawSummary["tof_available"] = reading.tofReading.available;
  rawSummary["tof_data_ready"] = reading.tofReading.dataReady;
  rawSummary["tof_human_validated"] = reading.tofReading.humanValidated;
  rawSummary["tof_valid_zone_count"] = reading.tofReading.validZoneCount;
  rawSummary["tof_largest_cluster_zones"] = reading.tofReading.largestClusterZones;
  rawSummary["tof_average_distance_mm"] = roundToOneDecimal(reading.tofReading.averageDistanceMm);
  rawSummary["tof_min_distance_mm"] = reading.tofReading.minDistanceMm;
  rawSummary["tof_max_distance_mm"] = reading.tofReading.maxDistanceMm;

  char payload[MQTT_PAYLOAD_BUFFER_SIZE];
  size_t payloadLength = serializeJson(doc, payload, sizeof(payload));
  if (payloadLength == 0) {
    Serial.println("Telemetry JSON serialization failed.");
    return;
  }

  char topic[MQTT_TOPIC_BUFFER_SIZE];
  buildTelemetryTopic(topic, sizeof(topic));

  bool published = mqttClient.publish(topic, payload, false);
  if (published) {
    Serial.print("Published telemetry to ");
    Serial.print(topic);
    Serial.print(": ");
    Serial.println(payload);
  } else {
    Serial.println("Telemetry publish failed.");
  }
}

void handleMqttMessage(char *topic, byte *payload, unsigned int length) {
  Serial.print("MQTT command received on ");
  Serial.println(topic);

  StaticJsonDocument<MQTT_PAYLOAD_BUFFER_SIZE> doc;
  DeserializationError error = deserializeJson(doc, payload, length);
  if (error) {
    Serial.print("Invalid command JSON: ");
    Serial.println(error.c_str());
    return;
  }

  const char *command = doc["command"] | "";
  if (strcmp(command, "SET_CRISIS_MODE") != 0) {
    Serial.print("Ignoring unsupported command: ");
    Serial.println(command);
    return;
  }

  if (!doc["enabled"].is<bool>()) {
    Serial.println("Ignoring SET_CRISIS_MODE without boolean enabled field.");
    return;
  }

  crisisMode = doc["enabled"].as<bool>();
  float targetPmvLimit = doc["target_pmv_limit"] | 1.0;
  const char *reason = doc["reason"] | "not_provided";

  Serial.print("Crisis mode ");
  Serial.print(crisisMode ? "ENABLED" : "DISABLED");
  Serial.print(" target_pmv_limit=");
  Serial.print(targetPmvLimit, 2);
  Serial.print(" reason=");
  Serial.println(reason);
}

void buildTelemetryTopic(char *buffer, size_t bufferSize) {
  snprintf(buffer, bufferSize, "omnisense/node/%s/telemetry", NODE_ID);
}

void buildCommandTopic(char *buffer, size_t bufferSize) {
  snprintf(buffer, bufferSize, "omnisense/node/%s/command", NODE_ID);
}

uint8_t fanBaseDutyForHeadcount(int headcount) {
  if (headcount <= 0) {
    return FAN_SPEED_OFF;
  }

  if (headcount == 1) {
    return FAN_SPEED_1_PERSON;
  }

  if (headcount == 2) {
    return FAN_SPEED_2_PERSON;
  }

  return FAN_SPEED_3_PLUS;
}

int16_t fanComfortAdjustment(const char *comfortStatus) {
  if (strcmp(comfortStatus, "cold") == 0) {
    return FAN_COMFORT_COLD_ADJUST;
  }

  if (strcmp(comfortStatus, "warm") == 0) {
    return FAN_COMFORT_WARM_ADJUST;
  }

  if (strcmp(comfortStatus, "hot") == 0) {
    return FAN_COMFORT_HOT_ADJUST;
  }

  return FAN_COMFORT_COMFORTABLE_ADJUST;
}

uint8_t fanDutyForHeadcountAndComfort(int headcount, const char *comfortStatus) {
  if (headcount <= 0) {
    return FAN_SPEED_OFF;
  }

  int16_t adjustedDuty = fanBaseDutyForHeadcount(headcount) + fanComfortAdjustment(comfortStatus);
  return constrain(adjustedDuty, FAN_SPEED_OFF, FAN_SPEED_3_PLUS);
}

const char *fanModeForDuty(uint8_t fanDuty) {
  if (fanDuty <= FAN_SPEED_OFF) {
    return "off";
  }

  if (fanDuty <= FAN_SPEED_1_PERSON) {
    return "low";
  }

  if (fanDuty <= FAN_SPEED_2_PERSON) {
    return "medium";
  }

  return "high";
}

float roundToOneDecimal(float value) {
  if (isnan(value)) {
    return value;
  }

  return roundf(value * 10.0f) / 10.0f;
}

float roundToTwoDecimals(float value) {
  if (isnan(value)) {
    return value;
  }

  return roundf(value * 100.0f) / 100.0f;
}
