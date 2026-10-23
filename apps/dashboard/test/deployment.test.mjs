import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withDeploymentOrigin } from '../scripts/deployment-origin.mjs';
import { auditStaticDirectory, vercelOutputConfig } from '../scripts/prepare-vercel.mjs';

const target = { url: 'https://abcdefghijklmnopqrst.supabase.co', run_id: 'approved-test-run', preview_origin: 'http://127.0.0.1:5178' };
// Reserved documentation domain: test input only, never a production configuration.
const origin = 'https://dashboard.example.com';

test('production origin is exact HTTPS, build-only and never mutates the approved target or local/synthetic configuration', () => {
  assert.equal(withDeploymentOrigin(target, undefined, 'serve'), target);
  assert.equal(withDeploymentOrigin(undefined, undefined, 'build'), undefined);
  assert.deepEqual(withDeploymentOrigin(target, origin + '/', 'build'), { ...target, preview_origin: origin });
  assert.equal(target.preview_origin, 'http://127.0.0.1:5178');
  for (const value of ['', 'http://dashboard.example.com', 'https://*.vercel.app', 'https://user:pass@dashboard.example.com',
    'https://dashboard.example.com/path', 'https://dashboard.example.com?x=1', 'https://dashboard.example.com#x',
    'https://127.0.0.1', 'https://localhost', 'https://x.localhost', 'https://dashboard.example.com:8443'])
    assert.throws(() => withDeploymentOrigin(target, value, 'build'));
  assert.throws(() => withDeploymentOrigin(target, origin, 'serve'));
  assert.throws(() => withDeploymentOrigin(undefined, origin, 'build'));
});

test('static output preserves landing/assets and supported SPA deep links without rewriting missing private files', () => {
  function route(path, exists = false) {
    for (const rule of vercelOutputConfig.routes) {
      if (rule.handle === 'filesystem') { if (exists) return { file: path }; continue; }
      if (new RegExp(`^${rule.src}$`).test(path)) return rule;
    }
    return { status: 404 };
  }
  assert.equal(vercelOutputConfig.version, 3);
  assert.equal(route('/landing').headers.Location, '/landing/');
  assert.equal(route('/landing/').dest, '/landing/index.html');
  for (const path of ['/', '/index.html', '/workspace', '/workspace/']) assert.equal(route(path).dest, '/index.html');
  assert.equal(route('/assets/app.js', true).file, '/assets/app.js');
  for (const path of ['/assets/missing.js', '/landing/missing.js', '/.env.hybrid.local', '/services/sdp-generator/hybrid-runtime.local.env'])
    assert.equal(route(path).status, 404);
});

test('static audit requires exact private run/origin, rejects secrets and unexpected files, and inventories only presentation assets', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'omnisense-deployment-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, 'assets'));
  await mkdir(join(directory, 'landing'));
  for (const file of ['index.html', 'landing/index.html', 'landing/office-scene.js']) await writeFile(join(directory, file), 'presentation');
  const config = { url: target.url, key: 'sb_publishable_FAKE_TEST_ONLY', error: null, privateHybrid: true, expectedRunId: target.run_id, previewOrigin: origin };
  const expected = { ...target, preview_origin: origin, key: config.key };
  await writeFile(join(directory, 'assets/app.js'), `const config=${JSON.stringify(config)};`);
  assert.equal((await auditStaticDirectory(directory, expected)).length, 4);
  await assert.rejects(auditStaticDirectory(directory, { ...expected, run_id: 'another-run' }), /Rebuild/);
  await assert.rejects(auditStaticDirectory(directory, { ...expected, preview_origin: 'https://another.example.com' }), /Rebuild/);
  await writeFile(join(directory, 'assets/app.js'), `const config=${JSON.stringify(config)}; const secret='sb_secret_TEST_ONLY_DO_NOT_USE';`);
  await assert.rejects(auditStaticDirectory(directory, expected), /credential/);
  await writeFile(join(directory, 'assets/app.js'), `const config=${JSON.stringify(config)}; const password="PRIVATE_TEST_PASSWORD";`);
  await assert.rejects(auditStaticDirectory(directory, expected, ['PRIVATE_TEST_PASSWORD']), /private configuration/);
  const jwt = 'eyJ0eXAiOiJKV1QifQ.' + Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url') + '.signature';
  await writeFile(join(directory, 'assets/app.js'), `const config=${JSON.stringify(config)}; const jwt="${jwt}";`);
  await assert.rejects(auditStaticDirectory(directory, expected), /Service-role/);
  await writeFile(join(directory, 'assets/app.js'), `const config=${JSON.stringify(config)};`);
  await writeFile(join(directory, '.env.hybrid.local'), 'PRIVATE_TEST_CONFIG');
  await assert.rejects(auditStaticDirectory(directory, expected), /unapproved file/);
});
