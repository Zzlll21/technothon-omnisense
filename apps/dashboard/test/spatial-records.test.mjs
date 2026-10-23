import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { fakeClient, overviewFixture } from './overview-fixture.mjs';

const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
test.after(() => server.close());
const { fetchOperatingPage, fetchOperatingRecord } = await server.ssrLoadModule('/src/api/operatingRecords.ts');
const { OperatingRecordContent } = await server.ssrLoadModule('/src/components/spatial/OperatingRecordInspector.tsx');
const { OperatingRecordLedger } = await server.ssrLoadModule('/src/components/spatial/OperatingRecordsWorkspace.tsx');
const { recordSnapshot } = await server.ssrLoadModule('/src/lib/spatialRecords.ts');
const { fetchOverview } = await server.ssrLoadModule('/src/api/overview.ts');
const { malaysiaTime } = await server.ssrLoadModule('/src/lib/operatingRecordsDisplay.ts');
const tables = overviewFixture(undefined, true), run = tables.sdp_runs[0];
const snapshot = { runId: run.run_id, zoneId: 'zone-1', zoneName: 'Stored zone', sequence: run.last_sequence, at: run.last_simulated_at };
const filters = { start: new Date(Date.parse(run.history_start) + 1).toISOString(), end: new Date(Date.parse(snapshot.at) + 1).toISOString(), category: 'ALL', mode: '', search: '', searchField: 'all' };
const signal = new AbortController().signal;
const row = tables.sdp_events.find(r => r.event_type === 'ZONE_DECISION' && r.event.payload.requested_mode === 'PRECOOL' && Date.parse(r.occurred_at) > Date.parse(filters.start));

test('contextual identity uses equality with run, zone, committed sequence and time scopes, independently of list filters', async () => {
  const client = fakeClient(tables), context = await fetchOperatingRecord(client, snapshot, row.event_id, signal);
  assert.equal(context.row.event_id, row.event_id);
  const first = client.queries[0];
  for (const expected of [['eq', 'event_id', row.event_id], ['eq', 'run_id', snapshot.runId], ['eq', 'zone_id', snapshot.zoneId], ['lte', 'sequence', snapshot.sequence], ['lte', 'occurred_at', snapshot.at]]) assert.ok(first.filters.some(f => JSON.stringify(f) === JSON.stringify(expected)));
  assert.ok(!first.filters.some(([op]) => ['ilike', 'or'].includes(op)));
  const legacyPage = await fetchOperatingPage(fakeClient(tables), snapshot, { ...filters, search: row.event_id, searchField: 'event_id' }, 1, 25, signal);
  assert.deepEqual(context, legacyPage.rows.find(c => c.row.event_id === row.event_id));
});

test('missing, foreign, future and prefix-only events cannot stand in for an exact record', async () => {
  assert.equal(await fetchOperatingRecord(fakeClient(tables), snapshot, row.event_id + ':not-there', signal), null);
  assert.equal(await fetchOperatingRecord(fakeClient(tables), { ...snapshot, zoneId: 'illustrative-room' }, row.event_id, signal), null);
  assert.equal(await fetchOperatingRecord(fakeClient(tables), { ...snapshot, at: new Date(Date.parse(row.occurred_at) - 1).toISOString() }, row.event_id, signal), null);
  await assert.rejects(fetchOperatingRecord(fakeClient(tables), snapshot, '', signal), /identity/);
  await assert.rejects(fetchOperatingRecord(fakeClient(tables, q => q.table === 'sdp_events' ? { data: [row, row], error: null } : undefined), snapshot, row.event_id, signal), /inconsistent/);
});

test('exact-record reads inherit sanitized failures and cancellation', async () => {
  const blocked = fakeClient(tables, () => ({ data: null, error: { code: '42501', message: 'private transport detail' } }));
  await assert.rejects(fetchOperatingRecord(blocked, snapshot, row.event_id, signal), error => /blocked/.test(error.message) && !error.message.includes('private'));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(fetchOperatingRecord(fakeClient(tables), snapshot, row.event_id, controller.signal), /Aborted/);
});

test('historical record snapshots cap knowledge and reports at inspection time without changing the committed sequence', async () => {
  const data = await fetchOverview(fakeClient(tables), signal), at = Date.parse(row.occurred_at);
  const historical = recordSnapshot(data, at);
  assert.equal(historical.sequence, data.frame.sequence); assert.equal(Date.parse(historical.at), at);
  assert.equal(Date.parse(recordSnapshot(data, at + 100 * 86400_000).at), Date.parse(data.frame.simulated_at));
  const changed = structuredClone(tables), output = changed.sdp_events.find(r => r.event_type === 'APPLIED_OUTPUT' && r.event.payload.decision_event_id === row.event_id);
  output.occurred_at = new Date(at + 1000).toISOString(); output.event.occurred_at = output.occurred_at;
  const before = await fetchOperatingRecord(fakeClient(changed), historical, row.event_id, signal);
  assert.equal(before.outputs.length, 0); assert.ok(before.warnings.some(w => /output report/.test(w)));
});

test('the spatial inspector preserves raw reasons, exact forecast links, separate request/report fields and Malaysia times', async () => {
  const c = await fetchOperatingRecord(fakeClient(tables), snapshot, row.event_id, signal);
  const html = renderToStaticMarkup(React.createElement(OperatingRecordContent, { context: c, snapshot }));
  assert.ok(html.includes(row.event.payload.reason_text));
  assert.ok(html.includes(malaysiaTime(row.occurred_at)) && html.includes('MYT') && html.includes(row.occurred_at));
  assert.ok(html.includes(c.forecast.event_id) && html.includes(c.outputs[0].payload.command_id));
  assert.ok(html.includes('Requested mode') && html.includes('Correlated simulated output') && html.includes('Stored cooling decision'));
});

test('missing links render warnings and unavailable context without inventing a matching frame or forecast', async () => {
  const changed = structuredClone(tables); changed.sdp_zone_frames = [];
  changed.sdp_events = changed.sdp_events.filter(e => e.event_id !== row.event.payload.forecast_event_id);
  const c = await fetchOperatingRecord(fakeClient(changed), snapshot, row.event_id, signal);
  assert.equal(c.frame, null); assert.equal(c.forecast, null);
  const html = renderToStaticMarkup(React.createElement(OperatingRecordContent, { context: c, snapshot }));
  assert.ok(html.includes('Unavailable · no exact frame') && html.includes('Linked records need review') && html.includes('No later or nearby forecast is substituted'));
});

test('technical categories remain renderable and invalid node measurements stay unavailable', async () => {
  for (const category of ['NODE_EVIDENCE', 'ZONE_CONFIG']) {
    const entry = tables.sdp_events.find(r => r.event_type === category);
    const c = await fetchOperatingRecord(fakeClient(tables), snapshot, entry.event_id, signal);
    const html = renderToStaticMarkup(React.createElement(OperatingRecordContent, { context: c, snapshot }));
    assert.ok(html.includes(entry.event_id) && html.includes('original payload'));
  }
  const entry = tables.sdp_events.find(r => r.event_type === 'NODE_EVIDENCE'), c = await fetchOperatingRecord(fakeClient(tables), snapshot, entry.event_id, signal);
  c.row.event.payload.temperature_c = { validity: 'INVALID', value: null };
  const html = renderToStaticMarkup(React.createElement(OperatingRecordContent, { context: c, snapshot }));
  assert.ok(html.includes('<dt>Temperature</dt><dd>Unavailable</dd>') && html.includes('<dt>Temperature validity</dt><dd>invalid</dd>'));
});

test('chronological ledger presents the complete adapter page without extra client-side search or mode filtering', async () => {
  const page = await fetchOperatingPage(fakeClient(tables), snapshot, { ...filters, category: 'ZONE_DECISION' }, 1, 25, signal);
  const html = renderToStaticMarkup(React.createElement(OperatingRecordLedger, { rows: page.rows, snapshot, onSelect: () => {} }));
  assert.equal((html.match(/class="sr-entry"/g) ?? []).length, page.rows.length);
  assert.ok(html.includes('Malaysia · UTC+08:00') && html.includes('Exact frame matched'));
  assert.equal((html.match(/<time /g) ?? []).length, page.rows.length);
});
