import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {EventEmitter} from 'node:events';
import {execFileSync} from 'node:child_process';
import {PGlite} from '@electric-sql/pglite';
import {targetFixture} from './fixtures/approved-target.mjs';
import {loadHybridTarget,verifyMigrationFiles} from '../hybrid-target.mjs';
import {createHybridWriter,hybridWriteConfiguration} from '../hybrid-writer.mjs';
import {createHybridSupervisor} from '../hybrid-runtime.mjs';
import {createHybridRun,prepareHybridTick} from '../dist/hybridModel.js';
import {normalizeHardwareTelemetry} from '../dist/hardwareTelemetry.js';
import {coolingPolicy} from '../../../packages/sdp-contract/dist/index.js';
const packets=JSON.parse(await readFile(new URL('./fixtures/firmware-replay.json',import.meta.url))).packets;
const epoch=Date.parse('2026-01-08T04:00:00.000Z'),iso=ms=>new Date(epoch+ms).toISOString();
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',competitor='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
async function setup(changes={}){
 const {target}=await targetFixture(changes),db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to anon,authenticated,service_role;create schema auth;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
 for(const file of ['001_sdp_foundation.sql','002_sdp_hybrid.sql']){if(file.startsWith('002'))await db.exec("set omnisense.hybrid_migration_approved='ISOLATED_TEST'");await db.exec(await readFile(new URL(`../../../supabase/sdp/migrations/${file}`,import.meta.url),'utf8'));}
 await db.query('insert into sdp_hybrid_environment values(true,$1,$2,$3,$4)',['ISOLATED_TEST',target.project_ref,target.protected_project_ref,target.manifest_sha256]);
 const lockdown=await readFile(new URL('../../../supabase/sdp/migrations/003_sdp_hybrid_isolated_lockdown.sql',import.meta.url),'utf8');
 await assert.rejects(db.exec(lockdown));await db.exec('rollback');
 for(const [name,value] of Object.entries({hybrid_isolated_lockdown_approved:'ISOLATED_TEST',hybrid_target_ref:target.project_ref,hybrid_protected_ref:target.protected_project_ref,hybrid_manifest_sha256:target.manifest_sha256}))await db.query('select set_config($1,$2,false)',[`omnisense.${name}`,value]);
 await db.exec(lockdown);
 const args={sdp_hybrid_info:[],sdp_hybrid_initialize_run:['p_run'],sdp_get_run:['p_run_id'],sdp_hybrid_acquire_writer:['p_run_id','p_owner_id'],sdp_hybrid_commit_tick:['p_tick','p_owner_id','p_epoch']};
 async function rpc(name,input={}){
  await db.exec('set role service_role');
  try{return(await db.query(`select public.${name}(${args[name].map((_,i)=>'$'+(i+1)).join(',')}) as result`,args[name].map(k=>input[k]!==null&&typeof input[k]==='object'?JSON.stringify(input[k]):input[k]))).rows[0].result;}
  finally{await db.exec('reset role');}
 }
 const wire={lostResponse:false,requests:[]};
 const transport=async(input,init)=>{
  const name=new URL(String(input)).pathname.split('/').at(-1),body=JSON.parse(init.body);
  wire.requests.push({name,body:structuredClone(body)});
  try{
   const result=await rpc(name,body);
   if(name==='sdp_hybrid_commit_tick'&&wire.lostResponse){wire.lostResponse=false;throw Object.assign(new Error('response lost'),{network:true});}
   return new Response(JSON.stringify(result),{status:200,headers:{'content-type':'application/json'}});
  }catch(e){if(e.network)throw e;return new Response(JSON.stringify({message:e.message,code:e.code}),{status:400,headers:{'content-type':'application/json'}});}
 };
 const config={url:target.url,key:'sb_secret_FAKE_OFFLINE_ONLY',expectedRef:target.project_ref,protectedRef:target.protected_project_ref,target};
 return{db,target,rpc,wire,writer:()=>createHybridWriter(config,transport)};
}
class FakeMqtt extends EventEmitter{
 subscribe(topics,_options,ack){ack(null,topics.map(topic=>({topic,qos:0})));}
 end(){this.ended=true;}
}
test('approved identity is independent of env; altered/unapproved manifests and hashes fail closed',async()=>{
 const {target,bytes,registry}=await targetFixture();await verifyMigrationFiles(target);
 await assert.rejects(loadHybridTarget('fixture',async p=>String(p).endsWith('approved-hybrid-targets.json')?JSON.stringify({...registry,approved:[]}):bytes),/approved/);
 await assert.rejects(loadHybridTarget('fixture',async p=>String(p).endsWith('approved-hybrid-targets.json')?JSON.stringify(registry):Buffer.from(String(bytes)+' ')),/approved/);
 await assert.rejects(loadHybridTarget('fixture'),/load/);
 assert.throws(()=>createHybridWriter({target:{...target}}),/registry/);
 const env={HYBRID_ENABLE_WRITES:'true',HYBRID_ENVIRONMENT_KIND:'ISOLATED_TEST',HYBRID_EXPECTED_PROJECT_REF:target.project_ref,HYBRID_PROTECTED_PROJECT_REF:target.protected_project_ref,HYBRID_SUPABASE_URL:target.url,HYBRID_SUPABASE_SECRET_KEY:'sb_secret_FAKE'};
 assert.equal(hybridWriteConfiguration(env,target.project_ref,target).target,target);
 assert.throws(()=>hybridWriteConfiguration({...env,HYBRID_EXPECTED_PROJECT_REF:'xxxxxxxxxxxxxxxxxxxx',HYBRID_SUPABASE_URL:'https://xxxxxxxxxxxxxxxxxxxx.supabase.co'},'xxxxxxxxxxxxxxxxxxxx',target));
 await assert.rejects(verifyMigrationFiles(target,async()=>Buffer.from('wrong bytes')),/hash/);
 const output=execFileSync(process.execPath,['hybrid-run.mjs'],{cwd:new URL('../',import.meta.url),encoding:'utf8'});assert.match(output,/disabled by default/);
});
test('one runtime commits real-shaped packets through SDK and local SQL, including disconnect and recovery',async t=>{
 const c=await setup();let at=epoch;let client;const reports=[];
 const runtime=createHybridSupervisor({target:c.target,writer:c.writer(),connectMqtt:()=>client=new FakeMqtt(),now:()=>at,report:s=>reports.push(s)});
 const pump=async ms=>{at=epoch+ms;await runtime.pump();};
 const packet=(node,kind,ms)=>{at=epoch+ms;client.emit('message',`omnisense/node/${node}/telemetry`,Buffer.from(JSON.stringify({...packets[kind],node_id:node})),{});};
 try{
  await runtime.start();client.emit('connect');
  await t.test('legacy writer RPCs are denied in this isolated project only',async()=>{
   await c.db.exec('set role service_role');
   try{await assert.rejects(c.db.query('select sdp_initialize_run($1::jsonb)',['{}']),/permission denied/);await assert.rejects(c.db.query('select sdp_commit_tick($1::jsonb)',['{}']),/permission denied/);}
   finally{await c.db.exec('reset role');}
  });
  packet('demo-1','occupied',1);packet('demo-2','occupied',2);await pump(3);await pump(4);
  await t.test('disconnect commits retained original receipts with uncertain conservative policy',async()=>{
   at=epoch+10;client.emit('offline');await pump(11);
   const s=runtime.inspect().session.committed;
   assert.deepEqual(Object.values(s.fusion.last_receipts),[iso(1),iso(2)]);
   assert.ok(s.decision.payload.node_states.every(n=>n.state==='DISCONNECTED'));assert.equal(s.decision.payload.occupancy,'UNCERTAIN');
   assert.equal(s.fusion.vacant_since,null);
   assert.equal((await c.db.query("select count(*)::int as n from sdp_events where event_type='NODE_EVIDENCE'")).rows[0].n,2);
  });
  await t.test('reconnect requires fresh independent packets and stale transitions persist',async()=>{
   at=epoch+20;client.emit('connect');await pump(21);
   assert.ok(runtime.inspect().session.committed.decision.payload.node_states.every(n=>n.state==='MISSING'));
   packet('demo-1','occupied',22);await pump(23);
   assert.equal(runtime.inspect().session.committed.decision.payload.node_states[1].state,'MISSING');
   packet('demo-2','occupied',24);await pump(25);
   // Renew local authority before deliberately moving the fake receipt clock.
   await pump(30_025);await pump(60_025);packet('demo-1','occupied',90_024);await pump(90_025);
   assert.deepEqual(runtime.inspect().session.committed.decision.payload.node_states.map(n=>n.state),['FRESH','STALE']);
  });
  await t.test('lost acknowledgement retries identical bytes and fenced recovery reconciles committed checkpoint',async()=>{
   c.wire.lostResponse=true;packet('demo-1','empty',90_030);await pump(90_031);
   assert.ok(runtime.inspect().session.pending);
   const pending=runtime.inspect().session.pending;await pump(92_032);
   assert.equal(runtime.inspect().session.pending,null);
   const sends=c.wire.requests.filter(r=>r.name==='sdp_hybrid_commit_tick'&&r.body.p_tick.frame.sequence===pending.frame.sequence);
   assert.deepEqual(sends.at(-1).body.p_tick,sends.at(-2).body.p_tick);
   c.wire.lostResponse=true;packet('demo-1','occupied',92_040);await pump(92_041);
   await c.db.exec("update sdp_hybrid_leases set expires_at=clock_timestamp()-interval '1 second'");
   await pump(152_042);
   assert.ok(reports.includes('HYBRID_RECOVERED_COMMITTED_RESPONSE'));
   assert.equal(runtime.inspect().session.committed.decision.payload.occupancy,'UNCERTAIN');
  });
  await t.test('new live owner fences a previous writer; runtime halts instead of competing',async()=>{
   await c.db.exec("update sdp_hybrid_leases set expires_at=clock_timestamp()-interval '1 second'");
   await c.rpc('sdp_hybrid_acquire_writer',{p_run_id:c.target.run_id,p_owner_id:competitor});
   at=epoch+220_000;await assert.rejects(runtime.pump(),/halted/);assert.equal(runtime.inspect().running,false);assert.equal(client.ended,true);
  });
  await t.test('restart reloads the committed checkpoint but drops all observation authority',async()=>{
   const before=runtime.inspect().session.committed;
   await c.db.exec("update sdp_hybrid_leases set expires_at=clock_timestamp()-interval '1 second'");
   at=epoch+300_000;
   const restarted=createHybridSupervisor({target:c.target,writer:c.writer(),connectMqtt:()=>client=new FakeMqtt(),now:()=>at});
   await restarted.start();client.emit('connect');await restarted.pump();
   const after=restarted.inspect().session.committed;
   assert.equal(after.sequence,before.sequence+1);assert.equal(after.simulated_at,iso(300_000));
   assert.ok(after.decision.payload.node_states.every(n=>n.state==='MISSING'));assert.equal(after.fusion.vacant_since,null);
   await restarted.stop();
  });
  await t.test('read-only verification SQL runs locally without altering stored snapshots',async()=>{
   const before=(await c.db.query('select checkpoint from sdp_runs')).rows;
   const sql=(await readFile(new URL('../../../supabase/sdp/verification/002_sdp_hybrid_read_only.sql',import.meta.url),'utf8')).replaceAll('<APPROVED_TEST_REF>',c.target.project_ref).replaceAll('<PROTECTED_DEMO_REF>',c.target.protected_project_ref).replaceAll('<APPROVED_MANIFEST_SHA256>',c.target.manifest_sha256);
   const result=await c.db.exec(sql);
   for(const row of result.flatMap(r=>r.rows))if('violations'in row)assert.equal(Number(row.violations),0);
   assert.deepEqual((await c.db.query('select checkpoint from sdp_runs')).rows,before);
  });
 }finally{await runtime.stop();await c.db.close();}
});
test('database rejects premature reductions, forged continuity, inconsistent confirmation and PRECOOL',async()=>{
 const c=await setup({full_zone_coverage:true});
 const run=createHybridRun(c.target.run_id,c.target.live_anchor,c.target.nodes,{full_zone_coverage:true});
 const entry=(id,ms)=>({evidence_id:`${id}:${ms}`,reading:normalizeHardwareTelemetry(`omnisense/node/${id}/telemetry`,JSON.stringify({...packets.empty,node_id:id}),{received_at:iso(ms),allowed_node_ids:run.config.payload.required_nodes.map(n=>n.node_id)}).value});
 const tick=(previous,ms)=>prepareHybridTick(run,previous,iso(ms),c.target.nodes.map(n=>entry(n.node_id,ms)));
 const changeMode=(v,mode,output)=>{
  for(const d of [v.checkpoint.decision,...v.events.filter(e=>e.event_type==='ZONE_DECISION')])Object.assign(d.payload,{requested_mode:mode,requested_output:output});
  for(const a of [v.checkpoint.output,...v.events.filter(e=>e.event_type==='APPLIED_OUTPUT')])a.payload.reported_output=output;
 };
 try{
  await c.rpc('sdp_hybrid_initialize_run',{p_run:run});const lease=await c.rpc('sdp_hybrid_acquire_writer',{p_run_id:run.run_id,p_owner_id:owner});
  const commit=v=>c.rpc('sdp_hybrid_commit_tick',{p_tick:v,p_owner_id:owner,p_epoch:lease.epoch});
  let first=tick(null,0),bad=structuredClone(first);changeMode(bad,'SHORT_VACANCY',{fan:'LOW',setpoint_c:27});
  await assert.rejects(commit(bad),/policy invariant/);await commit(first);
  let prev=first.checkpoint;
  for(let ms=30_000;ms<300_000;ms+=30_000){const t=tick(prev,ms);await commit(t);prev=t.checkpoint;}
  const valid=tick(prev,300_000);
  for(const mutate of [v=>changeMode(v,'LONG_VACANCY',{fan:'OFF',setpoint_c:null}),v=>changeMode(v,'PRECOOL',{fan:'HIGH',setpoint_c:24.5}),v=>{
   for(const d of [v.checkpoint.decision,...v.events.filter(e=>e.event_type==='ZONE_DECISION')])d.payload.vacancy_confirmed_at=null;
  },v=>{v.checkpoint.fusion.vacant_since=iso(1);}]){
   const v=structuredClone(valid);mutate(v);await assert.rejects(commit(v));
  }
  assert.equal((await c.db.query('select last_sequence::int as n from sdp_runs')).rows[0].n,9);
  const gap=tick(prev,1_200_000);gap.checkpoint.fusion.vacant_since=iso(0);await assert.rejects(commit(gap),/continuity/);
  await commit(valid);
  // Boundary matrix proves generated DB guard and the one shared application policy agree.
  for(const occupancy of ['VACANT','OCCUPIED','UNCERTAIN'])for(const duration of [0,299999,300000,300001,1199999,1200000,1200001,2999999,3000000,3000001,3600000,3600001])for(const gap of [1799999,1800000,3600000]){
   const since=epoch,at=epoch+duration,next=since+gap,restart=next-600000;
   const expected=coolingPolicy(at,occupancy,since,{next_use_at:next,planned_restart_at:restart});
   const actual=(await c.db.query('select public._sdp_cooling_policy($1,$2,$3,$4,$5) as p',[new Date(at).toISOString(),occupancy,iso(0),new Date(next).toISOString(),new Date(restart).toISOString()])).rows[0].p;
   assert.deepEqual(actual,expected);
  }
 }finally{await c.db.close();}
});
test('runtime coalesces pump calls and shutdown awaits only the issued transaction',async()=>{
 const {target}=await targetFixture();let at=epoch,client,resolveCommit,commits=0;const reports=[];
 const runtime=createHybridSupervisor({target,now:()=>at,connectMqtt:()=>client=new FakeMqtt(),report:s=>reports.push(s),writer:{
  verify:async()=>{},initialize:async run=>({definition:run,checkpoint:null,status:'SEEDING'}),
  acquire:async(_id,who)=>({owner_id:who,epoch:1,expires_at:iso(60_000)}),
  commit:async tick=>{commits++;await new Promise(r=>{resolveCommit=r;});return tick.checkpoint;}
 }});
 await runtime.start();client.emit('connect');at++;
 const work=runtime.pump();for(let i=0;i<100;i++)assert.equal(runtime.pump(),work);
 assert.equal(commits,1);const stop=runtime.stop();assert.equal(client.ended,true);
 resolveCommit();await work;await stop;await runtime.stop();
 assert.equal(commits,1);assert.equal(reports.filter(s=>s==='HYBRID_STOPPED').length,1);
});
test('startup refuses a mismatched stored definition before MQTT connection',async()=>{
 const {target}=await targetFixture();let connections=0;
 const runtime=createHybridSupervisor({target,writer:{verify:async()=>{},initialize:async()=>({definition:{},status:'ACTIVE'})},connectMqtt:()=>{connections++;return new FakeMqtt();}});
 await assert.rejects(runtime.start(),/startup failed/);assert.equal(connections,0);await runtime.stop();
});
