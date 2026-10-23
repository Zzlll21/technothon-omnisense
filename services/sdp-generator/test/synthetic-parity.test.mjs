import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRun, generateTick } from '../dist/model.js';

test('complete synthetic ticks retain baseline bytes over seven-day history and 24 hours continuous', () => {
  // Recorded from ec62d18:model.ts before refactoring, using these exact inputs.
  // Includes all fields, event IDs, correlations, forecasts, outputs and checkpoints.
  const run = createRun('11111111-1111-4111-8111-111111111111', '2026-10-21T00:00:00.000Z', 42);
  const hash = createHash('sha256');
  let previous = null;
  for (let frame = 0; frame < 2017 + 2880; frame++) {
    const tick = generateTick(run, previous);
    hash.update(JSON.stringify(tick) + '\n');
    previous = tick.checkpoint;
  }
  assert.equal(hash.digest('hex'), 'd887eb95d0f5c713c67c160f314676c99a6f2e5545fc4971563cd41f15a4ad78');
});
