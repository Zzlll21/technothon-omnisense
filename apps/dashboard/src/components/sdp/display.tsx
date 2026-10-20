import type { ReactNode } from "react";
import type {
  CoolingMode, DataSource, Observation, OutputSetting
} from "../../../../../packages/sdp-contract/src/index";

export type BadgeTone = "normal" | "attention" | "alert" | "info" | "neutral";

export const modeLabels: Record<CoolingMode, string> = {
  OCCUPIED: "Occupied",
  SHORT_VACANCY: "Short vacancy",
  LONG_VACANCY: "Long vacancy",
  PRECOOL: "Pre-cooling"
};

export const sourceLabels: Record<DataSource, string> = {
  MEASURED: "Measured",
  PROXY_TEST: "Proxy test",
  SIMULATED: "Simulated",
  UNAVAILABLE: "Unavailable"
};

export function SdpBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: BadgeTone }) {
  return <span className={`sdp-badge sdp-badge-${tone}`}>{children}</span>;
}

export function formatSdpTime(value: string | null | undefined): string {
  if (!value) return "Not available";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Invalid timestamp";
  return `${new Intl.DateTimeFormat("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "UTC"
  }).format(date)} UTC`;
}

export function formatOutput(output: OutputSetting | null): string {
  if (!output) return "Not specified";
  const fan = output.fan.charAt(0) + output.fan.slice(1).toLowerCase();
  return `Fan: ${fan}${output.setpoint_c === null ? "" : ` \u00b7 Setpoint: ${output.setpoint_c.toFixed(1)} \u00b0C`}`;
}

export function ObservationValue({ observation, unit }: {
  observation: Observation<number> | undefined;
  unit: string;
}) {
  return (
    <span>
      {observation?.validity === "VALID" ? `${observation.value.toFixed(1)}${unit}` : "Unavailable"}
      <small className="sdp-source">
        {observation ? sourceLabels[observation.source] : "No evidence"}
        {observation?.validity === "INVALID" ? " / Invalid" : ""}
      </small>
    </span>
  );
}
