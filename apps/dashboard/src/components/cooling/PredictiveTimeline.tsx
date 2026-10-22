import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import type { ZoneForecast } from "../../../../../packages/sdp-contract/src";
import type { PredictiveHistory } from "../../api/predictiveHistory";
import { coolingColors, occupancyColors, decisionEvents, forecastAt, forecastStatus, frameAt, frameRecords, temperatureSegments, timelineBands } from "../../lib/predictiveDisplay";
import { chartScale } from "../../lib/nodeHistoryDisplay";
import { modeLabels, number, time } from "../../lib/overviewDisplay";

interface Props {
  history: PredictiveHistory; start: number; end: number; anchor: string; target: number;
  selectedAt: number | null; pinned: boolean; onSelect: (at: number | null) => void; onPin: (at: number) => void;
}
export function PredictiveTimeline({ history, start, end, anchor, target, selectedAt, pinned, onSelect, onPin }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  const asOf = Math.min(selectedAt ?? end, end);
  const forecasts = useMemo(() => history.events.filter((e): e is ZoneForecast => e.event_type === "ZONE_FORECAST"), [history.events]);
  const domainEnd = useMemo(() => {
    const current = forecastAt(forecasts, end);
    return current && forecastStatus(current, end) === "ACTIVE" ? Math.max(end, Math.min(end + 86400_000, Date.parse(current.payload.next_use_window?.end ?? "") || end)) : end;
  }, [forecasts, end]);
  useEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver(() => {
      setWidth(host.current?.clientWidth ?? 900);
    });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  const plot = useMemo(() => {
    const left = width < 550 ? 44 : 60, right = width - 20;
    const x = (at: number) => left + (at - start) / (domainEnd - start) * (right - left);
    const values = history.samples.map(s => s.temperature_c);
    const scale = chartScale(values.length ? [...values, target] : [target]);
    const y = (value: number | null) => value === null ? Number.NaN : 126 - (value - scale.min) / (scale.max - scale.min) * 80;
    const paths = temperatureSegments(history, anchor).map(segment => ({ segment, d: segment.map((s, i) => `${i ? "L" : "M"}${x(Date.parse(s.observed_at)).toFixed(2)},${y(s.temperature_c).toFixed(2)}`).join(" ") }));
    return { left, right, x, y, scale, paths, bands: timelineBands(history, anchor, end) };
  }, [history, anchor, start, end, domainEnd, width, target]);
  const changes = useMemo(() => decisionEvents(history).filter(e => Date.parse(e.occurred_at) >= start), [history, start]);
  const eventMap = useMemo(() => new Map(history.events.map(e => [e.event_id, e])), [history.events]);
  const sampleMap = useMemo(() => new Map(history.samples.map(s => [s.sequence, s])), [history.samples]);
  const inspectedFrame = selectedAt === null ? null : frameAt(history.frames, selectedAt, anchor, end);
  const inspectedDecision = frameRecords(inspectedFrame, eventMap).decision;
  const inspectedSample = inspectedFrame ? sampleMap.get(inspectedFrame.sequence) : undefined;
  const plans = forecasts.filter(f => f.payload.next_use_window && Date.parse(f.occurred_at) <= asOf && Date.parse(f.payload.next_use_window.end) >= start && Date.parse(f.payload.next_use_window.start) <= domainEnd);
  const tickCount = width < 550 ? 2 : width < 800 ? 3 : 5;
  const ticks = Array.from({ length: tickCount }, (_, i) => start + (domainEnd - start) * i / (tickCount - 1));
  const x = plot.x;
  function pointerAt(e: PointerEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const at = start + ((e.clientX - box.left) / box.width * width - plot.left) / (plot.right - plot.left) * (domainEnd - start);
    return Math.max(start, Math.min(domainEnd, at));
  }
  function keydown(e: KeyboardEvent<SVGSVGElement>) {
    if (e.key === "Escape") { onSelect(null); return; }
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key) || !history.frames.length) return;
    e.preventDefault();
    const index = history.frames.findIndex(f => Date.parse(f.simulated_at) >= (selectedAt ?? end));
    const current = index < 0 ? history.frames.length - 1 : index;
    const next = e.key === "Home" ? 0 : e.key === "End" ? history.frames.length - 1 : Math.max(0, Math.min(history.frames.length - 1, current + (e.key === "ArrowRight" ? 1 : -1)));
    onPin(Date.parse(history.frames[next].simulated_at));
  }
  return <div className="predictive-chart">
    <div className="predictive-scroll"><div ref={host} className="predictive-canvas">
      <svg width="100%" height="430" viewBox={`0 0 ${width} 430`} tabIndex={0} role="application" aria-label="Synchronized cooling timeline. Arrow keys inspect frames; Escape returns to latest."
        onKeyDown={keydown} onPointerMove={e => { if (!pinned && e.pointerType === "mouse") onSelect(pointerAt(e)); }} onPointerLeave={() => { if (!pinned) onSelect(null); }}
        onPointerDown={e => onPin(pointerAt(e))} onBlur={() => { if (!pinned) onSelect(null); }}>
        <title>Room temperature, zone occupancy, requested cooling and forecasts on a shared timestamp axis</title>
        {domainEnd > end && <><rect x={x(end)} y="24" width={x(domainEnd) - x(end)} height="358" fill="#e0f2fe" /><text x={plot.right} y={width < 550 ? 36 : 16} textAnchor="end" className="timeline-label">Forecast horizon</text></>}
        {ticks.map(tick => <line key={tick} x1={x(tick)} x2={x(tick)} y1="28" y2="382" className="history-grid" />)}
        <text x={plot.left} y="19" className="timeline-track-title">Room temperature · °C</text>
        {plot.scale.ticks.map(tick => <g key={tick}><line x1={plot.left} x2={plot.right} y1={plot.y(tick)} y2={plot.y(tick)} className="history-grid" /><text x={plot.left - 12} y={plot.y(tick) + 4} textAnchor="end" className="history-tick">{tick.toFixed(1)}</text></g>)}
        <line x1={plot.left} x2={plot.right} y1={plot.y(target)} y2={plot.y(target)} className="temperature-target" />
        {plot.paths.map(({ d, segment }, i) => segment.length > 1 ? <path key={i} d={d} className="history-line plot-temperature_c" /> : <circle key={i} cx={x(Date.parse(segment[0].observed_at))} cy={plot.y(segment[0].temperature_c)} r="3" className="plot-dot plot-temperature_c" />)}
        {!history.samples.length && <text x={(plot.left + plot.right) / 2} y="115" textAnchor="middle" className="timeline-label">No reference-sensor samples</text>}
        <text x={plot.left} y="158" className="timeline-track-title">Recorded zone occupancy</text>
        <rect x={plot.left} y="170" width={plot.right - plot.left} height="32" fill="#f0f3f2" />
        {plot.bands.occupancy.map((b, i) => <rect key={i} x={x(b.start)} y="170" width={Math.max(0, x(b.end) - x(b.start))} height="32" fill={occupancyColors[b.value]} />)}
        <text x={plot.left} y="226" className="timeline-track-title">Requested cooling mode</text>
        <rect x={plot.left} y="238" width={plot.right - plot.left} height="40" fill="#f0f3f2" />
        {plot.bands.modes.map((b, i) => <g key={i}><rect x={x(b.start)} y="238" width={Math.max(0, x(b.end) - x(b.start))} height="40" fill={coolingColors[b.value]} />{x(b.end) - x(b.start) > 145 && <text x={(x(b.start) + x(b.end)) / 2} y="262" textAnchor="middle" className={`mode-band-label mode-label-${b.value}`}>{modeLabels[b.value]}</text>}</g>)}
        <text x={plot.left} y="302" className="timeline-track-title">Forecast windows · as issued</text>
        {plans.map(f => {
          const window = f.payload.next_use_window!;
          const startX = x(Math.max(start, Date.parse(window.start))), endX = x(Math.min(domainEnd, Date.parse(window.end)));
          const restart = f.payload.planned_restart_at ? Date.parse(f.payload.planned_restart_at) : null;
          return <g key={f.event_id} className="forecast-projection"><rect x={startX} y="315" width={Math.max(1, endX - startX)} height="24" /><line x1={startX} x2={startX} y1="308" y2="342" />{restart !== null && restart >= start && restart <= domainEnd && <><line x1={x(restart)} x2={x(restart)} y1="308" y2="342" className="restart-marker" /><path d={`M${x(restart) - 4},310 L${x(restart)},304 L${x(restart) + 4},310 Z`} className="restart-arrow" /></>}</g>;
        })}
        <text x={plot.left} y="365" className="timeline-track-title">Decision events</text>
        {changes.map(d => <circle key={d.event_id} cx={x(Date.parse(d.occurred_at))} cy="377" r="3" fill={coolingColors[d.payload.requested_mode]} />)}
        {selectedAt !== null && <line x1={x(selectedAt)} x2={x(selectedAt)} y1="26" y2="385" className="history-crosshair" />}
        {ticks.map((tick, i) => <text key={tick} x={x(tick)} y="410" textAnchor={i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle"} className="history-tick">{time(new Date(tick).toISOString(), true)}</text>)}
      </svg>
    </div></div>
    {selectedAt !== null && <div className="timeline-tooltip" role="status"><time title={new Date(selectedAt).toISOString()}>{time(new Date(selectedAt).toISOString(), true)}</time><div><span>Zone occupancy</span><strong>{inspectedFrame?.occupancy.toLowerCase() ?? "No frame"}</strong></div><div><span>Requested mode</span><strong>{inspectedDecision ? modeLabels[inspectedDecision.payload.requested_mode] : "Unavailable"}</strong></div><div><span>Temperature</span><strong>{number(inspectedSample?.temperature_c)} °C</strong></div>{inspectedFrame && <small title={inspectedFrame.simulated_at}>Frame recorded {time(inspectedFrame.simulated_at)}</small>}</div>}
    <div className="predictive-legends"><div><span className="legend-heading">Cooling</span>{Object.entries(coolingColors).map(([key, color]) => <span key={key}><i style={{ background: color }} />{modeLabels[key as keyof typeof modeLabels]}</span>)}</div><div><span className="legend-heading">Occupancy</span>{Object.entries(occupancyColors).map(([key, color]) => <span key={key}><i style={{ background: color }} />{key.charAt(0) + key.slice(1).toLowerCase()}</span>)}<span><i className="legend-gap" />No frame</span><span><i className="legend-forecast" />Predicted use</span><span><i className="legend-restart" />Planned restart</span><span>Target {target.toFixed(1)} °C (setting)</span></div></div>
  </div>;
}
