import { useCallback, useState } from "react";
import { HistoryChart } from "../components/HistoryChart";
import { LatestReadings } from "../components/LatestReadings";
import { RoomHeatmap } from "../components/RoomHeatmap";
import { createReadingsLoadingState } from "../api/readings";
import type { QueryState, SensorReading } from "../types/readings";

export function Dashboard() {
  const [latestReadingsState, setLatestReadingsState] = useState<
    QueryState<SensorReading[]>
  >(createReadingsLoadingState());

  const handleLatestReadingsStateChange = useCallback(
    (state: QueryState<SensorReading[]>) => {
      setLatestReadingsState(state);
    },
    []
  );

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Smart HVAC Prototype</p>
          <h1>OmniSense Dashboard</h1>
        </div>
        <p className="header-note">Live overview from Supabase sensor readings</p>
      </header>

      <LatestReadings onReadingsStateChange={handleLatestReadingsStateChange} />
      <RoomHeatmap readingsState={latestReadingsState} />
      <HistoryChart />
    </main>
  );
}
