import { readFile, writeFile } from 'node:fs/promises';
import { COOLING_POLICY as p } from '../../packages/sdp-contract/dist/index.js';
const path = new URL('../../supabase/sdp/migrations/002_sdp_hybrid.sql', import.meta.url);
const generated = `-- BEGIN GENERATED COOLING POLICY (${p.version}); regenerate with generate-policy-sql.mjs
create function public._sdp_cooling_policy(at_time timestamptz, occupancy text, vacant_since timestamptz, next_use timestamptz, restart_at timestamptz) returns jsonb
language plpgsql immutable set search_path=pg_catalog,pg_temp as $$
declare mode text:='OCCUPIED'; confirmed timestamptz; elapsed numeric:=extract(epoch from at_time-vacant_since)*1000;
begin
 if occupancy='VACANT' and vacant_since is not null and elapsed>=${p.confirmation_ms} then
   mode:=case when next_use-vacant_since>=interval '${p.precool_gap_ms} milliseconds' and at_time>=restart_at and at_time<next_use then 'PRECOOL'
     when elapsed>=${p.long_vacancy_ms} then 'LONG_VACANCY' else 'SHORT_VACANCY' end;
   confirmed:=vacant_since+interval '${p.confirmation_ms} milliseconds';
 end if;
 return jsonb_build_object('mode',mode,'output','${JSON.stringify(p.outputs)}'::jsonb->mode,
   'vacancy_confirmed_at',case when confirmed is null then null else to_char(confirmed at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end);
end $$;
-- END GENERATED COOLING POLICY`;
let sql = await readFile(path,'utf8');
const pattern = /-- BEGIN GENERATED COOLING POLICY[\s\S]*?-- END GENERATED COOLING POLICY/;
const updated = pattern.test(sql) ? sql.replace(pattern,()=>generated) : sql.replace('-- Preserve all legacy table invariants', ()=>generated+'\n\n-- Preserve all legacy table invariants');
if (process.argv.includes('--check')) { if (sql.replaceAll('\r\n','\n') !== updated.replaceAll('\r\n','\n')) throw new Error('Generated SQL policy drift; regenerate and review migration'); }
else await writeFile(path,updated);
