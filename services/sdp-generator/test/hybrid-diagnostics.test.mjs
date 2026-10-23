import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFile} from 'node:fs/promises';
import {targetFixture} from './fixtures/approved-target.mjs';
import {createHybridSupervisor} from '../hybrid-runtime.mjs';
import {createHybridWriter,HybridWriteError} from '../hybrid-writer.mjs';
const epoch=Date.parse('2026-01-08T04:00:00.000Z'),iso=ms=>new Date(epoch+ms).toISOString();
const packets=JSON.parse(await readFile(new URL('./fixtures/firmware-replay.json',import.meta.url))).packets;
class Mqtt extends EventEmitter {
  subscribe(topics,options,ack){ack(null,topics.map(topic=>({topic,qos:0})));}
  end(){this.ended=true;}
}
async function setup(overrides={}) {
  const {target}=await targetFixture();let now=epoch,client,stored=null,definition;
  const logs=[],ticks=[];
  const writer={verify:async()=>{},initialize:async run=>{definition=run;return{definition,checkpoint:stored,status:stored?'ACTIVE':'SEEDING'};},
    acquire:async(_id,owner_id)=>({owner_id,epoch:1,expires_at:new Date(now+60_000).toISOString()}),
    getRun:async()=>({definition,checkpoint:stored,status:'ACTIVE'}),
    commit:async tick=>{ticks.push(structuredClone(tick));stored=structuredClone(tick.checkpoint);return tick.checkpoint;},...overrides};
  const runtime=createHybridSupervisor({target,writer,connectMqtt:()=>client=new Mqtt(),now:()=>now,report:(status,diagnostic)=>logs.push({status,diagnostic})});
  await runtime.start();
  return {runtime,writer,logs,ticks,target,get client(){return client;},
    time:ms=>{now=epoch+ms;},pump:ms=>{now=epoch+ms;return runtime.pump();},
    packet(node,kind,ms,flags={},changes={}){now=epoch+ms;client.emit('message',`omnisense/node/${node}/telemetry`,Buffer.from(JSON.stringify({...packets[kind],node_id:node,...changes})),flags);}};
}

test('two startup snapshots may be missing; first hardware commit failure reports counts and retains the exact pending tick',async()=>{
  const c=await setup();
  try {
    await c.pump(1);c.time(1000);c.client.emit('connect');await c.pump(1001);
    assert.deepEqual(c.ticks.map(t=>[t.frame.sequence,t.events.filter(e=>e.event_type==='NODE_EVIDENCE').length]),[[0,0],[1,0]]);
    assert.ok(c.ticks.every(t=>t.samples.every(s=>s.evidence_event_id===null)));
    c.packet('demo-1','occupied',1100);c.packet('demo-2','occupied',1200);
    c.writer.commit=async()=>{throw new HybridWriteError('INVALID',{operation:'sdp_hybrid_commit_tick',code:'23514',reason:'CHECK_CONSTRAINT'});};
    await assert.rejects(c.pump(1300),/halted/);
    const d=c.logs.find(l=>l.status==='HYBRID_HALTED').diagnostic;
    assert.equal(d.stage,'COMMIT');assert.equal(d.category,'INVALID');assert.equal(d.reason,'CHECK_CONSTRAINT');
    assert.equal(d.committed_sequence,1);assert.equal(d.attempted_sequence,2);
    assert.deepEqual(d.packets.by_node,{'demo-1':{accepted:1,rejected:0},'demo-2':{accepted:1,rejected:0}});
    assert.equal(c.runtime.inspect().session.pending.frame.sequence,2);assert.equal(c.client.ended,true);
  }finally{await c.runtime.stop();}
});

test('accepted, retained, duplicate and malformed packets have separate counters; ordinary commits report progress',async()=>{
  const c=await setup();
  try {
    c.client.emit('connect');c.packet('demo-1','occupied',1);c.packet('demo-2','occupied',2);
    c.packet('demo-2','occupied',3,{retain:true});c.packet('demo-2','occupied',4,{dup:true});
    c.packet('demo-2','occupied',5,{}, {headcount:9});
    await c.pump(6);await c.pump(7);
    const p=c.runtime.inspect().session.diagnostics.packets;
    assert.equal(p.received,5);assert.equal(p.accepted,2);assert.equal(p.rejected,3);
    assert.deepEqual(p.reasons,{RETAINED:1,DUPLICATE:1,NORMALIZATION:1});
    assert.ok(c.logs.some(l=>l.status==='HYBRID_SNAPSHOT_COMMITTED'&&l.diagnostic.committed_sequence===1));
  }finally{await c.runtime.stop();}
});

test('local transaction preparation is distinguished from a server rejection and raw errors never reach logs',async()=>{
  const c=await setup();
  try {
    c.client.emit('connect');
    // Empty metadata passes the adapter but fails the stricter envelope contract.
    c.packet('demo-1','occupied',1,{}, {raw_sensor_summary:{...packets.occupied.raw_sensor_summary,thermal_ai_label:''}});
    await assert.rejects(c.pump(2),/halted/);
    const d=c.logs.find(l=>l.status==='HYBRID_HALTED').diagnostic;
    assert.equal(d.stage,'PREPARE');assert.equal(d.category,'LOCAL_EXCEPTION');assert.equal(c.ticks.length,0);
    assert.doesNotMatch(JSON.stringify(c.logs),/raw_sensor_summary|thermal_ai_label|non-empty string/);
  }finally{await c.runtime.stop();}
});

test('RPC diagnostics expose only fixed reasons and error codes, never upstream text or private fields',async()=>{
  const {target}=await targetFixture();
  for(const [code,message,reason] of [['23514','private-secret-token','CHECK_CONSTRAINT'],['P0001','Checkpoint evidence mismatch','CHECKPOINT_EVIDENCE'],['P0001','private-secret-token','UPSTREAM_REJECTED']]) {
    const writer=createHybridWriter({target,url:target.url,expectedRef:target.project_ref,protectedRef:target.protected_project_ref,key:'sb_secret_FAKE_OFFLINE_ONLY'},async(input)=>
      new Response(JSON.stringify(String(input).endsWith('sdp_hybrid_info')?{installation:'omnisense-sdp-hybrid-v1',model_version:'sdp-hybrid-v1',hybrid_only:true,environment:{kind:'ISOLATED_TEST',project_ref:target.project_ref,protected_project_ref:target.protected_project_ref,manifest_sha256:target.manifest_sha256}}:{code,message,details:'private-details',hint:'private-hint'}),{status:String(input).endsWith('sdp_hybrid_info')?200:400,headers:{'content-type':'application/json'}}));
    await writer.verify();
    await assert.rejects(writer.getRun(target.run_id),error=>{
      assert.deepEqual(error.diagnostic,{operation:'sdp_get_run',code,reason});
      assert.doesNotMatch(JSON.stringify(error),/private-|FAKE_OFFLINE/);return true;
    });
  }
});

test('retry preserves immutable pending data; checkpoint conflicts and lease ownership failures remain fatal',async()=>{
  for(const kind of ['RETRY','CONFLICT','LEASE']) {
    const c=await setup();
    try {
      c.client.emit('connect');c.packet('demo-1','occupied',1);
      c.writer.commit=async()=>{throw new HybridWriteError(kind,{operation:'sdp_hybrid_commit_tick',reason:'UPSTREAM_REJECTED'});};
      if(kind==='RETRY'){
        await c.pump(2);const pending=c.runtime.inspect().session.pending;
        assert.ok(c.runtime.inspect().running);assert.equal(c.logs.at(-1).status,'HYBRID_RETRY_PENDING_UNCHANGED');
        c.writer.commit=async tick=>{assert.deepEqual(tick,pending);return tick.checkpoint;};await c.pump(2003);
        assert.equal(c.runtime.inspect().session.pending,null);
      }else{
        if(kind==='LEASE')c.writer.acquire=async()=>{throw new HybridWriteError('LEASE',{operation:'sdp_hybrid_acquire_writer',reason:'LEASE_HELD'});};
        await assert.rejects(c.pump(2),/halted/);
        const d=c.logs.find(l=>l.status==='HYBRID_HALTED').diagnostic;
        assert.equal(d.category,kind);assert.equal(d.stage,kind==='LEASE'?'ACQUIRE_LEASE':'COMMIT');
      }
    }finally{await c.runtime.stop();}
  }
});

test('stop during lease recovery does not begin a checkpoint read or a further commit',async()=>{
  const c=await setup();let resolveAcquire,reads=0;
  try {
    c.client.emit('connect');await c.pump(1);
    c.writer.acquire=async(_id,owner_id)=>new Promise(resolve=>{resolveAcquire=()=>resolve({owner_id,epoch:2,expires_at:iso(120000)});});
    c.writer.getRun=async()=>{reads++;throw Error('Should not read after stop');};
    const pumping=c.pump(60000);await new Promise(resolve=>setImmediate(resolve));
    const stopping=c.runtime.stop();resolveAcquire();await pumping;await stopping;
    assert.equal(reads,0);assert.equal(c.ticks.length,1);assert.equal(c.client.ended,true);
    assert.equal(c.logs.filter(l=>l.status==='HYBRID_STOPPED').length,1);
  }finally{await c.runtime.stop();}
});
