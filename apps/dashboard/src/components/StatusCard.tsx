import type { SensorReading } from "../types/readings";

type StatusCardProps = {
  reading: SensorReading;
};

export function StatusCard({ reading }: StatusCardProps) {
  const isOccupied = (reading.headcount ?? 0) > 0;
  const hvacState = formatHvacState(reading.hvac_state);

  return (
    <article className="status-card">
      <div className="card-header">
        <div>
          <p className="node-label">Node</p>
          <h3>{reading.node_id}</h3>
        </div>
        <span className={isOccupied ? "state-pill occupied" : "state-pill empty"}>
          {isOccupied ? "Occupied" : "Empty"}
        </span>
      </div>

      <dl className="metric-grid">
        <Metric label="Temperature" value={formatNumber(reading.temperature, "C")} />
        <Metric label="Humidity" value={formatNumber(reading.humidity, "%")} />
        <Metric label="Headcount" value={formatNullable(reading.headcount)} />
        <Metric label="PMV" value={formatNullable(reading.pmv)} />
        <Metric
          label="Crisis Mode"
          value={reading.crisis_mode ? "Active" : "Normal"}
          tone={reading.crisis_mode ? "critical" : "normal"}
        />
        <Metric label="Air Quality" value={formatNullable(reading.air_quality)} />
      </dl>

      <div className="detail-row">
        <span>HVAC</span>
        <strong>{hvacState}</strong>
      </div>
      <div className="detail-row">
        <span>Last Updated</span>
        <strong>{formatDateTime(reading.recorded_at)}</strong>
      </div>
    </article>
  );
}

type MetricProps = {
  label: string;
  value: string;
  tone?: "normal" | "critical";
};

function Metric({ label, value, tone = "normal" }: MetricProps) {
  return (
    <div className={`metric ${tone === "critical" ? "metric-critical" : ""}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function formatNumber(value: number | null, unit: string) {
  if (value === null) {
    return "No data";
  }

  return `${value.toFixed(1)} ${unit}`;
}

function formatNullable(value: number | null) {
  if (value === null) {
    return "No data";
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function formatHvacState(value: SensorReading["hvac_state"]) {
  if (!value) {
    return "No data";
  }

  const parts = [
    value.mode ? `mode ${value.mode}` : null,
    value.fan ? `fan ${value.fan}` : null,
    typeof value.setpoint === "number" ? `setpoint ${value.setpoint} C` : null
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : JSON.stringify(value);
}

