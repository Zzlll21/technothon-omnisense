import test from 'node:test';
import assert from 'node:assert/strict';
import { compileSource } from './overview-fixture.mjs';
const { inspectionReducer: reduce, latestInspection: latest } = await compileSource(new URL('../src/lib/inspection.ts', import.meta.url));
const { matchingIntervals } = await compileSource(new URL('../src/lib/utilizationSelection.ts', import.meta.url));
const { coolingCategories } = await compileSource(new URL('../src/lib/coolingStatistics.ts', import.meta.url));

test('statistics categories partition known time without counting normal-vacancy overlap twice', () => {
  const totals={modeMs:{OCCUPIED:7,SHORT_VACANCY:2,LONG_VACANCY:8,PRECOOL:3},reducedMs:10,normalVacantMs:2,knownMs:20,missingMs:4};
  const before=structuredClone(totals),categories=coolingCategories(totals);
  assert.deepEqual(categories.map(c=>[c.id,c.ms]),[['normal',7],['reduced',10],['precool',3]]);
  assert.equal(categories.reduce((sum,c)=>sum+c.ms,0),totals.knownMs);
  assert.deepEqual(totals,before);
  assert.equal(coolingCategories({...totals,modeMs:{OCCUPIED:0,SHORT_VACANCY:0,LONG_VACANCY:0,PRECOOL:0},reducedMs:0,knownMs:0}).every(c=>c.ms===0),true);
});

test('hover is transient while click/keyboard/external event inspection is explicitly pinned', () => {
  const hover = reduce(latest, { type: 'hover', at: 100 });
  assert.deepEqual(hover, { at: 100, pinned: false });
  assert.deepEqual(reduce(hover, { type: 'leave' }), latest);
  const pinned = reduce(hover, { type: 'pin', at: 120 });
  assert.equal(reduce(pinned, { type: 'hover', at: 200 }), pinned);
  assert.equal(reduce(pinned, { type: 'leave' }), pinned);
  assert.deepEqual(reduce(pinned, { type: 'pin', at: 220 }), { at: 220, pinned: true });
  assert.deepEqual(reduce(pinned, { type: 'clear' }), latest);
});
test('invalid timestamps cannot replace an inspection and unrelated data updates do not change selection', () => {
  const pinned = reduce(latest, { type: 'pin', at: 12345 });
  for (const at of [NaN, Infinity, -Infinity]) assert.equal(reduce(pinned, { type: 'pin', at }), pinned);
  assert.deepEqual(pinned, { at: 12345, pinned: true });
});
test('matrix inspection groups adjacent recorded intervals, never bridges missing or different operation', () => {
  const segment = (start, end, mode = 'OCCUPIED', occupancy = 'VACANT') => ({ start, end, mode, occupancy, applied: true });
  const segments = [segment(0, 10), segment(10, 20), segment(20, 30, null, null), segment(30, 40), segment(40, 50, 'PRECOOL'), segment(50, 60), segment(70, 80)];
  const before = structuredClone(segments);
  assert.deepEqual(matchingIntervals(segments, 'VACANT', 'OCCUPIED'), [{ start: 0, end: 20 }, { start: 30, end: 40 }, { start: 50, end: 60 }, { start: 70, end: 80 }]);
  assert.deepEqual(segments, before);
  assert.deepEqual(matchingIntervals([], 'VACANT', 'PRECOOL'), []);
});
