import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchOperatingPage } from "./operatingRecords";
import type { RecordFilters, RecordSnapshot } from "./operatingRecords";
import { operatingCsvHeader, operatingCsvRow } from "../lib/operatingRecordsDisplay";
import { csvCell } from "../lib/sdpRecords";

export const MAX_EXPORT_ROWS = 50_000;
export const MAX_EXPORT_BYTES = 25 * 1024 * 1024;
export async function buildOperatingCsv(client: Pick<SupabaseClient, "from">, snapshot: RecordSnapshot, filters: RecordFilters, signal: AbortSignal, onProgress: (done: number, total: number) => void): Promise<{ parts: string[]; count: number }> {
  const parts = ["\uFEFF" + operatingCsvHeader(snapshot).map(csvCell).join(",") + "\r\n"];
  const encoder = new TextEncoder();
  let bytes = encoder.encode(parts[0]).byteLength, done = 0, total: number | null = null;
  for (let page = 1; ; page++) {
    signal.throwIfAborted();
    const result = await fetchOperatingPage(client, snapshot, filters, page, 500, signal);
    if (result.total > MAX_EXPORT_ROWS) throw new Error("This export exceeds 50,000 records. Narrow the date range or filters.");
    if (total !== null && result.total !== total) throw new Error("The published dataset changed during export. Refresh the records and retry.");
    total = result.total;
    if (result.rows.length !== Math.min(500, total - done)) throw new Error("The export is incomplete. Refresh the records and retry.");
    const chunk = result.rows.map(row => operatingCsvRow(row, snapshot, filters)).join("");
    bytes += encoder.encode(chunk).byteLength;
    if (bytes > MAX_EXPORT_BYTES) throw new Error("This CSV exceeds 25 MiB. Narrow the date range or filters.");
    parts.push(chunk); done += result.rows.length; onProgress(done, total);
    if (done === total) return { parts, count: done };
  }
}
