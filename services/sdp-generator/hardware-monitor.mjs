import { normalizeHardwareTelemetry } from './dist/hardwareTelemetry.js';
import { evaluateHardwareCooling } from './dist/hybridOffline.js';

const safeSources = new Set(['thermal_ai', 'thermal_blob_fallback', 'thermal_unavailable', 'none']);
const safeLabels = new Set(['EMPTY_CORE', 'OCCUPIED_1P', 'OCCUPIED_2P', 'OCCUPIED_3P_PLUS', 'THERMAL_ANOMALIES',
  'not_run', 'thermal_unavailable', 'input_size_mismatch', 'inference_failed']);
const safeToken = (value, allowed) => value === null || value === undefined ? null : allowed.has(value) ? value : 'OTHER';
export const validNodeId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value);

/** In-memory evidence owner. No network, file access, writer or actuator. */
export function createHardwareMonitor(config, mode = 'REPLAY') {
  if (!['LIVE', 'REPLAY'].includes(mode) || !config.required_node_ids.every(validNodeId)) throw new Error('Invalid diagnostic identity/mode');
  // Use the Stage 1 configuration validation before accepting any data.
  evaluateHardwareCooling('2026-01-01T00:00:00.000Z', [], config);
  const cache = new Map();
  const active = new Set();
  const counters = { accepted: 0, rejected: 0, duplicate_flags: 0, retained_flags: 0 };
  let connected = false, checkpoint = null, lastEvaluation = -Infinity, lastClock = -Infinity;
  let clockBlockedUntil = -Infinity, event = 'AWAITING_CONNECTION';
  const reset = () => { active.clear(); checkpoint = null; };
  function time(at) {
    if (!Number.isSafeInteger(at) || !Number.isFinite(new Date(at).getTime())) throw new Error('Invalid gateway time');
    if (at < lastClock) {
      clockBlockedUntil = lastClock;
      reset();
      event = 'CLOCK_REGRESSION';
      return false;
    }
    lastClock = at;
    return at >= clockBlockedUntil;
  }
  function invalidate(node, reason) {
    if (node) active.delete(node);
    checkpoint = null;
    event = reason;
  }
  return {
    setConnected(value) {
      connected = value === true;
      reset(); // No pre-disconnect empty evidence may survive a transport gap.
      event = connected ? 'SUBSCRIBED_AWAITING_FRESH_PACKETS' : 'TRANSPORT_UNAVAILABLE';
    },
    ingest(topic, text, packet = {}, at) {
      if (!time(at)) { counters.rejected++; return false; }
      const node = /^omnisense\/node\/([^/]+)\/telemetry$/.exec(topic)?.[1];
      if (!node || !config.required_node_ids.includes(node)) { counters.rejected++; event = 'UNMAPPED_TOPIC'; return false; }
      if (!connected) { counters.rejected++; invalidate(node, 'NOT_SUBSCRIBED'); return false; }
      if (packet.retain || packet.dup) {
        counters.rejected++;
        if (packet.retain) counters.retained_flags++;
        if (packet.dup) counters.duplicate_flags++;
        invalidate(node, packet.retain ? 'RETAINED_REJECTED' : 'DUPLICATE_FLAG_REJECTED');
        return false;
      }
      if (typeof text !== 'string' || text.length > 4096) {
        counters.rejected++; invalidate(node, 'PAYLOAD_REJECTED'); return false;
      }
      const result = normalizeHardwareTelemetry(topic, text, {
        received_at: new Date(at).toISOString(), allowed_node_ids: config.required_node_ids, retained: false
      });
      if (!result.ok) { counters.rejected++; invalidate(node, 'PAYLOAD_REJECTED'); return false; }
      // A transient occupied/unknown reading must break vacancy even if a later
      // empty packet arrives before the next periodic diagnostic evaluation.
      if (result.value.occupancy.value !== 'VACANT' || result.value.occupancy.validity !== 'VALID') checkpoint = null;
      cache.set(node, result.value);
      active.add(node);
      counters.accepted++;
      event = 'PACKET_ACCEPTED';
      return true;
    },
    evaluate(at) {
      if (!time(at) || at <= lastEvaluation) return null; // Never fabricate increasing wall timestamps.
      lastEvaluation = at;
      const readings = connected ? [...active].map(node => cache.get(node)) : [];
      const assessment = evaluateHardwareCooling(new Date(at).toISOString(), readings, config, checkpoint);
      checkpoint = assessment.checkpoint;
      const nodes = assessment.nodes.map(node => {
        const reading = cache.get(node.node_id);
        return {
          node_id: node.node_id,
          received_at: reading?.received_at ?? null,
          age_ms: reading ? Math.max(0, at - Date.parse(reading.received_at)) : null,
          freshness: !connected ? 'DISCONNECTED' : node.state,
          current_session_evidence: connected && active.has(node.node_id),
          headcount: reading?.headcount ?? null,
          occupancy: node.occupancy,
          system_active: reading?.metadata.system_active ?? null,
          source: safeToken(reading?.metadata.headcount_source, safeSources),
          class_label: reading?.occupancy.class_label ?? null,
          ai_label: safeToken(reading?.metadata.thermal_ai_label, safeLabels),
          ai_confidence: reading?.metadata.thermal_ai_confidence ?? null,
          // Last known values remain attributed to their original receipt and freshness.
          temperature_c: reading?.temperature_c ?? null,
          humidity_percent: reading?.humidity_percent ?? null
        };
      });
      return {
        mode, evaluated_at: new Date(at).toISOString(), time_basis: 'GATEWAY_RECEIPT',
        transport: connected ? 'SUBSCRIBED' : 'DISCONNECTED', event,
        nodes, zone: { occupancy: assessment.occupancy, coverage: assessment.coverage,
          requested_mode: assessment.requested_mode, requested_output: assessment.requested_output,
          feedback_basis: 'SIMULATED', vacancy_confirmed_at: assessment.vacancy_confirmed_at },
        forecast: assessment.forecast, counters: { ...counters }
      };
    }
  };
}

/** Bind a subscribe-only MQTT client. Transport errors are fixed tokens, never raw errors. */
export function attachMqttMonitor(client, monitor, nodeIds, now = Date.now, status = () => {}, diagnostic = () => {}) {
  let generation = 0, disposed = false;
  const unavailable = code => {
    generation++;
    monitor.setConnected(false);
    status(code);
  };
  const handlers = {
    connect() {
      const attempt = ++generation;
      monitor.setConnected(false);
      status('MQTT_CONNECTED_SUBSCRIBING');
      const topics = nodeIds.map(node => `omnisense/node/${node}/telemetry`);
      client.subscribe(topics, { qos: 0 }, (error, granted) => {
        if (disposed || attempt !== generation) return;
        if (error || !Array.isArray(granted) || granted.length !== nodeIds.length || granted.some((g, i) => g.topic !== topics[i] || g.qos !== 0)) {
          unavailable('MQTT_SUBSCRIPTION_FAILED');
          return;
        }
        monitor.setConnected(true);
        status('MQTT_SUBSCRIBED');
      });
    },
    message(topic, payload, packet) {
      // Byte bound precedes UTF-8 decoding. Do not log arbitrary packet contents.
      const at = now();
      monitor.ingest(topic, payload.length <= 4096 ? payload.toString('utf8') : null, packet, at);
      const result = monitor.evaluate(at);
      if (result) diagnostic(result);
    },
    offline() { unavailable('MQTT_OFFLINE'); },
    close() { unavailable('MQTT_CLOSED'); },
    disconnect() { unavailable('MQTT_DISCONNECTED'); },
    reconnect() { unavailable('MQTT_RECONNECTING'); },
    error() { unavailable('MQTT_ERROR'); }
  };
  for (const [name, handler] of Object.entries(handlers)) client.on(name, handler);
  return () => {
    disposed = true;
    generation++;
    for (const [name, handler] of Object.entries(handlers)) client.removeListener(name, handler);
    monitor.setConnected(false);
  };
}
