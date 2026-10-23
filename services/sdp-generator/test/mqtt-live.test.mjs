import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHardwareMonitor, attachMqttMonitor } from '../hardware-monitor.mjs';
import { argumentsFor, liveConfiguration, replayFixture } from '../hybrid-mqtt.mjs';

const fixtureUrl = new URL('./fixtures/firmware-replay.json', import.meta.url);
const fixture = JSON.parse(readFileSync(fixtureUrl, 'utf8'));
const config = { ...fixture.config };
const noon = Date.parse('2026-10-20T04:00:00.000Z');
const topic = 'omnisense/node/demo-1/telemetry';
const text = name => JSON.stringify(fixture.packets[name]);
function ready(cfg = config) { const monitor = createHardwareMonitor(cfg); monitor.setConnected(true); return monitor; }
function sample(monitor, name, at, flags = {}) {
  monitor.ingest(topic, text(name), flags, at);
  return monitor.evaluate(at);
}
const env = { HYBRID_MQTT_ENABLE: 'true', MQTT_BROKER_URL: 'mqtts://broker.example:8883',
  MQTT_USERNAME: 'test-username', MQTT_PASSWORD: 'test-secret-not-a-real-credential', HYBRID_NODE_IDS: 'demo-1' };

class FakeClient extends EventEmitter {
  subscriptions = [];
  callbacks = [];
  publish() { throw new Error('Publishing is forbidden in diagnostic mode'); }
  subscribe(topics, options, callback) { this.subscriptions.push({ topics, options }); this.callbacks.push(callback); }
  ack(index = this.callbacks.length - 1) {
    this.callbacks[index](null, this.subscriptions[index].topics.map(topic => ({ topic, qos: 0 })));
  }
}

test('live mode needs both an explicit invocation and enable flag; default never connects', () => {
  assert.equal(argumentsFor([]).live, false);
  assert.throws(() => liveConfiguration({ ...env, HYBRID_MQTT_ENABLE: 'false' }));
  assert.throws(() => argumentsFor(['--live', '--replay', 'file.json']));
  assert.throws(() => argumentsFor(['--seconds', '0']));
  assert.throws(() => argumentsFor(['--seconds']));
  const result = spawnSync(process.execPath, ['hybrid-mqtt.mjs'], {
    cwd: new URL('../', import.meta.url), env: { ...process.env, ...env, SDP_ENABLE_WRITES: 'true' }, encoding: 'utf8', timeout: 5000
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /disabled by default/);
  assert.doesNotMatch(result.stdout + result.stderr, /test-secret|MQTT_SUBSCRIBED|supabase/i);
});

test('TLS, exact topic identities, unique client IDs and incomplete coverage are enforced', () => {
  const first = liveConfiguration(env), second = liveConfiguration(env);
  assert.equal(first.mqttOptions.rejectUnauthorized, true);
  assert.equal(first.mqttOptions.clean, true);
  assert.equal(first.mqttOptions.protocolVersion, 4);
  assert.equal(first.mqttOptions.resubscribe, false);
  assert.notEqual(first.mqttOptions.clientId, second.mqttOptions.clientId);
  assert.equal(first.config.full_zone_coverage, false);
  assert.deepEqual(first.config.required_node_ids, ['demo-1']);
  for (const url of ['mqtt://broker.example', 'mqtts://user:pass@broker.example', 'mqtts://broker.example:1883', 'mqtts://broker.example?token=secret']) assert.throws(() => liveConfiguration({ ...env, MQTT_BROKER_URL: url }));
  for (const ids of ['', '+', '#', 'demo-1,demo-1', 'bad/id']) assert.throws(() => liveConfiguration({ ...env, HYBRID_NODE_IDS: ids }));
  assert.throws(() => liveConfiguration({ ...env, HYBRID_FULL_ZONE_COVERAGE: 'yes' }));
  assert.throws(() => liveConfiguration({ ...env, HYBRID_STALE_AFTER_MS: '0' }));
});

test('firmware-compatible replay is labelled REPLAY and preserves measurement/source metadata', async () => {
  const lines = [];
  await replayFixture(fixtureUrl, line => lines.push(JSON.parse(line)));
  assert.equal(lines.length, fixture.steps.length);
  assert.ok(lines.every(line => line.mode === 'REPLAY'));
  const occupied = lines[1];
  assert.equal(occupied.zone.occupancy, 'OCCUPIED');
  assert.equal(occupied.nodes[0].source, 'thermal_ai');
  assert.equal(occupied.nodes[0].ai_label, 'OCCUPIED_1P');
  assert.equal(occupied.nodes[0].ai_confidence, 0.92);
  assert.equal(occupied.nodes[0].temperature_c.value, 25.4);
  assert.equal(occupied.nodes[0].humidity_percent.value, 62);
  assert.equal(occupied.nodes[0].received_at, fixture.steps[1].at);
  assert.equal(lines[2].nodes[0].class_label, 'EMPTY_CORE');
  assert.equal(lines[2].zone.occupancy, 'UNCERTAIN'); // one unvalidated footprint
  assert.equal(lines[6].nodes[0].source, 'thermal_blob_fallback');
  assert.equal(lines[6].nodes[0].ai_label, 'THERMAL_ANOMALIES');
});

test('PIR inactivity, thermal unavailability and missing metadata never mean confirmed vacancy', () => {
  const monitor = ready({ ...config, full_zone_coverage: true });
  for (const [index, name] of ['inactive', 'thermal_unavailable', 'missing_metadata'].entries()) {
    const diagnostic = sample(monitor, name, noon + index * 1000);
    assert.equal(diagnostic.zone.occupancy, 'UNCERTAIN');
    assert.equal(diagnostic.zone.requested_mode, 'OCCUPIED');
    assert.equal(diagnostic.zone.vacancy_confirmed_at, null);
  }
});

test('valid empty observations require configured complete coverage before zone vacancy', () => {
  assert.equal(sample(ready(), 'empty', noon).zone.occupancy, 'UNCERTAIN');
  assert.equal(sample(ready({ ...config, full_zone_coverage: true }), 'empty', noon).zone.occupancy, 'VACANT');
  const twoNodes = ready({ ...config, required_node_ids: ['demo-1', 'second-physical-node'], full_zone_coverage: true });
  const diagnostic = sample(twoNodes, 'empty', noon);
  assert.equal(diagnostic.zone.occupancy, 'UNCERTAIN');
  assert.equal(diagnostic.nodes[1].freshness, 'MISSING');
});

test('BME280 unavailable values remain null without suppressing positive occupancy evidence', () => {
  const diagnostic = sample(ready(), 'bme_unavailable', noon);
  assert.equal(diagnostic.zone.occupancy, 'OCCUPIED');
  assert.equal(diagnostic.nodes[0].temperature_c.value, null);
  assert.equal(diagnostic.nodes[0].temperature_c.validity, 'UNAVAILABLE');
  assert.equal(diagnostic.nodes[0].humidity_percent.value, null);
});

test('periodic evaluations age original receipts through stale and disconnected without refresh', () => {
  const monitor = ready();
  sample(monitor, 'occupied', noon);
  const stale = monitor.evaluate(noon + 90_000);
  assert.equal(stale.nodes[0].freshness, 'STALE');
  assert.equal(stale.nodes[0].age_ms, 90_000);
  assert.equal(stale.nodes[0].received_at, new Date(noon).toISOString());
  assert.equal(stale.zone.occupancy, 'UNCERTAIN');
  assert.equal(monitor.evaluate(noon + 180_000).nodes[0].freshness, 'DISCONNECTED');
});

test('duplicate flags, retained data and rejected payloads invalidate prior empty evidence', () => {
  for (const flags of [{ dup: true }, { retain: true }]) {
    const monitor = ready({ ...config, full_zone_coverage: true });
    sample(monitor, 'empty', noon);
    const rejected = sample(monitor, 'empty', noon + 1000, flags);
    assert.equal(rejected.zone.occupancy, 'UNCERTAIN');
    assert.equal(rejected.nodes[0].received_at, new Date(noon).toISOString());
    assert.equal(rejected.counters.accepted, 1);
    assert.equal(rejected.counters.rejected, 1);
  }
  const monitor = ready({ ...config, full_zone_coverage: true });
  sample(monitor, 'empty', noon);
  monitor.ingest(topic, '{bad json', {}, noon + 1000);
  assert.equal(monitor.evaluate(noon + 1000).zone.occupancy, 'UNCERTAIN');
});

test('identical unflagged QoS0 payloads are accepted as possible new observations without invented IDs', () => {
  const monitor = ready();
  sample(monitor, 'occupied', noon);
  const next = sample(monitor, 'occupied', noon + 1000);
  assert.equal(next.counters.accepted, 2);
  assert.equal(next.nodes[0].received_at, new Date(noon + 1000).toISOString());
  assert.equal(next.time_basis, 'GATEWAY_RECEIPT');
  assert.equal(Object.hasOwn(next.nodes[0], 'device_sequence'), false);
});

test('transport gap requires new packets and resets previously confirmed vacancy', () => {
  const monitor = ready({ ...config, full_zone_coverage: true });
  let diagnostic;
  for (let elapsed = 0; elapsed <= 300_000; elapsed += 30_000) diagnostic = sample(monitor, 'empty', noon + elapsed);
  assert.equal(diagnostic.zone.requested_mode, 'SHORT_VACANCY');
  monitor.setConnected(false);
  assert.equal(monitor.evaluate(noon + 301_000).zone.occupancy, 'UNCERTAIN');
  monitor.setConnected(true);
  const beforeNewPacket = monitor.evaluate(noon + 302_000);
  assert.equal(beforeNewPacket.nodes[0].current_session_evidence, false);
  assert.equal(beforeNewPacket.zone.occupancy, 'UNCERTAIN');
  const after = sample(monitor, 'empty', noon + 303_000);
  assert.equal(after.zone.requested_mode, 'OCCUPIED');
  assert.equal(after.zone.vacancy_confirmed_at, null);
});

test('same forecasts with occupied versus empty MQTT input yield different cooling requests', () => {
  const occupied = ready({ ...config, full_zone_coverage: true });
  const empty = ready({ ...config, full_zone_coverage: true });
  let a, b;
  for (let elapsed = 0; elapsed <= 1_200_000; elapsed += 30_000) {
    a = sample(occupied, 'occupied', noon + elapsed);
    b = sample(empty, 'empty', noon + elapsed);
    assert.deepEqual(a.forecast, b.forecast);
  }
  assert.equal(a.zone.requested_mode, 'OCCUPIED');
  assert.equal(b.zone.requested_mode, 'LONG_VACANCY');
  assert.equal(a.zone.feedback_basis, 'SIMULATED');
  assert.equal(sample(empty, 'occupied', noon + 1_201_000).zone.requested_mode, 'OCCUPIED');
});

test('clock regression and same-millisecond packets never fabricate source/evaluation timestamps', () => {
  const monitor = ready();
  sample(monitor, 'occupied', noon);
  assert.equal(monitor.evaluate(noon), null);
  assert.equal(monitor.ingest(topic, text('empty'), {}, noon - 1), false);
  assert.equal(monitor.evaluate(noon - 1), null);
  assert.equal(monitor.evaluate(noon + 1).zone.occupancy, 'UNCERTAIN');
});

test('MQTT transport waits for SUBACK, subscribes only allowed telemetry, and reconnects conservatively', () => {
  const client = new FakeClient(), monitor = createHardwareMonitor(config);
  let now = noon;
  const status = [];
  const detach = attachMqttMonitor(client, monitor, ['demo-1'], () => now, s => status.push(s));
  client.emit('connect');
  assert.deepEqual(client.subscriptions[0], { topics: [topic], options: { qos: 0 } });
  client.emit('message', topic, Buffer.from(text('occupied')), {});
  assert.equal(monitor.evaluate(now + 1).zone.occupancy, 'UNCERTAIN');
  client.ack();
  now += 2;
  client.emit('message', topic, Buffer.from(text('occupied')), {});
  assert.equal(monitor.evaluate(now + 1).zone.occupancy, 'OCCUPIED');
  client.emit('offline');
  now += 2;
  assert.equal(monitor.evaluate(now).zone.occupancy, 'UNCERTAIN');
  client.emit('connect');
  client.ack();
  now++;
  assert.equal(monitor.evaluate(now).zone.occupancy, 'UNCERTAIN');
  now++;
  client.emit('message', topic, Buffer.from(text('occupied')), {});
  assert.equal(monitor.evaluate(now + 1).zone.occupancy, 'OCCUPIED');
  assert.ok(status.includes('MQTT_SUBSCRIBED'));
  detach();
  assert.equal(client.listenerCount('message'), 0);
});

test('late SUBACK, subscription denial and raw transport errors cannot restore stale evidence or leak secrets', () => {
  const client = new FakeClient(), monitor = createHardwareMonitor(config), messages = [];
  const detach = attachMqttMonitor(client, monitor, ['demo-1'], () => noon, s => messages.push(s));
  client.emit('connect');
  client.emit('close');
  client.ack(0);
  assert.equal(monitor.evaluate(noon).transport, 'DISCONNECTED');
  client.emit('connect');
  client.callbacks[1](null, [{ topic, qos: 128 }]);
  client.emit('error', new Error('mqtt-password wifi-password sb_secret_do_not_log'));
  assert.equal(messages.at(-1), 'MQTT_ERROR');
  assert.doesNotMatch(messages.join(' '), /password|sb_secret/);
  detach();
});

test('diagnostics expose only safe metadata tokens and never arbitrary payload/error content', () => {
  const monitor = ready();
  const payload = structuredClone(fixture.packets.occupied);
  payload.password = 'wifi-secret';
  payload.raw_sensor_summary.headcount_source = 'sb_secret_hidden';
  payload.raw_sensor_summary.thermal_ai_label = 'mqtt-password';
  monitor.ingest(topic, JSON.stringify(payload), {}, noon);
  const line = JSON.stringify(monitor.evaluate(noon));
  assert.doesNotMatch(line, /wifi-secret|sb_secret_hidden|mqtt-password/);
  assert.match(line, /OTHER/);
});

test('separate runner has no persistence, firmware-command or default env-file imports', () => {
  for (const path of ['../hybrid-mqtt.mjs', '../hardware-monitor.mjs']) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /writer\.mjs|supabase|\.publish\(|dotenv|loadEnvFile|SET_CRISIS_MODE/);
  }
});

test('intermediate occupied/unavailable packets break vacancy before the next periodic tick', () => {
  for (const transient of ['occupied', 'inactive', 'thermal_unavailable']) {
    const monitor = ready({ ...config, full_zone_coverage: true });
    let last;
    for (let elapsed = 0; elapsed <= 300_000; elapsed += 30_000) last = sample(monitor, 'empty', noon + elapsed);
    assert.equal(last.zone.requested_mode, 'SHORT_VACANCY');
    monitor.ingest(topic, text(transient), {}, noon + 301_000);
    monitor.ingest(topic, text('empty'), {}, noon + 302_000);
    assert.equal(monitor.evaluate(noon + 305_000).zone.requested_mode, 'OCCUPIED');
  }
});

test('MQTT handler evaluates each incoming packet so transitions are not lost between heartbeat ticks', () => {
  const client = new FakeClient(), monitor = createHardwareMonitor(config), diagnostics = [];
  let at = noon;
  const detach = attachMqttMonitor(client, monitor, ['demo-1'], () => at, () => {}, d => diagnostics.push(d));
  client.emit('connect');
  client.ack();
  client.emit('message', topic, Buffer.from(text('occupied')), {});
  at++;
  client.emit('message', topic, Buffer.from(text('inactive')), {});
  assert.deepEqual(diagnostics.map(d => d.zone.occupancy), ['OCCUPIED', 'UNCERTAIN']);
  detach();
});
