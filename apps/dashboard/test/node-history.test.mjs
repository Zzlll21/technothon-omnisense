import test from 'node:test';
import assert from 'node:assert/strict';
import { compileSource, fakeClient, runtimeRewrite } from './overview-fixture.mjs';
import { nodeHistoryFixture } from './node-history-fixture.mjs';
const { fetchNodeHistory } = await compileSource(new URL('../src/api/nodeHistory.ts', import.meta.url), runtimeRewrite);
const display = await compileSource(new URL('../src/lib/nodeHistoryDisplay.ts', import.meta.url));
const tables = nodeHistoryFixture();
const run = tables.sdp_runs[0];
const base = { runId: run.run_id, zoneId: 'zone-1', nodeId: 'sim-1', sequence: run.last_sequence, start: run.history_start, end: run.last_simulated_at };
const load = (client = fakeClient(tables), scope = base) => fetchNodeHistory(client, scope, new AbortController().signal);

test('seven-day history paginates all selected-node records with committed checkpoint and time bounds', async () => {
  const client = fakeClient(tables);
  const rows = await load(client);
  assert.equal(rows.length, 2017);
  assert.equal(client.queries.length, 5);
  assert.ok(rows.every(r => r.node_id === 'sim-1' && r.evidence.event_type === 'NODE_EVIDENCE'));
  for (const q of client.queries) {
    assert.equal(q.table, 'sdp_node_samples'); assert.equal(q.limit, 500);
    assert.ok(q.columns.includes('evidence:sdp_events!'));
    for (const expected of [['eq','run_id',base.runId],['eq','zone_id','zone-1'],['eq','node_id','sim-1'],['lte','sequence',2016],['gte','observed_at',base.start],['lte','observed_at',base.end]]) assert.ok(q.filters.some(f => JSON.stringify(f) === JSON.stringify(expected)));
    assert.deepEqual(q.orders, [['observed_at',true],['sequence',true]]);
  }
});
test('one-hour and 24-hour ranges use observed time and allow node selection', async () => {
  for (const hours of [1,24]) {
    const scope = { ...base, nodeId:'sim-2', start:new Date(Date.parse(base.end)-hours*3600_000).toISOString() };
    const rows = await load(fakeClient(tables),scope);
    assert.equal(rows.length,hours*12+1);
    assert.ok(rows.every(r => r.node_id==='sim-2' && Date.parse(r.observed_at)>=Date.parse(scope.start)));
  }
});
test('incremental reads return only new sequences and ignore future frames', async () => {
  const rows = await load(fakeClient(tables),{...base,sequence:2015,afterSequence:2012});
  assert.deepEqual(rows.map(r=>r.sequence),[2013,2014,2015]);
});
test('missing samples remain gaps, an empty node returns no fabricated samples', async () => {
  const partial = structuredClone(tables);
  partial.sdp_node_samples = partial.sdp_node_samples.filter(s=>![2,3].includes(s.sequence));
  const rows = await load(fakeClient(partial),{...base,sequence:5});
  assert.deepEqual(rows.map(r=>r.sequence),[0,1,4,5]);
  assert.equal(display.numericSegments(rows,run.live_anchor,'temperature_c').length,2);
  assert.deepEqual(await load(fakeClient({sdp_node_samples:[]})),[]);
});
test('rejects mismatched evidence and foreign scope instead of silently graphing it', async () => {
  const row = structuredClone(tables.sdp_node_samples[0]);
  for (const mutate of [r=>r.evidence=null,r=>r.evidence.event.payload.node_id='sim-2',r=>r.temperature_c=99,r=>r.run_id='other',r=>r.evidence.event.clock.replay_id='other',r=>r.evidence.event.payload.classification.observed_at='2020-01-01T00:00:00.000Z']) {
    const bad=structuredClone(row); mutate(bad);
    await assert.rejects(load(fakeClient(tables,()=>({data:[bad],error:null}))),/evidence|dataset/);
  }
});
test('reports permission/network failures safely and does not return partial pages', async () => {
  for (const code of ['42501','other']) {
    const client=fakeClient(tables,(q,queries)=>queries.length===2?{data:null,error:{code,message:'private server details'}}:undefined);
    await assert.rejects(load(client),error=>/access|connection/.test(error.message)&&!error.message.includes('private'));
  }
});
test('rejects oversized windows and propagates cancellation',async()=>{
  await assert.rejects(load(fakeClient(tables),{...base,start:'2020-01-01T00:00:00Z'}),/seven days/);
  const controller=new AbortController();controller.abort();
  await assert.rejects(fetchNodeHistory(fakeClient(tables),base,controller.signal),/Aborted/);
});
test('historical gaps respect 5-minute seed versus 30-second continuous cadence',async()=>{
  const rows=await load(fakeClient(tables),{...base,afterSequence:2014});
  assert.equal(display.hasGap(rows[0],rows[1],run.live_anchor),false);
  const a=rows[1],b={...a,sequence:a.sequence+1,observed_at:new Date(Date.parse(a.observed_at)+30_000).toISOString()};
  assert.equal(display.hasGap(a,b,run.live_anchor),false);
  assert.equal(display.hasGap(a,{...b,observed_at:new Date(Date.parse(a.observed_at)+120_000).toISOString()},run.live_anchor),true);
});
test('classification spans preserve reported classes and do not bridge missing intervals',async()=>{
  const rows=structuredClone((await load(fakeClient(tables),{...base,sequence:3})).filter(r=>r.sequence!==2));
  const kind=rows[0].evidence.payload.classification.value.class_label;
  for(const row of rows) row.evidence.payload.classification.value.class_label=kind;
  const spans=display.occupancySpans(rows,run.live_anchor,Date.parse(base.end));
  assert.ok(spans.every(span=>span.kind===kind));
  assert.equal(spans.length,2);
  assert.equal(spans[0].end,Date.parse(rows[1].observed_at)+300_000);
  const invalid=structuredClone(rows[0]);invalid.evidence.payload.classification={value:null,validity:'UNAVAILABLE'};
  assert.equal(display.classification(invalid.evidence),null);
});
test('nearest-point inspection follows actual time and handles empty or sparse samples',async()=>{
  const rows=await load(fakeClient(tables),{...base,sequence:4});
  const sparse=[rows[0],rows[4]];
  assert.equal(display.nearestPoint([],0),-1);
  assert.equal(display.nearestPoint(sparse,Date.parse(rows[0].observed_at)+60_000),0);
  assert.equal(display.nearestPoint(sparse,Date.parse(rows[4].observed_at)-60_000),1);
  assert.equal(display.nearestPoint([rows[0]],Infinity),0);
});
test('flat decimal environmental data has a readable expanded scale without duplicate labels',()=>{
  for(const values of [[25],[61.51,61.52],[23,30],[50,70]]){
    const scale=display.chartScale(values);
    assert.ok(scale.min<Math.min(...values)&&scale.max>Math.max(...values));
    assert.equal(new Set(scale.ticks.map(n=>n.toFixed(1))).size,scale.ticks.length);
  }
});
