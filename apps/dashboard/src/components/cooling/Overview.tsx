import { useMemo, useState } from "react";
import { ArrowRight, Clock3, Radio, Snowflake } from "lucide-react";
import type { OverviewData } from "../../types/overview";
import { modeLabels, nodeStatus, number, outputLabel, time } from "../../lib/overviewDisplay";
import { usePredictiveHistory } from "../../hooks/usePredictiveHistory";
import { useUtilizationHistory } from "../../hooks/useUtilizationHistory";
import { calculateUtilization, coverageLabel, durationLabel, modeOrder, utilizationColors, utilizationModeLabels } from "../../lib/utilizationAnalytics";
import { activeLandingForecast, landingMoments, landingSnapshot } from "../../lib/landingMoments";
import { decisionExplanation } from "../../lib/predictiveDisplay";

interface Props {
  data: OverviewData; now: number; refreshToken: string | null;
  onInspectNode: (id: string) => void; onInspectTime: (at: number) => void;
  onAudit: (eventId?: string) => void; onUtilization: () => void; onNodes: () => void;
}
const momentNames = { PRECOOL: "Pre-cooling restart", OCCUPIED: "Occupied cooling", SHORT_VACANCY: "Short-gap reduced", LONG_VACANCY: "Standby" };

export function Overview({ data, now, refreshToken, onInspectNode, onInspectTime, onAudit, onUtilization, onNodes }: Props) {
  const history = usePredictiveHistory(data, 24, refreshToken);
  const utilization = useUtilizationHistory(data, 24, refreshToken);
  const [sequence, setSequence] = useState<number | undefined>();
  const moments = useMemo(() => landingMoments(history.data), [history.data]);
  const snapshot = landingSnapshot(data, history.data, sequence);
  const result = useMemo(() => utilization.end > utilization.start ? calculateUtilization(utilization.data, { start: utilization.start, end: utilization.end, liveAnchor: data.run.live_anchor, staleAfterMs: data.zone.config.payload.freshness.stale_after_ms }) : null, [utilization.data, utilization.start, utilization.end, data.run.live_anchor, data.zone.config.payload.freshness.stale_after_ms]);
  const asOf = snapshot?.historical ? Date.parse(snapshot.frame.simulated_at) : now;
  const plan = activeLandingForecast(snapshot?.forecast ?? null, asOf)?.payload;
  const lead = plan?.next_use_window && plan.planned_restart_at ? Date.parse(plan.next_use_window.start) - Date.parse(plan.planned_restart_at) : null;
  const mode = snapshot?.decision?.payload.requested_mode;
  const linked = snapshot?.decision?.payload.forecast_event_id;
  const support = linked ? history.data.events.find(e => e.event_id === linked && e.event_type === "ZONE_FORECAST") ?? (data.forecast.event_id === linked ? data.forecast : null) : null;
  const latestForecast = activeLandingForecast(data.forecast, now)?.payload;
  return <div className="stage-overview">
    <section className="climate-stage" aria-label="Sense predict actuate pipeline">
      <header className="stage-heading"><h2>Sense. Predict. Actuate.</h2><div className="stage-snapshot"><span className={sequence === undefined ? "stage-live" : "stage-history"}>{sequence === undefined ? "Latest stored snapshot" : "Historical preview"}</span><time title={snapshot?.frame.simulated_at}>{snapshot ? time(snapshot.frame.simulated_at, true) : "Outside retained history"}</time></div></header>
      {!snapshot ? <div className="stage-unavailable" role="status">This moment is outside the retained 24-hour history. <button onClick={() => setSequence(undefined)}>Return to current</button></div> : <div className="pipeline" key={sequence ?? "current"}>
        <section className="pipeline-sense"><div className="pipeline-label"><span>01</span>Sense <Radio size={18} /></div><h3>{data.zone.name}</h3><div className="sense-visual"><img src="/zone-plan.svg" alt="Illustrative shared cooling zone" />{data.zone.config.payload.required_nodes.map(n => <i key={n.node_id} style={{ left: `${16 + n.x * 68}%`, top: `${20 + n.y * 60}%` }} />)}</div><div className="stage-readings"><strong>{number(snapshot.sample?.temperature_c)}<small> °C</small></strong><span>{number(snapshot.sample?.humidity_percent)}% RH</span></div><span className="stage-occupancy">Room {snapshot.frame.occupancy.toLowerCase()}</span></section>
        <section className="pipeline-predict"><div className="pipeline-label"><span>02</span>Predict <Clock3 size={18} /></div><dl><div><dt>Next expected use</dt><dd>{plan?.next_use_window ? time(plan.next_use_window.start, true) : "No active forecast"}</dd></div><div><dt>Planned cooling restart</dt><dd>{plan?.planned_restart_at ? time(plan.planned_restart_at, true) : "Not available"}</dd></div></dl><span className="restart-lead">{lead !== null && lead >= 0 ? `${durationLabel(lead)} before expected use` : "Awaiting a valid restart plan"}</span><small>{plan ? `${plan.source === "BOOKING" ? "Booking timetable" : "Usage history"} · ${plan.quality.toLowerCase()} quality` : "No valid prediction at this timestamp"}</small></section>
        <section className="pipeline-actuate"><div className="pipeline-label"><span>03</span>Actuate <Snowflake size={18} /></div><h3>{mode ? modeLabels[mode] : "No linked decision"}</h3><div className="stage-output"><span>Requested</span><strong>{outputLabel(snapshot.decision?.payload.requested_output ?? null)}</strong><ArrowRight size={20} /><span>Simulated report · {snapshot.output?.payload.status.toLowerCase() ?? "unavailable"}</span><strong>{outputLabel(snapshot.output?.payload.status === "APPLIED" ? snapshot.output.payload.reported_output : null)}</strong></div></section>
      </div>}
      <div className="stage-reason"><span>Why this cooling mode?</span><p>{decisionExplanation(snapshot?.decision ?? null, support?.event_type === "ZONE_FORECAST" ? support : null)}</p>{snapshot?.decision && <button onClick={() => onAudit(snapshot.decision!.event_id)} title="Open exact decision record" aria-label="Open exact decision record"><ArrowRight size={20} /></button>}</div>
    </section>
    <section className="key-moments" aria-label="24 hour key moments"><div><strong>24-hour key moments</strong><span>{history.loading ? "Loading recorded moments…" : "Inspect the cooling loop"}</span></div><div className="moment-buttons"><button aria-pressed={sequence === undefined} onClick={() => setSequence(undefined)}><i className="tiny-dot dot-good" />Current {modeLabels[data.decision.payload.requested_mode].toLowerCase()}<small>{time(data.frame.simulated_at)}</small></button>{moments.map(moment => <button key={moment.mode} disabled={moment.sequence === undefined} aria-pressed={sequence !== undefined && sequence === moment.sequence} title={moment.at ? time(moment.at, true) : "No matching recorded moment in the last 24 hours"} onClick={() => setSequence(moment.sequence)}>{momentNames[moment.mode]}<small>{moment.at ? time(moment.at) : history.loading ? "Loading…" : "Not in range"}</small></button>)}</div></section>
    {history.error && <p className="notice notice-error" role="alert">Key moments: {history.error}</p>}
    <div className="stage-entries">
      <section className="stage-entry node-entry"><div className="entry-heading"><h3><button className="entry-title" onClick={onNodes}>Room & Nodes<ArrowRight size={20} /></button></h3></div><div className="entry-nodes">{data.zone.config.payload.required_nodes.map(expected => { const sample = data.samples.find(s => s.node_id === expected.node_id), status = nodeStatus(sample, data, now); return <button key={expected.node_id} onClick={() => onInspectNode(expected.node_id)}><span className={`tiny-dot dot-${status.tone}`} /><span>{expected.label}<small>{status.label}</small></span><strong>{number(sample?.temperature_c)} °C</strong><ArrowRight size={16} /></button>; })}</div><small>Latest readings · one shared cooling zone</small></section>
      <button className="stage-entry forecast-entry" onClick={() => onInspectTime(Date.parse(snapshot?.frame.simulated_at ?? data.frame.simulated_at))}><div className="entry-heading"><h3>Predictive Cooling</h3><ArrowRight size={20} /></div><div className="entry-plan"><span>Occupied target<strong>{number(data.zone.config.payload.limits.occupied_target_c)} °C</strong></span><div className="plan-sequence"><span><i />{latestForecast?.planned_restart_at ? time(latestForecast.planned_restart_at) : "—"}<small>Restart</small></span><span><i />{latestForecast?.next_use_window ? time(latestForecast.next_use_window.start) : "—"}<small>Expected use</small></span></div></div><small>Latest plan · inspect recorded operation</small></button>
      <button className="stage-entry share-entry" onClick={onUtilization}><div className="entry-heading"><h3>Cooling Statistics <small>24h</small></h3><ArrowRight size={20} /></div>{utilization.error ? <p role="status">Cooling history unavailable</p> : result?.knownMs ? <><div className="regime-share" role="img" aria-label="Share of known requested-mode duration">{modeOrder.map(m => <span key={m} title={`${utilizationModeLabels[m]} ${(result.modeMs[m] / result.knownMs * 100).toFixed(1)}%`} style={{ width: `${result.modeMs[m] / result.knownMs * 100}%`, background: utilizationColors[m] }} />)}</div><div className="regime-labels">{modeOrder.filter(m => result.modeMs[m] > 0).map(m => <span key={m}><i style={{ background: utilizationColors[m] }} />{utilizationModeLabels[m]} <b>{(result.modeMs[m] / result.knownMs * 100).toFixed(1)}%</b></span>)}</div><span className="vacancy-review">{durationLabel(result.normalVacantMs)} normal during vacancy</span><small>{coverageLabel(result.knownMs, result.elapsedMs)} known coverage · requested operation</small></> : <p>{utilization.loading ? "Loading duration records…" : "No continuous operating coverage in range"}</p>}</button>
    </div>
  </div>;
}
