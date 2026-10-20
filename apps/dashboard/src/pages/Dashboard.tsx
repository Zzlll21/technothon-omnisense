import { useState } from "react";
import { ArrowLeft, ArrowRight, Database, RefreshCw, Unplug, TriangleAlert } from "lucide-react";
import { Overview } from "../components/cooling/Overview";
import { RoomNodes } from "../components/cooling/RoomNodes";
import { Badge, destinations, ProductShell } from "../components/cooling/ProductShell";
import type { Destination } from "../components/cooling/ProductShell";
import { useOverview } from "../hooks/useOverview";
import { feedStatus, relative, time } from "../lib/overviewDisplay";
import type { Tone } from "../lib/overviewDisplay";

export function Dashboard() {
  const [view, setView] = useState<Destination>("overview");
  const state = useOverview();
  const freshness = feedStatus(state.data, state.now);
  const feed: { label: string; tone: Tone } = state.error ? { label: "Connection issue", tone: "attention" }
    : state.loading ? { label: "Connecting", tone: "neutral" }
      : freshness === "CURRENT" ? { label: "Feed current", tone: "good" }
        : freshness === "CLOCK_SKEW" ? { label: "Clock mismatch", tone: "attention" }
          : freshness === "DELAYED" ? { label: "Data delayed", tone: "attention" }
            : { label: "No active dataset", tone: "neutral" };
  return <ProductShell view={view} onNavigate={setView} feed={feed} model={state.data?.run.model_version}>
    <div className="page-heading"><div><div className="page-eyebrow">Smart cooling management</div><h1>{destinations.find(d => d.id === view)?.label}</h1><p>{view === "overview" ? "Current conditions. Clear decisions." : "SDP Building / Cooling operations"}</p></div><div className="refresh-area"><span>{state.refreshedAt ? <>Refreshed <strong title={state.refreshedAt}>{time(state.refreshedAt)}</strong></> : "Awaiting first refresh"}</span><button className="refresh-button" disabled={state.refreshing} onClick={() => void state.refresh()}><RefreshCw size={16} className={state.refreshing ? "spinning" : ""} />{state.refreshing ? "Refreshing" : "Refresh"}</button></div></div>
    {state.error && <div className="notice notice-error" role="alert"><TriangleAlert size={20} /><div><strong>{state.data ? "Refresh interrupted" : "Connect the SDP workspace"}</strong><p>{state.error}{state.data ? " Last successful snapshot remains visible." : ""}</p></div></div>}
    {!state.error && state.data && freshness !== "CURRENT" && <div className="notice notice-warning" role="status"><TriangleAlert size={19} /><div><strong>{freshness === "CLOCK_SKEW" ? "Check the system clock" : "Updates are taking longer than expected"}</strong><p>Latest frame {relative(state.data.frame.simulated_at, state.now)}. {freshness === "CLOCK_SKEW" ? "Stored timestamps are ahead of this browser." : "Check the generator connection. Stored values remain visible."}</p></div></div>}
    {view === "overview" || view === "nodes" ? <>
      {state.loading ? <LoadingOverview /> : state.data ? view === "nodes" ? <RoomNodes key={state.data.run.run_id} data={state.data} now={state.now} refreshToken={state.refreshedAt} /> : <Overview data={state.data} now={state.now} /> : <div className="empty-workspace"><span className="empty-symbol">{state.error ? <Unplug size={30} /> : <Database size={30} />}</span><h2>{state.error ? "Your workspace is ready to connect" : "No published dataset yet"}</h2><p>{state.error ? "Check the frontend configuration and read access, then refresh." : "The generator publishes a complete run after historical seeding finishes."}</p><button className="text-action" disabled={state.refreshing} onClick={() => void state.refresh()}>Try again <ArrowRight size={16} /></button></div>}
    </> : <div className="upcoming-view"><span className="empty-symbol">{(() => { const Icon = destinations.find(d => d.id === view)!.icon; return <Icon size={30} />; })()}</span><Badge>Next phase</Badge><h2>{destinations.find(d => d.id === view)?.label}</h2><p>{view === "prediction" ? "Forecast history and predictive-cooling timelines are not available in this release." : view === "utilization" ? "Operating-mode duration analysis is not available in this release." : "Searchable operating history and export are not available in this release."}</p><button className="text-action" onClick={() => setView("overview")}><ArrowLeft size={16} />Back to Overview</button></div>}
  </ProductShell>;
}

function LoadingOverview() {
  return <div className="loading-overview" aria-busy="true" aria-label="Loading current zone records"><div className="metric-grid">{[0, 1, 2, 3].map(i => <div key={i} className="metric skeleton"><span /><strong /><small /></div>)}</div><div className="skeleton-workspace"><span /><span /><span /></div><p>Loading the latest committed snapshot...</p></div>;
}
