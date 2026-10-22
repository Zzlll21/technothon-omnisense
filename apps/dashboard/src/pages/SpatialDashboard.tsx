import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ArrowRight, RefreshCw } from "lucide-react";
import { FloorPlan, floorSpaces } from "../components/spatial/FloorPlan";
import type { FloorSpaceId } from "../components/spatial/FloorPlan";
import { useOverview } from "../hooks/useOverview";
import { number, relative, time } from "../lib/overviewDisplay";
import { spatialOverview } from "../lib/spatialOverview";
import type { SpatialOverview } from "../lib/spatialOverview";
import "../spatial.css";
import "../spatial-zone.css";

const ZoneWorkspace = lazy(() => import("../components/spatial/ZoneWorkspace").then(module => ({ default: module.ZoneWorkspace })));
const currentView = () => new URLSearchParams(window.location.search).get("view") === "room" ? "room" : "floor";

export function SpatialDashboard() {
  const state = useOverview();
  const model = state.data ? spatialOverview(state.data, state.now) : null;
  const [selected, setSelected] = useState<FloorSpaceId>("open-office");
  const [view, setView] = useState(currentView);
  const [zoneVisited, setZoneVisited] = useState(() => currentView() === "room");
  const inspector = useRef<HTMLElement>(null);
  const space = floorSpaces.find(s => s.id === selected)!;
  const dashboardUrl = new URL(window.location.href);
  dashboardUrl.searchParams.delete("experience");
  dashboardUrl.searchParams.delete("view");
  const dashboardHref = `${dashboardUrl.pathname}${dashboardUrl.search}${dashboardUrl.hash}`;
  const status = state.error ? "Connection issue" : state.loading ? "Connecting" : !model ? "No active dataset" : model.feed === "CURRENT" ? "Feed current" : model.feed === "CLOCK_SKEW" ? "Clock mismatch" : "Data delayed";
  useEffect(() => {
    const previous = document.title;
    document.title = view === "room" ? "OmniSense · Zone workspace" : "OmniSense · Floor overview";
    return () => { document.title = previous; };
  }, [view]);
  useEffect(() => {
    const pop = () => { const next = currentView(); setView(next); if (next === "room") setZoneVisited(true); requestAnimationFrame(() => document.getElementById(next === "room" ? "sz-zone-heading" : "sa-floor-heading")?.focus({ preventScroll: true })); };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  function navigate(next: "floor" | "room") {
    if (view === next) return;
    const url = new URL(window.location.href);
    if (next === "room") { url.searchParams.set("view", "room"); setZoneVisited(true); } else url.searchParams.delete("view");
    window.history.pushState(null, "", url); setView(next);
    requestAnimationFrame(() => { document.getElementById(next === "room" ? "sz-zone-heading" : "sa-floor-heading")?.focus({ preventScroll: true }); window.scrollTo({ top: 0 }); });
  }
  function select(id: FloorSpaceId) {
    setSelected(id);
    if (id === "open-office" && model) { navigate("room"); return; }
    if (window.matchMedia("(max-width: 800px)").matches) requestAnimationFrame(() => {
      inspector.current?.focus({ preventScroll: true });
      inspector.current?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    });
  }
  return <div className="spatial-app">
    <a className="sa-skip" href="#spatial-main">Skip to workspace</a>
    <header className="sa-header"><a href="?experience=spatial" className="sa-brand" aria-label="OmniSense floor overview" onClick={event => { if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) { event.preventDefault(); navigate("floor"); } }}><svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14" /><path d="m23 8-15 8 15 8" /></svg>omnisense</a><span className="sa-context">{view === "room" ? "Open Office" : "Office floor"}</span><div className="sa-header-end"><span>Synthetic operating records</span><span className="sa-feed" role="status">{status}</span></div></header>
    <nav className="sa-nav" aria-label="Workspace views"><a href="?experience=spatial" aria-current={view === "floor" ? "page" : undefined} onClick={event => { if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) { event.preventDefault(); navigate("floor"); } }}>Floor overview</a>{view === "room" && <span className="sz-current-nav" aria-current="page">Zone</span>}<a href={dashboardHref}>Current dashboard <ArrowRight size={14} /></a><span>{view === "room" ? "One shared cooling zone" : "1 supported zone slot · 5 illustrative spaces"}</span></nav>
    <main id="spatial-main" tabIndex={-1}>
      <div className={`sa-heading ${view === "room" ? "sz-refresh-heading" : ""}`}><div hidden={view === "room"}><h1 id="sa-floor-heading" tabIndex={-1}>The floor, at a glance.</h1><p>Select Open Office to enter its shared cooling zone and inspect stored sensor records.</p></div><div className="sa-refresh"><span>{state.refreshedAt ? <>Refreshed <time title={state.refreshedAt}>{time(state.refreshedAt)}</time></> : "Awaiting first refresh"}</span><button disabled={state.refreshing} onClick={() => void state.refresh()}><RefreshCw size={15} />{state.refreshing ? "Refreshing" : "Refresh"}</button></div></div>
      {state.error && <div className="sa-notice" role="alert"><strong>{model ? "Refresh interrupted" : "Unable to load SDP records"}</strong><p>{state.error} {model && "The last successful snapshot remains visible; it is not a new reading."}</p></div>}
      {!state.error && model && model.feed !== "CURRENT" && <div className="sa-notice" role="status"><strong>{model.feed === "CLOCK_SKEW" ? "Stored timestamps are ahead of this browser" : "The stored feed is delayed"}</strong><p>Latest frame <time title={model.at}>{time(model.at, true)}</time>. Values below belong to that snapshot.</p></div>}
      <section hidden={view !== "floor"} aria-label="Floor overview">
      <div className="sa-key"><span><i />Supported zone slot</span><span><i className="sa-key-empty" />Illustrative space</span></div>
      <div className="sa-layout">
        <section className="sa-drawing" aria-label="Office floor"><div className="sa-drawing-title"><strong>Office floor</strong><span>Proposed spatial layout</span></div><FloorPlan selected={selected} onSelect={select} model={model} /><p className="sa-plan-hint">Swipe the plan, or choose a space below.</p>
          <div className="sa-space-index" role="group" aria-label="Choose a floor space">{floorSpaces.map(item => <button key={item.id} aria-pressed={selected === item.id} aria-controls="spatial-inspector" onClick={() => select(item.id)}>{item.name}<small>{item.id === "open-office" ? "Supported zone slot ↗" : "Illustrative"}</small></button>)}</div>
        </section>
        <aside id="spatial-inspector" className="sa-inspector" tabIndex={-1} ref={inspector} aria-label="Selected floor space">
          <span className="sa-kicker">{selected === "open-office" ? "Supported zone slot" : "Illustrative space"}</span><h2 aria-live="polite">{space.name}</h2>
          {selected !== "open-office" ? <div className="sa-unconnected"><h3>No operational data</h3><p>This is an illustrative part of the proposed floor. No nodes, cooling outputs or forecasts are connected to this space.</p><button className="sa-primary" onClick={() => select("open-office")}>Inspect supported zone <ArrowRight size={17} /></button></div>
            : model ? <ZoneSummary model={model} onEnter={() => navigate("room")} now={state.now} cached={!!state.error} />
              : <div className="sa-unconnected" aria-busy={state.loading}><h3>{state.loading ? "Loading stored snapshot…" : state.error ? "Records unavailable" : "No published dataset"}</h3><p>{state.loading ? "Reading the active run and its exact linked records." : state.error ? "No placeholder readings are shown. Refresh to retry the existing SDP connection." : "No active run has been published. This slot has no readings, mode or forecast to display."}</p>{!state.loading && <button className="sa-primary" disabled={state.refreshing} onClick={() => void state.refresh()}>Retry connection <RefreshCw size={16} /></button>}</div>}
        </aside>
      </div>
      <p className="sa-boundary">Only the Open Office slot maps to the single stored SDP cooling zone. Surrounding spaces and furniture are schematic; they do not represent additional connected rooms. Sensing footprints illustrate approximately 10 m² per ceiling node and are not to scale.</p>
      </section>
      {zoneVisited && <div hidden={view !== "room"}>{model && state.data ? <Suspense fallback={<p role="status">Opening zone workspace…</p>}><ZoneWorkspace key={`${model.runId}/${model.zoneId}`} data={state.data} model={model} now={state.now} refreshToken={state.refreshedAt} refreshError={state.error} active={view === "room"} dashboardHref={dashboardHref} /></Suspense> : <p role="status">{state.loading ? "Loading the stored zone snapshot…" : "No validated zone snapshot is available. Refresh or return to the floor overview."}</p>}</div>}
      <footer className="sa-footer"><p>Stored synthetic records · simulated reported output. No physical HVAC actuation or measured electricity use.</p><span>{model ? <>Snapshot <time title={model.at}>{time(model.at, true)}</time> · browser local time</> : "Waiting for a stored snapshot"}</span></footer>
    </main>
  </div>;
}

function ZoneSummary({ model, onEnter, now, cached }: { model: SpatialOverview; onEnter: () => void; now: number; cached: boolean }) {
  const representative = model.representative;
  const forecast = model.forecast;
  return <>
    <p className="sa-zone-description"><strong>{model.zoneName}</strong><br />One shared cooling zone · {model.nodes.length} ceiling nodes</p>
    <div className="sa-zone-state"><strong>{model.occupancy}</strong><span>{model.freshCount} of {model.nodes.length} fresh &amp; valid</span></div>
    <div className="sa-environment"><strong>{number(representative?.temperature)}<small>°C</small></strong><strong>{number(representative?.humidity)}<small>% RH</small></strong></div>
    <p className="sa-reading-basis">Representative: {representative?.label ?? "Unavailable"}{representative && ` · ${representative.freshness.toLowerCase()}`}</p>
    <dl className="sa-facts"><div><dt>Cooling request</dt><dd>{model.requestedMode}</dd></div><div><dt>Planned restart</dt><dd><time title={forecast.restart ?? undefined}>{forecast.restart ? time(forecast.restart, true) : "Not scheduled"}</time></dd></div><div><dt>Next-use window</dt><dd>{forecast.window ? <><time title={forecast.window.start}>{time(forecast.window.start, true)}</time>–<time title={forecast.window.end}>{time(forecast.window.end, new Date(forecast.window.start).toDateString() !== new Date(forecast.window.end).toDateString())}</time></> : "Unavailable"}</dd></div></dl>
    <p className="sa-forecast-note">{forecast.source.toLowerCase()} source · {forecast.quality.toLowerCase()} quality · {forecast.status.toLowerCase()}. Plans are expectations, not confirmed usage or cooling.</p>
    <details className="sa-evidence"><summary>Sensor evidence &amp; decision</summary><div className="sa-evidence-content">
      {model.nodes.map((node, i) => <section key={node.id}><h3>Node {String(i + 1).padStart(2, "0")} · {node.label}</h3><p>{number(node.temperature)} °C · {number(node.humidity)}% RH</p><p>{node.classification}</p><p>{node.freshness} · recorded state {node.recordedState.toLowerCase()} · {node.evidenceValid ? "evidence valid" : "evidence incomplete / invalid"}</p><small><time title={node.observedAt ?? undefined}>{node.observedAt ? `${time(node.observedAt, true)} · ${relative(node.observedAt, now)}` : "No sample"}</time></small></section>)}
      <section><h3>Why this request?</h3><p>{model.reason}</p><p>Frame coverage: {model.coverage.toLowerCase()}.</p></section><section><h3>Simulated reported output</h3><p>{model.reportedOutput} · {model.outputStatus.toLowerCase()}</p><small>Report status is distinct from the requested cooling mode.</small></section>
      {forecast.reason && <section><h3>Forecast note</h3><p>{forecast.reason}</p></section>}
    </div></details>
    <button className="sa-primary" onClick={onEnter}>Explore 3D workspace <ArrowRight size={17} /></button>
    <p className="sa-data-note">{cached ? "Last successful snapshot" : "Stored snapshot"} · <time title={model.at}>{time(model.at, true)}</time>. Inspect both nodes and their recorded conditions in the zone workspace.</p>
    <details className="sa-provenance"><summary>Snapshot references</summary><dl><div><dt>Run</dt><dd>{model.runId}</dd></div><div><dt>Zone / room</dt><dd>{model.zoneId} / {model.roomId}</dd></div><div><dt>Sequence</dt><dd>{model.sequence}</dd></div><div><dt>Decision</dt><dd>{model.decisionId}</dd></div><div><dt>Command</dt><dd>{model.commandId}</dd></div><div><dt>Forecast</dt><dd>{forecast.id}</dd></div><div><dt>Output</dt><dd>{model.outputId}</dd></div></dl></details>
  </>;
}
