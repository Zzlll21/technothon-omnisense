import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, generateTick, scriptedState, nextTimestamp, STEP_MS, HISTORY_MS } from '../dist/model.js';
import { parseSdpEvents } from '../../../packages/sdp-contract/dist/index.js';

const run = createRun('11111111-1111-4111-8111-111111111111', '2026-10-21T00:00:00.000Z', 42);
function history() {
  const ticks = [];
  let checkpoint = null;
  while (!checkpoint || checkpoint.simulated_at < run.live_anchor) {
    const tick = generateTick(run, checkpoint);
    ticks.push(tick);
    checkpoint = tick.checkpoint;
  }
  return ticks;
}
const ticks = history();
const events = ticks.flatMap(t => t.events);
const byId = new Map(events.map(e => [e.event_id, e]));
const local = hhmm => Date.parse(`2026-10-20T${hhmm}:00.000+08:00`);

test('exactly seven days, 2017 five-minute frames and two samples per frame', () => {
  assert.equal(ticks.length, 2017);
  assert.equal(Date.parse(ticks.at(-1).frame.simulated_at) - Date.parse(ticks[0].frame.simulated_at), HISTORY_MS);
  ticks.forEach((t, i) => {
    assert.equal(t.frame.sequence, i);
    assert.equal(t.expected_sequence, i - 1);
    assert.deepEqual(t.samples.map(s => s.node_id), ['sim-1', 'sim-2']);
    if (i) assert.equal(Date.parse(t.frame.simulated_at) - Date.parse(ticks[i - 1].frame.simulated_at), 300_000);
  });
});
test('every event passes the unchanged shared contract and remains simulated replay', () => {
  assert.equal(parseSdpEvents(events).length, events.length);
  for (const e of events) {
    assert.deepEqual(e.data_sources, ['SIMULATED']);
    assert.deepEqual(e.clock, { time_base: 'REPLAY', replay_id: run.run_id });
    assert.equal(e.session_id, run.run_id);
    assert.equal(e.zone_id, 'zone-1');
  }
});
test('node classifications and controller occupancy reflect the same population', () => {
  for (const t of ticks) {
    const nodeEvents = t.events.filter(e => e.event_type === 'NODE_EVIDENCE');
    const occupied = nodeEvents.some(e => e.payload.classification.value.class_label !== 'EMPTY_CORE');
    assert.equal(t.frame.occupancy, occupied ? 'OCCUPIED' : 'VACANT');
    assert.equal(t.checkpoint.decision.payload.occupancy, t.frame.occupancy);
    assert.equal(t.checkpoint.decision.payload.coverage, 'COMPLETE');
  }
});
test('scripted confirmation, short and long vacancy, and occupied return', () => {
  assert.equal(scriptedState(local('10:00')).mode, 'OCCUPIED');
  assert.equal(scriptedState(local('10:05')).mode, 'SHORT_VACANCY');
  assert.equal(scriptedState(local('10:15')).mode, 'OCCUPIED');
  assert.equal(scriptedState(local('12:05')).mode, 'SHORT_VACANCY');
  assert.equal(scriptedState(local('12:20')).mode, 'LONG_VACANCY');
  assert.equal(scriptedState(local('12:49')).mode, 'LONG_VACANCY');
  assert.equal(scriptedState(local('13:00')).mode, 'OCCUPIED');
});
test('precooling starts ten minutes before a scripted return and refers to its forecast', () => {
  assert.equal(scriptedState(local('12:50')).mode, 'PRECOOL');
  const t = ticks.find(t => Date.parse(t.frame.simulated_at) === local('12:50'));
  assert.equal(t.checkpoint.decision.payload.requested_mode, 'PRECOOL');
  assert.equal(t.checkpoint.forecast.payload.planned_restart_at, t.frame.simulated_at);
  assert.equal(t.checkpoint.forecast.payload.next_use_window.start, new Date(local('13:00')).toISOString());
  assert.equal(t.checkpoint.decision.payload.forecast_event_id, t.checkpoint.forecast.event_id);
  for (const e of events.filter(e => e.event_type === 'ZONE_FORECAST')) {
    const restart = Date.parse(e.payload.planned_restart_at);
    const start = Date.parse(e.payload.next_use_window.start);
    assert.equal(scriptedState(restart).mode, restart < start ? 'PRECOOL' : 'OCCUPIED');
  }
});
test('environment is bounded, spatially coherent and gradual at both cadences', () => {
  for (let i = 0; i < ticks.length; i++) {
    const t = ticks[i];
    assert.ok(t.samples.every(s => s.temperature_c >= 23 && s.temperature_c <= 30 && s.humidity_percent >= 50 && s.humidity_percent <= 70));
    assert.ok(Math.abs(t.samples[0].temperature_c - t.samples[1].temperature_c) < 0.31);
    if (i) {
      assert.ok(Math.abs(t.checkpoint.temperature_c - ticks[i - 1].checkpoint.temperature_c) < 0.7);
      assert.ok(Math.abs(t.checkpoint.humidity_percent - ticks[i - 1].checkpoint.humidity_percent) < 1.1);
    }
  }
  let cp = ticks.at(-1).checkpoint;
  for (let i = 0; i < 2880; i++) {
    const t = generateTick(run, cp);
    assert.ok(Math.abs(t.checkpoint.temperature_c - cp.temperature_c) < 0.08);
    assert.ok(Math.abs(t.checkpoint.humidity_percent - cp.humidity_percent) < 0.08);
    cp = t.checkpoint;
  }
});
test('all frame/sample/event timestamps and causal references are consistent', () => {
  for (const t of ticks) {
    assert.equal(t.checkpoint.simulated_at, t.frame.simulated_at);
    for (const e of t.events) assert.equal(e.occurred_at, t.frame.simulated_at);
    for (const s of t.samples) {
      assert.equal(s.observed_at, t.frame.simulated_at);
      const evidence = byId.get(s.evidence_event_id);
      assert.equal(evidence.payload.temperature_c.value, s.temperature_c);
      assert.equal(evidence.payload.humidity_percent.value, s.humidity_percent);
    }
    const { decision, output, forecast } = t.checkpoint;
    assert.equal(output.payload.decision_event_id, decision.event_id);
    assert.equal(output.payload.command_id, decision.payload.command_id);
    assert.deepEqual(output.payload.reported_output, decision.payload.requested_output);
    assert.equal(output.payload.feedback_basis, 'SIMULATED');
    assert.equal(decision.correlation_id, output.correlation_id);
    assert.equal(decision.payload.forecast_event_id, forecast.event_id);
    for (const n of decision.payload.node_states) assert.equal(byId.get(n.evidence_event_id).payload.node_id, n.node_id);
    assert.ok(Date.parse(forecast.payload.expires_at) > Date.parse(t.frame.simulated_at));
  }
});
test('checkpoint serialization gives byte-equivalent continuation and stable IDs', () => {
  for (const index of [0, 477, 1201, 2015]) {
    const restoredRun = JSON.parse(JSON.stringify(run));
    const restored = JSON.parse(JSON.stringify(ticks[index].checkpoint));
    assert.deepEqual(generateTick(restoredRun, restored), ticks[index + 1]);
  }
  const live = generateTick(run, ticks.at(-1).checkpoint);
  assert.equal(Date.parse(live.frame.simulated_at) - Date.parse(run.live_anchor), STEP_MS);
  assert.equal(live.frame.phase, 'CONTINUOUS');
  assert.deepEqual(generateTick(run, structuredClone(ticks.at(-1).checkpoint)), live);
});
test('fixed-step integration agrees across five-minute and thirty-second sampling', () => {
  const cp = ticks.at(-1).checkpoint;
  const longCadenceRun = { ...run, live_anchor: new Date(Date.parse(run.live_anchor) + 300_000).toISOString() };
  const coarse = generateTick(longCadenceRun, cp).checkpoint;
  let fine = cp;
  for (let i = 0; i < 10; i++) fine = generateTick(run, fine).checkpoint;
  assert.equal(fine.temperature_c, coarse.temperature_c);
  assert.equal(fine.humidity_percent, coarse.humidity_percent);
});
test('invalid run inputs and incompatible versions fail before generation', () => {
  assert.throws(() => createRun('not-uuid', run.live_anchor));
  assert.throws(() => createRun(run.run_id, '2026-10-21T00:00:01Z'));
  assert.throws(() => createRun(run.run_id, '2026-10-21T08:00:00+08:00'));
  assert.equal(createRun('AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA', run.live_anchor).run_id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  assert.throws(() => createRun(run.run_id, run.live_anchor, NaN));
  assert.throws(() => generateTick({ ...run, model_version: 'other' }, null));
  assert.equal(nextTimestamp(run, null), run.history_start);
});
