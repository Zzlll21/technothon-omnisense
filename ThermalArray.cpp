#include "ThermalArray.h"
#include "Config.h"
#include <OmniSense_Thermal_Headcount_inferencing.h>
#include <string.h>

static float *thermalAiFeatures = nullptr;

static int thermalAiGetData(size_t offset, size_t length, float *outPtr) {
  if (thermalAiFeatures == nullptr) {
    return -1;
  }

  memcpy(outPtr, thermalAiFeatures + offset, length * sizeof(float));
  return 0;
}

bool ThermalArray::begin() {
  // AMG8833 I2C address
  _ok = _amg.begin(0x69);
  return _ok;
}

bool ThermalArray::ok() const {
  return _ok;
}

ThermalResult ThermalArray::readAndCount() {
  ThermalResult result;

  if (!_ok) {
    return result;
  }

  _amg.readPixels(_pixels);
  result.valid = true;

  result.ambientC = estimateAmbientFromCoolPixels();
  float adaptiveThresholdC = result.ambientC + THERMAL_DELTA_C;
  result.thresholdC =
    adaptiveThresholdC > THERMAL_ABSOLUTE_MIN_C ? adaptiveThresholdC : THERMAL_ABSOLUTE_MIN_C;

  result.maxTempC = _pixels[0];

  for (int i = 1; i < 64; i++) {
    if (_pixels[i] > result.maxTempC) {
      result.maxTempC = _pixels[i];
    }
  }

  result.rawBlobs = countHotBlobs(result.thresholdC);
  result.fallbackPeople = constrain(result.rawBlobs, 0, MAX_REPORTED_PEOPLE);
  result.people = runAiHeadcount(result);

  return result;
}

float ThermalArray::estimateAmbientFromCoolPixels() {
  float sorted[64];

  for (int i = 0; i < 64; i++) {
    sorted[i] = _pixels[i];
  }

  // Simple sorting for 64 pixels
  for (int i = 0; i < 63; i++) {
    for (int j = i + 1; j < 64; j++) {
      if (sorted[j] < sorted[i]) {
        float temp = sorted[i];
        sorted[i] = sorted[j];
        sorted[j] = temp;
      }
    }
  }

  // Average the coolest 16 pixels.
  // This prevents hands from making the ambient estimate too high.
  float sum = 0;

  for (int i = 0; i < 16; i++) {
    sum += sorted[i];
  }

  return sum / 16.0;
}

int ThermalArray::runAiHeadcount(ThermalResult &result) {
  if (EI_CLASSIFIER_DSP_INPUT_FRAME_SIZE != 64) {
    result.aiLabel = "input_size_mismatch";
    return result.fallbackPeople;
  }

  signal_t signal;
  signal.total_length = 64;
  signal.get_data = &thermalAiGetData;

  thermalAiFeatures = _pixels;
  ei_impulse_result_t inferenceResult = { 0 };
  EI_IMPULSE_ERROR error = run_classifier(&signal, &inferenceResult, false);
  thermalAiFeatures = nullptr;

  if (error != EI_IMPULSE_OK) {
    result.aiLabel = "inference_failed";
    return result.fallbackPeople;
  }

  size_t bestIndex = 0;
  float bestValue = inferenceResult.classification[0].value;

  for (size_t i = 1; i < EI_CLASSIFIER_LABEL_COUNT; i++) {
    float value = inferenceResult.classification[i].value;
    if (value > bestValue) {
      bestValue = value;
      bestIndex = i;
    }
  }

  result.aiUsed = true;
  result.aiLabel = inferenceResult.classification[bestIndex].label;
  result.aiConfidence = bestValue;

  if (bestValue < EI_CLASSIFIER_THRESHOLD) {
    result.aiLowConfidence = true;
    return result.fallbackPeople;
  }

  int aiPeople = peopleFromAiLabel(result.aiLabel);
  if (aiPeople < 0) {
    result.aiLowConfidence = true;
    return result.fallbackPeople;
  }

  return aiPeople;
}

int ThermalArray::peopleFromAiLabel(const char *label) const {
  if (strcmp(label, "EMPTY_CORE") == 0) {
    return 0;
  }

  if (strcmp(label, "OCCUPIED_1P") == 0) {
    return 1;
  }

  if (strcmp(label, "OCCUPIED_2P") == 0) {
    return 2;
  }

  if (strcmp(label, "OCCUPIED_3P_PLUS") == 0) {
    return 3;
  }

  return -1;
}

int ThermalArray::countHotBlobs(float thresholdC) {
  bool hot[64];
  bool visited[64];

  for (int i = 0; i < 64; i++) {
    hot[i] = _pixels[i] >= thresholdC;
    visited[i] = false;
  }

  int blobs = 0;

  for (int start = 0; start < 64; start++) {
    if (!hot[start] || visited[start]) {
      continue;
    }

    int queue[64];
    int front = 0;
    int back = 0;
    int blobSize = 0;

    queue[back++] = start;
    visited[start] = true;

    while (front < back) {
      int index = queue[front++];
      blobSize++;

      int x = index % 8;
      int y = index / 8;

      // 4-neighbour flood fill only:
      // up, down, left, right.
      // This prevents two close hands from merging too easily.
      int dxList[4] = {1, -1, 0, 0};
      int dyList[4] = {0, 0, 1, -1};

      for (int k = 0; k < 4; k++) {
        int nx = x + dxList[k];
        int ny = y + dyList[k];

        if (nx < 0 || nx >= 8 || ny < 0 || ny >= 8) {
          continue;
        }

        int ni = ny * 8 + nx;

        if (hot[ni] && !visited[ni]) {
          visited[ni] = true;
          queue[back++] = ni;
        }
      }
    }

    if (blobSize >= MIN_HOT_PIXELS_PER_BLOB) {
      blobs++;
    }
  }

  return blobs;
}

void ThermalArray::printMatrix(const ThermalResult &result) {
  if (!result.valid) {
    Serial.println("AMG8833 not available.");
    return;
  }

  Serial.println();
  Serial.println("AMG8833 8x8 live thermal array, C.  * = hot pixel used for counting");

  Serial.print("Threshold: ");
  Serial.print(result.thresholdC, 1);
  Serial.println(" C");

  for (int y = 0; y < 8; y++) {
    for (int x = 0; x < 8; x++) {
      int i = y * 8 + x;
      bool isHot = _pixels[i] >= result.thresholdC;

      Serial.printf("%4.1f%c ", _pixels[i], isHot ? '*' : ' ');
    }

    Serial.println();
  }

  Serial.println();
}
