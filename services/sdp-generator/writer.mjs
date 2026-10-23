import { parseSdpEvents } from '../../packages/sdp-contract/dist/index.js';
import { createClient } from '@supabase/supabase-js';

export function writeConfiguration(env, confirmation) {
  if (env.SDP_ENABLE_WRITES !== 'true') throw new Error('Writes disabled: set SDP_ENABLE_WRITES=true explicitly');
  const ref = env.SDP_EXPECTED_PROJECT_REF;
  if (!ref || !/^[a-z0-9]{20}$/.test(ref) || ref === 'yourprojectreference') throw new Error('Set the dedicated SDP project reference');
  if (confirmation !== ref) throw new Error('--confirm-project must match SDP_EXPECTED_PROJECT_REF');
  if (env.SDP_SUPABASE_URL !== `https://${ref}.supabase.co`) throw new Error('SDP URL must exactly match the confirmed dedicated project');
  const secret = env.SDP_SUPABASE_SECRET_KEY;
  const legacy = env.SDP_SUPABASE_SERVICE_ROLE_KEY;
  if (secret && legacy) throw new Error('Configure only one backend key: SDP_SUPABASE_SECRET_KEY or the legacy fallback');
  if (secret) {
    if (!/^sb_secret_[A-Za-z0-9_-]+$/.test(secret)) throw new Error('SDP_SUPABASE_SECRET_KEY must be a server-only Secret API Key, not a publishable/anon key');
    return { url: env.SDP_SUPABASE_URL, key: secret };
  }
  const key = legacy;
  let role;
  try { role = JSON.parse(Buffer.from(key?.split('.')[1] ?? '', 'base64url').toString()).role; } catch { /* Fail closed below. */ }
  if (role !== 'service_role') throw new Error('Set SDP_SUPABASE_SECRET_KEY, or a backend service_role JWT in the legacy fallback variable');
  return { url: env.SDP_SUPABASE_URL, key };
}

// The only network boundary. Construction does not send a request.
export function createWriter(config, transport = fetch) {
  if (typeof window !== 'undefined') throw new Error('The SDP generator writer must only run on the server');
  const paths = new Set(['sdp_generator_info', 'sdp_get_run', 'sdp_initialize_run', 'sdp_commit_tick'].map(name => `/rest/v1/rpc/${name}`));
  const client = createClient(config.url, config.key, {
    db: { schema: 'public' },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch(input, init) {
        const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
        if (url.origin !== config.url || !paths.has(url.pathname) || url.search || init?.method !== 'POST') throw new Error('Unexpected generator request blocked');
        const headers = new Headers(init.headers);
        // Opaque API keys authenticate through apikey, never as a user JWT.
        if (config.key.startsWith('sb_secret_')) headers.delete('Authorization');
        return transport(input, { ...init, headers, redirect: 'error' });
      }
    }
  });
  async function rpc(name, body = {}) {
    let result;
    try {
      result = await client.rpc(name, body).retry(false).abortSignal(AbortSignal.timeout(30_000));
    } catch {
      // Never log response bodies, request headers, env values or arbitrary transport errors.
      throw new Error(`SDP ${name}: network failure/timeout; safe to retry the identical tick`);
    }
    if (result.status === 0) throw new Error(`SDP ${name}: network failure/timeout; safe to retry the identical tick`);
    if (result.error) {
      const code = /^[A-Z0-9]{5,12}$/.test(result.error.code) ? result.error.code : 'UNKNOWN';
      throw new Error(`SDP ${name}: HTTP ${result.status}, database code ${code}; inspect the dedicated project logs`);
    }
    return result.data;
  }
  return {
    async verify() {
      const info = await rpc('sdp_generator_info');
      if (info?.installation !== 'omnisense-sdp-isolated-v1' || info.model_version !== 'sdp-scripted-v1' || info.legacy_present !== false) throw new Error('Not a clean, dedicated SDP installation');
    },
    getRun: runId => rpc('sdp_get_run', { p_run_id: runId }),
    initialize: run => rpc('sdp_initialize_run', { p_run: run }),
    async commit(tick) {
      parseSdpEvents(tick.events);
      const result = await rpc('sdp_commit_tick', { p_tick: tick });
      if (result?.ok !== true || result.sequence !== tick.frame.sequence) throw new Error('Unexpected commit acknowledgement; do not advance');
      return result;
    }
  };
}

// Advance only after acknowledgement. On an ambiguous failure the caller retains
// the identical tick; SQL either inserts it once or acknowledges an exact retry.
export async function commitTick(writer, tick) {
  await writer.commit(tick);
  return tick.checkpoint;
}
