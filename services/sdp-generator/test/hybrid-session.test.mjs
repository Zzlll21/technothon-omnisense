import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHybridRun } from '../dist/hybridModel.js';
import { createHybridSession } from '../hybrid-session.mjs';
import { createHybridWriter, hybridWriteConfiguration } from '../hybrid-writer.mjs';
import { attachMqttMonitor } from '../hardware-monitor.mjs';
import { EventEmitter } from 'node:events';
import { targetFixture } from './fixtures/approved-target.mjs';
const fixture = JSON.parse(await readFile(new URL('./fixtures/firmware-replay.json', import.meta.url)));
const anchor = '2026-01-08T04:00:00.000Z', epoch = Date.parse(anchor);
const run = createHybridRun('88888888-8888-4888-8888-888888888888', anchor,
  ['demo-1','demo-2'].map((node_id, i) => ({node_id,label:node_id,x:0.3+i*0.4,y:0.5})), {full_zone_coverage:true});
function ingest(session, id, kind, ms, packet={}) {
  return session.ingest(`omnisense/node/${id}/telemetry`, JSON.stringify({...fixture.packets[kind],node_id:id}), packet, epoch+ms);
}
const lease = {owner_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',epoch:1};
test('existing subscribe-only MQTT binding feeds both nodes to one prepared transactional session',async()=>{
  const ticks=[],session=createHybridSession(run,{commit:async t=>{ticks.push(t);return t.checkpoint;}},lease);
  const client=new EventEmitter();let clock=epoch;
  client.subscribe=(topics,options,ack)=>ack(null,topics.map(topic=>({topic,qos:0})));
  const dispose=attachMqttMonitor(client,session,['demo-1','demo-2'],()=>clock);
  client.emit('connect');
  for(const id of ['demo-1','demo-2']) {
    clock++;client.emit('message',`omnisense/node/${id}/telemetry`,Buffer.from(JSON.stringify({...fixture.packets.occupied,node_id:id})),{});
  }
  await session.flush(++clock);await session.flush(++clock);
  assert.deepEqual(ticks.at(-1).samples.map(s=>s.node_id),['demo-1','demo-2']);
  assert.ok(ticks.at(-1).samples.every(s=>s.evidence_event_id));
  clock++;client.emit('message','omnisense/node/demo-1/telemetry',Buffer.alloc(5000),{});
  assert.equal(session.evaluate(++clock).nodes[0].state,'MISSING');
  client.emit('offline');assert.equal(session.evaluate(++clock).occupancy,'UNCERTAIN');dispose();
});
test('frozen retry, serialized commits and a transient occupied packet while commit is pending', async () => {
  const ticks=[]; let rejectFirst;
  const session=createHybridSession(run,{commit:async tick=>{
    ticks.push(structuredClone(tick));
    if(ticks.length===1) await new Promise((_,reject)=>{rejectFirst=reject;});
    return tick.checkpoint;
  }},lease);
  session.setConnected(true);
  ingest(session,'demo-1','empty',0); ingest(session,'demo-2','empty',1);
  const first=session.flush(epoch+2);
  await new Promise(resolve=>setImmediate(resolve));
  ingest(session,'demo-1','occupied',10);
  ingest(session,'demo-1','empty',11);
  rejectFirst(new Error('response lost'));
  await assert.rejects(first,/response lost/);
  assert.equal(session.inspect().committed,null);
  await session.flush(epoch+12);
  assert.deepEqual(ticks[0],ticks[1]);
  for(let i=13;session.inspect().queued && i<30;i++) await session.flush(epoch+i);
  const occupied=ticks.find(t=>t.frame.occupancy==='OCCUPIED');
  assert.ok(occupied); assert.equal(occupied.checkpoint.decision.payload.requested_mode,'OCCUPIED');
  const last=ticks.at(-1);
  assert.equal(last.checkpoint.fusion.vacant_since,new Date(epoch+11).toISOString());
  assert.deepEqual(ticks.slice(1).map(t=>t.frame.sequence),ticks.slice(1).map((_,i)=>i));
});
test('independent staleness, disconnect/reconnect, invalid and DUP packets never establish vacancy',async()=>{
  const ticks=[],session=createHybridSession(run,{commit:async tick=>{ticks.push(tick);return tick.checkpoint;}},lease);
  session.setConnected(true); ingest(session,'demo-1','empty',0); ingest(session,'demo-2','empty',1);
  ingest(session,'demo-1','empty',91_001);
  assert.equal(session.evaluate(epoch+91_002).occupancy,'UNCERTAIN');
  session.setConnected(false);
  assert.equal(session.evaluate(epoch+91_003).checkpoint.vacant_since,null);
  session.setConnected(true);
  const reset=session.evaluate(epoch+91_004);assert.ok(reset.nodes.every(n=>n.state==='MISSING'));
  assert.equal(ingest(session,'demo-1','empty',91_005,{dup:true}),false);
  ingest(session,'demo-2','empty',91_006);
  assert.equal(session.evaluate(epoch+91_007).occupancy,'UNCERTAIN');
  assert.equal(session.ingest('omnisense/node/demo-2/telemetry','{}',{},epoch+91_008),false);
  assert.ok(session.evaluate(epoch+91_009).nodes.every(n=>n.state==='MISSING'));
});
test('queue overflow and process restart discard vacancy authority; no downtime backfill',async()=>{
  const writer={commit:async t=>t.checkpoint},session=createHybridSession(run,writer,lease,{queueLimit:2});
  session.setConnected(true);
  ingest(session,'demo-1','empty',0);ingest(session,'demo-2','empty',1);
  ingest(session,'demo-1','occupied',2);
  assert.equal(session.inspect().gap,true);
  assert.ok(session.evaluate(epoch+3).nodes.every(n=>n.state==='MISSING'));
  const checkpoint=await session.flush(epoch+4);
  const restarted=createHybridSession(run,writer,lease,{checkpoint});
  restarted.setConnected(true); const result=restarted.evaluate(epoch+3600_000);
  assert.equal(result.occupancy,'UNCERTAIN');assert.equal(result.checkpoint.vacant_since,null);
  const next=await restarted.flush(epoch+3600_001);
  assert.equal(next.sequence,checkpoint.sequence+1);
  assert.equal(next.simulated_at,new Date(epoch+3600_000).toISOString());
});
const {target}=await targetFixture();
const config={url:'https://abcdefghijklmnopqrst.supabase.co',key:'sb_secret_FAKE_TEST_ONLY',expectedRef:'abcdefghijklmnopqrst',protectedRef:'zzzzzzzzzzzzzzzzzzzz',target};
test('separate opt-in, exact URL confirmation and protected project guards',()=>{
  const env={HYBRID_ENABLE_WRITES:'true',HYBRID_ENVIRONMENT_KIND:'ISOLATED_TEST',HYBRID_EXPECTED_PROJECT_REF:config.expectedRef,HYBRID_PROTECTED_PROJECT_REF:config.protectedRef,HYBRID_SUPABASE_URL:config.url,HYBRID_SUPABASE_SECRET_KEY:config.key};
  assert.deepEqual(hybridWriteConfiguration(env,config.expectedRef,target),config);
  for(const changes of [{HYBRID_ENABLE_WRITES:'false'},{HYBRID_EXPECTED_PROJECT_REF:config.protectedRef},{HYBRID_SUPABASE_URL:'https://wrong.example'},{HYBRID_SUPABASE_SECRET_KEY:'eyJlegacy'}]) assert.throws(()=>hybridWriteConfiguration({...env,...changes},config.expectedRef,target));
  assert.throws(()=>createHybridWriter({...config,expectedRef:''}));
});
test('writer sends nothing on construction, verifies private marker and uses only sanitized RPC transport',async()=>{
  const requests=[];
  const writer=createHybridWriter(config,async(input,init)=>{
    requests.push({url:String(input),init});
    const body=String(input).endsWith('/sdp_hybrid_info') ? {installation:'omnisense-sdp-hybrid-v1',model_version:'sdp-hybrid-v1',hybrid_only:true,environment:{kind:'ISOLATED_TEST',project_ref:config.expectedRef,protected_project_ref:config.protectedRef,manifest_sha256:target.manifest_sha256}} : {};
    return new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}});
  });
  assert.equal(requests.length,0);await assert.rejects(writer.getRun(run.run_id),/Verify isolated/);
  await writer.verify();await writer.initialize(run);
  assert.equal(requests.length,2);
  for(const r of requests){assert.equal(r.init.headers.has('Authorization'),false);assert.equal(r.init.redirect,'error');assert.equal(r.init.headers.get('apikey'),config.key);}
  const bad=createHybridWriter(config,async()=>new Response('{"environment":null}',{status:200,headers:{'content-type':'application/json'}}));
  await assert.rejects(bad.verify(),/marker mismatch/);
  const failing=createHybridWriter(config,async()=>{throw new Error('private secret in upstream error');});
  await assert.rejects(failing.verify(),e=>!e.message.includes('private secret'));
});
