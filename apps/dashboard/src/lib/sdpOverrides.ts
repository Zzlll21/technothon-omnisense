import type { AppliedOutput, EventQuery, OverrideRequest, OverrideStatus, SdpEvent, ZoneConfig } from "../../../../packages/sdp-contract/src/types";

export const mockAcceptanceWindowMs = 10000;

function envelope(config: ZoneConfig, query: EventQuery, requestId: string, eventId: string) {
  if (query.clock.time_base !== "REPLAY" || !config.data_sources.includes("SIMULATED") ||
    config.zone_id !== query.zone_id || config.session_id !== query.session_id ||
    config.clock.time_base !== query.clock.time_base || config.clock.replay_id !== query.clock.replay_id ||
    !Number.isFinite(Date.parse(query.as_of)) || !requestId.trim() || !eventId.trim()) {
    throw new Error("A matching simulated replay configuration, clock and request IDs are required.");
  }
  return {
    schema_version: config.schema_version, event_id: eventId, correlation_id: requestId,
    session_id: query.session_id, room_id: config.room_id, zone_id: query.zone_id,
    occurred_at: query.as_of, clock: query.clock,
    producer: { component: "E" as const, producer_id: "sdp-local-override-demo" },
    data_sources: ["SIMULATED" as const]
  };
}

export function createOccupiedOverride(config: ZoneConfig, query: EventQuery, requestId: string, eventId: string, durationMinutes: number, setpoint: number | null): OverrideRequest {
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes * 60000 > config.payload.override_max_duration_ms) {
    throw new Error("Duration must be whole minutes within the configured override limit.");
  }
  if (setpoint !== null && (!Number.isFinite(setpoint) || setpoint < config.payload.limits.temperature_min_c || setpoint > config.payload.limits.temperature_max_c)) {
    throw new Error("Temperature must be within the configured permitted limits.");
  }
  return {
    ...envelope(config, query, requestId, eventId), event_type: "OVERRIDE_REQUEST",
    payload: {
      request_id: requestId, valid_until: new Date(Date.parse(query.as_of) + mockAcceptanceWindowMs).toISOString(),
      reason: "Local simulated timed override; no command delivery.", action: "SET_OVERRIDE", requested_mode: "OCCUPIED",
      requested_setpoint_c: setpoint, override_expires_at: new Date(Date.parse(query.as_of) + durationMinutes * 60000).toISOString()
    }
  };
}

export function createAutomaticReturn(config: ZoneConfig, query: EventQuery, requestId: string, eventId: string, original: OverrideRequest): OverrideRequest {
  if (original.payload.action !== "SET_OVERRIDE" || original.payload.request_id === requestId ||
    !sameScope(config, original) || Date.parse(original.occurred_at) > Date.parse(query.as_of)) {
    throw new Error("Return to Automatic must target an earlier occupied-operation request in this zone and session.");
  }
  return {
    ...envelope(config, query, requestId, eventId), correlation_id: original.correlation_id, event_type: "OVERRIDE_REQUEST",
    payload: {
      request_id: requestId, valid_until: new Date(Date.parse(query.as_of) + mockAcceptanceWindowMs).toISOString(),
      reason: "Local simulated Return to Automatic; controller outcome unknown.", action: "RETURN_TO_AUTOMATIC",
      target_request_id: original.payload.request_id
    }
  };
}

/** E owns submission/PENDING only. Controller and device outcomes are never generated. */
export function createPendingOverride(request: OverrideRequest, eventId: string): OverrideStatus {
  return {
    schema_version: request.schema_version, event_type: "OVERRIDE_STATUS", event_id: eventId,
    correlation_id: request.correlation_id, session_id: request.session_id, room_id: request.room_id, zone_id: request.zone_id,
    occurred_at: request.occurred_at, clock: request.clock, producer: request.producer, data_sources: [...request.data_sources],
    payload: { request_id: request.payload.request_id, status: "PENDING", reason: "Locally submitted simulation; no controller acknowledgement.", decision_event_id: null, applied_output_event_id: null, effective_until: null }
  };
}

function sameScope(a: SdpEvent, b: SdpEvent): boolean {
  return a.zone_id === b.zone_id && a.room_id === b.room_id && a.session_id === b.session_id &&
    a.clock.time_base === b.clock.time_base && a.clock.replay_id === b.clock.replay_id;
}

/** Presentation of recorded outcomes and deadline warnings, not a controller state machine. */
export function overrideLifecycle(events: readonly SdpEvent[], requestId: string, asOf: string) {
  const history = events.filter(event => Date.parse(event.occurred_at) <= Date.parse(asOf))
    .sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at) || a.event_id.localeCompare(b.event_id));
  const request = history.find((event): event is OverrideRequest => event.event_type === "OVERRIDE_REQUEST" && event.payload.request_id === requestId) ?? null;
  const statuses = request ? history.filter((event): event is OverrideStatus => event.event_type === "OVERRIDE_STATUS" && event.payload.request_id === requestId && sameScope(request, event)) : [];
  const latest = statuses.at(-1) ?? null;
  const acknowledged = statuses.filter(event => event.producer.component === "C" && event.payload.status !== "PENDING").at(-1) ?? null;
  const appliedStatus = statuses.filter(event => event.payload.status === "APPLIED").at(-1);
  const decision = request && appliedStatus ? history.find(event => event.event_type === "ZONE_DECISION" && event.event_id === appliedStatus.payload.decision_event_id && event.payload.override_request_id === requestId && sameScope(request, event)) : null;
  const appliedOutput = request && appliedStatus && decision?.event_type === "ZONE_DECISION" ? history.find((event): event is AppliedOutput =>
    event.event_type === "APPLIED_OUTPUT" && event.event_id === appliedStatus.payload.applied_output_event_id &&
    event.payload.status === "APPLIED" && event.payload.decision_event_id === decision.event_id &&
    event.payload.command_id === decision.payload.command_id && sameScope(request, event) &&
    Date.parse(event.occurred_at) <= Date.parse(appliedStatus.occurred_at)) ?? null : null;
  const terminal = latest && ["REJECTED", "FAILED", "EXPIRED", "CANCELLED"].includes(latest.payload.status);
  const endTime = acknowledged?.payload.effective_until ?? (request?.payload.action === "SET_OVERRIDE" ? request.payload.override_expires_at : null);
  return {
    request, statuses, latest, acknowledged, appliedOutput,
    acknowledgementTimedOut: !!request && !acknowledged && Date.parse(asOf) >= Date.parse(request.payload.valid_until),
    endUnconfirmed: !!request && request.payload.action === "SET_OVERRIDE" && !terminal && !!endTime && Date.parse(asOf) >= Date.parse(endTime),
    appliedReferenceMissing: !!appliedStatus && !appliedOutput,
    canReturn: !!request && request.payload.action === "SET_OVERRIDE" && !!acknowledged && !terminal &&
      ["ACCEPTED", "APPLIED"].includes(latest?.payload.status ?? "")
  };
}
