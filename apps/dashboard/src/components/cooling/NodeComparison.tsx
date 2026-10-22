import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent, KeyboardEvent } from "react";
import type { NodeHistoryPoint, HistoryRange } from "../../api/nodeHistory";
import type { OverviewData } from "../../types/overview";
import { useNodeHistory } from "../../hooks/useNodeHistory";
import { chartScale, nearestPoint, numericSegments } from "../../lib/nodeHistoryDisplay";
import { number, time } from "../../lib/overviewDisplay";

export function NodeComparison({ data, hours, refreshToken }: { data: OverviewData; hours: HistoryRange; refreshToken: string | null }) {
  const nodes = data.zone.config.payload.required_nodes.slice(0, 2);
  // Two independently scoped, validated node queries; no interpolation or resampling.
  const first = useNodeHistory(data, nodes[0]?.node_id ?? "", hours, refreshToken);
  const second = useNodeHistory(data, nodes[1]?.node_id ?? "", hours, refreshToken);
  const series = [{ label: nodes[0]?.label ?? "Sensor 1", points: first.points, color: "#0284c7" }, { label: nodes[1]?.label ?? "Sensor 2", points: second.points, color: "#b45309" }];
  if (nodes.length < 2) return <p className="history-empty">Two configured nodes are needed for comparison.</p>;
  if (!first.start || !second.start) return <p className="history-empty" role="status">Loading sensor comparison…</p>;
  return <div className="node-comparison" aria-label="Two sensor history comparison">
    {(first.loading || second.loading) && <p role="status">Updating sensor comparison…</p>}
    {(first.error || second.error) && <p className="notice notice-error" role="alert">{first.error ?? second.error} Available records remain visible.</p>}
    {!first.points.length && !second.points.length && !first.loading && !second.loading ? <p className="history-empty">No sensor samples in this range.</p> : <>{(["temperature_c", "humidity_percent"] as const).map(metric => <ComparisonPlot key={`${metric}/${hours}`} series={series} start={Math.max(first.start, second.start)} end={Math.min(first.end, second.end)} anchor={data.run.live_anchor} metric={metric} />)}</>}
  </div>;
}

interface Series { label: string; points: NodeHistoryPoint[]; color: string }
function ComparisonPlot({ series, start, end, anchor, metric }: { series: Series[]; start: number; end: number; anchor: string; metric: "temperature_c" | "humidity_percent" }) {
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [at, setAt] = useState<number | null>(null);
  const [pinned, setPinned] = useState(false);
  useEffect(() => { if (!host.current) return; const observer = new ResizeObserver(entries => setWidth(Math.max(260, entries[0].contentRect.width))); observer.observe(host.current); return () => observer.disconnect(); }, []);
  const filtered = useMemo(() => series.map(s => ({ ...s, points: s.points.filter(p => Date.parse(p.observed_at) >= start && Date.parse(p.observed_at) <= end) })), [series, start, end]);
  const values = filtered.flatMap(s => s.points.filter(p => p.evidence.payload[metric].validity === "VALID").map(p => p[metric]));
  const scale = chartScale(values.length ? values : [0, 1]);
  const x = (t: number) => 50 + (t - start) / Math.max(1, end - start) * (width - 66);
  const y = (v: number) => 170 - (v - scale.min) / (scale.max - scale.min) * 140;
  const unit = metric === "temperature_c" ? "°C" : "%";
  function pointer(event: PointerEvent<SVGSVGElement>) { const rect = event.currentTarget.getBoundingClientRect(); return start + Math.max(0, Math.min(1, ((event.clientX - rect.left) / rect.width * width - 50) / (width - 66))) * (end - start); }
  const times = [...new Set(filtered.flatMap(s => s.points.map(p => Date.parse(p.observed_at))))].sort((a, b) => a - b);
  function keyboard(event: KeyboardEvent<SVGSVGElement>) {
    if (event.key === "Escape") { setAt(null); setPinned(false); return; }
    if (!times.length || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const index = at === null ? times.length - 1 : times.findIndex(t => t >= at);
    const next = event.key === "Home" ? 0 : event.key === "End" ? times.length - 1 : Math.max(0, Math.min(times.length - 1, index + (event.key === "ArrowRight" ? 1 : -1)));
    setAt(times[next]); setPinned(true);
  }
  return <article className="history-plot comparison-plot"><header><h3>{metric === "temperature_c" ? "Temperature comparison" : "Humidity comparison"}</h3><span>{unit}</span></header><div ref={host}><svg width="100%" height="190" viewBox={`0 0 ${width} 190`} tabIndex={0} role="application" aria-label={`${metric === "temperature_c" ? "Temperature" : "Humidity"} comparison. Arrow keys inspect; Escape clears.`} onKeyDown={keyboard} onFocus={() => { if (at === null) setAt(times.at(-1) ?? null); }} onPointerMove={e => { if (!pinned && e.pointerType === "mouse") setAt(pointer(e)); }} onPointerDown={e => { setAt(pointer(e)); setPinned(true); }} onPointerLeave={() => { if (!pinned) setAt(null); }} onBlur={() => { if (!pinned) setAt(null); }}>
    {scale.ticks.map(tick => <g key={tick}><line x1="50" x2={width - 16} y1={y(tick)} y2={y(tick)} className="history-grid" /><text x="40" y={y(tick) + 5} textAnchor="end" className="history-tick">{tick.toFixed(1)}</text></g>)}
    {filtered.flatMap(s => numericSegments(s.points, anchor, metric).map((segment, i) => segment.length === 1 ? <circle key={`${s.label}/${i}`} cx={x(Date.parse(segment[0].observed_at))} cy={y(segment[0][metric])} r="3" fill={s.color} /> : <path key={`${s.label}/${i}`} d={segment.map((p, j) => `${j ? "L" : "M"}${x(Date.parse(p.observed_at))},${y(p[metric])}`).join(" ")} fill="none" stroke={s.color} strokeWidth="2.4" />))}
    {at !== null && <line x1={x(at)} x2={x(at)} y1="20" y2="176" className="history-crosshair" />}
  </svg></div><div className="history-times"><time>{time(new Date(Math.max(0, start)).toISOString(), true)}</time><time>{time(new Date(Math.max(0, end)).toISOString(), true)}</time></div><div className="comparison-readout" aria-live="polite">{filtered.map(s => { const point = at === null ? s.points.at(-1) : s.points[nearestPoint(s.points, at)]; return <span key={s.label}><i style={{ background: s.color }} />{s.label}<strong>{point?.evidence.payload[metric].validity === "VALID" ? `${number(point[metric])}${unit}` : "Unavailable"}</strong><small>{point ? time(point.observed_at, true) : "No sample"}</small></span>; })}</div></article>;
}
