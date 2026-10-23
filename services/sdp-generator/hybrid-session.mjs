import { randomUUID } from 'node:crypto';
import { normalizeHardwareTelemetry } from './dist/hardwareTelemetry.js';
import { evaluateHardwareCooling } from './dist/hybridOffline.js';
import { prepareHybridTick } from './dist/hybridModel.js';

/** Single serialized writer integration. Injected writer/lease only; no socket, timer, env or startup side effect. */
export function createHybridSession(run, writer, lease, { checkpoint = null, queueLimit = 256 } = {}) {
  if (!Number.isSafeInteger(queueLimit) || queueLimit < 2) throw new Error('Invalid hybrid queue limit');
  const ids = run.config.payload.required_nodes.map(n => n.node_id);
  const config = { required_node_ids: ids, full_zone_coverage: run.full_zone_coverage, ...run.config.payload.freshness };
  const latest = new Map();
  let connected = false, fusion = null, lastEvaluation = -Infinity, lastQueued = -Infinity, previousKey;
  let committed = checkpoint, pending = null, queue = [], flight = null, gap = false;
  let failureStage = null, attemptedSequence = null;
  const packets = {received:0,accepted:0,rejected:0,by_node:Object.fromEntries(ids.map(id=>[id,{accepted:0,rejected:0}])),reasons:{}};
  function count(node, accepted, reason) {
    const key=accepted?'accepted':'rejected';packets[key]++;
    if(packets.by_node[node])packets.by_node[node][key]++;
    if(reason)packets.reasons[reason]=(packets.reasons[reason]??0)+1;
    return accepted;
  }
  function evaluate(at) {
    if (at < Date.parse(run.live_anchor) || (committed && at <= Date.parse(committed.simulated_at))) return null;
    if (at < lastEvaluation) { latest.clear(); fusion = null; gap = true; return null; }
    if (at === lastEvaluation) return null;
    const entries = [...latest.values()];
    let assessment = evaluateHardwareCooling(new Date(at).toISOString(), connected ? entries.map(e => e.reading) : [], config, fusion);
    if (!connected) assessment = { ...assessment,
      nodes: assessment.nodes.map(n => ({ ...n, state: latest.has(n.node_id) ? 'DISCONNECTED' : 'MISSING' })),
      // Receipts describe retained observations; they do not grant vacancy authority.
      checkpoint: { ...assessment.checkpoint, last_receipts: Object.fromEntries(entries.map(e => [e.reading.node_id, e.reading.received_at])) } };
    fusion = assessment.checkpoint;
    lastEvaluation = at;
    const key = JSON.stringify([connected, gap, assessment.occupancy, assessment.coverage, assessment.requested_mode, assessment.vacancy_confirmed_at, assessment.forecast.next_use_window,
      assessment.nodes.map(n => [n.state, n.occupancy]), entries.map(e => [e.reading.node_id, e.reading.occupancy.method, e.reading.occupancy.class_label, e.reading.temperature_c.validity, e.reading.humidity_percent.validity])]);
    if (key !== previousKey || at - lastQueued >= run.heartbeat_ms) {
      if (queue.length >= queueLimit) { queue = []; latest.clear(); fusion = null; gap = true; previousKey = null; return null; }
      queue.push(structuredClone({ at: new Date(at).toISOString(), entries, assessment }));
      previousKey = key; lastQueued = at; gap = false;
    }
    return assessment;
  }
  return {
    setConnected(value) { connected = value === true; fusion = null; previousKey = null; if (connected) latest.clear(); },
    ingest(topic, message, packet = {}, at) {
      packets.received++;
      const node = /^omnisense\/node\/([^/]+)\/telemetry$/.exec(topic)?.[1];
      if (!ids.includes(node)) return count(null,false,'UNMAPPED_TOPIC');
      if (typeof message !== 'string') { count(node,false,'PAYLOAD_SIZE');latest.delete(node); fusion = null; previousKey = null; evaluate(at); return false; }
      if (!connected || packet.retain || packet.dup) { count(node,false,!connected?'NOT_SUBSCRIBED':packet.retain?'RETAINED':'DUPLICATE');latest.delete(node); fusion = null; previousKey = null; evaluate(at); return false; }
      const result = normalizeHardwareTelemetry(topic, message, { received_at: new Date(at).toISOString(), allowed_node_ids: ids, retained: false });
      if (!result.ok) { count(node,false,'NORMALIZATION');latest.delete(node); fusion = null; previousKey = null; evaluate(at); return false; }
      if (at < lastEvaluation) { latest.clear(); fusion = null; gap = true; return count(node,false,'CLOCK_REGRESSION'); }
      latest.set(node, { evidence_id: `${run.run_id}:ingress:${randomUUID()}`, reading: result.value });
      count(node,true);
      if (result.value.occupancy.value !== 'VACANT') fusion = null;
      try { evaluate(at); } catch(error) { failureStage='EVALUATE';throw error; }
      return true;
    },
    evaluate,
    flush(at) {
      // Queue input independently from the immutable transaction currently in flight.
      try { evaluate(at); } catch(error) { failureStage='EVALUATE';throw error; }
      if (flight) return flight; // Coalesce callers; never append an unbounded Promise chain.
      const work = async () => {
        let stage='PREPARE';
        try {
          attemptedSequence=(committed?.sequence??-1)+1;failureStage=null;
          if (!pending) {
            const candidate = queue.shift();
            if (!candidate) return committed;
            pending = prepareHybridTick(run, committed, candidate.at, candidate.entries, candidate.assessment);
          }
          stage='COMMIT';
          const accepted = await writer.commit(pending, lease);
          committed = accepted;
          pending = null;
          return committed;
        } catch(error) { failureStage=stage;throw error; }
      };
      flight = work().finally(() => { flight = null; });
      return flight;
    },
    recover(checkpoint, replacementLease) {
      if (flight) throw new Error('Wait for the in-flight transaction before recovery');
      committed = structuredClone(checkpoint); lease = replacementLease;
      pending = null; queue = []; latest.clear(); fusion = null; connected = false;
      lastEvaluation = checkpoint ? Date.parse(checkpoint.simulated_at) : -Infinity;
      lastQueued = -Infinity; previousKey = null; gap = true;
    },
    inspect() { return structuredClone({ committed, pending, queued: queue.length, connected, gap,
      diagnostics:{failure_stage:failureStage,attempted_sequence:attemptedSequence,packets} }); }
  };
}
