import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  createReadingsLoadingState,
  fetchLatestReadingsByNode
} from "../api/readings";
import type { QueryState, SensorReading } from "../types/readings";
import { StatusCard } from "./StatusCard";

const REFRESH_INTERVAL_MS = 15000;

type LatestReadingsProps = {
  onReadingsStateChange?: (state: QueryState<SensorReading[]>) => void;
};

export function LatestReadings({ onReadingsStateChange }: LatestReadingsProps) {
  const [readingsState, setReadingsState] = useState<QueryState<SensorReading[]>>(
    createReadingsLoadingState()
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);

  const loadReadings = useCallback(async () => {
    setIsRefreshing(true);
    const result = await fetchLatestReadingsByNode();
    setReadingsState(result);
    setLastRefresh(new Date().toLocaleTimeString());
    setIsRefreshing(false);
  }, []);

  useEffect(() => {
    void loadReadings();
    const interval = window.setInterval(() => {
      void loadReadings();
    }, REFRESH_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [loadReadings]);

  useEffect(() => {
    onReadingsStateChange?.(readingsState);
  }, [onReadingsStateChange, readingsState]);

  return (
    <section className="readings-section" aria-labelledby="latest-readings-title">
      <div className="section-toolbar">
        <div>
          <p className="eyebrow">Latest Readings</p>
          <h2 id="latest-readings-title">Nodes</h2>
          {lastRefresh ? (
            <p className="muted">Last refreshed at {lastRefresh}</p>
          ) : null}
        </div>

        <button
          className="icon-button"
          type="button"
          onClick={() => void loadReadings()}
          disabled={isRefreshing}
          title="Refresh latest readings"
          aria-label="Refresh latest readings"
        >
          <RefreshCw size={18} aria-hidden="true" />
          <span>{isRefreshing ? "Refreshing" : "Refresh"}</span>
        </button>
      </div>

      {readingsState.status === "loading" ? (
        <div className="message-panel">Loading latest readings...</div>
      ) : null}

      {readingsState.status === "error" ? (
        <div className="message-panel error-panel" role="alert">
          {readingsState.error}
        </div>
      ) : null}

      {readingsState.status === "success" && readingsState.isEmpty ? (
        <div className="message-panel">
          No readings yet. Start the fake publisher and MQTT subscriber, then refresh.
        </div>
      ) : null}

      {readingsState.status === "success" && !readingsState.isEmpty ? (
        <div className="reading-grid">
          {readingsState.data.map((reading) => (
            <StatusCard key={reading.node_id} reading={reading} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
