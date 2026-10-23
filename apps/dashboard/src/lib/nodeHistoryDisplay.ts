import type { NodeClass, NodeEvidence } from "../../../../packages/sdp-contract/src";
import type { NodeHistoryPoint } from "../api/nodeHistory";

export const classLabels: Record<NodeClass, string> = {
  EMPTY_CORE: "Empty", THERMAL_ANOMALIES: "Thermal anomalies", OCCUPIED_1P: "Occupied · 1 person",
  OCCUPIED_2P: "Occupied · 2 people", OCCUPIED_3P_PLUS: "Occupied · 3+ people"
};
export const classColors: Record<NodeClass, string> = {
  EMPTY_CORE: "#8e9c96", THERMAL_ANOMALIES: "#b97c2a", OCCUPIED_1P: "#439c85",
  OCCUPIED_2P: "#237b66", OCCUPIED_3P_PLUS: "#185b4a"
};
export function classification(evidence?: NodeEvidence) {
  const observation = evidence?.payload.classification;
  return observation?.validity === "VALID" ? observation.value.class_label : null;
}
export function sampleInterval(at: number, anchor: string) { return at <= Date.parse(anchor) ? 300_000 : 30_000; }
export function hasGap(a: NodeHistoryPoint, b: NodeHistoryPoint, anchor: string) {
  return b.sequence !== a.sequence + 1 || Date.parse(b.observed_at) - Date.parse(a.observed_at) > sampleInterval(Date.parse(b.observed_at), anchor) * 1.5 ||
    !!(a.fresh_until && b.received_at && Date.parse(b.received_at) > Date.parse(a.fresh_until));
}
export function numericSegments(points: NodeHistoryPoint[], anchor: string, metric: "temperature_c" | "humidity_percent") {
  const segments: NodeHistoryPoint[][] = [];
  let segment: NodeHistoryPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p.stale || p.evidence.payload[metric].validity !== "VALID" || p[metric] === null || (i > 0 && hasGap(points[i - 1], p, anchor))) {
      if (segment.length) segments.push(segment);
      segment = [];
    }
    if (!p.stale && p.evidence.payload[metric].validity === "VALID" && p[metric] !== null) {
      // Snapshot projections of the same acquisition do not create new chart points.
      if (p.received_at == null || !segment.some(q => q.evidence_event_id === p.evidence_event_id)) segment.push(p);
    }
  }
  if (segment.length) segments.push(segment);
  return segments;
}
// Each classification is shown only for its sampling interval, never across missing evidence.
export function occupancySpans(points: NodeHistoryPoint[], anchor: string, end: number) {
  const spans: { start: number; end: number; kind: NodeClass | null }[] = [];
  points.forEach((p, i) => {
    const start = Date.parse(p.observed_at);
    const next = points[i + 1];
    const finish = Math.min(end, start + sampleInterval(start + 1, anchor), next ? Date.parse(next.observed_at) : Infinity,
      !p.stale && p.fresh_until ? Date.parse(p.fresh_until) : Infinity);
    if (finish <= start) return;
    const kind = p.stale ? null : classification(p.evidence);
    const previous = spans.at(-1);
    if (previous && previous.kind === kind && previous.end === start && !hasGap(points[i - 1], p, anchor)) previous.end = finish;
    else spans.push({ start, end: finish, kind });
  });
  return spans;
}
export function nearestPoint(points: NodeHistoryPoint[], at: number) {
  if (!points.length) return -1;
  let lo = 0, hi = points.length - 1;
  while (lo < hi) { const mid = Math.floor((lo + hi) / 2); if (Date.parse(points[mid].observed_at) < at) lo = mid + 1; else hi = mid; }
  return lo > 0 && at - Date.parse(points[lo - 1].observed_at) <= Date.parse(points[lo].observed_at) - at ? lo - 1 : lo;
}
export function chartScale(values: (number | null)[]) {
  let low = Infinity, high = -Infinity;
  for (const value of values) { if (value !== null && Number.isFinite(value)) { low = Math.min(low, value); high = Math.max(high, value); } }
  if (!Number.isFinite(low)) { low = 20; high = 30; }
  const span = Math.max(high - low, 0.4);
  const raw = span / 3;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(0.1, [1, 2, 5, 10].find(n => n * power >= raw)! * power);
  const min = Math.floor((low - span * 0.08) / step) * step;
  const max = Math.ceil((high + span * 0.08) / step) * step;
  const ticks = Array.from({ length: Math.round((max - min) / step) + 1 }, (_, i) => Number((min + i * step).toFixed(1)));
  return { min, max, ticks };
}
