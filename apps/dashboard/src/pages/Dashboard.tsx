import { lazy, Suspense, useState } from "react";
import { ArrowRight, Database, RefreshCw, Unplug, TriangleAlert } from "lucide-react";
import { Overview } from "../components/cooling/Overview";
import { PredictiveCooling } from "../components/cooling/PredictiveCooling";
import { destinations, ProductShell } from "../components/cooling/ProductShell";
import type { Destination } from "../components/cooling/ProductShell";
import { useOverview } from "../hooks/useOverview";
import { feedStatus, relative, time } from "../lib/overviewDisplay";
import type { Tone } from "../lib/overviewDisplay";

const ACUtilization = lazy(() => import("../components/cooling/ACUtilization").then(module => ({ default: module.ACUtilization })));
const OperatingRecords = lazy(() => import("../components/cooling/OperatingRecords").then(module => ({ default: module.OperatingRecords })));
const RoomNodes = lazy(() => import("../components/cooling/RoomNodes").then(module => ({ default: module.RoomNodes })));
const SensorDrawer = lazy(() => import("../components/cooling/SensorDrawer").then(module => ({ default: module.SensorDrawer })));

export function Dashboard() {
  const [view, setView] = useState<Destination>("overview");
  const [sensorId, setSensorId] = useState<string | null>(null);
  const [inspection, setInspection] = useState<{ runId: string; at: number } | null>(null);
  const [auditEventId, setAuditEventId] = useState<string | undefined>();
  function navigate(next: Destination) {
    setView(next); setSensorId(null); setAuditEventId(undefined);
    requestAnimationFrame(() => { document.getElementById("main-content")?.focus(); window.scrollTo({ top: 0 }); });
  }
  function updateInspection(at: number | null) { setInspection(at === null || !state.data ? null : { runId: state.data.run.run_id, at }); }
  function inspectTime(at: number) { navigate("prediction"); updateInspection(at); }
  function audit(eventId?: string) { navigate("records"); setAuditEventId(eventId); }
  const state = useOverview();
  const inspectionTime = inspection?.runId === state.data?.run.run_id ? inspection?.at : undefined;
  const freshness = feedStatus(state.data, state.now);
  const feed: { label: string; tone: Tone } = state.error ? { label: "Connection issue", tone: "attention" }
    : state.loading ? { label: "Connecting", tone: "neutral" }
      : freshness === "CURRENT" ? { label: "Feed current", tone: "good" }
        : freshness === "CLOCK_SKEW" ? { label: "Clock mismatch", tone: "attention" }
          : freshness === "DELAYED" ? { label: "Data delayed", tone: "attention" }
            : { label: "No active dataset", tone: "neutral" };
  return <ProductShell view={view} onNavigate={navigate} feed={feed} model={state.data?.run.model_version}>
    <div className="page-heading"><div><h1>{view === "overview" ? "Cooling operations" : destinations.find(d => d.id === view)?.label}</h1>{view !== "overview" && <p>{view === "prediction" ? "Follow the recorded decision from evidence to reported output." : view === "utilization" ? "Requested cooling durations and data coverage." : view === "records" ? "Trace every decision to its supporting records." : "Two sensors. One shared cooling zone."}</p>}</div><div className="refresh-area"><span>{state.refreshedAt ? <>Refreshed <strong title={state.refreshedAt}>{time(state.refreshedAt)}</strong></> : "Awaiting first refresh"}</span><button className="refresh-button" disabled={state.refreshing} onClick={() => void state.refresh()}><RefreshCw size={16} className={state.refreshing ? "spinning" : ""} />{state.refreshing ? "Refreshing" : "Refresh"}</button></div></div>
    {state.error && <div className="notice notice-error" role="alert"><TriangleAlert size={20} /><div><strong>{state.data ? "Refresh interrupted" : "Connect the SDP workspace"}</strong><p>{state.error}{state.data ? " Last successful snapshot remains visible." : ""}</p></div></div>}
    {!state.error && state.data && freshness !== "CURRENT" && <div className="notice notice-warning" role="status"><TriangleAlert size={19} /><div><strong>{freshness === "CLOCK_SKEW" ? "Check the system clock" : "Updates are taking longer than expected"}</strong><p>Latest frame {relative(state.data.frame.simulated_at, state.now)}. {freshness === "CLOCK_SKEW" ? "Stored timestamps are ahead of this browser." : "Check the generator connection. Stored values remain visible."}</p></div></div>}
    {state.loading ? <LoadingOverview /> : state.data ? view === "records" ? <Suspense fallback={<LoadingOverview />}><OperatingRecords key={`${state.data.run.run_id}/${auditEventId ?? "all"}`} data={state.data} initialEventId={auditEventId} /></Suspense> : view === "utilization" ? <Suspense fallback={<LoadingOverview />}><ACUtilization key={state.data.run.run_id} data={state.data} refreshToken={state.refreshedAt} onInspectTime={inspectTime} /></Suspense> : view === "prediction" ? <PredictiveCooling key={state.data.run.run_id} data={state.data} now={state.now} refreshToken={state.refreshedAt} initialInspection={inspectionTime} onPinChange={updateInspection} onAudit={audit} /> : view === "nodes" ? <Suspense fallback={<LoadingOverview />}><RoomNodes key={state.data.run.run_id} data={state.data} now={state.now} refreshToken={state.refreshedAt} /></Suspense> : <Overview key={state.data.run.run_id} data={state.data} now={state.now} refreshToken={state.refreshedAt} onInspectNode={setSensorId} onInspectTime={inspectTime} onAudit={audit} onUtilization={() => navigate("utilization")} onNodes={() => navigate("nodes")} /> : <div className="empty-workspace"><span className="empty-symbol">{state.error ? <Unplug size={30} /> : <Database size={30} />}</span><h2>{state.error ? "Your workspace is ready to connect" : "No published dataset yet"}</h2><p>{state.error ? "Check the frontend configuration and read access, then refresh." : "The generator publishes a complete run after historical seeding finishes."}</p><button className="text-action" disabled={state.refreshing} onClick={() => void state.refresh()}>Try again <ArrowRight size={16} /></button></div>}
    {state.data && sensorId && <Suspense fallback={<p className="sensor-loading" role="status">Opening sensor inspection…</p>}><SensorDrawer key={`${state.data.run.run_id}/${sensorId}`} data={state.data} now={state.now} refreshToken={state.refreshedAt} nodeId={sensorId} onClose={() => setSensorId(null)} /></Suspense>}
  </ProductShell>;
}

function LoadingOverview() {
  return <div className="loading-overview" aria-busy="true" aria-label="Loading current zone records"><div className="metric-grid">{[0, 1, 2, 3].map(i => <div key={i} className="metric skeleton"><span /><strong /><small /></div>)}</div><div className="skeleton-workspace"><span /><span /><span /></div><p>Loading the latest committed snapshot...</p></div>;
}
