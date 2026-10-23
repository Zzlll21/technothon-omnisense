import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadHybridTarget } from '../../hybrid-target.mjs';
export async function targetFixture(changes={}) {
  const migrations={};
  for(const name of ['001_sdp_foundation.sql','002_sdp_hybrid.sql','003_sdp_hybrid_isolated_lockdown.sql']) migrations[name]=createHash('sha256').update(await readFile(new URL(`../../../../supabase/sdp/migrations/${name}`,import.meta.url))).digest('hex');
  const manifest={schema_version:'omnisense.hybrid-target.v1',environment_kind:'ISOLATED_TEST',project_ref:'abcdefghijklmnopqrst',protected_project_ref:'zzzzzzzzzzzzzzzzzzzz',protected_project_refs:['zzzzzzzzzzzzzzzzzzzz'],url:'https://abcdefghijklmnopqrst.supabase.co',run_id:'88888888-8888-4888-8888-888888888888',live_anchor:'2026-01-08T04:00:00.000Z',nodes:['demo-1','demo-2'].map((node_id,i)=>({node_id,label:node_id,x:.3+i*.4,y:.5})),representative_node_id:'demo-1',full_zone_coverage:false,replaces_active_run_id:null,preview_origin:'http://127.0.0.1:5178',migrations,...changes};
  const bytes=Buffer.from(JSON.stringify(manifest)),digest=createHash('sha256').update(bytes).digest('hex');
  const registry={schema_version:'omnisense.hybrid-approvals.v1',approved:[{manifest_sha256:digest,project_ref:manifest.project_ref,protected_project_ref:manifest.protected_project_ref}]};
  const reader=async path=>String(path).endsWith('approved-hybrid-targets.json')?JSON.stringify(registry):bytes;
  return {target:await loadHybridTarget('offline-fixture',reader),bytes,registry,reader};
}
