#include "FanControl.h"
#include "Config.h"

#if __has_include(<esp_arduino_version.h>)
  #include <esp_arduino_version.h>
#endif

void FanControl::begin() {
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
  ledcAttach(PIN_FAN_PWM, FAN_PWM_FREQ, FAN_PWM_RESOLUTION_BITS);
#else
  ledcSetup(FAN_PWM_CHANNEL, FAN_PWM_FREQ, FAN_PWM_RESOLUTION_BITS);
  ledcAttachPin(PIN_FAN_PWM, FAN_PWM_CHANNEL);
#endif

  allOff();
}

void FanControl::allOff() {
  setFanDuty(FAN_SPEED_OFF);
}

void FanControl::applyHeadcount(int people) {
  if (people <= 0) {
    setFanDuty(FAN_SPEED_OFF);
  } else if (people == 1) {
    setFanDuty(FAN_SPEED_1_PERSON);
  } else if (people == 2) {
    setFanDuty(FAN_SPEED_2_PERSON);
  } else {
    setFanDuty(FAN_SPEED_3_PLUS);
  }
}

void FanControl::setFanDuty(uint8_t desiredDuty) {
  _currentDuty = desiredDuty;
  writeFanHardware(desiredDuty);
}

uint8_t FanControl::currentFanDuty() const {
  return _currentDuty;
}

void FanControl::writeFanHardware(uint8_t desiredDuty) {
  uint8_t hardwareDuty = desiredDuty;

  if (FAN_PWM_INVERTED) {
    hardwareDuty = 255 - desiredDuty;
  }

#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
  ledcWrite(PIN_FAN_PWM, hardwareDuty);
#else
  ledcWrite(FAN_PWM_CHANNEL, hardwareDuty);
#endif
}
