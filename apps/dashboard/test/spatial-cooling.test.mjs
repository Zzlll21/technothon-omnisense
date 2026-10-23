import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { fakeClient, overviewFixture } from './overview-fixture.mjs';

const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
test.after(() => server.close());
const model = await server.ssrLoadModule('/src/lib/spatialCooling.ts');
const analytics = await server.ssrLoadModule('/src/lib/utilizationAnalytics.ts');
const { numericSegments } = await server.ssrLoadModule('/src/lib/nodeHistoryDisplay.ts');
const { forecastStatus } = await server.ssrLoadModule('/src/lib/predictiveDisplay.ts');
const { inspectionReducer, latestInspection } = await server.ssrLoadModule('/src/lib/inspection.ts');
const { fetchOverview } = await server.ssrLoadModule('/src/api/overview.ts');
const { fetchPredictiveHistory } = await server.ssrLoadModule('/src/api/predictiveHistory.ts');
const { fetchNodeHistory } = await server.ssrLoadModule('/src/api/nodeHistory.ts');
const { fetchUtilizationHistory } = await server.ssrLoadModule('/src/api/utilizationHistory.ts');
const { CoolingInspectionPanel, CoolingStatistics } = await server.ssrLoadModule('/src/components/spatial/UsageCooling.tsx');
const tables = overviewFixture(undefined, true), run = tables.sdp_runs[0], end = Date.parse(run.last_simulated_at);
const evidence = new Map(tables.sdp_events.map(e => [e.event_id, e.event]));
tables.sdp_node_samples = tables.sdp_node_samples.map(p => ({ ...p, evidence: { event: evidence.get(p.evidence_event_id) } }));
const scope = { runId: run.run_id, zoneId: 'zone-1', sequence: run.last_sequence, start: run.history_start, end: run.last_simulated_at };
const client = fakeClient(tables), signal = new AbortController().signal;
const history = await fetchPredictiveHistory(client, { ...scope, nodeId: 'sim-1' }, signal);
const nodes = await Promise.all(['sim-1', 'sim-2'].map(nodeId => fetchNodeHistory(client, { ...scope, nodeId }, signal)));
const utilization = await fetchUtilizationHistory(client, scope, signal);
const inspect = (at, h = history, n = nodes) => model.inspectCooling(h, n, at, run.live_anchor, end);
const labels = ['Left sensor', 'Right sensor'];
const { CoolingTimeline } = await server.ssrLoadModule('/src/components/spatial/CoolingTimeline.tsx');

test('merged timeline keeps issue-time records stable during hover and excludes later forecasts from pinned historical inspection', () => {
  const forecasts = history.events.filter(e => e.event_type === 'ZONE_FORECAST');
  assert.ok(forecasts.length > 1);
  const earlier = Date.parse(forecasts[1].occurred_at) - 1;
  const props = { history, nodes, labels, result: null, start: Date.parse(run.history_start), end,
    anchor: run.live_anchor, snapshot: end, inspection: inspect(earlier), selectedAt: earlier,
    onHover: () => {}, onPin: () => {}, onClear: () => {} };
  const hover = renderToStaticMarkup(React.createElement(CoolingTimeline, { ...props, pinned: false }));
  const pinned = renderToStaticMarkup(React.createElement(CoolingTimeline, { ...props, pinned: true }));
  for (const event of forecasts.filter(e => Date.parse(e.occurred_at) >= props.start && Date.parse(e.occurred_at) <= end)) {
    const marker = `class="su-forecast-marker" data-event-id="${event.event_id}"`;
    assert.ok(hover.includes(marker), 'hover must not remove the record click target');
    assert.equal(pinned.includes(marker), Date.parse(event.occurred_at) <= earlier, 'historical pin must respect issue time');
  }
  assert.ok(hover.includes('Room occupancy') && hover.includes('Cooling operation'));
  assert.ok(!hover.includes('Forecasts as issued</text>') && !hover.includes('Key decisions</text>') && !hover.includes('Sim. reported</text>'));
});

test('24-hour and seven-day reads align both validated temperatures with exact frame sequences and committed boundaries', async () => {
  for (const hours of [24, 168]) {
    const start = end - hours * 3600_000;
    const query = { ...scope, start: new Date(start).toISOString() };
    const h = await fetchPredictiveHistory(client, { ...query, nodeId: 'sim-1' }, signal);
    const n = await Promise.all(['sim-1', 'sim-2'].map(nodeId => fetchNodeHistory(client, { ...query, nodeId }, signal)));
    const actual = model.inspectCooling(h, n, end, run.live_anchor, end);
    assert.equal(actual.frame.sequence, scope.sequence);
    assert.deepEqual(actual.temperatures.map(t => t.value), n.map(points => points.at(-1).temperature_c));
    assert.ok(h.frames.every(f => f.sequence <= scope.sequence && Date.parse(f.simulated_at) >= start));
    assert.ok(n.every(points => points.every(p => p.sequence <= scope.sequence && Date.parse(p.observed_at) >= start)));
  }
});

test('historical as-of never imports later forecasts, decisions, temperatures or output reports', () => {
  const second = history.events.filter(e => e.event_type === 'ZONE_FORECAST')[1], at = Date.parse(second.occurred_at) - 1;
  const detail = inspect(at);
  assert.notEqual(detail.forecast?.event_id, second.event_id);
  assert.ok(!detail.forecast || Date.parse(detail.forecast.occurred_at) <= at);
  assert.ok(detail.temperatures.every(t => !t.at || Date.parse(t.at) <= at));
  assert.ok(!detail.output || Date.parse(detail.output.occurred_at) <= at);
  const future = inspect(end + 3600_000);
  assert.equal(future.frame, null); assert.equal(future.decision, null);
  assert.ok(future.temperatures.every(t => t.value === null));
});

test('missing samples and invalid evidence do not borrow the other node or a future reading; chart segments break', () => {
  const at = Date.parse(history.frames[3].simulated_at), modified = structuredClone(nodes);
  modified[0] = modified[0].filter(p => p.sequence !== 3);
  modified[1].find(p => p.sequence === 3).evidence.payload.temperature_c = { validity: 'INVALID', value: null };
  const detail = inspect(at, history, modified);
  assert.deepEqual(detail.temperatures.map(t => t.value), [null, null]);
  assert.deepEqual(detail.temperatures.map(t => t.validity), ['UNAVAILABLE', 'INVALID']);
  assert.equal(numericSegments(modified[0], run.live_anchor, 'temperature_c').length, 2);
  assert.equal(numericSegments(modified[1], run.live_anchor, 'temperature_c').length, 2);
  const html = renderToStaticMarkup(React.createElement(CoolingInspectionPanel, { inspection: detail, labels, historical: true }));
  assert.equal((html.match(/— °C/g) ?? []).length, 2);
  assert.ok(html.includes('invalid') && html.includes('No matching sample'));
});

test('output correlation requires both decision and command references, without pulling later reports backwards', () => {
  const at = Date.parse(history.frames[10].simulated_at), detail = inspect(at);
  assert.equal(detail.output.payload.decision_event_id, detail.decision.event_id);
  assert.equal(detail.output.payload.command_id, detail.decision.payload.command_id);
  const bad = structuredClone(history);
  for (const e of bad.events) if (e.event_type === 'APPLIED_OUTPUT') e.payload.command_id = 'unrelated-command';
  assert.equal(inspect(at, bad).output, null);
  const late = structuredClone(history);
  for (const e of late.events) if (e.event_type === 'APPLIED_OUTPUT') e.occurred_at = new Date(end + 1000).toISOString();
  assert.equal(inspect(at, late).output, null);
});

test('a decision between frames takes effect at its actual timestamp and is correlated to its own report', () => {
  const h = structuredClone(history), frame = h.frames[4], at = Date.parse(frame.simulated_at) + 60_000;
  const decision = structuredClone(h.events.find(e => e.event_id === frame.decision_event_id));
  decision.event_id = 'between-frames'; decision.occurred_at = new Date(at).toISOString();
  Object.assign(decision.payload, { evaluated_at: decision.occurred_at, command_id: 'between-command', requested_mode: 'LONG_VACANCY', occupancy: 'VACANT' });
  const output = structuredClone(h.events.find(e => e.event_id === frame.output_event_id));
  output.event_id = 'between-output'; output.occurred_at = new Date(at + 1000).toISOString();
  Object.assign(output.payload, { decision_event_id: decision.event_id, command_id: 'between-command' });
  h.events.push(decision, output);
  assert.notEqual(inspect(at - 1, h).decision.event_id, decision.event_id);
  assert.equal(inspect(at, h).decision.event_id, decision.event_id);
  assert.equal(inspect(at, h).output, null);
  assert.equal(inspect(at + 1000, h).output.event_id, output.event_id);
});

test('cancelled/expired forecasts are retained as inactive records, with their stored restart rather than a fixed lead', () => {
  const forecast = history.events.find(e => e.event_type === 'ZONE_FORECAST');
  assert.equal(forecastStatus(forecast, Date.parse(forecast.payload.expires_at)), 'EXPIRED');
  const h = structuredClone(history), cancelled = structuredClone(forecast);
  cancelled.event_id = 'cancelled'; cancelled.occurred_at = new Date(Date.parse(forecast.occurred_at) + 1000).toISOString(); cancelled.payload.status = 'CANCELLED'; cancelled.payload.supersedes_event_id = forecast.event_id;
  h.events.push(cancelled);
  const detail = inspect(Date.parse(cancelled.occurred_at), h);
  assert.equal(detail.forecast.event_id, 'cancelled');
  assert.equal(model.forecastHorizon(cancelled, detail.at, detail.at), detail.at);
  assert.ok(!model.issuedWindows(h, Date.parse(forecast.occurred_at) - 1, 0, end).length);
  const html = renderToStaticMarkup(React.createElement(CoolingInspectionPanel, { inspection: detail, labels, historical: true }));
  assert.ok(html.includes('cancelled') && html.includes('Stored restart · inactive'));
});

test('all four timestamp-based cooling lanes have parity with legacy utilization, including unknown gaps and subset totals', () => {
  const start = end - 24 * 3600_000;
  const result = analytics.calculateUtilization(utilization, { start, end, liveAnchor: run.live_anchor, staleAfterMs: 360_000 });
  const lanes = model.coolingLanes(result.segments);
  assert.deepEqual(new Set(lanes.modes.map(b => b.value)), new Set(['OCCUPIED', 'SHORT_VACANCY', 'LONG_VACANCY', 'PRECOOL']));
  for (const mode of analytics.modeOrder) assert.equal(lanes.modes.filter(b => b.value === mode).reduce((sum, b) => sum + b.end - b.start, 0), result.modeMs[mode]);
  assert.equal(result.reducedMs, result.modeMs.SHORT_VACANCY + result.modeMs.LONG_VACANCY);
  assert.ok(result.normalVacantMs <= result.modeMs.OCCUPIED);
  assert.equal(Object.values(result.modeMs).reduce((a, b) => a + b, 0) + result.missingMs, end - start);
  const withGap = structuredClone(utilization); withGap.frames = withGap.frames.filter(f => f.sequence !== run.last_sequence - 2);
  const gapResult = analytics.calculateUtilization(withGap, { start, end: end + 1000, liveAnchor: run.live_anchor, staleAfterMs: 360_000 });
  assert.ok(gapResult.missingMs > 1000);
  for (const gap of gapResult.segments.filter(s => s.mode === null)) assert.ok(model.coolingLanes(gapResult.segments).modes.every(b => b.end <= gap.start || b.start >= gap.end));
  const html = renderToStaticMarkup(React.createElement(CoolingStatistics, { result, loading: false, unavailable: false, start, end }));
  for (const duration of [result.modeMs.OCCUPIED, result.reducedMs, result.modeMs.PRECOOL, result.normalVacantMs]) assert.ok(html.includes(analytics.durationLabel(duration)));
  assert.ok(html.includes(analytics.coverageLabel(result.knownMs, result.elapsedMs)) && html.includes('Standby'));
});

test('explicit inspection remains pinned across hover, blur, unrelated focus and refresh signals until deliberately cleared', () => {
  const pinned = inspectionReducer(latestInspection, { type: 'pin', at: end - 300_000 });
  assert.equal(inspectionReducer(pinned, { type: 'hover', at: end }), pinned);
  assert.equal(inspectionReducer(pinned, { type: 'leave' }), pinned);
  assert.deepEqual(inspectionReducer(pinned, { type: 'clear' }), latestInspection);
  assert.equal(inspectionReducer(pinned, { type: 'pin', at: NaN }), pinned);
});

test('latest inspector maps both stored sensor identities and preserves raw stored reasons', async () => {
  const data = await fetchOverview(fakeClient(tables), signal), detail = model.latestCooling(data);
  assert.deepEqual(detail.temperatures.map(t => t.value), data.zone.config.payload.required_nodes.map(n => data.samples.find(s => s.node_id === n.node_id).temperature_c));
  assert.equal(detail.decision.payload.reason_text, data.decision.payload.reason_text);
  assert.equal(detail.forecast.payload.planned_restart_at, data.forecast.payload.planned_restart_at);
});

test('contextual inspector summary and expandable evidence retain the same stored values and exact record links', async () => {
  const data = await fetchOverview(fakeClient(tables), signal);
  for (const [detail, historical] of [[model.latestCooling(data), false], [inspect(end - 300_000), true]]) {
    const html = renderToStaticMarkup(React.createElement(CoolingInspectionPanel, { inspection: detail, labels, historical, onOpenRecord: () => {} }));
    const summary = html.match(/<dl class="su-inspector-summary">([\s\S]*?)<\/dl>/)[1];
    assert.ok(summary.includes(detail.decision.payload.occupancy.toLowerCase()));
    assert.ok(summary.includes(model.spatialModeNames[detail.decision.payload.requested_mode]));
    assert.ok(summary.includes(forecastStatus(detail.forecast, detail.at).toLowerCase()));
    for (const reading of detail.temperatures) assert.ok(html.includes(reading.value.toFixed(1)));
    assert.ok(html.includes(detail.decision.payload.reason_code === 'SHORT_GAP' && detail.decision.payload.requested_mode === 'SHORT_VACANCY'
      ? 'Brief vacancy expected. Reduced cooling requested.'
      : detail.decision.payload.reason_code === 'OCCUPIED_EVIDENCE' && detail.decision.payload.occupancy === 'OCCUPIED' && detail.decision.payload.requested_mode === 'OCCUPIED'
        ? 'Room occupied. Normal cooling requested.'
        : detail.decision.payload.reason_code === 'FORECAST_RESTART' && detail.decision.payload.requested_mode === 'PRECOOL'
          ? 'Expected room use is approaching. Pre-cooling requested.'
          : detail.decision.payload.reason_code === 'LONG_GAP' && detail.decision.payload.requested_mode === 'LONG_VACANCY'
            ? 'Extended vacancy expected. Standby mode requested.' : detail.decision.payload.reason_text));
    for (const label of ['Open decision record', 'Open output record', 'Open forecast record', 'Cooling reasoning', 'Forecast evidence']) assert.ok(html.includes(label));
    assert.ok(!html.includes('<summary>Sensor evidence</summary>'));
    assert.ok(!html.includes('<summary>Inspect correlated record references</summary>'));
    assert.ok(html.includes(historical ? 'Historical records · as known at this time' : 'Latest committed records'));
    assert.ok(!html.includes('<details open'), 'evidence must not expand when selection changes');
  }
});
