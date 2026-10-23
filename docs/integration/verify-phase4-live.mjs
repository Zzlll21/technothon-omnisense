// Read-only comparison with the actual Phase 3 adapters/exporter at identical boundaries.
// node verify-phase4-live.mjs <existing-env-file> <report-json> [browser-downloaded-csv]
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
assert.ok(process.argv[2] && process.argv[3], 'Pass existing configuration and key-free report path.');
process.loadEnvFile(resolve(process.argv[2]));
const output = resolve(process.argv[3]), downloaded = process.argv[4] && resolve(process.argv[4]);
const root = resolve(import.meta.dirname, '../..'), app = resolve(root, 'apps/dashboard'), require = createRequire(resolve(app, 'package.json'));
const ts = require('typescript'), { createClient } = require('@supabase/supabase-js');
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href);
const original = process.cwd(); process.chdir(app);
const server = await createServer({ root: app, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const contract = pathToFileURL(resolve(root, 'packages/sdp-contract/dist/index.js')).href;
const baseline = path => execFileSync('git', ['show', `d39f281:${path}`], { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 });
function source(text, rewrites = []) {
  let js = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  for (const [from, to] of rewrites) js = js.replaceAll(from, to);
  return `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
}
const current = path => readFileSync(resolve(root, path), 'utf8');
const hash = text => createHash('sha256').update(text).digest('hex');
function parseCsv(text) {
  text = text.replace(/^\uFEFF/, ''); const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) { const c = text[i]; if (c === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; } else if (!quoted && (c === ',' || c === '\r')) { row.push(cell); cell = ''; if (c === '\r') { assert.equal(text[++i], '\n'); rows.push(row); row = []; } } else cell += c; }
  return rows;
}
try {
  const oldApiUrl = source(baseline('apps/dashboard/src/api/operatingRecords.ts'), [['../../../../packages/sdp-contract/src', contract]]);
  const sdpUrl = source(current('apps/dashboard/src/lib/sdpRecords.ts'));
  const nodeUrl = source(current('apps/dashboard/src/lib/nodeHistoryDisplay.ts'));
  const overviewUrl = source(current('apps/dashboard/src/lib/overviewDisplay.ts'));
  const predictiveUrl = source(current('apps/dashboard/src/lib/predictiveDisplay.ts'), [['./nodeHistoryDisplay', nodeUrl]]);
  const displayUrl = source(current('apps/dashboard/src/lib/operatingRecordsDisplay.ts'), [['./sdpRecords', sdpUrl], ['./nodeHistoryDisplay', nodeUrl], ['./predictiveDisplay', predictiveUrl], ['./overviewDisplay', overviewUrl]]);
  const oldExport = await import(source(baseline('apps/dashboard/src/api/exportOperatingRecords.ts'), [['./operatingRecords', oldApiUrl], ['../lib/operatingRecordsDisplay', displayUrl], ['../lib/sdpRecords', sdpUrl]]));
  const oldApi = await import(oldApiUrl);
  const api = await server.ssrLoadModule('/src/api/operatingRecords.ts');
  const exporter = await server.ssrLoadModule('/src/api/exportOperatingRecords.ts');
  const { fetchOverview } = await server.ssrLoadModule('/src/api/overview.ts');
  const client = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const data = await fetchOverview(client, AbortSignal.timeout(20000)); assert.ok(data);
  const snapshot = { runId: data.run.run_id, zoneId: data.zone.zone_id, zoneName: data.zone.name, sequence: data.frame.sequence, at: data.frame.simulated_at };
  const end = Date.parse(snapshot.at) + 1, base = { start: new Date(end - 86400_000).toISOString(), end: new Date(end).toISOString(), category: 'ALL', mode: '', search: '', searchField: 'all' };
  const comparisons = [];
  for (const filters of [base, { ...base, start: new Date(end - 7 * 86400_000).toISOString(), category: 'ZONE_DECISION', mode: 'PRECOOL', search: 'FORECAST_RESTART' }, { ...base, category: 'APPLIED_OUTPUT' }, { ...base, search: 'sim-1' }, { ...base, search: 'NO_MATCH_PHASE4_%_' }]) {
    const a = await api.fetchOperatingPage(client, snapshot, filters, 1, 25, AbortSignal.timeout(60000));
    const b = await oldApi.fetchOperatingPage(client, snapshot, filters, 1, 25, AbortSignal.timeout(60000));
    assert.deepEqual(a, b);
    if (a.total > 25) assert.deepEqual(await api.fetchOperatingPage(client, snapshot, filters, 2, 25, AbortSignal.timeout(60000)), await oldApi.fetchOperatingPage(client, snapshot, filters, 2, 25, AbortSignal.timeout(60000)));
    for (const context of a.rows.slice(0, 3)) assert.deepEqual(await api.fetchOperatingRecord(client, snapshot, context.row.event_id, AbortSignal.timeout(60000)), context);
    comparisons.push({ filters, count: a.total, firstPage: a.rows.length, paginationParity: 'passed', representativeExactCorrelations: 'passed' });
  }
  const csvFilters = { ...base, search: 'sim-1' }, progress = [];
  const built = await exporter.buildOperatingCsv(client, snapshot, csvFilters, AbortSignal.timeout(180000), (done, total) => progress.push({ done, total }));
  const legacy = await oldExport.buildOperatingCsv(client, snapshot, csvFilters, AbortSignal.timeout(180000), () => {});
  assert.ok(built.count > 500); assert.equal(built.parts.join(''), legacy.parts.join('')); assert.equal(built.count, legacy.count);
  const parsed = parseCsv(built.parts.join('')); assert.equal(parsed.length, built.count + 1);
  assert.ok(parsed[1][1].endsWith('+08:00')); assert.ok(parsed[0].includes('Original UTC timestamp') && parsed[0].includes('Requested mode') && parsed[0].includes('Reported output status'));
  const controller = new AbortController(); let cancelled = false;
  try { await exporter.buildOperatingCsv(client, snapshot, csvFilters, controller.signal, () => controller.abort()); } catch (error) { cancelled = controller.signal.aborted; }
  assert.ok(cancelled);
  const normalized = text => text.replaceAll('\r\n', '\n');
  assert.equal(normalized(current('apps/dashboard/src/api/exportOperatingRecords.ts')), normalized(baseline('apps/dashboard/src/api/exportOperatingRecords.ts')));
  const report = { checkedAt: new Date().toISOString(), snapshot, comparisons, csv: { rows: built.count, pages: progress.length, sha256: hash(built.parts.join('')), byteForBytePhase3ExporterParity: true, cancelledAfterFirstPage: cancelled, exporterSourceUnchanged: true }, writes: 0 };
  if (downloaded) {
    const text = readFileSync(downloaded, 'utf8'), csv = parseCsv(text), columns = csv[0], first = csv[1]; assert.ok(first);
    const value = name => first[columns.indexOf(name)];
    const downloadSnapshot = { runId: value('Run ID'), zoneId: value('Zone ID'), zoneName: value('Zone'), sequence: Number(value('Snapshot sequence')), at: value('Snapshot UTC') };
    const downloadFilters = { start: value('Range start UTC'), end: value('Range end UTC'), category: value('Category filter'), mode: value('Mode filter'), search: value('Search text'), searchField: value('Search field') };
    assert.equal(downloadSnapshot.runId, data.run.run_id); assert.equal(downloadSnapshot.zoneId, data.zone.zone_id);
    const expected = await oldExport.buildOperatingCsv(client, downloadSnapshot, downloadFilters, AbortSignal.timeout(180000), () => {});
    assert.equal(text, expected.parts.join('')); assert.equal(csv.length - 1, expected.count);
    report.browserDownload = { snapshot: downloadSnapshot, filters: downloadFilters, rows: expected.count, sha256: hash(text), byteForBytePhase3ExporterParity: true };
  }
  writeFileSync(output, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
} finally { await server.close(); process.chdir(original); }
