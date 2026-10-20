import { isUtcTimestamp, parseSdpEvents } from "./validate.js";
import type { EventQuery, SdpDataSource, SdpEvent, ZoneSnapshot } from "./types.js";

/** Loader boundary supports JSON fixtures now and backend records later. No control logic. */
export function createSdpDataSource(load: (query: EventQuery) => Promise<unknown>): SdpDataSource {
  async function getEvents(query: EventQuery): Promise<SdpEvent[]> {
    if (!isUtcTimestamp(query.as_of) || !query.session_id.trim() || !query.zone_id.trim()) throw new Error("SDP query requires session_id, zone_id and a valid UTC as_of");
    if (query.clock.time_base === "REPLAY" ? !query.clock.replay_id?.trim() : query.clock.replay_id !== null) throw new Error("Invalid SDP query clock");
    return parseSdpEvents(await load(query))
      .filter(event => event.session_id === query.session_id && event.zone_id === query.zone_id && event.clock.time_base === query.clock.time_base && event.clock.replay_id === query.clock.replay_id && Date.parse(event.occurred_at) <= Date.parse(query.as_of))
      .sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at) || a.event_id.localeCompare(b.event_id));
  }
  return { getEvents, async getZoneSnapshot(query) { return toZoneSnapshot(await getEvents(query), query.as_of); } };
}

function toZoneSnapshot(events: SdpEvent[], asOf: string): ZoneSnapshot {
  const ofType = <K extends SdpEvent["event_type"]>(kind: K) => events.filter((event): event is Extract<SdpEvent, { event_type: K }> => event.event_type === kind);
  const config = ofType("ZONE_CONFIG").filter(event => Date.parse(event.payload.effective_from) <= Date.parse(asOf)).at(-1) ?? null;
  const nodeMap = new Map<string, Extract<SdpEvent, { event_type: "NODE_EVIDENCE" }>>();
  ofType("NODE_EVIDENCE").forEach(event => nodeMap.set(event.payload.node_id, event));
  const decision = ofType("ZONE_DECISION").at(-1) ?? null;
  const forecast = ofType("ZONE_FORECAST").at(-1) ?? null;
  const output = decision ? ofType("APPLIED_OUTPUT").filter(event => event.payload.decision_event_id === decision.event_id).at(-1) ?? null : null;
  return {
    config, nodes: [...nodeMap.values()], decision, forecast,
    forecast_state: !forecast ? "UNAVAILABLE" : forecast.payload.status !== "ACTIVE" ? forecast.payload.status : Date.parse(asOf) >= Date.parse(forecast.payload.expires_at) ? "EXPIRED" : "ACTIVE",
    output, override_requests: ofType("OVERRIDE_REQUEST"), override_statuses: ofType("OVERRIDE_STATUS"), events
  };
}
