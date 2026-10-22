import { useMemo, useReducer, useState } from "react";
import { ArrowRight, Clock3, RefreshCw, Snowflake } from "lucide-react";
import type { OverviewData } from "../../types/overview";
import { usePredictiveHistory } from "../../hooks/usePredictiveHistory";
import { decisionExplanation, forecastAt, forecastStatus, frameAt, frameRecords, reportedLabel } from "../../lib/predictiveDisplay";
import { modeLabels, modeTones, number, outputLabel, time } from "../../lib/overviewDisplay";
import { Badge } from "./ProductShell";
import { PredictiveTimeline } from "./PredictiveTimeline";
import { inspectionReducer, latestInspection } from "../../lib/inspection";
import { durationLabel } from "../../lib/utilizationAnalytics";

export function PredictiveCooling({ data, now, refreshToken, initialInspection, onAudit, onPinChange, embedded = false }: { data: OverviewData; now: number; refreshToken: string | null; initialInspection?: number; onAudit?: (eventId: string) => void; onPinChange?: (at: number | null) => void; embedded?: boolean }) {
  const [hours, setHours] = useState<24 | 168>(initialInspection !== undefined && initialInspection < Date.now() - 24 * 3600_000 ? 168 : 24);
  const [inspection, inspect] = useReducer(inspectionReducer, initialInspection === undefined ? latestInspection : { at: initialInspection, pinned: true });
  const selectedAt = inspection.at;
  function setSelectedAt(at: number | null) {
    if (at === null && inspection.pinned) onPinChange?.(null);
    inspect(at === null ? { type: "clear" } : { type: "hover", at });
  }
  function pin(at: number) { inspect({ type: "pin", at }); onPinChange?.(at); }
  const [retry, setRetry] = useState(0);
  const state = usePredictiveHistory(data, hours, `${refreshToken}/${retry}`);
  const events = useMemo(() => new Map(state.data.events.map(e => [e.event_id, e])), [state.data.events]);
  const samples = useMemo(() => new Map(state.data.samples.map(s => [s.sequence, s])), [state.data.samples]);
  const selected = selectedAt !== null;
  const asOf = selected ? Math.min(selectedAt, state.end) : now;
  const frame = selected ? frameAt(state.data.frames, selectedAt, data.run.live_anchor, state.end) : data.frame;
  const records = selected ? frameRecords(frame, events) : { decision: data.decision, output: data.output };
  const decision = records.decision, output = records.output;
  const forecast = selected ? forecastAt(state.data.events, asOf) : data.forecast;
  const forecastState = forecastStatus(forecast, asOf);
  const linked = decision?.payload.forecast_event_id ? events.get(decision.payload.forecast_event_id) : null;
  const support = selected ? linked?.event_type === "ZONE_FORECAST" ? linked : null : data.forecast.event_id === decision?.payload.forecast_event_id ? data.forecast : null;
  const referenceId = data.zone.config.payload.representative_environment_node_id;
  const referenceName = data.nodes.find(n => n.node_id === referenceId)?.label ?? referenceId;
  const sample = selected ? frame ? samples.get(frame.sequence) : undefined : data.samples.find(s => s.node_id === referenceId);
  const mode = decision?.payload.requested_mode;
  const prediction = forecast?.payload;
  const restartLead = prediction?.next_use_window && prediction.planned_restart_at ? Date.parse(prediction.next_use_window.start) - Date.parse(prediction.planned_restart_at) : NaN;
  const projected = selected && selectedAt > state.end;
  return <div className={`predictive-page ${embedded ? "embedded-prediction" : ""}`}>
    <div className="prediction-summary">
      <div><span className="eyebrow">{selected ? "Forecast known at inspection time" : "Next expected room use"}</span><div className="prediction-next"><Clock3 size={22} /><strong>{prediction?.next_use_window ? time(prediction.next_use_window.start, true) : "Not available"}</strong><Badge tone={forecastState === "ACTIVE" ? "info" : forecastState === "EXPIRED" ? "attention" : "neutral"}>{forecastState.toLowerCase()}</Badge></div><small className="forecast-origin">{prediction ? `${prediction.source === "BOOKING" ? "Booking timetable" : prediction.source === "HISTORY" ? "Usage history" : "Source unavailable"} · ${prediction.quality.toLowerCase()} quality · simulated` : "Forecast unavailable"}</small><p>{forecastState === "ACTIVE" ? "Predicted arrival window, separate from detected occupancy." : forecastState === "EXPIRED" ? "This forecast has expired. No active arrival estimate." : forecastState === "CANCELLED" ? "The forecast was cancelled. No active arrival estimate." : "No usable next-use prediction is available."}</p></div>
      <div className="prediction-restart"><Snowflake size={21} /><div><span>Planned cooling restart</span><strong>{prediction?.planned_restart_at ? time(prediction.planned_restart_at, true) : "Not available"}</strong><small>{forecastState !== "ACTIVE" ? "Archived plan / not active" : Number.isFinite(restartLead) && restartLead >= 0 ? restartLead === 0 ? "At expected use" : `${durationLabel(restartLead)} before expected use` : "Stored restart plan"}</small></div></div>
    </div>
    <div className="prediction-workbench"><section className="predictive-history" aria-label="Predictive cooling timeline">
      <div className="section-heading"><div><span className="eyebrow">{data.zone.name} · {data.zone.zone_id}</span><h2>Cooling in context</h2></div><div className="history-range" role="group" aria-label="Predictive history range">{([24, 168] as const).map(value => <button key={value} aria-pressed={hours === value} onClick={() => { setSelectedAt(null); setHours(value); }}>{value === 24 ? "24 hours" : "7 days"}</button>)}</div></div>
      <div className="history-context"><span>{referenceName} temperature reference · {Intl.DateTimeFormat().resolvedOptions().timeZone}</span><span>{state.loading ? "Loading history…" : `${state.data.frames.length.toLocaleString()} committed frames`}</span></div>
      {state.error && <div className="notice notice-error" role="alert"><div><strong>Predictive history unavailable</strong><p>{state.error}{state.data.frames.length ? " Previous records remain visible." : ""}</p></div><button className="text-action" onClick={() => setRetry(n => n + 1)}><RefreshCw size={16} />Retry</button></div>}
      {state.loading && !state.data.frames.length ? <div className="history-empty" aria-busy="true" role="status"><RefreshCw size={24} className="spinning" /><p>Loading cooling history</p></div> : state.data.frames.length ? <PredictiveTimeline key={hours} history={state.data} start={state.start} end={state.end} anchor={data.run.live_anchor} target={data.zone.config.payload.limits.occupied_target_c} selectedAt={selectedAt} pinned={inspection.pinned} onSelect={setSelectedAt} onPin={pin} /> : !state.error ? <div className="history-empty"><Clock3 size={25} /><h3>No committed frames in this range</h3><p>Select a longer range or check the generator connection.</p></div> : null}
    </section>
    <section className="predictive-inspection" aria-label="Cooling inspection" aria-live="polite" data-historical={selected}>
      <div className="inspection-heading"><div><span className="eyebrow">{selected ? projected ? "Forecast period · no observations" : inspection.pinned ? "Pinned historical inspection" : "Historical inspection" : "Latest committed snapshot"}</span><h2><time title={new Date(selectedAt ?? Date.parse(data.frame.simulated_at)).toISOString()}>{time(new Date(selectedAt ?? Date.parse(data.frame.simulated_at)).toISOString(), true)}</time></h2></div>{selected && <button className="text-action" onClick={() => setSelectedAt(null)}>Latest snapshot <ArrowRight size={16} /></button>}</div>
      <div className="inspection-values"><div><span>Zone occupancy</span><strong>{frame ? frame.occupancy.charAt(0) + frame.occupancy.slice(1).toLowerCase() : "No frame"}</strong></div><div><span>Requested cooling</span><strong>{mode ? modeLabels[mode] : "Unavailable"}</strong></div><div><span>Reference temperature</span><strong>{number(sample?.temperature_c)} °C</strong></div><div><span>Simulated report</span><strong>{output ? output.payload.status.charAt(0) + output.payload.status.slice(1).toLowerCase() : "Unavailable"}</strong></div></div>
      <div className="prediction-detail-grid">
        <div className="decision-explanation"><div className="section-heading"><h3>Why this cooling mode?</h3>{mode && <Badge tone={modeTones[mode]}>{modeLabels[mode]}</Badge>}</div><p>{decisionExplanation(decision, support)}</p>{decision && <span className="decision-reference">Decision at <time title={decision.payload.evaluated_at}>{time(decision.payload.evaluated_at, true)}</time> · {decision.payload.reason_code.replaceAll("_", " ").toLowerCase()}</span>}<div className="prediction-output"><div><span>Requested</span><strong>{outputLabel(decision?.payload.requested_output ?? null)}</strong>{decision && <small title={decision.payload.evaluated_at}>{time(decision.payload.evaluated_at, true)}</small>}</div><ArrowRight size={16} /><div><span>{reportedLabel(output)}</span><strong>{outputLabel(output?.payload.status === "APPLIED" ? output.payload.reported_output : null)}</strong>{output && <small title={output.occurred_at}>{time(output.occurred_at, true)}</small>}</div></div></div>
        <details className="forecast-inspection"><summary>Forecast context <span>{prediction ? `${prediction.source === "BOOKING" ? "Booking" : prediction.source === "HISTORY" ? "History" : "Unavailable"} · ${prediction.quality.toLowerCase()}` : "Unavailable"}</span></summary><dl><div><dt>Expected use window</dt><dd>{prediction?.next_use_window ? <><time title={prediction.next_use_window.start}>{time(prediction.next_use_window.start, true)}</time><span> to </span><time title={prediction.next_use_window.end}>{time(prediction.next_use_window.end, true)}</time></> : "Unavailable"}</dd></div><div><dt>Source / quality</dt><dd>{prediction ? `${prediction.source === "BOOKING" ? "Booking timetable" : prediction.source === "HISTORY" ? "Usage history" : "Unavailable"} / ${prediction.quality.toLowerCase()}` : "Unavailable"}</dd></div><div><dt>Issued</dt><dd title={forecast?.occurred_at}>{time(forecast?.occurred_at, true)}</dd></div><div><dt>Expires</dt><dd title={prediction?.expires_at}>{time(prediction?.expires_at, true)}</dd></div></dl>{prediction?.status_reason && forecastState !== "ACTIVE" && <p>{prediction.status_reason}</p>}<small>{selected ? "Forecast status is evaluated at the inspection time. Later updates are excluded." : "Future windows are forecasts, not confirmed occupancy."}</small></details>
      </div>
      {onAudit && decision && <button className="text-action audit-link" onClick={() => onAudit(decision.event_id)}>Open decision record <ArrowRight size={16} /></button>}
    </section></div>
    {!embedded && <p className="history-footnote">Forecast windows are archived plans as issued by the inspection time. Gaps are unobserved periods; requested modes are separate from simulated output reports.</p>}
  </div>;
}
