import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileSource, fakeClient, overviewFixture, runtimeRewrite } from './overview-fixture.mjs';

const { fetchOverview } = await compileSource(new URL('../src/api/overview.ts', import.meta.url), runtimeRewrite);
const display = await compileSource(new URL('../src/lib/overviewDisplay.ts', import.meta.url));
const { resolvePublicConfig } = await compileSource(new URL('../src/lib/publicConfig.ts', import.meta.url));
const fixture = overviewFixture();
const load = (client = fakeClient(fixture)) => fetchOverview(client, new AbortController().signal);

test('latest snapshot uses all six SDP tables and only bounded, run/zone/frame-scoped reads', async () => {
  const client = fakeClient(fixture);
  const data = await load(client);
  assert.deepEqual(new Set(client.queries.map(q => q.table)), new Set(Object.keys(fixture)));
  assert.equal(data.frame.sequence, 2016);
  assert.equal(data.samples.length, 2);
  assert.equal(data.activity.length, 5);
  assert.equal(data.decision.payload.requested_mode, 'PRECOOL');
  for (const query of client.queries) {
    assert.ok(Number.isFinite(query.limit));
    assert.ok(!query.columns.includes('*') && !query.columns.includes('checkpoint') && !query.columns.includes('definition'));
    if (query.table !== 'sdp_runs') assert.ok(query.filters.some(([op, key, val]) => op === 'eq' && key === 'run_id' && val === data.run.run_id));
    if (!['sdp_runs', 'sdp_zones'].includes(query.table)) assert.ok(query.filters.some(([op, key, val]) => op === 'eq' && key === 'zone_id' && val === data.zone.zone_id));
    if (['sdp_node_samples', 'sdp_zone_frames'].includes(query.table)) assert.ok(query.filters.some(([op, key, val]) => op === 'eq' && key === 'sequence' && val === data.frame.sequence));
  }
  const recent = client.queries.find(q => q.table === 'sdp_events' && q.limit === 5 && q.orders.length);
  assert.deepEqual(recent.orders, [['occurred_at', false], ['sequence', false], ['ordinal', false]]);
});
test('does not advance past the run checkpoint or mix other run/node samples', async () => {
  const tables = structuredClone(fixture);
  tables.sdp_node_samples.push({ ...tables.sdp_node_samples[0], sequence: 2017, temperature_c: 39 });
  tables.sdp_node_samples.push({ ...tables.sdp_node_samples[0], run_id: 'other-run', temperature_c: 40 });
  tables.sdp_zone_frames.push({ ...tables.sdp_zone_frames[0], sequence: 2017 });
  const result = await load(fakeClient(tables));
  assert.equal(result.frame.sequence, 2016);
  assert.equal(result.samples.length, 2);
  assert.ok(result.samples.every(s => s.temperature_c < 39));
});
test('no published run is an empty result, with no follow-up history queries', async () => {
  const client = fakeClient({ ...fixture, sdp_runs: [] });
  assert.equal(await load(client), null);
  assert.equal(client.queries.length, 1);
});
test('RLS and transport/query failures have helpful errors without raw server content', async () => {
  for (const code of ['42501', '42P01', 'NETWORK']) {
    const client = fakeClient(fixture, () => ({ data: null, error: { code, message: 'PRIVATE ERROR DETAILS' } }));
    await assert.rejects(load(client), e => !e.message.includes('PRIVATE') && /SDP/.test(e.message));
  }
});
test('publication races retry once, without using mixed-run data', async () => {
  let changed = false;
  const client = fakeClient(fixture, q => {
    if (q.table === 'sdp_zones' && !changed) { changed = true; return { data: [], error: null }; }
  });
  assert.equal((await load(client)).zone.zone_id, 'zone-1');
  assert.equal(client.queries.filter(q => q.table === 'sdp_runs').length, 2);
  const broken = fakeClient({ ...fixture, sdp_zones: [] });
  await assert.rejects(load(broken), /changed/);
  assert.equal(broken.queries.length, 4);
});
test('missing linked records and mismatched output references cannot claim applied control', async () => {
  const tables = structuredClone(fixture);
  const outputId = tables.sdp_zone_frames[0].output_event_id;
  tables.sdp_events = tables.sdp_events.filter(e => e.event_id !== outputId);
  await assert.rejects(load(fakeClient(tables)), /Linked records/);
  const mismatched = structuredClone(fixture);
  mismatched.sdp_events.find(e => e.event_id === outputId).event.payload.command_id = 'wrong-command';
  await assert.rejects(load(fakeClient(mismatched)), /inconsistent/);
});
test('unknown contract fields, future events and wrong session scope are rejected', async () => {
  for (const change of [event => { event.session_id = 'other'; }, event => { event.occurred_at = '2099-01-01T00:00:00.000Z'; }, event => { event.payload.fake = true; }]) {
    const tables = structuredClone(fixture);
    change(tables.sdp_events.find(e => e.event_id === tables.sdp_zone_frames[0].decision_event_id).event);
    await assert.rejects(load(fakeClient(tables)), /inconsistent/);
  }
});
test('missing samples stay missing and never cause frontend occupancy fusion', async () => {
  const tables = structuredClone(fixture);
  tables.sdp_node_samples.pop();
  const data = await load(fakeClient(tables));
  assert.equal(data.samples.length, 1);
  assert.equal(data.frame.occupancy, fixture.sdp_zone_frames[0].occupancy);
  assert.equal(display.nodeStatus(undefined, data, Date.parse(data.frame.simulated_at)).label, 'Missing');
});
test('freshness uses logical observation time and config thresholds, not insertion time', async () => {
  const data = await load();
  const at = Date.parse(data.frame.simulated_at);
  assert.equal(display.feedStatus(data, at + 30_000), 'CURRENT');
  assert.equal(display.feedStatus(data, at + 90_001), 'DELAYED');
  assert.equal(display.feedStatus(data, at - 6000), 'CLOCK_SKEW');
  assert.equal(display.nodeStatus(data.samples[0], data, at + 360_000).label, 'Stale');
  assert.equal(display.nodeStatus(data.samples[0], data, at + 720_000).label, 'Disconnected');
  assert.equal(display.nodeStatus(data.samples[0], data, at - 6000).label, 'Clock mismatch');
});
test('forecast expiry and non-applied outputs retain truthful states', async () => {
  const data = await load();
  assert.equal(display.forecastState(data.forecast, Date.parse(data.forecast.payload.expires_at)), 'EXPIRED');
  assert.equal(display.forecastState({ ...data.forecast, payload: { ...data.forecast.payload, status: 'CANCELLED' } }, 0), 'CANCELLED');
  assert.equal(display.outputLabel(null), 'Not reported');
  assert.equal(display.number(undefined), '\u2014');
  assert.equal(display.number(61.5), '61.5');
});
test('public config strips rejected values before serialization and accepts only publishable keys', () => {
  const good = { VITE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_offline_test' };
  assert.equal(resolvePublicConfig(good).error, null);
  for (const key of ['sb_secret_OFFLINE_REJECTED_SENTINEL', 'eyJ.invalid.jwt', '', 'your-key']) {
    const result = resolvePublicConfig({ ...good, VITE_SUPABASE_PUBLISHABLE_KEY: key });
    assert.ok(result.error);
    assert.equal(result.key, '');
    assert.equal(result.url, '');
    if (key) assert.ok(!JSON.stringify(result).includes(key));
  }
  assert.ok(resolvePublicConfig({ ...good, VITE_SUPABASE_URL: 'http://localhost:3001' }).error);
  assert.ok(resolvePublicConfig({ ...good, VITE_SUPABASE_URL: 'https://user:password@abcdefghijklmnopqrst.supabase.co' }).error);
  assert.ok(resolvePublicConfig({ VITE_SUPABASE_ANON_KEY: 'legacy', VITE_API_BASE_URL: 'old' }).error);
});
test('active source has no legacy queries, write methods or control API imports', () => {
  for (const path of ['../src/api/overview.ts', '../src/pages/Dashboard.tsx', '../src/components/cooling/Overview.tsx']) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.ok(!/sensor_readings|api\/crisis|VITE_API_BASE_URL|\.insert\(|\.update\(|\.delete\(|\.rpc\(/.test(source));
  }
  assert.ok(readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8').includes('envPrefix: []'));
});
