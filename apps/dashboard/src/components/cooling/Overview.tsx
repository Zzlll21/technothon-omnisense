import { Activity, ArrowDown, ArrowRight, Check, Clock3, Droplets, Fan, Radio, ShieldCheck, Snowflake, Thermometer, Users, WifiOff } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { OverviewData } from "../../types/overview";
import { activityLabel, forecastState, modeLabels, modeTones, nodeStatus, number, outputLabel, relative, time } from "../../lib/overviewDisplay";
import type { Tone } from "../../lib/overviewDisplay";
import { Badge } from "./ProductShell";

function Metric({ label, value, unit, note, icon: Icon, tone = "neutral" }: { label: string; value: string; unit?: string; note: string; icon: LucideIcon; tone?: Tone }) {
  return <article className={`metric metric-${tone}`}><div className="metric-top"><span>{label}</span><Icon size={19} /></div><div className="metric-value">{value}{unit && <span>{unit}</span>}</div><div className="metric-note"><span className={`tiny-dot dot-${tone}`} />{note}</div></article>;
}
function SectionTitle({ title, eyebrow, trailing }: { title: string; eyebrow?: string; trailing?: ReactNode }) {
  return <div className="section-heading"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div>{trailing}</div>;
}
export function Overview({ data, now }: { data: OverviewData; now: number }) {
  const config = data.zone.config.payload;
  const reference = data.samples.find(s => s.node_id === config.representative_environment_node_id);
  const referenceName = config.required_nodes.find(n => n.node_id === config.representative_environment_node_id)?.label ?? "Reference sensor";
  const mode = data.decision.payload.requested_mode;
  const forecast = data.forecast.payload;
  const forecastStatus = forecastState(data.forecast, now);
  const occupied = data.frame.occupancy === "OCCUPIED";
  const uncertain = data.frame.occupancy === "UNCERTAIN";
  const required = config.required_nodes.map(expected => {
    const stored = data.nodes.find(node => node.node_id === expected.node_id);
    return stored ? { ...expected, label: stored.label, x: stored.x, y: stored.y } : expected;
  });
  const healthy = required.filter(node => nodeStatus(data.samples.find(s => s.node_id === node.node_id), data, now).label === "Connected").length;
  const applied = data.output.payload.status === "APPLIED";
  return <div className="overview-content">
    <section className="metric-grid" aria-label="Current zone conditions">
      <Metric label="Zone occupancy" value={occupied ? "Occupied" : uncertain ? "Uncertain" : "Vacant"} note={data.frame.coverage === "COMPLETE" ? "Complete node evidence" : "Reduced evidence coverage"} icon={Users} tone={uncertain ? "attention" : occupied ? "good" : "neutral"} />
      <Metric label="Cooling mode" value={modeLabels[mode]} note="Latest stored decision" icon={Fan} tone={modeTones[mode]} />
      <Metric label="Room temperature" value={number(reference?.temperature_c)} unit="°C" note={`${referenceName} reference`} icon={Thermometer} tone="info" />
      <Metric label="Relative humidity" value={number(reference?.humidity_percent)} unit="%" note={`${referenceName} reference`} icon={Droplets} tone="neutral" />
    </section>
    <div className="workspace-grid">
      <section className="zone-section" aria-label="Zone monitor">
        <SectionTitle title={data.zone.name} eyebrow="Zone monitor" trailing={<Badge tone={healthy === required.length ? "good" : "attention"}>{healthy}/{required.length} nodes connected</Badge>} />
        <div className="zone-layout"><div className="room-plan"><img src="/zone-plan.svg" alt="Illustrative cooling zone floorplan" /><span className="room-plan-label">{data.zone.zone_id}</span>{required.map(node => {
          const sample = data.samples.find(s => s.node_id === node.node_id);
          const status = nodeStatus(sample, data, now);
          return <div key={node.node_id} className={`sensor-marker marker-${status.tone}`} style={{ left: `${16 + node.x * 68}%`, top: `${20 + node.y * 60}%` }}><span className="sensor-symbol"><Radio size={17} /></span><span className="sensor-reading">{sample ? `${number(sample.temperature_c)} °C` : "No data"}<small>{node.label}</small></span></div>;
        })}<span className="plan-legend"><span className="tiny-dot dot-good" />Required sensor nodes</span></div></div>
        <div className="decision-strip"><span className={`decision-icon tone-${modeTones[mode]}`}><Fan size={20} /></span><div><span className="small-label">Cooling decision</span><strong>{data.decision.payload.reason_text.replace(/^Scripted demo:\s*/i, "").replace(/^./, c => c.toUpperCase())}</strong></div><span className="decision-time" title={data.decision.occurred_at}>{time(data.decision.occurred_at)}</span></div>
        <div className="output-comparison">
          <div><span className="small-label">Requested output</span><strong>{outputLabel(data.decision.payload.requested_output)}</strong><span>{time(data.decision.payload.evaluated_at, true)}</span></div>
          <ArrowRight size={18} className="output-arrow" />
          <div><span className="small-label">Reported output <Badge tone={applied ? "good" : data.output.payload.status === "ACCEPTED" ? "info" : "danger"}>{applied ? "Applied" : data.output.payload.status.toLowerCase()}</Badge></span><strong>{outputLabel(applied ? data.output.payload.reported_output : null)}</strong><span>Simulated report · {time(data.output.occurred_at, true)}</span></div>
        </div>
      </section>
      <section className="forecast-section" aria-label="Upcoming room use"><SectionTitle title="Next room use" eyebrow="Looking ahead" trailing={<span className="section-icon"><Clock3 size={19} /></span>} />
        <div className="forecast-meta"><Badge tone={forecastStatus === "ACTIVE" ? "info" : "neutral"}>{forecastStatus === "ACTIVE" ? "Forecast" : forecastStatus.toLowerCase()}</Badge><span>{forecast.source === "BOOKING" ? "Booking timetable" : forecast.source === "HISTORY" ? "Usage history" : "Source unavailable"}</span></div>
        {forecastStatus === "ACTIVE" && forecast.next_use_window ? <><p className="forecast-date">{new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric" }).format(new Date(forecast.next_use_window.start))}</p><div className="forecast-window">{time(forecast.next_use_window.start)}<span>to {time(forecast.next_use_window.end)}</span></div><div className="restart-row"><span className="restart-icon"><Snowflake size={22} /></span><div><span className="small-label">Planned cooling restart</span><strong>{time(forecast.planned_restart_at)}</strong></div><ArrowDown size={17} /></div></> : <div className="forecast-unavailable"><Clock3 size={30} /><h3>{forecastStatus === "EXPIRED" ? "Forecast window has elapsed" : "No active prediction"}</h3><p>{forecast.status_reason ?? "Waiting for the next stored forecast."}</p></div>}
        <dl className="forecast-facts"><div><dt>Forecast quality</dt><dd>{forecast.quality === "UNAVAILABLE" ? "Unavailable" : forecast.quality.charAt(0) + forecast.quality.slice(1).toLowerCase()}</dd></div><div><dt>Valid until</dt><dd title={forecast.expires_at}>{time(forecast.expires_at, true)}</dd></div><div><dt>Issued</dt><dd title={data.forecast.occurred_at}>{time(data.forecast.occurred_at, true)}</dd></div></dl><div className="forecast-footnote"><SparkleIcon />Timetable estimate, separate from current occupancy</div>
      </section>
    </div>
    <div className="bottom-grid">
      <section className="nodes-section"><SectionTitle title="Required sensor nodes" trailing={<span className="quiet-label">{required.length} mapped to this zone</span>} /><div className="node-table"><div className="node-table-head"><span>Sensor</span><span>Connection</span><span>Temperature</span><span>Humidity</span><span>Latest record</span></div>{required.map(node => {
        const sample = data.samples.find(s => s.node_id === node.node_id);
        const status = nodeStatus(sample, data, now);
        const missing = status.label === "Missing" || status.label === "Disconnected";
        return <div key={node.node_id} className="node-row"><div className="node-name"><span className={`node-symbol tone-${status.tone}`}>{missing ? <WifiOff size={18} /> : <Radio size={18} />}</span><div><strong>{node.label}</strong><small>{node.node_id}</small></div></div><Badge tone={status.tone}>{status.label}</Badge><span className="node-metric">{number(sample?.temperature_c)} <small>°C</small></span><span className="node-metric">{number(sample?.humidity_percent)}<small>%</small></span><span className="node-updated" title={sample?.observed_at}>{sample ? relative(sample.observed_at, now) : "No sample"}</span></div>;
      })}</div>{healthy < required.length && <div className="node-warning">Some required evidence is missing or delayed. The stored zone decision remains unchanged.</div>}</section>
      <section className="activity-section"><SectionTitle title="Latest activity" trailing={<Activity size={18} className="quiet-icon" />} /><ol className="activity-list">{data.activity.map(row => <li key={row.event_id}><span className={`activity-symbol ${row.event.event_type === "APPLIED_OUTPUT" ? "tone-good" : "tone-info"}`}>{row.event.event_type === "APPLIED_OUTPUT" ? <Check size={13} /> : row.event.event_type === "ZONE_FORECAST" ? <Clock3 size={13} /> : <Fan size={13} />}</span><div><strong>{activityLabel(row.event)}</strong><span>{time(row.occurred_at, true)}</span></div></li>)}</ol>{!data.activity.length && <p className="empty-inline">No operating events recorded.</p>}</section>
    </div>
    <div className="snapshot-footer"><ShieldCheck size={15} /><span>Committed snapshot</span><time dateTime={data.frame.simulated_at} title={data.frame.simulated_at}>{time(data.frame.simulated_at, true)}</time><span className="snapshot-zone">{data.zone.zone_id}</span></div>
  </div>;
}
function SparkleIcon() { return <Snowflake size={14} />; }
