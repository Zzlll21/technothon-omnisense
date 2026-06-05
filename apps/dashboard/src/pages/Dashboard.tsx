import { useCallback, useState } from "react";
import { CrisisButton } from "../components/CrisisButton";
import { HistoryChart } from "../components/HistoryChart";
import { LatestReadings } from "../components/LatestReadings";
import { RoomHeatmap } from "../components/RoomHeatmap";
import { createReadingsLoadingState } from "../api/readings";
import type { QueryState, SensorReading } from "../types/readings";

type DashboardTab = "overview" | "map" | "trends" | "control";
type SummaryTone = "normal" | "warm" | "critical" | "cool";

type BuildingSummary = {
  averageTemperature: number | null;
  worstPmv: number | null;
  totalHeadcount: number | null;
  crisisActive: boolean;
  tone: SummaryTone;
};

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
  const buildingSummary = getBuildingSummary(latestReadingsState);

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
            tone={buildingSummary.tone}
            value={formatTemperature(buildingSummary.averageTemperature)}
            badge={getTemperatureBadge(buildingSummary.averageTemperature)}
          />
          <SummaryTile
            label="PMV / Comfort"
            tone={buildingSummary.tone}
            value={formatComfortSummary(buildingSummary.worstPmv)}
            badge={getComfortLabel(buildingSummary.worstPmv, buildingSummary.crisisActive)}
          />
          <SummaryTile
            label="Headcount"
            value={formatHeadcount(buildingSummary.totalHeadcount)}
            badge={getHeadcountBadge(buildingSummary.totalHeadcount)}
          />
          <SummaryTile
            label="Crisis Mode"
            tone={buildingSummary.crisisActive ? "critical" : "normal"}
            value={buildingSummary.crisisActive ? "Active" : "Normal"}
            badge={buildingSummary.crisisActive ? "Alert" : "Normal"}
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
  tone?: SummaryTone;
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

function getBuildingSummary(readingsState: QueryState<SensorReading[]>): BuildingSummary {
  if (readingsState.status !== "success" || readingsState.data.length === 0) {
    return {
      averageTemperature: null,
      worstPmv: null,
      totalHeadcount: null,
      crisisActive: false,
      tone: "normal"
    };
  }

  const readings = readingsState.data;
  const temperatures = readings
    .map((reading) => reading.temperature)
    .filter((value): value is number => typeof value === "number");
  const pmvValues = readings
    .map((reading) => reading.pmv)
    .filter((value): value is number => typeof value === "number");
  const headcounts = readings
    .map((reading) => reading.headcount)
    .filter((value): value is number => typeof value === "number");
  const averageTemperature =
    temperatures.length > 0
      ? temperatures.reduce((total, value) => total + value, 0) / temperatures.length
      : null;
  const worstPmv = pmvValues.length > 0 ? Math.max(...pmvValues) : null;
  const totalHeadcount =
    headcounts.length > 0
      ? headcounts.reduce((total, value) => total + value, 0)
      : null;
  const crisisActive = readings.some((reading) => reading.crisis_mode);

  return {
    averageTemperature,
    worstPmv,
    totalHeadcount,
    crisisActive,
    tone: getComfortTone(worstPmv, crisisActive)
  };
}

function getComfortTone(pmv: number | null, crisisActive: boolean): SummaryTone {
  if (crisisActive || (pmv !== null && pmv > 1)) {
    return "critical";
  }

  if (pmv !== null && pmv > 0.5) {
    return "warm";
  }

  if (pmv !== null && pmv < -0.5) {
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

function getComfortLabel(pmv: number | null, crisisActive: boolean) {
  if (pmv === null) {
    return "No data";
  }

  if (crisisActive || pmv > 1) {
    return "Hot / Crisis-like";
  }

  if (pmv > 0.5) {
    return "Warm";
  }

  if (pmv < -0.5) {
    return "Cool";
  }

  return "Comfortable";
}

function formatComfortSummary(value: number | null) {
  if (value === null) {
    return "No data";
  }

  return value.toFixed(2);
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

function getTemperatureBadge(value: number | null) {
  if (value === null) {
    return "Unknown";
  }

  if (value >= 29) {
    return "Hot";
  }

  if (value >= 27) {
    return "Warm";
  }

  if (value < 24) {
    return "Cool";
  }

  return "Normal";
}

function getHeadcountBadge(value: number | null) {
  if (value === null) {
    return "Unknown";
  }

  if (value >= 6) {
    return "High";
  }

  return value > 0 ? "Occupied" : "Empty";
}

function isStaleReading(recordedAt: string) {
  const recordedTime = new Date(recordedAt).getTime();
  if (Number.isNaN(recordedTime)) {
    return false;
  }

  return Date.now() - recordedTime > 2 * 60 * 1000;
}
