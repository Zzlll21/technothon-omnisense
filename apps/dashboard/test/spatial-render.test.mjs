import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { compileSource, fakeClient, overviewFixture, runtimeRewrite } from './overview-fixture.mjs';

const server = await createServer({ root: fileURLToPath(new URL('../',import.meta.url)), server: { middlewareMode:true }, appType:'custom', logLevel:'silent' });
test.after(() => server.close());
const { NodeInspector } = await server.ssrLoadModule('/src/components/spatial/NodeInspector.tsx');
const { OfficeCanvas } = await server.ssrLoadModule('/src/components/spatial/OfficeCanvas.tsx');
const { ZoneWorkspace } = await server.ssrLoadModule('/src/components/spatial/ZoneWorkspace.tsx');
const { spatialOverview } = await server.ssrLoadModule('/src/lib/spatialOverview.ts');
const { fetchOverview } = await compileSource(new URL('../src/api/overview.ts',import.meta.url),runtimeRewrite);
const base = await fetchOverview(fakeClient(overviewFixture()),new AbortController().signal);
const at=Date.parse(base.frame.simulated_at);
function render(data,nodeId,now=at){return renderToStaticMarkup(React.createElement(NodeInspector,{data,model:spatialOverview(data,now),nodeId,now,refreshToken:null,onSelect:()=>{},onClose:()=>{}}));}
function readings(html){return html.match(/class="sz-drawer-values"([\s\S]*?)<dl/)[1];}

test('Hybrid cooling card binds the controller setpoint, while the synthetic response presentation stays unchanged',()=>{
 const data=structuredClone(base);data.run.model_version='sdp-hybrid-v1';
 data.decision.payload.requested_output={fan:'LOW',setpoint_c:27};
 data.output.payload.reported_output={fan:'OFF',setpoint_c:null};
 const html=renderToStaticMarkup(React.createElement(ZoneWorkspace,{data,model:spatialOverview(data,at),now:at,refreshToken:null,active:true}));
 const output=html.match(/class="sz-output"([\s\S]*?)<div class="sz-plan-pair"/)[1];
 assert.match(output,/Controller target/);assert.match(output,/Fan low · 27.0 °C/);assert.match(output,/Requested/);assert.doesNotMatch(output,/Fan off|applied/);
 const synthetic=renderToStaticMarkup(React.createElement(ZoneWorkspace,{data:base,model:spatialOverview(base,at),now:at,refreshToken:null,active:true}));
 assert.match(synthetic,/Cooling response/);assert.doesNotMatch(synthetic,/Controller target/);
});

test('node cards show independent stored occupancy and counts, including zero and the capped 3+ category',()=>{
  for(const counts of [[0,1],[2,3]]){
    const data=structuredClone(base);
    data.samples.forEach((sample,index)=>{
      const evidence=data.evidence.find(e=>e.event_id===sample.evidence_event_id);
      evidence.payload.classification.value={class_label:['EMPTY_CORE','OCCUPIED_1P','OCCUPIED_2P','OCCUPIED_3P_PLUS'][counts[index]],class_scores:null,headcount_category:['ZERO','ONE','TWO','THREE_PLUS'][counts[index]]};
    });
    const model=spatialOverview(data,at);
    const html=renderToStaticMarkup(React.createElement(OfficeCanvas,{nodes:model.nodes,selectedId:null,onSelect:()=>{}}));
    const cards=html.slice(html.indexOf('class="sz-node-readings"')).split('data-node-id=').slice(1);
    counts.forEach((count,index)=>{
      assert.equal(model.nodes[index].headcount,count);
      assert.ok(cards[index].includes(`Occupancy: <strong>${count?'Occupied':'Vacant'}</strong>`));
      assert.ok(cards[index].includes(`Headcount: <strong>${count===3?'3+':count}</strong>`));
    });
    const stale=spatialOverview(data,at+data.zone.config.payload.freshness.disconnected_after_ms+1);
    const staleHtml=renderToStaticMarkup(React.createElement(OfficeCanvas,{nodes:stale.nodes,selectedId:null,onSelect:()=>{}}));
    assert.equal((staleHtml.match(/Last reported/g)||[]).length,2);
  }
});

test('invalid raw hardware zero and missing node evidence never render as a confirmed zero count',()=>{
  const data=structuredClone(base),sample=data.samples[0];
  const evidence=data.evidence.find(e=>e.event_id===sample.evidence_event_id);
  evidence.payload.hardware={headcount:0};
  evidence.payload.classification={...evidence.payload.classification,value:null,validity:'UNAVAILABLE'};
  data.samples=data.samples.filter(s=>s.node_id===sample.node_id);
  const nodes=spatialOverview(data,at).nodes;
  assert.ok(nodes.every(n=>n.headcount===null&&n.occupancy==='Unavailable'));
  const html=renderToStaticMarkup(React.createElement(OfficeCanvas,{nodes,selectedId:null,onSelect:()=>{}}));
  assert.equal((html.match(/Headcount: <strong>Unavailable<\/strong>/g)||[]).length,2);
  assert.ok(!html.includes('Headcount: <strong>0</strong>'));
});

test('inspector renders the selected stored node, not the first node, with its exact identity and measures',()=>{
  const node=base.zone.config.payload.required_nodes[1],sample=base.samples.find(s=>s.node_id===node.node_id);
  const html=render(base,node.node_id),values=readings(html);
  assert.ok(html.includes(node.label)&&html.includes(node.node_id));
  assert.ok(values.includes(sample.temperature_c.toFixed(1))&&values.includes(sample.humidity_percent.toFixed(1)));
  assert.ok(html.includes('1 hour')&&html.includes('24 hours')&&html.includes('7 days'));
});
test('missing and invalid measurements remain visibly unavailable independently; stale evidence is explicitly attributed',()=>{
  const missing=structuredClone(base),id=missing.zone.config.payload.required_nodes[0].node_id;
  missing.samples=missing.samples.filter(s=>s.node_id!==id);
  const missingHtml=render(missing,id);
  assert.ok(readings(missingHtml).includes('—<small>°C'));
  assert.ok(readings(missingHtml).includes('—<small>%'));
  assert.ok(missingHtml.includes('Missing')&&missingHtml.includes('No current sample'));
  const invalid=structuredClone(base),sample=invalid.samples.find(s=>s.node_id===id);
  invalid.evidence.find(e=>e.event_id===sample.evidence_event_id).payload.temperature_c={value:null,source:'SIMULATED',source_id:id,observed_at:sample.observed_at,validity:'INVALID'};
  const invalidHtml=render(invalid,id);
  assert.ok(readings(invalidHtml).includes('—<small>°C'));
  assert.ok(readings(invalidHtml).includes(sample.humidity_percent.toFixed(1)));
  assert.ok(invalidHtml.includes('<dt>Temperature evidence</dt><dd>invalid</dd>'));
  const staleHtml=render(base,id,at+base.zone.config.payload.freshness.disconnected_after_ms+1);
  assert.ok(staleHtml.includes('Disconnected')&&staleHtml.includes('Last reported values; current conditions are unconfirmed.'));
});
