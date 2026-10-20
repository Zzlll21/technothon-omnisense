import { useState } from "react";
import { MapPin, Radio, RefreshCw, ShieldCheck } from "lucide-react";
import type { OverviewData } from "../../types/overview";
import type { HistoryRange } from "../../api/nodeHistory";
import { useNodeHistory } from "../../hooks/useNodeHistory";
import { classification, classLabels } from "../../lib/nodeHistoryDisplay";
import { nodeStatus, number, relative, time } from "../../lib/overviewDisplay";
import { Badge } from "./ProductShell";
import { NodeHistoryCharts } from "./NodeHistoryCharts";

export function RoomNodes({ data, now, refreshToken }: { data: OverviewData; now: number; refreshToken: string | null }) {
  const nodes = data.zone.config.payload.required_nodes.map(expected => data.nodes.find(node => node.node_id === expected.node_id) ?? { ...expected, run_id: data.run.run_id, zone_id: data.zone.zone_id, required: true });
  const [selectedId, setSelectedId] = useState(nodes[0]?.node_id ?? "");
  const [hours, setHours] = useState<HistoryRange>(24);
  const [retry, setRetry] = useState(0);
  const node = nodes.find(n => n.node_id === selectedId) ?? nodes[0];
  const history = useNodeHistory(data, node?.node_id ?? "", hours, `${refreshToken}/${retry}`);
  if (!node) return <div className="empty-workspace"><h2>No nodes configured</h2><p>This cooling zone has no required sensor mapping.</p></div>;
  const sample = data.samples.find(s => s.node_id === node.node_id);
  const evidence = data.evidence.find(e => e.payload.node_id === node.node_id);
  const kind = classification(evidence);
  const freshness = nodeStatus(sample, data, now);
  const validity = evidence ? [evidence.payload.classification, evidence.payload.temperature_c, evidence.payload.humidity_percent].every(value => value.validity === "VALID") ? "Valid" : "Incomplete / invalid" : "Unavailable";
  const occupancyTone = data.frame.occupancy === "OCCUPIED" ? "good" : data.frame.occupancy === "UNCERTAIN" ? "attention" : "neutral";
  return <div className="room-monitor">
    <div className="room-monitor-grid">
      <section className="monitor-map" aria-label="Room floorplan">
        <div className="section-heading"><div><span className="eyebrow">Cooling zone · {data.zone.zone_id}</span><h2>{data.zone.name}</h2></div><Badge tone={occupancyTone}>{data.frame.occupancy.toLowerCase()}</Badge></div>
        <div className="interactive-plan">
          <img src="/zone-plan.svg" alt="Illustrative room layout within one cooling zone" />
          <div className="zone-boundary" aria-hidden="true" />
          <span className="zone-boundary-label">Shared cooling zone</span>
          {nodes.map(n => {
            const reading = data.samples.find(s => s.node_id === n.node_id);
            const status = nodeStatus(reading, data, now);
            const e = data.evidence.find(item => item.payload.node_id === n.node_id);
            const c = classification(e);
            return <button key={n.node_id} className={`map-node tone-${status.tone} ${node.node_id === n.node_id ? "map-node-selected" : ""}`} style={{ left: `${16 + n.x * 68}%`, top: `${20 + n.y * 60}%` }} aria-label={`Inspect ${n.label}, ${status.label}`} aria-pressed={node.node_id === n.node_id} title={`${n.node_id}: ${c ? classLabels[c] : "No evidence"}`} onClick={() => setSelectedId(n.node_id)}><Radio size={21} /><span>{n.label}<small>{reading ? `${number(reading.temperature_c)} °C` : "No sample"}</small></span></button>;
          })}
        </div>
        <div className="map-node-list" aria-label="Sensor selection">{nodes.map(n => {
          const status = nodeStatus(data.samples.find(s => s.node_id === n.node_id), data, now);
          const kind = classification(data.evidence.find(e => e.payload.node_id === n.node_id));
          return <button key={n.node_id} aria-pressed={node.node_id === n.node_id} onClick={() => setSelectedId(n.node_id)}><span className={`tiny-dot dot-${status.tone}`} /><div><strong>{n.label}</strong><small>{kind ? classLabels[kind] : "No classification"}</small></div><span>{status.label}</span></button>;
        })}</div>
        <p className="map-caption">One shared cooling zone · {nodes.length} required sensor nodes</p>
      </section>
      <section className="node-inspection" aria-label="Selected node details" aria-live="polite">
        <div className="section-heading"><div><span className="eyebrow">Selected sensor</span><h2>{node.label}</h2><span className="node-id">{node.node_id}</span></div><Badge tone={freshness.tone}>{freshness.label}</Badge></div>
        <div className="node-classification"><span className="small-label">Reported occupancy class</span><strong>{kind ? classLabels[kind] : "Unavailable"}</strong></div>
        <div className="node-environment"><div><span>Temperature</span><strong>{number(sample?.temperature_c)}<small> °C</small></strong></div><div><span>Humidity</span><strong>{number(sample?.humidity_percent)}<small>%</small></strong></div></div>
        <dl className="node-facts"><div><dt><ShieldCheck size={15} />Evidence validity</dt><dd>{validity}</dd></div><div><dt>Last reported</dt><dd><time dateTime={sample?.observed_at} title={sample?.observed_at}>{time(sample?.observed_at, true)}</time><small>{sample ? relative(sample.observed_at, now) : "No sample in current frame"}</small></dd></div><div><dt><MapPin size={15} />Zone location</dt><dd>{node.label}<small>{data.zone.zone_id} · x {number(node.x * 100, 0)}%, y {number(node.y * 100, 0)}%</small></dd></div></dl>
        {freshness.label !== "Connected" && <p className="node-health-note">{sample ? "Last reported values. Current conditions are unconfirmed." : "No current sample is available for this required node."}</p>}
      </section>
    </div>
    <section className="node-history" aria-label="Selected node history">
      <div className="section-heading"><div><span className="eyebrow">{node.label} · {node.node_id}</span><h2>Sensor history</h2></div><div className="history-range" role="group" aria-label="History time range">{([1, 24, 168] as const).map(value => <button key={value} aria-pressed={hours === value} onClick={() => setHours(value)}>{value === 168 ? "7 days" : `${value} ${value === 1 ? "hour" : "hours"}`}</button>)}</div></div>
      <div className="history-context"><span>Stored observation timestamps · {Intl.DateTimeFormat().resolvedOptions().timeZone}</span><span>{history.loading ? "Loading history…" : `${history.points.length.toLocaleString()} samples`}</span></div>
      {history.error && <div className="notice notice-error" role="alert"><div><strong>History unavailable</strong><p>{history.error}{history.points.length ? " Previous records remain visible." : ""}</p></div><button className="text-action" onClick={() => setRetry(n => n + 1)}><RefreshCw size={15} />Retry</button></div>}
      {history.loading && !history.points.length ? <div className="history-empty" role="status" aria-busy="true"><RefreshCw size={22} className="spinning" /><p>Loading {node.label} history</p></div> : history.points.length ? <NodeHistoryCharts key={`${data.run.run_id}/${node.node_id}/${hours}`} points={history.points} start={history.start} end={history.end} anchor={data.run.live_anchor} /> : !history.error ? <div className="history-empty"><Radio size={26} /><h3>No samples in this time range</h3><p>Select a longer range or check the generator connection.</p></div> : null}
      <p className="history-footnote">Gaps indicate missing samples. Classifications are stored node evidence; combined occupancy belongs to the zone.</p>
    </section>
  </div>;
}
