import { useEffect, useRef, useState } from "react";
import { fetchPredictiveHistory } from "../api/predictiveHistory";
import type { PredictiveHistory } from "../api/predictiveHistory";
import type { OverviewData } from "../types/overview";
import { emptyHistory, mergeHistory } from "../lib/predictiveDisplay";
import { supabase } from "../lib/supabase";

export function usePredictiveHistory(data: OverviewData, hours: 24 | 168, refreshToken: string | null) {
  const runId = data.run.run_id, zoneId = data.zone.zone_id, nodeId = data.zone.config.payload.representative_environment_node_id;
  const sequence = data.frame.sequence, key = `${runId}/${zoneId}/${nodeId}/${hours}`;
  const cache = useRef<{ key: string; data: PredictiveHistory; sequence: number } | null>(null);
  const [state, setState] = useState({ key: "", data: emptyHistory, start: 0, end: 0, loading: true, error: null as string | null });
  useEffect(() => {
    const controller = new AbortController();
    const end = Date.now(), start = end - hours * 3600_000;
    const previous = cache.current?.key === key ? cache.current : null;
    const retained = previous ? mergeHistory(previous.data, emptyHistory, start) : emptyHistory;
    setState({ key, data: retained, start, end, loading: true, error: null });
    async function load() {
      try {
        if (!supabase) throw new Error("Configure the SDP publishable key to read predictive history.");
        const incoming = await fetchPredictiveHistory(supabase, { runId, zoneId, nodeId, sequence, start: new Date(start).toISOString(), end: new Date(end).toISOString(), afterSequence: previous?.sequence }, AbortSignal.any([controller.signal, AbortSignal.timeout(60_000)]));
        if (controller.signal.aborted) return;
        const result = mergeHistory(retained, incoming, start);
        cache.current = { key, data: result, sequence };
        setState({ key, data: result, start, end, loading: false, error: null });
      } catch (error) {
        if (!controller.signal.aborted) setState({ key, data: retained, start, end, loading: false, error: error instanceof Error ? error.message : "Unable to load predictive history." });
      }
    }
    void load();
    return () => controller.abort();
  }, [key, runId, zoneId, nodeId, hours, sequence, refreshToken]);
  return state.key === key ? state : { ...state, data: emptyHistory, loading: true, error: null };
}
