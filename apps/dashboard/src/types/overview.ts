import type { AppliedOutput, NodeEvidence, OccupancyState, SdpEvent, ZoneConfig, ZoneDecision, ZoneForecast } from "../../../../packages/sdp-contract/src";

export interface SdpRun {
  run_id: string; model_version: string; status: "ACTIVE"; last_sequence: number;
  last_simulated_at: string; history_start: string; live_anchor: string; updated_at: string;
}
export interface SdpZone { run_id: string; zone_id: string; room_id: string; name: string; config: ZoneConfig }
export interface SdpNode { run_id: string; zone_id: string; node_id: string; label: string; required: boolean; x: number; y: number }
export interface SdpFrame {
  run_id: string; zone_id: string; sequence: number; simulated_at: string; inserted_at: string;
  phase: "HISTORY" | "CONTINUOUS"; occupancy: OccupancyState; coverage: "COMPLETE" | "DEGRADED" | "UNKNOWN";
  decision_event_id: string; forecast_event_id: string; output_event_id: string;
}
export interface SdpSample {
  run_id: string; zone_id: string; sequence: number; node_id: string; observed_at: string;
  inserted_at: string; temperature_c: number; humidity_percent: number; evidence_event_id: string;
}
export interface StoredEvent { event_id: string; sequence: number; ordinal: number; occurred_at: string; event: SdpEvent }
export interface OverviewData {
  run: SdpRun; zone: SdpZone; nodes: SdpNode[]; frame: SdpFrame; samples: SdpSample[];
  decision: ZoneDecision; forecast: ZoneForecast; output: AppliedOutput; evidence: NodeEvidence[]; activity: StoredEvent[];
}
