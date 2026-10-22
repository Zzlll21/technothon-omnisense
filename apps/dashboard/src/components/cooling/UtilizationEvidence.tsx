import { useMemo } from "react";
import { RefreshCw } from "lucide-react";
import type { OverviewData } from "../../types/overview";
import { useUtilizationHistory } from "../../hooks/useUtilizationHistory";
import { calculateUtilization, coverageLabel, durationLabel } from "../../lib/utilizationAnalytics";
import { OccupancyOverlap } from "./UtilizationCharts";

export function UtilizationEvidence({ data, refreshToken, onInspectTime }: { data: OverviewData; refreshToken: string | null; onInspectTime: (at: number) => void }) {
  const state = useUtilizationHistory(data, 24, refreshToken);
  const result = useMemo(() => state.end > state.start ? calculateUtilization(state.data, { start: state.start, end: state.end, liveAnchor: data.run.live_anchor, staleAfterMs: data.zone.config.payload.freshness.stale_after_ms }) : null, [state.data, state.start, state.end, data.run.live_anchor, data.zone.config.payload.freshness.stale_after_ms]);
  if (state.loading && !state.data.frames.length) return <div className="history-empty compact-empty" role="status"><RefreshCw size={20} className="spinning" />Loading utilization evidence</div>;
  return <>{state.error && <p className="notice notice-error" role="alert">{state.error}</p>}{result && <><div className="evidence-totals"><span><strong>{result.knownMs ? durationLabel(result.reducedMs) : "Unavailable"}</strong>Reduced / standby</span><span><strong>{result.knownMs ? durationLabel(result.normalVacantMs) : "Unavailable"}</strong>Normal during vacancy</span><span><strong>{coverageLabel(result.knownMs, result.elapsedMs)}</strong>Known coverage</span></div><OccupancyOverlap result={result} onInspectTime={onInspectTime} /></>}</>;
}
