import { useCallback, useState } from "react";
import { CrisisButton } from "../components/CrisisButton";
import { HistoryChart } from "../components/HistoryChart";
import { LatestReadings } from "../components/LatestReadings";
import { RoomHeatmap } from "../components/RoomHeatmap";
import { createReadingsLoadingState } from "../api/readings";
import type { QueryState, SensorReading } from "../types/readings";

type DashboardTab = "overview" | "map" | "trends" | "control";

const dashboardTabs: Array<{ id: DashboardTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "map", label: "Room Map" },
  { id: "trends", label: "Trends" },
  { id: "control", label: "Crisis Control" }
];

export function Dashboard() {
  const [latestReadingsState, setLatestReadingsState] = useState<
    QueryState<SensorReading[]>
  >(createReadingsLoadingState());
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");

  const handleLatestReadingsStateChange = useCallback(
    (state: QueryState<SensorReading[]>) => {
      setLatestReadingsState(state);
    },
    []
  );

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="header-main">
          <div>
            <p className="eyebrow">Smart Building Monitor</p>
            <h1>OmniSense Smart HVAC Dashboard</h1>
          </div>
          <div className="header-status">
            <span className="system-pill live">Live Demo</span>
          </div>
        </div>

        <div className="system-status-strip" aria-label="System status">
          <span className="status-dot status-dot-normal">System Operational</span>
          <span className="status-dot status-dot-info">Live MQTT Demo</span>
          <span>{formatNodeCount(latestReadingsState)}</span>
          <span>{lastRefresh ? `Refreshed ${lastRefresh}` : "Waiting for data"}</span>
        </div>

        <div className="top-summary-grid" aria-label="Current building summary">
          <SummaryTile
            label="Temperature"
            tone={getPrimaryReadingTone(latestReadingsState)}
            value={formatTemperature(getPrimaryReading(latestReadingsState)?.temperature ?? null)}
            badge={getTemperatureBadge(getPrimaryReading(latestReadingsState))}
          />
          <SummaryTile
            label="PMV / Comfort"
            tone={getPrimaryReadingTone(latestReadingsState)}
            value={formatComfortSummary(getPrimaryReading(latestReadingsState))}
            badge={getComfortLabel(getPrimaryReading(latestReadingsState))}
          />
          <SummaryTile
            label="Headcount"
            value={formatHeadcount(getPrimaryReading(latestReadingsState)?.headcount ?? null)}
            badge={getHeadcountBadge(getPrimaryReading(latestReadingsState))}
          />
          <SummaryTile
            label="Crisis Mode"
            tone={getPrimaryReading(latestReadingsState)?.crisis_mode ? "critical" : "normal"}
            value={getPrimaryReading(latestReadingsState)?.crisis_mode ? "Active" : "Normal"}
            badge={getPrimaryReading(latestReadingsState)?.crisis_mode ? "Alert" : "Normal"}
          />
        </div>
      </header>

      <SystemInsights readingsState={latestReadingsState} />

      <nav className="dashboard-tabs" aria-label="Dashboard sections" role="tablist">
        {dashboardTabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab-button ${activeTab === tab.id ? "active" : ""}`}
            type="button"
            id={`${tab.id}-tab`}
            aria-controls={`${tab.id}-panel`}
            aria-selected={activeTab === tab.id}
            role="tab"
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="tab-panels">
        <section
          className="tab-panel"
          hidden={activeTab !== "overview"}
          id="overview-panel"
          aria-labelledby="overview-tab"
          role="tabpanel"
        >
          <LatestReadings
            onLastRefreshChange={setLastRefresh}
            onReadingsStateChange={handleLatestReadingsStateChange}
          />
        </section>

        <section
          className="tab-panel"
          hidden={activeTab !== "map"}
          id="map-panel"
          aria-labelledby="map-tab"
          role="tabpanel"
        >
          <RoomHeatmap readingsState={latestReadingsState} />
        </section>

        <section
          className="tab-panel"
          hidden={activeTab !== "trends"}
          id="trends-panel"
          aria-labelledby="trends-tab"
          role="tabpanel"
        >
          <HistoryChart />
        </section>

        <section
          className="tab-panel"
          hidden={activeTab !== "control"}
          id="control-panel"
          aria-labelledby="control-tab"
          role="tabpanel"
        >
          <CrisisButton readingsState={latestReadingsState} />
        </section>
      </div>
    </main>
  );
}

function SummaryTile({
  label,
  tone = "normal",
  value,
  badge
}: {
  label: string;
  tone?: "normal" | "warm" | "critical" | "cool";
  value: string;
  badge?: string;
}) {
  return (
    <div className={`summary-tile summary-tile-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {badge ? <em>{badge}</em> : null}
    </div>
  );
}

function SystemInsights({
  readingsState
}: {
  readingsState: QueryState<SensorReading[]>;
}) {
  const insights = getSystemInsights(readingsState);

  return (
    <section className="insights-panel" aria-labelledby="system-insights-title">
      <div>
        <p className="eyebrow">Transparency</p>
        <h2 id="system-insights-title">System Insights</h2>
      </div>
      <div className="insight-list">
        {insights.map((insight) => (
          <article className={`insight-card insight-${insight.tone}`} key={insight.title}>
            <span>{insight.title}</span>
            <strong>{insight.message}</strong>
          </article>
        ))}
      </div>
    </section>
  );
}

function getPrimaryReading(readingsState: QueryState<SensorReading[]>) {
  if (readingsState.status !== "success" || readingsState.data.length === 0) {
    return null;
  }

  return (
    readingsState.data.find((reading) => reading.node_id === "demo-1") ??
    readingsState.data[0]
  );
}

function getPrimaryReadingTone(readingsState: QueryState<SensorReading[]>) {
  const reading = getPrimaryReading(readingsState);
  if (!reading) {
    return "normal";
  }

  if (reading.crisis_mode || (reading.pmv !== null && reading.pmv > 1)) {
    return "critical";
  }

  if (reading.pmv !== null && reading.pmv > 0.5) {
    return "warm";
  }

  if (reading.pmv !== null && reading.pmv < -0.5) {
    return "cool";
  }

  return "normal";
}

function getSystemInsights(readingsState: QueryState<SensorReading[]>) {
  if (readingsState.status === "loading") {
    return [
      {
        title: "Data",
        message: "Waiting for MQTT",
        tone: "neutral" as const
      }
    ];
  }

  if (readingsState.status === "error") {
    return [
      {
        title: "Dashboard Read",
        message: readingsState.error,
        tone: "critical" as const
      }
    ];
  }

  if (readingsState.isEmpty) {
    return [
      {
        title: "Data",
        message: "Start publisher",
        tone: "neutral" as const
      }
    ];
  }

  const readings = readingsState.data;
  const warmNodes = readings.filter(
    (reading) =>
      (reading.temperature !== null && reading.temperature >= 27) ||
      (reading.pmv !== null && reading.pmv > 0.5)
  );
  const highHeadcountNode = readings
    .filter((reading) => reading.headcount !== null)
    .sort((a, b) => (b.headcount ?? 0) - (a.headcount ?? 0))[0];
  const crisisNodes = readings.filter(
    (reading) => reading.crisis_mode || (reading.pmv !== null && reading.pmv > 1)
  );
  const staleNodes = readings.filter((reading) => isStaleReading(reading.recorded_at));

  const insights = [
    {
      title: "Comfort",
      message:
        warmNodes.length > 0
          ? `Warm zone detected · ${formatNodeList(warmNodes)}`
          : "Comfort normal",
      tone: warmNodes.length > 0 ? ("warm" as const) : ("normal" as const)
    },
    {
      title: "Headcount",
      message:
        highHeadcountNode && (highHeadcountNode.headcount ?? 0) >= 6
          ? `High occupancy · ${highHeadcountNode.node_id}`
          : "Occupancy normal",
      tone:
        highHeadcountNode && (highHeadcountNode.headcount ?? 0) >= 6
          ? ("warm" as const)
          : ("normal" as const)
    },
    {
      title: "Crisis Mode",
      message:
        crisisNodes.length > 0
          ? `Crisis active · ${formatNodeList(crisisNodes)}`
          : "Crisis normal",
      tone: crisisNodes.length > 0 ? ("critical" as const) : ("normal" as const)
    },
    {
      title: "Data",
      message:
        staleNodes.length > 0
          ? "Data delay · Check publisher"
          : "Telemetry live",
      tone: staleNodes.length > 0 ? ("warm" as const) : ("normal" as const)
    }
  ];

  return insights;
}

function getComfortLabel(reading: SensorReading | null) {
  if (!reading || reading.pmv === null) {
    return "No data";
  }

  if (reading.crisis_mode || reading.pmv > 1) {
    return "Hot / Crisis-like";
  }

  if (reading.pmv > 0.5) {
    return "Warm";
  }

  if (reading.pmv < -0.5) {
    return "Cool";
  }

  return "Comfortable";
}

function formatComfortSummary(reading: SensorReading | null) {
  if (!reading || reading.pmv === null) {
    return "No data";
  }

  return reading.pmv.toFixed(2);
}

function formatTemperature(value: number | null) {
  if (value === null) {
    return "No data";
  }

  return `${value.toFixed(1)} \u00b0C`;
}

function formatHeadcount(value: number | null) {
  if (value === null) {
    return "No data";
  }

  return String(value);
}

function formatNodeCount(readingsState: QueryState<SensorReading[]>) {
  if (readingsState.status !== "success") {
    return "Checking nodes";
  }

  const count = readingsState.data.length;
  return `${count} ${count === 1 ? "node" : "nodes"}`;
}

function formatNodeList(readings: SensorReading[]) {
  return readings.map((reading) => reading.node_id).join(", ");
}

function getTemperatureBadge(reading: SensorReading | null) {
  if (!reading || reading.temperature === null) {
    return "Unknown";
  }

  if (reading.temperature >= 29) {
    return "Hot";
  }

  if (reading.temperature >= 27) {
    return "Warm";
  }

  if (reading.temperature < 24) {
    return "Cool";
  }

  return "Normal";
}

function getHeadcountBadge(reading: SensorReading | null) {
  if (!reading || reading.headcount === null) {
    return "Unknown";
  }

  if (reading.headcount >= 6) {
    return "High";
  }

  return reading.headcount > 0 ? "Occupied" : "Empty";
}

function isStaleReading(recordedAt: string) {
  const recordedTime = new Date(recordedAt).getTime();
  if (Number.isNaN(recordedTime)) {
    return false;
  }

  return Date.now() - recordedTime > 2 * 60 * 1000;
}
