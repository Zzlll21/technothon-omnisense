import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createReadingsLoadingState,
  fetchLatestReadingsByNode,
  fetchRecentHistoryForNode
} from "../api/readings";
import type { QueryState, SensorReading } from "../types/readings";

const REFRESH_INTERVAL_MS = 15000;
const HISTORY_LIMIT = 120;

type ChartPoint = {
  recorded_at: string;
  timeLabel: string;
  temperature: number | null;
  humidity: number | null;
  pmv: number | null;
  headcount: number | null;
  air_quality: number | null;
};

export function HistoryChart() {
  const [availableNodes, setAvailableNodes] = useState<string[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [historyState, setHistoryState] = useState<QueryState<SensorReading[]>>(
    createReadingsLoadingState()
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);

  const loadAvailableNodes = useCallback(async () => {
    const latest = await fetchLatestReadingsByNode();
    if (latest.status !== "success") {
      return latest;
    }

    const nodeIds = latest.data.map((reading) => reading.node_id);
    setAvailableNodes(nodeIds);

    if (!selectedNodeId && nodeIds.length > 0) {
      setSelectedNodeId(nodeIds[0]);
    }

    return latest;
  }, [selectedNodeId]);

  const loadHistory = useCallback(
    async (nodeId = selectedNodeId) => {
      setIsRefreshing(true);

      const latest = await loadAvailableNodes();
      const effectiveNodeId =
        nodeId || (latest.status === "success" ? latest.data[0]?.node_id ?? "" : "");

      if (!effectiveNodeId) {
        setHistoryState({
          status: "success",
          data: [],
          error: null,
          isEmpty: true
        });
        setLastRefresh(new Date().toLocaleTimeString());
        setIsRefreshing(false);
        return;
      }

      const history = await fetchRecentHistoryForNode(effectiveNodeId, {
        limit: HISTORY_LIMIT,
        ascending: true
      });

      setSelectedNodeId(effectiveNodeId);
      setHistoryState(history);
      setLastRefresh(new Date().toLocaleTimeString());
      setIsRefreshing(false);
    },
    [loadAvailableNodes, selectedNodeId]
  );

  useEffect(() => {
    void loadHistory();
    const interval = window.setInterval(() => {
      void loadHistory();
    }, REFRESH_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [loadHistory]);

  const chartData = useMemo(
    () => historyState.data.map(toChartPoint),
    [historyState.data]
  );
  const hasAirQuality = chartData.some((point) => point.air_quality !== null);
  const chartSeries = useMemo(
    () => [
      {
        key: "temperature",
        label: "Temperature",
        unit: "°C",
        color: "#d44d3f",
        decimals: 1
      },
      {
        key: "humidity",
        label: "Humidity",
        unit: "%",
        color: "#2f7ebc",
        decimals: 0,
        joinUnit: true
      },
      {
        key: "pmv",
        label: "PMV",
        unit: "",
        color: "#8b5c2f",
        decimals: 1
      },
      {
        key: "headcount",
        label: "Headcount",
        unit: "people",
        color: "#2f8f5b",
        decimals: 0,
        integerScale: true
      }
    ] as ChartSeries[],
    []
  );

  return (
    <section className="history-section" aria-labelledby="history-title">
      <div className="section-toolbar">
        <div>
          <p className="eyebrow">Historical Readings</p>
          <h2 id="history-title">Recent Trends</h2>
          {lastRefresh ? (
            <p className="muted">History refreshed at {lastRefresh}</p>
          ) : null}
        </div>

        <div className="history-controls">
          <label className="select-label" htmlFor="history-node">
            Node
          </label>
          <select
            id="history-node"
            className="node-select"
            value={selectedNodeId}
            onChange={(event) => {
              setSelectedNodeId(event.target.value);
              void loadHistory(event.target.value);
            }}
            disabled={availableNodes.length === 0 || isRefreshing}
          >
            {availableNodes.length === 0 ? (
              <option value="">No nodes</option>
            ) : null}
            {availableNodes.map((nodeId) => (
              <option key={nodeId} value={nodeId}>
                {nodeId}
              </option>
            ))}
          </select>

          <button
            className="icon-button"
            type="button"
            onClick={() => void loadHistory()}
            disabled={isRefreshing}
            title="Refresh history"
            aria-label="Refresh history"
          >
            <RefreshCw size={18} aria-hidden="true" />
            <span>{isRefreshing ? "Refreshing" : "Refresh"}</span>
          </button>
        </div>
      </div>

      {historyState.status === "loading" ? (
        <div className="message-panel">Loading history...</div>
      ) : null}

      {historyState.status === "error" ? (
        <div className="message-panel error-panel" role="alert">
          {historyState.error}
        </div>
      ) : null}

      {historyState.status === "success" && historyState.isEmpty ? (
        <div className="message-panel">
          No history yet. Run the fake publisher and MQTT subscriber for a few
          minutes, then refresh.
        </div>
      ) : null}

      {historyState.status === "success" && !historyState.isEmpty ? (
        <div className="chart-panel">
          <div className="mini-chart-grid">
            {chartSeries.map((series) => (
              <MiniChartCard key={series.key} data={chartData} series={series} />
            ))}
          </div>

          {!hasAirQuality ? (
            <p className="muted chart-note">No air quality data for this node.</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

type ChartSeries = {
  key: keyof Pick<
    ChartPoint,
    "temperature" | "humidity" | "pmv" | "headcount"
  >;
  label: string;
  unit: string;
  color: string;
  decimals: number;
  joinUnit?: boolean;
  integerScale?: boolean;
};

type MiniChartCardProps = {
  data: ChartPoint[];
  series: ChartSeries;
};

function MiniChartCard({ data, series }: MiniChartCardProps) {
  const values = data
    .map((point) => point[series.key])
    .filter((value): value is number => typeof value === "number");
  const latestValue = values.at(-1);

  return (
    <article className="mini-chart-card">
      <div className="mini-chart-header">
        <div>
          <h3>{series.label}</h3>
          <p className="muted">{formatSampleCount(values.length)}</p>
        </div>
        <strong>{formatMetricValue(latestValue, series)}</strong>
      </div>

      {values.length === 0 ? (
        <div className="mini-chart-empty">No {series.label.toLowerCase()} data</div>
      ) : (
        <SingleMetricSvg data={data} series={series} />
      )}
    </article>
  );
}

type SingleMetricSvgProps = {
  data: ChartPoint[];
  series: ChartSeries;
};

function SingleMetricSvg({ data, series }: SingleMetricSvgProps) {
  const width = 420;
  const height = 240;
  const padding = { top: 34, right: 34, bottom: 54, left: 66 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const values = data
    .map((point) => point[series.key])
    .filter((value): value is number => typeof value === "number");
  const { min: minValue, max: maxValue } = getScaleBounds(values, series);
  const valueRange = maxValue - minValue || 1;

  const xForIndex = (index: number) => {
    if (data.length <= 1) {
      return padding.left + plotWidth / 2;
    }

    return padding.left + (index / (data.length - 1)) * plotWidth;
  };

  const yForValue = (value: number) =>
    padding.top + plotHeight - ((value - minValue) / valueRange) * plotHeight;
  const path = buildLinePath(data, series, xForIndex, yForValue);
  const firstTime = data[0]?.timeLabel ?? "";
  const lastTime = data[data.length - 1]?.timeLabel ?? "";

  return (
    <svg
      className="mini-chart-svg"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${series.label} history`}
    >
      {[0, 0.5, 1].map((fraction) => {
        const y = padding.top + plotHeight * fraction;
        return (
          <line
            key={fraction}
            className="chart-grid-line"
            x1={padding.left}
            x2={width - padding.right}
            y1={y}
            y2={y}
          />
        );
      })}

      {path ? (
        <path
          d={path}
          fill="none"
          stroke={series.color}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3"
        />
      ) : null}

      {values.length === 1 ? (
        <circle
          cx={xForIndex(0)}
          cy={yForValue(values[0])}
          fill={series.color}
          r="5"
        />
      ) : null}

      <text className="chart-axis-label" x={padding.left} y={padding.top - 8}>
        {formatAxisValue(maxValue, series)}
      </text>
      <text
        className="chart-axis-label"
        x={padding.left}
        y={height - padding.bottom + 18}
      >
        {formatAxisValue(minValue, series)}
      </text>
      <text className="chart-axis-label" x={padding.left} y={height - 12}>
        {firstTime}
      </text>
      <text
        className="chart-axis-label"
        x={width - padding.right}
        y={height - 12}
        textAnchor="end"
      >
        {lastTime}
      </text>
    </svg>
  );
}

function buildLinePath(
  data: ChartPoint[],
  series: ChartSeries,
  xForIndex: (index: number) => number,
  yForValue: (value: number) => number
) {
  const commands: string[] = [];
  let hasStarted = false;

  data.forEach((point, index) => {
    const value = point[series.key];
    if (typeof value !== "number") {
      hasStarted = false;
      return;
    }

    const x = xForIndex(index);
    const y = yForValue(value);
    commands.push(`${hasStarted ? "L" : "M"} ${x.toFixed(1)} ${y.toFixed(1)}`);
    hasStarted = true;
  });

  return commands.join(" ");
}

function getScaleBounds(values: number[], series: ChartSeries) {
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);

  if (series.integerScale) {
    const min = Math.max(0, Math.floor(rawMin) - 1);
    const max = Math.max(min + 1, Math.ceil(rawMax) + 1);
    return { min, max };
  }

  const paddingValue = Math.max((rawMax - rawMin) * 0.12, series.key === "pmv" ? 0.2 : 0.5);
  return {
    min: rawMin - paddingValue,
    max: rawMax + paddingValue
  };
}

function formatMetricValue(value: number | undefined, series: ChartSeries) {
  if (value === undefined) {
    return "No data";
  }

  const formatted = value.toFixed(series.decimals);
  if (!series.unit) {
    return formatted;
  }

  return series.joinUnit ? `${formatted}${series.unit}` : `${formatted} ${series.unit}`;
}

function formatAxisValue(value: number, series: ChartSeries) {
  if (series.integerScale) {
    return String(Math.round(value));
  }

  return value.toFixed(series.decimals);
}

function formatSampleCount(count: number) {
  if (count === 1) {
    return "1 sample";
  }

  return `${count} samples`;
}

function toChartPoint(reading: SensorReading): ChartPoint {
  return {
    recorded_at: reading.recorded_at,
    timeLabel: formatTime(reading.recorded_at),
    temperature: reading.temperature,
    humidity: reading.humidity,
    pmv: reading.pmv,
    headcount: reading.headcount,
    air_quality: reading.air_quality
  };
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}
