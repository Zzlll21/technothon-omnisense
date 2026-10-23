export interface TimeWindow { start: number; end: number }
export const minimumTimelineSpan = 15 * 60_000;

/** Presentation bounds only. No records, interpolation or duration calculations. */
export function fitTimeWindow(window: TimeWindow, bounds: TimeWindow): TimeWindow {
  const total = Math.max(1, bounds.end - bounds.start);
  if (!Number.isFinite(window.start) || !Number.isFinite(window.end)) return { ...bounds };
  const span = Math.min(total, Math.max(Math.min(minimumTimelineSpan, total), window.end - window.start));
  const start = Math.max(bounds.start, Math.min(bounds.end - span, window.start));
  return { start, end: start + span };
}
export function zoomTimeWindow(window: TimeWindow, bounds: TimeWindow, factor: number, fraction = 0.5): TimeWindow {
  if (!Number.isFinite(factor) || factor <= 0) return fitTimeWindow(window, bounds);
  fraction = Math.max(0, Math.min(1, fraction));
  const current = fitTimeWindow(window, bounds), total = bounds.end - bounds.start;
  const span = Math.min(total, Math.max(Math.min(minimumTimelineSpan, total), (current.end - current.start) * factor));
  const anchor = current.start + (current.end - current.start) * fraction;
  return fitTimeWindow({ start: anchor - span * fraction, end: anchor + span * (1 - fraction) }, bounds);
}
export function panTimeWindow(window: TimeWindow, bounds: TimeWindow, milliseconds: number): TimeWindow {
  if (!Number.isFinite(milliseconds)) return fitTimeWindow(window, bounds);
  return fitTimeWindow({ start: window.start + milliseconds, end: window.end + milliseconds }, bounds);
}
/** Retain immediate neighbours at the window edge, without joining existing gap-separated segments. */
export function visibleTimeSegments<T extends { observed_at: string }>(segments: T[][], start: number, end: number): T[][] {
  return segments.flatMap(segment => {
    if (!segment.length || Date.parse(segment[segment.length - 1].observed_at) < start || Date.parse(segment[0].observed_at) > end) return [];
    let first = segment.findIndex(point => Date.parse(point.observed_at) >= start);
    if (first < 0) first = segment.length - 1;
    let after = segment.findIndex(point => Date.parse(point.observed_at) > end);
    if (after < 0) after = segment.length;
    return [segment.slice(Math.max(0, first - 1), Math.min(segment.length, after + 1))];
  });
}
