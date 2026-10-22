import { coolingPolicy, schedule } from "./model.js";
import { isUtcTimestamp } from "../../../packages/sdp-contract/dist/index.js";
import type { NodeState, OccupancyState } from "../../../packages/sdp-contract/dist/index.js";
import type { HardwareTelemetry } from "./hardwareTelemetry.js";

export interface HybridConfig {
  required_node_ids: readonly string[];
  /** Required explicit assertion: these footprints cover the whole cooling zone. */
  full_zone_coverage: boolean;
  stale_after_ms: number;
  disconnected_after_ms: number;
}
export interface HybridCheckpoint {
  evaluated_at: string;
  vacant_since: string | null;
  /** Invalidates vacancy continuity when inventory/coverage/timing config changes. */
  configuration_key: string;
  last_receipts: Record<string, string>;
}

/** Offline decision projection only: deliberately cannot be passed to commitTick(). */
export function evaluateHardwareCooling(at: string, evidence: readonly HardwareTelemetry[], config: HybridConfig,
  previous: HybridCheckpoint | null = null) {
  if (!isUtcTimestamp(at) || !config.required_node_ids.length || config.required_node_ids.some(n => !n.trim()) ||
    new Set(config.required_node_ids).size !== config.required_node_ids.length || typeof config.full_zone_coverage !== "boolean" ||
    !Number.isSafeInteger(config.stale_after_ms) || config.stale_after_ms <= 0 ||
    !Number.isSafeInteger(config.disconnected_after_ms) || config.disconnected_after_ms <= config.stale_after_ms) throw new Error("Invalid hybrid evaluation/configuration");
  const now = Date.parse(at);
  const key = JSON.stringify({ ...config, required_node_ids: [...config.required_node_ids].sort() });
  if (previous && (!isUtcTimestamp(previous.evaluated_at) || Date.parse(previous.evaluated_at) >= now ||
    (previous.vacant_since !== null && (!isUtcTimestamp(previous.vacant_since) || Date.parse(previous.vacant_since) > Date.parse(previous.evaluated_at))))) throw new Error("Invalid or non-increasing hybrid checkpoint");
  if (new Set(evidence.map(e => e.node_id)).size !== evidence.length || evidence.some(e => !config.required_node_ids.includes(e.node_id))) throw new Error("Expected at most one normalized reading per mapped node");
  const receipts: Record<string, string> = Object.assign(Object.create(null), previous?.configuration_key === key ? previous.last_receipts : {});
  const nodes = config.required_node_ids.map(node_id => {
    const reading = evidence.find(e => e.node_id === node_id);
    let state: NodeState = "MISSING";
    if (reading) {
      const observed = Date.parse(reading.received_at);
      if (!isUtcTimestamp(reading.received_at) || observed > now) throw new Error("Reading receipt must not follow evaluation");
      const older = previous?.configuration_key === key && Object.hasOwn(previous.last_receipts, node_id) ? previous.last_receipts[node_id] : undefined;
      if (older && observed < Date.parse(older)) throw new Error("Out-of-order gateway receipt");
      receipts[node_id] = reading.received_at;
      const age = now - observed;
      state = age >= config.disconnected_after_ms ? "DISCONNECTED" : age >= config.stale_after_ms ? "STALE"
        : reading.occupancy.validity !== "VALID" ? "INVALID" : "FRESH";
    }
    return { node_id, state, occupancy: state === "FRESH" ? reading!.occupancy.value : "UNCERTAIN" as OccupancyState,
      reason: reading?.occupancy.reason ?? "No hardware evidence" };
  });
  const complete = config.full_zone_coverage && nodes.every(n => n.state === "FRESH");
  const occupancy: OccupancyState = nodes.some(n => n.occupancy === "OCCUPIED") ? "OCCUPIED"
    : complete && nodes.every(n => n.occupancy === "VACANT") ? "VACANT" : "UNCERTAIN";
  // Unobserved downtime must not count toward continuous confirmed vacancy.
  const continuous = previous?.configuration_key === key && now - Date.parse(previous.evaluated_at) < config.stale_after_ms &&
    config.required_node_ids.every(node => Object.hasOwn(previous.last_receipts, node) &&
      Date.parse(receipts[node]) - Date.parse(previous.last_receipts[node]) <= config.stale_after_ms);
  const vacantSince = occupancy === "VACANT" ? continuous && previous?.vacant_since ? previous.vacant_since : at : null;
  const plan = schedule(now);
  const forecast = {
    source: "BOOKING" as const, data_sources: ["SIMULATED"] as const,
    next_use_window: { start: new Date(plan.next.start).toISOString(), end: new Date(plan.next.start + 300_000).toISOString() },
    planned_restart_at: new Date(plan.planned_restart).toISOString(), expires_at: new Date(plan.next.start).toISOString()
  };
  const policy = coolingPolicy(now, occupancy, vacantSince === null ? null : Date.parse(vacantSince),
    { next_use_at: plan.next.start, planned_restart_at: plan.planned_restart });
  return {
    kind: "OFFLINE_HYBRID_EVALUATION" as const,
    occupancy, coverage: complete ? "COMPLETE" as const : nodes.some(n => n.state === "FRESH") ? "DEGRADED" as const : "UNKNOWN" as const,
    nodes, requested_mode: policy.mode, requested_output: policy.output, vacancy_confirmed_at: policy.vacancy_confirmed_at,
    reason: occupancy === "UNCERTAIN" ? "Uncertain evidence: conservative occupied cooling" : occupancy === "OCCUPIED" ? "Hardware occupied evidence" : "Active empty evidence across required coverage",
    forecast,
    output: { status: "APPLIED" as const, feedback_basis: "SIMULATED" as const, reported_output: { ...policy.output } },
    checkpoint: { evaluated_at: at, vacant_since: vacantSince, configuration_key: key, last_receipts: receipts } satisfies HybridCheckpoint
  };
}
