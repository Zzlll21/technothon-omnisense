import test from 'node:test';
import assert from 'node:assert/strict';
import { compileSource, sourceUrl, fakeClient, overviewFixture, runtimeRewrite } from './overview-fixture.mjs';
const { fetchPredictiveHistory } = await compileSource(new URL('../src/api/predictiveHistory.ts', import.meta.url), runtimeRewrite);
const display = await compileSource(new URL('../src/lib/predictiveDisplay.ts', import.meta.url), [['./nodeHistoryDisplay',sourceUrl(new URL('../src/lib/nodeHistoryDisplay.ts', import.meta.url))]]);
const tables = overviewFixture(undefined,true), run = tables.sdp_runs[0];
const scope = { runId:run.run_id,zoneId:'zone-1',nodeId:'sim-1',sequence:run.last_sequence,start:run.history_start,end:run.last_simulated_at };
const load=(client=fakeClient(tables),query=scope)=>fetchPredictiveHistory(client,query,new AbortController().signal);

test('paginates actual frames, configured reference samples and cooling events with bounded scoped reads',async()=>{
  const client=fakeClient(tables),result=await load(client);
  assert.equal(result.frames.length,2017);assert.equal(result.samples.length,2017);
  assert.ok(result.samples.every(s=>s.node_id==='sim-1'));
  assert.deepEqual(new Set(result.events.map(e=>e.event_type)),new Set(['ZONE_DECISION','ZONE_FORECAST','APPLIED_OUTPUT']));
  for(const query of client.queries){
    assert.ok(query.limit<=500);
    for(const expected of [['eq','run_id',run.run_id],['eq','zone_id','zone-1'],['lte','sequence',2016]])assert.ok(query.filters.some(f=>JSON.stringify(f)===JSON.stringify(expected)));
    assert.ok(query.filters.some(([op,key])=>op==='lte'&&['simulated_at','observed_at','occurred_at'].includes(key)));
  }
});
test('loads exact boundary references predating the range, without reading the whole event log',async()=>{
  const client=fakeClient(tables),query={...scope,start:new Date(Date.parse(scope.end)-35*60_000).toISOString()};
  const result=await load(client,query);
  assert.equal(result.frames.length,8);
  assert.ok(client.queries.some(q=>q.filters.some(([op,key])=>op==='in'&&key==='event_id')));
  for(const f of result.frames)assert.ok(result.events.some(e=>e.event_id===f.decision_event_id));
});
test('all four modes and occupancy transitions come from generator records',async()=>{
  const history=await load(),bands=display.timelineBands(history,run.live_anchor,Date.parse(scope.end));
  assert.deepEqual(new Set(bands.modes.map(b=>b.value)),new Set(['OCCUPIED','SHORT_VACANCY','LONG_VACANCY','PRECOOL']));
  assert.ok(bands.occupancy.some((b,i)=>i&&b.value==='VACANT'&&bands.occupancy[i-1].value==='OCCUPIED'));
  const event=history.events.find(e=>e.event_type==='ZONE_DECISION'&&e.payload.requested_mode==='PRECOOL');
  const forecast=history.events.find(e=>e.event_id===event.payload.forecast_event_id);
  assert.ok(Date.parse(event.occurred_at)<Date.parse(forecast.payload.next_use_window.start));
  assert.match(display.decisionExplanation(event,forecast),/linked next-use forecast/);
});
test('historical inspection excludes future forecasts and respects expiry exactly',async()=>{
  const history=await load(),forecasts=history.events.filter(e=>e.event_type==='ZONE_FORECAST');
  const first=forecasts[0],second=forecasts[1],at=Date.parse(second.occurred_at)-1;
  assert.equal(display.forecastAt(history.events,at).event_id,first.event_id);
  assert.equal(display.forecastStatus(first,Date.parse(first.payload.expires_at)),'EXPIRED');
  assert.equal(display.forecastStatus(second,at),'UNAVAILABLE');
  assert.equal(display.forecastAt(history.events,Date.parse(first.occurred_at)-1),null);
});
test('cancelled and unavailable forecasts stay inactive; no future cancellation rewrites earlier knowledge',async()=>{
  const history=await load(),forecast=history.events.find(e=>e.event_type==='ZONE_FORECAST');
  const cancelled=structuredClone(forecast);cancelled.event_id='cancel';cancelled.occurred_at=new Date(Date.parse(forecast.occurred_at)+60_000).toISOString();cancelled.payload.status='CANCELLED';cancelled.payload.supersedes_event_id=forecast.event_id;
  const known=[forecast,cancelled];
  assert.equal(display.forecastAt(known,Date.parse(cancelled.occurred_at)-1).event_id,forecast.event_id);
  assert.equal(display.forecastStatus(display.forecastAt(known,Date.parse(cancelled.occurred_at)),Date.parse(cancelled.occurred_at)),'CANCELLED');
  cancelled.payload.status='UNAVAILABLE';assert.equal(display.forecastStatus(cancelled,Date.parse(cancelled.occurred_at)),'UNAVAILABLE');
});
test('does not claim forecast-led precooling without a valid correlated forecast',async()=>{
  const history=await load(),decision=history.events.find(e=>e.event_type==='ZONE_DECISION'&&e.payload.requested_mode==='PRECOOL');
  assert.match(display.decisionExplanation(decision,null),/unavailable/);
  const forecast=structuredClone(history.events.find(e=>e.event_id===decision.payload.forecast_event_id));
  forecast.occurred_at=new Date(Date.parse(decision.occurred_at)+60_000).toISOString();
  assert.match(display.decisionExplanation(decision,forecast),/unavailable/);
});
test('missing frames and samples create gaps, not vacancy or continued cooling',async()=>{
  const history=await load();history.frames=history.frames.slice(0,4).filter((_,i)=>i!==1);history.samples=history.samples.slice(0,4).filter((_,i)=>i!==1);
  const gap=Date.parse(history.frames[0].simulated_at)+450_000;
  assert.equal(display.frameAt(history.frames,gap,run.live_anchor,Date.parse(scope.end)),null);
  assert.equal(display.temperatureSegments(history,run.live_anchor).length,2);
  const bands=display.timelineBands(history,run.live_anchor,Date.parse(scope.end));
  assert.ok(bands.occupancy[0].end<bands.occupancy[1].start);
});
test('missing linked events are explicit unavailable states; wrong correlation is rejected',async()=>{
  const absent=structuredClone(tables);absent.sdp_events=absent.sdp_events.filter(e=>e.event_type!=='APPLIED_OUTPUT');
  const history=await load(fakeClient(absent));
  assert.equal(display.frameRecords(history.frames[0],new Map(history.events.map(e=>[e.event_id,e]))).output,null);
  const wrong=structuredClone(tables);wrong.sdp_events.find(e=>e.event_type==='APPLIED_OUTPUT').event.payload.command_id='wrong';
  await assert.rejects(load(fakeClient(wrong)),/inconsistent/);
});
test('incremental refresh and rolling pruning retain exact causal references without duplicate events',async()=>{
  const first=await load(fakeClient(tables),{...scope,sequence:2010});
  const rest=await load(fakeClient(tables),{...scope,afterSequence:2010});
  assert.equal(rest.frames.length,6);
  const start=Date.parse(scope.end)-3600_000,result=display.mergeHistory(first,rest,start);
  assert.equal(result.frames.length,13);assert.equal(new Set(result.events.map(e=>e.event_id)).size,result.events.length);
  assert.ok(result.frames.every(f=>result.events.some(e=>e.event_id===f.decision_event_id)));
});
test('time and scope violations fail closed, permission errors are sanitized and empty results remain empty',async()=>{
  const wrong=structuredClone(tables);wrong.sdp_events[1].event.session_id='other';
  // Node evidence is deliberately not queried; corrupt a cooling event instead.
  wrong.sdp_events.find(e=>e.event_type==='ZONE_DECISION').event.session_id='other';
  await assert.rejects(load(fakeClient(wrong)),/inconsistent/);
  await assert.rejects(load(fakeClient(tables,()=>({data:null,error:{code:'42501',message:'private'}}))),e=>/blocked/.test(e.message)&&!e.message.includes('private'));
  assert.deepEqual(await load(fakeClient({})),{frames:[],samples:[],events:[]});
  await assert.rejects(load(fakeClient(tables),{...scope,start:'2020-01-01'}),/seven days/);
});
test('sample timestamps must match their committed frame, not insertion time',async()=>{
  const bad=structuredClone(tables);
  bad.sdp_node_samples[2].observed_at=new Date(Date.parse(bad.sdp_node_samples[2].observed_at)+1000).toISOString();
  await assert.rejects(load(fakeClient(bad)),/inconsistent/);
});
