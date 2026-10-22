-- OPTIONAL ISOLATED HYBRID TEST PROJECT ONLY. NOT FOR THE SYNTHETIC DEMO.
-- Owner must provision the approved marker before this step. No data is removed.
begin;
do $$ begin
 if current_setting('omnisense.hybrid_isolated_lockdown_approved',true) is distinct from 'ISOLATED_TEST' or
   not exists(select 1 from public.sdp_hybrid_environment where kind='ISOLATED_TEST'
     and project_ref=current_setting('omnisense.hybrid_target_ref',true)
     and protected_project_ref=current_setting('omnisense.hybrid_protected_ref',true)
     and manifest_sha256=current_setting('omnisense.hybrid_manifest_sha256',true)
     and manifest_sha256 is not null) then raise exception 'Approved isolated identity/manifest required'; end if;
 if exists(select 1 from public.sdp_runs where model_version='sdp-scripted-v1') then
   raise exception 'Refusing hybrid-only lockdown of a project containing scripted runs'; end if;
end $$;
revoke execute on function public.sdp_initialize_run(jsonb),public.sdp_commit_tick(jsonb) from service_role;
commit;
