#include "BmeSensor.h"

bool BmeSensor::begin() {
  // BME280 I2C address
  _ok = _bme.begin(0x76, &Wire);

  return _ok;
}

BmeReading BmeSensor::read() {
  BmeReading reading;

  if (!_ok) {
    return reading;
  }

  reading.valid = true;
  reading.temperatureC = _bme.readTemperature();
  reading.humidityPct = _bme.readHumidity();

  // Pressure is not read or printed because your project does not use pressure.
  return reading;
}

bool BmeSensor::ok() const {
  return _ok;
}