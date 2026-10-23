import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { TimelineGuide } from "./TimelineGuide";
import type { PredictiveHistory } from "../../api/predictiveHistory";
import type { NodeHistoryPoint } from "../../api/nodeHistory";
import type { UtilizationResult } from "../../lib/utilizationAnalytics";
import type { CoolingInspection } from "../../lib/spatialCooling";
import { coolingLanes, forecastHorizon, issuedWindows, significantDecisions, spatialModeColors, spatialModeNames, spatialOccupancyColors } from "../../lib/spatialCooling";
import { chartScale, numericSegments } from "../../lib/nodeHistoryDisplay";
import { forecastStatus } from "../../lib/predictiveDisplay";
import { time } from "../../lib/overviewDisplay";
import { useTimelineViewport } from "../../hooks/useTimelineViewport";
import { minimumTimelineSpan, visibleTimeSegments } from "../../lib/timelineViewport";

interface Props {
  history: PredictiveHistory; nodes: NodeHistoryPoint[][]; labels: string[]; result: UtilizationResult | null;
  start: number; end: number; anchor: string; snapshot: number; inspection: CoolingInspection;
  selectedAt: number | null; pinned: boolean; compact?: boolean; periodKey?: string;
  onHover: (at: number | null) => void; onPin: (at: number) => void; onClear: () => void; onRecord?: (id: string, at: number) => void;
}
const iso = (at: number) => new Date(at).toISOString();
const nodeColors = ["#315f50", "#a78232"];

export function CoolingTimeline({ history, nodes, labels, result, start: dataStart, end, anchor, snapshot, inspection, selectedAt, pinned, compact = false, periodKey = "", onHover, onPin, onClear, onRecord }: Props) {
  const host = useRef<HTMLDivElement>(null), svg = useRef<SVGSVGElement>(null), [width, setWidth] = useState(1100);
  const id = useId().replace(/:/g, "");
  useEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver(([entry]) => {
      // Hidden workspace views have no layout. Retain the last usable measurement.
      if (entry.contentRect.width > 0) setWidth(Math.max(compact ? 920 : 260, Math.round(entry.contentRect.width)));
    });
    observer.observe(host.current); return () => observer.disconnect();
  }, [compact]);
  const latestForecast = useMemo(() => [...history.events].reverse().find(e => e.event_type === "ZONE_FORECAST" && Date.parse(e.occurred_at) <= snapshot) ?? null, [history.events, snapshot]);
  // Hover and pin never change the scale underneath the pointer.
  const boundsEnd = forecastHorizon(latestForecast?.event_type === "ZONE_FORECAST" ? latestForecast : null, snapshot, end);
  const left = !compact && width < 600 ? 108 : 128, right = width - (!compact && width < 600 ? 12 : 22), height = compact ? 196 : 350;
  const viewport = useTimelineViewport({ bounds: { start: dataStart, end: boundsEnd }, periodKey, enabled: !compact, svg, width, left, right, onNavigate: () => onHover(null) });
  const { start, end: domainEnd } = viewport.window;
  const x = (at: number) => left + (at - start) / Math.max(1, domainEnd - start) * (right - left);
  const clamp = (at: number) => Math.max(start, Math.min(domainEnd, at));
  const lanes = useMemo(() => coolingLanes(result?.segments ?? []), [result]);
  const storedSeries = useMemo(() => nodes.map(points => numericSegments(points.filter(p => Date.parse(p.observed_at) >= dataStart && Date.parse(p.observed_at) <= Math.min(snapshot, end)), anchor, "temperature_c")), [nodes, dataStart, end, snapshot, anchor]);
  const series = useMemo(() => storedSeries.map(segments => visibleTimeSegments(segments, start, Math.min(snapshot, end, domainEnd))), [storedSeries, start, end, snapshot, domainEnd]);
  const scale = useMemo(() => {
    const values = series.flat(2).map(p => p.temperature_c);
    return chartScale(values.length ? values : [20, 30]);
  }, [series]);
  const y = (v: number | null) => v === null ? Number.NaN : 132 - (v - scale.min) / (scale.max - scale.min) * 80;
  // Keep thousands of temperature coordinates out of the hover render path.
  const temperaturePaths = useMemo(() => series.map(segments => segments.map(segment => ({
    single: segment.length === 1, x: x(Date.parse(segment[0].observed_at)), y: y(segment[0].temperature_c),
    d: segment.map((p, j) => `${j ? "L" : "M"}${x(Date.parse(p.observed_at)).toFixed(2)},${y(p.temperature_c).toFixed(2)}`).join(" ")
  }))), [series, scale, width, start, domainEnd]);
  const occY = compact ? 55 : 182, modeY = compact ? 111 : 258;
  const windows = useMemo(() => issuedWindows(history, Math.min(inspection.at, snapshot), start, domainEnd), [history, inspection.at, snapshot, start, domainEnd]);
  // A hover must not remove the marker beneath the pointer before its click arrives.
  // Explicit historical pins still hide forecasts issued after the inspected time.
  const forecastIssueCutoff = pinned ? Math.min(inspection.at, snapshot) : snapshot;
  const forecastIssues = useMemo(() => history.events.filter(e => e.event_type === "ZONE_FORECAST" && Date.parse(e.occurred_at) >= start && Date.parse(e.occurred_at) <= Math.min(forecastIssueCutoff, domainEnd)), [history.events, forecastIssueCutoff, start, domainEnd]);
  const decisions = useMemo(() => significantDecisions(history).filter(e => Date.parse(e.occurred_at) >= start && Date.parse(e.occurred_at) <= Math.min(snapshot, domainEnd)), [history, start, snapshot, domainEnd]);
  const reports = useMemo(() => history.events.filter(e => e.event_type === "APPLIED_OUTPUT" && Date.parse(e.occurred_at) >= start && Date.parse(e.occurred_at) <= Math.min(snapshot, domainEnd)), [history.events, start, snapshot, domainEnd]);
  const tickCount = !compact && width < 600 ? 3 : !compact && width < 1100 ? 4 : 6;
  const ticks = Array.from({ length: tickCount }, (_, i) => start + (domainEnd - start) * i / (tickCount - 1));
  const currentPlan = inspection.forecast, activePlan = currentPlan && forecastStatus(currentPlan, Math.min(inspection.at, snapshot)) === "ACTIVE" ? currentPlan : null;
  const futureWindow = activePlan?.payload.next_use_window;
  const restart = activePlan?.payload.planned_restart_at ? Date.parse(activePlan.payload.planned_restart_at) : null;
  const scrollKey = `${compact}/${periodKey}`;
  const initializedScroll = useRef("");
  useEffect(() => {
    const element = host.current;
    if (!element || !history.frames.length || element.clientWidth >= width || initializedScroll.current === scrollKey) return;
    // Reveal the recent record on phones, once per view/range, never on a poll.
    element.scrollLeft = Math.max(0, x(snapshot) - element.clientWidth * .65);
    initializedScroll.current = scrollKey;
  }, [width, scrollKey, history.frames.length]);
  useEffect(() => {
    const element = host.current;
    if (!element || !pinned || selectedAt === null || selectedAt < start || selectedAt > domainEnd || element.clientWidth >= width) return;
    const point = x(selectedAt);
    if (point < element.scrollLeft + left || point > element.scrollLeft + element.clientWidth - 25) element.scrollLeft = Math.max(0, point - element.clientWidth / 2);
  }, [pinned, selectedAt, scrollKey, width]);
  function pointerAt(event: PointerEvent<SVGSVGElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    return clamp(start + ((event.clientX - box.left) / box.width * width - left) / (right - left) * (domainEnd - start));
  }
  function keydown(event: KeyboardEvent<SVGSVGElement>) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "Escape") { event.preventDefault(); onClear(); return; }
    if (!compact) {
      if (["+", "=", "-", "0"].includes(event.key)) { event.preventDefault(); if (event.key === "0") viewport.reset(); else viewport.zoom(event.key === "-" ? 1.4 : 1 / 1.4); return; }
      if (event.shiftKey && ["ArrowLeft", "ArrowRight"].includes(event.key)) { event.preventDefault(); viewport.pan(event.key === "ArrowLeft" ? -.2 : .2); return; }
    }
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const frames = history.frames.filter(f => Date.parse(f.simulated_at) >= start && Date.parse(f.simulated_at) <= Math.min(end, snapshot, domainEnd));
    if (!frames.length) return;
    const at = selectedAt ?? snapshot;
    const candidate = event.key === "Home" ? frames[0] : event.key === "End" ? frames.at(-1)! : event.key === "ArrowLeft" ? [...frames].reverse().find(f => Date.parse(f.simulated_at) < at) ?? frames[0] : frames.find(f => Date.parse(f.simulated_at) > at) ?? frames.at(-1)!;
    onPin(Date.parse(candidate.simulated_at));
  }
  function band(items: typeof lanes.modes | typeof lanes.occupancy, top: number, cooling: boolean) {
    return items.filter(b => b.end > start && b.start < Math.min(end, snapshot, domainEnd)).map((b, i) => {
      const a = x(Math.max(start, b.start)), bX = x(Math.min(b.end, end, snapshot, domainEnd)), label = cooling ? spatialModeNames[b.value as keyof typeof spatialModeNames] : b.value.charAt(0) + b.value.slice(1).toLowerCase();
      return <g key={i}><title>{label} · {time(iso(b.start), true)}–{time(iso(b.end), true)}</title><rect x={a} y={top} width={Math.max(0, bX - a)} height="28" fill={cooling ? spatialModeColors[b.value as keyof typeof spatialModeColors] : spatialOccupancyColors[b.value as keyof typeof spatialOccupancyColors]} />{bX - a > (compact ? 140 : 115) && <text x={a + 10} y={top + 19} fill={b.value === "OCCUPIED" ? "#fff" : "#183e35"}>{label}{compact ? cooling ? " · requested" : " · recorded" : ""}</text>}</g>;
    });
  }
  return <div className={`su-chart ${compact ? "su-chart-compact" : "su-chart-interactive"}${viewport.dragging ? " su-chart-panning" : ""}`}>
    {!compact && <div className="su-chart-navigation">
      <div><span>Visible timeline</span><strong><time dateTime={iso(start)}>{time(iso(start), true)}</time>–<time dateTime={iso(domainEnd)}>{time(iso(domainEnd), true)}</time></strong><small>Statistics below cover the full selected period.</small></div>
      <div role="group" aria-label="Timeline navigation">
        <button aria-label="Earlier timeline" title="Move earlier · Shift + left arrow" disabled={start <= dataStart + 1} onClick={() => viewport.pan(-.2)}>←</button>
        <button aria-label="Zoom out timeline" title="Zoom out · minus" disabled={domainEnd - start >= boundsEnd - dataStart - 1} onClick={() => viewport.zoom(1.4)}>−</button>
        <button aria-label="Zoom in timeline" title="Zoom in · plus" disabled={domainEnd - start <= Math.min(minimumTimelineSpan, boundsEnd - dataStart) + 1} onClick={() => viewport.zoom(1 / 1.4)}>+</button>
        <button aria-label="Later timeline" title="Move later · Shift + right arrow" disabled={domainEnd >= boundsEnd - 1} onClick={() => viewport.pan(.2)}>→</button>
        <button className="su-fit-period" disabled={!viewport.customized} onClick={() => viewport.reset()} title="Fit selected period · 0">Fit period</button>
      </div>
    </div>}
    {!compact && <div className="su-node-legend">{labels.map((label, n) => <span key={n}><i style={{ background: nodeColors[n] }} />Node {String(n + 1).padStart(2, "0")} · {label}</span>)}</div>}
    <div className="su-chart-scroll" ref={host}>
      <div className="su-track-labels" aria-hidden="true" style={{ height }}>
        {!compact && <><span style={{ top: 12 }}>Temperature · °C</span>{scale.ticks.filter((_, i) => i % Math.max(1, Math.ceil(scale.ticks.length / 4)) === 0).map(tick => <small key={tick} style={{ top: y(tick) - 9 }}>{tick.toFixed(1)}°</small>)}</>}
        <span style={{ top: occY + 6 }}>{compact ? "Occupancy" : "Room occupancy"}</span><span style={{ top: modeY + 6 }}>{compact ? "Cooling request" : "Cooling operation"}</span>
      </div>
      <svg ref={svg} className="su-timeline" data-visible-start={iso(start)} data-visible-end={iso(domainEnd)} data-custom-window={viewport.customized} width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="application" tabIndex={0}
        aria-label={`${compact ? "Recent occupancy and cooling" : "Both node temperatures, zone occupancy, cooling requests, simulated output, forecasts and decisions"}. Shared elapsed-time axis. ${compact ? "" : "Scroll to zoom, drag to pan, plus and minus zoom, Shift with left and right arrows pans, zero fits the selected period. "}Left and right arrows inspect records. Home and End select first and last record. Escape returns to latest.`}
        onKeyDown={keydown} onPointerDown={viewport.pointerDown} onPointerUp={viewport.pointerUp} onPointerCancel={viewport.cancel} onLostPointerCapture={viewport.cancel} onClickCapture={viewport.clickCapture}
        onPointerMove={event => { if (viewport.pointerMove(event)) return; if (event.pointerType === "mouse" && !pinned) onHover(pointerAt(event)); }} onPointerLeave={() => onHover(null)} onBlur={() => onHover(null)}
        onClick={event => { const box = event.currentTarget.getBoundingClientRect(); onPin(clamp(start + ((event.clientX - box.left) / box.width * width - left) / (right - left) * (domainEnd - start))); }}>
        <title>Recorded conditions and cooling requests, with stored forecasts shown as expectations</title>
        <defs><pattern id={`${id}-gap`} width="7" height="7" patternUnits="userSpaceOnUse"><path d="M0 7 7 0" stroke="#ced6c7" strokeWidth="1" /></pattern><pattern id={`${id}-plan`} width="7" height="7" patternUnits="userSpaceOnUse"><path d="M0 7 7 0" stroke="#b79b5e" strokeWidth="1" /></pattern><clipPath id={`${id}-clip`}><rect x={left} y="35" width={right - left} height={height - 67} /></clipPath></defs>
        {domainEnd > snapshot && <rect x={x(clamp(snapshot))} y="35" width={right - x(clamp(snapshot))} height={height - 67} fill="#eee9da" opacity=".45" />}
        {ticks.map((tick, i) => <g key={tick}><line x1={x(tick)} x2={x(tick)} y1="35" y2={height - 34} stroke="#dde3d7" /><text x={x(tick)} y={compact ? 23 : height - 14} textAnchor={i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle"} className="su-axis">{!compact && width < 600 && domainEnd - start > 48 * 3600_000 ? new Date(tick).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : time(iso(tick), !compact && width >= 600)}</text></g>)}
        {!compact && <>
          <text x="0" y="25">Temperature · °C</text>
          {scale.ticks.filter((_, i) => i % Math.max(1, Math.ceil(scale.ticks.length / 4)) === 0).map(tick => <g key={tick}><text x={left - 12} y={y(tick) + 4} textAnchor="end" className="su-axis">{tick.toFixed(1)}°</text><line x1={left} x2={right} y1={y(tick)} y2={y(tick)} stroke="#dce2d7" strokeDasharray="3 4" /></g>)}
          <g clipPath={`url(#${id}-clip)`}>{temperaturePaths.map((paths, n) => <g key={n} stroke={nodeColors[n]} fill="none" strokeWidth="2">{paths.map((path, i) => path.single ? <circle key={i} cx={path.x} cy={path.y} r="2" fill={nodeColors[n]} /> : <path key={i} d={path.d} />)}</g>)}</g>
          {!series.some(s => s.length) && <text x={left + 20} y="97" className="su-axis">No valid temperature evidence in this interval</text>}
          <g className="su-inline-node-legend" aria-hidden="true">{labels.map((label, n) => <g key={n}><line x1={left + n * 240} x2={left + 18 + n * 240} y1="20" y2="20" stroke={nodeColors[n]} strokeWidth="2" /><text x={left + 25 + n * 240} y="25">Node {String(n + 1).padStart(2, "0")} · {label}</text></g>)}</g>
        </>}
        {!compact && right - x(clamp(snapshot)) > 165 && <text x={x(clamp(snapshot)) + 8} y="156" fill="#8c6c27">{width <= 1000 ? "Forecast only" : "Future · expectations only"}</text>}
        <text x="0" y={occY + 19} className="su-row-label">{compact ? "Occupancy" : "Room occupancy"}</text>
        <text x="0" y={modeY + (!compact && width < 600 ? 11 : 19)} className="su-row-label">{compact ? "Cooling request" : width < 600 ? <><tspan x="0">Cooling</tspan><tspan x="0" dy="16">operation</tspan></> : "Cooling operation"}</text>
        {[occY, modeY].map(top => <rect key={top} x={left} y={top} width={right - left} height="28" fill={`url(#${id}-gap)`} />)}
        {band(lanes.occupancy, occY, false)}{band(lanes.modes, modeY, true)}
        {futureWindow && Date.parse(futureWindow.end) > Math.max(snapshot, start) && Date.parse(futureWindow.start) < domainEnd && <g><title>Expected use · {time(futureWindow.start, true)}–{time(futureWindow.end, true)} · {activePlan?.payload.source} source · {activePlan?.payload.quality} quality</title><rect x={x(clamp(Math.max(snapshot, Date.parse(futureWindow.start))))} y={occY} width={Math.max(0, x(clamp(Date.parse(futureWindow.end))) - x(clamp(Math.max(snapshot, Date.parse(futureWindow.start)))))} height="28" fill="#eee7d3" stroke="#a78232" strokeDasharray="4 3" /><text x={Math.min(right, x(clamp(Math.max(snapshot, Date.parse(futureWindow.start)))))} textAnchor={right - x(clamp(Date.parse(futureWindow.start))) < 120 ? "end" : "start"} y={compact ? occY - 8 : occY + 53} fill="#8c6c27">Expected use</text></g>}
        {!compact && <g clipPath={`url(#${id}-clip)`}>
          {/* Forecast diamonds sit at issue time; the thin hatched strips sit at expected-use time. */}
          {windows.map(f => <g key={f.event_id} className="su-forecast-window"><title>Expected usage as issued {time(f.occurred_at, true)} · {f.payload.source} / {f.payload.quality} · {time(f.payload.next_use_window!.start, true)}–{time(f.payload.next_use_window!.end, true)}. May be superseded; not recorded occupancy.</title><rect x={x(clamp(Date.parse(f.payload.next_use_window!.start)))} y={occY + 32} width={Math.max(0, x(clamp(Date.parse(f.payload.next_use_window!.end))) - x(clamp(Date.parse(f.payload.next_use_window!.start))))} height="6" fill={`url(#${id}-plan)`} stroke="#b79b5e" opacity=".75" />{f.payload.planned_restart_at && Date.parse(f.payload.planned_restart_at) >= start && Date.parse(f.payload.planned_restart_at) <= domainEnd && <path d={`M${x(Date.parse(f.payload.planned_restart_at))} ${modeY}v28`} stroke="#a78232" strokeDasharray="2 3"><title>Restart planned by forecast issued {time(f.occurred_at, true)} · {time(f.payload.planned_restart_at, true)}. May be superseded; not an applied output.</title></path>}</g>)}
          {forecastIssues.map(e => <g key={e.event_id} className="su-forecast-marker" data-event-id={e.event_id} role="button" tabIndex={-1} aria-label={`Open forecast issued ${time(e.occurred_at, true)}`} onClick={event => { event.stopPropagation(); onPin(Date.parse(e.occurred_at)); onRecord?.(e.event_id, Date.parse(e.occurred_at)); }} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); onPin(Date.parse(e.occurred_at)); onRecord?.(e.event_id, Date.parse(e.occurred_at)); } }}><title>Forecast issued {time(e.occurred_at, true)} · {e.event_type === "ZONE_FORECAST" ? `${e.payload.source} / ${e.payload.quality} · ${e.payload.status.toLowerCase()}` : ""}. Select to open this exact forecast.</title><rect x={x(Date.parse(e.occurred_at)) - 10} y={occY - 23} width="20" height="22" fill="transparent" /><path d={`M${x(Date.parse(e.occurred_at))} ${occY - 17}l5 5-5 5-5-5Z`} fill="#fafbf6" stroke="#a78232" strokeWidth="1.5" /></g>)}
          {/* Decisions attach above the request band; output reports attach below it. */}
          {(["APPLIED", "ACCEPTED", "REJECTED", "FAILED"] as const).filter(status => reports.some(e => e.event_type === "APPLIED_OUTPUT" && e.payload.status === status)).map(status => <g key={status} className="su-output-markers" role="button" tabIndex={-1} aria-label={`${status.toLowerCase()} simulated output reports`} onClick={event => {
            event.stopPropagation();
            const box = event.currentTarget.ownerSVGElement!.getBoundingClientRect();
            const at = start + ((event.clientX - box.left) / box.width * width - left) / (right - left) * (domainEnd - start);
            const nearest = reports.filter(e => e.event_type === "APPLIED_OUTPUT" && e.payload.status === status).reduce<(typeof reports)[number] | null>((best, e) => !best || Math.abs(Date.parse(e.occurred_at) - at) < Math.abs(Date.parse(best.occurred_at) - at) ? e : best, null);
            if (nearest) { onPin(Date.parse(nearest.occurred_at)); onRecord?.(nearest.event_id, Date.parse(nearest.occurred_at)); }
          }}><title>{status.toLowerCase()} simulated output reports · select a tick to open its exact record</title><path d={reports.filter(e => e.event_type === "APPLIED_OUTPUT" && e.payload.status === status).map(e => `M${x(Date.parse(e.occurred_at)).toFixed(2)} ${modeY + 39}v12`).join(" ")} stroke="transparent" strokeWidth="18" fill="none" /><path d={reports.filter(e => e.event_type === "APPLIED_OUTPUT" && e.payload.status === status).map(e => `M${x(Date.parse(e.occurred_at)).toFixed(2)} ${modeY + 39}v12`).join(" ")} stroke={status === "APPLIED" ? "#315f50" : status === "ACCEPTED" ? "#839878" : "#a46142"} strokeWidth="3" fill="none" /></g>)}
          {decisions.map((e, index) => {
            const cx = x(Date.parse(e.occurred_at));
            // Keep adjacent hit targets separate when several decisions are only minutes apart.
            const hitLeft = Math.max(left, cx - 11, index ? (cx + x(Date.parse(decisions[index - 1].occurred_at))) / 2 : left);
            const hitRight = Math.min(right, cx + 11, index < decisions.length - 1 ? (cx + x(Date.parse(decisions[index + 1].occurred_at))) / 2 : right);
            return <g key={e.event_id} className="su-decision-marker" data-event-id={e.event_id} role="button" tabIndex={-1} aria-label={`Inspect decision ${time(e.occurred_at, true)} · ${spatialModeNames[e.payload.requested_mode]}`} onClick={event => { event.stopPropagation(); onPin(Date.parse(e.occurred_at)); onRecord?.(e.event_id, Date.parse(e.occurred_at)); }} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); onPin(Date.parse(e.occurred_at)); onRecord?.(e.event_id, Date.parse(e.occurred_at)); } }}><title>{time(e.occurred_at, true)} · {e.payload.reason_text}</title><rect x={hitLeft} y={modeY - 23} width={Math.max(0, hitRight - hitLeft)} height="22" fill="transparent" /><circle pointerEvents="none" cx={cx} cy={modeY - 12} r="4.5" fill={spatialModeColors[e.payload.requested_mode]} stroke="#f3f5ef" strokeWidth="1" /></g>;
          })}
        </g>}
        {snapshot >= start && snapshot <= domainEnd && <><line pointerEvents="none" x1={x(snapshot)} x2={x(snapshot)} y1="35" y2={compact ? 148 : height - 34} stroke="#557767" strokeDasharray="3 4" />{compact && <text x={x(snapshot)} y="178" textAnchor="end" className="su-axis">Snapshot {time(iso(snapshot))}</text>}</>}
        {restart !== null && restart >= start && restart <= domainEnd && <g><line x1={x(restart)} x2={x(restart)} y1={modeY - 8} y2={modeY + 37} stroke="#a78232" strokeWidth="1.5" />{compact && <text x={right - x(restart) < 140 ? x(restart) : x(restart) + 5} textAnchor={right - x(restart) < 140 ? "end" : "start"} y="178" fill="#8c6c27">Restart {time(iso(restart))}</text>}<title>Planned restart {time(iso(restart), true)}. A stored plan, not an applied output.</title></g>}
        {selectedAt !== null && selectedAt >= start && selectedAt <= domainEnd && <line pointerEvents="none" x1={x(selectedAt)} x2={x(selectedAt)} y1="35" y2={height - 34} stroke="#183e35" strokeWidth={pinned ? 2 : 1} strokeDasharray={pinned ? undefined : "3 3"} />}
      </svg>
    </div>
    {compact ? <>
      <ul className="su-timeline-guide" aria-label="How to read the timeline">
        <li><i className="su-guide-solid" aria-hidden="true" /><span><strong>Solid bars</strong> show recorded activity.</span></li>
        <li><i className="su-guide-dashed" aria-hidden="true" /><span><strong>Dashed outlines</strong> show expected use.</span></li>
        <li><i className="su-guide-restart" aria-hidden="true" /><span><strong>The gold line</strong> marks the planned restart.</span></li>
        <li><i className="su-guide-unknown" aria-hidden="true" /><span><strong>Shaded areas</strong> have no recorded outcome yet.</span></li>
      </ul>
      <p className="su-chart-help su-compact-swipe"><span>Swipe to explore the timeline.</span></p>
    </> : <TimelineGuide />}
  </div>;
}
