#include "PirSensor.h"
#include "Config.h"

void PirSensor::begin() {
  pinMode(PIN_PIR, INPUT);
  _motionNow = false;
  _lastMotionMs = 0;
}

void PirSensor::update() {
  _motionNow = digitalRead(PIN_PIR) == HIGH;

  if (_motionNow) {
    _lastMotionMs = millis();
  }
}

bool PirSensor::motionNow() const {
  return _motionNow;
}

bool PirSensor::systemActive() const {
  if (_lastMotionMs == 0) {
    return false;
  }

  return millis() - _lastMotionMs <= PIR_NO_MOTION_TIMEOUT_MS;
}

unsigned long PirSensor::lastMotionAgeMs() const {
  if (_lastMotionMs == 0) {
    return 999999UL;
  }

  return millis() - _lastMotionMs;
}