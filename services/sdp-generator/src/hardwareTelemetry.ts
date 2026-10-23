import type { NodeClass, Observation, OccupancyState } from "../../../packages/sdp-contract/dist/index.js";
import { isUtcTimestamp } from "../../../packages/sdp-contract/dist/index.js";

/** Adapter contract, NOT a persistable sdp.v1-draft.1 NODE_EVIDENCE envelope. */
export interface HardwareTelemetry {
  schema_version: "omnisense.hardware.v1";
  node_id: string;
  received_at: string;
  time_basis: "GATEWAY_RECEIPT";
  headcount: number;
  metadata: {
    system_active: boolean | null; pir_motion: boolean | null; bme_valid: boolean | null;
    headcount_source: string | null; thermal_ai_label: string | null; thermal_ai_confidence: number | null;
  };
  occupancy: {
    value: OccupancyState; validity: "VALID" | "INVALID" | "UNAVAILABLE";
    source: "MEASURED" | "UNAVAILABLE";
    method: "TINYML" | "THERMAL_BLOB_FALLBACK" | "UNAVAILABLE";
    class_label: NodeClass | null;
    /** Firmware sends only the winning score. Never invent a score vector. */
    class_scores: null;
    reason: string;
  };
  temperature_c: Observation<number>;
  humidity_percent: Observation<number>;
}
export interface DeliveryContext {
  received_at: string;
  allowed_node_ids: readonly string[];
  retained?: boolean;
}
export type TelemetryResult = { ok: true; value: HardwareTelemetry } | { ok: false; errors: string[] };
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const labels = ["EMPTY_CORE", "OCCUPIED_1P", "OCCUPIED_2P", "OCCUPIED_3P_PLUS"] as const;
const unavailable = (): Observation<number> => ({ value: null, source: "UNAVAILABLE", source_id: null, observed_at: null, validity: "UNAVAILABLE" });

/** Pure server-side boundary. Does not open MQTT, load secrets, log payloads or write snapshots. */
export function normalizeHardwareTelemetry(topic: string, message: string, context: DeliveryContext): TelemetryResult {
  const reject = (error: string): TelemetryResult => ({ ok: false, errors: [error] });
  if (!isUtcTimestamp(context.received_at)) return reject("A valid gateway received_at UTC timestamp is required");
  if (context.retained) return reject("Retained telemetry cannot establish a fresh observation");
  const nodeId = /^omnisense\/node\/([^/]+)\/telemetry$/.exec(topic)?.[1];
  if (!nodeId || !context.allowed_node_ids.includes(nodeId)) return reject("Unmapped telemetry topic/node");
  // Bound untrusted input before parsing; existing firmware uses a 1280-byte payload buffer.
  if (message.length > 4096) return reject("Telemetry exceeds adapter size limit");
  let payload: unknown;
  try { payload = JSON.parse(message); } catch { return reject("Invalid telemetry JSON"); }
  if (!object(payload)) return reject("Telemetry must be an object");
  if (payload.node_id !== nodeId) return reject("Payload identity must match the mapped topic identity");
  if (!Number.isInteger(payload.headcount) || Number(payload.headcount) < 0 || Number(payload.headcount) > 3) return reject("Firmware headcount must be an integer in [0, 3], where 3 means three or more");
  const headcount = payload.headcount as number;
  if (payload.raw_sensor_summary !== undefined && !object(payload.raw_sensor_summary)) return reject("raw_sensor_summary must be an object");
  const raw = object(payload.raw_sensor_summary) ? payload.raw_sensor_summary : {};
  for (const key of ["system_active", "pir_motion", "bme_valid"]) {
    if (raw[key] !== undefined && typeof raw[key] !== "boolean") return reject(`Invalid ${key} metadata`);
  }
  for (const key of ["headcount_source", "thermal_ai_label"]) {
    if (raw[key] !== undefined && (typeof raw[key] !== "string" || (raw[key] as string).length > 128)) return reject(`Invalid ${key} metadata`);
  }
  if (raw.thermal_ai_confidence !== undefined && (typeof raw.thermal_ai_confidence !== "number" || !Number.isFinite(raw.thermal_ai_confidence) || raw.thermal_ai_confidence < 0 || raw.thermal_ai_confidence > 1)) return reject("Invalid thermal_ai_confidence metadata");
  const metadata: HardwareTelemetry["metadata"] = {
    system_active: typeof raw.system_active === "boolean" ? raw.system_active : null,
    pir_motion: typeof raw.pir_motion === "boolean" ? raw.pir_motion : null,
    bme_valid: typeof raw.bme_valid === "boolean" ? raw.bme_valid : null,
    headcount_source: typeof raw.headcount_source === "string" ? raw.headcount_source : null,
    thermal_ai_label: typeof raw.thermal_ai_label === "string" ? raw.thermal_ai_label : null,
    thermal_ai_confidence: typeof raw.thermal_ai_confidence === "number" ? raw.thermal_ai_confidence : null
  };
  const occupancy: HardwareTelemetry["occupancy"] = {
    value: "UNCERTAIN", validity: "UNAVAILABLE", source: "UNAVAILABLE", method: "UNAVAILABLE",
    class_label: null, class_scores: null, reason: "Missing or unavailable sensing metadata"
  };
  if (metadata.system_active === false) {
    occupancy.reason = "PIR inactivity stops sensing; zero is not verified vacancy";
  } else if (metadata.system_active === true && metadata.headcount_source === "thermal_ai") {
    occupancy.method = "TINYML";
    if (metadata.thermal_ai_label === labels[headcount] && metadata.thermal_ai_confidence !== null && metadata.thermal_ai_confidence > 0) {
      Object.assign(occupancy, { value: headcount > 0 ? "OCCUPIED" : "VACANT", validity: "VALID", source: "MEASURED", class_label: labels[headcount], reason: "Active firmware TinyML result; confidence acceptance belongs to firmware" });
    } else {
      occupancy.validity = "INVALID";
      occupancy.reason = "TinyML label, confidence and headcount disagree or are incomplete";
    }
  } else if (metadata.system_active === true && metadata.headcount_source === "thermal_blob_fallback") {
    occupancy.method = "THERMAL_BLOB_FALLBACK";
    if (headcount > 0) {
      Object.assign(occupancy, { value: "OCCUPIED", validity: "VALID", source: "MEASURED", class_label: labels[headcount], reason: "Positive thermal-blob fallback evidence; not a TinyML classification" });
    } else {
      occupancy.reason = "Fallback zero does not independently confirm vacancy";
    }
  }
  const environment = (value: unknown, min: number, max: number): Observation<number> => {
    if (metadata.system_active !== true || metadata.bme_valid !== true || value === undefined || value === null || value === "N/A") return unavailable();
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
      return { value: null, source: "MEASURED", source_id: `${nodeId}/bme280`, observed_at: context.received_at, validity: "INVALID" };
    }
    return { value, source: "MEASURED", source_id: `${nodeId}/bme280`, observed_at: context.received_at, validity: "VALID" };
  };
  return { ok: true, value: {
    schema_version: "omnisense.hardware.v1", node_id: nodeId, received_at: context.received_at,
    time_basis: "GATEWAY_RECEIPT", headcount, metadata, occupancy,
    temperature_c: environment(payload.temperature, -40, 85), humidity_percent: environment(payload.humidity, 0, 100)
  } };
}
