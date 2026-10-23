import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createHardwareMonitor, attachMqttMonitor, validNodeId } from './hardware-monitor.mjs';

class DiagnosticError extends Error {}
const fail = message => { throw new DiagnosticError(message); };
function integer(value, fallback, min, max) {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) fail('Invalid diagnostic duration/timing configuration');
  return number;
}
export function argumentsFor(argv) {
  const options = { live: false, replay: null, seconds: 60, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help') options.help = true;
    else if (arg === '--live') options.live = true;
    else if (arg === '--replay') {
      options.replay = argv[++i];
      if (!options.replay || options.replay.startsWith('--')) fail('--replay requires a local JSON fixture');
    } else if (arg === '--seconds') options.seconds = integer(argv[++i] ?? '', 60, 1, 3600);
    else fail('Unknown diagnostic option');
  }
  if (options.live && options.replay) fail('Choose live ingestion or replay');
  return options;
}
export function liveConfiguration(env) {
  if (env.HYBRID_MQTT_ENABLE !== 'true') fail('Live MQTT disabled: explicitly set HYBRID_MQTT_ENABLE=true');
  let url;
  try { url = new URL(env.MQTT_BROKER_URL); } catch { fail('Set a valid TLS MQTT_BROKER_URL'); }
  if (url.protocol !== 'mqtts:' || !url.hostname || url.username || url.password || url.search || url.hash ||
    !['', '/'].includes(url.pathname) || (url.port && url.port !== '8883')) fail('Use mqtts TLS on port 8883 with separate credentials');
  const username = env.MQTT_USERNAME?.trim(), password = env.MQTT_PASSWORD;
  if (!username || !password || username.startsWith('your-') || password.startsWith('your-')) fail('Configure MQTT credentials privately');
  const nodeIds = env.HYBRID_NODE_IDS?.split(',').map(node => node.trim()) ?? [];
  if (!nodeIds.length || nodeIds.length > 32 || nodeIds.some(node => !validNodeId(node)) || new Set(nodeIds).size !== nodeIds.length) fail('Set explicit unique HYBRID_NODE_IDS');
  if (env.HYBRID_FULL_ZONE_COVERAGE !== undefined && !['true', 'false'].includes(env.HYBRID_FULL_ZONE_COVERAGE)) fail('Coverage must be explicitly true or false');
  const config = {
    required_node_ids: nodeIds,
    full_zone_coverage: env.HYBRID_FULL_ZONE_COVERAGE === 'true',
    stale_after_ms: integer(env.HYBRID_STALE_AFTER_MS, 90_000, 1000, 3_600_000),
    disconnected_after_ms: integer(env.HYBRID_DISCONNECTED_AFTER_MS, 180_000, 2000, 7_200_000)
  };
  if (config.disconnected_after_ms <= config.stale_after_ms) fail('Disconnected threshold must exceed stale threshold');
  return {
    url: url.href, config,
    diagnostic_interval_ms: integer(env.HYBRID_DIAGNOSTIC_INTERVAL_MS, 5000, 100, 30_000),
    mqttOptions: { username, password, clientId: `omnisense-hybrid-diagnostics-${randomUUID()}`,
      clean: true, protocolVersion: 4, reconnectPeriod: 2000, connectTimeout: 10_000,
      rejectUnauthorized: true, resubscribe: false, queueQoSZero: false }
  };
}

export async function replayFixture(path, write = console.log) {
  let fixture;
  try { fixture = JSON.parse(await readFile(path, 'utf8')); } catch { fail('Unable to read diagnostic replay fixture'); }
  if (fixture?.schema_version !== 'omnisense.mqtt-replay.v1' || !Array.isArray(fixture.steps) || fixture.steps.length > 10000) fail('Invalid replay fixture');
  const monitor = createHardwareMonitor(fixture.config, 'REPLAY');
  for (const step of fixture.steps) {
    const at = Date.parse(step.at);
    if (!Number.isFinite(at)) fail('Replay requires explicit valid timestamps');
    if (step.action === 'connect') monitor.setConnected(true);
    else if (step.action === 'disconnect') monitor.setConnected(false);
    else if (step.action === 'message') {
      const packet = fixture.packets?.[step.packet];
      if (!packet) fail('Unknown replay packet');
      monitor.ingest(step.topic ?? `omnisense/node/${packet.node_id}/telemetry`, JSON.stringify(packet), step.flags ?? {}, at);
    } else if (step.action !== 'tick') fail('Unknown replay action');
    const diagnostic = monitor.evaluate(at);
    if (diagnostic) write(JSON.stringify(diagnostic));
  }
}

export async function runLive(configuration, seconds, write = console.log) {
  const { default: mqtt } = await import('mqtt'); // No MQTT import/connection in default or replay mode.
  const monitor = createHardwareMonitor(configuration.config, 'LIVE');
  let printedAt = -Infinity, previousState;
  const emit = diagnostic => {
    const at = Date.parse(diagnostic.evaluated_at);
    const state = JSON.stringify([diagnostic.transport, diagnostic.event, diagnostic.zone,
      diagnostic.nodes.map(n => [n.freshness, n.occupancy, n.system_active, n.source, n.class_label, n.ai_label,
        n.temperature_c?.validity, n.humidity_percent?.validity])]);
    if (state !== previousState || at - printedAt >= configuration.diagnostic_interval_ms) {
      printedAt = at;
      previousState = state;
      write(JSON.stringify(diagnostic));
    }
  };
  const client = mqtt.connect(configuration.url, configuration.mqttOptions);
  const detach = attachMqttMonitor(client, monitor, configuration.config.required_node_ids, Date.now,
    code => write(JSON.stringify({ mode: 'LIVE', status: code })), emit);
  let finish;
  const stopped = new Promise(resolve => { finish = resolve; });
  const tick = () => {
    const diagnostic = monitor.evaluate(Date.now());
    if (diagnostic) emit(diagnostic);
  };
  const interval = setInterval(tick, configuration.diagnostic_interval_ms);
  const deadline = setTimeout(finish, seconds * 1000);
  process.once('SIGINT', finish);
  process.once('SIGTERM', finish);
  try {
    write(JSON.stringify({ mode: 'LIVE', status: 'STARTED_SUBSCRIBE_ONLY', duration_seconds: seconds }));
    tick();
    await stopped;
    tick();
  } finally {
    clearInterval(interval);
    clearTimeout(deadline);
    process.removeListener('SIGINT', finish);
    process.removeListener('SIGTERM', finish);
    detach();
    client.on('error', () => {}); // Suppress raw transport errors during forced socket cleanup.
    client.end(true);
    write(JSON.stringify({ mode: 'LIVE', status: 'STOPPED' }));
  }
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const options = argumentsFor(argv);
  if (options.help || (!options.live && !options.replay)) {
    console.log('Hybrid MQTT diagnostics disabled by default. No network or database access.');
    console.log('Replay: node hybrid-mqtt.mjs --replay test/fixtures/firmware-replay.json');
    console.log('Live: HYBRID_MQTT_ENABLE=true plus private MQTT configuration; node hybrid-mqtt.mjs --live [--seconds 60]');
    return;
  }
  if (options.replay) await replayFixture(options.replay);
  else await runLive(liveConfiguration(env), options.seconds);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error instanceof DiagnosticError ? error.message : 'Hybrid diagnostics failed; check local configuration/build. No raw error or credentials logged.');
    process.exitCode = 1;
  });
}
