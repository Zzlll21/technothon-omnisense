import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createHybridRun,prepareHybridTick} from '../../../services/sdp-generator/dist/hybridModel.js';
import {normalizeHardwareTelemetry} from '../../../services/sdp-generator/dist/hardwareTelemetry.js';
import {sourceUrl,fakeClient,runtimeRewrite,overviewFixture} from './overview-fixture.mjs';
const url=(path,rewrites=[])=>sourceUrl(new URL(path,import.meta.url),rewrites);
const overview=await import(url('../src/api/overview.ts',runtimeRewrite));
const nodesApi=await import(url('../src/api/nodeHistory.ts',runtimeRewrite));
const predictive=await import(url('../src/api/predictiveHistory.ts',runtimeRewrite));
const utilization=await import(url('../src/api/utilizationHistory.ts',runtimeRewrite));
const apiUrl=url('../src/api/operatingRecords.ts',runtimeRewrite),csvUrl=url('../src/lib/sdpRecords.ts');
const nodeUrl=url('../src/lib/nodeHistoryDisplay.ts'),overviewUrl=url('../src/lib/overviewDisplay.ts');
const predictiveUrl=url('../src/lib/predictiveDisplay.ts',[['./nodeHistoryDisplay',nodeUrl]]);
const displayUrl=url('../src/lib/operatingRecordsDisplay.ts',[['./sdpRecords',csvUrl],['./nodeHistoryDisplay',nodeUrl],['./predictiveDisplay',predictiveUrl],['./overviewDisplay',overviewUrl]]);
const api=await import(apiUrl),display=await import(displayUrl),nodeDisplay=await import(nodeUrl);
const {buildOperatingCsv}=await import(url('../src/api/exportOperatingRecords.ts',[['./operatingRecords',apiUrl],['../lib/operatingRecordsDisplay',displayUrl],['../lib/sdpRecords',csvUrl]]));
const {spatialOverview}=await import(url('../src/lib/spatialOverview.ts',[['./overviewDisplay',overviewUrl]]));
const firmware=JSON.parse(await readFile(new URL('../../../services/sdp-generator/test/fixtures/firmware-replay.json',import.meta.url)));
const anchor='2026-01-08T04:00:00.000Z',ms=Date.parse(anchor),iso=n=>new Date(ms+n).toISOString();
function fixture(count=5){
 const run=createHybridRun('99999999-9999-4999-8999-999999999999',anchor,['demo-1','demo-2'].map((node_id,i)=>({node_id,label:node_id,x:.3+i*.4,y:.5})));
 const tables={sdp_runs:[],sdp_zones:[{run_id:run.run_id,zone_id:'zone-1',room_id:run.config.room_id,name:'Hybrid office',config:run.config}],sdp_nodes:run.config.payload.required_nodes.map(n=>({run_id:run.run_id,zone_id:'zone-1',required:true,...n})),sdp_zone_frames:[],sdp_events:[],sdp_node_samples:[]};
 const entries=['demo-1','demo-2'].map((node,i)=>{
  const r=normalizeHardwareTelemetry(`omnisense/node/${node}/telemetry`,JSON.stringify({...firmware.packets.occupied,node_id:node,temperature:i?'N/A':25.4,humidity:i?64:50}),{received_at:anchor,allowed_node_ids:['demo-1','demo-2']});assert.ok(r.ok);
  return {evidence_id:`${node}:acquisition`,reading:r.value};
 });
 let tick;
 for(let i=0;i<count;i++){
  tick=prepareHybridTick(run,tick?.checkpoint??null,iso(i*30_000),entries);
  const scope={run_id:run.run_id,zone_id:'zone-1',sequence:i};
  tables.sdp_zone_frames.push({...scope,...tick.frame,inserted_at:iso(i*30_000)});
  tables.sdp_events.push(...tick.events.map((e,ordinal)=>({...scope,ordinal,event_id:e.event_id,event_type:e.event_type,occurred_at:e.occurred_at,event:e})));
  tables.sdp_node_samples.push(...tick.samples.map(s=>({...scope,...s,inserted_at:iso(i*30_000),evidence:{event:tables.sdp_events.find(e=>e.event_id===s.evidence_event_id)?.event}})));
 }
 tables.sdp_runs=[{...run,status:'ACTIVE',last_sequence:tick.frame.sequence,last_simulated_at:tick.frame.simulated_at,updated_at:tick.frame.simulated_at}];
 return tables;
}
const signal=()=>new AbortController().signal;
function scope(t){const r=t.sdp_runs[0];return {runId:r.run_id,zoneId:'zone-1',nodeId:'demo-1',sequence:r.last_sequence,modelVersion:r.model_version,start:anchor,end:r.last_simulated_at};}

test('private overview pins the approved Hybrid run before reading any dependent table',async()=>{
 const hybrid=fixture(1),id=hybrid.sdp_runs[0].run_id,synthetic=overviewFixture();
 const mixed=Object.fromEntries(Object.keys(hybrid).map(table=>[table,[...hybrid[table],...synthetic[table]]]));
 const client=fakeClient(mixed),data=await overview.fetchOverview(client,signal(),id);
 assert.equal(data.run.run_id,id);assert.equal(data.run.model_version,'sdp-hybrid-v1');
 assert.ok(client.queries.every(q=>q.filters.some(([op,key,value])=>op==='eq'&&key==='run_id'&&value===id)));
 assert.ok(client.queries[0].filters.some(([op,key,value])=>op==='eq'&&key==='model_version'&&value==='sdp-hybrid-v1'));
 const unrelated=fakeClient(synthetic);assert.equal(await overview.fetchOverview(unrelated,signal(),id),null);
 assert.equal(unrelated.queries.length,1,'do not read samples from an unrelated active run');
 const inaccessible=fakeClient({});assert.equal(await overview.fetchOverview(inaccessible,signal(),id),null);
 assert.equal(inaccessible.queries.length,1);
 const dishonest=fakeClient(hybrid,q=>q.table==='sdp_runs'?{data:synthetic.sdp_runs,error:null}:undefined);
 await assert.rejects(overview.fetchOverview(dishonest,signal(),id),/approved Hybrid run/);assert.equal(dishonest.queries.length,1);
 await assert.rejects(overview.fetchOverview(fakeClient(hybrid),signal(),''),/not configured/);
});

test('thermal fallback may establish occupied evidence but is not displayed as a valid Thermal AI headcount',async()=>{
 const tables=fixture(1),event=tables.sdp_events.find(r=>r.event_type==='NODE_EVIDENCE').event;
 Object.assign(event.payload.hardware,{inference_method:'THERMAL_BLOB_FALLBACK',headcount_source:'thermal_blob_fallback',thermal_ai_label:'THERMAL_ANOMALIES'});
 const view=spatialOverview(await overview.fetchOverview(fakeClient(tables),signal()),ms);
 assert.equal(view.nodes[0].occupancy,'Occupied');assert.equal(view.nodes[0].headcount,null);assert.equal(view.nodes[1].headcount,1);
});

test('hybrid overview preserves independent validity, original receipts, freshness and simulated output',async()=>{
 const t=fixture(),data=await overview.fetchOverview(fakeClient(structuredClone(t)),signal());
 assert.equal(data.run.model_version,'sdp-hybrid-v1');assert.equal(data.samples[0].received_at,anchor);
 assert.equal(data.samples[1].temperature_c,null);assert.equal(data.samples[1].humidity_percent,64);
 assert.equal(data.evidence.length,2);assert.equal(data.output.payload.feedback_basis,'SIMULATED');
 const view=spatialOverview(data,ms+120_000);assert.ok(view.nodes.every(n=>n.freshness==='Stale'));
 assert.equal(view.representative.temperature,25.4);assert.equal(view.nodes[1].temperature,null);
 assert.ok(view.nodes.every(n=>n.headcount===1&&n.occupancy==='Occupied'),'hardware counts remain available independently of missing temperature');
});
test('all persisted readers accept LIVE only with a pinned hybrid model and retain historical correlations',async()=>{
 const t=fixture(),s=scope(t);
 const history=await nodesApi.fetchNodeHistory(fakeClient(structuredClone(t)),s,signal());
 assert.equal(history.length,5);assert.equal(history[4].received_at,anchor);assert.equal(history[3].stale,true);
 assert.equal(nodeDisplay.numericSegments(history,anchor,'temperature_c').flat().length,1);
 const left={...history[0],sequence:0,observed_at:iso(60_000),received_at:anchor,fresh_until:iso(90_000),stale:false};
 const right={...history[1],sequence:1,observed_at:iso(120_000),received_at:iso(100_000),fresh_until:iso(190_000),stale:false,evidence_event_id:'another-acquisition'};
 assert.equal(nodeDisplay.numericSegments([left,right],anchor,'temperature_c').length,2);
 assert.equal(nodeDisplay.occupancySpans([left],anchor,ms+200_000)[0].end,ms+90_000);
 const pred=await predictive.fetchPredictiveHistory(fakeClient(structuredClone(t)),s,signal());assert.equal(pred.frames.length,5);
 const usage=await utilization.fetchUtilizationHistory(fakeClient(structuredClone(t)),s,signal());assert.equal(usage.frames.length,5);
 const snap={...s,zoneName:'Hybrid office',at:s.end},filters={start:anchor,end:iso(120_001),category:'ALL',mode:'',search:'',searchField:'text'};
 const records=await api.fetchOperatingPage(fakeClient(structuredClone(t)),snap,filters,1,500,signal());
 assert.ok(records.rows.every(c=>!c.warnings.length));
 const pinned=await api.fetchOperatingPage(fakeClient(structuredClone(t)),{...snap,sequence:1,at:iso(30_000)},filters,1,500,signal());
 assert.ok(pinned.rows.every(c=>c.row.sequence<=1&&Date.parse(c.row.occurred_at)<=ms+30_000));
 await assert.rejects(nodesApi.fetchNodeHistory(fakeClient(structuredClone(t)),{...s,modelVersion:'sdp-scripted-v1'},signal()));
 const bad=structuredClone(t);bad.sdp_node_samples[0].temperature_c=99;
 await assert.rejects(predictive.fetchPredictiveHistory(fakeClient(bad),s,signal()),/mismatch/);
});
test('missing hardware projections remain null, omit invented evidence and never borrow another node environment',async()=>{
 const t=fixture(1),sample=t.sdp_node_samples[0];
 Object.assign(sample,{observed_at:null,temperature_c:null,humidity_percent:null,temperature_observed_at:null,humidity_observed_at:null,evidence_event_id:null,evidence:null});
 const e=t.sdp_events.find(r=>r.event_type==='ZONE_DECISION');e.event.payload.node_states[0]={node_id:'demo-1',state:'MISSING',evidence_event_id:null};
 const data=await overview.fetchOverview(fakeClient(structuredClone(t)),signal());assert.equal(data.evidence.length,1);
 assert.equal(spatialOverview(data,ms).representative.temperature,null);
 assert.deepEqual(await nodesApi.fetchNodeHistory(fakeClient(t),scope(t),signal()),[]);
});
test('hybrid CSV exports stored hardware metadata and both nodes without a fabricated environmental summary',async()=>{
 const t=fixture(260),s=scope(t),snapshot={...s,zoneName:'Hybrid office',at:s.end},filters={start:anchor,end:iso(259*30_000+1),category:'ALL',mode:'',search:'',searchField:'text'};
 const client=fakeClient(structuredClone(t));const result=await buildOperatingCsv(client,snapshot,filters,signal(),()=>{});
 assert.ok(result.parts.join('').includes('Stored event JSON'));assert.ok(result.parts.join('').includes('Hybrid SDP operating records: MEASURED'));
 assert.ok(result.parts.join('').includes('GATEWAY_RECEIPT'));assert.ok(result.parts.join('').includes('demo-1'));assert.ok(result.parts.join('').includes('demo-2'));
 assert.ok(result.parts.join('').includes('SIMULATED'));assert.ok(client.queries.filter(q=>q.table==='sdp_events'&&q.count==='exact').length>1);
 assert.ok(display.operatingCsvHeader(snapshot).length>display.operatingCsvColumns.length);
});
test('legacy CSV layout and bytes remain identical when its stored model is explicitly pinned',async()=>{
 const t=overviewFixture(),r=t.sdp_runs[0],snap={runId:r.run_id,zoneId:'zone-1',zoneName:'SDP Demo Cooling Zone',sequence:r.last_sequence,at:r.last_simulated_at};
 const filters={start:iso(-7*86400_000+1),end:'2026-10-21T04:50:00.001Z',category:'ALL',mode:'',search:'',searchField:'text'};
 filters.start=new Date(Date.parse(r.history_start)+1).toISOString();
 const a=await buildOperatingCsv(fakeClient(t),snap,filters,signal(),()=>{}),b=await buildOperatingCsv(fakeClient(t),{...snap,modelVersion:'sdp-scripted-v1'},filters,signal(),()=>{});
 assert.equal(a.parts.join(''),b.parts.join(''));assert.deepEqual(display.operatingCsvHeader(snap),display.operatingCsvColumns);
 // Captured from ec62d18's original CSV implementation, not from the modified exporter.
 assert.equal(createHash('sha256').update(a.parts.join('')).digest('hex'),'05a2bd40af0fee2b1876b41e53edd03a0515a49d0acd12d7e991d91b2fad559e');
});
