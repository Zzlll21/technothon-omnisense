import test from 'node:test';
import assert from 'node:assert/strict';
import { compileSource } from './overview-fixture.mjs';
const { fitTimeWindow, zoomTimeWindow, panTimeWindow, visibleTimeSegments, minimumTimelineSpan } = await compileSource(new URL('../src/lib/timelineViewport.ts', import.meta.url));
const hour = 3600_000, bounds = { start: 0, end: 7 * 24 * hour };

test('zoom retains the timestamp under the pointer and enforces useful elapsed-time limits', () => {
  const current = { start: 20 * hour, end: 44 * hour }, fraction = .3;
  const zoomed = zoomTimeWindow(current, bounds, .4, fraction);
  assert.equal(zoomed.end - zoomed.start, 24 * hour * .4);
  assert.ok(Math.abs(zoomed.start + (zoomed.end - zoomed.start) * fraction - (current.start + 24 * hour * fraction)) < .001);
  assert.equal(zoomTimeWindow(current, bounds, .000001).end - zoomTimeWindow(current, bounds, .000001).start, minimumTimelineSpan);
  assert.deepEqual(zoomTimeWindow(current, bounds, 1000), bounds);
  assert.deepEqual(current, { start: 20 * hour, end: 44 * hour });
});
test('panning changes timestamps without stretching the window, and stops at loaded data boundaries', () => {
  const current = { start: 20 * hour, end: 44 * hour };
  assert.deepEqual(panTimeWindow(current, bounds, -4 * hour), { start: 16 * hour, end: 40 * hour });
  assert.deepEqual(panTimeWindow(current, bounds, -1000 * hour), { start: 0, end: 24 * hour });
  assert.deepEqual(panTimeWindow(current, bounds, 1000 * hour), { start: 144 * hour, end: 168 * hour });
});
test('ordinary refresh preserves an explicitly explored absolute window; expired left edges are bounded', () => {
  const saved = { start: 30 * hour, end: 34 * hour };
  assert.deepEqual(fitTimeWindow(saved, { start: hour, end: 169 * hour }), saved);
  assert.deepEqual(fitTimeWindow({ start: 0, end: 4 * hour }, { start: hour, end: 169 * hour }), { start: hour, end: 5 * hour });
});
test('invalid gestures and short datasets cannot create invalid dates or a window outside the selected period', () => {
  const current = { start: hour, end: 2 * hour };
  assert.deepEqual(zoomTimeWindow(current, bounds, NaN), current);
  assert.deepEqual(panTimeWindow(current, bounds, Infinity), current);
  assert.deepEqual(fitTimeWindow({ start: NaN, end: Infinity }, bounds), bounds);
  const short = { start: 1000, end: 2000 };
  assert.deepEqual(zoomTimeWindow(short, short, .01), short);
});
test('visible temperature slices retain real edge neighbours and preserve existing missing-data gaps', () => {
  const at = minute => ({ observed_at: new Date(minute * 60_000).toISOString(), temperature_c: minute });
  const segments = [[at(0), at(5), at(10)], [at(25), at(30), at(35)], [at(90)]];
  const before = structuredClone(segments);
  const slice = visibleTimeSegments(segments, 6 * 60_000, 29 * 60_000);
  assert.deepEqual(slice.map(segment => segment.map(point => point.temperature_c)), [[5, 10], [25, 30]]);
  assert.deepEqual(visibleTimeSegments(segments, 12 * 60_000, 20 * 60_000), []);
  assert.deepEqual(segments, before);
  assert.ok(slice.flat().every(point => segments.flat().includes(point)));
});
