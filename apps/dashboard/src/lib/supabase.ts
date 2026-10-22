import { createClient } from "@supabase/supabase-js";
import { createPrivateSessionGuard } from './privateAuth';

const configuration = __SDP_PUBLIC_CONFIG__;
export const hybridAccess = configuration;
export const privateSession = createPrivateSessionGuard();
export const supabaseConfigError = configuration.error;
export const supabase = configuration.error ? null : createClient(configuration.url, configuration.key, {
  auth: { persistSession: false, autoRefreshToken: configuration.privateHybrid === true, detectSessionInUrl: false },
  ...(configuration.privateHybrid ? { global: { fetch(input: RequestInfo | URL, init?: RequestInit) {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (url.origin !== configuration.url || (url.pathname.startsWith('/rest/v1/') && !privateSession.permits(init?.headers))) return Promise.reject(new Error('Private hybrid authentication required'));
    return fetch(input, { ...init, redirect:'error' });
  } } } : {})
});
