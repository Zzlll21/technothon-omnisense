#include "TofSensor.h"
#include "Config.h"
#include <Wire.h>

#if __has_include(<vl53l8cx.h>)
  #include <vl53l8cx.h>
  #define OMNISENSE_HAS_VL53L8_TOF_LIBRARY 1
#else
  #define OMNISENSE_HAS_VL53L8_TOF_LIBRARY 0
#endif

#if OMNISENSE_HAS_VL53L8_TOF_LIBRARY
static VL53L8CX tof(&Wire, PIN_TOF_LPN);
static VL53L8CX_ResultsData tofResults;
#endif

namespace {
struct TofCluster {
  uint8_t zones = 0;
  uint32_t distanceSumMm = 0;
  uint16_t minDistanceMm = 0;
  uint16_t maxDistanceMm = 0;
};

bool isCandidateHandZone(uint16_t distanceMm, uint8_t targetStatus) {
  if (distanceMm < TOF_HAND_MIN_DISTANCE_MM || distanceMm > TOF_HAND_MAX_DISTANCE_MM) {
    return false;
  }

  // ST commonly reports 5 as valid, but accept other non-zero statuses
  // so the demo is not brittle across VL53L8 library versions.
  return targetStatus != 0 && targetStatus != 255;
}

TofCluster countLargestCluster(const bool handZone[TOF_GRID_ZONES], const uint16_t distances[TOF_GRID_ZONES]) {
  bool visited[TOF_GRID_ZONES] = {false};
  TofCluster best;

  for (uint8_t start = 0; start < TOF_GRID_ZONES; start++) {
    if (!handZone[start] || visited[start]) {
      continue;
    }

    uint8_t queue[TOF_GRID_ZONES];
    uint8_t front = 0;
    uint8_t back = 0;
    TofCluster current;

    queue[back++] = start;
    visited[start] = true;
    current.minDistanceMm = distances[start];
    current.maxDistanceMm = distances[start];

    while (front < back) {
      uint8_t index = queue[front++];
      uint16_t distance = distances[index];
      current.zones++;
      current.distanceSumMm += distance;

      if (distance < current.minDistanceMm) {
        current.minDistanceMm = distance;
      }

      if (distance > current.maxDistanceMm) {
        current.maxDistanceMm = distance;
      }

      int x = index % TOF_GRID_WIDTH;
      int y = index / TOF_GRID_WIDTH;
      int dxList[4] = {1, -1, 0, 0};
      int dyList[4] = {0, 0, 1, -1};

      for (uint8_t k = 0; k < 4; k++) {
        int nx = x + dxList[k];
        int ny = y + dyList[k];

        if (nx < 0 || nx >= TOF_GRID_WIDTH || ny < 0 || ny >= TOF_GRID_WIDTH) {
          continue;
        }

        uint8_t nextIndex = ny * TOF_GRID_WIDTH + nx;
        if (handZone[nextIndex] && !visited[nextIndex]) {
          visited[nextIndex] = true;
          queue[back++] = nextIndex;
        }
      }
    }

    if (current.zones > best.zones) {
      best = current;
    }
  }

  return best;
}
}  // namespace

bool TofSensor::begin() {
#if OMNISENSE_HAS_VL53L8_TOF_LIBRARY
  tof.begin();

  uint8_t sensorAlive = 0;
  if (tof.is_alive(&sensorAlive) != 0 || sensorAlive == 0) {
    _ok = false;
    return false;
  }

  if (tof.init() != 0) {
    _ok = false;
    return false;
  }

  tof.set_resolution(VL53L8CX_RESOLUTION_8X8);
  tof.set_ranging_frequency_hz(10);

  if (tof.start_ranging() != 0) {
    _ok = false;
    return false;
  }

  _ok = true;
  return true;
#else
  _ok = false;
  return false;
#endif
}

bool TofSensor::ok() const {
  return _ok;
}

TofReading TofSensor::readAndValidateHuman() {
  TofReading reading;

#if OMNISENSE_HAS_VL53L8_TOF_LIBRARY
  if (!_ok) {
    return reading;
  }

  reading.available = true;
  reading.source = "vl53l8_8x8";

  uint8_t dataReady = 0;
  if (tof.check_data_ready(&dataReady) != 0 || dataReady == 0) {
    reading.source = "vl53l8_waiting";
    return reading;
  }

  if (tof.get_ranging_data(&tofResults) != 0) {
    reading.source = "vl53l8_read_failed";
    return reading;
  }

  reading.dataReady = true;

  bool handZone[TOF_GRID_ZONES] = {false};
  uint16_t distances[TOF_GRID_ZONES] = {0};
  uint32_t distanceSumMm = 0;

  for (uint8_t i = 0; i < TOF_GRID_ZONES; i++) {
    uint16_t resultIndex = VL53L8CX_NB_TARGET_PER_ZONE * i;
    if (tofResults.nb_target_detected[i] == 0) {
      continue;
    }

    uint16_t distanceMm = tofResults.distance_mm[resultIndex];
    uint8_t targetStatus = tofResults.target_status[resultIndex];
    distances[i] = distanceMm;

    if (!isCandidateHandZone(distanceMm, targetStatus)) {
      continue;
    }

    handZone[i] = true;
    reading.validZoneCount++;
    distanceSumMm += distanceMm;

    if (reading.minDistanceMm == 0 || distanceMm < reading.minDistanceMm) {
      reading.minDistanceMm = distanceMm;
    }

    if (distanceMm > reading.maxDistanceMm) {
      reading.maxDistanceMm = distanceMm;
    }
  }

  if (reading.validZoneCount > 0) {
    reading.averageDistanceMm = static_cast<float>(distanceSumMm) / reading.validZoneCount;
  }

  TofCluster largestCluster = countLargestCluster(handZone, distances);
  reading.largestClusterZones = largestCluster.zones;

  uint16_t depthSpreadMm =
    largestCluster.maxDistanceMm > largestCluster.minDistanceMm
      ? largestCluster.maxDistanceMm - largestCluster.minDistanceMm
      : 0;

  reading.humanValidated =
    reading.validZoneCount >= TOF_MIN_VALID_ZONES &&
    largestCluster.zones >= TOF_MIN_CLUSTER_ZONES &&
    depthSpreadMm <= TOF_MAX_CLUSTER_DEPTH_SPREAD_MM;

  return reading;
#else
  return reading;
#endif
}
