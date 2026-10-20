import { useCallback, useEffect, useRef, useState } from "react";
import { fetchOverview } from "../api/overview";
import { supabase, supabaseConfigError } from "../lib/supabase";
import type { OverviewData } from "../types/overview";

export function useOverview() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const active = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (active.current) return;
    if (!supabase) { setError(supabaseConfigError); setLoading(false); return; }
    const controller = new AbortController();
    active.current = controller;
    setRefreshing(true);
    try {
      const result = await fetchOverview(supabase, AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]));
      if (controller.signal.aborted) return;
      setData(result); setError(null); setRefreshedAt(new Date().toISOString());
    } catch (caught) {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "The SDP data could not be refreshed.");
    } finally {
      if (active.current === controller) {
        active.current = null;
        if (!controller.signal.aborted) { setLoading(false); setRefreshing(false); setNow(Date.now()); }
      }
    }
  }, []);
  useEffect(() => {
    void refresh();
    const poll = window.setInterval(() => void refresh(), 30_000);
    const tick = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => { window.clearInterval(poll); window.clearInterval(tick); const pending = active.current; active.current = null; pending?.abort(); };
  }, [refresh]);
  return { data, loading, refreshing, error, refreshedAt, now, refresh };
}
