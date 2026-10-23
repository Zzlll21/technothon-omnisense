// Local packaging only: never deploys, logs in, contacts Supabase or starts a Writer.
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, dirname, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { parseEnv } from 'node:util';
import ts from 'typescript';
import { withDeploymentOrigin } from './deployment-origin.mjs';
import { loadHybridTarget, verifyMigrationFiles } from '../../../services/sdp-generator/hybrid-target.mjs';

export const vercelOutputConfig = {
  version: 3,
  routes: [
    { src: '/landing', status: 308, headers: { Location: '/landing/' } },
    { src: '/landing/', dest: '/landing/index.html' },
    { handle: 'filesystem' },
    // Missing assets/private paths must not masquerade as the SPA.
    { src: '/(?:assets|landing)/.*', status: 404 },
    { src: '/(?:index\\.html|workspace/?)?', dest: '/index.html' }
  ]
};

function objectValues(node) {
  const values = {};
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const value = property.initializer;
    const name = ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) ? property.name.text : '';
    if (ts.isStringLiteral(value)) values[name] = value.text;
    else if (value.kind === ts.SyntaxKind.NullKeyword) values[name] = null;
    else if (value.kind === ts.SyntaxKind.TrueKeyword || value.getText() === '!0') values[name] = true;
  }
  return values;
}

export async function auditStaticDirectory(directory, expected, privateValues = []) {
  const files = [];
  let matchingConfiguration = false;
  async function walk(folder) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const path = resolve(folder, entry.name), name = relative(directory, path).replaceAll('\\', '/');
      if (entry.isSymbolicLink()) throw new Error('Static output contains a symbolic link');
      if (entry.isDirectory()) { await walk(path); continue; }
      if (!entry.isFile() || !/^(?:index\.html|zone-plan\.svg|assets\/[A-Za-z0-9_-]+\.(?:js|css)|landing\/(?:index\.html|styles\.css|app\.js|office-scene\.js|vendor\/(?:gsap|ScrollTrigger)\.min\.js))$/.test(name))
        throw new Error('Static output contains an unapproved file');
      const bytes = await readFile(path), text = bytes.toString('utf8');
      if (/sb_secret_[A-Za-z0-9_-]+|-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text)) throw new Error('Private credential detected in static output');
      for (const token of text.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) ?? []) {
        try { if (JSON.parse(Buffer.from(token.split('.')[1], 'base64url')).role === 'service_role') throw new Error('Service-role credential detected in static output'); }
        catch (error) { if (error.message === 'Service-role credential detected in static output') throw error; }
      }
      // Ignore standard encoding alphabets, which can incidentally contain short passwords.
      const withoutAlphabets = text.replace(/ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789[+/_-]{0,2}/g, '');
      for (const value of privateValues.filter(Boolean)) {
        if ((value.length >= 8 && withoutAlphabets.includes(value)) || text.includes(JSON.stringify(value)))
          throw new Error('A local private configuration value was detected in static output');
      }
      if (name.endsWith('.js')) {
        const source = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
        function visit(node) {
          if (ts.isObjectLiteralExpression(node)) {
            const value = objectValues(node);
            if (value.privateHybrid === true && value.url === expected.url && value.key === expected.key && value.error === null &&
                value.expectedRunId === expected.run_id && value.previewOrigin === expected.preview_origin) matchingConfiguration = true;
          }
          ts.forEachChild(node, visit);
        }
        visit(source);
      }
      files.push({ path: name, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
  }
  await walk(directory);
  for (const required of ['index.html', 'landing/index.html', 'landing/office-scene.js'])
    if (!files.some(file => file.path === required)) throw new Error('Required presentation asset is missing');
  if (!matchingConfiguration) throw new Error('Rebuild with the exact approved private target and HTTPS site origin before packaging');
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

async function main() {
  const app = fileURLToPath(new URL('../', import.meta.url));
  const destination = process.argv[2];
  if (!destination || !isAbsolute(destination) || process.argv.length !== 3 || process.env.VITE_HYBRID_PRIVATE !== 'true' || !process.env.HYBRID_SITE_ORIGIN)
    throw new Error('Use package:hybrid -- ABSOLUTE_STAGING_DIRECTORY with HYBRID_SITE_ORIGIN set');
  const target = await loadHybridTarget(process.env.HYBRID_MANIFEST_PATH);
  await verifyMigrationFiles(target);
  const presentation = withDeploymentOrigin(target, process.env.HYBRID_SITE_ORIGIN, 'build');
  if (process.env.VITE_SUPABASE_URL !== target.url || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? ''))
    throw new Error('Approved private frontend environment is required');
  const stage = resolve(destination), root = resolve(app, '../..');
  if (!relative(root, stage).startsWith('..') || !relative(app, stage).startsWith('..')) throw new Error('Stage outside the source worktree');
  const privateConfig = parseEnv(await readFile(resolve(root, 'services/sdp-generator/hybrid-runtime.local.env'), 'utf8'));
  const privateValues = Object.entries(privateConfig).filter(([name]) => /PASSWORD|SECRET|SERVICE_ROLE|MQTT_USERNAME|MQTT_BROKER_URL/.test(name)).map(([,value]) => value);
  const dist = resolve(app, 'dist');
  const files = await auditStaticDirectory(dist, { ...presentation, key: process.env.VITE_SUPABASE_PUBLISHABLE_KEY }, privateValues);
  // A fresh output is mandatory; an existing linked project's project.json may remain.
  const output = resolve(stage, '.vercel/output');
  await mkdir(stage, { recursive: true });
  await mkdir(resolve(stage, '.vercel'), { recursive: true });
  await mkdir(output); // No recursive overwrite, cleanup, or reuse of old output.
  for (const file of files) {
    const path = resolve(output, 'static', file.path);
    await mkdir(dirname(path), { recursive: true });
    const bytes = await readFile(resolve(dist, file.path));
    if (createHash('sha256').update(bytes).digest('hex') !== file.sha256) throw new Error('Build output changed during packaging; do not deploy this staging folder');
    await writeFile(path, bytes, { flag: 'wx' });
  }
  await writeFile(resolve(output, 'config.json'), JSON.stringify(vercelOutputConfig, null, 2), { flag: 'wx' });
  await writeFile(resolve(stage, 'deployment-check.json'), JSON.stringify({ origin: presentation.preview_origin, project: target.project_ref, run: target.run_id, manifest_sha256: target.manifest_sha256, full_zone_coverage: target.full_zone_coverage, files }, null, 2), { flag: 'wx' });
  console.log(`Checked ${files.length} static assets. Local staging ready; nothing was uploaded.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch(() => { console.error('Hybrid packaging refused. Check the approved environment, HTTPS origin, clean staging path and static-output audit. No deployment was attempted.'); process.exitCode = 1; });
