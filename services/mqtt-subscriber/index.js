import mqtt from "mqtt";

const brokerUrl = requiredEnv("MQTT_BROKER_URL");
const username = optionalEnv("MQTT_USERNAME");
const password = optionalEnv("MQTT_PASSWORD");
const telemetryTopic = envOrDefault("MQTT_TELEMETRY_TOPIC", "omnisense/node/+/telemetry");
const clientId = "omnisense-mqtt-subscriber";

console.log("OmniSense MQTT subscriber starting...");
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

client.on("connect", (packet) => {
  console.log(
    `MQTT connect: connected to ${sanitizeBrokerUrl(brokerUrl)} with clientId ${clientId}.`
  );
  if (packet?.sessionPresent !== undefined) {
    console.log(`MQTT connect: sessionPresent=${packet.sessionPresent}`);
  }

  client.subscribe(telemetryTopic, { qos: 0 }, (error, granted) => {
    if (error) {
      console.error(`MQTT subscribe failed: ${formatMqttError(error)}`);
      return;
    }

    const subscriptions = granted
      .map((item) => `${item.topic} (qos ${item.qos})`)
      .join(", ");
    console.log(`MQTT subscribed: ${subscriptions}`);
  });
});

client.on("message", (topic, message) => {
  console.log(`MQTT message received: topic=${topic}`);

  const topicNodeId = parseNodeIdFromTopic(topic);
  console.log(`Parsed node_id from topic: ${topicNodeId ?? "(not found)"}`);

  let payload;
  try {
    payload = JSON.parse(message.toString("utf8"));
  } catch (error) {
    console.error(`Invalid telemetry JSON on ${topic}: ${error.message}`);
    console.error(`Raw message: ${message.toString("utf8")}`);
    return;
  }

  const payloadNodeId = typeof payload.node_id === "string" ? payload.node_id : undefined;
  const nodeId = topicNodeId ?? payloadNodeId ?? "(unknown)";
  console.log(`Parsed node_id: ${nodeId}`);
  console.log("Parsed telemetry payload:");
  console.log(JSON.stringify(payload, null, 2));
});

client.on("reconnect", () => {
  console.log(`MQTT reconnect: reconnecting to ${sanitizeBrokerUrl(brokerUrl)}...`);
});

client.on("offline", () => {
  console.log("MQTT offline: client is offline and waiting to reconnect.");
});

client.on("close", () => {
  console.log("MQTT close: connection closed.");
});

client.on("error", (error) => {
  console.error(`MQTT error: ${formatMqttError(error)}`);
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function shutdown() {
  console.log("Stopping MQTT subscriber...");
  client.end(false, () => {
    console.log("MQTT subscriber stopped.");
    process.exit(0);
  });
}

function parseNodeIdFromTopic(topic) {
  const match = topic.match(/^omnisense\/node\/([^/]+)\/telemetry$/);
  return match?.[1];
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

