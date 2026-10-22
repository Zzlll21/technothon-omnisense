import { createClient } from '@supabase/supabase-js';
import { validateStoredSdpEvent, eventMatchesRun } from '../../packages/sdp-contract/dist/index.js';
import { assertHybridTarget } from './hybrid-target.mjs';

export class HybridWriteError extends Error {
  constructor(kind) { super(`Hybrid write ${kind}; no raw upstream response logged`); this.kind = kind; }
}

/** Separate opt-in configuration; never reads or falls back to the synthetic .env. */
export function hybridWriteConfiguration(env, confirmation, target) {
  assertHybridTarget(target);
  const expectedRef = env.HYBRID_EXPECTED_PROJECT_REF, protectedRef = env.HYBRID_PROTECTED_PROJECT_REF;
  if (env.HYBRID_ENABLE_WRITES !== 'true' || env.HYBRID_ENVIRONMENT_KIND !== 'ISOLATED_TEST') throw new Error('Hybrid writes disabled; isolated test opt-in required');
  if (!/^[a-z0-9]{20}$/.test(expectedRef ?? '') || !/^[a-z0-9]{20}$/.test(protectedRef ?? '') || expectedRef === protectedRef || confirmation !== expectedRef) throw new Error('Confirm distinct test/protected project references');
  if (env.HYBRID_SUPABASE_URL !== `https://${expectedRef}.supabase.co`) throw new Error('Hybrid URL must exactly match confirmed test project');
  if (!/^sb_secret_[A-Za-z0-9_-]+$/.test(env.HYBRID_SUPABASE_SECRET_KEY ?? '')) throw new Error('Hybrid backend Secret API Key required');
  if (expectedRef !== target.project_ref || protectedRef !== target.protected_project_ref || env.HYBRID_SUPABASE_URL !== target.url) throw new Error('Environment differs from independently approved target');
  return { url: env.HYBRID_SUPABASE_URL, key: env.HYBRID_SUPABASE_SECRET_KEY, expectedRef, protectedRef, target };
}

/** Construction sends nothing. No executable/cloud CLI is provided in this stage. */
export function createHybridWriter(config, transport = fetch) {
  assertHybridTarget(config.target);
  if (typeof window !== 'undefined') throw new Error('Hybrid writer is server-only');
  if (config.expectedRef !== config.target.project_ref || config.protectedRef !== config.target.protected_project_ref ||
    !/^[a-z0-9]{20}$/.test(config.expectedRef ?? '') || !/^[a-z0-9]{20}$/.test(config.protectedRef ?? '') ||
    !/^sb_secret_[A-Za-z0-9_-]+$/.test(config.key ?? '') || config.url !== `https://${config.expectedRef}.supabase.co` || config.expectedRef === config.protectedRef) throw new Error('Invalid isolated writer target');
  const names = new Set(['sdp_hybrid_info', 'sdp_hybrid_initialize_run', 'sdp_get_run', 'sdp_hybrid_acquire_writer', 'sdp_hybrid_commit_tick']);
  let verified = false;
  const client = createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch(input, init) {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
      if (url.origin !== config.url || !names.has(url.pathname.replace('/rest/v1/rpc/', '')) || !url.pathname.startsWith('/rest/v1/rpc/') || url.search || init?.method !== 'POST') throw new Error('Unexpected hybrid request blocked');
      const headers = new Headers(init.headers); headers.delete('Authorization');
      return transport(input, { ...init, headers, redirect: 'error' });
    } }
  });
  async function rpc(name, args = {}) {
    if (!verified && name !== 'sdp_hybrid_info') throw new Error('Verify isolated environment before hybrid operations');
    let result;
    try { result = await client.rpc(name, args).retry(false).abortSignal(AbortSignal.timeout(30_000)); }
    catch { throw new HybridWriteError('RETRY'); }
    if (result.error || result.status === 0) {
      const message = result.error?.message ?? '';
      const kind = result.status === 0 || result.status >= 500 || ['40001','40P01','57014'].includes(result.error?.code) ? 'RETRY'
        : /Writer lease\/fence|already leased/.test(message) ? 'LEASE'
        : /Checkpoint conflict|Conflicting retry/.test(message) ? 'CONFLICT' : 'INVALID';
      throw new HybridWriteError(kind);
    }
    return result.data;
  }
  return {
    async verify() {
      const info = await rpc('sdp_hybrid_info');
      verified = info?.installation === 'omnisense-sdp-hybrid-v1' && info?.model_version === 'sdp-hybrid-v1' &&
        info.environment?.kind === 'ISOLATED_TEST' && info.environment.project_ref === config.expectedRef && info.environment.protected_project_ref === config.protectedRef &&
        info.environment.manifest_sha256 === config.target.manifest_sha256 && info.hybrid_only === true;
      if (!verified) throw new Error('Hybrid isolated environment marker mismatch');
    },
    initialize(run) {
      if (run.model_version !== 'sdp-hybrid-v1') throw new Error('Hybrid writer refuses scripted runs');
      return rpc('sdp_hybrid_initialize_run', { p_run: run });
    },
    getRun: id => rpc('sdp_get_run', { p_run_id: id }),
    acquire: (id, owner) => rpc('sdp_hybrid_acquire_writer', { p_run_id: id, p_owner_id: owner }),
    async commit(tick, lease) {
      for (const event of tick.events) {
        const checked = validateStoredSdpEvent(event);
        if (!checked.ok || !eventMatchesRun(checked.value, tick.run_id, 'sdp-hybrid-v1')) throw new Error('Invalid hybrid transaction envelope');
      }
      const result = await rpc('sdp_hybrid_commit_tick', { p_tick: tick, p_owner_id: lease.owner_id, p_epoch: lease.epoch });
      if (result?.ok !== true || result.sequence !== tick.frame.sequence) throw new HybridWriteError('RETRY');
      return tick.checkpoint;
    }
  };
}
