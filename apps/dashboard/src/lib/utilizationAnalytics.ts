import type { CoolingMode, OccupancyState, ZoneDecision, AppliedOutput } from "../../../../packages/sdp-contract/src";
import type { UtilizationHistory, UtilizationEvent } from "../api/utilizationHistory";
import type { SdpFrame } from "../types/overview";

export const UTILIZATION_TIMEZONE = "Asia/Kuala_Lumpur";
const HOUR = 3600_000;
const DAY = 24 * HOUR;
// This declared site timezone is UTC+08:00 with no daylight-saving changes.
const OFFSET = 8 * HOUR;
export const utilizationModeLabels: Record<CoolingMode, string> = { OCCUPIED: "Normal cooling", SHORT_VACANCY: "Reduced cooling", LONG_VACANCY: "Standby", PRECOOL: "Pre-cooling" };
export const utilizationColors: Record<CoolingMode, string> = { OCCUPIED: "#25856d", SHORT_VACANCY: "#c69442", LONG_VACANCY: "#8c9e98", PRECOOL: "#407fa6" };
export const modeOrder: CoolingMode[] = ["OCCUPIED", "SHORT_VACANCY", "LONG_VACANCY", "PRECOOL"];
export interface UtilizationSegment { start: number; end: number; mode: CoolingMode | null; occupancy: OccupancyState | null; applied: boolean }
export interface UtilizationTotals {
  elapsedMs: number; knownMs: number; missingMs: number; modeMs: Record<CoolingMode, number>;
  normalVacantMs: number; reducedMs: number; appliedMs: number; unconfirmedMs: number;
  overlap: Record<OccupancyState, Record<CoolingMode, number>>;
}
export interface UtilizationBucket extends UtilizationTotals { start: number; end: number; label: string }
export interface UtilizationResult extends UtilizationTotals {
  segments: UtilizationSegment[]; transitions: { at: number; from: CoolingMode; to: CoolingMode }[];
  days: UtilizationBucket[]; trend: UtilizationBucket[];
}
export interface UtilizationOptions { start: number; end: number; liveAnchor: string; staleAfterMs: number }
function modeRecord(): Record<CoolingMode, number> { return { OCCUPIED: 0, SHORT_VACANCY: 0, LONG_VACANCY: 0, PRECOOL: 0 }; }
function totals(): UtilizationTotals { return { elapsedMs: 0, knownMs: 0, missingMs: 0, modeMs: modeRecord(), normalVacantMs: 0, reducedMs: 0, appliedMs: 0, unconfirmedMs: 0, overlap: { OCCUPIED: modeRecord(), VACANT: modeRecord(), UNCERTAIN: modeRecord() } }; }
export function durationLabel(ms: number) {
  if (ms <= 0) return "0 min";
  if (ms < 60_000) return "<1 min";
  const minutes = Math.floor(ms / 60_000), hours = Math.floor(minutes / 60);
  return hours ? `${hours}h${minutes % 60 ? ` ${minutes % 60}m` : ""}` : `${minutes} min`;
}
export function preciseDuration(ms: number) { const seconds = Math.floor(ms / 1000); return `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m ${seconds % 60}s`; }
export function knownPercentage(known: number, elapsed: number) { return elapsed > 0 ? known / elapsed * 100 : 0; }
export function coverageLabel(known: number, elapsed: number, places = 1) {
  const percentage = knownPercentage(known, elapsed), unit = 10 ** -places;
  if (percentage > 100 - unit && percentage < 100) return `>${(100 - unit).toFixed(places)}%`;
  if (percentage > 0 && percentage < unit) return `<${unit.toFixed(places)}%`;
  return `${percentage.toFixed(places)}%`;
}
export function mergeUtilizationHistory(previous: UtilizationHistory, incoming: UtilizationHistory, start: number): UtilizationHistory {
  const all = [...new Map([...previous.frames, ...incoming.frames].map(f => [f.sequence, f])).values()].sort((a, b) => Date.parse(a.simulated_at) - Date.parse(b.simulated_at));
  const predecessor = all.filter(f => Date.parse(f.simulated_at) < start).at(-1);
  const frames = [...(predecessor ? [predecessor] : []), ...all.filter(f => Date.parse(f.simulated_at) >= start)];
  const refs = new Set(frames.flatMap(f => [f.decision_event_id, f.output_event_id]));
  const boundary = frames[0] ? Date.parse(frames[0].simulated_at) : start;
  return { frames, events: [...new Map([...previous.events, ...incoming.events].map(e => [e.event_id, e])).values()].filter(e => refs.has(e.event_id) || Date.parse(e.occurred_at) >= boundary).sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at)) };
}
function decisionFor(f: SdpFrame, events: Map<string, UtilizationEvent>): ZoneDecision | null {
  const e = events.get(f.decision_event_id);
  return e?.event_type === "ZONE_DECISION" && e.payload.occupancy === f.occupancy && Date.parse(e.occurred_at) <= Date.parse(f.simulated_at) ? e : null;
}
function matches(output: AppliedOutput | null, decision: ZoneDecision | null) { return !!output && !!decision && output.payload.decision_event_id === decision.event_id && output.payload.command_id === decision.payload.command_id; }
function accumulate(result: UtilizationTotals, segment: UtilizationSegment, from: number, to: number) {
  const ms = Math.max(0, Math.min(to, segment.end) - Math.max(from, segment.start));
  result.elapsedMs += ms;
  if (segment.mode === null || segment.occupancy === null) { result.missingMs += ms; return; }
  result.knownMs += ms; result.modeMs[segment.mode] += ms; result.overlap[segment.occupancy][segment.mode] += ms;
  if (segment.mode === "OCCUPIED" && segment.occupancy === "VACANT") result.normalVacantMs += ms;
  if (segment.mode === "SHORT_VACANCY" || segment.mode === "LONG_VACANCY") result.reducedMs += ms;
  if (segment.applied) result.appliedMs += ms; else result.unconfirmedMs += ms;
}
function bucketSegments(segments: UtilizationSegment[], start: number, end: number, step: number, daily: boolean): UtilizationBucket[] {
  const buckets: UtilizationBucket[] = [];
  let cursor = start;
  while (cursor < end) {
    const next = Math.min(end, daily ? (Math.floor((cursor + OFFSET) / DAY) + 1) * DAY - OFFSET : (Math.floor(cursor / step) + 1) * step);
    const bucket = { ...totals(), start: cursor, end: next, label: new Intl.DateTimeFormat("en-MY", { timeZone: UTILIZATION_TIMEZONE, ...(daily ? { month: "short", day: "numeric" } as const : { hour: "2-digit", minute: "2-digit" } as const) }).format(new Date(cursor)) };
    for (const segment of segments) if (segment.start < next && segment.end > cursor) accumulate(bucket, segment, cursor, next);
    buckets.push(bucket); cursor = next;
  }
  return buckets;
}

export function calculateUtilization(history: UtilizationHistory, options: UtilizationOptions): UtilizationResult {
  const { start, end, staleAfterMs } = options;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end || !Number.isFinite(staleAfterMs) || staleAfterMs <= 0 || !Number.isFinite(Date.parse(options.liveAnchor))) throw new Error("Invalid utilization interval.");
  const frames = [...history.frames].sort((a, b) => Date.parse(a.simulated_at) - Date.parse(b.simulated_at));
  const events = new Map(history.events.map(e => [e.event_id, e]));
  const changes = [...history.events].sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at));
  const raw: UtilizationSegment[] = [], transitions: UtilizationResult["transitions"] = [];
  function transition(at: number, before: ZoneDecision | null, after: ZoneDecision | null) {
    if (at >= start && at < end && before && after && before.payload.requested_mode !== after.payload.requested_mode) transitions.push({ at, from: before.payload.requested_mode, to: after.payload.requested_mode });
  }
  let eventIndex = 0;
  for (let i = 0; i < frames.length - 1; i++) {
    const a = frames[i], b = frames[i + 1], from = Date.parse(a.simulated_at), to = Date.parse(b.simulated_at);
    // Cadence is a gap detector only. Every counted duration is a timestamp subtraction.
    const expected = from < Date.parse(options.liveAnchor) ? 300_000 : 30_000;
    if (b.sequence !== a.sequence + 1 || to <= from || to - from > Math.min(staleAfterMs, expected * 1.5) || from >= end || to < start) continue;
    let d = decisionFor(a, events);
    const initial = events.get(a.output_event_id);
    let output: AppliedOutput | null = initial?.event_type === "APPLIED_OUTPUT" && matches(initial, d) ? initial : null;
    let occupancy: OccupancyState = a.occupancy, cursor = from;
    while (eventIndex < changes.length && Date.parse(changes[eventIndex].occurred_at) <= from) eventIndex++;
    let j = eventIndex;
    function append(finish: number) {
      if (finish > cursor) raw.push({ start: cursor, end: finish, mode: d?.payload.requested_mode ?? null, occupancy, applied: matches(output, d) && output?.payload.status === "APPLIED" && output.payload.feedback_basis === "SIMULATED" });
      cursor = finish;
    }
    while (j < changes.length && Date.parse(changes[j].occurred_at) < to) {
      const e = changes[j++], at = Date.parse(e.occurred_at);
      append(at);
      if (e.event_type === "ZONE_DECISION") { transition(at, d, e); d = e; occupancy = e.payload.occupancy; output = null; }
      else if (matches(e, d)) output = e;
    }
    eventIndex = j;
    append(to);
    transition(to, d, decisionFor(b, events));
  }
  // Explicit unknown segments fill the head, gaps and unbracketed live tail.
  const segments: UtilizationSegment[] = [];
  let cursor = start;
  for (const segment of raw) {
    const a = Math.max(start, segment.start), b = Math.min(end, segment.end);
    if (b <= a) continue;
    if (a > cursor) segments.push({ start: cursor, end: a, mode: null, occupancy: null, applied: false });
    segments.push({ ...segment, start: a, end: b }); cursor = b;
  }
  if (cursor < end) segments.push({ start: cursor, end, mode: null, occupancy: null, applied: false });
  const result = totals();
  segments.forEach(s => accumulate(result, s, start, end));
  return { ...result, segments, transitions, days: bucketSegments(segments, start, end, DAY, true), trend: bucketSegments(segments, start, end, HOUR, end - start > DAY) };
}
