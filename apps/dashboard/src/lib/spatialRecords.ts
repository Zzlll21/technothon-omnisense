import type { RecordContext, RecordSnapshot } from "../api/operatingRecords";
import type { OverviewData } from "../types/overview";
export type { RecordContext } from "../api/operatingRecords";

export interface SpatialRecordTarget { eventId: string; snapshot: RecordSnapshot; origin: "history" | "records"; context?: RecordContext }
export interface RecordFocus { token: number; eventId: string; snapshot: RecordSnapshot; occurredAt: string }
export function recordSnapshot(data: OverviewData, asOf = Date.parse(data.frame.simulated_at)): RecordSnapshot {
  return { ...(data.run.model_version === "sdp-hybrid-v1" ? { modelVersion: data.run.model_version } : {}), runId: data.run.run_id, zoneId: data.zone.zone_id, zoneName: data.zone.name, sequence: data.frame.sequence, at: new Date(Math.min(asOf, Date.parse(data.frame.simulated_at))).toISOString() };
}
export const quickRecordCategories = [{ value: "ALL", label: "All" }, { value: "ZONE_DECISION", label: "Decisions" }, { value: "ZONE_FORECAST", label: "Forecasts" }, { value: "APPLIED_OUTPUT", label: "Reports" }] as const;
