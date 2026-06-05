#pragma once
#include <Arduino.h>
#include <Adafruit_BME280.h>

struct BmeReading {
  bool valid = false;
  float temperatureC = NAN;
  float humidityPct = NAN;
};

class BmeSensor {
public:
  bool begin();
  BmeReading read();
  bool ok() const;

private:
  Adafruit_BME280 _bme;
  bool _ok = false;
};