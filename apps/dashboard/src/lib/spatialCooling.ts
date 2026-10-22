import type { CoolingMode, ZoneForecast } from "../../../../packages/sdp-contract/src";
import type { PredictiveHistory } from "../api/predictiveHistory";
import type { NodeHistoryPoint } from "../api/nodeHistory";
import type { OverviewData } from "../types/overview";
import type { UtilizationSegment } from "./utilizationAnalytics";
import { forecastAt, forecastStatus, frameAt, frameRecords, decisionEvents } from "./predictiveDisplay";

export const spatialModeColors: Record<CoolingMode, string> = { OCCUPIED: "#315f50", SHORT_VACANCY: "#91a88a", LONG_VACANCY: "#bcc7c0", PRECOOL: "#c4a052" };
export const spatialModeNames: Record<CoolingMode, string> = { OCCUPIED: "Normal", SHORT_VACANCY: "Reduced", LONG_VACANCY: "Standby", PRECOOL: "Pre-cooling" };
export const spatialOccupancyColors = { OCCUPIED: "#597c63", VACANT: "#d9e2d4", UNCERTAIN: "#d3b476" };

// Coalesce only touching, known intervals. Unknown intervals stay visible underneath.
export function coolingLanes(segments: UtilizationSegment[]) {
  function lane<T extends string>(value: (s: UtilizationSegment) => T | null) {
    const result: { start: number; end: number; value: T }[] = [];
    for (const segment of segments) {
      const v = value(segment); if (v === null) continue;
      const last = result.at(-1);
      if (last?.value === v && last.end === segment.start) last.end = segment.end;
      else result.push({ start: segment.start, end: segment.end, value: v });
    }
    return result;
  }
  return { occupancy: lane(s => s.mode === null ? null : s.occupancy), modes: lane(s => s.occupancy === null ? null : s.mode) };
}

export function inspectCooling(history: PredictiveHistory, nodes: NodeHistoryPoint[][], at: number, anchor: string, end: number) {
  const frame = at <= end ? frameAt(history.frames, at, anchor, end) : null;
  const map = new Map(history.events.map(e => [e.event_id, e]));
  let { decision, output } = frameRecords(frame, map);
  // A validated event can occur between frames. Never bring a later event backwards.
  if (frame) for (const event of history.events) {
    if (event.event_type === "ZONE_DECISION" && Date.parse(event.occurred_at) <= at && (!decision || Date.parse(event.occurred_at) >= Date.parse(decision.occurred_at))) decision = event;
  }
  if (decision && Date.parse(decision.occurred_at) > at) decision = null;
  if (!decision || !output || output.payload.decision_event_id !== decision.event_id || output.payload.command_id !== decision.payload.command_id || Date.parse(output.occurred_at) > at) output = null;
  if (decision) for (const event of history.events) {
    if (event.event_type === "APPLIED_OUTPUT" && Date.parse(event.occurred_at) <= at && event.payload.decision_event_id === decision.event_id && event.payload.command_id === decision.payload.command_id && (!output || Date.parse(event.occurred_at) >= Date.parse(output.occurred_at))) output = event;
  }
  const forecast = forecastAt(history.events, Math.min(at, end));
  const support = decision?.payload.forecast_event_id ? map.get(decision.payload.forecast_event_id) : null;
  const supportingForecast = support?.event_type === "ZONE_FORECAST" && Date.parse(support.occurred_at) <= Date.parse(decision!.payload.evaluated_at) ? support : null;
  return { frame, decision, output, forecast, supportingForecast, at,
    // Exact frame sequence, not a nearest (possibly future) reading.
    temperatures: nodes.map(points => {
      const p = frame ? points.find(p => p.sequence === frame.sequence && Date.parse(p.observed_at) <= at) : undefined;
      return p ? { value: p.evidence.payload.temperature_c.validity === "VALID" ? p.temperature_c : null, validity: p.evidence.payload.temperature_c.validity, at: p.observed_at, evidenceId: p.evidence_event_id } : { value: null, validity: "UNAVAILABLE", at: null, evidenceId: null };
    }) };
}
export type CoolingInspection = ReturnType<typeof inspectCooling>;

export function latestCooling(data: OverviewData): CoolingInspection {
  const nodes = data.zone.config.payload.required_nodes.map(n => {
    const p = data.samples.find(p => p.node_id === n.node_id), evidence = p && data.evidence.find(e => e.event_id === p.evidence_event_id);
    return p && evidence ? [{ ...p, evidence }] : [];
  });
  return inspectCooling({ frames: [data.frame], samples: data.samples, events: [data.decision, data.forecast, data.output] }, nodes, Date.parse(data.frame.simulated_at), data.run.live_anchor, Date.parse(data.frame.simulated_at));
}

// Historical windows are labelled "as issued", never treated as confirmed use.
// Repeated identical publications share a footprint; their issue markers remain separate.
export function issuedWindows(history: PredictiveHistory, asOf: number, start: number, end: number) {
  const unique = new Map<string, ZoneForecast>();
  for (const e of history.events) if (e.event_type === "ZONE_FORECAST" && Date.parse(e.occurred_at) <= asOf && e.payload.status === "ACTIVE" && e.payload.next_use_window && Date.parse(e.payload.next_use_window.end) >= start && Date.parse(e.payload.next_use_window.start) <= end) {
    unique.set(`${e.payload.next_use_window.start}/${e.payload.next_use_window.end}/${e.payload.planned_restart_at}`, e);
  }
  return [...unique.values()];
}
export function significantDecisions(history: PredictiveHistory) {
  const decisions = decisionEvents(history);
  return decisions.filter((e, i) => {
    const p = decisions[i - 1]?.payload, v = e.payload;
    return !p || p.requested_mode !== v.requested_mode || p.occupancy !== v.occupancy || p.reason_code !== v.reason_code || p.coverage !== v.coverage;
  });
}
export function forecastHorizon(forecast: ZoneForecast | null, asOf: number, end: number) {
  if (!forecast || forecastStatus(forecast, asOf) !== "ACTIVE") return end;
  return Math.max(end, Date.parse(forecast.payload.next_use_window?.end ?? "") || end, Date.parse(forecast.payload.planned_restart_at ?? "") || end);
}
