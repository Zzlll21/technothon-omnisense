import { useEffect, useRef, useState } from "react";
import { fetchOperatingPage } from "../api/operatingRecords";
import type { RecordFilters, RecordPage, RecordSnapshot } from "../api/operatingRecords";
import { supabase } from "../lib/supabase";

export const RECORD_PAGE_SIZE = 25;
export function useOperatingRecords(snapshot: RecordSnapshot, filters: RecordFilters, page: number, retry: number) {
  const key = JSON.stringify([snapshot, filters, page]);
  const cache = useRef<{ key: string; result: RecordPage } | null>(null);
  const [state, setState] = useState({ key: "", result: null as RecordPage | null, loading: true, error: null as string | null });
  useEffect(() => {
    const controller = new AbortController(), previous = cache.current?.key === key ? cache.current.result : null;
    setState({ key, result: previous, loading: true, error: null });
    async function load() {
      try {
        if (!supabase) throw new Error("Configure the SDP publishable key to read operating records.");
        const result = await fetchOperatingPage(supabase, snapshot, filters, page, RECORD_PAGE_SIZE, AbortSignal.any([controller.signal, AbortSignal.timeout(60_000)]));
        if (controller.signal.aborted) return;
        cache.current = { key, result }; setState({ key, result, loading: false, error: null });
      } catch (error) {
        if (!controller.signal.aborted) setState({ key, result: previous, loading: false, error: error instanceof Error ? error.message : "Unable to read operating records." });
      }
    }
    void load(); return () => controller.abort();
  // The key contains every query field; retry deliberately reloads the same snapshot.
  }, [key, retry]);
  return state.key === key ? state : { ...state, result: null, loading: true, error: null };
}
