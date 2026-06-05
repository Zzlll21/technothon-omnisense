#pragma once
#include <Arduino.h>

class PirSensor {
public:
  void begin();
  void update();

  bool motionNow() const;
  bool systemActive() const;

  unsigned long lastMotionAgeMs() const;

private:
  bool _motionNow = false;
  unsigned long _lastMotionMs = 0;
};