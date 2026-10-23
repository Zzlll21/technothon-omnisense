import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRun, generateTick } from '../dist/model.js';
import { createWriter, writeConfiguration, commitTick } from '../writer.mjs';

const ref = 'abcdefghijklmnopqrst';
// Intentionally unsigned test fixture, not a real credential.
const fakeKey = `test.${Buffer.from('{"role":"service_role"}').toString('base64url')}.not-a-signature`;
const fakeSecret = 'sb_secret_offline_test_only_not_a_real_credential';
const env = { SDP_ENABLE_WRITES: 'true', SDP_EXPECTED_PROJECT_REF: ref, SDP_SUPABASE_URL: `https://${ref}.supabase.co`, SDP_SUPABASE_SERVICE_ROLE_KEY: fakeKey };
const secretEnv = { ...env, SDP_SUPABASE_SERVICE_ROLE_KEY: '', SDP_SUPABASE_SECRET_KEY: fakeSecret };
const run = createRun('22222222-2222-4222-8222-222222222222', '2026-10-21T00:00:00.000Z');
const tick = generateTick(run, null);
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('write guard requires every explicit opt-in and a service-role key', () => {
  assert.equal(writeConfiguration(env, ref).url, env.SDP_SUPABASE_URL);
  for (const changes of [{ SDP_ENABLE_WRITES: 'false' }, { SDP_SUPABASE_URL: 'https://old-project.supabase.co' }, { SDP_EXPECTED_PROJECT_REF: '' }, { SDP_SUPABASE_SERVICE_ROLE_KEY: 'public-test-key' }]) {
    assert.throws(() => writeConfiguration({ ...env, ...changes }, ref));
  }
  assert.throws(() => writeConfiguration(env, 'wrong-project'));
});
test('opaque Secret API Keys are accepted without JWT decoding; public and ambiguous keys fail closed', () => {
  assert.equal(writeConfiguration(secretEnv, ref).key, fakeSecret);
  assert.throws(() => writeConfiguration({ ...env, SDP_SUPABASE_SECRET_KEY: fakeSecret }, ref), /only one/);
  for (const key of ['sb_publishable_offline_test', fakeKey, 'sb_secret_', 'sb_secret_contains space', 'unknown']) {
    assert.throws(() => writeConfiguration({ ...secretEnv, SDP_SUPABASE_SECRET_KEY: key }, ref));
  }
  const anonJwt = `test.${Buffer.from('{"role":"anon"}').toString('base64url')}.not-a-signature`;
  assert.throws(() => writeConfiguration({ ...env, SDP_SUPABASE_SERVICE_ROLE_KEY: anonJwt }, ref));
});
test('server SDK sends secrets only as apikey and uses bounded, non-redirecting RPC requests', async () => {
  for (const [configuration, expectedBearer] of [[secretEnv, null], [env, `Bearer ${fakeKey}`]]) {
    const calls = [];
    const w = createWriter(writeConfiguration(configuration, ref), async (url, req) => {
      calls.push({ url, req });
      if (String(url).endsWith('sdp_generator_info')) return response({ installation: 'omnisense-sdp-isolated-v1', model_version: 'sdp-scripted-v1', legacy_present: false });
      if (String(url).endsWith('sdp_commit_tick')) return response({ ok: true, duplicate: false, sequence: 0 });
      return response(null);
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls.length, 0, 'client initialization must not make auth/network requests');
    await w.verify();
    await w.getRun(run.run_id);
    await w.initialize(run);
    await w.commit(tick);
    assert.equal(calls.length, 4);
    for (const { url, req } of calls) {
      const headers = new Headers(req.headers);
      assert.equal(headers.get('apikey'), configuration.SDP_SUPABASE_SECRET_KEY || fakeKey);
      assert.equal(headers.get('Authorization'), expectedBearer);
      assert.equal(headers.has('Cookie'), false);
      assert.equal(req.method, 'POST');
      assert.equal(req.redirect, 'error');
      assert.ok(req.signal instanceof AbortSignal);
      assert.equal(new URL(url).origin, env.SDP_SUPABASE_URL);
      assert.equal(String(url).includes('sb_secret_'), false);
    }
  }
});
test('writer construction is rejected in browser contexts', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  try {
    Object.defineProperty(globalThis, 'window', { value: {}, configurable: true });
    assert.throws(() => createWriter(writeConfiguration(secretEnv, ref)), /only run on the server/);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else delete globalThis.window;
  }
});
test('dedicated installation marker is verified and no legacy endpoint is contacted', async () => {
  const calls = [];
  const w = createWriter(writeConfiguration(env, ref), async (url, req) => {
    calls.push({ url, req });
    return response({ installation: 'omnisense-sdp-isolated-v1', model_version: 'sdp-scripted-v1', legacy_present: false });
  });
  assert.equal(calls.length, 0);
  await w.verify();
  assert.equal(calls[0].url, `${env.SDP_SUPABASE_URL}/rest/v1/rpc/sdp_generator_info`);
  const bad = createWriter(writeConfiguration(env, ref), async () => response({ installation: 'wrong' }));
  await assert.rejects(bad.verify(), /dedicated/);
});
test('failed and ambiguous writes retain identical payload; checkpoint advances only on acknowledgement', async () => {
  const bodies = [];
  let checkpoint = null;
  const w = createWriter(writeConfiguration(env, ref), async (_url, req) => {
    bodies.push(req.body);
    if (bodies.length === 1) throw new Error(`transport contains sensitive ${fakeKey}`);
    return response({ ok: true, duplicate: true, sequence: 0 });
  });
  await assert.rejects(async () => { checkpoint = await commitTick(w, tick); }, /network failure/);
  assert.equal(checkpoint, null);
  checkpoint = await commitTick(w, tick);
  assert.equal(checkpoint.sequence, 0);
  assert.equal(bodies[0], bodies[1]);
});
test('database and network errors exclude arbitrary response content and both key formats', async () => {
  for (const configuration of [env, secretEnv]) {
    const w = createWriter(writeConfiguration(configuration, ref), async () => response({ code: '23505', message: `${fakeKey} ${fakeSecret}`, details: fakeSecret, hint: fakeKey }, 409));
    await assert.rejects(w.commit(tick), error => error.message.includes('23505') && !error.message.includes(fakeKey) && !error.message.includes(fakeSecret));
    const broken = createWriter(writeConfiguration(configuration, ref), async () => { throw new Error(`${fakeKey} ${fakeSecret}`); });
    await assert.rejects(broken.verify(), error => /network failure/.test(error.message) && !error.message.includes(fakeKey) && !error.message.includes(fakeSecret));
  }
});
test('malformed contract events and invalid acknowledgements are rejected', async () => {
  let calls = 0;
  const w = createWriter(writeConfiguration(env, ref), async () => { calls++; return response({ ok: true, sequence: 99 }); });
  const bad = structuredClone(tick);
  bad.events[0].schema_version = 'wrong';
  await assert.rejects(w.commit(bad), /Invalid SDP event/);
  assert.equal(calls, 0);
  await assert.rejects(w.commit(tick), /Unexpected commit/);
});
test('offline CLI does not need credentials; help and invalid options are safe', () => {
  const cwd = new URL('..', import.meta.url);
  const result = spawnSync(process.execPath, ['index.mjs', '--frames', '3'], { cwd, encoding: 'utf8', env: { PATH: process.env.PATH } });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /OFFLINE DRY RUN/);
  assert.match(result.stdout, /3 frames, 6 samples/);
  assert.match(result.stdout, /no network requests made/);
  const bad = spawnSync(process.execPath, ['index.mjs', '--unknown'], { cwd, encoding: 'utf8' });
  assert.equal(bad.status, 1);
});
