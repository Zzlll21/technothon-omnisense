const TELEMETRY_TOPIC_PATTERN = /^omnisense\/node\/([^/]+)\/telemetry$/;

export function validateTelemetryMessage(topic, messageText) {
  const topicNodeId = parseNodeIdFromTopic(topic);
  if (!topicNodeId) {
    return reject(`Topic does not match omnisense/node/{node_id}/telemetry: ${topic}`);
  }

  let payload;
  try {
    payload = JSON.parse(messageText);
  } catch (error) {
    return reject(`Invalid JSON: ${error.message}`);
  }

  if (!isPlainObject(payload)) {
    return reject("Telemetry payload must be a JSON object.");
  }

  const errors = [];
  const warnings = [];

  requireNumber(payload, "temperature", errors);
  requireNumber(payload, "humidity", errors);
  requireNonNegativeInteger(payload, "headcount", errors);
  requireNumber(payload, "pmv", errors);
  requireBoolean(payload, "crisis_mode", errors);

  if (
    typeof payload.node_id === "string" &&
    payload.node_id.trim() &&
    payload.node_id !== topicNodeId
  ) {
    warnings.push(
      `Payload node_id "${payload.node_id}" does not match topic node_id "${topicNodeId}". Using topic node_id.`
    );
  }

  if (payload.recorded_at !== undefined && typeof payload.recorded_at !== "string") {
    errors.push("recorded_at must be an ISO 8601 string when provided.");
  }

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
      warnings,
      rawPayload: payload
    };
  }

  const normalized = {
    node_id: topicNodeId,
    temperature: payload.temperature,
    humidity: payload.humidity,
    headcount: payload.headcount,
    pmv: payload.pmv,
    crisis_mode: payload.crisis_mode,
    raw_payload: payload
  };

  if (payload.recorded_at !== undefined) {
    normalized.recorded_at = payload.recorded_at;
  }

  if (payload.hvac_state !== undefined) {
    normalized.hvac_state = payload.hvac_state;
  }

  if (payload.air_quality !== undefined) {
    normalized.air_quality = payload.air_quality;
  }

  return {
    ok: true,
    warnings,
    value: normalized
  };
}

export function parseNodeIdFromTopic(topic) {
  const match = topic.match(TELEMETRY_TOPIC_PATTERN);
  return match?.[1];
}

function reject(message) {
  return {
    ok: false,
    errors: [message],
    warnings: []
  };
}

function requireNumber(payload, field, errors) {
  if (payload[field] === undefined) {
    errors.push(`${field} is required.`);
    return;
  }

  if (typeof payload[field] !== "number" || !Number.isFinite(payload[field])) {
    errors.push(`${field} must be a number.`);
  }
}

function requireNonNegativeInteger(payload, field, errors) {
  if (payload[field] === undefined) {
    errors.push(`${field} is required.`);
    return;
  }

  if (!Number.isInteger(payload[field]) || payload[field] < 0) {
    errors.push(`${field} must be an integer >= 0.`);
  }
}

function requireBoolean(payload, field, errors) {
  if (payload[field] === undefined) {
    errors.push(`${field} is required.`);
    return;
  }

  if (typeof payload[field] !== "boolean") {
    errors.push(`${field} must be a boolean.`);
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

