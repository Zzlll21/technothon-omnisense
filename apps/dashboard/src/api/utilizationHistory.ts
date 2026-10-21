import type { SupabaseClient } from "@supabase/supabase-js";
import { validateSdpEvent } from "../../../../packages/sdp-contract/src";
import type { AppliedOutput, ZoneDecision } from "../../../../packages/sdp-contract/src";
import type { SdpFrame, StoredEvent } from "../types/overview";

export type UtilizationEvent = ZoneDecision | AppliedOutput;
export interface UtilizationHistory { frames: SdpFrame[]; events: UtilizationEvent[] }
export interface UtilizationQuery { runId: string; zoneId: string; sequence: number; start: string; end: string; afterSequence?: number }
const FRAME = "run_id,zone_id,sequence,simulated_at,inserted_at,phase,occupancy,coverage,decision_event_id,forecast_event_id,output_event_id";
const EVENTS = "event_id,sequence,ordinal,occurred_at,event";
const PAGE = 500;

function inconsistent(): never { throw new Error("Utilization records have inconsistent timestamps or control references."); }
async function read<T>(query: PromiseLike<{ data: unknown; error: { code?: string } | null }>): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(error.code === "42501" ? "Utilization read access is blocked. Check the SDP SELECT policies." : "Utilization history could not be loaded. Check the connection and retry.");
  if (!Array.isArray(data)) inconsistent();
  return data as T[];
}

export async function fetchUtilizationHistory(client: Pick<SupabaseClient, "from">, scope: UtilizationQuery, signal: AbortSignal): Promise<UtilizationHistory> {
  const start = Date.parse(scope.start), end = Date.parse(scope.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end || end - start > 7 * 86400_000) throw new Error("Select a utilization range of up to seven days.");
  const scoped = (table: string, columns: string) => client.from(table).select(columns).eq("run_id", scope.runId).eq("zone_id", scope.zoneId).lte("sequence", scope.sequence);
  async function paged<T>(table: string, columns: string, at: string, limit: number, event = false) {
    const result: T[] = [];
    for (let offset = 0; offset <= limit; offset += PAGE) {
      let q = scoped(table, columns).gte(at, scope.start).lte(at, scope.end);
      if (scope.afterSequence !== undefined) q = q.gt("sequence", scope.afterSequence);
      if (event) q = q.in("event_type", ["ZONE_DECISION", "APPLIED_OUTPUT"]);
      q = q.order(at, { ascending: true }).order("sequence", { ascending: true });
      if (event) q = q.order("ordinal", { ascending: true });
      const page = await read<T>(q.range(offset, offset + PAGE - 1).abortSignal(signal));
      if (result.length + page.length > limit) throw new Error("Too many utilization records. Select 24 hours.");
      result.push(...page);
      if (page.length < PAGE) break;
    }
    return result;
  }
  const [frames, eventRows, boundary] = await Promise.all([
    paged<SdpFrame>("sdp_zone_frames", FRAME, "simulated_at", 25_000),
    paged<StoredEvent>("sdp_events", EVENTS, "occurred_at", 50_000, true),
    scope.afterSequence === undefined ? read<SdpFrame>(scoped("sdp_zone_frames", FRAME).lt("simulated_at", scope.start).order("simulated_at", { ascending: false }).limit(1).abortSignal(signal)) : Promise.resolve([])
  ]);
  const ordered = [...new Map([...boundary, ...frames].map(f => [f.sequence, f])).values()].sort((a, b) => Date.parse(a.simulated_at) - Date.parse(b.simulated_at));
  const loaded = new Set(eventRows.map(e => e.event_id));
  const ids = [...new Set(ordered.flatMap(f => [f.decision_event_id, f.output_event_id]))].filter(id => !loaded.has(id));
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    eventRows.push(...await read<StoredEvent>(scoped("sdp_events", EVENTS).in("event_id", batch).lte("occurred_at", scope.end).limit(batch.length).abortSignal(signal)));
  }
  eventRows.sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at) || a.sequence - b.sequence || a.ordinal - b.ordinal);
  const events = new Map<string, UtilizationEvent>();
  for (const row of eventRows) {
    const checked = validateSdpEvent(row.event);
    if (!checked.ok || !["ZONE_DECISION", "APPLIED_OUTPUT"].includes(checked.value.event_type)) inconsistent();
    const e = checked.value as UtilizationEvent;
    if (e.event_id !== row.event_id || e.session_id !== scope.runId || e.zone_id !== scope.zoneId || e.clock.time_base !== "REPLAY" || e.clock.replay_id !== scope.runId || e.data_sources.some(s => s !== "SIMULATED") ||
      !Number.isSafeInteger(row.sequence) || row.sequence < 0 || row.sequence > scope.sequence || Date.parse(e.occurred_at) !== Date.parse(row.occurred_at) || Date.parse(e.occurred_at) > end ||
      (e.event_type === "ZONE_DECISION" && Date.parse(e.payload.evaluated_at) > Date.parse(e.occurred_at))) inconsistent();
    events.set(e.event_id, e);
  }
  ordered.forEach((f, i) => {
    const at = Date.parse(f.simulated_at), d = events.get(f.decision_event_id), o = events.get(f.output_event_id);
    if (f.run_id !== scope.runId || f.zone_id !== scope.zoneId || !Number.isSafeInteger(f.sequence) || f.sequence < 0 || f.sequence > scope.sequence || !Number.isFinite(at) || at > end ||
      !["OCCUPIED", "VACANT", "UNCERTAIN"].includes(f.occupancy) || !["HISTORY", "CONTINUOUS"].includes(f.phase) ||
      (i > 0 && (ordered[i - 1].sequence >= f.sequence || Date.parse(ordered[i - 1].simulated_at) >= at)) ||
      (at < start && (scope.afterSequence !== undefined || i > 0)) ||
      [d, o].some(e => e && Date.parse(e.occurred_at) > at)) inconsistent();
    if (d && (d.event_type !== "ZONE_DECISION" || d.payload.occupancy !== f.occupancy)) inconsistent();
    if (o && (o.event_type !== "APPLIED_OUTPUT" || o.payload.decision_event_id !== f.decision_event_id || (d?.event_type === "ZONE_DECISION" && o.payload.command_id !== d.payload.command_id))) inconsistent();
  });
  return { frames: ordered, events: [...events.values()] };
}
