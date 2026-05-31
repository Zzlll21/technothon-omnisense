import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
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
  const [hoveredZoneLabel, setHoveredZoneLabel] = useState<string | null>(null);
  const [selectedZoneLabel, setSelectedZoneLabel] = useState<string | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);
  const hoveredZone = zones.find((zone) => zone.label === hoveredZoneLabel) ?? null;
  const selectedZone = zones.find((zone) => zone.label === selectedZoneLabel) ?? null;
  const activeZone = hoveredZone ?? selectedZone ?? zones.find((zone) => zone.reading) ?? zones[2];

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (
        selectedZoneLabel &&
        sectionRef.current &&
        !sectionRef.current.contains(event.target as Node)
      ) {
        setSelectedZoneLabel(null);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [selectedZoneLabel]);

  return (
    <section
      className="heatmap-section"
      aria-labelledby="room-heatmap-title"
      ref={sectionRef}
    >
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

      <div
        className="heatmap-floorplan"
        aria-label="Room temperature zones"
        onMouseLeave={() => setHoveredZoneLabel(null)}
      >
        {zones.map((zone) => (
          <HeatmapTile
            isActive={activeZone?.label === zone.label}
            isPinned={selectedZoneLabel === zone.label}
            key={zone.label}
            onHover={() => setHoveredZoneLabel(zone.label)}
            onSelect={() => setSelectedZoneLabel(zone.label)}
            zone={zone}
          />
        ))}
      </div>

      {activeZone ? (
        <ZoneDetailPanel isPinned={selectedZoneLabel === activeZone.label} zone={activeZone} />
      ) : null}
    </section>
  );
}

function HeatmapTile({
  isActive,
  isPinned,
  onHover,
  onSelect,
  zone
}: {
  isActive: boolean;
  isPinned: boolean;
  onHover: () => void;
  onSelect: () => void;
  zone: HeatmapZone;
}) {
  const status = getHeatmapStatus(zone.reading);
  const tileClassName = [
    "heatmap-tile",
    `heatmap-zone-${zone.area}`,
    `heatmap-tile-${status.tone}`,
    isActive ? "heatmap-tile-active" : null,
    isPinned ? "heatmap-tile-pinned" : null
  ]
    .filter(Boolean)
    .join(" ");

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect();
    }
  };

  if (!zone.reading) {
    return (
      <article
        aria-pressed={isPinned}
        className={tileClassName}
        onClick={onSelect}
        onFocus={onHover}
        onKeyDown={handleKeyDown}
        onMouseEnter={onHover}
        role="button"
        tabIndex={0}
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
      aria-pressed={isPinned}
      className={tileClassName}
      onClick={onSelect}
      onFocus={onHover}
      onKeyDown={handleKeyDown}
      onMouseEnter={onHover}
      role="button"
      tabIndex={0}
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

function ZoneDetailPanel({ isPinned, zone }: { isPinned: boolean; zone: HeatmapZone }) {
  const status = getHeatmapStatus(zone.reading);

  if (!zone.reading) {
    return (
      <aside className="heatmap-detail-panel heatmap-detail-panel-unknown">
        <div className="heatmap-detail-header">
          <div>
            <p className="node-label">{isPinned ? "Selected Zone" : "Inspect Zone"}</p>
            <h3>{zone.label}</h3>
          </div>
          <span className="heatmap-status heatmap-status-unknown">Unknown</span>
        </div>
        <p className="heatmap-detail-empty">No sensor data</p>
        <p className="heatmap-waiting">Waiting for {zone.nodeId}</p>
      </aside>
    );
  }

  return (
    <aside className={`heatmap-detail-panel heatmap-detail-panel-${status.tone}`}>
      <div className="heatmap-detail-header">
        <div>
          <p className="node-label">{isPinned ? "Selected Zone" : "Inspect Zone"}</p>
          <h3>{zone.label}</h3>
        </div>
        <span className={`heatmap-status heatmap-status-${status.tone}`}>
          {status.label}
        </span>
      </div>

      <dl className="heatmap-detail-grid">
        <DetailItem label="Node" value={zone.reading.node_id} />
        <DetailItem label="Temperature" value={formatTemperature(zone.reading.temperature)} />
        {zone.reading.humidity !== null ? (
          <DetailItem label="Humidity" value={formatHumidity(zone.reading.humidity)} />
        ) : null}
        <DetailItem label="Headcount" value={formatHeadcount(zone.reading.headcount)} />
        <DetailItem
          label="PMV / Comfort"
          value={`${formatPmv(zone.reading.pmv)} \u00b7 ${status.label}`}
        />
        <DetailItem label="Crisis Mode" value={formatCrisisMode(zone.reading)} />
        <DetailItem label="Last Updated" value={formatDateTime(zone.reading.recorded_at)} />
      </dl>
    </aside>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="heatmap-detail-item">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
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
      summary: "No data"
    };
  }

  if (reading.crisis_mode || (reading.pmv !== null && reading.pmv > 1)) {
    return {
      tone: "crisis",
      label: "Crisis",
      summary: "Alert zone"
    };
  }

  if (reading.temperature === null) {
    return {
      tone: "unknown",
      label: "Unknown",
      summary: "No temperature"
    };
  }

  if (reading.temperature < 24) {
    return {
      tone: "cool",
      label: "Cool",
      summary: "Below band"
    };
  }

  if (reading.temperature < 27) {
    return {
      tone: "comfortable",
      label: "Comfortable",
      summary: "On target"
    };
  }

  if (reading.temperature < 29) {
    return {
      tone: "warm",
      label: "Warm",
      summary: "Above band"
    };
  }

  return {
    tone: "hot",
    label: "Hot",
    summary: "Alert"
  };
}

function formatTemperature(value: number | null) {
  if (value === null) {
    return "--";
  }

  return `${value.toFixed(1)} \u00b0C`;
}

function formatHumidity(value: number | null) {
  if (value === null) {
    return "No data";
  }

  return `${value.toFixed(0)}%`;
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
