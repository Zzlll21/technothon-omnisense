import type { EventQuery, SdpDataSource, SdpEvent } from "../../../../packages/sdp-contract/src/types";

export const eventTypeLabels: Record<SdpEvent["event_type"], string> = {
  NODE_EVIDENCE: "Node evidence",
  ZONE_CONFIG: "Zone configuration",
  ZONE_DECISION: "Zone decision",
  ZONE_FORECAST: "Forecast",
  APPLIED_OUTPUT: "Output report",
  OVERRIDE_REQUEST: "Override request",
  OVERRIDE_STATUS: "Override status"
};

export function recordOverrideRequestId(event: SdpEvent, context: readonly SdpEvent[]): string {
  if (event.event_type === "OVERRIDE_REQUEST" || event.event_type === "OVERRIDE_STATUS") return event.payload.request_id;
  if (event.event_type === "ZONE_DECISION") return event.payload.override_request_id ?? "";
  if (event.event_type === "APPLIED_OUTPUT") {
    const decision = context.find(candidate => candidate.event_type === "ZONE_DECISION" && candidate.event_id === event.payload.decision_event_id &&
      candidate.payload.command_id === event.payload.command_id && candidate.zone_id === event.zone_id && candidate.room_id === event.room_id &&
      candidate.session_id === event.session_id && candidate.clock.time_base === event.clock.time_base && candidate.clock.replay_id === event.clock.replay_id);
    return decision?.event_type === "ZONE_DECISION" ? decision.payload.override_request_id ?? "" : "";
  }
  return "";
}

export function filterRecords(events: readonly SdpEvent[], zoneId: string, eventType: string, requestId = ""): SdpEvent[] {
  return events.filter(event => (!zoneId || event.zone_id === zoneId) && (!eventType || event.event_type === eventType) &&
    (!requestId.trim() || recordOverrideRequestId(event, events) === requestId.trim()))
    .sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at) || a.event_id.localeCompare(b.event_id));
}

/** Each query is a zone in the same history, never a different scenario branch. */
export async function loadOperatingRecords(source: SdpDataSource, queries: readonly EventQuery[]): Promise<SdpEvent[]> {
  const first = queries[0];
  if (!first) return [];
  if (new Set(queries.map(query => query.zone_id)).size !== queries.length || queries.some(query =>
    query.session_id !== first.session_id || query.clock.time_base !== first.clock.time_base ||
    query.clock.replay_id !== first.clock.replay_id || Date.parse(query.as_of) !== Date.parse(first.as_of))) {
    throw new Error("Records queries must use unique zones in one session, clock and cutoff.");
  }
  const groups = await Promise.all(queries.map(query => source.getEvents(query)));
  return filterRecords(groups.flat(), "", "");
}

export function forecastExpiryReached(event: SdpEvent, asOf: string): boolean {
  return event.event_type === "ZONE_FORECAST" && event.payload.status === "ACTIVE" &&
    Date.parse(asOf) >= Date.parse(event.payload.expires_at);
}

export function describeRecord(event: SdpEvent): {
  title: string; summary: string; status: string;
  tone: "normal" | "attention" | "alert" | "info" | "neutral";
  reasonCode: string; reason: string;
} {
  switch (event.event_type) {
    case "NODE_EVIDENCE": {
      const observation = event.payload.classification;
      return {
        title: `Node evidence / ${event.payload.node_id}`,
        summary: observation.validity === "VALID" ? `Classification: ${observation.value.class_label} / Headcount category: ${observation.value.headcount_category}` : "Classification unavailable",
        status: observation.validity, tone: observation.validity === "VALID" ? "info" : "attention", reasonCode: "", reason: ""
      };
    }
    case "ZONE_CONFIG":
      return { title: "Zone configuration", summary: `${event.payload.required_nodes.length} required nodes / ${event.payload.actuation_kind}`, status: event.payload.config_version, tone: "neutral", reasonCode: "", reason: "" };
    case "ZONE_DECISION":
      return { title: "Zone occupancy & cooling decision", summary: `Occupancy: ${event.payload.occupancy} / Requested mode: ${event.payload.requested_mode}`, status: event.payload.occupancy, tone: event.payload.occupancy === "UNCERTAIN" ? "attention" : "info", reasonCode: event.payload.reason_code, reason: event.payload.reason_text };
    case "ZONE_FORECAST":
      return { title: event.payload.status === "CANCELLED" ? "Forecast cancelled" : event.payload.status === "UNAVAILABLE" ? "Forecast unavailable" : event.payload.supersedes_event_id ? "Forecast updated" : "Forecast issued", summary: `Source: ${event.payload.source} / Quality: ${event.payload.quality}`, status: event.payload.status, tone: event.payload.status === "ACTIVE" ? "info" : "neutral", reasonCode: "", reason: event.payload.status_reason ?? "" };
    case "APPLIED_OUTPUT":
      return { title: event.payload.status === "APPLIED" ? "Output reported applied" : "Output response", summary: event.payload.status === "APPLIED" ? `Feedback basis: ${event.payload.feedback_basis}` : "Application not confirmed", status: event.payload.status, tone: event.payload.status === "APPLIED" ? "normal" : ["FAILED", "REJECTED"].includes(event.payload.status) ? "alert" : "info", reasonCode: "", reason: event.payload.reason ?? "" };
    case "OVERRIDE_REQUEST":
      return { title: event.payload.action === "RETURN_TO_AUTOMATIC" ? "Return to Automatic requested" : "Manual override requested", summary: "Awaiting separate controller status", status: event.payload.action, tone: "info", reasonCode: "", reason: event.payload.reason };
    case "OVERRIDE_STATUS":
      return { title: "Override lifecycle", summary: `Request: ${event.payload.request_id}`, status: event.payload.status, tone: ["FAILED", "REJECTED"].includes(event.payload.status) ? "alert" : event.payload.status === "APPLIED" ? "normal" : "neutral", reasonCode: "", reason: event.payload.reason };
  }
}

export const recordsCsvColumns = [
  "schema_version", "event_id", "correlation_id", "session_id", "room_id", "zone_id", "occurred_at", "event_type",
  "producer_component", "producer_id", "time_base", "replay_id", "as_of", "data_sources", "reason_code", "reason", "status",
  "node_id", "occupancy", "coverage", "action", "requested_mode", "requested_fan", "requested_setpoint_c",
  "reported_fan", "reported_setpoint_c", "feedback_basis", "command_id", "decision_event_id", "forecast_event_id",
  "override_request_id", "forecast_source", "forecast_quality", "forecast_expires_at", "forecast_expiry_reached_as_of", "event_json"
] as const;

function csvCell(value: string | number | boolean | null | undefined): string {
  let text = value == null ? "" : String(value);
  // Quoting alone does not stop spreadsheets interpreting external text as formulas.
  if (typeof value === "string" && /^(?:\s*[=+@-]|[\t\r\n])/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function exportRecordsCsv(events: readonly SdpEvent[], asOf: string, context: readonly SdpEvent[] = events): string {
  const rows = filterRecords(events, "", "").map(event => {
    const details = describeRecord(event);
    const decision = event.event_type === "ZONE_DECISION" ? event.payload : null;
    const forecast = event.event_type === "ZONE_FORECAST" ? event.payload : null;
    const output = event.event_type === "APPLIED_OUTPUT" ? event.payload : null;
    const request = event.event_type === "OVERRIDE_REQUEST" ? event.payload : null;
    const override = event.event_type === "OVERRIDE_STATUS" ? event.payload : null;
    const values: Record<typeof recordsCsvColumns[number], string | number | boolean | null | undefined> = {
      schema_version: event.schema_version, event_id: event.event_id, correlation_id: event.correlation_id,
      session_id: event.session_id, room_id: event.room_id, zone_id: event.zone_id, occurred_at: event.occurred_at,
      event_type: event.event_type, producer_component: event.producer.component, producer_id: event.producer.producer_id,
      time_base: event.clock.time_base, replay_id: event.clock.replay_id, as_of: asOf, data_sources: event.data_sources.join(" | "),
      reason_code: details.reasonCode, reason: details.reason,
      status: "status" in event.payload ? event.payload.status : "",
      node_id: event.event_type === "NODE_EVIDENCE" ? event.payload.node_id : "",
      occupancy: decision?.occupancy, coverage: decision?.coverage, action: request?.action,
      requested_mode: decision?.requested_mode ?? (request?.action === "SET_OVERRIDE" ? request.requested_mode : null),
      requested_fan: decision?.requested_output?.fan,
      requested_setpoint_c: decision?.requested_output?.setpoint_c ?? (request?.action === "SET_OVERRIDE" ? request.requested_setpoint_c : null),
      reported_fan: output?.reported_output?.fan, reported_setpoint_c: output?.reported_output?.setpoint_c,
      feedback_basis: output?.feedback_basis, command_id: decision?.command_id ?? output?.command_id,
      decision_event_id: output?.decision_event_id ?? override?.decision_event_id,
      forecast_event_id: decision?.forecast_event_id,
      override_request_id: recordOverrideRequestId(event, context),
      forecast_source: forecast?.source, forecast_quality: forecast?.quality, forecast_expires_at: forecast?.expires_at,
      forecast_expiry_reached_as_of: forecast?.status === "ACTIVE" ? forecastExpiryReached(event, asOf) : null,
      event_json: JSON.stringify(event)
    };
    return recordsCsvColumns.map(column => csvCell(values[column])).join(",");
  });
  return [recordsCsvColumns.map(csvCell).join(","), ...rows].join("\r\n") + "\r\n";
}
