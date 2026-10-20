import fixtureBundle from "../../../../packages/sdp-contract/fixtures/scenarios.json";
import { createSdpDataSource } from "../../../../packages/sdp-contract/src/index";
import type { EventQuery, OverrideRequest, OverrideStatus, SdpDataSource } from "../../../../packages/sdp-contract/src/index";

export type { EventQuery, SdpDataSource, ZoneSnapshot } from "../../../../packages/sdp-contract/src/index";
export { createSdpDataSource };

/** Used only by the isolated SDP mock view; legacy telemetry reads are unchanged. */
export function listSdpMockScenarios() {
  return fixtureBundle.scenarios.map(({ id, label }) => ({ id, label }));
}

export function getSdpMockScenario(id: string): {
  id: string;
  label: string;
  query: EventQuery;
  source: SdpDataSource;
} {
  const scenario = fixtureBundle.scenarios.find(item => item.id === id);
  if (!scenario) throw new Error(`Unknown SDP fixture scenario: ${id}`);
  if (scenario.query.clock.time_base !== "REPLAY") throw new Error("Mock scenarios require an explicit replay clock");
  const eventIds = new Set(scenario.event_ids);
  const events = fixtureBundle.events.filter(event => eventIds.has(event.event_id));
  if (events.length !== eventIds.size) throw new Error(`Missing events in SDP scenario: ${id}`);
  return {
    id: scenario.id,
    label: `${scenario.label} (simulated test data)`,
    query: {
      session_id: scenario.query.session_id,
      zone_id: scenario.query.zone_id,
      as_of: scenario.query.as_of,
      clock: { time_base: "REPLAY", replay_id: scenario.query.clock.replay_id }
    },
    source: createSdpDataSource(async () => structuredClone(events))
  };
}

/** Ephemeral E-owned request records; no fixture controller confirmations are copied here. */
export function getLocalOverrideHistory(events: readonly (OverrideRequest | OverrideStatus)[]) {
  const first = events[0];
  if (!first) return null;
  if (events.some(event => event.clock.time_base !== "REPLAY" || event.clock.replay_id !== first.clock.replay_id ||
    event.session_id !== first.session_id || event.producer.component !== "E" ||
    !event.data_sources.includes("SIMULATED") || (event.event_type === "OVERRIDE_STATUS" && event.payload.status !== "PENDING"))) {
    throw new Error("Local override history accepts only simulated E requests/PENDING in one replay session.");
  }
  const asOf = events.reduce((latest, event) => Date.parse(event.occurred_at) > Date.parse(latest) ? event.occurred_at : latest, first.occurred_at);
  const queries: EventQuery[] = [...new Set(events.map(event => event.zone_id))].sort().map(zone_id => ({
    session_id: first.session_id, zone_id, clock: first.clock, as_of: asOf
  }));
  return { queries, source: createSdpDataSource(async () => structuredClone(events)) };
}
