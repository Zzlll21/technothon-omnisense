import type { SupabaseClient } from "@supabase/supabase-js";
import { validateSdpEvent } from "../../../../packages/sdp-contract/src";
import type { NodeEvidence } from "../../../../packages/sdp-contract/src";
import type { SdpSample } from "../types/overview";

export type HistoryRange = 1 | 24 | 168;
export interface NodeHistoryPoint extends SdpSample { evidence: NodeEvidence }
export interface HistoryQuery {
  runId: string; zoneId: string; nodeId: string; sequence: number;
  start: string; end: string; afterSequence?: number;
}
const PAGE = 500;
const MAX_ROWS = 25_000;
const COLUMNS = "run_id,zone_id,sequence,node_id,observed_at,inserted_at,temperature_c,humidity_percent,evidence_event_id,evidence:sdp_events!sdp_node_samples_run_id_zone_id_evidence_event_id_fkey(event)";

// Pin to the Overview's committed sequence so polling cannot move pagination boundaries.
export async function fetchNodeHistory(client: Pick<SupabaseClient, "from">, scope: HistoryQuery, signal: AbortSignal): Promise<NodeHistoryPoint[]> {
  const start = Date.parse(scope.start), end = Date.parse(scope.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start > 7 * 86400_000) throw new Error("Select a history window of up to seven days.");
  const points: NodeHistoryPoint[] = [];
  for (let offset = 0; offset <= MAX_ROWS; offset += PAGE) {
    let query = client.from("sdp_node_samples").select(COLUMNS)
      .eq("run_id", scope.runId).eq("zone_id", scope.zoneId).eq("node_id", scope.nodeId)
      .gte("observed_at", scope.start).lte("observed_at", scope.end).lte("sequence", scope.sequence)
      .order("observed_at", { ascending: true }).order("sequence", { ascending: true });
    if (scope.afterSequence !== undefined) query = query.gt("sequence", scope.afterSequence);
    const { data, error } = await query.range(offset, offset + PAGE - 1).abortSignal(signal);
    if (error) throw new Error(error.code === "42501" ? "History read access is blocked. Check the SDP read policies." : "History could not be loaded. Check the connection and try again.");
    if (!Array.isArray(data)) throw new Error("History records are unavailable.");
    if (points.length + data.length > MAX_ROWS) throw new Error("This history window contains too many samples. Select a shorter range.");
    for (const raw of data as unknown as (SdpSample & { evidence: { event: unknown } | null })[]) {
      const checked = validateSdpEvent(raw.evidence?.event);
      const at = Date.parse(raw.observed_at);
      if (!checked.ok || checked.value.event_type !== "NODE_EVIDENCE") throw new Error("A history sample has missing or invalid evidence.");
      const e = checked.value;
      if (raw.run_id !== scope.runId || raw.zone_id !== scope.zoneId || raw.node_id !== scope.nodeId ||
        !Number.isSafeInteger(raw.sequence) || raw.sequence > scope.sequence || raw.sequence < 0 ||
        (scope.afterSequence !== undefined && raw.sequence <= scope.afterSequence) ||
        !Number.isFinite(at) || at < start || at > end ||
        !Number.isFinite(raw.temperature_c) || !Number.isFinite(raw.humidity_percent) ||
        e.event_id !== raw.evidence_event_id || e.session_id !== scope.runId || e.zone_id !== scope.zoneId || e.payload.node_id !== scope.nodeId ||
        Date.parse(e.occurred_at) !== at ||
        e.clock.time_base !== "REPLAY" || e.clock.replay_id !== scope.runId || e.data_sources.some(s => s !== "SIMULATED") ||
        e.payload.temperature_c.value !== raw.temperature_c || e.payload.humidity_percent.value !== raw.humidity_percent ||
        (e.payload.classification.validity === "VALID" && Date.parse(e.payload.classification.observed_at) !== at) ||
        Date.parse(e.payload.temperature_c.observed_at ?? "") !== at || Date.parse(e.payload.humidity_percent.observed_at ?? "") !== at) {
        throw new Error("History records do not match the selected node and dataset.");
      }
      const previous = points.at(-1);
      if (previous && (at <= Date.parse(previous.observed_at) || raw.sequence <= previous.sequence)) throw new Error("History samples have inconsistent timestamps or sequence order.");
      points.push({ ...raw, evidence: e });
    }
    if (data.length < PAGE) return points;
  }
  return points;
}
