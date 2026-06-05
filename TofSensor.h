#pragma once
#include <Arduino.h>

struct TofReading {
  bool available = false;
  bool dataReady = false;
  bool humanValidated = false;
  uint8_t validZoneCount = 0;
  uint8_t largestClusterZones = 0;
  float averageDistanceMm = NAN;
  uint16_t minDistanceMm = 0;
  uint16_t maxDistanceMm = 0;
  const char *source = "tof_unavailable";
};

class TofSensor {
public:
  bool begin();
  TofReading readAndValidateHuman();
  bool ok() const;

private:
  bool _ok = false;
};
