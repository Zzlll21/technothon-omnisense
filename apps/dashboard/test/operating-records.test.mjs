import test from 'node:test';
import assert from 'node:assert/strict';
import { compileSource,sourceUrl,fakeClient,overviewFixture,runtimeRewrite,selectRows } from './overview-fixture.mjs';
const url=(path,rewrites=[])=>sourceUrl(new URL(path,import.meta.url),rewrites);
const apiUrl=url('../src/api/operatingRecords.ts',runtimeRewrite),csvUrl=url('../src/lib/sdpRecords.ts');
const nodeUrl=url('../src/lib/nodeHistoryDisplay.ts'),overviewUrl=url('../src/lib/overviewDisplay.ts');
const predictiveUrl=url('../src/lib/predictiveDisplay.ts',[['./nodeHistoryDisplay',nodeUrl]]);
const displayUrl=url('../src/lib/operatingRecordsDisplay.ts',[['./sdpRecords',csvUrl],['./nodeHistoryDisplay',nodeUrl],['./predictiveDisplay',predictiveUrl],['./overviewDisplay',overviewUrl]]);
const api=await import(apiUrl),display=await import(displayUrl);
const {buildOperatingCsv}=await compileSource(new URL('../src/api/exportOperatingRecords.ts',import.meta.url),[['./operatingRecords',apiUrl],['../lib/operatingRecordsDisplay',displayUrl],['../lib/sdpRecords',csvUrl]]);
const tables=overviewFixture(undefined,true),run=tables.sdp_runs[0];
const snapshot={runId:run.run_id,zoneId:'zone-1',zoneName:'SDP Demo Cooling Zone',sequence:run.last_sequence,at:run.last_simulated_at};
const filters={start:run.history_start,end:new Date(Date.parse(run.last_simulated_at)+1).toISOString(),category:'OPERATIONS',mode:'',search:'',searchField:'text'};
// Keep the seven-day query within the supported duration while including the last instant.
filters.start=new Date(Date.parse(filters.start)+1).toISOString();
const load=(client=fakeClient(tables),query=filters,page=1,size=25)=>api.fetchOperatingPage(client,snapshot,query,page,size,new AbortController().signal);
function parseCsv(text){
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(!quoted&&(c===','||c==='\r')){row.push(cell);cell='';if(c==='\r'){assert.equal(text[++i],'\n');rows.push(row);row=[];}}else cell+=c;}
  return rows;
}
test('server-side filters, exact count and stable newest-first pagination share the same snapshot',async()=>{
  const client=fakeClient(tables),a=await load(client),b=await load(client,filters,2);
  assert.equal(a.rows.length,25);assert.equal(a.total,b.total);assert.ok(a.total>25);
  assert.equal(new Set([...a.rows,...b.rows].map(c=>c.row.event_id)).size,50);
  const first=client.queries[0];assert.equal(first.count,'exact');assert.deepEqual(first.orders,[['occurred_at',false],['sequence',false],['ordinal',false]]);
  for(let i=1;i<a.rows.length;i++){const previous=a.rows[i-1].row,current=a.rows[i].row;assert.ok(Date.parse(previous.occurred_at)>Date.parse(current.occurred_at)||previous.sequence>current.sequence||previous.ordinal>current.ordinal);}
  assert.ok(client.queries.every(q=>['sdp_events','sdp_zone_frames'].includes(q.table)));
  assert.ok(client.queries.every(q=>q.filters.some(([op,key,value])=>op==='eq'&&key==='run_id'&&value===run.run_id)));
});
test('category, requested mode and stored-text search filter the entire matching set',async()=>{
  const client=fakeClient(tables),result=await load(client,{...filters,category:'ZONE_DECISION',mode:'PRECOOL',search:'FORECAST_RESTART'},1,500);
  assert.ok(result.total>5);assert.equal(result.total,result.rows.length);
  assert.ok(result.rows.every(c=>c.row.event.event_type==='ZONE_DECISION'&&c.row.event.payload.requested_mode==='PRECOOL'));
  assert.ok(client.queries[0].filters.some(([op,key])=>op==='ilike'&&key==='event->>payload'));
  const noReports=await load(fakeClient(tables),{...filters,category:'APPLIED_OUTPUT',mode:'PRECOOL'});assert.equal(noReports.total,0);
});
test('search treats wildcard and filter-like characters literally and supports identifiers',async()=>{
  const changed=structuredClone(tables),row=changed.sdp_events.find(r=>r.event_type==='ZONE_DECISION'&&Date.parse(r.occurred_at)>Date.parse(filters.start));
  row.event.payload.reason_text='100% load_1, "quoted" (text)';
  const match=await load(fakeClient(changed),{...filters,search:'100% load_1'});assert.equal(match.total,1);
  const id=await load(fakeClient(tables),{...filters,search:row.event_id,searchField:'event_id'});assert.equal(id.total,1);
  assert.equal(api.literalSearch('%_\\'),'%\\%\\_\\\\%');
});

test('universal search uses one server OR across descriptions, identifiers, type and zone within the same scope',async()=>{
  const target=tables.sdp_events.find(r=>r.event_type==='ZONE_DECISION'&&Date.parse(r.occurred_at)>Date.parse(filters.start));
  for(const search of [target.event_id,target.event.correlation_id,'FORECAST_RESTART','zone-1','ZONE_FORECAST']){
    const client=fakeClient(tables),result=await load(client,{...filters,category:'ALL',search,searchField:'all'},1,500);
    assert.ok(result.total>0);
    assert.ok(result.rows.every(({row})=>[JSON.stringify(row.event.payload),row.event_id,row.event.correlation_id,row.event_type,row.zone_id].some(value=>value.toLowerCase().includes(search.toLowerCase()))));
    assert.equal(client.queries[0].filters.filter(([op])=>op==='or').length,1);
    assert.ok(client.queries[0].filters.some(([op,key,value])=>op==='eq'&&key==='run_id'&&value===snapshot.runId));
  }
  const exact=await load(fakeClient(tables),{...filters,category:'ALL',search:target.event_id,searchField:'event_id'});assert.equal(exact.total,1);
});

test('universal search quotes reserved OR grammar and escapes percent, underscore, quotes and backslash independently',async()=>{
  const changed=structuredClone(tables),row=changed.sdp_events.find(r=>r.event_type==='ZONE_DECISION'&&Date.parse(r.occurred_at)>Date.parse(filters.start));
  for(const search of ['100% load_1, "quoted" (text) \\folder','"),zone_id.neq.other,or(event_id.neq.any)']){
    row.event.payload.reason_text=search;
    const result=await load(fakeClient(changed),{...filters,category:'ALL',search,searchField:'all'});
    assert.equal(result.total,1);assert.equal(result.rows[0].row.event_id,row.event_id);
  }
});

test('universal search, category and mode compose identically for pagination and full CSV export',async()=>{
  const query={...filters,category:'ALL',search:'sim-1',searchField:'all'},client=fakeClient(tables);
  const first=await load(client,query,1,25),second=await load(client,query,2,25);
  assert.ok(first.total>500);assert.equal(first.total,second.total);
  assert.equal(new Set([...first.rows,...second.rows].map(c=>c.row.event_id)).size,50);
  const result=await buildOperatingCsv(client,snapshot,query,new AbortController().signal,()=>{}),csv=parseCsv(result.parts.join(''));
  assert.equal(result.count,first.total);assert.equal(csv.length,result.count+1);
  const ids=new Set(csv.slice(1).map(row=>row[csv[0].indexOf('Event ID')]));
  assert.ok([...first.rows,...second.rows].every(c=>ids.has(c.row.event_id)));
  const restricted=await load(fakeClient(tables),{...filters,category:'ZONE_DECISION',mode:'PRECOOL',search:'FORECAST_RESTART',searchField:'all'},1,500);
  assert.ok(restricted.total>0);assert.ok(restricted.rows.every(c=>c.row.event_type==='ZONE_DECISION'&&c.decision.payload.requested_mode==='PRECOOL'));
});
test('correlation uses exact frames, decision IDs, command IDs and historical forecast references',async()=>{
  const result=await load(fakeClient(tables),{...filters,category:'ZONE_DECISION'},1,500);
  for(const context of result.rows){assert.ok(context.frame);assert.equal(context.frame.sequence,context.row.sequence);assert.equal(context.warnings.length,0);assert.equal(context.outputs.length,1);assert.equal(context.outputs[0].payload.command_id,context.decision.payload.command_id);assert.equal(context.forecast.event_id,context.decision.payload.forecast_event_id);}
});
test('unmatched reports and absent frames show warnings without attaching unrelated records',async()=>{
  const changed=structuredClone(tables),output=changed.sdp_events.find(r=>r.event_type==='APPLIED_OUTPUT'&&Date.parse(r.occurred_at)>Date.parse(filters.start));output.event.payload.command_id='wrong';
  const result=await load(fakeClient(changed),{...filters,search:output.event_id,searchField:'event_id'});
  assert.equal(result.rows[0].decision,null);assert.ok(result.rows[0].warnings.length);
  changed.sdp_zone_frames=[];
  const noFrame=await load(fakeClient(changed),{...filters,search:output.event_id,searchField:'event_id'});assert.equal(noFrame.rows[0].frame,null);
});
test('a future forecast cannot explain an earlier decision',async()=>{
  const changed=structuredClone(tables),decisions=changed.sdp_events.filter(e=>e.event_type==='ZONE_DECISION');
  const decision=decisions[1],future=changed.sdp_events.filter(e=>e.event_type==='ZONE_FORECAST').at(-1);decision.event.payload.forecast_event_id=future.event_id;
  const result=await load(fakeClient(changed),{...filters,search:decision.event_id,searchField:'event_id'});assert.equal(result.rows[0].forecast,null);assert.match(result.rows[0].warnings.join(' '),/forecast/);
});
test('complete CSV exports pass through every server page and preserve filter provenance',async()=>{
  const client=fakeClient(tables),query={...filters,category:'NODE_EVIDENCE'},progress=[];
  const result=await buildOperatingCsv(client,snapshot,query,new AbortController().signal,(done,total)=>progress.push([done,total]));
  const rows=parseCsv(result.parts.join(''));assert.equal(rows.length,result.count+1);assert.ok(result.count>500);assert.equal(progress.at(-1)[0],result.count);
  assert.ok(client.queries.filter(q=>q.count).length>1);
  assert.equal(rows[1][0],'Simulated SDP operating records');assert.match(rows[1][1],/\+08:00/);assert.equal(rows[1][rows[0].indexOf('Category filter')],'NODE_EVIDENCE');
  assert.equal(new Set(rows.slice(1).map(r=>r[rows[0].indexOf('Event ID')])).size,result.count);
});
test('CSV escapes multiline text, quotes and spreadsheet formula-like strings',async()=>{
  const context=(await load(fakeClient(tables),{...filters,category:'ZONE_DECISION'})).rows[0];
  context.decision.payload.reason_text='=SUM(1,2)\n"quoted"';
  const cells=parseCsv(display.operatingCsvRow(context,snapshot,filters))[0];
  assert.equal(cells[display.operatingCsvColumns.indexOf('Decision reason')],'\'=SUM(1,2)\n"quoted"');
  const {csvCell}=await import(csvUrl);
  for(const value of ['+1','-cmd','@SUM','\tformula','\rformula','\nformula','  =2'])assert.match(csvCell(value),/^"'/);
});
test('CSV keeps requested settings and reported outcomes in different columns',async()=>{
  const context=(await load(fakeClient(tables),{...filters,category:'ZONE_DECISION'})).rows[0],cells=parseCsv(display.operatingCsvRow(context,snapshot,filters))[0];
  assert.equal(cells[display.operatingCsvColumns.indexOf('Requested mode')],context.decision.payload.requested_mode);
  assert.equal(cells[display.operatingCsvColumns.indexOf('Reported output status')],'APPLIED');
  assert.notEqual(display.operatingCsvColumns.indexOf('Requested fan'),display.operatingCsvColumns.indexOf('Reported fan'));
});
test('oversized exports fail explicitly, and cancellation prevents completion',async()=>{
  const client=fakeClient(tables,(q)=>q.count?{data:[],count:50001,error:null}:undefined);
  await assert.rejects(buildOperatingCsv(client,snapshot,filters,new AbortController().signal,()=>{}),/50,000/);
  const controller=new AbortController();controller.abort();await assert.rejects(buildOperatingCsv(fakeClient(tables),snapshot,filters,controller.signal,()=>{}),/abort/i);
});
test('export rejects changing totals rather than downloading an incomplete result',async()=>{
  let count=0;
  const client=fakeClient(tables,q=>{if(!q.count)return;const all=selectRows(tables[q.table],q.filters,q.orders);return{data:all.slice(q.offset,q.offset+q.limit),count:all.length+(count++?1:0),error:null};});
  await assert.rejects(buildOperatingCsv(client,snapshot,{...filters,category:'NODE_EVIDENCE'},new AbortController().signal,()=>{}),/changed/);
});
test('custom ranges use Malaysia midnight, validate seven-day bounds and reject future dates',()=>{
  const now=Date.parse('2026-10-21T04:00:00Z'),range=display.recordRange('custom',now,'2026-10-20','2026-10-21');
  assert.equal(range.start,'2026-10-19T16:00:00.000Z');assert.equal(range.end,new Date(now).toISOString());
  assert.throws(()=>display.recordRange('custom',now,'2026-10-01','2026-10-21'),/seven/);
  assert.throws(()=>display.recordRange('custom',now,'2026-10-20','2026-10-22'),/today/);
});
