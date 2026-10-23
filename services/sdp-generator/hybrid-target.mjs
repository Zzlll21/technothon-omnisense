import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const approvedTargets = new WeakSet();
const registryPath = new URL('./deployment/approved-hybrid-targets.json', import.meta.url);
const ref = v => typeof v === 'string' && /^[a-z0-9]{20}$/.test(v);
const uuid = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
/** Registry is fixed in reviewed source, never selected by env or CLI. Reader injection is for offline tests. */
export async function loadHybridTarget(path, reader = readFile) {
  let raw, registry, m;
  try { raw = await reader(path); if(Buffer.byteLength(raw)>32_768)throw new Error(); registry = JSON.parse(await reader(registryPath, 'utf8')); m = JSON.parse(raw); }
  catch { throw new Error('Unable to load approved hybrid target manifest'); }
  const digest = hash(raw);
  const approval = registry.schema_version === 'omnisense.hybrid-approvals.v1' && registry.approved?.find(a => a.manifest_sha256 === digest);
  if (!approval || approval.project_ref !== m.project_ref || !ref(m.project_ref) || approval.protected_project_ref !== m.protected_project_ref ||
    !ref(m.protected_project_ref) || m.project_ref === m.protected_project_ref || !Array.isArray(m.protected_project_refs) ||
    !m.protected_project_refs.includes(m.protected_project_ref) || m.protected_project_refs.some(r => !ref(r) || r === m.project_ref) ||
    m.schema_version !== 'omnisense.hybrid-target.v1' || m.environment_kind !== 'ISOLATED_TEST' ||
    m.url !== `https://${m.project_ref}.supabase.co` || !uuid(m.run_id) || !Array.isArray(m.nodes) || !m.nodes.length || m.nodes.length > 32 ||
    new Set(m.nodes.map(n => n.node_id)).size !== m.nodes.length || m.nodes.some(n => Object.keys(n).sort().join(',')!=='label,node_id,x,y' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(n.node_id) || typeof n.label !== 'string' || !n.label.trim() || n.label.length>128 || !Number.isFinite(n.x) || n.x<0 || n.x>1 || !Number.isFinite(n.y) || n.y<0 || n.y>1) ||
    !m.nodes.some(n => n.node_id === m.representative_node_id) || typeof m.full_zone_coverage !== 'boolean' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(m.live_anchor ?? '') || !Number.isFinite(Date.parse(m.live_anchor)) || new Date(m.live_anchor).toISOString()!==m.live_anchor ||
    (m.replaces_active_run_id !== null && !uuid(m.replaces_active_run_id)) || m.replaces_active_run_id === m.run_id ||
    !/^http:\/\/127\.0\.0\.1:\d{4,5}$/.test(m.preview_origin ?? '') ||
    !m.migrations || !['001_sdp_foundation.sql','002_sdp_hybrid.sql','003_sdp_hybrid_isolated_lockdown.sql'].every(k => /^[a-f0-9]{64}$/.test(m.migrations[k] ?? '')))
    throw new Error('Hybrid target is not independently approved or has invalid scope');
  // Credentials never belong in an approval manifest or its browser projection.
  const expectedKeys = ['schema_version','environment_kind','project_ref','protected_project_ref','protected_project_refs','url','run_id','live_anchor','nodes','representative_node_id','full_zone_coverage','replaces_active_run_id','preview_origin','migrations'];
  if (Object.keys(m).some(k => !expectedKeys.includes(k))) throw new Error('Unknown hybrid manifest field');
  const target = Object.freeze({ ...m, manifest_sha256: digest, nodes: Object.freeze(m.nodes.map(n => Object.freeze({...n}))), migrations: Object.freeze({...m.migrations}), protected_project_refs: Object.freeze([...m.protected_project_refs]) });
  approvedTargets.add(target);
  return target;
}
export function assertHybridTarget(target) {
  if (!approvedTargets.has(target)) throw new Error('Load a manifest pinned in the reviewed approval registry first');
}
export async function verifyMigrationFiles(target, reader = readFile) {
  assertHybridTarget(target);
  for (const [name, expected] of Object.entries(target.migrations)) {
    if (!['001_sdp_foundation.sql','002_sdp_hybrid.sql','003_sdp_hybrid_isolated_lockdown.sql'].includes(name) ||
      hash(await reader(new URL(`../../supabase/sdp/migrations/${name}`, import.meta.url))) !== expected) throw new Error('Approved migration hash mismatch');
  }
}
