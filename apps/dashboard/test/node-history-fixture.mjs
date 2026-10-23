import { overviewFixture } from './overview-fixture.mjs';

export function nodeHistoryFixture(anchor) {
  const tables = overviewFixture(anchor);
  tables.sdp_node_samples = tables.sdp_events.filter(row => row.event_type === 'NODE_EVIDENCE').map(row => ({
    run_id: row.run_id, zone_id: row.zone_id, sequence: row.sequence, node_id: row.event.payload.node_id,
    observed_at: row.event.payload.temperature_c.observed_at, inserted_at: anchor ?? row.occurred_at,
    temperature_c: row.event.payload.temperature_c.value, humidity_percent: row.event.payload.humidity_percent.value,
    evidence_event_id: row.event_id, evidence: { event: row.event }
  }));
  return tables;
}
