import { COOLING_MODES, DATA_SOURCES, DECISION_REASONS, NODE_CLASSES, NODE_STATES, OCCUPANCY_STATES, OVERRIDE_STATES, SCHEMA_VERSION } from "./types.js";
import type { SdpEvent } from "./types.js";

type Check = (value: unknown, path: string, errors: string[]) => void;
const check = (predicate: (value: unknown) => boolean, description: string): Check =>
  (value, path, errors) => { if (!predicate(value)) errors.push(`${path}: expected ${description}`); };
const text = check(v => typeof v === "string" && v.trim().length > 0, "non-empty string");
const finite = check(v => typeof v === "number" && Number.isFinite(v), "finite number");
const positiveInteger = check(v => Number.isInteger(v) && Number(v) > 0, "positive integer");
const nonNegativeInteger = check(v => Number.isInteger(v) && Number(v) >= 0, "non-negative integer");
const unitInterval = check(v => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1, "number in [0, 1]");
const percent = check(v => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100, "percentage in [0, 100]");
const utc = check(v => isUtcTimestamp(v), "valid UTC ISO timestamp ending in Z");
const oneOf = (values: readonly unknown[]): Check => check(v => values.includes(v), values.join(" | "));
const nullable = (rule: Check): Check => (v, p, e) => { if (v !== null) rule(v, p, e); };
const list = (rule: Check, min = 0): Check => (v, p, e) => {
  if (!Array.isArray(v) || v.length < min) { e.push(`${p}: expected array with at least ${min} items`); return; }
  v.forEach((item, i) => rule(item, `${p}[${i}]`, e));
};
const object = (fields: Record<string, Check>): Check => (v, p, e) => {
  if (!isObject(v)) { e.push(`${p}: expected object`); return; }
  for (const [key, rule] of Object.entries(fields)) rule(v[key], `${p}.${key}`, e);
  for (const key of Object.keys(v)) if (!Object.hasOwn(fields, key)) e.push(`${p}.${key}: unknown field in this draft version`);
};
const output = object({ fan: oneOf(["OFF", "LOW", "MEDIUM", "HIGH", "AUTO"]), setpoint_c: nullable(finite) });
const observation = (valueCheck: Check): Check => (v, p, e) => {
  object({ value: nullable(valueCheck), source: oneOf(DATA_SOURCES), source_id: nullable(text), observed_at: nullable(utc), validity: oneOf(["VALID", "INVALID", "UNAVAILABLE"]) })(v, p, e);
  if (!isObject(v)) return;
  if (v.validity === "VALID" && (v.value === null || v.source === "UNAVAILABLE" || v.source_id === null || v.observed_at === null)) e.push(`${p}: valid observations require a value, source and observation time`);
  if (v.validity !== "VALID" && v.value !== null) e.push(`${p}: invalid/unavailable observations must have null value`);
  if (v.source === "UNAVAILABLE" && v.validity !== "UNAVAILABLE") e.push(`${p}: unavailable source requires unavailable validity`);
};
const classifier = object({
  class_label: oneOf(NODE_CLASSES),
  class_scores: object(Object.fromEntries(NODE_CLASSES.map(key => [key, unitInterval]))),
  headcount_category: oneOf(["ZERO", "ONE", "TWO", "THREE_PLUS", "UNCERTAIN"])
});
const payloadChecks: Record<SdpEvent["event_type"], Check> = {
  NODE_EVIDENCE: object({ node_id: text, model_version: text, firmware_version: text, classification: observation(classifier), temperature_c: observation(finite), humidity_percent: observation(percent) }),
  ZONE_DECISION: object({
    command_id: text, config_event_id: text, occupancy: oneOf(OCCUPANCY_STATES), coverage: oneOf(["COMPLETE", "DEGRADED", "UNKNOWN"]),
    requested_mode: oneOf(COOLING_MODES), requested_output: nullable(output), reason_code: oneOf(DECISION_REASONS), reason_text: text,
    evaluated_at: utc, vacancy_confirmed_at: nullable(utc), node_states: list(object({ node_id: text, state: oneOf(NODE_STATES), evidence_event_id: nullable(text) }), 1),
    forecast_event_id: nullable(text), override_request_id: nullable(text)
  }),
  ZONE_FORECAST: object({
    status: oneOf(["ACTIVE", "CANCELLED", "UNAVAILABLE"]), source: oneOf(["HISTORY", "BOOKING", "NONE"]), quality: oneOf(["HIGH", "MEDIUM", "LOW", "UNAVAILABLE"]),
    next_use_window: nullable(object({ start: utc, end: utc })), planned_restart_at: nullable(utc), expires_at: utc,
    method_version: text, cooling_model_version: nullable(text), supersedes_event_id: nullable(text), status_reason: nullable(text)
  }),
  APPLIED_OUTPUT: object({ command_id: text, decision_event_id: text, actuator_id: text, status: oneOf(["ACCEPTED", "APPLIED", "REJECTED", "FAILED"]), reported_output: nullable(output), feedback_basis: oneOf(["FIRMWARE_REPORT", "PHYSICAL_FEEDBACK", "SIMULATED"]), reason: nullable(text) }),
  OVERRIDE_REQUEST: (v, p, e) => {
    const common = { request_id: text, valid_until: utc, reason: text };
    object(isObject(v) && v.action === "RETURN_TO_AUTOMATIC"
      ? { ...common, action: oneOf(["RETURN_TO_AUTOMATIC"]), target_request_id: text }
      : { ...common, action: oneOf(["SET_OVERRIDE"]), requested_mode: oneOf(["OCCUPIED"]), requested_setpoint_c: nullable(finite), override_expires_at: utc })(v, p, e);
  },
  OVERRIDE_STATUS: object({ request_id: text, status: oneOf(OVERRIDE_STATES), reason: text, decision_event_id: nullable(text), applied_output_event_id: nullable(text), effective_until: nullable(utc) }),
  ZONE_CONFIG: object({
    config_version: text, effective_from: utc, controller_id: text, actuator_id: text, actuation_kind: oneOf(["FAN_PROXY", "HVAC_INTERFACE"]),
    required_nodes: list(object({ node_id: text, label: text, x: unitInterval, y: unitInterval }), 1), representative_environment_node_id: text,
    freshness: object({ stale_after_ms: positiveInteger, disconnected_after_ms: positiveInteger, max_clock_skew_ms: nonNegativeInteger }),
    vacancy_confirmation_ms: positiveInteger, min_mode_dwell_ms: positiveInteger, override_max_duration_ms: positiveInteger,
    limits: object({ temperature_min_c: finite, temperature_max_c: finite, humidity_max_percent: percent, occupied_target_c: finite })
  })
};

export type ValidationResult = { ok: true; value: SdpEvent } | { ok: false; errors: string[] };

export function isUtcTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value.replace(/Z$/, value.includes(".") ? "Z" : ".000Z");
}

export function validateSdpEvent(value: unknown): ValidationResult {
  const errors: string[] = [];
  object({
    schema_version: oneOf([SCHEMA_VERSION]), event_type: oneOf(Object.keys(payloadChecks)), event_id: text, correlation_id: text,
    session_id: text, room_id: text, zone_id: text, occurred_at: utc,
    clock: object({ time_base: oneOf(["LIVE", "REPLAY"]), replay_id: nullable(text) }),
    producer: object({ component: oneOf(["A_B", "B", "C", "D", "E"]), producer_id: text }),
    data_sources: list(oneOf(DATA_SOURCES), 1), payload: (v, p, e) => {
      if (isObject(value) && typeof value.event_type === "string" && Object.hasOwn(payloadChecks, value.event_type)) payloadChecks[value.event_type as SdpEvent["event_type"]](v, p, e);
    }
  })(value, "event", errors);
  if (errors.length) return { ok: false, errors };
  const event = value as SdpEvent;
  const fail = (message: string) => errors.push(message);
  const after = (later: string, earlier: string) => Date.parse(later) > Date.parse(earlier);
  if ((event.clock.time_base === "LIVE") !== (event.clock.replay_id === null)) fail("clock: LIVE requires null replay_id; REPLAY requires an ID");
  const owners: Record<SdpEvent["event_type"], string[]> = { NODE_EVIDENCE: ["A_B", "B"], ZONE_CONFIG: ["C"], ZONE_DECISION: ["C"], ZONE_FORECAST: ["D"], APPLIED_OUTPUT: ["B"], OVERRIDE_REQUEST: ["E"], OVERRIDE_STATUS: ["C", "E"] };
  if (!owners[event.event_type].includes(event.producer.component)) fail("producer component does not own this event type");
  if (event.event_type === "NODE_EVIDENCE") {
    for (const observation of [event.payload.classification, event.payload.temperature_c, event.payload.humidity_percent]) {
      if (!event.data_sources.includes(observation.source)) fail("data_sources must include every observation source");
      if (observation.observed_at && after(observation.observed_at, event.occurred_at)) fail("observation cannot occur after event publication");
    }
  }
  if (event.event_type === "ZONE_CONFIG") {
    const config = event.payload;
    const ids = config.required_nodes.map(n => n.node_id);
    if (new Set(ids).size !== ids.length || !ids.includes(config.representative_environment_node_id)) fail("config requires unique nodes and a mapped representative environmental node");
    if (config.freshness.disconnected_after_ms <= config.freshness.stale_after_ms) fail("disconnected threshold must exceed stale threshold");
    if (config.limits.temperature_min_c >= config.limits.temperature_max_c || config.limits.occupied_target_c < config.limits.temperature_min_c || config.limits.occupied_target_c > config.limits.temperature_max_c) fail("configured temperature limits/target are inconsistent");
  }
  if (event.event_type === "ZONE_DECISION") {
    const decision = event.payload;
    if (after(decision.evaluated_at, event.occurred_at)) fail("decision evaluation cannot be in the future");
    if (decision.vacancy_confirmed_at && after(decision.vacancy_confirmed_at, decision.evaluated_at)) fail("vacancy confirmation cannot follow evaluation");
    if (new Set(decision.node_states.map(n => n.node_id)).size !== decision.node_states.length) fail("decision node states must be unique");
    if (decision.node_states.some(n => n.state === "MISSING" ? n.evidence_event_id !== null : n.evidence_event_id === null)) fail("missing nodes require null evidence reference; other node states require evidence reference");
  }
  if (event.event_type === "ZONE_FORECAST") {
    const forecast = event.payload;
    if (forecast.status === "ACTIVE" && !after(forecast.expires_at, event.occurred_at)) fail("active forecast must expire after issue time");
    if (forecast.next_use_window && (!after(forecast.next_use_window.end, forecast.next_use_window.start) || (forecast.planned_restart_at && after(forecast.planned_restart_at, forecast.next_use_window.start)))) fail("forecast window/restart order is invalid");
    if (forecast.status === "ACTIVE" && (!forecast.next_use_window || !forecast.planned_restart_at || forecast.source === "NONE" || forecast.quality === "UNAVAILABLE")) fail("active forecast requires an estimate, restart, source and quality");
    if (forecast.status === "CANCELLED" && (!forecast.supersedes_event_id || !forecast.status_reason || forecast.next_use_window !== null || forecast.planned_restart_at !== null)) fail("cancellation must reference its prior forecast, explain why and clear the plan");
    if (forecast.status === "UNAVAILABLE" && (!forecast.status_reason || forecast.quality !== "UNAVAILABLE" || forecast.next_use_window !== null || forecast.planned_restart_at !== null)) fail("unavailable forecast must explain why and clear estimate/quality");
  }
  if (event.event_type === "APPLIED_OUTPUT") {
    if (event.payload.status === "APPLIED" && !event.payload.reported_output) fail("APPLIED output requires reported output");
    if (event.payload.status !== "APPLIED" && event.payload.reported_output !== null) fail("non-applied output must not claim reported output");
    if (["REJECTED", "FAILED"].includes(event.payload.status) && !event.payload.reason) fail("rejected/failed output requires reason");
    if (event.payload.feedback_basis === "SIMULATED" && !event.data_sources.includes("SIMULATED")) fail("simulated output requires simulated provenance");
  }
  if (event.event_type === "OVERRIDE_REQUEST") {
    const request = event.payload;
    if (!after(request.valid_until, event.occurred_at)) fail("request acceptance deadline must follow request time");
    if (request.action === "SET_OVERRIDE" && !after(request.override_expires_at, request.valid_until)) fail("override expiry must follow acceptance deadline");
    if (request.action === "RETURN_TO_AUTOMATIC" && request.target_request_id === request.request_id) fail("Return to Automatic must target a different, original request");
  }
  if (event.event_type === "OVERRIDE_STATUS") {
    const status = event.payload;
    if ((status.status === "PENDING" ? "E" : "C") !== event.producer.component) fail("E owns PENDING; C owns subsequent override statuses");
    if (status.status === "APPLIED" && (!status.decision_event_id || !status.applied_output_event_id)) fail("applied override requires decision and output references");
    if (["ACCEPTED", "APPLIED"].includes(status.status) && status.effective_until && !after(status.effective_until, event.occurred_at)) fail("accepted/applied override must not already be expired");
    if (status.status === "EXPIRED" && (!status.effective_until || after(status.effective_until, event.occurred_at))) fail("EXPIRED requires an end time at or before the event time");
  }
  return errors.length ? { ok: false, errors } : { ok: true, value: event };
}

export function parseSdpEvents(value: unknown): SdpEvent[] {
  if (!Array.isArray(value)) throw new Error("SDP event loader must return an array");
  const ids = new Set<string>();
  return value.map((item, index) => {
    const result = validateSdpEvent(item);
    if (!result.ok) throw new Error(`Invalid SDP event at index ${index}: ${result.errors.join("; ")}`);
    if (ids.has(result.value.event_id)) throw new Error(`Duplicate event_id: ${result.value.event_id}`);
    ids.add(result.value.event_id);
    return result.value;
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
