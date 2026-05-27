import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mqtt from "mqtt";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadDotEnv(path.join(__dirname, ".env"));

const NODE_ID = "demo-1";
const brokerUrl = requiredEnv("MQTT_BROKER_URL");
const telemetryTopicTemplate = envOrDefault(
  "MQTT_TELEMETRY_TOPIC_TEMPLATE",
  "omnisense/node/{node_id}/telemetry"
);
const publishIntervalMs = parsePositiveInteger(
  envOrDefault("FAKE_PUBLISH_INTERVAL_MS", "3000"),
  "FAKE_PUBLISH_INTERVAL_MS"
);
const telemetryTopic = telemetryTopicTemplate.replace("{node_id}", NODE_ID);

const username = optionalEnv("MQTT_USERNAME");
const password = optionalEnv("MQTT_PASSWORD");
const clientId = "omnisense-fake-demo-1";

console.log("Fake ESP32 MQTT publisher starting...");
console.log(`Broker URL: ${sanitizeBrokerUrl(brokerUrl)}`);
console.log(`MQTT username: ${username ?? "(not set)"}`);
console.log(`MQTT password set: ${password ? "yes" : "no"}`);
console.log(`MQTT clientId: ${clientId}`);
console.log("MQTT protocol: 3.1.1");

const client = mqtt.connect(brokerUrl, {
  clean: true,
  clientId,
  protocolVersion: 4,
  reconnectPeriod: 2000,
  ...(username ? { username } : {}),
  ...(password ? { password } : {})
});

let publishTimer = null;
let readingNumber = 0;

client.on("connect", (packet) => {
  console.log(
    `MQTT connect: connected to ${sanitizeBrokerUrl(brokerUrl)} with clientId ${clientId}.`
  );
  if (packet?.sessionPresent !== undefined) {
    console.log(`MQTT connect: sessionPresent=${packet.sessionPresent}`);
  }
  console.log(`Publishing fake telemetry to: ${telemetryTopic}`);
  publishReading();
  publishTimer = setInterval(publishReading, publishIntervalMs);
});

client.on("reconnect", () => {
  console.log(`MQTT reconnect: reconnecting to ${sanitizeBrokerUrl(brokerUrl)}...`);
});

client.on("error", (error) => {
  console.error(`MQTT error: ${formatMqttError(error)}`);
});

client.on("offline", () => {
  console.log("MQTT offline: client is offline and waiting to reconnect.");
});

client.on("close", () => {
  console.log("MQTT close: connection closed.");
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function publishReading() {
  const scenario = scenarioFor(readingNumber);
  const payload = buildTelemetryPayload(scenario, readingNumber);
  const json = JSON.stringify(payload);

  client.publish(telemetryTopic, json, { qos: 0, retain: false }, (error) => {
    if (error) {
      console.error(`Publish failed: ${error.message}`);
      return;
    }

    console.log(`[${payload.recorded_at}] ${scenario.name}`);
    console.log(json);
  });

  readingNumber += 1;
}

function buildTelemetryPayload(scenario, sequence) {
  const jitter = Math.sin(sequence / 3);
  const headcount = clampInteger(Math.round(scenario.headcount + Math.sin(sequence / 4) * 0.7), 0, 8);
  const temperature = round(clamp(scenario.temperature + jitter * 0.2, 23, 30));
  const humidity = round(clamp(scenario.humidity + Math.cos(sequence / 5) * 1.1, 50, 70));
  const pmv = round(clamp(scenario.pmv + jitter * 0.05, -0.5, 1.8));

  return {
    node_id: NODE_ID,
    recorded_at: new Date().toISOString(),
    temperature,
    humidity,
    headcount,
    pmv,
    crisis_mode: scenario.crisis_mode,
    hvac_state: {
      mode: scenario.hvacMode,
      fan: scenario.fan,
      setpoint: scenario.setpoint
    },
    battery_voltage: round(4.1 - (sequence % 20) * 0.01),
    firmware_version: "fake-demo-0.1.0",
    raw_sensor_summary: {
      scenario: scenario.name,
      sequence,
      occupied: headcount > 0
    }
  };
}

function scenarioFor(sequence) {
  const cycleLength = 36;
  const phase = sequence % cycleLength;
  const scenarios = [
    {
      name: "normal_comfort",
      start: 0,
      end: 13,
      next: 1,
      temperature: 24.1,
      humidity: 55,
      headcount: 2,
      pmv: 0.1,
      crisis_mode: false,
      hvacMode: "cool",
      fan: "auto",
      setpoint: 24
    },
    {
      name: "warm_crowded_room",
      start: 13,
      end: 25,
      next: 2,
      temperature: 27.6,
      humidity: 62,
      headcount: 6,
      pmv: 1.0,
      crisis_mode: false,
      hvacMode: "cool",
      fan: "high",
      setpoint: 23
    },
    {
      name: "crisis_like_energy_saving",
      start: 25,
      end: 36,
      next: 0,
      temperature: 29.2,
      humidity: 66,
      headcount: 7,
      pmv: 1.55,
      crisis_mode: true,
      hvacMode: "eco",
      fan: "medium",
      setpoint: 26
    }
  ];

  const scenario = scenarios.find((item) => phase >= item.start && phase < item.end) ?? scenarios[0];
  const nextScenario = scenarios[scenario.next];
  const progress = (phase - scenario.start) / Math.max(1, scenario.end - scenario.start);
  const easedProgress = smoothstep(progress);
  const blendAmount = 0.35 * easedProgress;

  return {
    name: scenario.name,
    temperature: lerp(scenario.temperature, nextScenario.temperature, blendAmount),
    humidity: lerp(scenario.humidity, nextScenario.humidity, blendAmount),
    headcount: lerp(scenario.headcount, nextScenario.headcount, blendAmount),
    pmv: lerp(scenario.pmv, nextScenario.pmv, blendAmount),
    crisis_mode: scenario.crisis_mode,
    hvacMode: scenario.hvacMode,
    fan: scenario.fan,
    setpoint: scenario.setpoint
  };
}

function shutdown() {
  console.log("Stopping fake publisher...");
  if (publishTimer) {
    clearInterval(publishTimer);
  }

  client.end(false, () => {
    console.log("Fake publisher stopped.");
    process.exit(0);
  });
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (key && process.env[key] === undefined) {
      process.env[key] = stripQuotes(value);
    }
  }
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function sanitizeBrokerUrl(value) {
  try {
    const url = new URL(value);
    if (url.username) {
      url.username = "****";
    }
    if (url.password) {
      url.password = "****";
    }

    return url.toString();
  } catch {
    return value.replace(/\/\/([^:@/\s]+):([^@/\s]+)@/, "//****:****@");
  }
}

function formatMqttError(error) {
  if (!error) {
    return "unknown error";
  }

  const details = [
    error.code ? `code=${error.code}` : null,
    error.errno ? `errno=${error.errno}` : null,
    error.message ? `message=${error.message}` : String(error)
  ].filter(Boolean);

  return details.join(" ");
}

function requiredEnv(name) {
  const value = optionalEnv(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function optionalEnv(name) {
  const value = process.env[name]?.trim();
  if (!value || value.startsWith("your-")) {
    return undefined;
  }

  return value;
}

function envOrDefault(name, fallback) {
  return optionalEnv(name) ?? fallback;
}

function parsePositiveInteger(value, name) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clampInteger(value, min, max) {
  return Math.trunc(clamp(value, min, max));
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function smoothstep(value) {
  const clamped = clamp(value, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}
