import { useEffect, useRef, useState } from "react";
import { fetchNodeHistory } from "../api/nodeHistory";
import type { HistoryRange, NodeHistoryPoint } from "../api/nodeHistory";
import type { OverviewData } from "../types/overview";
import { supabase } from "../lib/supabase";

interface HistoryState { key: string; points: NodeHistoryPoint[]; start: number; end: number; loading: boolean; error: string | null }
export function useNodeHistory(data: OverviewData, nodeId: string, hours: HistoryRange, refreshToken: string | null) {
  const key = `${data.run.run_id}/${data.zone.zone_id}/${nodeId}/${hours}`;
  const [state, setState] = useState<HistoryState>({ key: "", points: [], start: 0, end: 0, loading: true, error: null });
  const cache = useRef<{ key: string; points: NodeHistoryPoint[]; sequence: number } | null>(null);
  const runId = data.run.run_id, zoneId = data.zone.zone_id, sequence = data.frame.sequence;
  useEffect(() => {
    const controller = new AbortController();
    const end = Date.now(), start = end - hours * 3600_000;
    const previous = cache.current?.key === key ? cache.current : null;
    const retained = previous?.points.filter(p => Date.parse(p.observed_at) >= start) ?? [];
    setState({ key, points: retained, start, end, loading: true, error: null });
    async function load() {
      try {
        if (!supabase) throw new Error("Configure the SDP publishable key to read node history.");
        const incoming = await fetchNodeHistory(supabase, { runId, zoneId, nodeId, sequence, start: new Date(start).toISOString(), end: new Date(end).toISOString(), afterSequence: previous?.sequence }, AbortSignal.any([controller.signal, AbortSignal.timeout(60_000)]));
        if (controller.signal.aborted) return;
        const points = [...retained, ...incoming];
        cache.current = { key, points, sequence };
        setState({ key, points, start, end, loading: false, error: null });
      } catch (error) {
        if (!controller.signal.aborted) setState({ key, points: retained, start, end, loading: false, error: error instanceof Error ? error.message : "History could not be loaded." });
      }
    }
    void load();
    return () => controller.abort();
  }, [key, runId, zoneId, nodeId, hours, sequence, refreshToken]);
  // Never show the previous node's charts for a render while its replacement loads.
  return state.key === key ? state : { ...state, points: [], loading: true, error: null };
}
