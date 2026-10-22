import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { OverviewData } from "../../types/overview";
import type { SpatialOverview } from "../../lib/spatialOverview";
import type { HistoryRange } from "../../api/nodeHistory";
import { useNodeHistory } from "../../hooks/useNodeHistory";
import { NodeHistoryCharts } from "../cooling/NodeHistoryCharts";
import { number, relative, time } from "../../lib/overviewDisplay";

export function NodeInspector({ data, model, nodeId, now, refreshToken, refreshError, onSelect, onClose }: {
  data: OverviewData; model: SpatialOverview; nodeId: string; now: number; refreshToken: string | null; refreshError?: string | null; onSelect: (id: string) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef(typeof document !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const [hours, setHours] = useState<HistoryRange>(24), [retry, setRetry] = useState(0);
  const history = useNodeHistory(data, nodeId, hours, `${refreshToken}/${retry}`);
  const node = model.nodes.find(n => n.id === nodeId);
  useEffect(() => {
    const element = dialog.current; element?.showModal();
    return () => { element?.close(); if (trigger.current?.isConnected) trigger.current.focus({ preventScroll: true }); };
  }, []);
  if (!node) return null;
  return <dialog className="sz-dialog" ref={dialog} aria-labelledby="sz-inspector-heading" onCancel={event => { event.preventDefault(); if (document.activeElement?.getAttribute("role") !== "application") onClose(); }} onClick={event => { if (event.target === event.currentTarget) { const r = event.currentTarget.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) onClose(); } }}>
    <header className="sz-drawer-top"><span>Sensor inspection</span><button autoFocus aria-label="Close node inspector" onClick={onClose}><X size={20} /></button></header>
    <div className="sz-drawer-body"><h2 id="sz-inspector-heading">{node.label}</h2><p className="sz-note">{node.id} · {model.zoneName} · Ceiling mounted</p>
      {refreshError && <p className="sz-health-note" role="alert">Snapshot refresh interrupted. Current readings belong to the last successful snapshot. {refreshError}</p>}
      <div className="sz-inspector-nodes" role="group" aria-label="Inspect another sensor">{model.nodes.map((n, i) => <button key={n.id} aria-pressed={n.id === nodeId} onClick={() => onSelect(n.id)}>Node {String(i + 1).padStart(2, "0")} · {n.label}</button>)}</div>
      <div className="sz-drawer-values"><div><span>Temperature</span><strong>{number(node.temperature)}<small>°C</small></strong></div><div><span>Relative humidity</span><strong>{number(node.humidity)}<small>%</small></strong></div></div>
      <dl className="sz-keyrows"><div><dt>Occupancy classification</dt><dd>{node.classification}<small>{node.classificationCode ?? "No valid classification"}</small></dd></div><div><dt>Sensor freshness</dt><dd>{node.freshness}</dd></div><div><dt>Latest observation</dt><dd><time dateTime={node.observedAt ?? undefined} title={node.observedAt ?? undefined}>{time(node.observedAt, true)}</time><small>{node.observedAt ? relative(node.observedAt, now) : "No current sample"}</small></dd></div><div><dt>Temperature evidence</dt><dd>{node.temperatureValidity.toLowerCase()}</dd></div><div><dt>Humidity evidence</dt><dd>{node.humidityValidity.toLowerCase()}</dd></div><div><dt>Classification evidence</dt><dd>{node.classificationValidity.toLowerCase()}</dd></div><div><dt>State at recorded decision</dt><dd>{node.recordedState.toLowerCase()}</dd></div></dl>
      {node.freshness !== "Connected" && <p className="sz-health-note">{node.observedAt ? "Last reported values; current conditions are unconfirmed." : "No current sample is available for this configured node."}</p>}
      <div className="sz-history-heading"><h3>Recorded conditions</h3><div className="sz-range" role="group" aria-label="Sensor history range">{([1, 24, 168] as const).map(value => <button key={value} aria-pressed={hours === value} onClick={() => setHours(value)}>{value === 168 ? "7 days" : value === 1 ? "1 hour" : "24 hours"}</button>)}</div></div>
      <p className="sz-history-context" role="status">{history.loading ? "Loading history…" : `${history.points.length.toLocaleString()} stored samples`} · {Intl.DateTimeFormat().resolvedOptions().timeZone}</p>
      {history.error && <div className="sz-health-note" role="alert"><strong>History unavailable</strong><p>{history.error}{history.points.length ? " Previously loaded records remain visible." : ""}</p><button onClick={() => setRetry(n => n + 1)}>Retry history</button></div>}
      {history.points.length ? <NodeHistoryCharts key={`${data.run.run_id}/${nodeId}/${hours}`} points={history.points} start={history.start} end={history.end} anchor={data.run.live_anchor} /> : history.loading ? <p className="sz-history-empty" aria-busy="true">Reading validated sensor records…</p> : !history.error && <p className="sz-history-empty">No samples in this range. Measurements remain unavailable.</p>}
      <p className="sz-note">Gaps remain unavailable. Classifications are recorded node evidence; combined occupancy belongs to the shared zone. Use arrow keys to inspect chart samples; Escape clears a chart selection.</p>
      <details className="sz-trace"><summary>Supporting snapshot references</summary><dl><div><dt>Run / frame</dt><dd>{model.runId} / {model.sequence}</dd></div><div><dt>Observation evidence</dt><dd>{node.evidenceId ?? "Unavailable"}</dd></div><div><dt>Configured location</dt><dd>x {number(node.x * 100, 0)}%, y {number(node.y * 100, 0)}% · schematic mapping</dd></div><div><dt>Snapshot</dt><dd><time dateTime={model.at}>{model.at}</time></dd></div></dl></details>
    </div>
  </dialog>;
}
