import { lazy, Suspense, useEffect, useState } from "react";
import type { OverviewData } from "../../types/overview";
import type { SpatialOverview } from "../../lib/spatialOverview";
import { number, time } from "../../lib/overviewDisplay";
import { OfficeCanvas } from "./OfficeCanvas";
const NodeInspector = lazy(() => import("./NodeInspector").then(module => ({ default: module.NodeInspector })));

export function ZoneWorkspace({ data, model, now, refreshToken, refreshError, active }: {
  data: OverviewData; model: SpatialOverview; now: number; refreshToken: string | null; refreshError?: string | null; active: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null), [inspecting, setInspecting] = useState(false);
  const selectedNode = model.nodes.find(n => n.id === selectedId);
  const representative = model.representative;
  useEffect(() => { if (!active) setInspecting(false); else document.getElementById("sz-zone-heading")?.focus({ preventScroll: true }); }, [active]);
  useEffect(() => { if (selectedId && !selectedNode) { setSelectedId(null); setInspecting(false); } }, [selectedId, selectedNode]);
  function select(id: string) {
    if (!model.nodes.some(n => n.id === id)) return;
    setSelectedId(id); setInspecting(true);
  }
  return <section className="sz-workspace" aria-label="Shared cooling zone workspace">
    <div className="sz-heading"><h1 tabIndex={-1} id="sz-zone-heading">{model.occupancy}{model.feed === "CURRENT" && !refreshError ? " now." : " in the stored snapshot."}</h1><span>{model.zoneName} · snapshot <time title={model.at}>{time(model.at, true)}</time></span></div>
    <div className="sz-layout">
      <section className="sz-stage" aria-label="Office sensing infrastructure">
        <div className="sz-stage-top"><div className="sz-zone-environment"><strong>{number(representative?.temperature)}<small>°C</small></strong><span /><strong>{number(representative?.humidity)}<small>% RH</small></strong><small>Representative: {representative?.label ?? "Unavailable"}</small></div><span>{model.freshCount} of {model.nodes.length} fresh &amp; valid</span></div>
        <OfficeCanvas nodes={model.nodes} selectedId={selectedId ?? model.nodes[0]?.id ?? null} onSelect={select} />
        <p className="sz-stage-foot">Ceiling mounted · coverage illustrative, not calibrated <span>{model.occupancy} · shared zone</span></p>
      </section>
      <aside className="sz-decision" aria-label="Current zone cooling decision"><div className="sz-section-label"><h2>Current request</h2><time title={data.decision.occurred_at}>{time(data.decision.occurred_at)}</time></div><h3 className="sz-mode" data-mode={data.decision.payload.requested_mode}>{model.requestedMode}</h3><p className="sz-reason">{model.reason}</p>
        <div className="sz-output"><span>Reported output · simulated</span><strong>{model.reportedOutput}</strong><small>Status: {model.outputStatus.toLowerCase()} · <time title={data.output.occurred_at}>{time(data.output.occurred_at, true)}</time></small></div>
        <div className="sz-plan-pair"><div><span>Planned cooling restart</span><strong title={model.forecast.restart ?? undefined}>{model.forecast.restart ? time(model.forecast.restart) : "Not scheduled"}</strong><small>{model.forecast.restart ? time(model.forecast.restart, true) : "No active restart record"}</small></div><div><span>Next-use window</span><strong title={model.forecast.window?.start}>{model.forecast.window ? time(model.forecast.window.start) : "Unavailable"}</strong><small>{model.forecast.window ? <><time title={model.forecast.window.start}>{time(model.forecast.window.start, true)}</time>–<time title={model.forecast.window.end}>{time(model.forecast.window.end, new Date(model.forecast.window.start).toDateString() !== new Date(model.forecast.window.end).toDateString())}</time></> : "No active usage forecast"}</small></div></div>
        <p className="sz-forecast-quality">{model.forecast.source.toLowerCase()} source · {model.forecast.quality.toLowerCase()} quality · {model.forecast.status.toLowerCase()}</p>{model.forecast.reason && <p className="sz-note">{model.forecast.reason}</p>}<p className="sz-note">A forecast window is an expectation. Planned restart does not confirm cooling was applied.</p>
        <details className="sz-trace"><summary>Current decision references</summary><dl><div><dt>Run / frame</dt><dd>{model.runId} / {model.sequence}</dd></div><div><dt>Decision / command</dt><dd>{model.decisionId}<br />{model.commandId}</dd></div><div><dt>Forecast / output</dt><dd>{model.forecast.id}<br />{model.outputId}</dd></div></dl></details>
      </aside>
    </div>
    {inspecting && selectedNode && active && <Suspense fallback={<p role="status">Opening node inspector…</p>}><NodeInspector data={data} model={model} nodeId={selectedNode.id} now={now} refreshToken={refreshToken} refreshError={refreshError} onSelect={select} onClose={() => setInspecting(false)} /></Suspense>}
  </section>;
}
