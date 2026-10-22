import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { createHybridRun } from './dist/hybridModel.js';
import { createHybridSession } from './hybrid-session.mjs';
import { attachMqttMonitor } from './hardware-monitor.mjs';
import { assertHybridTarget } from './hybrid-target.mjs';

/** Explicit-start supervisor; all external effects are injected. Import has no side effects. */
export function createHybridSupervisor({ target, writer, connectMqtt, now = Date.now, report = () => {} }) {
  assertHybridTarget(target);
  const run = createHybridRun(target.run_id,target.live_anchor,target.nodes,{full_zone_coverage:target.full_zone_coverage,
    representative_node_id:target.representative_node_id,replaces_active_run_id:target.replaces_active_run_id});
  const owner = randomUUID();
  let client, detach, session, lease, deadline=0, retryAt=0, flight=null, stopFlight=null, subscribed=false, running=false, stopping=false, started=false, needsRecovery=false;
  const validState = state => {
    if (!state || !isDeepStrictEqual(state.definition,run) || state.status==='ARCHIVED') throw new Error('Immutable hybrid run mismatch or archived run');
    const c=state.checkpoint;
    if (c && (!Number.isSafeInteger(c.sequence) || c.sequence<0 || !Number.isFinite(Date.parse(c.simulated_at)) ||
      c.decision?.session_id!==run.run_id || c.forecast?.session_id!==run.run_id || c.output?.session_id!==run.run_id)) throw new Error('Invalid committed checkpoint');
    return c ?? null;
  };
  async function acquire() {
    const start=now(), token=await writer.acquire(run.run_id,owner);
    if(token.owner_id!==owner || !Number.isSafeInteger(token.epoch) || token.epoch<1 || !Number.isFinite(Date.parse(token.expires_at))) throw new Error('Invalid writer lease acknowledgement');
    deadline=Math.min(Date.parse(token.expires_at)-5000,start+55_000);
    if(deadline<=now())throw new Error('Writer lease already expired or clock skewed');
    return token;
  }
  function detachClient() {
    detach?.();detach=null;
    if(client){client.on('error',()=>{});client.end(true);client=null;}
  }
  async function recover() {
    needsRecovery=true;
    // Acquire first: another owner cannot advance the checkpoint while it is read.
    lease=await acquire();
    const stored=validState(await writer.getRun(run.run_id)), old=session.inspect(), pending=old.pending;
    let checkpoint=stored;
    if(stopping)return;
    if(pending) {
      if(stored?.sequence===pending.frame.sequence && isDeepStrictEqual(stored,pending.checkpoint)) {
        report('HYBRID_RECOVERED_COMMITTED_RESPONSE');
      } else if((stored?.sequence??-1)===pending.expected_sequence && isDeepStrictEqual(stored,old.committed)) {
        const start=now();checkpoint=await writer.commit(pending,lease);deadline=start+55_000;
      } else throw new Error('Pending transaction conflicts with stored checkpoint');
    }
    session.recover(checkpoint,lease);session.setConnected(subscribed);needsRecovery=false;
    report('HYBRID_RECOVERED_AWAITING_NEW_EVIDENCE');
  }
  return {
    async start() {
      if(started)throw new Error('Hybrid supervisor can only start once');started=true;
      try {
        await writer.verify();if(stopping)return;
        const checkpoint=validState(await writer.initialize(run));if(stopping)return;
        lease=await acquire();if(stopping)return;
        session=createHybridSession(run,writer,lease,{checkpoint});
        client=connectMqtt();
        detach=attachMqttMonitor(client,session,target.nodes.map(n=>n.node_id),now,code=>{
          subscribed=code==='MQTT_SUBSCRIBED';report(code);
        });
        running=true;report('HYBRID_STARTED');
      }catch{detachClient();throw new Error('Hybrid startup failed; target, run and exclusive lease must verify');}
    },
    pump() {
      if(!running || stopping)return Promise.resolve();
      if(flight)return flight;
      if(now()<retryAt)return Promise.resolve();
      flight=(async()=>{
        try {
          if(needsRecovery || now()>=deadline)await recover();
          if(stopping)return;
          const before=now(), old=session.inspect().committed;
          const checkpoint=await session.flush(now());
          if(checkpoint!==old && checkpoint?.sequence!==(old?.sequence??-1))deadline=before+55_000;
          retryAt=0;
        }catch(error){
          if(error.kind==='RETRY') {retryAt=now()+2000;report('HYBRID_RETRY_PENDING_UNCHANGED');return;}
          if(error.kind==='LEASE') {
            // A stale local token may renew only through a new explicit acquire.
            // If that acquire finds another live owner it fails and halts us.
            try {await recover();return;}catch(recoveryError){
              if(recoveryError.kind==='RETRY'){retryAt=now()+2000;report('HYBRID_RETRY_RECOVERY');return;}
            }
          }
          running=false;detachClient();report('HYBRID_HALTED');
          throw new Error('Hybrid halted; reconcile authority or invalid transaction before restart');
        }
      })().finally(()=>{flight=null;});
      return flight;
    },
    stop() {
      if(stopFlight)return stopFlight;
      stopping=true;running=false;detachClient();
      // No new flush on shutdown. An already issued bounded RPC may still commit.
      stopFlight=(async()=>{try{await flight;}finally{report('HYBRID_STOPPED');}})();
      return stopFlight;
    },
    inspect(){return {running,owner_id:owner,lease:lease?{...lease}:null,session:session?.inspect()??null};}
  };
}
