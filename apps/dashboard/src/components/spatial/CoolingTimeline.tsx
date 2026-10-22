import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import type { PredictiveHistory } from "../../api/predictiveHistory";
import type { NodeHistoryPoint } from "../../api/nodeHistory";
import type { UtilizationResult } from "../../lib/utilizationAnalytics";
import type { CoolingInspection } from "../../lib/spatialCooling";
import { coolingLanes, forecastHorizon, issuedWindows, significantDecisions, spatialModeColors, spatialModeNames, spatialOccupancyColors } from "../../lib/spatialCooling";
import { chartScale, numericSegments } from "../../lib/nodeHistoryDisplay";
import { forecastStatus } from "../../lib/predictiveDisplay";
import { time } from "../../lib/overviewDisplay";

interface Props {
  history: PredictiveHistory; nodes: NodeHistoryPoint[][]; labels: string[]; result: UtilizationResult | null;
  start: number; end: number; anchor: string; snapshot: number; inspection: CoolingInspection;
  selectedAt: number | null; pinned: boolean; compact?: boolean;
  onHover: (at: number | null) => void; onPin: (at: number) => void; onClear: () => void; onRecord?: (id: string, at: number) => void;
}
const iso = (at: number) => new Date(at).toISOString();
const nodeColors = ["#315f50", "#a78232"];

export function CoolingTimeline({ history, nodes, labels, result, start, end, anchor, snapshot, inspection, selectedAt, pinned, compact = false, onHover, onPin, onClear, onRecord }: Props) {
  const host = useRef<HTMLDivElement>(null), [width, setWidth] = useState(1100);
  const id = useId().replace(/:/g, "");
  useEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver(([entry]) => {
      // Hidden workspace views have no layout. Retain the last usable measurement.
      if (entry.contentRect.width > 0) setWidth(Math.max(920, Math.round(entry.contentRect.width)));
    });
    observer.observe(host.current); return () => observer.disconnect();
  }, []);
  const latestForecast = useMemo(() => [...history.events].reverse().find(e => e.event_type === "ZONE_FORECAST" && Date.parse(e.occurred_at) <= snapshot) ?? null, [history.events, snapshot]);
  // Hover and pin never change the scale underneath the pointer.
  const domainEnd = forecastHorizon(latestForecast?.event_type === "ZONE_FORECAST" ? latestForecast : null, snapshot, end);
  const left = 128, right = width - 22, height = compact ? 196 : 470;
  const x = (at: number) => left + (at - start) / Math.max(1, domainEnd - start) * (right - left);
  const clamp = (at: number) => Math.max(start, Math.min(domainEnd, at));
  const lanes = useMemo(() => coolingLanes(result?.segments ?? []), [result]);
  const series = useMemo(() => nodes.map(points => numericSegments(points.filter(p => Date.parse(p.observed_at) >= start && Date.parse(p.observed_at) <= Math.min(snapshot, end)), anchor, "temperature_c")), [nodes, start, end, snapshot, anchor]);
  const scale = useMemo(() => {
    const values = series.flat(2).map(p => p.temperature_c);
    return chartScale(values.length ? values : [20, 30]);
  }, [series]);
  const y = (v: number) => 132 - (v - scale.min) / (scale.max - scale.min) * 80;
  // Keep thousands of temperature coordinates out of the hover render path.
  const temperaturePaths = useMemo(() => series.map(segments => segments.map(segment => ({
    single: segment.length === 1, x: x(Date.parse(segment[0].observed_at)), y: y(segment[0].temperature_c),
    d: segment.map((p, j) => `${j ? "L" : "M"}${x(Date.parse(p.observed_at)).toFixed(2)},${y(p.temperature_c).toFixed(2)}`).join(" ")
  }))), [series, scale, width, start, domainEnd]);
  const occY = compact ? 55 : 182, modeY = compact ? 111 : 237;
  const windows = useMemo(() => issuedWindows(history, Math.min(inspection.at, snapshot), start, domainEnd), [history, inspection.at, snapshot, start, domainEnd]);
  const decisions = useMemo(() => significantDecisions(history).filter(e => Date.parse(e.occurred_at) >= start && Date.parse(e.occurred_at) <= snapshot), [history, start, snapshot]);
  const reports = useMemo(() => history.events.filter(e => e.event_type === "APPLIED_OUTPUT" && Date.parse(e.occurred_at) >= start && Date.parse(e.occurred_at) <= snapshot), [history.events, start, snapshot]);
  const tickCount = !compact && width < 1100 ? 4 : 6;
  const ticks = Array.from({ length: tickCount }, (_, i) => start + (domainEnd - start) * i / (tickCount - 1));
  const currentPlan = inspection.forecast, activePlan = currentPlan && forecastStatus(currentPlan, Math.min(inspection.at, snapshot)) === "ACTIVE" ? currentPlan : null;
  const futureWindow = activePlan?.payload.next_use_window;
  const restart = activePlan?.payload.planned_restart_at ? Date.parse(activePlan.payload.planned_restart_at) : null;
  const scrollKey = `${compact}/${Math.round((end - start) / 3600_000)}`;
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
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const frames = history.frames.filter(f => Date.parse(f.simulated_at) >= start && Date.parse(f.simulated_at) <= Math.min(end, snapshot));
    if (!frames.length) return;
    const at = selectedAt ?? snapshot;
    const candidate = event.key === "Home" ? frames[0] : event.key === "End" ? frames.at(-1)! : event.key === "ArrowLeft" ? [...frames].reverse().find(f => Date.parse(f.simulated_at) < at) ?? frames[0] : frames.find(f => Date.parse(f.simulated_at) > at) ?? frames.at(-1)!;
    onPin(Date.parse(candidate.simulated_at));
  }
  function band(items: typeof lanes.modes | typeof lanes.occupancy, top: number, cooling: boolean) {
    return items.filter(b => b.end > start && b.start < Math.min(end, snapshot)).map((b, i) => {
      const a = x(Math.max(start, b.start)), bX = x(Math.min(b.end, end, snapshot)), label = cooling ? spatialModeNames[b.value as keyof typeof spatialModeNames] : b.value.charAt(0) + b.value.slice(1).toLowerCase();
      return <g key={i}><title>{label} · {time(iso(b.start), true)}–{time(iso(b.end), true)}</title><rect x={a} y={top} width={Math.max(0, bX - a)} height="28" fill={cooling ? spatialModeColors[b.value as keyof typeof spatialModeColors] : spatialOccupancyColors[b.value as keyof typeof spatialOccupancyColors]} />{bX - a > (compact ? 140 : 115) && <text x={a + 10} y={top + 19} fill={b.value === "OCCUPIED" ? "#fff" : "#183e35"}>{label}{compact ? cooling ? " · requested" : " · recorded" : ""}</text>}</g>;
    });
  }
  return <div className={`su-chart ${compact ? "su-chart-compact" : ""}`}>
    {!compact && <div className="su-node-legend">{labels.map((label, n) => <span key={n}><i style={{ background: nodeColors[n] }} />Node {String(n + 1).padStart(2, "0")} · {label}</span>)}</div>}
    <div className="su-chart-scroll" ref={host}>
      <div className="su-track-labels" aria-hidden="true" style={{ height }}>
        {!compact && <><span style={{ top: 12 }}>Temperature · °C</span>{scale.ticks.filter((_, i) => i % Math.max(1, Math.ceil(scale.ticks.length / 4)) === 0).map(tick => <small key={tick} style={{ top: y(tick) - 9 }}>{tick.toFixed(1)}°</small>)}</>}
        <span style={{ top: occY + 6 }}>Occupancy</span><span style={{ top: modeY + 6 }}>Cooling request</span>
        {!compact && <><span style={{ top: 294 }}>Sim. reported</span><span style={{ top: 342 }}>Forecasts as issued</span><span style={{ top: 392 }}>Key decisions</span></>}
      </div>
      <svg className="su-timeline" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="application" tabIndex={0}
        aria-label={`${compact ? "Recent occupancy and cooling" : "Both node temperatures, zone occupancy, cooling requests, simulated output, forecasts and decisions"}. Shared elapsed-time axis. Left and right arrows inspect records. Home and End select first and last record. Escape returns to latest.`}
        onKeyDown={keydown} onPointerMove={event => { if (event.pointerType === "mouse" && !pinned) onHover(pointerAt(event)); }} onPointerLeave={() => onHover(null)} onBlur={() => onHover(null)}
        onClick={event => { const box = event.currentTarget.getBoundingClientRect(); onPin(clamp(start + ((event.clientX - box.left) / box.width * width - left) / (right - left) * (domainEnd - start))); }}>
        <title>Recorded conditions and cooling requests, with stored forecasts shown as expectations</title>
        <defs><pattern id={`${id}-gap`} width="7" height="7" patternUnits="userSpaceOnUse"><path d="M0 7 7 0" stroke="#ced6c7" strokeWidth="1" /></pattern><pattern id={`${id}-plan`} width="7" height="7" patternUnits="userSpaceOnUse"><path d="M0 7 7 0" stroke="#b79b5e" strokeWidth="1" /></pattern><clipPath id={`${id}-clip`}><rect x={left} y="35" width={right - left} height={height - 67} /></clipPath></defs>
        {domainEnd > snapshot && <rect x={x(clamp(snapshot))} y="35" width={right - x(clamp(snapshot))} height={height - 67} fill="#eee9da" opacity=".45" />}
        {ticks.map((tick, i) => <g key={tick}><line x1={x(tick)} x2={x(tick)} y1="35" y2={height - 34} stroke="#dde3d7" /><text x={x(tick)} y={compact ? 23 : 456} textAnchor={i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle"} className="su-axis">{time(iso(tick), !compact)}</text></g>)}
        {!compact && <>
          <text x="0" y="25">Temperature · °C</text>
          {scale.ticks.filter((_, i) => i % Math.max(1, Math.ceil(scale.ticks.length / 4)) === 0).map(tick => <g key={tick}><text x={left - 12} y={y(tick) + 4} textAnchor="end" className="su-axis">{tick.toFixed(1)}°</text><line x1={left} x2={right} y1={y(tick)} y2={y(tick)} stroke="#dce2d7" strokeDasharray="3 4" /></g>)}
          <g clipPath={`url(#${id}-clip)`}>{temperaturePaths.map((paths, n) => <g key={n} stroke={nodeColors[n]} fill="none" strokeWidth="2">{paths.map((path, i) => path.single ? <circle key={i} cx={path.x} cy={path.y} r="2" fill={nodeColors[n]} /> : <path key={i} d={path.d} />)}</g>)}</g>
          {!series.some(s => s.length) && <text x={left + 20} y="97" className="su-axis">No valid temperature evidence in this interval</text>}
          <g className="su-inline-node-legend" aria-hidden="true">{labels.map((label, n) => <g key={n}><line x1={left + n * 240} x2={left + 18 + n * 240} y1="20" y2="20" stroke={nodeColors[n]} strokeWidth="2" /><text x={left + 25 + n * 240} y="25">Node {String(n + 1).padStart(2, "0")} · {label}</text></g>)}</g>
        </>}
        {!compact && right - x(clamp(snapshot)) > 165 && <text x={x(clamp(snapshot)) + 8} y="156" fill="#8c6c27">{width <= 1000 ? "Forecast only" : "Future · expectations only"}</text>}
        <text x="0" y={occY + 19}>Occupancy</text><text x="0" y={modeY + 19}>Cooling request</text>
        {[occY, modeY].map(top => <rect key={top} x={left} y={top} width={right - left} height="28" fill={`url(#${id}-gap)`} />)}
        {band(lanes.occupancy, occY, false)}{band(lanes.modes, modeY, true)}
        {futureWindow && Date.parse(futureWindow.end) > snapshot && <g><title>Expected use · {time(futureWindow.start, true)}–{time(futureWindow.end, true)} · {activePlan?.payload.source} source · {activePlan?.payload.quality} quality</title><rect x={x(clamp(Math.max(snapshot, Date.parse(futureWindow.start))))} y={occY} width={Math.max(0, x(clamp(Date.parse(futureWindow.end))) - x(clamp(Math.max(snapshot, Date.parse(futureWindow.start)))))} height="28" fill="#eee7d3" stroke="#a78232" strokeDasharray="4 3" /><text x={Math.min(right, x(clamp(Math.max(snapshot, Date.parse(futureWindow.start)))))} textAnchor={right - x(clamp(Date.parse(futureWindow.start))) < 120 ? "end" : "start"} y={occY - 8} fill="#8c6c27">Expected use</text></g>}
        {!compact && <>
          <text x="0" y="307">Sim. reported</text><line x1={left} x2={right} y1="302" y2="302" stroke="#d4ddd2" />
          {(["APPLIED", "ACCEPTED", "REJECTED", "FAILED"] as const).map(status => <path key={status} d={reports.filter(e => e.event_type === "APPLIED_OUTPUT" && e.payload.status === status).map(e => `M${x(Date.parse(e.occurred_at)).toFixed(2)} 295v14`).join(" ")} stroke={status === "APPLIED" ? "#315f50" : status === "ACCEPTED" ? "#839878" : "#a46142"} strokeWidth="3" onClick={event => {
            event.stopPropagation();
            const box = event.currentTarget.ownerSVGElement!.getBoundingClientRect();
            const at = start + ((event.clientX - box.left) / box.width * width - left) / (right - left) * (domainEnd - start);
            const nearest = reports.filter(e => e.event_type === "APPLIED_OUTPUT" && e.payload.status === status).reduce<(typeof reports)[number] | null>((best, e) => !best || Math.abs(Date.parse(e.occurred_at) - at) < Math.abs(Date.parse(best.occurred_at) - at) ? e : best, null);
            if (nearest) { onPin(Date.parse(nearest.occurred_at)); onRecord?.(nearest.event_id, Date.parse(nearest.occurred_at)); }
          }}><title>{status.toLowerCase()} simulated output events · select a marker to inspect its exact timestamp</title></path>)}
          <text x="0" y="355">Forecasts as issued</text><line x1={left} x2={right} y1="350" y2="350" stroke="#d4ddd2" />
          {windows.map(f => <g key={f.event_id}><title>Forecast issued {time(f.occurred_at, true)} · {f.payload.source} / {f.payload.quality} · window {time(f.payload.next_use_window!.start, true)}–{time(f.payload.next_use_window!.end, true)}. May be superseded; inspect a time for its known forecast.</title><rect x={x(clamp(Date.parse(f.payload.next_use_window!.start)))} y="339" width={Math.max(0, x(clamp(Date.parse(f.payload.next_use_window!.end))) - x(clamp(Date.parse(f.payload.next_use_window!.start))))} height="22" fill={`url(#${id}-plan)`} stroke="#b79b5e" opacity=".55" />{f.payload.planned_restart_at && Date.parse(f.payload.planned_restart_at) >= start && Date.parse(f.payload.planned_restart_at) <= domainEnd && <path d={`M${x(Date.parse(f.payload.planned_restart_at))} 334v32`} stroke="#a78232" />}</g>)}
          <text x="0" y="405">Key decisions</text><line x1={left} x2={right} y1="400" y2="400" stroke="#d4ddd2" />
          {decisions.map(e => <circle key={e.event_id} role="button" tabIndex={-1} aria-label={`Inspect decision ${time(e.occurred_at, true)} · ${spatialModeNames[e.payload.requested_mode]}`} cx={x(Date.parse(e.occurred_at))} cy="400" r="4.5" fill={spatialModeColors[e.payload.requested_mode]} onClick={event => { event.stopPropagation(); onPin(Date.parse(e.occurred_at)); onRecord?.(e.event_id, Date.parse(e.occurred_at)); }} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); onPin(Date.parse(e.occurred_at)); onRecord?.(e.event_id, Date.parse(e.occurred_at)); } }}><title>{time(e.occurred_at, true)} · {e.payload.reason_text}</title></circle>)}
        </>}
        {snapshot >= start && snapshot <= domainEnd && <><line x1={x(snapshot)} x2={x(snapshot)} y1="35" y2={compact ? 148 : 427} stroke="#557767" strokeDasharray="3 4" />{compact && <text x={x(snapshot)} y="178" textAnchor="end" className="su-axis">Snapshot {time(iso(snapshot))}</text>}</>}
        {restart !== null && restart >= start && restart <= domainEnd && <g><line x1={x(restart)} x2={x(restart)} y1={modeY - 8} y2={modeY + 37} stroke="#a78232" strokeWidth="1.5" />{compact && <text x={right - x(restart) < 140 ? x(restart) : x(restart) + 5} textAnchor={right - x(restart) < 140 ? "end" : "start"} y="178" fill="#8c6c27">Restart {time(iso(restart))}</text>}<title>Planned restart {time(iso(restart), true)}. A stored plan, not an applied output.</title></g>}
        {selectedAt !== null && selectedAt >= start && selectedAt <= domainEnd && <line x1={x(selectedAt)} x2={x(selectedAt)} y1="35" y2={height - 34} stroke="#183e35" strokeWidth={pinned ? 2 : 1} strokeDasharray={pinned ? undefined : "3 3"} />}
      </svg>
    </div>
    <p className="su-chart-help">{compact ? "Solid = recorded · dashed = expected use · gold marker = planned restart. No future cooling mode is assumed." : "Hover to preview · click / tap or use ← → to pin · Escape returns to latest. Hatched gaps are unknown; forecast windows show expectations as issued. Decision and report markers open their exact record."}<span>Swipe to explore the timeline.</span></p>
  </div>;
}
