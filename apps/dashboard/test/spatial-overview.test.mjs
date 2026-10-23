import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileSource, sourceUrl, overviewFixture, fakeClient, runtimeRewrite } from './overview-fixture.mjs';

const display = sourceUrl(new URL('../src/lib/overviewDisplay.ts', import.meta.url));
const { spatialOverview } = await compileSource(new URL('../src/lib/spatialOverview.ts', import.meta.url), [['./overviewDisplay', display]]);
const { fetchOverview } = await compileSource(new URL('../src/api/overview.ts', import.meta.url), runtimeRewrite);
const data = await fetchOverview(fakeClient(overviewFixture()), new AbortController().signal);
const now = Date.parse(data.frame.simulated_at);

test('floor adapter preserves exact snapshot identity, authoritative occupancy and configured node positions', () => {
  const before = structuredClone(data), model = spatialOverview(data, now);
  assert.equal(model.runId, data.run.run_id); assert.equal(model.zoneId, data.zone.zone_id);
  assert.equal(model.zoneName, data.zone.name); assert.equal(model.sequence, data.frame.sequence);
  assert.equal(model.at, data.frame.simulated_at); assert.equal(model.occupancy.toUpperCase(), data.frame.occupancy);
  assert.deepEqual(model.nodes.map(n => [n.id,n.label,n.x,n.y]), data.zone.config.payload.required_nodes.map(n => [n.node_id,n.label,n.x,n.y]));
  assert.equal(model.nodes.length, 2); assert.deepEqual(data, before);
});
test('environment is the configured representative node, never an average or another node fallback', () => {
  const model = spatialOverview(data, now), id = data.zone.config.payload.representative_environment_node_id;
  assert.equal(model.representative.id, id);
  assert.equal(model.representative.temperature, data.samples.find(s => s.node_id === id).temperature_c);
  const changed = structuredClone(data); changed.samples = changed.samples.filter(s => s.node_id !== id);
  const missing = spatialOverview(changed, now);
  assert.equal(missing.representative.temperature, null); assert.equal(missing.representative.humidity, null);
  assert.equal(missing.representative.classification, 'Unavailable'); assert.equal(missing.representative.freshness, 'Missing');
  assert.equal(missing.nodes.find(n => n.id !== id).temperature, model.nodes.find(n => n.id !== id).temperature);
});
test('invalid evidence suppresses the corresponding metric independently of a numeric sample', () => {
  const changed = structuredClone(data), node = changed.samples[0];
  const evidence = changed.evidence.find(e => e.event_id === node.evidence_event_id);
  evidence.payload.temperature_c = { ...evidence.payload.temperature_c, value: null, validity: 'INVALID' };
  evidence.payload.classification = { ...evidence.payload.classification, value: null, validity: 'UNAVAILABLE' };
  const result = spatialOverview(changed, now).nodes.find(n => n.id === node.node_id);
  assert.equal(result.temperature, null); assert.equal(result.humidity, node.humidity_percent);
  assert.equal(result.classification, 'Unavailable'); assert.equal(result.evidenceValid, false); assert.equal(result.freshAndValid, false);
});
test('stale/disconnected and clock mismatch retain attributed last values, never fresh status or fused occupancy', () => {
  for (const [age, label] of [[data.zone.config.payload.freshness.stale_after_ms + 1,'Stale'],[data.zone.config.payload.freshness.disconnected_after_ms + 1,'Disconnected'],[-data.zone.config.payload.freshness.max_clock_skew_ms - 1,'Clock mismatch']]) {
    const changed = structuredClone(data); changed.samples.forEach(s => { s.observed_at = new Date(now - age).toISOString(); });
    const model = spatialOverview(changed, now);
    assert.ok(model.nodes.every(n => n.freshness === label)); assert.equal(model.freshCount, 0);
    assert.equal(model.representative.temperature, data.samples.find(s => s.node_id === model.representative.id).temperature_c);
    assert.equal(model.occupancy.toUpperCase(), data.frame.occupancy);
  }
});
test('forecasts preserve stored window/source/quality/restart; inactive plans never appear upcoming', () => {
  const model = spatialOverview(data, now);
  assert.deepEqual(model.forecast.window, data.forecast.payload.next_use_window);
  assert.equal(model.forecast.restart, data.forecast.payload.planned_restart_at);
  assert.equal(model.forecast.source, data.forecast.payload.source); assert.equal(model.forecast.quality, data.forecast.payload.quality);
  for (const state of ['CANCELLED','UNAVAILABLE','EXPIRED']) {
    const changed = structuredClone(data);
    if (state !== 'EXPIRED') changed.forecast.payload.status = state;
    else changed.forecast.payload.expires_at = new Date(now).toISOString();
    const forecast = spatialOverview(changed, now).forecast;
    assert.equal(forecast.status,state); assert.equal(forecast.window,null); assert.equal(forecast.restart,null);
  }
  const absent = structuredClone(data); absent.forecast.payload.next_use_window = null; absent.forecast.payload.planned_restart_at = null;
  assert.equal(spatialOverview(absent, now).forecast.restart, null); assert.equal(spatialOverview(absent, now).forecast.window, null);
});
test('all four requested modes remain distinct from applied, accepted, rejected or failed reports', () => {
  for (const [mode,label] of Object.entries({OCCUPIED:'Normal cooling',SHORT_VACANCY:'Reduced cooling',LONG_VACANCY:'Standby',PRECOOL:'Pre-cooling'})) {
    for (const status of ['APPLIED','ACCEPTED','REJECTED','FAILED']) {
      const changed = structuredClone(data); changed.decision.payload.requested_mode = mode;
      changed.output.payload.status = status; changed.output.payload.reported_output = null;
      const result = spatialOverview(changed, now);
      assert.equal(result.requestedMode,label); assert.equal(result.outputStatus,status); assert.equal(result.reportedOutput,'Not reported');
      assert.equal(result.decisionId, data.decision.event_id); assert.equal(result.commandId, data.decision.payload.command_id); assert.equal(result.outputId, data.output.event_id);
    }
  }
});
test('spatial runtime has no prototype fixture or direct data-client dependency', () => {
  const files = ['../src/pages/SpatialDashboard.tsx','../src/components/spatial/FloorPlan.tsx','../src/lib/spatialOverview.ts'];
  const source = files.map(path => readFileSync(new URL(path,import.meta.url),'utf8')).join('\n');
  assert.doesNotMatch(source,/fixtures|window\.OMNI|from ["'][^"']*(?:supabase|api\/)/);
});
