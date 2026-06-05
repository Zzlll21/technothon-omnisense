#pragma once
#include <Arduino.h>

struct PMVResult {
  float pmv = NAN;
  float ppd = NAN;
};

struct ComfortStatusResult {
  const char *comfortStatus = "comfortable";
  const char *alertLevel = "normal";
  float pmv = NAN;
  float ppd = NAN;
};

PMVResult estimatePMV(float Ta, float RH);
ComfortStatusResult getComfortStatus(float pmv, float ppd, float temperatureC);
