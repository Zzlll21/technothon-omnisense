import { useEffect, useId, useMemo, useReducer, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { OverviewData } from "../../types/overview";
import type { CoolingInspection } from "../../lib/spatialCooling";
import type { UtilizationResult } from "../../lib/utilizationAnalytics";
import { usePredictiveHistory } from "../../hooks/usePredictiveHistory";
import { useUtilizationHistory } from "../../hooks/useUtilizationHistory";
import { useNodeHistory } from "../../hooks/useNodeHistory";
import { calculateUtilization, coverageLabel, durationLabel, modeOrder, preciseDuration } from "../../lib/utilizationAnalytics";
import { forecastStatus } from "../../lib/predictiveDisplay";
import { forecastHorizon, inspectCooling, latestCooling, spatialModeColors, spatialModeNames } from "../../lib/spatialCooling";
import { inspectionReducer, latestInspection } from "../../lib/inspection";
import { number, time } from "../../lib/overviewDisplay";
import { CoolingTimeline } from "./CoolingTimeline";

export function UsageCooling({ data, refreshToken, refreshError, view, onExplore, onOpenRecord }: { data: OverviewData; refreshToken: string | null; refreshError?: string | null; view: "floor" | "room" | "history" | "records"; onExplore: () => void; onOpenRecord?: (id: string, at: number) => void }) {
  const [hours, setHours] = useState<24 | 168>(24), [retry, setRetry] = useState(0), [chartReset, setChartReset] = useState(0);
  const [selection, dispatch] = useReducer(inspectionReducer, latestInspection);
  const [pinnedDetail, setPinnedDetail] = useState<CoolingInspection | null>(null);
  const [timeInput, setTimeInput] = useState("");
  const inspectorContent = useRef<HTMLDivElement>(null), timelineColumn = useRef<HTMLDivElement>(null);
  const token = `${refreshToken}/${retry}`, definitions = data.zone.config.payload.required_nodes;
  const history = usePredictiveHistory(data, hours, token), utilization = useUtilizationHistory(data, hours, token);
  const left = useNodeHistory(data, definitions[0].node_id, hours, token), right = useNodeHistory(data, definitions[1].node_id, hours, token);
  const nodes = useMemo(() => [left.points, right.points], [left.points, right.points]);
  const snapshot = Date.parse(data.frame.simulated_at);
  const start = utilization.start || snapshot - hours * 3600_000, end = utilization.end || snapshot;
  const result = useMemo(() => utilization.end > utilization.start ? calculateUtilization(utilization.data, { start: utilization.start, end: utilization.end, liveAnchor: data.run.live_anchor, staleAfterMs: data.zone.config.payload.freshness.stale_after_ms }) : null, [utilization.data, utilization.start, utilization.end, data.run.live_anchor, data.zone.config.payload.freshness.stale_after_ms]);
  const latest = useMemo(() => latestCooling(data), [data]);
  const detail = selection.pinned && pinnedDetail ? pinnedDetail : selection.at === null ? latest : inspectCooling(history.data, nodes, selection.at, data.run.live_anchor, Math.min(end, snapshot));
  const loading = history.loading || utilization.loading || left.loading || right.loading;
  const errors = [["Cooling history", history.error], ["Duration analysis", utilization.error], [`${definitions[0].label} temperature`, left.error], [`${definitions[1].label} temperature`, right.error]].filter((entry): entry is [string, string] => !!entry[1]);
  function pin(at: number) {
    if (!history.data.frames.length || !Number.isFinite(at)) return;
    setPinnedDetail(inspectCooling(history.data, nodes, at, data.run.live_anchor, Math.min(end, snapshot)));
    dispatch({ type: "pin", at });
    inspectorContent.current?.scrollTo({ top: 0 });
  }
  function clear() { dispatch({ type: "clear" }); setPinnedDetail(null); inspectorContent.current?.scrollTo({ top: 0 }); }
  useEffect(() => { dispatch({ type: "leave" }); }, [view]);
  const compact = view === "room";
  const inspectorHost = useRef<HTMLElement>(null);
  useEffect(() => {
    if (view !== "history") return;
    let frame: number | null = null;
    const measure = () => {
      frame = null;
      const element = inspectorHost.current;
      if (!element) return;
      if (!window.matchMedia("(min-width: 1000px)").matches) { element.style.removeProperty("--su-inspector-height"); return; }
      // Align the inspector with the chart divider, while fitting the visible viewport.
      const available = Math.max(220, window.innerHeight - Math.max(16, element.getBoundingClientRect().top) - 16);
      const timelineHeight = timelineColumn.current?.getBoundingClientRect().height;
      if (timelineHeight) element.style.setProperty("--su-inspector-height", `${Math.min(timelineHeight, Math.floor(available))}px`);
    };
    const schedule = () => { if (frame === null) frame = requestAnimationFrame(measure); };
    measure();
    window.addEventListener("scroll", schedule, { passive: true }); window.addEventListener("resize", schedule);
    const observer = new ResizeObserver(schedule);
    if (timelineColumn.current) observer.observe(timelineColumn.current);
    return () => { window.removeEventListener("scroll", schedule); window.removeEventListener("resize", schedule); observer.disconnect(); if (frame !== null) cancelAnimationFrame(frame); };
  }, [view, loading, refreshError]);
  const recentSpan = Math.max(90 * 60_000, forecastHorizon(latest.forecast, snapshot, end) - snapshot);
  const timeline = (small: boolean) => <CoolingTimeline history={history.data} nodes={nodes} labels={definitions.map(n => n.label)} result={result} start={small ? Math.max(start, snapshot - recentSpan) : start} end={end} anchor={data.run.live_anchor} snapshot={snapshot} inspection={small ? latest : detail} selectedAt={small ? null : selection.at} pinned={small ? false : selection.pinned} compact={small} periodKey={`${hours}/${chartReset}`} onHover={at => { if (!small) dispatch(at === null ? { type: "leave" } : { type: "hover", at }); }} onPin={at => { pin(at); if (small) onExplore(); }} onClear={clear} onRecord={onOpenRecord ? (id, at) => onOpenRecord(id, at) : undefined} />;
  return <section className="su-workspace" hidden={view === "floor" || view === "records"} aria-label={compact ? "Recent usage and cooling" : "Usage and cooling workspace"}>
    {compact ? <div className="su-horizon-heading"><h2>From vacancy to the next use</h2><button onClick={onExplore}>Explore usage &amp; cooling <span aria-hidden="true">↗</span></button></div> : <div className="su-heading"><div><h1 id="su-heading" tabIndex={-1}>Usage &amp; cooling,<br />on the same clock.</h1><p>Follow occupancy, cooling requests and the forecasts behind them.</p></div><div className="su-range" role="group" aria-label="Usage and cooling time range">{([24, 168] as const).map(value => <button key={value} aria-pressed={hours === value} onClick={() => { setHours(value); setChartReset(n => n + 1); }}>{value === 24 ? "24 hours" : "7 days"}</button>)}</div></div>}
    <div className="su-legend" aria-label="Cooling mode legend">{modeOrder.map(mode => <span key={mode}><i style={{ background: spatialModeColors[mode] }} />{spatialModeNames[mode]}</span>)}<span><i className="su-legend-uncertain" />Uncertain occupancy</span><span><i className="su-legend-plan" />Planned / forecast</span><span><i className="su-legend-gap" />Unknown interval</span></div>
    {errors.length > 0 && <div className="sa-notice" role="alert"><strong>Some history could not refresh</strong>{errors.map(([label, error]) => <p key={label}>{label}: {error}</p>)}<p>Available cached records remain visible. Missing records are not filled in.</p><button className="su-text-button" onClick={() => setRetry(n => n + 1)}>Retry history reads</button></div>}
    {loading && <p className="su-load" role="status">{history.data.frames.length ? "Refreshing stored history…" : "Loading stored history and evidence…"}</p>}
    {!loading && !history.data.frames.length && <p className="su-empty" role="status">No recorded history in this range. Unobserved time is unknown, not vacant or zero cooling.</p>}
    <div className={compact ? undefined : "su-analysis-layout"}>
      <div ref={timelineColumn} className="su-timeline-column" aria-busy={loading} data-history-ready={!loading && errors.length === 0 ? "true" : "false"}>{timeline(compact)}</div>
      {!compact && <aside ref={inspectorHost} className="su-context-inspector" aria-label="Historical inspector">
      <div className="su-inspection-toolbar"><div><span className="sa-kicker">{selection.pinned ? "Pinned historical inspection" : selection.at !== null ? "Hover preview · click to pin" : "Latest committed snapshot"}</span><strong><time dateTime={new Date(detail.at).toISOString()}>{new Date(detail.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time></strong></div><button className="su-latest" onClick={clear} disabled={selection.at === null}>Latest snapshot ↗</button></div>
        <div ref={inspectorContent} className="su-inspector-content" role="region" tabIndex={0} aria-label="Inspection summary and evidence">
      {selection.pinned && (detail.at < start || detail.at > end) && <p className="su-selection-note" role="status">Your pinned inspection is retained outside the displayed history range. Change the range or return to the latest snapshot.</p>}
      {refreshError && <p className="su-selection-note">The current snapshot refresh failed. History and the latest snapshot may be cached; see the connection notice above.</p>}
      <CoolingInspectionPanel inspection={detail} labels={definitions.map(n => n.label)} historical={selection.at !== null} onOpenRecord={onOpenRecord ? id => { setPinnedDetail(detail); dispatch({ type: "pin", at: detail.at }); onOpenRecord(id, detail.at); } : undefined} >
        <details className="su-exact-time"><summary>Inspect an exact time</summary>
      <form className="su-time-form" onSubmit={event => { event.preventDefault(); const at = new Date(timeInput).getTime(); if (at >= start && at <= end) pin(at); }}><label htmlFor="su-time-input">Inspect an exact time <small>Browser local time · within the selected range</small></label><input id="su-time-input" type="datetime-local" step="1" value={timeInput} onChange={event => setTimeInput(event.target.value)} required aria-label="Historical timestamp in browser local time" /><button type="submit" disabled={loading || !timeInput || !Number.isFinite(new Date(timeInput).getTime()) || new Date(timeInput).getTime() < start || new Date(timeInput).getTime() > end}>Inspect time</button></form>
        </details>
      </CoolingInspectionPanel>
        </div>
      </aside>}
    </div>
    {!compact && <>
      <CoolingStatistics result={result} loading={utilization.loading} unavailable={!!utilization.error && !utilization.data.frames.length} start={start} end={end} />
    </>}
  </section>;
}

export function CoolingInspectionPanel({ inspection: i, labels, historical, onOpenRecord, children }: { inspection: CoolingInspection; labels: string[]; historical: boolean; onOpenRecord?: (id: string) => void; children?: ReactNode }) {
  const forecast = i.forecast, status = forecastStatus(forecast, i.at), active = status === "ACTIVE";
  const reason = i.decision?.payload.reason_code === "SHORT_GAP" && i.decision.payload.requested_mode === "SHORT_VACANCY"
    ? "Brief vacancy expected. Reduced cooling requested."
    : i.decision?.payload.reason_code === "OCCUPIED_EVIDENCE" && i.decision.payload.occupancy === "OCCUPIED" && i.decision.payload.requested_mode === "OCCUPIED"
      ? "Room occupied. Normal cooling requested."
      : i.decision?.payload.reason_code === "FORECAST_RESTART" && i.decision.payload.requested_mode === "PRECOOL"
        ? "Expected room use is approaching. Pre-cooling requested."
        : i.decision?.payload.reason_code === "LONG_GAP" && i.decision.payload.requested_mode === "LONG_VACANCY"
          ? "Extended vacancy expected. Standby mode requested."
          : i.decision?.payload.reason_text ?? "No linked stored decision is available for this time.";
  const reported = i.output?.payload.reported_output;
  const response = reported
    ? `${reported.fan === "OFF" ? "Fan off" : `${reported.fan.charAt(0)}${reported.fan.slice(1).toLowerCase()} fan`}${reported.setpoint_c === null ? "" : ` · Target ${reported.setpoint_c}°C`}`
    : i.output ? `${i.output.payload.status.toLowerCase()} · No output reported` : "No output report";
  const [expanded, setExpanded] = useState(false), id = useId();
  return <div className="su-inspection" aria-label="Inspected cooling records">
    <dl className="su-inspector-summary">
      <div><dt>Room occupancy</dt><dd>{i.frame ? i.decision?.payload.occupancy.toLowerCase() ?? i.frame.occupancy.toLowerCase() : "Unavailable"}</dd></div>
      <div><dt>Cooling request</dt><dd>{i.decision ? spatialModeNames[i.decision.payload.requested_mode] : "Unavailable"}</dd></div>
      <div><dt>Forecast at this time</dt><dd className="su-gold">{status.toLowerCase()}</dd></div>
    </dl>
    <div className="su-inspection-temps">{labels.map((label, index) => <div key={index}><span>Node {String(index + 1).padStart(2, "0")} · {label}</span><strong>{number(i.temperatures[index]?.value)} °C</strong><small>{i.temperatures[index]?.at ? `${i.temperatures[index].validity.toLowerCase()} evidence` : "No matching sample / evidence"}</small></div>)}</div>
    <p className="su-inspector-provenance">{historical ? "Historical records · as known at this time" : "Latest committed records"}</p>
    <button className="su-inspector-expand" aria-expanded={expanded} aria-controls={`${id}-evidence`} onClick={() => setExpanded(value => !value)}>{expanded ? "Hide details & records" : "Details & records"}<span aria-hidden="true">{expanded ? "−" : "+"}</span></button>
    <div id={`${id}-evidence`} className={`su-inspection-details${expanded ? " is-expanded" : ""}`}>
      <details className="su-evidence-section"><summary>Cooling reasoning &amp; output</summary>
        {i.decision && onOpenRecord && <button className="sr-inline-link" onClick={() => onOpenRecord(i.decision!.event_id)}>Open decision record ↗</button>}<p className="su-stored-reason">Reason: {reason}</p>
        <div className="su-inspection-output"><span>Response</span><strong>{response}</strong>{i.output && onOpenRecord && <button className="sr-inline-link" onClick={() => onOpenRecord(i.output!.event_id)}>Open output record ↗</button>}{i.output && <small><time title={i.output.occurred_at}>{time(i.output.occurred_at, true)}</time>{i.output.payload.reason && i.output.payload.reason !== "Zero-lag scripted acknowledgement; no physical actuation" && ` · ${i.output.payload.reason}`}</small>}</div>
        {i.decision?.payload.requested_mode === "PRECOOL" && <p className="su-muted">{i.supportingForecast ? `Decision cites forecast issued ${time(i.supportingForecast.occurred_at, true)} (${forecastStatus(i.supportingForecast, Date.parse(i.decision.payload.evaluated_at)).toLowerCase()} at decision time).` : "The supporting forecast record is unavailable; no forecast cause is inferred."}</p>}
      </details>
      <details className="su-evidence-section"><summary>Forecast evidence</summary>
        {forecast ? <>{onOpenRecord && <button className="sr-inline-link" onClick={() => onOpenRecord(forecast.event_id)}>Open forecast record ↗</button>}<dl className="su-forecast-facts"><div><dt>{active ? "Expected usage window" : "Stored window · inactive"}</dt><dd>{forecast.payload.next_use_window ? `${time(forecast.payload.next_use_window.start, true)}–${time(forecast.payload.next_use_window.end, true)}` : "Unavailable"}</dd></div><div><dt>{active ? "Planned cooling restart" : "Stored restart · inactive"}</dt><dd>{forecast.payload.planned_restart_at ? time(forecast.payload.planned_restart_at, true) : "Not scheduled"}</dd></div><div><dt>Issued / expires</dt><dd>{time(forecast.occurred_at, true)} / {time(forecast.payload.expires_at, true)}</dd></div></dl>{forecast.payload.status_reason && forecast.payload.status_reason !== "Simulated timetable; not a real booking or trained forecast" && <p className="su-muted">{forecast.payload.status_reason}</p>}</> : <p className="su-muted">No forecast issued by this timestamp is available.</p>}
      </details>
      {children}
    </div>
  </div>;
}

export function CoolingStatistics({ result: r, loading, unavailable, start, end }: { result: UtilizationResult | null; loading: boolean; unavailable: boolean; start: number; end: number }) {
  const known = !!r?.knownMs && !unavailable;
  const durations = r ? [{ label: "Normal cooling", ms: r.modeMs.OCCUPIED, note: "Includes normal during vacancy" }, { label: "Reduced / standby", ms: r.reducedMs, note: `Reduced ${durationLabel(r.modeMs.SHORT_VACANCY)} · standby ${durationLabel(r.modeMs.LONG_VACANCY)}` }, { label: "Pre-cooling", ms: r.modeMs.PRECOOL, note: "Separate requested mode" }, { label: "Normal during vacancy", ms: r.normalVacantMs, note: "A subset of normal, not an extra mode" }] : [];
  return <section className="su-statistics" aria-label="Cooling statistics" aria-busy={loading}>
    <div className="su-section-heading"><div><span className="sa-kicker">Requested operation</span><h2>Cooling requests, in context.</h2></div><p>{time(new Date(start).toISOString(), true)}–{time(new Date(end).toISOString(), true)}</p></div>
    {loading && !r?.knownMs ? <p role="status">Loading timestamp-based duration analysis…</p> : <>
      {!known && <p className="su-empty">{unavailable ? "Duration records unavailable." : "Not enough continuous records to determine cooling duration."} Unknown time is excluded from mode shares.</p>}
      <div className="su-duration-row">{durations.map(d => <div key={d.label}><span>{d.label}</span><strong title={known ? preciseDuration(d.ms) : undefined}>{known ? durationLabel(d.ms) : "Unavailable"}</strong><small>{d.note}</small></div>)}</div>
      <div className="su-statistics-bottom"><section className="su-overlap"><h3>Occupancy × cooling request</h3><p className="su-table-hint">Swipe the table for all four cooling modes.</p><div className="su-table-scroll"><table><caption className="su-sr-only">Elapsed duration for each recorded occupancy and requested mode</caption><thead><tr><th scope="col">Recorded state</th>{modeOrder.map(m => <th scope="col" key={m}><i style={{ background: spatialModeColors[m] }} />{spatialModeNames[m]}</th>)}</tr></thead><tbody>{(["OCCUPIED", "VACANT", "UNCERTAIN"] as const).map(o => <tr key={o}><th scope="row">{o.charAt(0) + o.slice(1).toLowerCase()}</th>{modeOrder.map(m => <td key={m} className={o === "VACANT" && m === "OCCUPIED" ? "su-review-cell" : ""} title={known ? preciseDuration(r!.overlap[o][m]) : undefined}>{known ? durationLabel(r!.overlap[o][m]) : "—"}</td>)}</tr>)}</tbody></table></div></section><section className="su-coverage"><h3>Data coverage</h3><strong>{r && !unavailable ? coverageLabel(r.knownMs, r.elapsedMs) : "Unavailable"}</strong><div className="su-coverage-track" aria-hidden="true"><i style={{ width: `${r && !unavailable && r.elapsedMs ? r.knownMs / r.elapsedMs * 100 : 0}%` }} /></div><p>{r && !unavailable ? `${durationLabel(r.knownMs)} known · ${durationLabel(r.missingMs)} unknown` : "No duration totals are inferred."}</p><p className="su-muted">Timestamp differences determine duration. Missing intervals and the live tail remain unknown.</p></section></div>
    </>}
  </section>;
}
