import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createRun, generateTick } from '../dist/model.js';

const migration = await readFile(new URL('../../../supabase/sdp/migrations/001_sdp_foundation.sql', import.meta.url), 'utf8');
const verification = await readFile(new URL('../../../supabase/sdp/tests/read-only-checks.sql', import.meta.url), 'utf8');
const run = createRun('33333333-3333-4333-8333-333333333333', '2026-01-08T00:00:00.000Z');
async function database() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;`);
  return db;
}
async function asRole(db, role, work) {
  await db.exec(`set role ${role}`);
  try { return await work(); } finally { await db.exec('reset role'); }
}
async function rpc(db, name, value) {
  return asRole(db, 'service_role', async () => {
    const result = await db.query(`select public.${name}($1::jsonb) as result`, [JSON.stringify(value)]);
    return result.rows[0].result;
  });
}
async function counts(db) {
  return (await db.query(`select
    (select count(*)::int from sdp_zone_frames) as frames,
    (select count(*)::int from sdp_node_samples) as samples,
    (select count(*)::int from sdp_events) as events,
    (select last_sequence::int from sdp_runs where run_id = '${run.run_id}') as sequence`)).rows[0];
}

test('migration refuses legacy project and rolls back every object', async () => {
  const db = await database();
  try {
    await db.exec('create table public.sensor_readings(id integer)');
    await assert.rejects(db.exec(migration), /legacy sensor_readings/);
    await db.exec('rollback');
    const result = await db.query("select to_regclass('public.sdp_runs') as missing");
    assert.equal(result.rows[0].missing, null);
  } finally { await db.close(); }
});

test('local PostgreSQL exercises atomic seed/restart/idempotency and actual RLS', async t => {
  const db = await database();
  try {
    await db.exec(`create table public.compatibility_probe(id integer primary key);
      insert into public.compatibility_probe values (17);
      create function public.compatibility_probe() returns integer language sql as 'select 17';`);
    await db.exec(migration);
    await t.test('only SDP objects change; all privileged functions have a trusted search path', async () => {
      const functions = (await db.query("select proname, prosecdef, proconfig from pg_proc where pronamespace = 'public'::regnamespace and proname like 'sdp_%' order by proname")).rows;
      assert.equal(functions.length, 4);
      for (const fn of functions) {
        assert.equal(fn.prosecdef, true);
        assert.deepEqual(fn.proconfig, ['search_path=pg_catalog, pg_temp']);
      }
      const rls = (await db.query("select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and relname like 'sdp_%'")).rows;
      assert.equal(rls.length, 6);
      assert.ok(rls.every(row => row.relrowsecurity));
      await asRole(db, 'anon', async () => {
        assert.equal((await db.query('select id from public.compatibility_probe')).rows[0].id, 17);
        assert.equal((await db.query('select public.compatibility_probe() as value')).rows[0].value, 17);
      });
    });
    await t.test('installation and immutable bootstrap, despite broad default grants', async () => {
      const info = await asRole(db, 'service_role', () => db.query('select sdp_generator_info() as info'));
      assert.equal(info.rows[0].info.legacy_present, false);
      assert.equal((await rpc(db, 'sdp_initialize_run', run)).checkpoint, null);
      assert.equal((await rpc(db, 'sdp_initialize_run', run)).status, 'SEEDING');
      await assert.rejects(rpc(db, 'sdp_initialize_run', { ...run, seed: 77 }), /immutable/);
      assert.equal((await db.query('select count(*)::int as n from sdp_nodes')).rows[0].n, 2);
    });
    let first;
    await t.test('missing event headers fail database checks and roll back the whole tick', async () => {
      for (const key of ['schema_version', 'session_id', 'zone_id', 'clock', 'data_sources', 'payload']) {
        const incomplete = structuredClone(generateTick(run, null));
        delete incomplete.events[0][key];
        await assert.rejects(rpc(db, 'sdp_commit_tick', incomplete), /check constraint/);
        assert.equal((await counts(db)).frames, 0);
        assert.equal((await counts(db)).sequence, -1);
      }
    });
    await t.test('exact retry inserts once; conflicting retry rejects', async () => {
      first = generateTick(run, null);
      const mismatched = structuredClone(first);
      mismatched.events.find(e => e.event_type === 'APPLIED_OUTPUT').payload.command_id = 'not-the-requested-command';
      await assert.rejects(rpc(db, 'sdp_commit_tick', mismatched), /correlation invalid/);
      assert.equal((await counts(db)).frames, 0);
      assert.equal((await counts(db)).sequence, -1);
      assert.equal((await rpc(db, 'sdp_commit_tick', first)).duplicate, false);
      const before = await counts(db);
      assert.equal((await rpc(db, 'sdp_commit_tick', first)).duplicate, true);
      assert.deepEqual(await counts(db), before);
      const conflict = structuredClone(first);
      conflict.checkpoint.temperature_c += 0.1;
      await assert.rejects(rpc(db, 'sdp_commit_tick', conflict), /Conflicting retry/);
      assert.deepEqual(await counts(db), before);
    });
    await t.test('late sample failure rolls back frame, samples, events and checkpoint', async () => {
      const bad = generateTick(run, first.checkpoint);
      bad.samples[1] = structuredClone(bad.samples[0]);
      const before = await counts(db);
      await assert.rejects(rpc(db, 'sdp_commit_tick', bad), /duplicate key/);
      assert.deepEqual(await counts(db), before);
    });
    await t.test('bad sequence/time or causal correlation cannot advance checkpoint', async () => {
      const before = await counts(db);
      const bad = generateTick(run, first.checkpoint);
      bad.frame.sequence++;
      await assert.rejects(rpc(db, 'sdp_commit_tick', bad), /Checkpoint conflict/);
      const wrongTime = generateTick(run, first.checkpoint);
      wrongTime.frame.simulated_at = '2026-01-01T00:06:00.000Z';
      await assert.rejects(rpc(db, 'sdp_commit_tick', wrongTime), /timestamp/);
      const wrongOutput = generateTick(run, first.checkpoint);
      wrongOutput.frame.output_event_id = wrongOutput.frame.decision_event_id;
      await assert.rejects(rpc(db, 'sdp_commit_tick', wrongOutput), /no rows/);
      assert.deepEqual(await counts(db), before);
    });
    await t.test('SEEDING is invisible; browser and service roles cannot mutate tables', async () => {
      for (const role of ['anon', 'authenticated']) {
        await asRole(db, role, async () => {
          for (const table of ['sdp_runs', 'sdp_zones', 'sdp_nodes', 'sdp_zone_frames', 'sdp_node_samples', 'sdp_events']) {
            assert.equal((await db.query(`select * from ${table}`)).rows.length, 0);
            for (const privilege of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
              assert.equal((await db.query('select has_table_privilege(current_user, $1, $2) as granted', [table, privilege])).rows[0].granted, false);
            }
          }
          for (const fn of ['sdp_generator_info()', 'sdp_initialize_run(jsonb)', 'sdp_get_run(uuid)', 'sdp_commit_tick(jsonb)']) {
            assert.equal((await db.query('select has_function_privilege(current_user, $1, $2) as granted', [fn, 'EXECUTE'])).rows[0].granted, false);
          }
          await assert.rejects(db.query('select sdp_commit_tick($1::jsonb)', [JSON.stringify(first)]), /permission denied/);
          await assert.rejects(db.exec('delete from sdp_runs'), /permission denied/);
        });
      }
      await asRole(db, 'service_role', async () => {
        await assert.rejects(db.exec('update sdp_runs set seed = 100'), /permission denied/);
      });
    });
    let last = first;
    await t.test('seed to completion, recover serialized checkpoint and publish atomically', async () => {
      while (last.frame.simulated_at < run.live_anchor) {
        const restored = (await asRole(db, 'service_role', () => db.query('select sdp_get_run($1::uuid) as r', [run.run_id]))).rows[0].r;
        const next = generateTick(restored.definition, restored.checkpoint);
        assert.deepEqual(next, generateTick(run, last.checkpoint));
        await rpc(db, 'sdp_commit_tick', next);
        last = next;
      }
      const count = await counts(db);
      assert.equal(count.frames, 2017);
      assert.equal(count.samples, 4034);
      await asRole(db, 'anon', async () => {
        assert.equal((await db.query('select status from sdp_runs')).rows[0].status, 'ACTIVE');
        assert.equal((await db.query('select count(*)::int as n from sdp_node_samples')).rows[0].n, 4034);
      });
      const times = await db.query('select bool_and(inserted_at > simulated_at) as separate from sdp_zone_frames');
      assert.equal(times.rows[0].separate, true);
    });
    await t.test('continuous frame advances exactly thirty seconds and retries safely', async () => {
      const next = generateTick(run, last.checkpoint);
      assert.equal(Date.parse(next.frame.simulated_at) - Date.parse(last.frame.simulated_at), 30_000);
      assert.equal((await rpc(db, 'sdp_commit_tick', next)).duplicate, false);
      assert.equal((await rpc(db, 'sdp_commit_tick', next)).duplicate, true);
      const before = await counts(db);
      const crossRun = generateTick(run, next.checkpoint);
      crossRun.events[0].session_id = 'different-run';
      await assert.rejects(rpc(db, 'sdp_commit_tick', crossRun), /check constraint/);
      assert.deepEqual(await counts(db), before);
    });
    await t.test('manual verification SQL is executable and read-only', async () => {
      const before = await counts(db);
      const results = await db.exec(verification);
      assert.ok(results.length >= 9);
      assert.deepEqual(await counts(db), before);
      const latest = results.at(-1).rows;
      assert.deepEqual(latest.map(s => s.node_id), ['sim-1', 'sim-2']);
    });
    await t.test('new seed publishes atomically, preserves old rows, and blocks archived writes', async () => {
      const newRun = createRun('44444444-4444-4444-8444-444444444444', '2026-01-08T00:00:00.000Z');
      await rpc(db, 'sdp_initialize_run', newRun);
      let second = generateTick(newRun, null);
      await rpc(db, 'sdp_commit_tick', second);
      await asRole(db, 'anon', async () => {
        const visible = (await db.query('select run_id from sdp_runs')).rows;
        assert.deepEqual(visible.map(r => r.run_id), [run.run_id]);
      });
      while (second.frame.simulated_at < newRun.live_anchor) {
        second = generateTick(newRun, second.checkpoint);
        await rpc(db, 'sdp_commit_tick', second);
      }
      await asRole(db, 'anon', async () => {
        const visible = (await db.query('select run_id from sdp_runs')).rows;
        assert.deepEqual(visible.map(r => r.run_id), [newRun.run_id]);
        assert.equal((await db.query('select count(*)::int as n from sdp_zone_frames')).rows[0].n, 2017);
      });
      assert.equal((await db.query('select status from sdp_runs where run_id = $1', [run.run_id])).rows[0].status, 'ARCHIVED');
      assert.equal((await db.query('select count(*)::int as n from sdp_zone_frames')).rows[0].n, 4035);
      const cp = (await db.query('select checkpoint from sdp_runs where run_id = $1', [run.run_id])).rows[0].checkpoint;
      await assert.rejects(rpc(db, 'sdp_commit_tick', generateTick(run, cp)), /Archived/);
    });
  } finally { await db.close(); }
});
