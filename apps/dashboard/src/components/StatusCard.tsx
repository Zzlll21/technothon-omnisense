import type { SensorReading } from "../types/readings";

type StatusCardProps = {
  reading: SensorReading;
};

export function StatusCard({ reading }: StatusCardProps) {
  const isOccupied = (reading.headcount ?? 0) > 0;
  const hvacParts = getHvacStateParts(reading.hvac_state);
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
        <Metric
          label="Temperature"
          value={formatTemperature(reading.temperature)}
          tone={pmvStatus.tone}
        />
        <Metric
          label="Comfort / PMV"
          value={formatPmvDisplay(reading.pmv, pmvStatus.label)}
          tone={pmvStatus.tone}
        />
        <Metric
          label="Headcount"
          value={formatNullable(reading.headcount)}
          helper={isOccupied ? "Occupied" : "Empty"}
        />
        <Metric
          label="Crisis Mode"
          value={reading.crisis_mode ? "Active" : "Normal"}
          tone={reading.crisis_mode ? "critical" : "normal"}
        />
      </dl>

      <div className="detail-row">
        <span>Humidity</span>
        <strong>{formatPercent(reading.humidity)}</strong>
      </div>
      {reading.air_quality !== null ? (
        <div className="detail-row">
          <span>Air Quality</span>
          <strong>{formatNullable(reading.air_quality)}</strong>
        </div>
      ) : null}
      <div className="detail-row detail-row-hvac">
        <span>HVAC</span>
        {hvacParts.length > 0 ? (
          <div className="hvac-chip-row" aria-label="HVAC state">
            {hvacParts.map((part) => (
              <span className="hvac-chip" key={part.label}>
                <strong>{part.label}:</strong>
                <span>{part.value}</span>
              </span>
            ))}
          </div>
        ) : (
          <strong>No data</strong>
        )}
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

  return `${value.toFixed(1)} \u00b0C`;
}

function formatPercent(value: number | null) {
  if (value === null) {
    return "No data";
  }

  return `${value.toFixed(1)}%`;
}

function formatNullable(value: number | null) {
  if (value === null) {
    return "No data";
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatPmvDisplay(value: number | null, label: string) {
  if (value === null) {
    return "No PMV data";
  }

  return `${label} \u00b7 PMV ${value.toFixed(2)}`;
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

function getHvacStateParts(value: SensorReading["hvac_state"]) {
  if (!value) {
    return [];
  }

  return [
    value.mode ? { label: "Mode", value: formatTitleCase(String(value.mode)) } : null,
    value.fan ? { label: "Fan", value: formatTitleCase(String(value.fan)) } : null,
    typeof value.setpoint === "number"
      ? { label: "Setpoint", value: `${value.setpoint} \u00b0C` }
      : null
  ].filter((part): part is { label: string; value: string } => part !== null);
}

function formatTitleCase(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function getPmvStatus(pmv: number | null, crisisMode: boolean) {
  if (pmv === null) {
    return {
      tone: "normal" as StatusTone,
      label: "No PMV data",
      summary: "PMV unknown",
      description: "Awaiting data"
    };
  }

  if (crisisMode || (pmv !== null && pmv > 1)) {
    return {
      tone: "critical" as StatusTone,
      label: "Crisis-like",
      summary: "Above comfort band",
      description: "Review override"
    };
  }

  if (pmv > 0.5) {
    return {
      tone: "warm" as StatusTone,
      label: "Warm",
      summary: "Warm comfort drift",
      description: "Monitor zone"
    };
  }

  if (pmv < -0.5) {
    return {
      tone: "cool" as StatusTone,
      label: "Cool",
      summary: "Below comfort band",
      description: "Cool drift"
    };
  }

  return {
    tone: "normal" as StatusTone,
    label: "Comfortable",
    summary: "Comfortable",
    description: "On target"
  };
}
