import test from 'node:test';
import assert from 'node:assert/strict';
import { compileSource, sourceUrl, fakeClient, overviewFixture, runtimeRewrite } from './overview-fixture.mjs';
const { officePosition, coverageRect, cameraEase, cameraLimits, cameraMotion } = await compileSource(new URL('../src/components/spatial/officeLayout.ts',import.meta.url));
const { fetchOverview } = await compileSource(new URL('../src/api/overview.ts',import.meta.url),runtimeRewrite);
const display = sourceUrl(new URL('../src/lib/overviewDisplay.ts',import.meta.url));
const { spatialOverview } = await compileSource(new URL('../src/lib/spatialOverview.ts',import.meta.url),[['./overviewDisplay',display]]);

test('configured normalized coordinates map to ceiling space independently of furniture and identity order', async () => {
  const data=await fetchOverview(fakeClient(overviewFixture()),new AbortController().signal);
  const nodes=spatialOverview(data,Date.parse(data.frame.simulated_at)).nodes;
  const first=officePosition(nodes[0].x,nodes[0].y),second=officePosition(nodes[1].x,nodes[1].y);
  assert.ok(first.x<second.x);assert.equal(first.y,2.64);assert.equal(second.y,2.64);
  assert.equal(first.z,second.z);
  assert.notEqual(officePosition(nodes[0].x,.1).z,officePosition(nodes[0].x,.9).z);
  assert.deepEqual(officePosition(nodes[0].x,nodes[0].y),first);
  for(const x of [0,.3,.7,1]) for(const y of [0,.5,1]) {
    const p=officePosition(x,y),r=coverageRect(p.x,p.z);
    assert.ok(r.left>=-3.29&&r.right<=3.29&&r.back>=-2.36&&r.front<=2.36);
    assert.ok(r.right>r.left&&r.front>r.back);assert.ok(p.x>=r.left&&p.x<=r.right&&p.z>=r.back&&p.z<=r.front);
    assert.ok(r.right-r.left>1&&r.front-r.back>1,'coverage is a spatial sub-area, not a desk marker');
  }
});
test('camera interpolation remains finite, monotonic, interruptible and bounded at both ends', () => {
  assert.equal(cameraEase(0),0);assert.equal(cameraEase(1),1);
  let previous=0;
  for(let i=0;i<=100;i++){const value=cameraEase(i/100);assert.ok(Number.isFinite(value)&&value>=previous&&value<=1);previous=value;}
  assert.ok(cameraLimits.minZoom>0&&cameraLimits.maxZoom>cameraLimits.minZoom);
  assert.equal(cameraMotion.duration,180);assert.equal(cameraMotion.rotationRate,Math.PI/6);
});
test('node inspector receives independent metric validity and exact stored observation references', async () => {
  const data=await fetchOverview(fakeClient(overviewFixture()),new AbortController().signal);
  const sample=data.samples[1],evidence=data.evidence.find(e=>e.event_id===sample.evidence_event_id);
  evidence.payload.humidity_percent={...evidence.payload.humidity_percent,value:null,validity:'INVALID'};
  evidence.payload.classification={...evidence.payload.classification,value:null,validity:'UNAVAILABLE'};
  const node=spatialOverview(data,Date.parse(data.frame.simulated_at)).nodes.find(n=>n.id===sample.node_id);
  assert.equal(node.temperature,sample.temperature_c);assert.equal(node.temperatureValidity,'VALID');
  assert.equal(node.humidity,null);assert.equal(node.humidityValidity,'INVALID');
  assert.equal(node.classificationCode,null);assert.equal(node.classificationValidity,'UNAVAILABLE');
  assert.equal(node.evidenceId,sample.evidence_event_id);assert.equal(node.observedAt,sample.observed_at);
});
