import type { SupabaseClient } from "@supabase/supabase-js";
import { validateSdpEvent } from "../../../../packages/sdp-contract/src";
import type { AppliedOutput, CoolingMode, SdpEvent, ZoneDecision, ZoneForecast } from "../../../../packages/sdp-contract/src";
import type { SdpFrame, StoredEvent } from "../types/overview";

export interface RecordSnapshot { runId: string; zoneId: string; zoneName: string; sequence: number; at: string }
export type RecordCategory = "OPERATIONS" | "ALL" | SdpEvent["event_type"];
export type SearchField = "all" | "text" | "event_id" | "correlation_id";
export interface RecordFilters { start: string; end: string; category: RecordCategory; mode: CoolingMode | ""; search: string; searchField: SearchField }
export interface RecordRow extends StoredEvent { run_id: string; zone_id: string; event_type: SdpEvent["event_type"] }
export interface RecordContext {
  row: RecordRow; frame: SdpFrame | null; decision: ZoneDecision | null; forecast: ZoneForecast | null;
  outputs: AppliedOutput[]; warnings: string[];
}
export interface RecordPage { rows: RecordContext[]; total: number }
type Client = Pick<SupabaseClient, "from">;
const COLUMNS = "run_id,zone_id,sequence,ordinal,event_id,event_type,occurred_at,event";
const FRAME = "run_id,zone_id,sequence,simulated_at,inserted_at,phase,occupancy,coverage,decision_event_id,forecast_event_id,output_event_id";
const OPERATIONS = ["ZONE_DECISION", "ZONE_FORECAST", "APPLIED_OUTPUT", "OVERRIDE_REQUEST", "OVERRIDE_STATUS"];
const TYPES = [...OPERATIONS, "NODE_EVIDENCE", "ZONE_CONFIG"];
function invalid(): never { throw new Error("Operating records are inconsistent with the selected snapshot."); }
async function read<T>(query: PromiseLike<{ data: unknown; error: { code?: string } | null; count?: number | null }>) {
  const result = await query;
  if (result.error) throw new Error(result.error.code === "42501" ? "Operating-record read access is blocked. Check the SDP SELECT policies." : "Operating records could not be loaded. Check the connection and retry.");
  if (!Array.isArray(result.data)) invalid();
  return { data: result.data as T[], count: result.count };
}
function scoped(client: Client, snapshot: RecordSnapshot, columns = COLUMNS) {
  return client.from("sdp_events").select(columns).eq("run_id", snapshot.runId).eq("zone_id", snapshot.zoneId).lte("sequence", snapshot.sequence).lte("occurred_at", snapshot.at);
}
function checked(rows: RecordRow[], snapshot: RecordSnapshot): RecordRow[] {
  for (const row of rows) {
    const result = validateSdpEvent(row.event);
    if (!result.ok) invalid();
    const e = result.value;
    if (row.run_id !== snapshot.runId || row.zone_id !== snapshot.zoneId || !Number.isSafeInteger(row.sequence) || row.sequence < 0 || row.sequence > snapshot.sequence || !Number.isSafeInteger(row.ordinal) || row.ordinal < 0 ||
      row.event_id !== e.event_id || row.event_type !== e.event_type || e.session_id !== snapshot.runId || e.zone_id !== snapshot.zoneId ||
      e.clock.time_base !== "REPLAY" || e.clock.replay_id !== snapshot.runId || e.data_sources.some(s => s !== "SIMULATED") ||
      Date.parse(row.occurred_at) !== Date.parse(e.occurred_at) || Date.parse(e.occurred_at) > Date.parse(snapshot.at)) invalid();
  }
  return rows;
}
export function validateRecordFilters(filters: RecordFilters) {
  const start = Date.parse(filters.start), end = Date.parse(filters.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end || end - start > 7 * 86400_000) throw new Error("Choose a date range of up to seven days.");
  if (!TYPES.includes(filters.category) && !["ALL", "OPERATIONS"].includes(filters.category)) throw new Error("Select a valid event category.");
  if (!["", "OCCUPIED", "SHORT_VACANCY", "LONG_VACANCY", "PRECOOL"].includes(filters.mode) || !["all", "text", "event_id", "correlation_id"].includes(filters.searchField) || filters.search.length > 120) throw new Error("Check the record filters. Search supports up to 120 characters.");
}
export function literalSearch(value: string) { return `%${value.trim().replace(/[\\%_]/g, char => `\\${char}`)}%`; }
export function universalSearchFilter(value: string) {
  // PostgREST OR values require quoted strings; escape grammar separately from LIKE wildcards.
  const quoted = `"${literalSearch(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  return ["event->>payload", "event->payload->>reason_text", "event->payload->>reason", "event->payload->>status_reason", "event_id", "event->>correlation_id", "event_type", "zone_id"].map(field => `${field}.ilike.${quoted}`).join(",");
}

export async function fetchOperatingPage(client: Client, snapshot: RecordSnapshot, filters: RecordFilters, page: number, pageSize: number, signal: AbortSignal): Promise<RecordPage> {
  validateRecordFilters(filters);
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 500) throw new Error("Invalid record page.");
  let query = client.from("sdp_events").select(COLUMNS, { count: "exact" }).eq("run_id", snapshot.runId).eq("zone_id", snapshot.zoneId).lte("sequence", snapshot.sequence).lte("occurred_at", snapshot.at).gte("occurred_at", filters.start).lt("occurred_at", filters.end);
  if (filters.category === "OPERATIONS") query = query.in("event_type", OPERATIONS);
  else if (filters.category !== "ALL") query = query.eq("event_type", filters.category);
  if (filters.mode) query = query.eq("event->payload->>requested_mode", filters.mode);
  if (filters.search.trim()) query = filters.searchField === "all" ? query.or(universalSearchFilter(filters.search)) : query.ilike(filters.searchField === "text" ? "event->>payload" : filters.searchField === "event_id" ? "event_id" : "event->>correlation_id", literalSearch(filters.search));
  const offset = (page - 1) * pageSize;
  const result = await read<RecordRow>(query.order("occurred_at", { ascending: false }).order("sequence", { ascending: false }).order("ordinal", { ascending: false }).range(offset, offset + pageSize - 1).abortSignal(signal));
  if (!Number.isSafeInteger(result.count) || result.count! < 0) throw new Error("The matching record count is unavailable. Retry the query.");
  const rows = checked(result.data, snapshot);
  if (rows.some(row => Date.parse(row.occurred_at) < Date.parse(filters.start) || Date.parse(row.occurred_at) >= Date.parse(filters.end))) invalid();
  return { total: result.count!, rows: await correlateRecords(client, snapshot, rows, signal) };
}

async function correlateRecords(client: Client, snapshot: RecordSnapshot, rows: RecordRow[], signal: AbortSignal): Promise<RecordContext[]> {
  if (!rows.length) return [];
  const sequences = [...new Set(rows.map(row => row.sequence))];
  const frames: SdpFrame[] = [];
  for (let i = 0; i < sequences.length; i += 100) frames.push(...(await read<SdpFrame>(client.from("sdp_zone_frames").select(FRAME).eq("run_id", snapshot.runId).eq("zone_id", snapshot.zoneId).in("sequence", sequences.slice(i, i + 100)).lte("sequence", snapshot.sequence).limit(100).abortSignal(signal))).data);
  const byId = new Map(rows.map(row => [row.event_id, row]));
  async function loadIds(ids: string[]) {
    const missing = [...new Set(ids)].filter(id => !byId.has(id));
    for (let i = 0; i < missing.length; i += 100) {
      const batch = missing.slice(i, i + 100);
      const loaded = checked((await read<RecordRow>(scoped(client, snapshot).in("event_id", batch).limit(batch.length).abortSignal(signal))).data, snapshot);
      loaded.forEach(row => byId.set(row.event_id, row));
    }
  }
  await loadIds(rows.flatMap(({ event: e }) => e.event_type === "APPLIED_OUTPUT" ? [e.payload.decision_event_id] : e.event_type === "OVERRIDE_STATUS" && e.payload.decision_event_id ? [e.payload.decision_event_id, ...(e.payload.applied_output_event_id ? [e.payload.applied_output_event_id] : [])] : []));
  const decisions = [...byId.values()].filter(row => row.event.event_type === "ZONE_DECISION");
  await loadIds([...decisions.flatMap(row => row.event.event_type === "ZONE_DECISION" && row.event.payload.forecast_event_id ? [row.event.payload.forecast_event_id] : []), ...rows.flatMap(row => row.event.event_type === "ZONE_FORECAST" && row.event.payload.supersedes_event_id ? [row.event.payload.supersedes_event_id] : [])]);
  // Reverse lookup uses exact decision IDs, then verifies command and time before attaching.
  const reports: RecordRow[] = [];
  for (let i = 0; i < decisions.length; i += 100) {
    const groupDecisions = decisions.slice(i, i + 100), ids = groupDecisions.map(row => row.event_id);
    const earliest = groupDecisions.reduce((at, row) => Date.parse(row.occurred_at) < Date.parse(at) ? row.occurred_at : at, groupDecisions[0].occurred_at);
    for (let offset = 0; offset <= 5000; offset += 500) {
      const group = checked((await read<RecordRow>(scoped(client, snapshot).eq("event_type", "APPLIED_OUTPUT").gte("occurred_at", earliest).in("event->payload->>decision_event_id", ids).order("occurred_at", { ascending: true }).order("sequence", { ascending: true }).order("ordinal", { ascending: true }).range(offset, offset + 499).abortSignal(signal))).data, snapshot);
      if (offset + group.length > 5000) throw new Error("Too many linked output reports. Narrow the record range.");
      reports.push(...group); if (group.length < 500) break;
    }
  }
  reports.forEach(row => byId.set(row.event_id, row));
  return rows.map(row => {
    const e = row.event, warnings: string[] = [];
    const candidate = frames.find(f => f.sequence === row.sequence);
    const frame = candidate && candidate.run_id === snapshot.runId && candidate.zone_id === snapshot.zoneId && Date.parse(candidate.simulated_at) === Date.parse(row.occurred_at) ? candidate : null;
    if (!frame) warnings.push("The event has no exact matching committed frame.");
    if (e.event_type === "ZONE_FORECAST" && e.payload.supersedes_event_id) {
      const previous = byId.get(e.payload.supersedes_event_id);
      if (previous?.event.event_type !== "ZONE_FORECAST" || previous.sequence > row.sequence || Date.parse(previous.occurred_at) > Date.parse(e.occurred_at)) warnings.push("The previous forecast reference is missing or inconsistent.");
    }
    let dRow = e.event_type === "ZONE_DECISION" ? row : e.event_type === "APPLIED_OUTPUT" ? byId.get(e.payload.decision_event_id) : e.event_type === "OVERRIDE_STATUS" && e.payload.decision_event_id ? byId.get(e.payload.decision_event_id) : null;
    let decision: ZoneDecision | null = dRow?.event.event_type === "ZONE_DECISION" ? dRow.event : null;
    if (decision && (decision.room_id !== e.room_id || (e.event_type === "APPLIED_OUTPUT" && (decision.payload.command_id !== e.payload.command_id || dRow!.sequence > row.sequence || Date.parse(decision.occurred_at) > Date.parse(e.occurred_at))) ||
      (e.event_type === "OVERRIDE_STATUS" && decision.payload.override_request_id !== e.payload.request_id))) { warnings.push("The referenced decision does not match this event."); decision = null; dRow = null; }
    if (e.event_type === "APPLIED_OUTPUT" && !decision) warnings.push("No matching requested decision was found for this output report.");
    if (e.event_type === "ZONE_DECISION" && frame && (frame.decision_event_id !== e.event_id || frame.occupancy !== e.payload.occupancy)) warnings.push("The frame does not confirm this decision as its current state.");
    const fRow = e.event_type === "ZONE_FORECAST" ? row : decision?.payload.forecast_event_id ? byId.get(decision.payload.forecast_event_id) : null;
    let forecast: ZoneForecast | null = fRow?.event.event_type === "ZONE_FORECAST" ? fRow.event : null;
    if (forecast && (forecast.room_id !== e.room_id || (decision && (fRow!.sequence > dRow!.sequence || Date.parse(forecast.occurred_at) > Math.min(Date.parse(decision.occurred_at), Date.parse(decision.payload.evaluated_at)))))) { warnings.push("The forecast was not available at the decision time."); forecast = null; }
    if (decision?.payload.forecast_event_id && !forecast) warnings.push("The exact supporting forecast is unavailable.");
    const outputs = decision ? [...byId.values()].filter(r => r.event.event_type === "APPLIED_OUTPUT" && r.event.payload.decision_event_id === decision.event_id && r.event.payload.command_id === decision.payload.command_id && r.event.room_id === decision.room_id && r.sequence >= dRow!.sequence && Date.parse(r.occurred_at) >= Date.parse(decision.occurred_at))
      .sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at) || a.sequence - b.sequence || a.ordinal - b.ordinal).map(r => r.event as AppliedOutput) : [];
    if (e.event_type === "ZONE_DECISION" && !outputs.length) warnings.push("No matching output report is available at this snapshot.");
    return { row, frame, decision, forecast, outputs, warnings };
  });
}
