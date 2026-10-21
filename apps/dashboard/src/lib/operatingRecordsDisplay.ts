import type { AppliedOutput, SdpEvent } from "../../../../packages/sdp-contract/src";
import type { RecordContext, RecordFilters, RecordSnapshot } from "../api/operatingRecords";
import { csvCell, describeRecord, eventTypeLabels, recordOverrideRequestId } from "./sdpRecords";
import { classLabels, classification } from "./nodeHistoryDisplay";
import { decisionExplanation, forecastStatus } from "./predictiveDisplay";
import { modeLabels } from "./overviewDisplay";
import type { Tone } from "./overviewDisplay";

export const RECORD_TIMEZONE = "Asia/Kuala_Lumpur";
export function malaysiaTime(value: string) { return new Intl.DateTimeFormat("en-MY", { timeZone: RECORD_TIMEZONE, year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(value)); }
export function malaysiaIso(value: string) { return new Date(Date.parse(value) + 8 * 3600_000).toISOString().replace("T", " ").replace("Z", "+08:00"); }
export function malaysiaDay(value: number) { return new Date(value + 8 * 3600_000).toISOString().slice(0, 10); }
export function recordRange(kind: "24" | "168" | "custom", now: number, from: string, to: string) {
  if (kind !== "custom") return { start: new Date(now - Number(kind) * 3600_000).toISOString(), end: new Date(now).toISOString() };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new Error("Choose a start and end date.");
  const start = Date.parse(`${from}T00:00:00+08:00`), lastDay = Date.parse(`${to}T00:00:00+08:00`);
  if (!Number.isFinite(start) || !Number.isFinite(lastDay) || lastDay < start || lastDay - start >= 7 * 86400_000 || start >= now || to > malaysiaDay(now) || malaysiaDay(start) !== from || malaysiaDay(lastDay) !== to) throw new Error("Choose up to seven valid Malaysia-local days ending today or earlier.");
  return { start: new Date(start).toISOString(), end: new Date(Math.min(now, lastDay + 86400_000)).toISOString() };
}
export function displayedReport(context: RecordContext): AppliedOutput | null {
  return context.row.event.event_type === "APPLIED_OUTPUT" ? context.row.event : context.row.event.event_type === "ZONE_DECISION" ? context.outputs.at(-1) ?? null : null;
}
export function recordPresentation(context: RecordContext): { title: string; reason: string; tone: Tone; category: string } {
  const e = context.row.event, detail = describeRecord(e);
  let title = detail.title, reason = detail.reason.replace(/^Scripted demo:\s*/i, "");
  if (e.event_type === "ZONE_DECISION") { title = `${modeLabels[e.payload.requested_mode]} requested`; reason = decisionExplanation(e, context.forecast); }
  if (e.event_type === "APPLIED_OUTPUT") { title = e.payload.status === "APPLIED" ? "Simulated output reported applied" : `Output ${e.payload.status.toLowerCase()}`; reason = context.decision ? "Output report matched to the requested command." : "The requested decision could not be matched."; }
  if (e.event_type === "ZONE_FORECAST" && e.payload.status === "ACTIVE") reason = `${e.payload.source === "BOOKING" ? "Booking timetable" : e.payload.source === "HISTORY" ? "Usage history" : "Source unavailable"} · ${e.payload.quality.toLowerCase()} quality`;
  if (e.event_type === "NODE_EVIDENCE") { const label = classification(e); title = label ? `${classLabels[label]} reported` : "Node classification unavailable"; reason = e.payload.node_id; }
  return { title, reason, category: eventTypeLabels[e.event_type], tone: detail.tone === "normal" ? "good" : detail.tone === "alert" ? "danger" : detail.tone === "attention" ? "attention" : detail.tone === "info" ? "info" : "neutral" };
}
export const operatingCsvColumns = [
  "Data source", "Malaysia time (Asia/Kuala_Lumpur UTC+08:00)", "Original UTC timestamp", "Category", "Description", "Zone", "Zone ID",
  "Recorded event status", "Frame occupancy", "Requested mode", "Requested fan", "Requested setpoint (C)",
  "Reported output status", "Reported fan", "Reported setpoint (C)", "Report feedback basis", "Report timestamp UTC",
  "Decision reason code", "Decision reason", "Decision evaluated UTC", "Forecast source", "Forecast quality", "Forecast issued UTC", "Forecast expires UTC", "Forecast validity at decision/event time",
  "Correlation status", "Correlation warnings", "Event ID", "Correlation ID", "Run ID", "Sequence", "Ordinal", "Command ID", "Decision event ID", "Forecast event ID", "Override request ID", "Snapshot sequence", "Snapshot UTC", "Range start UTC", "Range end UTC", "Category filter", "Mode filter", "Search field", "Search text"
] as const;
export function operatingCsvRow(context: RecordContext, snapshot: RecordSnapshot, filters: RecordFilters): string {
  const e = context.row.event, p = recordPresentation(context), report = displayedReport(context), d = context.decision, f = context.forecast;
  const request = e.event_type === "OVERRIDE_REQUEST" && e.payload.action === "SET_OVERRIDE" ? e.payload : null;
  const values = [
    "Simulated SDP operating records", malaysiaIso(e.occurred_at), e.occurred_at, p.category, p.title, snapshot.zoneName, e.zone_id,
    "status" in e.payload ? e.payload.status : "", context.frame?.occupancy ?? "", d?.payload.requested_mode ?? request?.requested_mode ?? "", d?.payload.requested_output?.fan ?? "", d?.payload.requested_output?.setpoint_c ?? request?.requested_setpoint_c ?? "",
    report?.payload.status ?? "", report?.payload.reported_output?.fan ?? "", report?.payload.reported_output?.setpoint_c ?? "", report?.payload.feedback_basis ?? "", report?.occurred_at ?? "",
    d?.payload.reason_code ?? "", d?.payload.reason_text ?? describeRecord(e).reason, d?.payload.evaluated_at ?? "", f?.payload.source ?? "", f?.payload.quality ?? "", f?.occurred_at ?? "", f?.payload.expires_at ?? "", f ? forecastStatus(f, Date.parse(d?.payload.evaluated_at ?? e.occurred_at)) : "",
    context.warnings.length ? "Incomplete / unmatched" : "Frame matched", context.warnings.join(" | "), e.event_id, e.correlation_id, e.session_id, context.row.sequence, context.row.ordinal,
    d?.payload.command_id ?? (e.event_type === "APPLIED_OUTPUT" ? e.payload.command_id : ""), d?.event_id ?? "", f?.event_id ?? "", recordOverrideRequestId(e, d ? [e, d] : [e]), snapshot.sequence, snapshot.at, filters.start, filters.end, filters.category, filters.mode, filters.searchField, filters.search
  ];
  return values.map(csvCell).join(",") + "\r\n";
}
