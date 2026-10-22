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
const { spatialOverview } = await server.ssrLoadModule('/src/lib/spatialOverview.ts');
const { fetchOverview } = await compileSource(new URL('../src/api/overview.ts',import.meta.url),runtimeRewrite);
const base = await fetchOverview(fakeClient(overviewFixture()),new AbortController().signal);
const at=Date.parse(base.frame.simulated_at);
function render(data,nodeId,now=at){return renderToStaticMarkup(React.createElement(NodeInspector,{data,model:spatialOverview(data,now),nodeId,now,refreshToken:null,onSelect:()=>{},onClose:()=>{}}));}
function readings(html){return html.match(/class="sz-drawer-values"([\s\S]*?)<dl/)[1];}

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
