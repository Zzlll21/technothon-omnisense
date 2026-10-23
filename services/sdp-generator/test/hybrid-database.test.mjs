import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createRun, generateTick } from '../dist/model.js';
import { createHybridRun, prepareHybridTick } from '../dist/hybridModel.js';
import { normalizeHardwareTelemetry } from '../dist/hardwareTelemetry.js';
import { validateSdpEvent, validateStoredSdpEvent } from '../../../packages/sdp-contract/dist/index.js';

const foundation = await readFile(new URL('../../../supabase/sdp/migrations/001_sdp_foundation.sql', import.meta.url), 'utf8');
const migration = await readFile(new URL('../../../supabase/sdp/migrations/002_sdp_hybrid.sql', import.meta.url), 'utf8');
const fixture = JSON.parse(await readFile(new URL('./fixtures/firmware-replay.json', import.meta.url), 'utf8'));
const anchor = '2026-01-08T04:00:00.000Z';
const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const nodes = [{ node_id: 'demo-1', label: 'Physical left', x: 0.3, y: 0.5 }, { node_id: 'any-device-42', label: 'Physical right', x: 0.7, y: 0.5 }];
function entry(node, at = anchor, name = 'occupied', changes = {}) {
  const payload = { ...structuredClone(fixture.packets[name]), node_id: node, ...changes };
  const r = normalizeHardwareTelemetry(`omnisense/node/${node}/telemetry`, JSON.stringify(payload), { received_at: at, allowed_node_ids: nodes.map(n => n.node_id) });
  assert.equal(r.ok, true);
  return { evidence_id: `${node}:${at}`, reading: r.value };
}
async function role(db, name, fn) { await db.exec(`set role ${name}`); try { return await fn(); } finally { await db.exec('reset role'); } }
const rpc = (db, name, args) => role(db, 'service_role', async () => (await db.query(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) as r`, args.map(v => v !== null && typeof v === 'object' ? JSON.stringify(v) : v))).rows[0].r);

test('isolated hybrid migration, fencing, privacy, transactions and legacy compatibility', async t => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      grant usage on schema public to anon,authenticated,service_role;
      create schema auth;
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
    await db.exec(foundation);
    const legacy = createRun('33333333-3333-4333-8333-333333333333', anchor);
    await rpc(db, 'sdp_initialize_run', [legacy]);
    let old = generateTick(legacy, null);
    await rpc(db, 'sdp_commit_tick', [old]);
    const before = (await db.query('select run_id,sequence,node_id,observed_at,temperature_c,humidity_percent,evidence_event_id from sdp_node_samples order by node_id')).rows;
    await t.test('explicit isolated acknowledgement is required; existing rows are not rewritten', async () => {
      await assert.rejects(db.exec(migration), /ISOLATED_TEST/);
      await db.exec('rollback');
      await db.exec("set omnisense.hybrid_migration_approved='ISOLATED_TEST'");
      await db.exec(migration);
      assert.deepEqual((await db.query('select run_id,sequence,node_id,observed_at,temperature_c,humidity_percent,evidence_event_id from sdp_node_samples order by node_id')).rows, before);
      assert.equal((await db.query('select count(*)::int as n from sdp_node_samples where sampled_at is not null')).rows[0].n, 0);
    });
    await t.test('legacy generator continues after migration with original data and activation', async () => {
      while (old.frame.simulated_at < anchor) { old = generateTick(legacy, old.checkpoint); await rpc(db, 'sdp_commit_tick', [old]); }
      assert.equal((await db.query('select status from sdp_runs where run_id=$1', [legacy.run_id])).rows[0].status, 'ACTIVE');
      const bad = structuredClone(legacy); bad.run_id = '44444444-4444-4444-8444-444444444444'; bad.config.session_id = bad.run_id; bad.config.payload.required_nodes[0].node_id = 'demo-1';
      await assert.rejects(rpc(db, 'sdp_initialize_run', [bad]), /Legacy inventory/);
    });
    const run = createHybridRun('55555555-5555-4555-8555-555555555555', anchor, nodes);
    await t.test('hybrid writes cannot be enabled by migration alone', async () => {
      await assert.rejects(rpc(db, 'sdp_hybrid_initialize_run', [run]), /not provisioned/);
      await db.exec("insert into sdp_hybrid_environment values(true,'ISOLATED_TEST','abcdefghijklmnopqrst','zzzzzzzzzzzzzzzzzzzz')");
      await rpc(db, 'sdp_hybrid_initialize_run', [run]);
    });
    const first = prepareHybridTick(run, null, anchor, [entry('demo-1'), entry('any-device-42', anchor, 'empty', { temperature: 27.1, humidity: 58 })]);
    const lease = await rpc(db, 'sdp_hybrid_acquire_writer', [run.run_id, owner]);
    await t.test('another ACTIVE run cannot be silently archived; failed publication is atomic', async () => {
      await assert.rejects(rpc(db, 'sdp_hybrid_commit_tick', [first, owner, lease.epoch]), /replacement requires/);
      assert.equal((await db.query('select count(*)::int as n from sdp_zone_frames where run_id=$1', [run.run_id])).rows[0].n, 0);
      assert.equal((await db.query('select status from sdp_runs where run_id=$1', [legacy.run_id])).rows[0].status, 'ACTIVE');
    });
    const accepted = createHybridRun('66666666-6666-4666-8666-666666666666', anchor, nodes, { replaces_active_run_id: legacy.run_id });
    await rpc(db, 'sdp_hybrid_initialize_run', [accepted]);
    const token = await rpc(db, 'sdp_hybrid_acquire_writer', [accepted.run_id, owner]);
    let tick = prepareHybridTick(accepted, null, anchor, [entry('demo-1'), entry('any-device-42', anchor, 'empty', { temperature: 27.1, humidity: 58 })]);
    await t.test('real identities, independent measurements and versioned hardware events persist together', async () => {
      assert.equal(validateSdpEvent(tick.events.find(e => e.event_type === 'NODE_EVIDENCE')).ok, false);
      assert.ok(tick.events.every(e => validateStoredSdpEvent(e).ok));
      await rpc(db, 'sdp_hybrid_commit_tick', [tick, owner, token.epoch]);
      const rows = (await db.query('select node_id,temperature_c,humidity_percent,observed_at,sampled_at from sdp_node_samples where run_id=$1 order by node_id', [accepted.run_id])).rows;
      assert.deepEqual(rows.map(r => r.temperature_c), [27.1, 25.4]);
      assert.equal((await db.query('select status from sdp_runs where run_id=$1', [legacy.run_id])).rows[0].status, 'ARCHIVED');
      assert.equal((await db.query('select count(*)::int as n from sdp_zone_frames where run_id=$1', [legacy.run_id])).rows[0].n, 2017);
    });
    await t.test('duplicate retry acknowledges once; changed payload and competing owner are rejected', async () => {
      assert.equal((await rpc(db, 'sdp_hybrid_commit_tick', [tick, owner, token.epoch])).duplicate, true);
      const changed = structuredClone(tick); changed.checkpoint.sequence++;
      await assert.rejects(rpc(db, 'sdp_hybrid_commit_tick', [changed, owner, token.epoch]), /Conflicting retry/);
      await assert.rejects(rpc(db, 'sdp_hybrid_acquire_writer', [accepted.run_id, other]), /already leased/);
      await assert.rejects(rpc(db, 'sdp_commit_tick', [tick]), /refuses hybrid/);
    });
    await t.test('missing evidence and N/A remain explicit nulls; reused receipt is never refreshed', async () => {
      const next = '2026-01-08T04:00:30.000Z';
      tick = prepareHybridTick(accepted, tick.checkpoint, next, [entry('demo-1', next, 'bme_unavailable')]);
      await rpc(db, 'sdp_hybrid_commit_tick', [tick, owner, token.epoch]);
      const rows = (await db.query('select node_id,temperature_c,evidence_event_id,observed_at from sdp_node_samples where run_id=$1 and sequence=1 order by node_id', [accepted.run_id])).rows;
      assert.equal(rows[0].evidence_event_id, null); assert.equal(rows[0].observed_at, null);
      assert.equal(rows[1].temperature_c, null);
      const retained = entry('demo-1', next, 'bme_unavailable');
      const repeat = prepareHybridTick(accepted, tick.checkpoint, '2026-01-08T04:01:00.000Z', [retained]);
      assert.equal(repeat.events.filter(e => e.event_type === 'NODE_EVIDENCE').length, 0);
      await rpc(db, 'sdp_hybrid_commit_tick', [repeat, owner, token.epoch]);
      tick = repeat;
    });
    await t.test('bad scope, correlation, null semantics and invented scores roll back the entire snapshot', async () => {
      const base = prepareHybridTick(accepted, tick.checkpoint, '2026-01-08T04:01:30.000Z', [entry('demo-1', '2026-01-08T04:01:30.000Z')]);
      const mutations = [
        v => { v.events[0].session_id = legacy.run_id; },
        v => { v.events.find(e => e.event_type === 'APPLIED_OUTPUT').payload.command_id = 'wrong-command'; },
        v => { v.samples[1].temperature_c = 0; },
        v => { v.events.find(e => e.event_type === 'NODE_EVIDENCE').payload.classification.value.class_scores = {}; },
        v => { v.events.find(e => e.event_type === 'NODE_EVIDENCE').payload.classification.value.headcount_category = 'ZERO'; },
        v => { v.events.find(e => e.event_type === 'NODE_EVIDENCE').payload.temperature_c.source_id = 'other-node/bme280'; },
        v => { v.checkpoint.evidence_ids['demo-1'] = 'wrong-evidence'; },
        v => { v.samples[0].node_id = v.samples[1].node_id; },
        v => { v.events.find(e => e.event_type === 'NODE_EVIDENCE').occurred_at = '2026-01-08T04:02:00.000Z'; },
        v => { v.events.find(e => e.event_type === 'APPLIED_OUTPUT').payload.feedback_basis = 'FIRMWARE_REPORT'; },
        v => { v.frame.occupancy = v.checkpoint.decision.payload.occupancy = v.events.find(e=>e.event_type==='ZONE_DECISION').payload.occupancy = 'VACANT'; }
      ];
      for (const mutate of mutations) {
        const bad = structuredClone(base); mutate(bad);
        await assert.rejects(rpc(db, 'sdp_hybrid_commit_tick', [bad, owner, token.epoch]));
        assert.equal((await db.query('select last_sequence::int as n from sdp_runs where run_id=$1', [accepted.run_id])).rows[0].n, 2);
      }
    });
    await t.test('anonymous and unauthorized users cannot read measured rows; approved reader cannot write', async () => {
      for (const who of ['anon', 'authenticated']) await role(db, who, async () => assert.equal((await db.query('select * from sdp_runs')).rows.length, 0));
      await db.query('insert into sdp_hybrid_readers values($1,$2)', [accepted.run_id, other]);
      await db.exec(`set request.jwt.claim.sub='${other}'`);
      await role(db, 'authenticated', async () => {
        assert.equal((await db.query('select * from sdp_runs')).rows.length, 1);
        assert.equal((await db.query('select count(*)::int as n from sdp_node_samples')).rows[0].n, 6);
        await assert.rejects(db.exec('delete from sdp_runs'), /permission denied/);
        await assert.rejects(db.query('select sdp_hybrid_acquire_writer($1::uuid,$2::uuid)', [accepted.run_id, other]), /permission denied/);
      });
      await db.exec('reset request.jwt.claim.sub');
      await role(db, 'service_role', async () => { await assert.rejects(db.exec('update sdp_runs set seed=0'), /permission denied/); });
    });
    await t.test('expired lease takeover fences the old owner even for duplicate retries', async () => {
      await db.query("update sdp_hybrid_leases set expires_at=clock_timestamp()-interval '1 second' where run_id=$1", [accepted.run_id]);
      const replacement = await rpc(db, 'sdp_hybrid_acquire_writer', [accepted.run_id, other]);
      assert.equal(replacement.epoch, token.epoch + 1);
      await assert.rejects(rpc(db, 'sdp_hybrid_commit_tick', [tick, owner, token.epoch]), /lease\/fence/);
      await assert.rejects(rpc(db, 'sdp_hybrid_commit_tick', [tick, null, null]), /lease\/fence/);
    });
    await t.test('stored hardware vacancy passes all four unchanged policy modes with the original timetable',async()=>{
      const replay=createHybridRun('77777777-7777-4777-8777-777777777777',anchor,nodes,{full_zone_coverage:true,replaces_active_run_id:accepted.run_id});
      await rpc(db,'sdp_hybrid_initialize_run',[replay]);
      const fencing=await rpc(db,'sdp_hybrid_acquire_writer',[replay.run_id,owner]);
      let previous=null;const modes=new Set();
      for(let elapsed=0;elapsed<=50*60_000;elapsed+=30_000){
        const at=new Date(Date.parse(anchor)+elapsed).toISOString();
        const next=prepareHybridTick(replay,previous,at,nodes.map(n=>entry(n.node_id,at,'empty')));
        const occupied=prepareHybridTick(replay,previous,at,nodes.map(n=>entry(n.node_id,at,'occupied')));
        assert.deepEqual(next.checkpoint.forecast,occupied.checkpoint.forecast);
        assert.equal(occupied.checkpoint.decision.payload.requested_mode,'OCCUPIED');
        await rpc(db,'sdp_hybrid_commit_tick',[next,owner,fencing.epoch]);previous=next.checkpoint;modes.add(previous.decision.payload.requested_mode);
      }
      assert.deepEqual([...modes],['OCCUPIED','SHORT_VACANCY','LONG_VACANCY','PRECOOL']);
      assert.equal((await db.query('select count(*)::int as n from sdp_zone_frames where run_id=$1',[replay.run_id])).rows[0].n,101);
      const broken=prepareHybridTick(replay,previous,'2026-01-08T04:50:30.000Z',[entry('demo-1','2026-01-08T04:50:30.000Z','inactive'),entry('any-device-42','2026-01-08T04:50:30.000Z','empty')]);
      await rpc(db,'sdp_hybrid_commit_tick',[broken,owner,fencing.epoch]);
      assert.equal(broken.checkpoint.fusion.vacant_since,null);
      assert.equal(broken.frame.occupancy,'UNCERTAIN');
    });
  } finally { await db.close(); }
});
