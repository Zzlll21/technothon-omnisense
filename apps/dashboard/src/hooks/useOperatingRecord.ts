import { useEffect, useRef, useState } from "react";
import { fetchOperatingRecord } from "../api/operatingRecords";
import type { RecordContext } from "../api/operatingRecords";
import type { SpatialRecordTarget } from "../lib/spatialRecords";
import { supabase } from "../lib/supabase";

export function useOperatingRecord(target: SpatialRecordTarget, retry: number) {
  const key = JSON.stringify([target.snapshot, target.eventId]);
  const cache = useRef<{ key: string; context: RecordContext | null } | null>(null);
  const [state, setState] = useState({ key: "", context: null as RecordContext | null, loading: true, error: null as string | null });
  useEffect(() => {
    const controller = new AbortController(), previous = cache.current?.key === key ? cache.current.context : null;
    if (target.context?.row.event_id === target.eventId) { setState({ key, context: target.context, loading: false, error: null }); return () => controller.abort(); }
    setState({ key, context: previous, loading: true, error: null });
    void (async () => {
      try {
        if (!supabase) throw new Error("Configure the SDP publishable key to inspect records.");
        const context = await fetchOperatingRecord(supabase, target.snapshot, target.eventId, AbortSignal.any([controller.signal, AbortSignal.timeout(60_000)]));
        if (controller.signal.aborted) return;
        cache.current = { key, context }; setState({ key, context, loading: false, error: null });
      } catch (error) {
        if (!controller.signal.aborted) setState({ key, context: previous, loading: false, error: error instanceof Error ? error.message : "Unable to inspect this stored record." });
      }
    })();
    return () => controller.abort();
  }, [key, retry]);
  return state.key === key ? state : { ...state, context: null, loading: true, error: null };
}
