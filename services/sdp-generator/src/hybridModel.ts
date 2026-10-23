import { HYBRID_SCHEMA_VERSION, isUtcTimestamp, validateStoredSdpEvent } from '../../../packages/sdp-contract/dist/index.js';
import type { SdpEvent, ZoneConfig, NodeEvidence, ZoneDecision, ZoneForecast, AppliedOutput, Observation, ClassifierEvidence } from '../../../packages/sdp-contract/dist/index.js';
import { createRun, schedule, STEP_MS } from './model.js';
import { evaluateHardwareCooling } from './hybridOffline.js';
import type { HybridCheckpoint } from './hybridOffline.js';
import type { HardwareTelemetry } from './hardwareTelemetry.js';

export interface HybridRun {
  run_id: string; model_version: 'sdp-hybrid-v1'; seed: number;
  history_start: string; live_anchor: string; config: ZoneConfig;
  full_zone_coverage: boolean; heartbeat_ms: 30000; replaces_active_run_id: string | null;
}
export interface HardwareEntry { evidence_id: string; reading: HardwareTelemetry }
export interface HybridState {
  sequence: number; simulated_at: string; fusion: HybridCheckpoint;
  decision: ZoneDecision; forecast: ZoneForecast; output: AppliedOutput;
  evidence_ids: Record<string, string>;
}
export interface HybridSample {
  node_id: string; observed_at: string | null; sampled_at: string;
  temperature_c: number | null; humidity_percent: number | null;
  temperature_observed_at: string | null; humidity_observed_at: string | null;
  evidence_event_id: string | null;
}
export interface HybridTick {
  run_id: string; expected_sequence: number;
  frame: { sequence: number; simulated_at: string; phase: 'CONTINUOUS'; occupancy: 'OCCUPIED' | 'VACANT' | 'UNCERTAIN'; coverage: 'COMPLETE' | 'DEGRADED' | 'UNKNOWN'; decision_event_id: string; forecast_event_id: string; output_event_id: string };
  samples: HybridSample[]; events: SdpEvent[]; checkpoint: HybridState;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function envelope(run: HybridRun, event_type: SdpEvent['event_type'], key: string, at: string, component: SdpEvent['producer']['component'], payload: unknown, sources: SdpEvent['data_sources']): SdpEvent {
  return { schema_version: HYBRID_SCHEMA_VERSION, event_type, event_id: `${run.run_id}:${key}`, correlation_id: `${run.run_id}:${at}`, session_id: run.run_id,
    room_id: run.config.room_id, zone_id: 'zone-1', occurred_at: at, clock: { time_base: 'LIVE', replay_id: null }, producer: { component, producer_id: 'sdp-hybrid-v1' }, data_sources: sources, payload } as SdpEvent;
}
export function createHybridRun(runId: string, anchor: string, nodes: ZoneConfig['payload']['required_nodes'], options: { full_zone_coverage?: boolean; representative_node_id?: string; replaces_active_run_id?: string | null } = {}): HybridRun {
  if (!uuid.test(runId) || !isUtcTimestamp(anchor) || !nodes.length || nodes.length > 32 || new Set(nodes.map(n => n.node_id)).size !== nodes.length || nodes.some(n => !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(n.node_id))) throw new Error('Invalid hybrid run/inventory');
  if (options.replaces_active_run_id && (!uuid.test(options.replaces_active_run_id) || options.replaces_active_run_id.toLowerCase() === runId.toLowerCase())) throw new Error('Invalid acknowledged replacement run');
  // Reuse configuration defaults only; never generate synthetic hardware evidence.
  const base = createRun(runId, new Date(Math.floor(Date.parse(anchor) / STEP_MS) * STEP_MS).toISOString());
  const config: ZoneConfig = { ...base.config, schema_version: HYBRID_SCHEMA_VERSION, occurred_at: anchor, correlation_id: `${runId.toLowerCase()}:${anchor}`, producer: { component: 'C', producer_id: 'sdp-hybrid-v1' }, clock: { time_base: 'LIVE', replay_id: null }, data_sources: ['PROXY_TEST'],
    payload: { ...base.config.payload, config_version: 'sdp-hybrid-v1', effective_from: anchor, controller_id: 'hybrid-controller', required_nodes: nodes,
      representative_environment_node_id: options.representative_node_id ?? nodes[0].node_id,
      freshness: { stale_after_ms: 90_000, disconnected_after_ms: 180_000, max_clock_skew_ms: 5_000 } } };
  const checked = validateStoredSdpEvent(config);
  if (!checked.ok) throw new Error(checked.errors.join('; '));
  return { run_id: runId.toLowerCase(), model_version: 'sdp-hybrid-v1', seed: base.seed, history_start: anchor, live_anchor: anchor, config,
    full_zone_coverage: options.full_zone_coverage === true, heartbeat_ms: 30000, replaces_active_run_id: options.replaces_active_run_id?.toLowerCase() ?? null };
}

/** Pure transaction builder. Input evidence IDs are assigned once at gateway ingestion. */
export function prepareHybridTick(run: HybridRun, previous: HybridState | null, at: string, entries: readonly HardwareEntry[], assessment?: ReturnType<typeof evaluateHardwareCooling>): HybridTick {
  if (run.model_version !== 'sdp-hybrid-v1' || !isUtcTimestamp(at) || Date.parse(at) < Date.parse(run.live_anchor) || (previous && Date.parse(at) <= Date.parse(previous.simulated_at))) throw new Error('Invalid hybrid cutoff');
  if (entries.some(e => !e.evidence_id || Date.parse(e.reading.received_at) < Date.parse(run.live_anchor))) throw new Error('Evidence predates hybrid activation');
  const config = run.config.payload;
  const evaluated = assessment ?? evaluateHardwareCooling(at, entries.map(e => e.reading), { required_node_ids: config.required_nodes.map(n => n.node_id), full_zone_coverage: run.full_zone_coverage,
    stale_after_ms: config.freshness.stale_after_ms, disconnected_after_ms: config.freshness.disconnected_after_ms }, previous?.fusion ?? null);
  if (evaluated.checkpoint.evaluated_at !== at) throw new Error('Assessment/cutoff mismatch');
  const seq = (previous?.sequence ?? -1) + 1;
  const events: SdpEvent[] = previous ? [] : [run.config];
  const evidenceIds: Record<string, string> = {};
  const samples: HybridSample[] = config.required_nodes.map(node => {
    const entry = entries.find(e => e.reading.node_id === node.node_id);
    if (!entry) return { node_id: node.node_id, observed_at: null, sampled_at: at, temperature_c: null, humidity_percent: null, temperature_observed_at: null, humidity_observed_at: null, evidence_event_id: null };
    const r = entry.reading;
    evidenceIds[node.node_id] = entry.evidence_id;
    const classification: Observation<ClassifierEvidence> = r.occupancy.validity === 'VALID'
      ? { value: { class_label: r.occupancy.class_label!, class_scores: null, headcount_category: ['ZERO', 'ONE', 'TWO', 'THREE_PLUS'][r.headcount] as ClassifierEvidence['headcount_category'] }, source: 'MEASURED', source_id: `${node.node_id}/thermal`, observed_at: r.received_at, validity: 'VALID' }
      : { value: null, source: r.occupancy.validity === 'INVALID' ? 'MEASURED' : 'UNAVAILABLE', source_id: r.occupancy.validity === 'INVALID' ? `${node.node_id}/thermal` : null, observed_at: r.occupancy.validity === 'INVALID' ? r.received_at : null, validity: r.occupancy.validity };
    if (previous?.evidence_ids[node.node_id] !== entry.evidence_id) {
      const event = envelope(run, 'NODE_EVIDENCE', 'unused', r.received_at, 'A_B', { node_id: node.node_id, model_version: null, firmware_version: null, classification,
        temperature_c: r.temperature_c, humidity_percent: r.humidity_percent, hardware: { received_at: r.received_at, time_basis: 'GATEWAY_RECEIPT', device_observed_at: null, headcount: r.headcount,
          inference_method: r.occupancy.method, ...r.metadata } }, [...new Set([classification.source, r.temperature_c.source, r.humidity_percent.source])]) as NodeEvidence;
      event.event_id = entry.evidence_id;
      events.push(event);
    }
    return { node_id: node.node_id, observed_at: r.received_at, sampled_at: at, temperature_c: r.temperature_c.value, humidity_percent: r.humidity_percent.value,
      temperature_observed_at: r.temperature_c.observed_at, humidity_observed_at: r.humidity_percent.observed_at, evidence_event_id: entry.evidence_id };
  });
  const plan = schedule(Date.parse(at));
  let forecast = previous?.forecast;
  if (!forecast || forecast.payload.next_use_window?.start !== new Date(plan.next.start).toISOString()) {
    forecast = envelope(run, 'ZONE_FORECAST', `${seq}:forecast`, at, 'D', { status: 'ACTIVE', source: 'BOOKING', quality: 'MEDIUM',
      next_use_window: { start: new Date(plan.next.start).toISOString(), end: new Date(plan.next.start + 300_000).toISOString() }, planned_restart_at: new Date(plan.planned_restart).toISOString(), expires_at: new Date(plan.next.start).toISOString(),
      method_version: 'synthetic-booking-not-prediction-v1', cooling_model_version: 'scripted-ten-minute-lead-v1', supersedes_event_id: previous?.forecast.event_id ?? null,
      status_reason: 'Simulated timetable; not a real booking or trained forecast' }, ['SIMULATED']) as ZoneForecast;
    events.push(forecast);
  }
  const reason = evaluated.occupancy === 'OCCUPIED' ? 'OCCUPIED_EVIDENCE' : evaluated.occupancy === 'UNCERTAIN' ? 'UNCERTAIN_EVIDENCE' : evaluated.requested_mode === 'PRECOOL' ? 'FORECAST_RESTART' : evaluated.requested_mode === 'LONG_VACANCY' ? 'LONG_GAP' : evaluated.requested_mode === 'SHORT_VACANCY' ? 'SHORT_GAP' : 'CONSERVATIVE_FALLBACK';
  const decision = envelope(run, 'ZONE_DECISION', `${seq}:decision`, at, 'C', { command_id: `${run.run_id}:${seq}:command`, config_event_id: run.config.event_id,
    occupancy: evaluated.occupancy, coverage: evaluated.coverage, requested_mode: evaluated.requested_mode, requested_output: evaluated.requested_output, reason_code: reason, reason_text: evaluated.reason,
    evaluated_at: at, vacancy_confirmed_at: evaluated.vacancy_confirmed_at, node_states: evaluated.nodes.map(n => ({ node_id: n.node_id, state: n.state, evidence_event_id: evidenceIds[n.node_id] ?? null })),
    forecast_event_id: forecast.event_id, override_request_id: null }, [...new Set<SdpEvent['data_sources'][number]>(['SIMULATED', ...entries.map(e => e.reading.occupancy.source)])]) as ZoneDecision;
  const output = envelope(run, 'APPLIED_OUTPUT', `${seq}:output`, at, 'B', { command_id: decision.payload.command_id, decision_event_id: decision.event_id, actuator_id: 'simulated-actuator',
    status: 'APPLIED', reported_output: evaluated.requested_output, feedback_basis: 'SIMULATED', reason: 'Zero-lag scripted acknowledgement; no physical actuation' }, ['SIMULATED']) as AppliedOutput;
  events.push(decision, output);
  for (const event of events) { const checked = validateStoredSdpEvent(event); if (!checked.ok) throw new Error(checked.errors.join('; ')); }
  return { run_id: run.run_id, expected_sequence: seq - 1, frame: { sequence: seq, simulated_at: at, phase: 'CONTINUOUS', occupancy: evaluated.occupancy, coverage: evaluated.coverage,
    decision_event_id: decision.event_id, forecast_event_id: forecast.event_id, output_event_id: output.event_id }, samples, events,
    checkpoint: { sequence: seq, simulated_at: at, fusion: evaluated.checkpoint, decision, forecast, output, evidence_ids: evidenceIds } };
}
