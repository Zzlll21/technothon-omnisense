// Read-only parity audit. Credentials are read from the existing ignored file into memory only.
// node verify-phase3-live.mjs <existing-dashboard-env-file> <key-free-output-json>
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';

assert.ok(process.argv[2] && process.argv[3], 'Pass the existing environment file and a QA output path.');
process.loadEnvFile(resolve(process.argv[2]));
const outputPath = resolve(process.argv[3]);
const app = resolve(import.meta.dirname, '../../apps/dashboard'), require = createRequire(resolve(app, 'package.json'));
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href);
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server'), { createClient } = require('@supabase/supabase-js');
const previousCwd = process.cwd(); process.chdir(app);
const server = await createServer({ root: app, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { fetchOverview } = await server.ssrLoadModule('/src/api/overview.ts');
  const { fetchPredictiveHistory } = await server.ssrLoadModule('/src/api/predictiveHistory.ts');
  const { fetchUtilizationHistory } = await server.ssrLoadModule('/src/api/utilizationHistory.ts');
  const { fetchNodeHistory } = await server.ssrLoadModule('/src/api/nodeHistory.ts');
  const legacy = await server.ssrLoadModule('/src/lib/predictiveDisplay.ts');
  const analytics = await server.ssrLoadModule('/src/lib/utilizationAnalytics.ts');
  const { coolingCategories } = await server.ssrLoadModule('/src/lib/coolingStatistics.ts');
  const spatial = await server.ssrLoadModule('/src/lib/spatialCooling.ts');
  const { CoolingStatistics, CoolingInspectionPanel } = await server.ssrLoadModule('/src/components/spatial/UsageCooling.tsx');
  const client = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const data = await fetchOverview(client, AbortSignal.timeout(20000));
  assert.ok(data, 'No validated ACTIVE snapshot');
  const original = JSON.stringify(data), end = Date.parse(data.frame.simulated_at), ranges = [];
  for (const hours of [24, 168]) {
    const start = end - hours * 3600_000, scope = { runId: data.run.run_id, zoneId: data.zone.zone_id, sequence: data.frame.sequence, start: new Date(start).toISOString(), end: data.frame.simulated_at };
    const definitions = data.zone.config.payload.required_nodes;
    const [history, utilization, ...nodes] = await Promise.all([
      fetchPredictiveHistory(client, { ...scope, nodeId: data.zone.config.payload.representative_environment_node_id }, AbortSignal.timeout(60000)),
      fetchUtilizationHistory(client, scope, AbortSignal.timeout(60000)),
      ...definitions.map(n => fetchNodeHistory(client, { ...scope, nodeId: n.node_id }, AbortSignal.timeout(60000)))
    ]);
    const result = analytics.calculateUtilization(utilization, { start, end, liveAnchor: data.run.live_anchor, staleAfterMs: data.zone.config.payload.freshness.stale_after_ms });
    const lanes = spatial.coolingLanes(result.segments);
    for (const mode of analytics.modeOrder) assert.equal(lanes.modes.filter(b => b.value === mode).reduce((a, b) => a + b.end - b.start, 0), result.modeMs[mode]);
    assert.equal(Object.values(result.modeMs).reduce((a, b) => a + b, 0), result.knownMs);
    assert.equal(result.knownMs + result.missingMs, end - start);
    assert.equal(result.reducedMs, result.modeMs.SHORT_VACANCY + result.modeMs.LONG_VACANCY);
    assert.ok(result.normalVacantMs <= result.modeMs.OCCUPIED);
    const html = renderToStaticMarkup(React.createElement(CoolingStatistics, { result, loading: false, unavailable: false, start, end }));
    for (const category of coolingCategories(result)) assert.ok(html.includes(analytics.durationLabel(category.ms)), `Missing legacy duration ${category.id}`);
    assert.ok(html.includes(analytics.coverageLabel(result.knownMs, result.elapsedMs)));
    const eventMap = new Map(history.events.map(e => [e.event_id, e]));
    const inspections = history.frames.filter((f, i) => i % 37 === 0 || f.sequence === data.frame.sequence || eventMap.get(f.decision_event_id)?.payload.requested_mode === 'PRECOOL');
    for (const f of inspections) {
      const at = Date.parse(f.simulated_at), detail = spatial.inspectCooling(history, nodes, at, data.run.live_anchor, end);
      const oldFrame = legacy.frameAt(history.frames, at, data.run.live_anchor, end), oldRecords = legacy.frameRecords(oldFrame, eventMap);
      assert.equal(detail.frame.sequence, oldFrame.sequence);
      assert.equal(detail.decision?.event_id, oldRecords.decision?.event_id);
      assert.equal(detail.output?.event_id, oldRecords.output?.event_id);
      assert.equal(detail.forecast?.event_id, legacy.forecastAt(history.events, at)?.event_id);
      for (let n = 0; n < definitions.length; n++) {
        const sample = nodes[n].find(p => p.sequence === f.sequence), valid = sample?.evidence.payload.temperature_c.validity === 'VALID';
        assert.equal(detail.temperatures[n].value, valid ? sample.temperature_c : null);
      }
      const rendered = renderToStaticMarkup(React.createElement(CoolingInspectionPanel, { inspection: detail, labels: definitions.map(n => n.label), historical: true }));
      assert.ok(rendered.includes(detail.decision.payload.reason_text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')));
    }
    for (const forecast of history.events.filter(e => e.event_type === 'ZONE_FORECAST' && Date.parse(e.occurred_at) > start)) {
      const at = Date.parse(forecast.occurred_at) - 1, inspected = spatial.inspectCooling(history, nodes, at, data.run.live_anchor, end);
      assert.notEqual(inspected.forecast?.event_id, forecast.event_id);
      assert.ok(!inspected.forecast || Date.parse(inspected.forecast.occurred_at) <= at);
    }
    assert.ok([...history.frames, ...nodes.flat()].every(r => r.run_id === scope.runId && r.zone_id === scope.zoneId && r.sequence <= scope.sequence));
    ranges.push({ hours, start: scope.start, end: scope.end, frames: history.frames.length, nodeRecords: nodes.map((points, i) => ({ id: definitions[i].node_id, count: points.length, firstSequence: points[0]?.sequence, lastSequence: points.at(-1)?.sequence })),
      modesMs: result.modeMs, reducedAndStandbyMs: result.reducedMs, normalVacantMs: result.normalVacantMs, knownMs: result.knownMs, unknownMs: result.missingMs, coverage: analytics.coverageLabel(result.knownMs, result.elapsedMs), overlapMs: result.overlap,
      inspectionsChecked: inspections.length, timelineDurationParity: 'passed', legacyInspectorParity: 'passed', bothNodeEvidenceParity: 'passed', futureForecastExclusion: 'passed', statisticsRenderParity: 'passed' });
  }
  assert.equal(JSON.stringify(data), original, 'Presentation changed its input snapshot');
  const report = { checkedAt: new Date().toISOString(), runId: data.run.run_id, zoneId: data.zone.zone_id, committedSequence: data.frame.sequence, snapshotAt: data.frame.simulated_at, representativeNode: data.zone.config.payload.representative_environment_node_id, ranges, writes: 0 };
  writeFileSync(outputPath, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
} finally { await server.close(); process.chdir(previousCwd); }
