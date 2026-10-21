import type { SupabaseClient } from "@supabase/supabase-js";
import { validateSdpEvent } from "../../../../packages/sdp-contract/src";
import type { AppliedOutput, ZoneDecision, ZoneForecast } from "../../../../packages/sdp-contract/src";
import type { SdpFrame, SdpSample, StoredEvent } from "../types/overview";

export type CoolingEvent = ZoneDecision | ZoneForecast | AppliedOutput;
export interface PredictiveHistory { frames: SdpFrame[]; samples: SdpSample[]; events: CoolingEvent[] }
export interface PredictiveQuery {
  runId: string; zoneId: string; nodeId: string; sequence: number;
  start: string; end: string; afterSequence?: number;
}
const PAGE = 500;
const FRAME_COLUMNS = "run_id,zone_id,sequence,simulated_at,inserted_at,phase,occupancy,coverage,decision_event_id,forecast_event_id,output_event_id";
const SAMPLE_COLUMNS = "run_id,zone_id,sequence,node_id,observed_at,inserted_at,temperature_c,humidity_percent,evidence_event_id";
const EVENT_COLUMNS = "event_id,sequence,ordinal,occurred_at,event";
const TYPES = ["ZONE_DECISION", "ZONE_FORECAST", "APPLIED_OUTPUT"];
type Client = Pick<SupabaseClient, "from">;
async function rows<T>(query: PromiseLike<{ data: unknown; error: { code?: string } | null }>): Promise<T[]> {
  const result = await query;
  if (result.error) throw new Error(result.error.code === "42501" ? "Predictive history read access is blocked. Check the SDP SELECT policies." : "Predictive history could not be loaded. Check the connection and retry.");
  if (!Array.isArray(result.data)) throw new Error("Predictive history records are unavailable.");
  return result.data as T[];
}
async function pages<T>(make: (offset: number) => PromiseLike<{ data: unknown; error: { code?: string } | null }>, limit: number) {
  const result: T[] = [];
  for (let offset = 0; offset <= limit; offset += PAGE) {
    const page = await rows<T>(make(offset));
    if (result.length + page.length > limit) throw new Error("Too many records in this range. Select 24 hours.");
    result.push(...page);
    if (page.length < PAGE) break;
  }
  return result;
}
function invalid(): never { throw new Error("Predictive records have inconsistent timestamps or event references."); }

export async function fetchPredictiveHistory(client: Client, scope: PredictiveQuery, signal: AbortSignal): Promise<PredictiveHistory> {
  const start = Date.parse(scope.start), end = Date.parse(scope.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start > 7 * 86400_000) throw new Error("Select a history range of up to seven days.");
  const bounded = (table: string, columns: string, timestamp: string, offset: number) => {
    let query = client.from(table).select(columns).eq("run_id", scope.runId).eq("zone_id", scope.zoneId)
      .gte(timestamp, scope.start).lte(timestamp, scope.end).lte("sequence", scope.sequence);
    if (scope.afterSequence !== undefined) query = query.gt("sequence", scope.afterSequence);
    return query.order(timestamp, { ascending: true }).order("sequence", { ascending: true }).range(offset, offset + PAGE - 1).abortSignal(signal);
  };
  const [frames, samples, eventRows] = await Promise.all([
    pages<SdpFrame>(offset => bounded("sdp_zone_frames", FRAME_COLUMNS, "simulated_at", offset), 25_000),
    pages<SdpSample>(offset => bounded("sdp_node_samples", SAMPLE_COLUMNS, "observed_at", offset).eq("node_id", scope.nodeId), 25_000),
    pages<StoredEvent>(offset => bounded("sdp_events", EVENT_COLUMNS, "occurred_at", offset).in("event_type", TYPES).order("ordinal", { ascending: true }), 75_000)
  ]);
  const known = new Set(eventRows.map(row => row.event_id));
  const referenced = [...new Set(frames.flatMap(f => [f.decision_event_id, f.forecast_event_id, f.output_event_id]))].filter(id => !known.has(id));
  // A decision or forecast can predate the window. Fetch only the exact referenced IDs.
  async function references(idsToRead: string[]) {
    for (let offset = 0; offset < idsToRead.length; offset += 100) {
      const ids = idsToRead.slice(offset, offset + 100);
      eventRows.push(...await rows<StoredEvent>(client.from("sdp_events").select(EVENT_COLUMNS).eq("run_id", scope.runId).eq("zone_id", scope.zoneId)
        .in("event_id", ids).lte("sequence", scope.sequence).lte("occurred_at", scope.end).limit(ids.length).abortSignal(signal)));
    }
  }
  await references(referenced);
  const loaded = new Set(eventRows.map(row => row.event_id));
  const supportIds = [...new Set(eventRows.flatMap(row => row.event?.event_type === "ZONE_DECISION" && typeof row.event.payload?.forecast_event_id === "string" ? [row.event.payload.forecast_event_id] : []))].filter(id => !loaded.has(id));
  await references(supportIds);
  eventRows.sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at) || a.sequence - b.sequence || a.ordinal - b.ordinal);
  const events = new Map<string, CoolingEvent>();
  for (const row of eventRows) {
    const checked = validateSdpEvent(row.event);
    if (!checked.ok || !TYPES.includes(checked.value.event_type)) invalid();
    const e = checked.value as CoolingEvent;
    if (e.event_id !== row.event_id || e.session_id !== scope.runId || e.zone_id !== scope.zoneId ||
      e.clock.time_base !== "REPLAY" || e.clock.replay_id !== scope.runId || e.data_sources.some(s => s !== "SIMULATED") ||
      !Number.isSafeInteger(row.sequence) || row.sequence < 0 || row.sequence > scope.sequence ||
      Date.parse(e.occurred_at) !== Date.parse(row.occurred_at) || Date.parse(e.occurred_at) > end) invalid();
    events.set(e.event_id, e);
  }
  const inScope = (r: SdpFrame | SdpSample, at: string) => r.run_id === scope.runId && r.zone_id === scope.zoneId && Number.isSafeInteger(r.sequence) && r.sequence >= 0 && r.sequence <= scope.sequence &&
    (scope.afterSequence === undefined || r.sequence > scope.afterSequence) && Date.parse(at) >= start && Date.parse(at) <= end;
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    if (!inScope(f, f.simulated_at) || !["OCCUPIED", "VACANT", "UNCERTAIN"].includes(f.occupancy) ||
      (i > 0 && (frames[i - 1].sequence >= f.sequence || Date.parse(frames[i - 1].simulated_at) >= Date.parse(f.simulated_at)))) invalid();
    const d = events.get(f.decision_event_id), p = events.get(f.forecast_event_id), o = events.get(f.output_event_id);
    if ([d, p, o].some(e => e && Date.parse(e.occurred_at) > Date.parse(f.simulated_at))) invalid();
    if (d && (d.event_type !== "ZONE_DECISION" || d.payload.occupancy !== f.occupancy || Date.parse(d.payload.evaluated_at) > Date.parse(f.simulated_at))) invalid();
    if (p && p.event_type !== "ZONE_FORECAST") invalid();
    if (o && (o.event_type !== "APPLIED_OUTPUT" || o.payload.decision_event_id !== f.decision_event_id || (d?.event_type === "ZONE_DECISION" && o.payload.command_id !== d.payload.command_id))) invalid();
  }
  const frameTimes = new Map(frames.map(f => [f.sequence, Date.parse(f.simulated_at)]));
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    if (!inScope(s, s.observed_at) || s.node_id !== scope.nodeId || !Number.isFinite(s.temperature_c) || !Number.isFinite(s.humidity_percent) ||
      (frameTimes.has(s.sequence) && frameTimes.get(s.sequence) !== Date.parse(s.observed_at)) ||
      (i > 0 && (samples[i - 1].sequence >= s.sequence || Date.parse(samples[i - 1].observed_at) >= Date.parse(s.observed_at)))) invalid();
  }
  return { frames, samples, events: [...events.values()].sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at)) };
}
