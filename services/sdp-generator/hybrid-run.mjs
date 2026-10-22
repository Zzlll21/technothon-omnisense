import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import { loadHybridTarget, verifyMigrationFiles } from './hybrid-target.mjs';
import { createHybridWriter, hybridWriteConfiguration } from './hybrid-writer.mjs';
import { liveConfiguration } from './hybrid-mqtt.mjs';
import { createHybridSupervisor } from './hybrid-runtime.mjs';

export async function main(argv=process.argv.slice(2),env=process.env) {
  if(!argv.length || argv.includes('--help')) {
    console.log('Hybrid writer disabled by default. No network or database access.');
    console.log('After approval only: --live --manifest PATH --confirm PROJECT_REF; requires HYBRID_ENABLE_WRITES=true and approved target registry.');return;
  }
  let path,confirmation,live=false;
  for(let i=0;i<argv.length;i++) {
    if(argv[i]==='--live')live=true;
    else if(argv[i]==='--manifest')path=argv[++i];
    else if(argv[i]==='--confirm')confirmation=argv[++i];
    else throw new Error('Invalid hybrid writer option');
  }
  if(!live || !path || !confirmation || env.HYBRID_ENABLE_WRITES!=='true')throw new Error('Explicit live writer opt-in required');
  const target=await loadHybridTarget(path);await verifyMigrationFiles(target);
  const config=hybridWriteConfiguration(env,confirmation,target),mqttConfig=liveConfiguration(env);
  const a=mqttConfig.config,b=target.nodes.map(n=>n.node_id);
  if(JSON.stringify([...a.required_node_ids].sort())!==JSON.stringify([...b].sort()) || a.full_zone_coverage!==target.full_zone_coverage || a.stale_after_ms!==90_000 || a.disconnected_after_ms!==180_000)throw new Error('MQTT inventory/coverage differs from approved run');
  const {default:mqtt}=await import('mqtt');
  const abort=new AbortController();
  const supervisor=createHybridSupervisor({target,writer:createHybridWriter(config),
    connectMqtt:()=>mqtt.connect(mqttConfig.url,{...mqttConfig.mqttOptions,clientId:`omnisense-hybrid-writer-${randomUUID()}`}),
    report:code=>console.log(JSON.stringify({component:'HYBRID_WRITER',status:code}))});
  const finish=()=>{abort.abort();void supervisor.stop().catch(()=>{});};
  process.once('SIGINT',finish);process.once('SIGTERM',finish);
  try{
    await supervisor.start();
    while(!abort.signal.aborted){await supervisor.pump();await delay(1000,undefined,{signal:abort.signal}).catch(()=>{});}
  }finally{await supervisor.stop();process.removeListener('SIGINT',finish);process.removeListener('SIGTERM',finish);}
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) main().catch(()=>{
  console.error('Hybrid writer refused or stopped. Review approved configuration and sanitized diagnostics; no raw error logged.');process.exitCode=1;
});
