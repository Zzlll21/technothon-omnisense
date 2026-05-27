import { supabase } from "../lib/supabase";
import type { QueryState, ReadingHistoryOptions, SensorReading } from "../types/readings";

const READING_COLUMNS = [
  "id",
  "node_id",
  "recorded_at",
  "temperature",
  "humidity",
  "headcount",
  "pmv",
  "crisis_mode",
  "hvac_state",
  "air_quality",
  "raw_payload"
].join(",");

export async function fetchLatestReadingsByNode(
  scanLimit = 500
): Promise<QueryState<SensorReading[]>> {
  const { data, error } = await supabase
    .from("sensor_readings")
    .select(READING_COLUMNS)
    .order("recorded_at", { ascending: false })
    .limit(scanLimit);

  if (error) {
    return errorState([], `Failed to fetch latest readings: ${error.message}`);
  }

  const latestByNode = new Map<string, SensorReading>();
  for (const reading of (data ?? []) as unknown as SensorReading[]) {
    if (!latestByNode.has(reading.node_id)) {
      latestByNode.set(reading.node_id, reading);
    }
  }

  const readings = [...latestByNode.values()].sort((a, b) =>
    a.node_id.localeCompare(b.node_id)
  );

  return successState(readings);
}

export function createReadingsLoadingState(): QueryState<SensorReading[]> {
  return {
    status: "loading",
    data: [],
    error: null,
    isEmpty: true
  };
}

export async function fetchRecentHistoryForNode(
  nodeId: string,
  options: ReadingHistoryOptions = {}
): Promise<QueryState<SensorReading[]>> {
  const limit = options.limit ?? 100;
  const ascending = options.ascending ?? true;

  if (!nodeId.trim()) {
    return errorState([], "nodeId is required.");
  }

  const { data, error } = await supabase
    .from("sensor_readings")
    .select(READING_COLUMNS)
    .eq("node_id", nodeId)
    .order("recorded_at", { ascending: false })
    .limit(limit);

  if (error) {
    return errorState([], `Failed to fetch history for ${nodeId}: ${error.message}`);
  }

  const readings = ((data ?? []) as unknown as SensorReading[]).slice();
  if (ascending) {
    readings.reverse();
  }

  return successState(readings);
}

function successState<T>(data: T[]): QueryState<T[]> {
  return {
    status: "success",
    data,
    error: null,
    isEmpty: data.length === 0
  };
}

function errorState<T>(data: T, error: string): QueryState<T> {
  return {
    status: "error",
    data,
    error,
    isEmpty: Array.isArray(data) ? data.length === 0 : false
  };
}
