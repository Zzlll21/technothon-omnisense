import test from 'node:test';
import assert from 'node:assert/strict';
import {compileSource, sourceUrl, fakeClient, overviewFixture, runtimeRewrite} from './overview-fixture.mjs';
const display = sourceUrl(new URL('../src/lib/predictiveDisplay.ts', import.meta.url), [['./nodeHistoryDisplay', sourceUrl(new URL('../src/lib/nodeHistoryDisplay.ts', import.meta.url))]]);
const {landingMoments, landingSnapshot, activeLandingForecast} = await compileSource(new URL('../src/lib/landingMoments.ts', import.meta.url), [['./predictiveDisplay', display]]);
const {fetchOverview} = await compileSource(new URL('../src/api/overview.ts', import.meta.url), runtimeRewrite);
const {fetchPredictiveHistory} = await compileSource(new URL('../src/api/predictiveHistory.ts', import.meta.url), runtimeRewrite);
const tables = overviewFixture(undefined, true), run = tables.sdp_runs[0];
const history = await fetchPredictiveHistory(fakeClient(tables), {runId:run.run_id, zoneId:'zone-1', nodeId:'sim-1', sequence:run.last_sequence, start:new Date(Date.parse(run.last_simulated_at)-86400000).toISOString(),end:run.last_simulated_at},new AbortController().signal);
const data = await fetchOverview(fakeClient(tables), new AbortController().signal);
test('landing moments use real correlated frames and the recorded decision onset', () => {
  const before=structuredClone(history), moments=landingMoments(history);
  assert.equal(moments.length,3);
  for(const moment of moments){
    assert.ok(moment.sequence!==undefined);
    const snapshot=landingSnapshot(data,history,moment.sequence);
    assert.equal(snapshot.decision.payload.requested_mode,moment.mode);
    assert.equal(snapshot.sample.sequence,snapshot.frame.sequence);
    assert.equal(snapshot.sample.node_id,'sim-1');
    assert.equal(snapshot.output.payload.decision_event_id,snapshot.decision.event_id);
    assert.ok(Date.parse(snapshot.forecast.occurred_at)<=Date.parse(snapshot.frame.simulated_at));
    assert.equal(history.frames.some(f=>f.decision_event_id===snapshot.decision.event_id&&f.sequence<snapshot.frame.sequence&&f.occupancy===snapshot.frame.occupancy),false);
    if(moment.mode==='OCCUPIED')assert.equal(snapshot.frame.occupancy,'OCCUPIED');
  }
  assert.deepEqual(history,before);
});
test('missing moments and rolled-out snapshots are unavailable, never fabricated or replaced with live data',()=>{
  assert.ok(landingMoments({frames:[],events:[],samples:[]}).every(m=>m.sequence===undefined));
  assert.equal(landingSnapshot(data,history,-1),null);
  const latest=landingSnapshot(data,history);
  assert.equal(latest.frame,data.frame);assert.equal(latest.historical,false);
});
test('expired, cancelled and future-issued plans cannot appear as active landing forecasts',()=>{
  const forecast=structuredClone(data.forecast), at=Date.parse(forecast.occurred_at);
  assert.equal(activeLandingForecast(forecast,at),forecast);
  assert.equal(activeLandingForecast(forecast,at-1),null);
  assert.equal(activeLandingForecast(forecast,Date.parse(forecast.payload.expires_at)),null);
  forecast.payload.status='CANCELLED';assert.equal(activeLandingForecast(forecast,at),null);
  assert.equal(activeLandingForecast(null,at),null);
});
