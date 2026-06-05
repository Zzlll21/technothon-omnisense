#pragma once
#include <Arduino.h>
#include <Adafruit_AMG88xx.h>

struct ThermalResult {
  bool valid = false;

  // people = 0, 1, 2, or 3.
  // 3 means "3 or more".
  int people = 0;

  // Actual blobs before limiting to 3+.
  int rawBlobs = 0;
  int fallbackPeople = 0;

  bool aiUsed = false;
  bool aiLowConfidence = false;
  const char *aiLabel = "not_run";
  float aiConfidence = 0.0;

  float ambientC = NAN;
  float thresholdC = NAN;
  float maxTempC = NAN;
};

class ThermalArray {
public:
  bool begin();
  ThermalResult readAndCount();
  void printMatrix(const ThermalResult &result);
  bool ok() const;

private:
  Adafruit_AMG88xx _amg;
  bool _ok = false;
  float _pixels[64];

  float estimateAmbientFromCoolPixels();
  int runAiHeadcount(ThermalResult &result);
  int peopleFromAiLabel(const char *label) const;
  int countHotBlobs(float thresholdC);
};
