import type { OverviewData, SdpSample } from "../types/overview";
import type { CoolingMode, OutputSetting, SdpEvent, ZoneForecast } from "../../../../packages/sdp-contract/src";

export type Tone = "good" | "info" | "attention" | "neutral" | "danger";
export const modeLabels: Record<CoolingMode, string> = { OCCUPIED: "Normal cooling", SHORT_VACANCY: "Reduced cooling", LONG_VACANCY: "Standby", PRECOOL: "Pre-cooling" };
export const modeTones: Record<CoolingMode, Tone> = { OCCUPIED: "good", SHORT_VACANCY: "attention", LONG_VACANCY: "neutral", PRECOOL: "info" };
export function number(value: number | null | undefined, places = 1) { return typeof value === "number" && Number.isFinite(value) ? value.toFixed(places) : "\u2014"; }
export function time(value: string | null | undefined, date = false) {
  if (!value || !Number.isFinite(Date.parse(value))) return "\u2014";
  return new Intl.DateTimeFormat(undefined, { ...(date ? { month: "short", day: "numeric" } as const : {}), hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
export function relative(value: string | null, now: number) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Unavailable";
  const seconds = Math.max(0, Math.floor((now - Date.parse(value)) / 1000));
  return seconds < 60 ? `${seconds}s ago` : seconds < 3600 ? `${Math.floor(seconds / 60)}m ago` : seconds < 86400 ? `${Math.floor(seconds / 3600)}h ago` : `${Math.floor(seconds / 86400)}d ago`;
}
export function feedStatus(data: OverviewData | null, now: number): "CURRENT" | "DELAYED" | "CLOCK_SKEW" | "UNAVAILABLE" {
  if (!data) return "UNAVAILABLE";
  const age = now - Date.parse(data.frame.simulated_at);
  if (age < -data.zone.config.payload.freshness.max_clock_skew_ms) return "CLOCK_SKEW";
  return age > 90_000 ? "DELAYED" : "CURRENT";
}
export function nodeStatus(sample: SdpSample | undefined, data: OverviewData, now: number) {
  if (!sample || (Object.hasOwn(sample, "received_at") && sample.received_at === null)) return { label: "Missing", tone: "neutral" as Tone };
  const age = now - Date.parse(sample.received_at ?? sample.observed_at);
  const config = data.zone.config.payload.freshness;
  if (age < -config.max_clock_skew_ms) return { label: "Clock mismatch", tone: "attention" as Tone };
  if (age >= config.disconnected_after_ms) return { label: "Disconnected", tone: "danger" as Tone };
  if (age >= config.stale_after_ms) return { label: "Stale", tone: "attention" as Tone };
  return { label: "Connected", tone: "good" as Tone };
}
export function forecastState(forecast: ZoneForecast, now: number) {
  if (forecast.payload.status !== "ACTIVE") return forecast.payload.status;
  return now >= Date.parse(forecast.payload.expires_at) ? "EXPIRED" : "ACTIVE";
}
export function outputLabel(output: OutputSetting | null) {
  if (!output) return "Not reported";
  return `${output.fan === "OFF" ? "Fan off" : `Fan ${output.fan.toLowerCase()}`}${output.setpoint_c === null ? "" : ` \u00b7 ${number(output.setpoint_c)} \u00b0C`}`;
}
export function activityLabel(event: SdpEvent) {
  switch (event.event_type) {
    case "ZONE_DECISION": return modeLabels[event.payload.requested_mode];
    case "ZONE_FORECAST": return event.payload.status === "ACTIVE" ? "Next-use forecast updated" : `Forecast ${event.payload.status.toLowerCase()}`;
    case "APPLIED_OUTPUT": return event.payload.status === "APPLIED" ? "Cooling output reported" : `Output ${event.payload.status.toLowerCase()}`;
    case "OVERRIDE_REQUEST": return "Override requested";
    case "OVERRIDE_STATUS": return `Override ${event.payload.status.toLowerCase()}`;
    default: return "Zone configuration updated";
  }
}
