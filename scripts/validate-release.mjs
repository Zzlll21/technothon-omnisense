// Offline checks only. Does not install packages, load dotenv, deploy or start services.
import { existsSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const guard = new URL('./offline-network-guard.mjs', import.meta.url).href;
const env = { ...process.env, NODE_OPTIONS: `--import=${guard}`,
  npm_config_offline: 'true', npm_config_audit: 'false', npm_config_fund: 'false',
  npm_config_update_notifier: 'false', NO_UPDATE_NOTIFIER: '1' };
// Never inherit live configuration from a demonstration terminal.
for (const name of Object.keys(env)) {
  if (/^(?:VITE_|HYBRID_|MQTT_|SDP_|SUPABASE_|VERCEL_|NPM_TOKEN$|NODE_AUTH_TOKEN$)/.test(name)) delete env[name];
}
const npm = [process.env.npm_execpath,
  resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
  resolve(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
  '/usr/share/nodejs/npm/bin/npm-cli.js'].find(path => path && existsSync(path));
if (!npm) throw new Error('npm CLI not found beside Node; run with npm exec or install Node with npm.');
function run(args, cwd = root) {
  console.log(`\nOffline check: ${args.join(' ')}`);
  const result = spawnSync(process.execPath, args, { cwd, env, stdio: 'inherit' });
  if (result.error || result.status !== 0) {
    console.error('Offline validation failed; no live fallback is permitted.');
    process.exit(result.status || 1);
  }
}
run([npm, '--prefix', 'packages/sdp-contract', 'test']);
run([npm, '--prefix', 'services/sdp-generator', 'test']);
const app = resolve(root, 'apps/dashboard');
const tests = readdirSync(resolve(app, 'test')).filter(name => name.endsWith('.test.mjs')).sort();
run(['--test', '--test-concurrency=1', ...tests.map(name => `test/${name}`)], app);
run([npm, '--prefix', 'apps/dashboard', 'run', 'typecheck']);
run([npm, '--prefix', 'apps/dashboard', 'run', 'build']);
console.log('\nAll offline release checks passed. No deployment or live integration started.');
