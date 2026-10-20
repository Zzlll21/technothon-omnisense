import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import type { NodeHistoryPoint } from "../../api/nodeHistory";
import { chartScale, classification, classColors, classLabels, nearestPoint, numericSegments, occupancySpans } from "../../lib/nodeHistoryDisplay";
import { number, time } from "../../lib/overviewDisplay";

interface Props { points: NodeHistoryPoint[]; start: number; end: number; anchor: string }
export function NodeHistoryCharts(props: Props) {
  return <div className="node-charts">
    <HistoryPlot {...props} metric="temperature_c" title="Temperature" unit="°C" />
    <HistoryPlot {...props} metric="humidity_percent" title="Humidity" unit="%" />
    <HistoryPlot {...props} metric="classification" title="Occupancy classification" unit="" />
  </div>;
}

function HistoryPlot({ points, start, end, anchor, metric, title, unit }: Props & { metric: "temperature_c" | "humidity_percent" | "classification"; title: string; unit: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(500);
  const [activeAt, setActiveAt] = useState<number | null>(null);
  const [pinned, setPinned] = useState(false);
  const categorical = metric === "classification";
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => setWidth(Math.max(240, entries[0].contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const geometry = useMemo(() => {
    const left = categorical ? 8 : 48, right = width - 10;
    const x = (at: number) => left + (at - start) / Math.max(1, end - start) * (right - left);
    if (categorical) return { left, right, x, scale: null, paths: [], spans: occupancySpans(points, anchor, end) };
    const segments = numericSegments(points, anchor, metric);
    const scale = chartScale(points.map(p => p[metric]));
    const y = (v: number) => 162 - (v - scale.min) / (scale.max - scale.min) * 138;
    return { left, right, x, y, scale, spans: [], paths: segments.map(segment => ({ points: segment, d: segment.map((p, i) => `${i ? "L" : "M"}${x(Date.parse(p.observed_at)).toFixed(2)},${y(p[metric]).toFixed(2)}`).join(" ") })) };
  }, [points, start, end, anchor, metric, categorical, width]);
  const activeIndex = activeAt === null ? -1 : nearestPoint(points, activeAt);
  const selected = activeIndex >= 0 ? points[activeIndex] : null;
  const selectedClass = selected ? classification(selected.evidence) : null;
  const latest = points.at(-1);
  const classText = (point: NodeHistoryPoint) => { const kind = classification(point.evidence); return kind ? classLabels[kind] : "Unavailable"; };
  const valueText = (point: NodeHistoryPoint) => categorical ? classText(point) : `${number(point[metric])}${unit === "%" ? "" : " "}${unit}`;
  function pointAt(event: PointerEvent<SVGSVGElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width * width;
    return start + Math.max(0, Math.min(1, (x - geometry.left) / (geometry.right - geometry.left))) * (end - start);
  }
  function keyboard(event: KeyboardEvent<SVGSVGElement>) {
    if (event.key === "Escape") { setActiveAt(null); setPinned(false); return; }
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? points.length - 1 : Math.max(0, Math.min(points.length - 1, (activeIndex < 0 ? points.length - 1 : activeIndex) + (event.key === "ArrowRight" ? 1 : -1)));
    setActiveAt(Date.parse(points[next].observed_at)); setPinned(true);
  }
  return <article className={`history-plot ${categorical ? "history-occupancy" : ""}`} aria-label={`${title} history`}>
    <header><div><h3>{title}</h3><span>Latest in range</span></div><strong>{latest ? valueText(latest) : "Unavailable"}</strong></header>
    <div ref={host} className="history-canvas">
      <svg width="100%" height={categorical ? 90 : 186} viewBox={`0 0 ${width} ${categorical ? 90 : 186}`} role="application" aria-label={`${title} chart. Arrow keys inspect samples; Escape clears selection.`} tabIndex={0}
        onFocus={() => { if (activeAt === null && latest) setActiveAt(Date.parse(latest.observed_at)); }} onKeyDown={keyboard}
        onPointerMove={event => { if (!pinned && event.pointerType === "mouse") setActiveAt(pointAt(event)); }}
        onPointerLeave={() => { if (!pinned) setActiveAt(null); }}
        onPointerDown={event => { setActiveAt(pointAt(event)); setPinned(true); }} onBlur={() => { setActiveAt(null); setPinned(false); }}>
        <title>{title} over stored observation time</title>
        {geometry.scale && geometry.scale.ticks.map(tick => {
          const y = geometry.y!(tick);
          return <g key={tick}><line x1={geometry.left} x2={geometry.right} y1={y} y2={y} className="history-grid" /><text x={geometry.left - 10} y={y + 4} textAnchor="end" className="history-tick">{tick.toFixed(1)}</text></g>;
        })}
        {geometry.paths.map((path, i) => path.points.length === 1 ? <circle key={i} cx={geometry.x(Date.parse(path.points[0].observed_at))} cy={geometry.y!(path.points[0][metric as "temperature_c" | "humidity_percent"])} r="3" className={`plot-dot plot-${metric}`} /> : <path key={i} d={path.d} className={`history-line plot-${metric}`} />)}
        {categorical && <rect x={geometry.left} width={geometry.right - geometry.left} y="20" height="46" fill="#f0f3f2" rx="3" />}
        {geometry.spans.map((span, i) => <rect key={i} x={geometry.x(span.start)} width={Math.max(0, geometry.x(span.end) - geometry.x(span.start))} y="20" height="46" fill={span.kind ? classColors[span.kind] : "#d6dcd9"} />)}
        {selected && <g><line x1={geometry.x(Date.parse(selected.observed_at))} x2={geometry.x(Date.parse(selected.observed_at))} y1={categorical ? 12 : 16} y2={categorical ? 74 : 170} className="history-crosshair" />{!categorical && <circle cx={geometry.x(Date.parse(selected.observed_at))} cy={geometry.y!(selected[metric])} r="4" className={`plot-dot plot-${metric}`} />}</g>}
      </svg>
    </div>
    <div className="history-times"><time title={new Date(start).toISOString()}>{time(new Date(start).toISOString(), true)}</time><time title={new Date(end).toISOString()}>{time(new Date(end).toISOString(), true)}</time></div>
    <div className="history-readout" role="status" aria-live="polite">{selected ? <><time dateTime={selected.observed_at} title={selected.observed_at}>{new Date(selected.observed_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time><strong>{categorical ? selectedClass ? classLabels[selectedClass] : "Unavailable" : valueText(selected)}</strong></> : <><span>{points.length.toLocaleString()} stored samples</span><span>Observation time · {unit || "Recorded class"}</span></>}</div>
    {categorical && <div className="classification-legend">{Object.entries(classLabels).map(([kind, label]) => <span key={kind}><i style={{ background: classColors[kind as keyof typeof classColors] }} />{label}</span>)}<span><i style={{ background: "#f0f3f2" }} />No sample</span></div>}
  </article>;
}
