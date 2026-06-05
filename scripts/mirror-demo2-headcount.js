const fs = require("node:fs");
const path = require("node:path");

const MQTT = require("../services/mqtt-subscriber/node_modules/mqtt");

const REPO_ROOT = path.resolve(__dirname, "..");
const SUBSCRIBER_ENV_PATH = path.join(REPO_ROOT, "services", "mqtt-subscriber", ".env");

const DEMO1_TELEMETRY_TOPIC = "omnisense/node/demo-1/telemetry";
const DEMO2_HEADCOUNT_TOPIC = "omnisense/node/demo-2/headcount";
const DEMO2_TELEMETRY_TOPIC = "omnisense/node/demo-2/telemetry";
const CLIENT_ID = "omnisense-mirror-demo2-headcount";

loadDotEnv(SUBSCRIBER_ENV_PATH);

const brokerUrl = requiredEnv("MQTT_BROKER_URL");
const username = optionalEnv("MQTT_USERNAME");
const password = optionalEnv("MQTT_PASSWORD");

let latestDemo1Telemetry = null;
let latestDemo2Headcount = null;

console.log("Demo-2 headcount mirror starting...");
console.log(`Loading MQTT config from: ${SUBSCRIBER_ENV_PATH}`);
console.log(`Broker URL: ${sanitizeBrokerUrl(brokerUrl)}`);
console.log(`MQTT username: ${username ?? "(not set)"}`);
console.log(`MQTT password set: ${password ? "yes" : "no"}`);
console.log(`MQTT clientId: ${CLIENT_ID}`);

const client = MQTT.connect(brokerUrl, {
  clean: true,
  clientId: CLIENT_ID,
  protocolVersion: 4,
  reconnectPeriod: 2000,
  ...(username ? { username } : {}),
  ...(password ? { password } : {})
});

client.on("connect", () => {
  console.log(`Connected to MQTT broker: ${sanitizeBrokerUrl(brokerUrl)}`);

  client.subscribe([DEMO1_TELEMETRY_TOPIC, DEMO2_HEADCOUNT_TOPIC], { qos: 0 }, (error) => {
    if (error) {
      console.error(`Subscribe failed: ${formatMqttError(error)}`);
      return;
    }

    console.log(`Subscribed: ${DEMO1_TELEMETRY_TOPIC}`);
    console.log(`Subscribed: ${DEMO2_HEADCOUNT_TOPIC}`);
  });
});

client.on("message", (topic, buffer) => {
  const messageText = buffer.toString("utf8");

  if (topic === DEMO1_TELEMETRY_TOPIC) {
    handleDemo1Telemetry(messageText);
    return;
  }

  if (topic === DEMO2_HEADCOUNT_TOPIC) {
    handleDemo2Headcount(messageText);
    return;
  }

  console.log(`Ignoring unexpected topic: ${topic}`);
});

client.on("reconnect", () => {
  console.log("MQTT reconnect: reconnecting...");
});

client.on("offline", () => {
  console.log("MQTT offline: waiting to reconnect.");
});

client.on("close", () => {
  console.log("MQTT close: connection closed.");
});

client.on("error", (error) => {
  console.error(`MQTT error: ${formatMqttError(error)}`);
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function handleDemo1Telemetry(messageText) {
  const payload = parseJson(messageText, DEMO1_TELEMETRY_TOPIC);
  if (!payload) {
    return;
  }

  const validationError = validateDemo1Telemetry(payload);
  if (validationError) {
    console.warn(`Rejected demo-1 telemetry: ${validationError}`);
    return;
  }

  latestDemo1Telemetry = payload;
  console.log(
    `Received demo-1 telemetry: temp=${payload.temperature}, humidity=${payload.humidity}, pmv=${payload.pmv}, crisis=${payload.crisis_mode}`
  );
  publishCombinedTelemetry();
}

function handleDemo2Headcount(messageText) {
  const payload = parseJson(messageText, DEMO2_HEADCOUNT_TOPIC);
  if (!payload) {
    return;
  }

  const headcount = normalizeHeadcount(payload.headcount);
  if (headcount === null) {
    console.warn(`Rejected demo-2 headcount: invalid headcount ${JSON.stringify(payload.headcount)}`);
    return;
  }

  if (payload.node_id && payload.node_id !== "demo-2") {
    console.warn(`demo-2 headcount node_id mismatch: ${payload.node_id}. Using demo-2.`);
  }

  latestDemo2Headcount = headcount;
  console.log(`Received demo-2 headcount: ${latestDemo2Headcount}`);
  publishCombinedTelemetry();
}

function publishCombinedTelemetry() {
  if (!latestDemo1Telemetry || latestDemo2Headcount === null) {
    console.log("Waiting for both demo-1 telemetry and demo-2 headcount before publishing.");
    return;
  }

  const payload = {
    node_id: "demo-2",
    recorded_at: new Date().toISOString(),
    temperature: latestDemo1Telemetry.temperature,
    humidity: latestDemo1Telemetry.humidity,
    headcount: latestDemo2Headcount,
    pmv: latestDemo1Telemetry.pmv,
    crisis_mode: latestDemo1Telemetry.crisis_mode,
    hvac_state: latestDemo1Telemetry.hvac_state
  };

  const json = JSON.stringify(payload);
  client.publish(DEMO2_TELEMETRY_TOPIC, json, { qos: 0, retain: false }, (error) => {
    if (error) {
      console.error(`Publish combined demo-2 telemetry failed: ${formatMqttError(error)}`);
      return;
    }

    console.log(
      `Published combined demo-2 telemetry to ${DEMO2_TELEMETRY_TOPIC}: headcount=${payload.headcount}, temp=${payload.temperature}, pmv=${payload.pmv}`
    );
  });
}

function validateDemo1Telemetry(payload) {
  if (!isPlainObject(payload)) {
    return "payload must be a JSON object.";
  }

  if (!Number.isFinite(payload.temperature)) {
    return "temperature must be a number.";
  }

  if (!Number.isFinite(payload.humidity)) {
    return "humidity must be a number.";
  }

  if (!Number.isFinite(payload.pmv)) {
    return "pmv must be a number.";
  }

  if (typeof payload.crisis_mode !== "boolean") {
    return "crisis_mode must be a boolean.";
  }

  return null;
}

function normalizeHeadcount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  const rounded = Math.round(parsed);
  if (rounded < 0) {
    return null;
  }

  return rounded;
}

function parseJson(messageText, topic) {
  try {
    const payload = JSON.parse(messageText);
    if (!isPlainObject(payload)) {
      console.warn(`Rejected ${topic}: payload must be a JSON object.`);
      return null;
    }

    return payload;
  } catch (error) {
    console.warn(`Rejected ${topic}: invalid JSON: ${error.message}`);
    return null;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function shutdown() {
  console.log("Stopping demo-2 headcount mirror...");
  client.end(false, () => {
    console.log("Demo-2 headcount mirror stopped.");
    process.exit(0);
  });
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing env file: ${filePath}`);
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
