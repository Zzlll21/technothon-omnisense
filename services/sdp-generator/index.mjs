import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { createRun, generateTick, nextTimestamp, STEP_MS, MODEL_VERSION } from './dist/model.js';
import { createWriter, writeConfiguration, commitTick } from './writer.mjs';

function options(argv) {
  const allowed = new Set(['--write', '--seed-only', '--confirm-project', '--frames', '--help']);
  const result = { write: false, seedOnly: false, confirmation: undefined, frames: Infinity };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!allowed.has(arg)) throw new Error(`Unknown option: ${arg}`);
    if (arg === '--help') return { help: true };
    if (arg === '--write') result.write = true;
    if (arg === '--seed-only') result.seedOnly = true;
    if (arg === '--confirm-project') result.confirmation = argv[++i];
    if (arg === '--frames') {
      result.frames = Number(argv[++i]);
      if (!Number.isSafeInteger(result.frames) || result.frames <= 0) throw new Error('--frames requires a positive integer');
    }
  }
  return result;
}

async function main() {
  const args = options(process.argv.slice(2));
  if (args.help) {
    console.log('Default: offline seven-day dry run; no database access or files written.');
    console.log('Options: --frames N | --write --confirm-project REF [--seed-only]');
    return;
  }
  const env = process.env;
  let writer;
  let previous = null;
  let run;
  if (args.write) {
    const config = writeConfiguration(env, args.confirmation);
    if (!env.SDP_RUN_ID) throw new Error('Persist SDP_RUN_ID as a UUID before enabling writes');
    if (!/^[0-9a-f-]{36}$/i.test(env.SDP_RUN_ID)) throw new Error('Invalid SDP_RUN_ID');
    writer = createWriter(config);
    await writer.verify();
    const existing = await writer.getRun(env.SDP_RUN_ID);
    if (existing) {
      if (existing.status === 'ARCHIVED') throw new Error('This run is archived; use a new run ID');
      run = existing.definition;
      previous = existing.checkpoint;
      if (run.model_version !== MODEL_VERSION) throw new Error('Stored model version not supported');
      if (env.SDP_SEED && Number(env.SDP_SEED) !== run.seed) throw new Error('Seed differs from immutable stored run');
      if (env.SDP_LIVE_ANCHOR && new Date(env.SDP_LIVE_ANCHOR).toISOString() !== run.live_anchor) throw new Error('Anchor differs from immutable stored run');
    }
  }
  if (!run) {
    const anchor = env.SDP_LIVE_ANCHOR || new Date(Math.floor(Date.now() / STEP_MS) * STEP_MS).toISOString();
    run = createRun(env.SDP_RUN_ID || randomUUID(), anchor, Number(env.SDP_SEED ?? 42));
    if (Date.parse(run.live_anchor) > Date.now()) throw new Error('Anchor must not be in the future');
    if (writer) {
      const initialized = await writer.initialize(run);
      previous = initialized.checkpoint;
    }
  }
  console.log(`${writer ? 'DATABASE WRITE MODE' : 'OFFLINE DRY RUN'} | ${MODEL_VERSION} | Simulated Test Data`);
  console.log(`Run ${run.run_id} | history ${run.history_start} to ${run.live_anchor} | resumed sequence ${previous?.sequence ?? -1}`);
  let stopping = false;
  const abort = new AbortController();
  const stop = () => { stopping = true; abort.abort(); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  let count = 0;
  let events = 0;
  let pending;
  try {
    while (!stopping && count < args.frames) {
      const next = Date.parse(nextTimestamp(run, previous));
      if (next > Date.parse(run.live_anchor) && (!writer || args.seedOnly)) break;
      if (writer && next > Date.now()) {
        await sleep(Math.min(next - Date.now(), 30_000), undefined, { signal: abort.signal });
        continue;
      }
      pending ??= generateTick(run, previous);
      try {
        const accepted = writer ? await commitTick(writer, pending) : pending.checkpoint;
        previous = accepted;
      } catch (error) {
        console.error(error.message);
        console.error('Checkpoint not advanced. Retrying the same tick in 5 seconds; Ctrl+C stops safely.');
        await sleep(5_000, undefined, { signal: abort.signal });
        continue;
      }
      events += pending.events.length;
      count++;
      if (count % 100 === 0 || pending.frame.phase === 'CONTINUOUS' || pending.frame.simulated_at === run.live_anchor) {
        console.log(`Committed${writer ? '' : ' in memory'} sequence ${pending.frame.sequence} | ${pending.frame.simulated_at} | ${pending.frame.occupancy} | ${previous.decision.payload.requested_mode}`);
      }
      pending = undefined;
    }
  } catch (error) {
    if (error.name !== 'AbortError') throw error;
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
  console.log(`Stopped: ${count} frames, ${count * 2} samples, ${events} events processed. ${writer ? 'Restart with the same run ID to resume.' : 'Nothing persisted; no network requests made.'}`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
