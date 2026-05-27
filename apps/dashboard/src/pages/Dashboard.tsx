import { HistoryChart } from "../components/HistoryChart";
import { LatestReadings } from "../components/LatestReadings";

export function Dashboard() {
  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Smart HVAC Prototype</p>
          <h1>OmniSense Dashboard</h1>
        </div>
        <p className="header-note">Live overview from Supabase sensor readings</p>
      </header>

      <LatestReadings />
      <HistoryChart />
    </main>
  );
}
