#pragma once
#include <Arduino.h>

// ===== ESP32 DevKit V1 pins =====
constexpr uint8_t PIN_PIR        = 27;

constexpr uint8_t PIN_FAN_PWM    = 25;

constexpr uint8_t PIN_I2C_SDA = 21;
constexpr uint8_t PIN_I2C_SCL = 22;

constexpr uint8_t PIN_TOF_LPN = 19;
constexpr uint8_t PIN_TOF_INT = 23;  // Optional; left unused unless your library needs it.

// ===== Activation settings =====
constexpr unsigned long NO_ACTIVITY_TIMEOUT_MS = 10000;

// Add this line to prevent old PirSensor.cpp error
constexpr unsigned long PIR_NO_MOTION_TIMEOUT_MS = NO_ACTIVITY_TIMEOUT_MS;

// ===== Sensor read timing =====
constexpr unsigned long SENSOR_READ_INTERVAL_MS = 200;

// ===== Thermal detection tuning =====
constexpr float THERMAL_DELTA_C = 1.5;
constexpr float THERMAL_ABSOLUTE_MIN_C = 30.5;

constexpr uint8_t MIN_HOT_PIXELS_PER_BLOB = 1;

// 3 means 3 or more
constexpr uint8_t MAX_REPORTED_PEOPLE = 3;

// ===== VL53L8 / 8x8 ToF validation tuning =====
constexpr uint8_t TOF_GRID_WIDTH = 8;
constexpr uint8_t TOF_GRID_ZONES = 64;
constexpr uint16_t TOF_HAND_MIN_DISTANCE_MM = 70;
constexpr uint16_t TOF_HAND_MAX_DISTANCE_MM = 650;
constexpr uint8_t TOF_MIN_VALID_ZONES = 3;
constexpr uint8_t TOF_MIN_CLUSTER_ZONES = 3;
constexpr uint16_t TOF_MAX_CLUSTER_DEPTH_SPREAD_MM = 220;

// ===== Fan PWM settings =====
constexpr uint32_t FAN_PWM_FREQ = 25000;
constexpr uint8_t FAN_PWM_RESOLUTION_BITS = 8;
constexpr uint8_t FAN_PWM_CHANNEL = 0;

// If fan speed becomes opposite, change this to false.
constexpr bool FAN_PWM_INVERTED = true;

// Obvious fan speed differences
constexpr uint8_t FAN_SPEED_OFF      = 0;
constexpr uint8_t FAN_SPEED_1_PERSON = 90;
constexpr uint8_t FAN_SPEED_2_PERSON = 165;
constexpr uint8_t FAN_SPEED_3_PLUS   = 255;

// Comfort-mode adjustment applied after the headcount base speed.
constexpr int16_t FAN_COMFORT_COLD_ADJUST = -60;
constexpr int16_t FAN_COMFORT_COMFORTABLE_ADJUST = 0;
constexpr int16_t FAN_COMFORT_WARM_ADJUST = 40;
constexpr int16_t FAN_COMFORT_HOT_ADJUST = 80;

constexpr uint32_t SERIAL_BAUD = 115200;
