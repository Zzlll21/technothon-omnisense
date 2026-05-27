import type { SensorReading } from "../types/readings";

type StatusCardProps = {
  reading: SensorReading;
};

export function StatusCard({ reading }: StatusCardProps) {
  const isOccupied = (reading.headcount ?? 0) > 0;
  const hvacState = formatHvacState(reading.hvac_state);
  const pmvStatus = getPmvStatus(reading.pmv, reading.crisis_mode);

  return (
    <article className={`status-card status-card-${pmvStatus.tone}`}>
      <div className="card-header">
        <div>
          <p className="node-label">Node</p>
          <h3>{reading.node_id}</h3>
        </div>
        <div className="status-pill-group">
          <span className={`state-pill ${pmvStatus.tone}`}>{pmvStatus.label}</span>
          <span className={isOccupied ? "state-pill occupied" : "state-pill empty"}>
            {isOccupied ? "Occupied" : "Empty"}
          </span>
        </div>
      </div>

      <div className="room-summary">
        <strong>{pmvStatus.summary}</strong>
        <span>{pmvStatus.description}</span>
      </div>

      <dl className="metric-grid">
        <Metric label="Temperature" value={formatTemperature(reading.temperature)} />
        <Metric label="Humidity" value={formatPercent(reading.humidity)} />
        <Metric label="Headcount" value={formatNullable(reading.headcount)} />
        <Metric
          label="PMV"
          value={formatNullable(reading.pmv)}
          helper={pmvStatus.label}
          tone={pmvStatus.tone}
        />
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
  helper?: string;
  tone?: StatusTone;
};

function Metric({ label, value, helper, tone = "normal" }: MetricProps) {
  return (
    <div className={`metric metric-${tone}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
      {helper ? <span>{helper}</span> : null}
    </div>
  );
}

type StatusTone = "normal" | "warm" | "critical" | "cool";

function formatTemperature(value: number | null) {
  if (value === null) {
    return "No data";
  }

  return `${value.toFixed(1)} °C`;
}

function formatPercent(value: number | null) {
  if (value === null) {
    return "No data";
  }

  return `${value.toFixed(0)}%`;
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

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatHvacState(value: SensorReading["hvac_state"]) {
  if (!value) {
    return "No data";
  }

  const parts = [
    value.mode ? `mode ${value.mode}` : null,
    value.fan ? `fan ${value.fan}` : null,
    typeof value.setpoint === "number" ? `setpoint ${value.setpoint} °C` : null
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : JSON.stringify(value);
}

function getPmvStatus(pmv: number | null, crisisMode: boolean) {
  if (pmv === null) {
    return {
      tone: "normal" as StatusTone,
      label: "No PMV data",
      summary: "Awaiting comfort data",
      description: "PMV has not been reported for this reading."
    };
  }

  if (crisisMode || (pmv !== null && pmv > 1)) {
    return {
      tone: "critical" as StatusTone,
      label: "Hot / Crisis-like",
      summary: "Action needed",
      description: "Thermal comfort is outside the demo target."
    };
  }

  if (pmv > 0.5) {
    return {
      tone: "warm" as StatusTone,
      label: "Warm",
      summary: "Room warming up",
      description: "Comfort is drifting warmer than ideal."
    };
  }

  if (pmv < -0.5) {
    return {
      tone: "cool" as StatusTone,
      label: "Cool",
      summary: "Room feels cool",
      description: "Comfort is cooler than neutral."
    };
  }

  return {
    tone: "normal" as StatusTone,
    label: "Comfortable",
    summary: "Comfortable",
    description: "PMV is near neutral comfort."
  };
}
