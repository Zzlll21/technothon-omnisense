import { useMemo, useState } from "react";
import { Clock3, RefreshCw } from "lucide-react";
import type { OverviewData } from "../../types/overview";
import { useUtilizationHistory } from "../../hooks/useUtilizationHistory";
import { calculateUtilization, coverageLabel, durationLabel, knownPercentage, preciseDuration } from "../../lib/utilizationAnalytics";
import { coolingCategories } from "../../lib/coolingStatistics";
import { OccupancyOverlap } from "./UtilizationCharts";

export function ACUtilization({ data, refreshToken, onInspectTime }: { data: OverviewData; refreshToken: string | null; onInspectTime: (at: number) => void }) {
  const [hours, setHours] = useState<24 | 168>(24);
  const [retry, setRetry] = useState(0);
  const state = useUtilizationHistory(data, hours, `${refreshToken}/${retry}`);
  const result = useMemo(() => state.end > state.start ? calculateUtilization(state.data, {
    start: state.start, end: state.end, liveAnchor: data.run.live_anchor,
    staleAfterMs: data.zone.config.payload.freshness.stale_after_ms
  }) : null, [state.data, state.start, state.end, data.run.live_anchor, data.zone.config.payload.freshness.stale_after_ms]);
  const known = !!result?.knownMs;
  const categories = result ? coolingCategories(result) : [];
  return <div className="cooling-statistics">
    <div className="statistics-toolbar"><span className="statistics-zone">{data.zone.name} · requested operation</span><div className="history-range" role="group" aria-label="Statistics time range">{([24, 168] as const).map(value => <button key={value} aria-pressed={hours === value} onClick={() => setHours(value)}>{value === 24 ? "24 hours" : "7 days"}</button>)}</div></div>
    {state.error && <div className="notice notice-error" role="alert"><div><strong>Cooling statistics unavailable</strong><p>{state.error}{state.data.frames.length ? " Previous records remain visible." : ""}</p></div><button className="text-action" onClick={() => setRetry(n => n + 1)}><RefreshCw size={16} />Retry</button></div>}
    {state.loading && !state.data.frames.length ? <div className="history-empty" role="status" aria-busy="true"><RefreshCw size={24} className="spinning" /><p>Loading cooling statistics</p></div> : result && (!state.error || state.data.frames.length > 0) && <>
      {!known && <div className="statistics-empty" role="status"><Clock3 size={20} /><div><strong>{state.data.frames.length ? "Not enough continuous data" : "No records in this range"}</strong><p>Unobserved time is unknown, not zero cooling.</p></div></div>}
      <section className="statistics-unified" aria-label="Cooling duration summary">{categories.map(category => <article key={category.id}><span>{category.label}</span><strong title={known ? preciseDuration(category.ms) : undefined}>{known ? durationLabel(category.ms) : "Unavailable"}</strong><div className="stat-mini-track"><i style={{ width: `${known ? category.ms / result.knownMs * 100 : 0}%`, background: category.color }} /></div><small>{known ? `${(category.ms / result.knownMs * 100).toFixed(1)}% of known time` : "No known time"}</small></article>)}<article className="stat-review"><span>Normal during vacancy</span><strong title={known ? preciseDuration(result.normalVacantMs) : undefined}>{known ? durationLabel(result.normalVacantMs) : "Unavailable"}</strong><div className="stat-mini-track"><i style={{ width: `${known ? result.normalVacantMs / result.knownMs * 100 : 0}%` }} /></div><small>Included in normal cooling</small></article></section>
      <OccupancyOverlap key={hours} result={result} onInspectTime={onInspectTime} />
      <section className="statistics-coverage" aria-label="Data coverage"><div><span>Data coverage</span><strong>{coverageLabel(result.knownMs, result.elapsedMs)}</strong></div><div className="statistics-coverage-detail"><div className="coverage-track"><span style={{ width: `${knownPercentage(result.knownMs, result.elapsedMs)}%` }} /></div><p>{durationLabel(result.knownMs)} known <span>·</span> {durationLabel(result.missingMs)} unknown</p></div></section>
      <p className="statistics-note">Requested operation, not measured AC runtime. Unknown intervals are excluded from mode shares. Pre-cooling is a separate category.</p>
    </>}
  </div>;
}
