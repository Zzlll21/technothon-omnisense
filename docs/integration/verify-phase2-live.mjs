// Read-only QA: render old and new UI from the SAME validated stored snapshot.
// Usage (from any directory): node verify-phase2-live.mjs <existing-dashboard-env-file> <output-json>
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';

assert.ok(process.argv[2] && process.argv[3], 'Pass the existing environment file and a key-free QA output path.');
process.loadEnvFile(resolve(process.argv[2]));
const outputPath = resolve(process.argv[3]);
const app = resolve(import.meta.dirname, '../../apps/dashboard');
const require = createRequire(resolve(app, 'package.json'));
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href);
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
const { createClient } = require('@supabase/supabase-js');
const previousCwd = process.cwd(); process.chdir(app);
const server = await createServer({ root: app, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { fetchOverview } = await server.ssrLoadModule('/src/api/overview.ts');
  const { fetchNodeHistory } = await server.ssrLoadModule('/src/api/nodeHistory.ts');
  const { spatialOverview } = await server.ssrLoadModule('/src/lib/spatialOverview.ts');
  const { Overview } = await server.ssrLoadModule('/src/components/cooling/Overview.tsx');
  const { ZoneWorkspace } = await server.ssrLoadModule('/src/components/spatial/ZoneWorkspace.tsx');
  const client = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const data = await fetchOverview(client, AbortSignal.timeout(20000));
  assert.ok(data, 'No active stored snapshot');
  const before = JSON.stringify(data), now = Date.parse(data.frame.simulated_at), model = spatialOverview(data, now);
  const noop = () => {};
  const oldHtml = renderToStaticMarkup(React.createElement(Overview, { data, now, refreshToken: null, onInspectNode: noop, onInspectTime: noop, onAudit: noop, onUtilization: noop, onNodes: noop }));
  const zoneHtml = renderToStaticMarkup(React.createElement(ZoneWorkspace, { data, model, now, refreshToken: null, active: true, dashboardHref: '/' }));
  const rep = data.samples.find(s => s.node_id === data.zone.config.payload.representative_environment_node_id);
  for (const value of [data.zone.name, rep.temperature_c.toFixed(1), rep.humidity_percent.toFixed(1), model.requestedMode, model.reportedOutput]) {
    assert.ok(oldHtml.includes(value), `Existing dashboard omits expected stored field: ${value}`);
    assert.ok(zoneHtml.includes(value), `Spatial workspace omits expected stored field: ${value}`);
  }
  assert.equal(model.decisionId, data.output.payload.decision_event_id); assert.equal(model.commandId, data.output.payload.command_id);
  const histories = [];
  for (const node of model.nodes) {
    const sample = data.samples.find(s => s.node_id === node.id);
    assert.equal(node.temperature, sample.temperature_c); assert.equal(node.humidity, sample.humidity_percent);
    assert.ok(oldHtml.includes(node.label) && zoneHtml.includes(node.label));
    for (const hours of [1, 24, 168]) {
      const points = await fetchNodeHistory(client, { runId: model.runId, zoneId: model.zoneId, nodeId: node.id, sequence: model.sequence, start: new Date(now - hours * 3600_000).toISOString(), end: data.frame.simulated_at }, AbortSignal.timeout(60000));
      assert.ok(points.length, `${node.id}: no records for ${hours}h`);
      assert.ok(points.every(p => p.node_id === node.id && p.run_id === model.runId && p.zone_id === model.zoneId && p.sequence <= model.sequence));
      histories.push({ nodeId: node.id, hours, count: points.length, firstSequence: points[0].sequence, lastSequence: points.at(-1).sequence });
    }
  }
  assert.equal(JSON.stringify(data), before, 'Presentation mutated the stored snapshot');
  const result = { checkedAt: new Date().toISOString(), runId: model.runId, zoneId: model.zoneId, sequence: model.sequence, at: model.at,
    snapshotSha256: createHash('sha256').update(before).digest('hex'),
    sameSnapshotOldAndNewRender: 'passed', representative: model.representative.id,
    nodes: model.nodes.map(n => ({ id: n.id, label: n.label, temperature: n.temperature, humidity: n.humidity, observedAt: n.observedAt, classification: n.classificationCode, evidenceId: n.evidenceId })),
    decisionId: model.decisionId, commandId: model.commandId, outputId: model.outputId, histories, writes: 0 };
  writeFileSync(outputPath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally { await server.close(); process.chdir(previousCwd); }
