#pragma once
#include <Arduino.h>

class FanControl {
public:
  void begin();

  void allOff();
  void applyHeadcount(int people);

  void setFanDuty(uint8_t desiredDuty);
  uint8_t currentFanDuty() const;

private:
  uint8_t _currentDuty = 0;

  void writeFanHardware(uint8_t desiredDuty);
};
