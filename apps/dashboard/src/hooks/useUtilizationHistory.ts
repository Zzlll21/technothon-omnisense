import { useEffect, useRef, useState } from "react";
import { fetchUtilizationHistory } from "../api/utilizationHistory";
import type { UtilizationHistory } from "../api/utilizationHistory";
import type { OverviewData } from "../types/overview";
import { mergeUtilizationHistory } from "../lib/utilizationAnalytics";
import { supabase } from "../lib/supabase";

const EMPTY: UtilizationHistory = { frames: [], events: [] };
export function useUtilizationHistory(data: OverviewData, hours: 24 | 168, refreshToken: string | null) {
  const runId = data.run.run_id, zoneId = data.zone.zone_id, sequence = data.frame.sequence;
  const key = `${runId}/${zoneId}/${hours}`;
  const cache = useRef<{ key: string; data: UtilizationHistory; sequence: number } | null>(null);
  const [state, setState] = useState({ key: "", data: EMPTY, start: 0, end: 0, loading: true, error: null as string | null });
  useEffect(() => {
    const controller = new AbortController(), end = Date.now(), start = end - hours * 3600_000;
    const previous = cache.current?.key === key ? cache.current : null;
    const retained = previous ? mergeUtilizationHistory(previous.data, EMPTY, start) : EMPTY;
    setState({ key, data: retained, start, end, loading: true, error: null });
    async function load() {
      try {
        if (!supabase) throw new Error("Configure the SDP publishable key to read utilization.");
        const incoming = await fetchUtilizationHistory(supabase, { runId, zoneId, sequence, modelVersion: data.run.model_version, start: new Date(start).toISOString(), end: new Date(end).toISOString(), afterSequence: previous?.sequence }, AbortSignal.any([controller.signal, AbortSignal.timeout(60_000)]));
        if (controller.signal.aborted) return;
        const result = mergeUtilizationHistory(retained, incoming, start);
        cache.current = { key, data: result, sequence };
        setState({ key, data: result, start, end, loading: false, error: null });
      } catch (error) {
        if (!controller.signal.aborted) setState({ key, data: retained, start, end, loading: false, error: error instanceof Error ? error.message : "Unable to read utilization history." });
      }
    }
    void load(); return () => controller.abort();
  }, [key, runId, zoneId, hours, sequence, refreshToken]);
  return state.key === key ? state : { ...state, data: EMPTY, loading: true, error: null };
}
