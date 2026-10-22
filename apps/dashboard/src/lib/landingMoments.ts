import type { CoolingMode, ZoneForecast } from "../../../../packages/sdp-contract/src";
import type { OverviewData } from "../types/overview";
import type { PredictiveHistory } from "../api/predictiveHistory";
import { forecastAt, forecastStatus, frameRecords } from "./predictiveDisplay";

export function landingSnapshot(data: OverviewData, history: PredictiveHistory, sequence?: number) {
  if (sequence === undefined) return { frame: data.frame, sample: data.samples.find(s => s.node_id === data.zone.config.payload.representative_environment_node_id), decision: data.decision, output: data.output, forecast: data.forecast, historical: false };
  const frame = history.frames.find(f => f.sequence === sequence);
  if (!frame) return null;
  const records = frameRecords(frame, new Map(history.events.map(e => [e.event_id, e])));
  const at = Date.parse(frame.simulated_at);
  return { frame, sample: history.samples.find(s => s.sequence === frame.sequence && s.node_id === data.zone.config.payload.representative_environment_node_id), ...records, forecast: forecastAt(history.events, at), historical: true };
}
export function landingMoments(history: PredictiveHistory) {
  const events = new Map(history.events.map(e => [e.event_id, e]));
  return (["PRECOOL", "OCCUPIED", "SHORT_VACANCY"] as CoolingMode[]).map(mode => {
    // Keep environmental samples and linked control records on the same committed frame.
    const frame = [...history.frames].reverse().find(frame => {
      const decision = events.get(frame.decision_event_id);
      return decision?.event_type === "ZONE_DECISION" && decision.payload.requested_mode === mode && (mode !== "OCCUPIED" || frame.occupancy === "OCCUPIED");
    });
    const onset = frame ? history.frames.find(f => f.decision_event_id === frame.decision_event_id && f.occupancy === frame.occupancy) ?? frame : undefined;
    return { mode, sequence: onset?.sequence, at: onset?.simulated_at };
  });
}
export function activeLandingForecast(forecast: ZoneForecast | null, asOf: number) {
  return forecastStatus(forecast, asOf) === "ACTIVE" ? forecast : null;
}
