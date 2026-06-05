#include "Comfort.h"
#include <math.h>

namespace {
constexpr float TR_EQUALS_TA_OFFSET_C = 0.0f;
constexpr float AIR_VELOCITY_MS = 0.1f;
constexpr float MET = 1.1f;
constexpr float CLO = 0.6f;
constexpr float EXTERNAL_WORK_MET = 0.0f;
constexpr float COLD_PMV_LIMIT = -0.5f;
constexpr float COMFORTABLE_PMV_LIMIT = 0.5f;
constexpr float WARM_PMV_LIMIT = 1.0f;

float estimatePPD(float pmv) {
  return 100.0f -
         95.0f * expf(-0.03353f * powf(pmv, 4.0f) - 0.2179f * powf(pmv, 2.0f));
}
}  // namespace

PMVResult estimatePMV(float Ta, float RH) {
  PMVResult result;

  if (isnan(Ta) || isnan(RH)) {
    return result;
  }

  float Tr = Ta + TR_EQUALS_TA_OFFSET_C;
  float Va = AIR_VELOCITY_MS;
  float met = MET;
  float clo = CLO;
  float W = EXTERNAL_WORK_MET;

  float m = met * 58.15f;
  float w = W * 58.15f;
  float mw = m - w;
  float icl = 0.155f * clo;
  float fcl = icl <= 0.078f ? 1.0f + 1.29f * icl : 1.05f + 0.645f * icl;
  float hcf = 12.1f * sqrtf(Va);
  float taa = Ta + 273.0f;
  float tra = Tr + 273.0f;
  float pa = RH * 10.0f * expf(16.6536f - 4030.183f / (Ta + 235.0f));
  float p1 = icl * fcl;
  float p2 = p1 * 3.96f;
  float p3 = p1 * 100.0f;
  float p4 = p1 * taa;
  float p5 = 308.7f - 0.028f * mw + p2 * powf(tra / 100.0f, 4.0f);
  float xn = taa / 100.0f;
  float xf = xn;
  float hc = hcf;

  for (int i = 0; i < 150; i++) {
    xf = xn;
    float hcn = 2.38f * powf(fabsf(100.0f * xf - taa), 0.25f);
    hc = hcn > hcf ? hcn : hcf;
    xn = (p5 + p4 * hc - p2 * powf(xf, 4.0f)) / (100.0f + p3 * hc);

    if (fabsf(xn - xf) <= 0.00015f) {
      break;
    }
  }

  float tcl = 100.0f * xn - 273.0f;
  float heatLossSkin = 3.05f * 0.001f * (5733.0f - 6.99f * mw - pa);
  float heatLossSweat = mw > 58.15f ? 0.42f * (mw - 58.15f) : 0.0f;
  float heatLossLatentRespiration = 1.7f * 0.00001f * m * (5867.0f - pa);
  float heatLossDryRespiration = 0.0014f * m * (34.0f - Ta);
  float heatLossRadiation = 3.96f * fcl * (powf(xn, 4.0f) - powf(tra / 100.0f, 4.0f));
  float heatLossConvection = fcl * hc * (tcl - Ta);
  float thermalSensationTransfer = 0.303f * expf(-0.036f * m) + 0.028f;

  result.pmv =
    thermalSensationTransfer *
    (mw -
     heatLossSkin -
     heatLossSweat -
     heatLossLatentRespiration -
     heatLossDryRespiration -
     heatLossRadiation -
     heatLossConvection);
  result.ppd = estimatePPD(result.pmv);
  return result;
}

ComfortStatusResult getComfortStatus(float pmv, float ppd, float temperatureC) {
  ComfortStatusResult result;
  result.pmv = pmv;
  result.ppd = ppd;
  (void)temperatureC;

  if (pmv < COLD_PMV_LIMIT) {
    result.comfortStatus = "cold";
  } else if (pmv <= COMFORTABLE_PMV_LIMIT) {
    result.comfortStatus = "comfortable";
  } else if (pmv <= WARM_PMV_LIMIT) {
    result.comfortStatus = "warm";
  } else {
    result.comfortStatus = "hot";
  }

  result.alertLevel = result.comfortStatus;

  return result;
}
