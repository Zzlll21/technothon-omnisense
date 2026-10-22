import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHardwareTelemetry } from '../dist/hardwareTelemetry.js';
import { evaluateHardwareCooling } from '../dist/hybridOffline.js';
import { coolingPolicy, scriptedState } from '../dist/model.js';

// Sanitized, constructed packets matching the supplied firmware; no credentials or captured building data.
const topic = 'omnisense/node/demo-1/telemetry';
const noon = Date.parse('2026-10-20T12:00:00+08:00');
const iso = ms => new Date(ms).toISOString();
const config = { required_node_ids: ['demo-1'], full_zone_coverage: true, stale_after_ms: 90_000, disconnected_after_ms: 180_000 };
function packet(count = 0, overrides = {}, metadata = {}) {
  return {
    node_id: 'demo-1', temperature: 25.4, humidity: 62, headcount: count, pmv: 0.2,
    ppd: 5.1, comfortStatus: 'comfortable', comfortMode: 'comfortable', alertLevel: 'comfortable', crisis_mode: false,
    hvac_state: { mode: 'cool', fan: count ? 'low' : 'off', fan_pwm: count ? 90 : 0, setpoint: 24 },
    ...overrides,
    raw_sensor_summary: { pir_motion: true, system_active: true, bme_valid: true, headcount_source: 'thermal_ai',
      thermal_ai_label: ['EMPTY_CORE', 'OCCUPIED_1P', 'OCCUPIED_2P', 'OCCUPIED_3P_PLUS'][count], thermal_ai_confidence: 0.92, ...metadata }
  };
}
function normalize(payload = packet(), at = noon, context = {}) {
  return normalizeHardwareTelemetry(topic, JSON.stringify(payload), { received_at: iso(at), allowed_node_ids: ['demo-1'], ...context });
}
function reading(count = 0, at = noon, overrides = {}, metadata = {}) {
  const result = normalize(packet(count, overrides, metadata), at);
  assert.equal(result.ok, true);
  return result.value;
}
function evaluate(count, at, previous = null, metadata = {}, cfg = config) {
  return evaluateHardwareCooling(iso(at), [reading(count, at, {}, metadata)], cfg, previous);
}

test('normalizes existing firmware payload and independently preserves BME280 and TinyML metadata', () => {
  const r = reading(2);
  assert.equal(r.schema_version, 'omnisense.hardware.v1');
  assert.equal(r.time_basis, 'GATEWAY_RECEIPT');
  assert.equal(r.occupancy.value, 'OCCUPIED');
  assert.equal(r.occupancy.method, 'TINYML');
  assert.equal(r.occupancy.class_label, 'OCCUPIED_2P');
  assert.equal(r.occupancy.class_scores, null);
  assert.equal(r.metadata.thermal_ai_confidence, 0.92);
  assert.equal(r.temperature_c.value, 25.4);
  assert.equal(r.temperature_c.source_id, 'demo-1/bme280');
  assert.equal(r.humidity_percent.value, 62);
});

test('all four active TinyML headcount categories map without fabricated score vectors', () => {
  for (let count = 0; count <= 3; count++) {
    const r = reading(count);
    assert.equal(r.occupancy.value, count ? 'OCCUPIED' : 'VACANT');
    assert.equal(r.occupancy.validity, 'VALID');
    assert.equal(r.occupancy.class_scores, null);
    assert.equal(r.headcount, count);
  }
});

test('N/A, null and missing environment remain unavailable while valid occupancy is retained', () => {
  for (const missing of ['N/A', null, undefined]) {
    const r = reading(1, noon, { temperature: missing });
    assert.equal(r.temperature_c.value, null);
    assert.equal(r.temperature_c.validity, 'UNAVAILABLE');
    assert.equal(r.humidity_percent.value, 62);
    assert.equal(r.occupancy.value, 'OCCUPIED');
  }
  const r = reading(1, noon, { humidity: 'N/A', pmv: 'N/A' });
  assert.equal(r.humidity_percent.value, null);
  assert.equal(r.temperature_c.value, 25.4);
});

test('invalid environmental values cannot become numbers or corrupt independent occupancy', () => {
  for (const value of ['25.4', 'garbage', 100, -41, {}]) {
    const r = reading(1, noon, { temperature: value });
    assert.equal(r.temperature_c.validity, 'INVALID');
    assert.equal(r.temperature_c.value, null);
    assert.equal(r.occupancy.value, 'OCCUPIED');
  }
  assert.equal(reading(1, noon, { humidity: 101 }).humidity_percent.validity, 'INVALID');
  assert.equal(reading(1, noon, {}, { bme_valid: false }).temperature_c.validity, 'UNAVAILABLE');
});

test('PIR inactive firmware zero is uncertain, never verified vacancy', () => {
  const r = reading(0, noon, { temperature: 'N/A', humidity: 'N/A', pmv: 'N/A' },
    { system_active: false, pir_motion: false, bme_valid: false, headcount_source: 'none', thermal_ai_label: 'not_run', thermal_ai_confidence: 0 });
  assert.equal(r.occupancy.value, 'UNCERTAIN');
  assert.equal(r.temperature_c.validity, 'UNAVAILABLE');
  const result = evaluateHardwareCooling(iso(noon), [r], config);
  assert.equal(result.requested_mode, 'OCCUPIED');
  assert.equal(result.checkpoint.vacant_since, null);
});

test('thermal unavailability and missing metadata never certify zero as vacant', () => {
  for (const source of ['thermal_unavailable', 'none', 'unknown']) {
    assert.equal(reading(0, noon, {}, { headcount_source: source }).occupancy.value, 'UNCERTAIN');
  }
  const p = packet(0);
  delete p.raw_sensor_summary;
  const r = normalize(p).value;
  assert.equal(r.occupancy.value, 'UNCERTAIN');
  assert.equal(r.temperature_c.validity, 'UNAVAILABLE');
});

test('fallback evidence retains original model metadata but does not masquerade as accepted TinyML', () => {
  const r = reading(2, noon, {}, { headcount_source: 'thermal_blob_fallback', thermal_ai_label: 'THERMAL_ANOMALIES', thermal_ai_confidence: 0.31 });
  assert.equal(r.occupancy.method, 'THERMAL_BLOB_FALLBACK');
  assert.equal(r.occupancy.value, 'OCCUPIED');
  assert.equal(r.metadata.thermal_ai_label, 'THERMAL_ANOMALIES');
  assert.equal(r.metadata.thermal_ai_confidence, 0.31);
  assert.equal(reading(0, noon, {}, { headcount_source: 'thermal_blob_fallback' }).occupancy.value, 'UNCERTAIN');
});

test('contradictory TinyML headcount/label or confidence stays invalid', () => {
  for (const metadata of [{ thermal_ai_label: 'EMPTY_CORE' }, { thermal_ai_label: 'THERMAL_ANOMALIES' }, { thermal_ai_confidence: 0 }]) {
    const r = reading(1, noon, {}, metadata);
    assert.equal(r.occupancy.value, 'UNCERTAIN');
    assert.equal(r.occupancy.validity, 'INVALID');
  }
});

test('rejects malformed JSON, identity conflicts, unknown nodes, retained messages and invalid metadata', () => {
  const context = { received_at: iso(noon), allowed_node_ids: ['demo-1'] };
  for (const text of ['{', 'null', '[]', '1', 'x'.repeat(4097)]) assert.equal(normalizeHardwareTelemetry(topic, text, context).ok, false);
  for (const count of [-1, 4, 1.2, '1', null]) assert.equal(normalize(packet(count)).ok, false);
  for (const metadata of [{ system_active: 'false' }, { bme_valid: 1 }, { thermal_ai_confidence: 2 }, { headcount_source: {} }]) assert.equal(normalize(packet(1, {}, metadata)).ok, false);
  assert.equal(normalize(packet(1, { node_id: 'other' })).ok, false);
  assert.equal(normalize(packet(), noon, { retained: true }).ok, false);
  assert.equal(normalize(packet(), noon, { allowed_node_ids: ['other'] }).ok, false);
  assert.equal(normalize(packet(), noon, { received_at: 'yesterday' }).ok, false);
  assert.equal(normalizeHardwareTelemetry('omnisense/node/demo-1/command', '{}', context).ok, false);
});

test('identical timetable conditions produce different cooling requests solely from hardware occupancy', () => {
  let empty = null, occupied = null;
  for (let offset = 0; offset <= 20 * 60_000; offset += 30_000) {
    empty = evaluate(0, noon + offset, empty?.checkpoint);
    occupied = evaluate(1, noon + offset, occupied?.checkpoint);
    assert.deepEqual(empty.forecast, occupied.forecast);
  }
  assert.equal(empty.requested_mode, 'LONG_VACANCY');
  assert.deepEqual(empty.requested_output, { fan: 'OFF', setpoint_c: null });
  assert.equal(occupied.requested_mode, 'OCCUPIED');
  assert.deepEqual(occupied.requested_output, { fan: 'AUTO', setpoint_c: 24.5 });
  assert.equal(empty.output.feedback_basis, 'SIMULATED');
  assert.deepEqual(empty.output.reported_output, empty.requested_output);
});

test('hardware occupancy overrides a currently occupied timetable', () => {
  const start = Date.parse('2026-10-20T09:00:00+08:00');
  let empty;
  for (let offset = 0; offset <= 5 * 60_000; offset += 30_000) empty = evaluate(0, start + offset, empty?.checkpoint);
  assert.equal(scriptedState(start + 300_000).mode, 'OCCUPIED');
  assert.equal(empty.requested_mode, 'SHORT_VACANCY');
});

test('all four cooling modes, confirmation and occupied return use the original settings', () => {
  let current;
  const modes = new Set();
  for (let offset = 0; offset <= 50 * 60_000; offset += 30_000) {
    current = evaluate(0, noon + offset, current?.checkpoint);
    modes.add(current.requested_mode);
    if (offset === 4.5 * 60_000) assert.equal(current.vacancy_confirmed_at, null);
    if (offset === 5 * 60_000) {
      assert.equal(current.requested_mode, 'SHORT_VACANCY');
      assert.deepEqual(current.requested_output, { fan: 'LOW', setpoint_c: 27 });
      assert.equal(current.vacancy_confirmed_at, iso(noon + 5 * 60_000));
    }
  }
  assert.deepEqual([...modes], ['OCCUPIED', 'SHORT_VACANCY', 'LONG_VACANCY', 'PRECOOL']);
  assert.deepEqual(current.requested_output, { fan: 'HIGH', setpoint_c: 24.5 });
  const returned = evaluate(3, noon + 50.5 * 60_000, current.checkpoint);
  assert.equal(returned.requested_mode, 'OCCUPIED');
  assert.equal(returned.checkpoint.vacant_since, null);
});

test('loss, inactivity and uncertain evidence reset previously confirmed vacancy', () => {
  let vacant;
  for (let offset = 0; offset <= 20 * 60_000; offset += 30_000) vacant = evaluate(0, noon + offset, vacant?.checkpoint);
  for (const evidence of [[], [reading(0, noon + 20.5 * 60_000, {}, { system_active: false })], [reading(0, noon + 20.5 * 60_000, {}, { headcount_source: 'thermal_unavailable' })]]) {
    const result = evaluateHardwareCooling(iso(noon + 20.5 * 60_000), evidence, config, vacant.checkpoint);
    assert.equal(result.occupancy, 'UNCERTAIN');
    assert.equal(result.requested_mode, 'OCCUPIED');
    assert.equal(result.vacancy_confirmed_at, null);
  }
});

test('cached duplicate readings age from original receipt rather than evaluation or arrival refresh', () => {
  const r = reading(0);
  let first = evaluateHardwareCooling(iso(noon), [r], config);
  const stale = evaluateHardwareCooling(iso(noon + 90_000), [r], config, first.checkpoint);
  assert.equal(stale.nodes[0].state, 'STALE');
  assert.equal(stale.requested_mode, 'OCCUPIED');
  const disconnected = evaluateHardwareCooling(iso(noon + 180_000), [r], config, stale.checkpoint);
  assert.equal(disconnected.nodes[0].state, 'DISCONNECTED');
});

test('partial footprint or missing required node prevents vacancy; positive evidence still means occupied', () => {
  const partial = evaluate(0, noon, null, {}, { ...config, full_zone_coverage: false });
  assert.equal(partial.occupancy, 'UNCERTAIN');
  const required = { ...config, required_node_ids: ['demo-1', 'another-confirmed-device'] };
  assert.equal(evaluate(0, noon, null, {}, required).occupancy, 'UNCERTAIN');
  const occupied = evaluate(1, noon, null, {}, required);
  assert.equal(occupied.occupancy, 'OCCUPIED');
  assert.equal(occupied.coverage, 'DEGRADED');
});

test('restart/checkpoint serialization is deterministic, and long evaluation gaps reset continuity', () => {
  const first = evaluate(0, noon);
  assert.deepEqual(evaluate(0, noon + 30_000, first.checkpoint), evaluate(0, noon + 30_000, JSON.parse(JSON.stringify(first.checkpoint))));
  const afterGap = evaluate(0, noon + 20 * 60_000, first.checkpoint);
  assert.equal(afterGap.checkpoint.vacant_since, iso(noon + 20 * 60_000));
  assert.equal(afterGap.requested_mode, 'OCCUPIED');
  const changed = evaluate(0, noon + 30_000, first.checkpoint, {}, { ...config, full_zone_coverage: false });
  assert.equal(changed.checkpoint.vacant_since, null);
});

test('future readings, duplicate node inputs, out-of-order receipts and invalid configuration fail closed', () => {
  const first = evaluate(0, noon);
  assert.throws(() => evaluateHardwareCooling(iso(noon), [reading(0, noon + 1000)], config));
  assert.throws(() => evaluateHardwareCooling(iso(noon), [reading(), reading()], config));
  assert.throws(() => evaluateHardwareCooling(iso(noon + 30_000), [reading(0, noon - 1000)], config, first.checkpoint));
  assert.throws(() => evaluateHardwareCooling(iso(noon), [], config, first.checkpoint));
  assert.throws(() => evaluate(0, noon, null, {}, { ...config, stale_after_ms: -1 }));
  assert.throws(() => evaluate(0, noon, null, {}, { ...config, required_node_ids: ['demo-1', 'demo-1'] }));
  assert.throws(() => coolingPolicy(noon, 'VACANT', noon + 1, null));
});

test('a lapse in observation freshness between evaluations resets vacancy even when both end readings are fresh', () => {
  const first = evaluateHardwareCooling(iso(noon), [reading(0, noon - 60_000)], config);
  // Previous receipt expires at noon+30s; next receipt is noon+60s.
  // Evaluation spacing alone (60s < 90s TTL) must not imply continuous evidence.
  const next = evaluateHardwareCooling(iso(noon + 60_000), [reading(0, noon + 60_000)], config, first.checkpoint);
  assert.equal(next.checkpoint.vacant_since, iso(noon + 60_000));
  assert.equal(next.requested_mode, 'OCCUPIED');
});
