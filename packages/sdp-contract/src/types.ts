/** Review draft only. Wire-incompatible edits require a new schema version. */
export const SCHEMA_VERSION = "sdp.v1-draft.1" as const;
export const HYBRID_SCHEMA_VERSION = "sdp.v1-hybrid.1" as const;
export const OCCUPANCY_STATES = ["OCCUPIED", "VACANT", "UNCERTAIN"] as const;
export const COOLING_MODES = ["OCCUPIED", "SHORT_VACANCY", "LONG_VACANCY", "PRECOOL"] as const;
export const DATA_SOURCES = ["MEASURED", "PROXY_TEST", "SIMULATED", "UNAVAILABLE"] as const;
export const NODE_CLASSES = ["EMPTY_CORE", "THERMAL_ANOMALIES", "OCCUPIED_1P", "OCCUPIED_2P", "OCCUPIED_3P_PLUS"] as const;
export const NODE_STATES = ["FRESH", "STALE", "DISCONNECTED", "MISSING", "INVALID"] as const;
export const OVERRIDE_STATES = ["PENDING", "ACCEPTED", "APPLIED", "REJECTED", "FAILED", "EXPIRED", "CANCELLED"] as const;
export const DECISION_REASONS = [
  "OCCUPIED_EVIDENCE", "VACANCY_CONFIRMED", "SHORT_GAP", "LONG_GAP",
  "FORECAST_RESTART", "MISSING_EVIDENCE", "UNCERTAIN_EVIDENCE",
  "MANUAL_OVERRIDE", "OVERRIDE_EXPIRED", "RETURN_TO_AUTOMATIC",
  "ENVIRONMENT_LIMIT", "CONSERVATIVE_FALLBACK"
] as const;

export type OccupancyState = typeof OCCUPANCY_STATES[number];
export type CoolingMode = typeof COOLING_MODES[number];
export type DataSource = typeof DATA_SOURCES[number];
export type NodeClass = typeof NODE_CLASSES[number];
export type NodeState = typeof NODE_STATES[number];
export type OverrideState = typeof OVERRIDE_STATES[number];
export type DecisionReason = typeof DECISION_REASONS[number];
export type Clock =
  | { time_base: "LIVE"; replay_id: null }
  | { time_base: "REPLAY"; replay_id: string };

export interface EventEnvelope<K extends string, P> {
  schema_version: typeof SCHEMA_VERSION | typeof HYBRID_SCHEMA_VERSION;
  event_type: K;
  event_id: string;
  /** Shared trace ID; explicit references below identify the exact causal event. */
  correlation_id: string;
  session_id: string;
  room_id: string;
  zone_id: string;
  occurred_at: string;
  clock: Clock;
  producer: { component: "A_B" | "B" | "C" | "D" | "E"; producer_id: string };
  /** Input provenance summary, not a claim that a decision/forecast is measured. */
  data_sources: DataSource[];
  payload: P;
}

export type Observation<T> =
  | { value: T; source: Exclude<DataSource, "UNAVAILABLE">; source_id: string; observed_at: string; validity: "VALID" }
  | { value: null; source: DataSource; source_id: string | null; observed_at: string | null; validity: "INVALID" | "UNAVAILABLE" };

export interface ClassifierEvidence {
  class_label: NodeClass;
  class_scores: Record<NodeClass, number> | null;
  headcount_category: "ZERO" | "ONE" | "TWO" | "THREE_PLUS" | "UNCERTAIN";
}

export interface HardwareMetadata {
  received_at: string;
  time_basis: "GATEWAY_RECEIPT";
  device_observed_at: null;
  headcount: number;
  inference_method: "TINYML" | "THERMAL_BLOB_FALLBACK" | "UNAVAILABLE";
  system_active: boolean | null;
  pir_motion: boolean | null;
  bme_valid: boolean | null;
  headcount_source: string | null;
  thermal_ai_label: string | null;
  thermal_ai_confidence: number | null;
}
export type NodeEvidence = EventEnvelope<"NODE_EVIDENCE", {
  node_id: string;
  model_version: string | null;
  firmware_version: string | null;
  /** Required for hybrid events; forbidden by the original strict validator. */
  hardware?: HardwareMetadata;
  classification: Observation<ClassifierEvidence>;
  temperature_c: Observation<number>;
  humidity_percent: Observation<number>;
}>;

export interface OutputSetting {
  fan: "OFF" | "LOW" | "MEDIUM" | "HIGH" | "AUTO";
  setpoint_c: number | null;
}

export type ZoneDecision = EventEnvelope<"ZONE_DECISION", {
  command_id: string;
  config_event_id: string;
  occupancy: OccupancyState;
  coverage: "COMPLETE" | "DEGRADED" | "UNKNOWN";
  requested_mode: CoolingMode;
  requested_output: OutputSetting | null;
  reason_code: DecisionReason;
  reason_text: string;
  evaluated_at: string;
  vacancy_confirmed_at: string | null;
  node_states: { node_id: string; state: NodeState; evidence_event_id: string | null }[];
  forecast_event_id: string | null;
  override_request_id: string | null;
}>;

export type ZoneForecast = EventEnvelope<"ZONE_FORECAST", {
  status: "ACTIVE" | "CANCELLED" | "UNAVAILABLE";
  source: "HISTORY" | "BOOKING" | "NONE";
  quality: "HIGH" | "MEDIUM" | "LOW" | "UNAVAILABLE";
  next_use_window: { start: string; end: string } | null;
  planned_restart_at: string | null;
  expires_at: string;
  method_version: string;
  cooling_model_version: string | null;
  supersedes_event_id: string | null;
  status_reason: string | null;
}>;

export type AppliedOutput = EventEnvelope<"APPLIED_OUTPUT", {
  command_id: string;
  decision_event_id: string;
  actuator_id: string;
  status: "ACCEPTED" | "APPLIED" | "REJECTED" | "FAILED";
  reported_output: OutputSetting | null;
  feedback_basis: "FIRMWARE_REPORT" | "PHYSICAL_FEEDBACK" | "SIMULATED";
  reason: string | null;
}>;

interface OverrideRequestBase {
  request_id: string;
  /** Delivery/acceptance deadline, separate from the override duration. */
  valid_until: string;
  reason: string;
}

export type OverrideRequest = EventEnvelope<"OVERRIDE_REQUEST", OverrideRequestBase & (
  | { action: "SET_OVERRIDE"; requested_mode: "OCCUPIED"; requested_setpoint_c: number | null; override_expires_at: string }
  | { action: "RETURN_TO_AUTOMATIC"; target_request_id: string }
)>;

export type OverrideStatus = EventEnvelope<"OVERRIDE_STATUS", {
  request_id: string;
  status: OverrideState;
  reason: string;
  decision_event_id: string | null;
  applied_output_event_id: string | null;
  effective_until: string | null;
}>;

export type ZoneConfig = EventEnvelope<"ZONE_CONFIG", {
  config_version: string;
  effective_from: string;
  controller_id: string;
  actuator_id: string;
  actuation_kind: "FAN_PROXY" | "HVAC_INTERFACE";
  required_nodes: { node_id: string; label: string; x: number; y: number }[];
  representative_environment_node_id: string;
  freshness: { stale_after_ms: number; disconnected_after_ms: number; max_clock_skew_ms: number };
  vacancy_confirmation_ms: number;
  min_mode_dwell_ms: number;
  override_max_duration_ms: number;
  limits: { temperature_min_c: number; temperature_max_c: number; humidity_max_percent: number; occupied_target_c: number };
}>;

export type SdpEvent = NodeEvidence | ZoneDecision | ZoneForecast | AppliedOutput | OverrideRequest | OverrideStatus | ZoneConfig;

export interface EventQuery {
  session_id: string;
  zone_id: string;
  clock: Clock;
  /** Mandatory clock supplied by caller; replay never uses browser wall time. */
  as_of: string;
}

export interface ZoneSnapshot {
  config: ZoneConfig | null;
  nodes: NodeEvidence[];
  decision: ZoneDecision | null;
  forecast: ZoneForecast | null;
  forecast_state: "ACTIVE" | "CANCELLED" | "EXPIRED" | "UNAVAILABLE";
  /** Latest report for the current decision only; inspect status before saying applied. */
  output: AppliedOutput | null;
  override_requests: OverrideRequest[];
  override_statuses: OverrideStatus[];
  events: SdpEvent[];
}

export interface SdpDataSource {
  getEvents(query: EventQuery): Promise<SdpEvent[]>;
  getZoneSnapshot(query: EventQuery): Promise<ZoneSnapshot>;
}
