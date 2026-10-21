import test from 'node:test';
import assert from 'node:assert/strict';
import { compileSource, fakeClient, overviewFixture, runtimeRewrite } from './overview-fixture.mjs';
const analytics=await compileSource(new URL('../src/lib/utilizationAnalytics.ts',import.meta.url));
const {fetchUtilizationHistory}=await compileSource(new URL('../src/api/utilizationHistory.ts',import.meta.url),runtimeRewrite);
const tables=overviewFixture(undefined,true),run=tables.sdp_runs[0];
const dTemplate=tables.sdp_events.find(e=>e.event_type==='ZONE_DECISION').event;
const oTemplate=tables.sdp_events.find(e=>e.event_type==='APPLIED_OUTPUT').event;
const ORIGIN=Date.parse('2026-10-20T00:00:00.000Z'),M=60_000;
function history(steps){
  const frames=[],events=[];
  steps.forEach((step,i)=>{
    const at=new Date(ORIGIN+step.t).toISOString(),d=structuredClone(dTemplate),o=structuredClone(oTemplate);
    Object.assign(d,{event_id:`d${i}`,occurred_at:at});Object.assign(d.payload,{command_id:`c${i}`,evaluated_at:at,occupancy:step.occupancy??'VACANT',requested_mode:step.mode??'OCCUPIED'});
    Object.assign(o,{event_id:`o${i}`,occurred_at:at});Object.assign(o.payload,{command_id:`c${i}`,decision_event_id:d.event_id,status:step.status??'APPLIED'});
    if(o.payload.status!=='APPLIED')o.payload.reported_output=null;
    frames.push({run_id:run.run_id,zone_id:'zone-1',sequence:step.sequence??i,simulated_at:at,inserted_at:'2026-10-21T00:00:00Z',phase:'HISTORY',occupancy:d.payload.occupancy,coverage:'COMPLETE',decision_event_id:d.event_id,forecast_event_id:'unused',output_event_id:o.event_id});
    events.push(d,o);
  });return {frames,events};
}
const options=(start,end,anchor=ORIGIN+100*86400_000)=>({start:ORIGIN+start,end:ORIGIN+end,liveAnchor:new Date(anchor).toISOString(),staleAfterMs:360_000});
const calculate=(h,start,end,anchor)=>analytics.calculateUtilization(h,options(start,end,anchor));
test('actual elapsed durations handle mixed seed/live cadence without row-count multiplication',()=>{
  const h=history([{t:-5*M},{t:0},{t:35_000},{t:65_000}]);
  const r=calculate(h,-5*M,80_000,ORIGIN);
  assert.equal(r.knownMs,365_000);assert.equal(r.missingMs,15_000);assert.equal(r.modeMs.OCCUPIED,365_000);
});
test('normal/vacant overlap, reduced modes and PRECOOL partition known time exactly',()=>{
  const h=history([{t:0,occupancy:'OCCUPIED'},{t:5*M},{t:10*M,mode:'SHORT_VACANCY'},{t:15*M,mode:'LONG_VACANCY'},{t:20*M,mode:'PRECOOL'},{t:25*M,occupancy:'OCCUPIED'},{t:30*M,occupancy:'OCCUPIED'}]);
  const r=calculate(h,0,30*M);
  assert.equal(r.modeMs.OCCUPIED,15*M);assert.equal(r.normalVacantMs,5*M);assert.equal(r.reducedMs,10*M);assert.equal(r.modeMs.PRECOOL,5*M);
  assert.equal(r.transitions.length,4);assert.equal(Object.values(r.modeMs).reduce((a,b)=>a+b,0),r.knownMs);
  assert.equal(r.overlap.VACANT.PRECOOL,5*M);assert.equal(r.appliedMs,r.knownMs);
});
test('splits an interval at authoritative decision and occupancy event timestamps',()=>{
  const h=history([{t:0,occupancy:'OCCUPIED'},{t:5*M,mode:'SHORT_VACANCY'}]);
  const d=structuredClone(h.events[2]);d.event_id='between';d.occurred_at=new Date(ORIGIN+2*M).toISOString();d.payload.evaluated_at=d.occurred_at;d.payload.command_id='between-command';
  h.events.splice(2,0,d);
  const r=calculate(h,0,5*M);
  assert.equal(r.modeMs.OCCUPIED,2*M);assert.equal(r.modeMs.SHORT_VACANCY,3*M);assert.equal(r.overlap.OCCUPIED.OCCUPIED,2*M);assert.equal(r.overlap.VACANT.SHORT_VACANCY,3*M);
  assert.equal(r.transitions.length,1);assert.equal(r.appliedMs,2*M);assert.equal(r.unconfirmedMs,3*M);
});
test('clips the predecessor interval and counts transitions on the left boundary only',()=>{
  const h=history([{t:0},{t:5*M,mode:'SHORT_VACANCY'},{t:10*M,mode:'LONG_VACANCY'},{t:15*M,mode:'PRECOOL'}]);
  const r=calculate(h,5*M,15*M);
  assert.equal(r.reducedMs,10*M);assert.equal(r.modeMs.PRECOOL,0);assert.equal(r.transitions.length,2);
  const clipped=calculate(h,2*M,7*M);assert.equal(clipped.modeMs.OCCUPIED,3*M);assert.equal(clipped.modeMs.SHORT_VACANCY,2*M);
});
test('skipped sequences, stale gaps and the unbracketed tail remain unknown',()=>{
  const h=history([{t:0},{t:5*M,sequence:2,mode:'SHORT_VACANCY'},{t:30*M,sequence:3,mode:'LONG_VACANCY'},{t:35*M,sequence:4,mode:'PRECOOL'}]);
  const r=calculate(h,0,40*M);
  assert.equal(r.knownMs,5*M);assert.equal(r.missingMs,35*M);assert.equal(r.transitions.length,1);
  assert.equal(r.modeMs.PRECOOL,0);
});
test('missing decision references and sparse single-frame data never imply zero utilization',()=>{
  const h=history([{t:0},{t:5*M},{t:10*M}]);h.events=h.events.filter(e=>e.event_id!=='d0');
  const r=calculate(h,0,10*M);assert.equal(r.knownMs,5*M);assert.equal(r.missingMs,5*M);
  const sparse=calculate(history([{t:0}]),0,60*M);assert.equal(sparse.knownMs,0);assert.equal(sparse.missingMs,60*M);
});
test('uncertain occupancy remains an explicit overlap category',()=>{
  const r=calculate(history([{t:0,occupancy:'UNCERTAIN'},{t:5*M,occupancy:'UNCERTAIN'}]),0,5*M);
  assert.equal(r.knownMs,5*M);assert.equal(r.overlap.UNCERTAIN.OCCUPIED,5*M);assert.equal(r.normalVacantMs,0);
});
test('separates requested from matched APPLIED intervals and ignores unrelated reports',()=>{
  const h=history([{t:0,status:'ACCEPTED'},{t:5*M}]);
  const applied=structuredClone(h.events[1]);applied.event_id='later';applied.occurred_at=new Date(ORIGIN+2*M).toISOString();applied.payload.status='APPLIED';applied.payload.reported_output={fan:'AUTO',setpoint_c:24.5};
  const unrelated=structuredClone(applied);unrelated.event_id='unrelated';unrelated.payload.command_id='wrong';unrelated.occurred_at=new Date(ORIGIN+M).toISOString();h.events.push(unrelated,applied);
  const r=calculate(h,0,5*M);assert.equal(r.modeMs.OCCUPIED,5*M);assert.equal(r.appliedMs,3*M);assert.equal(r.unconfirmedMs,2*M);
});
test('splits at Malaysia midnight, with exact partial-day totals and no UTC-day substitution',()=>{
  const midnight=16*60*M;
  const r=calculate(history([{t:midnight-2*M},{t:midnight+3*M}]),midnight-2*M,midnight+3*M);
  assert.equal(r.days.length,2);assert.equal(r.days[0].knownMs,2*M);assert.equal(r.days[1].knownMs,3*M);
  assert.match(r.days[0].label,/20/);assert.match(r.days[1].label,/21/);
  assert.equal(r.days.reduce((a,b)=>a+b.elapsedMs,0),5*M);
});
test('rolling merge keeps the predecessor and causal references, without duplicates',()=>{
  const h=history([{t:0},{t:5*M},{t:10*M},{t:15*M}]);
  const merged=analytics.mergeUtilizationHistory({frames:h.frames.slice(0,3),events:h.events},{frames:h.frames.slice(2),events:h.events},ORIGIN+7*M);
  assert.deepEqual(merged.frames.map(f=>f.sequence),[1,2,3]);assert.equal(new Set(merged.events.map(e=>e.event_id)).size,merged.events.length);
  assert.equal(calculate(merged,7*M,15*M).knownMs,8*M);
});
test('coverage labels do not round incomplete data up to complete coverage',()=>{
  assert.equal(analytics.coverageLabel(999_999,1_000_000),'>99.9%');
  assert.equal(analytics.coverageLabel(1_000_000,1_000_000),'100.0%');
  assert.equal(analytics.coverageLabel(0,1_000_000),'0.0%');
});
test('Supabase reads are bounded zone-level pages with one predecessor and no node/forecast reads',async()=>{
  const client=fakeClient(tables),query={runId:run.run_id,zoneId:'zone-1',sequence:run.last_sequence,start:new Date(Date.parse(run.last_simulated_at)-24*3600_000).toISOString(),end:run.last_simulated_at};
  const result=await fetchUtilizationHistory(client,query,new AbortController().signal);
  assert.equal(result.frames.length,290);assert.deepEqual(new Set(client.queries.map(q=>q.table)),new Set(['sdp_zone_frames','sdp_events']));
  assert.ok(client.queries.some(q=>q.table==='sdp_zone_frames'&&q.limit===1&&q.orders[0][1]===false&&q.filters.some(([op,key])=>op==='lt'&&key==='simulated_at')));
  for(const q of client.queries){assert.ok(q.limit<=500);for(const filter of [['eq','run_id',run.run_id],['eq','zone_id','zone-1'],['lte','sequence',2016]])assert.ok(q.filters.some(f=>JSON.stringify(f)===JSON.stringify(filter)));}
  assert.ok(result.events.every(e=>e.event_type!=='ZONE_FORECAST'));
  const all=await fetchUtilizationHistory(fakeClient(tables),{...query,start:run.history_start},new AbortController().signal);assert.equal(all.frames.length,2017);
  const report=analytics.calculateUtilization(all,{start:Date.parse(run.history_start),end:Date.parse(run.last_simulated_at),liveAnchor:run.live_anchor,staleAfterMs:360_000});
  assert.equal(report.knownMs,7*86400_000);assert.equal(report.missingMs,0);
  for(const field of ['elapsedMs','knownMs','missingMs','normalVacantMs','reducedMs','appliedMs'])assert.equal(report.days.reduce((sum,day)=>sum+day[field],0),report[field]);
  assert.equal(Object.values(report.modeMs).reduce((a,b)=>a+b,0),report.knownMs);
});
test('incremental queries fetch newer frames and retain checkpoint limits',async()=>{
  const client=fakeClient(tables),query={runId:run.run_id,zoneId:'zone-1',sequence:2015,afterSequence:2012,start:run.history_start,end:run.last_simulated_at};
  const result=await fetchUtilizationHistory(client,query,new AbortController().signal);assert.deepEqual(result.frames.map(f=>f.sequence),[2013,2014,2015]);
  assert.ok(!client.queries.some(q=>q.table==='sdp_zone_frames'&&q.limit===1));
});
test('invalid correlation and query failures fail clearly without private error contents',async()=>{
  const query={runId:run.run_id,zoneId:'zone-1',sequence:2016,start:run.history_start,end:run.last_simulated_at};
  const wrong=structuredClone(tables);wrong.sdp_events.find(e=>e.event_type==='APPLIED_OUTPUT').event.payload.command_id='wrong';
  await assert.rejects(fetchUtilizationHistory(fakeClient(wrong),query,new AbortController().signal),/inconsistent/);
  await assert.rejects(fetchUtilizationHistory(fakeClient(tables,()=>({data:null,error:{code:'42501',message:'private'}})),query,new AbortController().signal),e=>/blocked/.test(e.message)&&!e.message.includes('private'));
});
