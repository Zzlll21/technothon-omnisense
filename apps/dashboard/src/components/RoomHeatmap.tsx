import type { QueryState, SensorReading } from "../types/readings";

type RoomHeatmapProps = {
  readingsState: QueryState<SensorReading[]>;
};

type HeatmapZone = {
  label: string;
  nodeId: string;
  area: string;
  reading: SensorReading | null;
};

type HeatmapStatus = {
  tone: "unknown" | "cool" | "comfortable" | "warm" | "hot" | "crisis";
  label: string;
  summary: string;
};

const ROOM_ZONES = [
  { label: "Front Left", nodeId: "nodeA", area: "front-left" },
  { label: "Front Right", nodeId: "nodeB", area: "front-right" },
  { label: "Center", nodeId: "demo-1", area: "center" },
  { label: "Back Left", nodeId: "nodeC", area: "back-left" },
  { label: "Back Right", nodeId: "nodeD", area: "back-right" }
] as const;

export function RoomHeatmap({ readingsState }: RoomHeatmapProps) {
  const zones = getHeatmapZones(readingsState);

  return (
    <section className="heatmap-section" aria-labelledby="room-heatmap-title">
      <div className="section-toolbar">
        <div>
          <p className="eyebrow">Room Heatmap</p>
          <h2 id="room-heatmap-title">Room Comfort Map</h2>
          <p className="muted">
            Latest node temperatures mapped into simple demo room zones.
          </p>
        </div>
      </div>

      {readingsState.status === "loading" ? (
        <div className="message-panel">Preparing heatmap from latest readings...</div>
      ) : null}

      {readingsState.status === "error" ? (
        <div className="message-panel error-panel" role="alert">
          {readingsState.error}
        </div>
      ) : null}

      {readingsState.status === "success" && readingsState.isEmpty ? (
        <div className="message-panel">
          No latest readings yet. The demo zone below will update when demo-1
          telemetry arrives.
        </div>
      ) : null}

      <div className="heatmap-floorplan" aria-label="Room temperature zones">
        {zones.map((zone) => (
          <HeatmapTile key={zone.label} zone={zone} />
        ))}
      </div>
    </section>
  );
}

function HeatmapTile({ zone }: { zone: HeatmapZone }) {
  const status = getHeatmapStatus(zone.reading);

  if (!zone.reading) {
    return (
      <article
        className={`heatmap-tile heatmap-zone-${zone.area} heatmap-tile-unknown`}
      >
        <div className="heatmap-tile-header">
          <div>
            <p className="node-label">Zone</p>
            <h3>{zone.label}</h3>
          </div>
          <span className="heatmap-status heatmap-status-unknown">Unknown</span>
        </div>
        <p className="heatmap-empty">No sensor data</p>
        <p className="heatmap-waiting">Waiting for {zone.nodeId}</p>
      </article>
    );
  }

  return (
    <article
      className={`heatmap-tile heatmap-zone-${zone.area} heatmap-tile-${status.tone}`}
    >
      <div className="heatmap-tile-header">
        <div>
          <p className="node-label">Zone</p>
          <h3>{zone.label}</h3>
        </div>
        <span className={`heatmap-status heatmap-status-${status.tone}`}>
          {status.label}
        </span>
      </div>

      <div className="heatmap-temperature">
        {formatTemperature(zone.reading?.temperature ?? null)}
      </div>
      <p className="heatmap-summary">{status.summary}</p>

      <p className="heatmap-node">Node {zone.reading.node_id}</p>
      <dl className="heatmap-chip-row">
        <Chip label="Headcount" value={formatHeadcount(zone.reading.headcount)} />
        <Chip label="PMV" value={formatPmv(zone.reading.pmv)} />
        <Chip label="Crisis" value={formatCrisisMode(zone.reading)} />
      </dl>
    </article>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div className="heatmap-chip">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function getHeatmapZones(readingsState: QueryState<SensorReading[]>): HeatmapZone[] {
  const readingsByNode = new Map<string, SensorReading>();

  if (readingsState.status === "success") {
    readingsState.data.forEach((reading) => {
      readingsByNode.set(reading.node_id, reading);
    });
  }

  return ROOM_ZONES.map((zone) => ({
    ...zone,
    reading: readingsByNode.get(zone.nodeId) ?? null
  }));
}

function getHeatmapStatus(reading: SensorReading | null): HeatmapStatus {
  if (!reading) {
    return {
      tone: "unknown",
      label: "Unknown",
      summary: "Waiting for the first latest reading."
    };
  }

  if (reading.crisis_mode || (reading.pmv !== null && reading.pmv > 1)) {
    return {
      tone: "crisis",
      label: "Crisis-like",
      summary: "Energy-saving or hot comfort state is visually flagged."
    };
  }

  if (reading.temperature === null) {
    return {
      tone: "unknown",
      label: "Unknown",
      summary: "Temperature has not been reported for this node."
    };
  }

  if (reading.temperature < 24) {
    return {
      tone: "cool",
      label: "Cool",
      summary: "Below the demo comfort band."
    };
  }

  if (reading.temperature < 27) {
    return {
      tone: "comfortable",
      label: "Comfortable",
      summary: "Within the demo comfort band."
    };
  }

  if (reading.temperature < 29) {
    return {
      tone: "warm",
      label: "Warm",
      summary: "Room is warming above the comfort band."
    };
  }

  return {
    tone: "hot",
    label: "Hot",
    summary: "Temperature is high for the demo room."
  };
}

function formatTemperature(value: number | null) {
  if (value === null) {
    return "--";
  }

  return `${value.toFixed(1)} \u00b0C`;
}

function formatHeadcount(value: number | null) {
  if (value === null) {
    return "No data";
  }

  return `${value} ${value === 1 ? "person" : "people"}`;
}

function formatPmv(value: number | null) {
  if (value === null) {
    return "No data";
  }

  return value.toFixed(2);
}

function formatCrisisMode(reading: SensorReading | null) {
  if (!reading) {
    return "No data";
  }

  return reading.crisis_mode ? "Active" : "Normal";
}
