import type { CoolingMode, OccupancyState } from "../../../../packages/sdp-contract/src";
import type { UtilizationSegment } from "./utilizationAnalytics";

// Presentation grouping only: adjacent matching spans, never across unknown gaps.
export function matchingIntervals(segments: UtilizationSegment[], occupancy: OccupancyState, mode: CoolingMode) {
  const intervals: { start: number; end: number }[] = [];
  for (const segment of segments) {
    if (segment.occupancy !== occupancy || segment.mode !== mode) continue;
    const previous = intervals.at(-1);
    if (previous?.end === segment.start) previous.end = segment.end;
    else intervals.push({ start: segment.start, end: segment.end });
  }
  return intervals;
}
