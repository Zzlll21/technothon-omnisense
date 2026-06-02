import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";
import type { QueryState, SensorReading } from "../types/readings";

type RoomHeatmapProps = {
  readingsState: QueryState<SensorReading[]>;
};

type HeatmapZone = {
  label: string;
  nodeId: string;
  area: string;
  marker?: {
    x: number;
    y: number;
  };
  reading: SensorReading | null;
  connectionStatus: ConnectionStatus;
  lastSeen: string | null;
};

type HeatmapStatus = {
  tone: "unknown" | "stale" | "cool" | "comfortable" | "warm" | "hot" | "crisis";
  label: string;
  summary: string;
};

type ConnectionStatus = "connected" | "stale" | "disconnected";

type FloorplanImage = {
  name: string;
  url: string;
};

const ROOM_ZONES = [
  { label: "Left", nodeId: "nodeA", area: "left" },
  { label: "Center", nodeId: "demo-1", area: "center" },
  { label: "Right", nodeId: "demo-2", area: "right" }
] as const;

export function RoomHeatmap({ readingsState }: RoomHeatmapProps) {
  const zones = getHeatmapZones(readingsState);
  const floorplanZones = getFloorplanZones(readingsState);
  const [floorplanImage, setFloorplanImage] = useState<FloorplanImage | null>(null);
  const [hoveredZoneLabel, setHoveredZoneLabel] = useState<string | null>(null);
  const [selectedZoneLabel, setSelectedZoneLabel] = useState<string | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);
  const floorplanUrlRef = useRef<string | null>(null);
  const activeZones = floorplanImage ? floorplanZones : zones;
  const hoveredZone = activeZones.find((zone) => zone.label === hoveredZoneLabel) ?? null;
  const selectedZone = activeZones.find((zone) => zone.label === selectedZoneLabel) ?? null;
  const activeZone =
    hoveredZone ??
    selectedZone ??
    activeZones.find((zone) => zone.connectionStatus === "connected") ??
    activeZones[2];

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

  useEffect(() => {
    return () => {
      if (floorplanUrlRef.current) {
        URL.revokeObjectURL(floorplanUrlRef.current);
      }
    };
  }, []);

  const handleFloorplanUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (floorplanUrlRef.current) {
      URL.revokeObjectURL(floorplanUrlRef.current);
    }

    const url = URL.createObjectURL(file);
    floorplanUrlRef.current = url;
    setFloorplanImage({ name: file.name, url });
    setHoveredZoneLabel(null);
    setSelectedZoneLabel(null);
    event.target.value = "";
  };

  const clearFloorplan = () => {
    if (floorplanUrlRef.current) {
      URL.revokeObjectURL(floorplanUrlRef.current);
      floorplanUrlRef.current = null;
    }

    setFloorplanImage(null);
    setHoveredZoneLabel(null);
    setSelectedZoneLabel(null);
  };

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
            Upload a local floorplan or use the demo zone map.
          </p>
        </div>

        <div className="floorplan-actions">
          <label className="floorplan-upload">
            <span>{floorplanImage ? "Replace floorplan" : "Upload floorplan"}</span>
            <input
              accept="image/png,image/jpeg,image/jpg,image/svg+xml"
              onChange={handleFloorplanUpload}
              type="file"
            />
          </label>
          {floorplanImage ? (
            <button className="floorplan-clear" onClick={clearFloorplan} type="button">
              Use zone map
            </button>
          ) : null}
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

      {floorplanImage ? (
        <div
          className="floorplan-preview"
          aria-label={`Uploaded floorplan ${floorplanImage.name}`}
          onMouseLeave={() => setHoveredZoneLabel(null)}
        >
          <img alt={`Uploaded floorplan ${floorplanImage.name}`} src={floorplanImage.url} />
          {floorplanZones.map((zone) => (
            <FloorplanMarker
              isActive={activeZone?.label === zone.label}
              isPinned={selectedZoneLabel === zone.label}
              key={zone.label}
              onHover={() => setHoveredZoneLabel(zone.label)}
              onSelect={() => setSelectedZoneLabel(zone.label)}
              zone={zone}
            />
          ))}
        </div>
      ) : (
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
      )}

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
  const status = getHeatmapStatus(zone);
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

  if (zone.connectionStatus !== "connected") {
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
        <p className="heatmap-empty">{status.summary}</p>
        <p className="heatmap-waiting">
          {zone.lastSeen ? `Last seen ${zone.lastSeen}` : `Waiting for ${zone.nodeId}`}
        </p>
      </article>
    );
  }

  const reading = zone.reading;
  if (!reading) {
    return null;
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
        {formatTemperature(reading.temperature)}
      </div>
      <p className="heatmap-summary">{status.summary}</p>

      <p className="heatmap-node">Node {reading.node_id}</p>
      <dl className="heatmap-chip-row">
        <Chip label="Headcount" value={formatHeadcount(reading.headcount)} />
        <Chip label="PMV" value={formatPmv(reading.pmv)} />
        <Chip label="Crisis" value={formatCrisisMode(reading)} />
      </dl>
    </article>
  );
}

function FloorplanMarker({
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
  const status = getHeatmapStatus(zone);
  const markerSummary =
    zone.connectionStatus === "connected"
      ? `${formatTemperature(zone.reading?.temperature ?? null)} \u00b7 ${status.label} \u00b7 ${formatCompactHeadcount(zone.reading?.headcount ?? null)}`
      : zone.lastSeen ?? "No recent telemetry";
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect();
    }
  };

  return (
    <button
      aria-label={`${zone.label} ${status.label}`}
      aria-pressed={isPinned}
      className={[
        "floorplan-marker",
        `floorplan-marker-${status.tone}`,
        isActive ? "floorplan-marker-active" : null,
        isPinned ? "floorplan-marker-pinned" : null
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onSelect}
      onFocus={onHover}
      onKeyDown={handleKeyDown}
      onMouseEnter={onHover}
      style={{
        left: `${zone.marker?.x ?? 50}%`,
        top: `${zone.marker?.y ?? 50}%`
      }}
      type="button"
    >
      <span>{zone.nodeId}</span>
      <strong>{formatConnectionStatus(zone.connectionStatus)}</strong>
      <small>{markerSummary}</small>
    </button>
  );
}

function ZoneDetailPanel({ isPinned, zone }: { isPinned: boolean; zone: HeatmapZone }) {
  const status = getHeatmapStatus(zone);

  if (zone.connectionStatus !== "connected") {
    const lastKnownTemperature = zone.reading?.temperature;

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
          <DetailItem label="Expected Node" value={zone.nodeId} />
          <DetailItem label="Connection" value={status.label} />
          <DetailItem
            label="Last Seen"
            value={zone.lastSeen ?? "No recent telemetry"}
          />
          {lastKnownTemperature !== null && lastKnownTemperature !== undefined ? (
            <DetailItem label="Last Temperature" value={formatTemperature(lastKnownTemperature)} />
          ) : null}
        </dl>
      </aside>
    );
  }

  const reading = zone.reading;
  if (!reading) {
    return null;
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
        <DetailItem label="Node" value={reading.node_id} />
        <DetailItem label="Connection" value="Connected" />
        <DetailItem label="Temperature" value={formatTemperature(reading.temperature)} />
        {reading.humidity !== null ? (
          <DetailItem label="Humidity" value={formatHumidity(reading.humidity)} />
        ) : null}
        <DetailItem label="Headcount" value={formatHeadcount(reading.headcount)} />
        <DetailItem
          label="PMV / Comfort"
          value={`${formatPmv(reading.pmv)} \u00b7 ${status.label}`}
        />
        <DetailItem label="Crisis Mode" value={formatCrisisMode(reading)} />
        <DetailItem label="Last Updated" value={formatDateTime(reading.recorded_at)} />
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

  return ROOM_ZONES.map((zone) => createHeatmapZone(zone, readingsByNode));
}

function getFloorplanZones(readingsState: QueryState<SensorReading[]>): HeatmapZone[] {
  const readingsByNode = new Map<string, SensorReading>();

  if (readingsState.status === "success") {
    readingsState.data.forEach((reading) => {
      readingsByNode.set(reading.node_id, reading);
    });
  }

  return [
    { label: "Left zone", nodeId: "nodeA", area: "left", marker: { x: 20, y: 50 } },
    { label: "Center zone", nodeId: "demo-1", area: "center", marker: { x: 50, y: 50 } },
    { label: "Right zone", nodeId: "demo-2", area: "right", marker: { x: 80, y: 50 } }
  ].map((zone) => createHeatmapZone(zone, readingsByNode));
}

function createHeatmapZone(
  zone: {
    label: string;
    nodeId: string;
    area: string;
    marker?: {
      x: number;
      y: number;
    };
  },
  readingsByNode: Map<string, SensorReading>
): HeatmapZone {
  const reading = readingsByNode.get(zone.nodeId) ?? null;
  const connectionStatus = getConnectionStatus(reading);

  return {
    ...zone,
    connectionStatus,
    lastSeen: reading ? formatDateTime(reading.recorded_at) : null,
    reading
  };
}

function getConnectionStatus(reading: SensorReading | null): ConnectionStatus {
  if (!reading) {
    return "disconnected";
  }

  const recordedTime = new Date(reading.recorded_at).getTime();
  if (Number.isNaN(recordedTime)) {
    return "disconnected";
  }

  const ageMs = Date.now() - recordedTime;
  if (ageMs <= 2 * 60 * 1000) {
    return "connected";
  }

  if (ageMs <= 5 * 60 * 1000) {
    return "stale";
  }

  return "disconnected";
}

function getHeatmapStatus(zone: HeatmapZone): HeatmapStatus {
  if (zone.connectionStatus === "disconnected") {
    return {
      tone: "unknown",
      label: "Disconnected",
      summary: "No recent telemetry"
    };
  }

  if (zone.connectionStatus === "stale") {
    return {
      tone: "stale",
      label: "Stale",
      summary: zone.lastSeen ? `Last seen ${zone.lastSeen}` : "Telemetry delayed"
    };
  }

  const reading = zone.reading;
  if (!reading) {
    return {
      tone: "unknown",
      label: "Disconnected",
      summary: "No recent telemetry"
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

function formatCompactHeadcount(value: number | null) {
  if (value === null) {
    return "-- people";
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

function formatConnectionStatus(status: ConnectionStatus) {
  if (status === "connected") {
    return "Connected";
  }

  if (status === "stale") {
    return "Stale";
  }

  return "Disconnected";
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
