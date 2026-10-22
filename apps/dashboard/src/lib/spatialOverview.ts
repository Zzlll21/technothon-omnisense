import type { OverviewData } from "../types/overview";
import { feedStatus, forecastState, modeLabels, nodeStatus, outputLabel } from "./overviewDisplay";
import type { NodeClass } from "../../../../packages/sdp-contract/src";

const classificationLabels: Record<NodeClass, string> = {
  EMPTY_CORE: "Vacant", THERMAL_ANOMALIES: "Uncertain",
  OCCUPIED_1P: "Occupied · 1 person", OCCUPIED_2P: "Occupied · 2 people", OCCUPIED_3P_PLUS: "Occupied · 3+ people"
};

/** Presentation only. No query, fusion, interpolation or forecast calculation. */
export function spatialOverview(data: OverviewData, now: number) {
  const nodes = data.zone.config.payload.required_nodes.map(configured => {
    const sample = data.samples.find(s => s.node_id === configured.node_id);
    const evidence = sample && data.evidence.find(e => e.event_id === sample.evidence_event_id && e.payload.node_id === configured.node_id);
    const state = data.decision.payload.node_states.find(n => n.node_id === configured.node_id);
    const freshness = nodeStatus(sample, data, now);
    const temperature = evidence?.payload.temperature_c.validity === "VALID" ? sample?.temperature_c ?? null : null;
    const humidity = evidence?.payload.humidity_percent.validity === "VALID" ? sample?.humidity_percent ?? null : null;
    const classification = evidence?.payload.classification;
    const valid = temperature !== null && humidity !== null && classification?.validity === "VALID";
    return {
      id: configured.node_id, label: configured.label, x: configured.x, y: configured.y,
      temperature, humidity, observedAt: sample?.observed_at ?? null,
      classification: classification?.validity === "VALID" ? classificationLabels[classification.value.class_label] : "Unavailable",
      evidenceValid: valid, freshness: freshness.label, recordedState: state?.state ?? "MISSING",
      freshAndValid: freshness.label === "Connected" && state?.state === "FRESH" && valid,
      evidenceId: evidence?.event_id ?? null
    };
  });
  // The contract specifies a representative node, not a room-wide average.
  const representative = nodes.find(n => n.id === data.zone.config.payload.representative_environment_node_id);
  const forecast = data.forecast.payload;
  const status = forecastState(data.forecast, now);
  return {
    runId: data.run.run_id, zoneId: data.zone.zone_id, roomId: data.zone.room_id, zoneName: data.zone.name,
    sequence: data.frame.sequence, at: data.frame.simulated_at,
    occupancy: data.frame.occupancy === "OCCUPIED" ? "Occupied" : data.frame.occupancy === "VACANT" ? "Vacant" : "Uncertain",
    coverage: data.frame.coverage, feed: feedStatus(data, now), nodes, representative,
    freshCount: nodes.filter(n => n.freshAndValid).length,
    requestedMode: modeLabels[data.decision.payload.requested_mode], reason: data.decision.payload.reason_text,
    decisionId: data.decision.event_id, commandId: data.decision.payload.command_id,
    outputStatus: data.output.payload.status, reportedOutput: outputLabel(data.output.payload.reported_output),
    outputId: data.output.event_id,
    forecast: { status, source: forecast.source, quality: forecast.quality,
      window: status === "ACTIVE" ? forecast.next_use_window : null,
      restart: status === "ACTIVE" ? forecast.planned_restart_at : null,
      reason: forecast.status_reason, id: data.forecast.event_id }
  };
}

export type SpatialOverview = ReturnType<typeof spatialOverview>;
