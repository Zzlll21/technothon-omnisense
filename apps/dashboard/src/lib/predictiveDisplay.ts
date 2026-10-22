import type { AppliedOutput, CoolingMode, ZoneDecision, ZoneForecast } from "../../../../packages/sdp-contract/src";
import type { PredictiveHistory, CoolingEvent } from "../api/predictiveHistory";
import type { SdpFrame } from "../types/overview";
import { sampleInterval } from "./nodeHistoryDisplay";

export const coolingColors: Record<CoolingMode, string> = { OCCUPIED: "#059669", SHORT_VACANCY: "#D97706", LONG_VACANCY: "#64748B", PRECOOL: "#0284C7" };
export const occupancyColors = { OCCUPIED: "#51a58a", VACANT: "#d3ddd7", UNCERTAIN: "#d8ad61" };
export const emptyHistory: PredictiveHistory = { frames: [], samples: [], events: [] };
export function mergeHistory(previous: PredictiveHistory, incoming: PredictiveHistory, start: number): PredictiveHistory {
  const frames = [...previous.frames, ...incoming.frames].filter(f => Date.parse(f.simulated_at) >= start);
  const samples = [...previous.samples, ...incoming.samples].filter(s => Date.parse(s.observed_at) >= start);
  const refs = new Set(frames.flatMap(f => [f.decision_event_id, f.forecast_event_id, f.output_event_id]));
  const events = [...new Map([...previous.events, ...incoming.events].map(e => [e.event_id, e])).values()];
  // Keep historical boundary references and forecasts needed by retained decisions.
  for (const e of events) if (refs.has(e.event_id) && e.event_type === "ZONE_DECISION" && e.payload.forecast_event_id) refs.add(e.payload.forecast_event_id);
  return { frames, samples, events: events.filter(e => refs.has(e.event_id) || Date.parse(e.occurred_at) >= start).sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at)) };
}
export function forecastStatus(forecast: ZoneForecast | null, asOf: number) {
  if (!forecast || Date.parse(forecast.occurred_at) > asOf) return "UNAVAILABLE";
  if (forecast.payload.status !== "ACTIVE") return forecast.payload.status;
  return asOf >= Date.parse(forecast.payload.expires_at) ? "EXPIRED" : "ACTIVE";
}
export function forecastAt(events: CoolingEvent[], at: number): ZoneForecast | null {
  let latest: ZoneForecast | null = null;
  for (const e of events) if (e.event_type === "ZONE_FORECAST" && Date.parse(e.occurred_at) <= at && (!latest || Date.parse(e.occurred_at) >= Date.parse(latest.occurred_at))) latest = e;
  return latest;
}
export function frameEnd(frame: SdpFrame, next: SdpFrame | undefined, anchor: string, end: number) {
  const at = Date.parse(frame.simulated_at);
  return Math.min(end, at + sampleInterval(at + 1, anchor), next ? Date.parse(next.simulated_at) : Infinity);
}
export function frameAt(frames: SdpFrame[], at: number, anchor: string, end: number) {
  let lo = 0, hi = frames.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (Date.parse(frames[mid].simulated_at) <= at) lo = mid + 1; else hi = mid; }
  const frame = frames[lo - 1];
  return frame && at <= frameEnd(frame, frames[lo], anchor, end) ? frame : null;
}
export function frameRecords(frame: SdpFrame | null, events: Map<string, CoolingEvent>) {
  const d = frame ? events.get(frame.decision_event_id) : null;
  const o = frame ? events.get(frame.output_event_id) : null;
  return { decision: d?.event_type === "ZONE_DECISION" ? d : null, output: o?.event_type === "APPLIED_OUTPUT" ? o : null };
}
export function decisionExplanation(decision: ZoneDecision | null, forecast: ZoneForecast | null): string {
  if (!decision) return "No linked cooling decision is available for this time.";
  const p = decision.payload;
  if (p.reason_code === "OCCUPIED_EVIDENCE" && p.occupancy === "OCCUPIED" && p.requested_mode === "OCCUPIED") return "Occupancy was detected. The controller requested occupied cooling.";
  if (p.reason_code === "SHORT_GAP" && p.occupancy === "VACANT" && p.requested_mode === "SHORT_VACANCY") return "The controller recorded a short vacancy and requested reduced cooling.";
  if (p.reason_code === "LONG_GAP" && p.occupancy === "VACANT" && p.requested_mode === "LONG_VACANCY") return "The controller recorded a long vacancy and requested cooling standby.";
  if (p.reason_code === "FORECAST_RESTART" && p.requested_mode === "PRECOOL") {
    const valid = forecast?.event_id === p.forecast_event_id && forecastStatus(forecast, Date.parse(p.evaluated_at)) === "ACTIVE";
    return valid ? "The controller requested pre-cooling using the linked next-use forecast." : "The controller recorded a forecast restart. Its supporting forecast is unavailable or no longer valid at decision time.";
  }
  if (p.reason_code === "CONSERVATIVE_FALLBACK") return "The controller retained a conservative cooling setting while assessing the room.";
  return p.reason_text.replace(/^Scripted demo:\s*/i, "").replace(/^./, c => c.toUpperCase());
}
export function timelineBands(history: PredictiveHistory, anchor: string, end: number) {
  const events = new Map(history.events.map(e => [e.event_id, e]));
  const occupancy: { start: number; end: number; value: SdpFrame["occupancy"] }[] = [];
  const modes: { start: number; end: number; value: CoolingMode }[] = [];
  function append<T>(list: { start: number; end: number; value: T }[], start: number, finish: number, value: T, contiguous: boolean) {
    if (finish <= start) return;
    const last = list.at(-1);
    if (last && last.end === start && last.value === value && contiguous) last.end = finish;
    else list.push({ start, end: finish, value });
  }
  history.frames.forEach((frame, i) => {
    const start = Date.parse(frame.simulated_at), finish = frameEnd(frame, history.frames[i + 1], anchor, end);
    const contiguous = i > 0 && history.frames[i - 1].sequence + 1 === frame.sequence;
    append(occupancy, start, finish, frame.occupancy, contiguous);
    const decision = events.get(frame.decision_event_id);
    if (decision?.event_type === "ZONE_DECISION") append(modes, start, finish, decision.payload.requested_mode, contiguous);
  });
  return { occupancy, modes };
}
export function temperatureSegments(history: PredictiveHistory, anchor: string) {
  const segments: PredictiveHistory["samples"][] = [];
  let segment: PredictiveHistory["samples"] = [];
  history.samples.forEach((sample, i) => {
    const previous = history.samples[i - 1];
    if (previous && (sample.sequence !== previous.sequence + 1 || Date.parse(sample.observed_at) - Date.parse(previous.observed_at) > sampleInterval(Date.parse(sample.observed_at), anchor) * 1.5)) {
      if (segment.length) segments.push(segment); segment = [];
    }
    segment.push(sample);
  });
  if (segment.length) segments.push(segment);
  return segments;
}
export function decisionEvents(history: PredictiveHistory) {
  const referenced = new Set(history.frames.map(f => f.decision_event_id));
  return history.events.filter((e): e is ZoneDecision => e.event_type === "ZONE_DECISION" && referenced.has(e.event_id));
}
export function reportedLabel(output: AppliedOutput | null) {
  return output ? output.payload.status === "APPLIED" ? "Simulated output reported" : `Output ${output.payload.status.toLowerCase()}` : "No linked output report";
}
