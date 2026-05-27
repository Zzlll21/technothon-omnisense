import mqtt from "mqtt";

const brokerUrl = requiredEnv("MQTT_BROKER_URL");
const username = optionalEnv("MQTT_USERNAME");
const password = optionalEnv("MQTT_PASSWORD");
const commandTopicTemplate = envOrDefault(
  "MQTT_COMMAND_TOPIC_TEMPLATE",
  "omnisense/node/{node_id}/command"
);
const clientId = "omnisense-control-api";

let connected = false;

console.log("OmniSense control MQTT publisher starting...");
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
  connected = true;
  console.log(
    `MQTT connect: connected to ${sanitizeBrokerUrl(brokerUrl)} with clientId ${clientId}.`
  );
  if (packet?.sessionPresent !== undefined) {
    console.log(`MQTT connect: sessionPresent=${packet.sessionPresent}`);
  }
});

client.on("reconnect", () => {
  console.log(`MQTT reconnect: reconnecting to ${sanitizeBrokerUrl(brokerUrl)}...`);
});

client.on("offline", () => {
  connected = false;
  console.log("MQTT offline: client is offline and waiting to reconnect.");
});

client.on("close", () => {
  connected = false;
  console.log("MQTT close: connection closed.");
});

client.on("error", (error) => {
  console.error(`MQTT error: ${formatMqttError(error)}`);
});

export async function publishCrisisCommand({
  node_id,
  enabled,
  target_pmv_limit,
  reason
}) {
  const topic = buildCommandTopic(node_id);
  const payload = {
    command: "SET_CRISIS_MODE",
    enabled,
    target_pmv_limit: target_pmv_limit ?? 1.0,
    reason: reason ?? "dashboard_demo"
  };

  await waitForConnect();
  await publishJson(topic, payload);

  return {
    topic,
    payload
  };
}

export function closeMqttPublisher(callback) {
  client.end(false, callback);
}

function buildCommandTopic(nodeId) {
  return commandTopicTemplate.replace("{node_id}", nodeId);
}

function publishJson(topic, payload) {
  return new Promise((resolve, reject) => {
    client.publish(topic, JSON.stringify(payload), { qos: 0 }, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function waitForConnect() {
  if (connected) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("MQTT client is not connected yet."));
    }, 5000);

    const handleConnect = () => {
      cleanup();
      resolve();
    };

    const handleError = (error) => {
      cleanup();
      reject(error);
    };

    const cleanup = () => {
      clearTimeout(timeout);
      client.off("connect", handleConnect);
      client.off("error", handleError);
    };

    client.once("connect", handleConnect);
    client.once("error", handleError);
  });
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
