import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const context=vm.createContext({window:{},Date,Math,Intl});
vm.runInContext(await readFile(new URL('./fixtures.js',import.meta.url),'utf8'),context);
const o=context.window.OMNI;
assert.equal(o.samples.length,10081,'Seven days of minute records, including final observation');
assert.equal(o.current.nodes.length,2,'Exactly two current sensor nodes');
assert.deepEqual(Array.from(new Set(o.samples.flatMap(s=>s.nodes.map(n=>n.id)))).sort(),['node-01','node-02']);
assert.equal(o.current.occupancy,'Vacant');
assert.equal(o.latestDecision.mode,'Reduced');
assert.equal(o.clock(o.currentForecast.expected),'14:00');
assert.equal(o.clock(o.currentForecast.restart),'13:40');
assert.equal(o.currentForecast.expected-o.currentForecast.restart,20*60000);
for(const s of o.samples){
  assert(['Occupied','Vacant','Uncertain'].includes(s.occupancy));
  assert(s.mode===null||o.modes.includes(s.mode));
  for(const n of s.nodes){
    if(!n.valid){assert.equal(n.temperature,null);assert.equal(n.humidity,null);assert.equal(n.occupancy,'Uncertain');}
    else{assert(Number.isFinite(n.temperature));assert(n.humidity>=0&&n.humidity<=100);}
  }
}
for(const days of [1,7]){
  const list=o.samples.filter(s=>s.t>=o.end-days*86400000&&s.t<o.end);
  const totals={Normal:0,Reduced:0,'Pre-cooling':0,Unknown:0};
  const matrix={Occupied:0,Vacant:0,Uncertain:0};
  for(const s of list){totals[s.mode??'Unknown']++;if(s.mode)matrix[s.occupancy]++;}
  assert.equal(Object.values(totals).reduce((a,b)=>a+b),days*1440);
  assert.equal(Object.values(matrix).reduce((a,b)=>a+b)+totals.Unknown,days*1440);
  assert(totals.Unknown>0,'Coverage gaps must be visible rather than silently assigned a mode');
  if(days===1)assert.deepEqual(totals,{Normal:340,Reduced:1032,'Pre-cooling':60,Unknown:8});
}
for(const event of o.events.filter(e=>e.kind==='Reported output')){
  const request=o.events.find(e=>e.id===event.requestId);
  assert(request&&request.kind==='Decision','Every output must have its own recorded decision');
  assert.equal(event.mode,request.mode);
  assert(event.t>request.t,'Reports follow the linked request');
  assert.equal(event.mismatch,event.reported!==event.mode);
}
const mismatch=o.events.find(e=>e.mismatch);
assert(mismatch,'Historical mismatch must remain inspectable');
assert(o.events.some(e=>e.requestId===mismatch.requestId&&e.t>mismatch.t&&e.reported===e.mode),'A later corrected report must not erase the earlier mismatch');
assert(o.events.some(e=>e.kind==='Decision'&&e.occupancy==='Uncertain'&&e.snapshot.nodes.every(n=>n.valid)),'Fresh disagreement is inspectable');
assert(o.events.some(e=>e.kind==='Decision'&&e.snapshot.nodes.some(n=>!n.valid)),'Stale evidence is inspectable');
console.log('PASS: one zone / two nodes; supported fields; 24h & 7d duration and coverage reconciliation; forecast timing; request-output correlations; disagreement and stale evidence.');
