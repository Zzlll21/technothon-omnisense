import { SCHEMA_VERSION, NODE_CLASSES, validateSdpEvent, isUtcTimestamp, coolingPolicy } from "../../../packages/sdp-contract/dist/index.js";
import type { SdpEvent, ZoneConfig, ZoneDecision, ZoneForecast, AppliedOutput, NodeEvidence, CoolingMode, OutputSetting, Observation } from "../../../packages/sdp-contract/dist/index.js";

export const MODEL_VERSION = "sdp-scripted-v1";
export const STEP_MS = 30_000;
export const HISTORY_MS = 7 * 24 * 60 * 60_000;
export const HISTORY_INTERVAL_MS = 300_000;
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const OFFSET = 8 * 60 * MINUTE;
export const NODE_IDS = ["sim-1", "sim-2"] as const;
export interface Run {
  run_id: string;
  seed: number;
  model_version: typeof MODEL_VERSION;
  history_start: string;
  live_anchor: string;
  config: ZoneConfig;
}
export interface Checkpoint {
  sequence: number;
  simulated_at: string;
  temperature_c: number;
  humidity_percent: number;
  decision: ZoneDecision;
  forecast: ZoneForecast;
  output: AppliedOutput;
}
export interface Tick {
  run_id: string;
  expected_sequence: number;
  frame: {
    sequence: number; simulated_at: string; phase: "HISTORY" | "CONTINUOUS";
    occupancy: "OCCUPIED" | "VACANT"; coverage: "COMPLETE";
    decision_event_id: string; forecast_event_id: string; output_event_id: string;
  };
  samples: { node_id: string; observed_at: string; temperature_c: number; humidity_percent: number; evidence_event_id: string }[];
  events: SdpEvent[];
  checkpoint: Checkpoint;
}
const iso = (ms: number) => new Date(ms).toISOString();
const round = (n: number) => Math.round(n * 1000) / 1000;

export function createRun(runId: string, anchor: string, seed = 42): Run {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(runId)) throw new Error("run_id must be a UUID");
  runId = runId.toLowerCase();
  const ms = Date.parse(anchor);
  if (!isUtcTimestamp(anchor) || ms % STEP_MS !== 0) throw new Error("live_anchor must align to a UTC 30-second boundary");
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 2_147_483_647) throw new Error("seed must be an integer in [0, 2147483647]");
  const base: Omit<Run, "config"> = { run_id: runId, seed, model_version: MODEL_VERSION, history_start: iso(ms - HISTORY_MS), live_anchor: iso(ms) };
  const config = envelope(base, "ZONE_CONFIG", "C", "config", base.history_start, {
    config_version: MODEL_VERSION, effective_from: base.history_start,
    controller_id: "scripted-controller", actuator_id: "simulated-actuator", actuation_kind: "FAN_PROXY",
    required_nodes: [{ node_id: "sim-1", label: "Left sensor", x: 0.3, y: 0.5 }, { node_id: "sim-2", label: "Right sensor", x: 0.7, y: 0.5 }],
    representative_environment_node_id: "sim-1",
    freshness: { stale_after_ms: 360_000, disconnected_after_ms: 720_000, max_clock_skew_ms: 5_000 },
    vacancy_confirmation_ms: 300_000, min_mode_dwell_ms: 30_000, override_max_duration_ms: 3_600_000,
    limits: { temperature_min_c: 23, temperature_max_c: 30, humidity_max_percent: 70, occupied_target_c: 24.5 }
  }) as ZoneConfig;
  validate(config);
  return { ...base, config };
}

function envelope(run: Pick<Run, "run_id">, type: SdpEvent["event_type"], component: SdpEvent["producer"]["component"], key: string, at: string, payload: unknown): SdpEvent {
  return {
    schema_version: SCHEMA_VERSION, event_type: type, event_id: `${run.run_id}:${key}`,
    correlation_id: `${run.run_id}:${at}`, session_id: run.run_id, room_id: "demo-room", zone_id: "zone-1",
    occurred_at: at, clock: { time_base: "REPLAY", replay_id: run.run_id },
    producer: { component, producer_id: MODEL_VERSION }, data_sources: ["SIMULATED"], payload
  } as SdpEvent;
}
function validate(event: SdpEvent) {
  const result = validateSdpEvent(event);
  if (!result.ok) throw new Error(result.errors.join("; "));
}

// A published demo timetable, not an occupancy-fusion or forecasting algorithm.
export function schedule(at: number) {
  const midnight = Math.floor((at + OFFSET) / DAY) * DAY - OFFSET;
  const periods = [[480, 600, 4], [615, 720, 6], [780, 900, 3], [915, 1020, 5]];
  const windows = [-1, 0, 1].flatMap(day => periods.map(([start, end, people]) => ({
    start: midnight + day * DAY + start * MINUTE, end: midnight + day * DAY + end * MINUTE, people
  })));
  const current = windows.find(w => at >= w.start && at < w.end);
  const next = windows.find(w => w.start > at)!;
  const previous = windows.filter(w => w.end <= at).at(-1)!;
  const nextGap = next.start - windows.filter(w => w.end <= next.start).at(-1)!.end;
  return { people: current?.people ?? 0, next, vacant_since: current ? null : previous.end,
    planned_restart: next.start - (nextGap >= 30 * MINUTE ? 10 * MINUTE : 0) };
}
export { coolingPolicy };
export function scriptedState(at: number) {
  const plan = schedule(at);
  const occupancy = plan.people ? "OCCUPIED" as const : "VACANT" as const;
  return { ...plan, occupancy, ...coolingPolicy(at, occupancy, plan.vacant_since,
    { next_use_at: plan.next.start, planned_restart_at: plan.planned_restart }) };
}

export function nextTimestamp(run: Run, previous: Checkpoint | null): string {
  if (!previous) return run.history_start;
  const last = Date.parse(previous.simulated_at);
  const anchor = Date.parse(run.live_anchor);
  return iso(last < anchor ? Math.min(last + HISTORY_INTERVAL_MS, anchor) : last + STEP_MS);
}

export function generateTick(run: Run, previous: Checkpoint | null): Tick {
  if (run.model_version !== MODEL_VERSION || run.config.payload.config_version !== MODEL_VERSION) throw new Error("Unsupported model/config version; create a new run instead");
  const at = nextTimestamp(run, previous);
  const time = Date.parse(at);
  const seq = (previous?.sequence ?? -1) + 1;
  let temperature = previous?.temperature_c ?? 25;
  let humidity = previous?.humidity_percent ?? 60;
  // Fixed integration steps make backfill, continuous running and restart agree.
  for (let t = previous ? Date.parse(previous.simulated_at) + STEP_MS : time; t <= time; t += STEP_MS) {
    const s = scriptedState(t);
    const wave = Math.sin(t / DAY * 2 * Math.PI + run.seed * 0.01);
    const target = s.mode === "LONG_VACANCY" ? 28.5 + wave * 0.5 : s.mode === "SHORT_VACANCY" ? 26.5 : 24.5 + s.people * 0.04;
    temperature += (target - temperature) * 0.015;
    humidity += (57 + s.people * 0.7 + (s.mode === "LONG_VACANCY" ? 6 : 0) + wave - humidity) * 0.01;
  }
  const s = scriptedState(time);
  const events: SdpEvent[] = previous ? [] : [run.config];
  const observe = <T>(value: T): Observation<T> => ({ value, source: "SIMULATED", source_id: MODEL_VERSION, observed_at: at, validity: "VALID" });
  const samples = NODE_IDS.map((node, i) => {
    // Non-overlapping demo footprints split a single shared population.
    const people = i === 0 ? Math.ceil(s.people / 2) : Math.floor(s.people / 2);
    const label = people === 0 ? "EMPTY_CORE" : people === 1 ? "OCCUPIED_1P" : people === 2 ? "OCCUPIED_2P" : "OCCUPIED_3P_PLUS";
    const temp = round(temperature + (i === 0 ? -0.15 : 0.15));
    const rh = round(humidity + (i === 0 ? -0.3 : 0.3));
    const evidence = envelope(run, "NODE_EVIDENCE", "A_B", `${seq}:${node}`, at, {
      node_id: node, model_version: "scripted-class-labels-not-tinyml", firmware_version: "no-firmware-simulated",
      classification: observe({ class_label: label, class_scores: Object.fromEntries(NODE_CLASSES.map(c => [c, c === label ? 1 : 0])), headcount_category: people === 0 ? "ZERO" : people === 1 ? "ONE" : people === 2 ? "TWO" : "THREE_PLUS" }),
      temperature_c: observe(temp), humidity_percent: observe(rh)
    }) as NodeEvidence;
    events.push(evidence);
    return { node_id: node, observed_at: at, temperature_c: temp, humidity_percent: rh, evidence_event_id: evidence.event_id };
  });
  let forecast = previous?.forecast;
  if (!forecast || forecast.payload.next_use_window?.start !== iso(s.next.start)) {
    forecast = envelope(run, "ZONE_FORECAST", "D", `${seq}:forecast`, at, {
      status: "ACTIVE", source: "BOOKING", quality: "MEDIUM",
      next_use_window: { start: iso(s.next.start), end: iso(s.next.start + 5 * MINUTE) },
      planned_restart_at: iso(s.planned_restart), expires_at: iso(s.next.start),
      method_version: "synthetic-booking-not-prediction-v1", cooling_model_version: "scripted-ten-minute-lead-v1",
      supersedes_event_id: previous?.forecast.event_id ?? null, status_reason: "Simulated timetable; not a real booking or trained forecast"
    }) as ZoneForecast;
    events.push(forecast);
  }
  let decision = previous?.decision;
  let output = previous?.output;
  if (!decision || decision.payload.occupancy !== s.occupancy || decision.payload.requested_mode !== s.mode || decision.payload.forecast_event_id !== forecast.event_id || decision.payload.vacancy_confirmed_at !== s.vacancy_confirmed_at) {
    const reason = s.people ? "OCCUPIED_EVIDENCE" : s.mode === "PRECOOL" ? "FORECAST_RESTART" : s.mode === "LONG_VACANCY" ? "LONG_GAP" : s.mode === "SHORT_VACANCY" ? "SHORT_GAP" : "CONSERVATIVE_FALLBACK";
    decision = envelope(run, "ZONE_DECISION", "C", `${seq}:decision`, at, {
      command_id: `${run.run_id}:${seq}:command`, config_event_id: run.config.event_id,
      occupancy: s.occupancy, coverage: "COMPLETE", requested_mode: s.mode, requested_output: s.output,
      reason_code: reason, reason_text: `Scripted demo: ${reason.toLowerCase().replaceAll("_", " ")}`,
      evaluated_at: at, vacancy_confirmed_at: s.vacancy_confirmed_at,
      node_states: samples.map(n => ({ node_id: n.node_id, state: "FRESH", evidence_event_id: n.evidence_event_id })),
      forecast_event_id: forecast.event_id, override_request_id: null
    }) as ZoneDecision;
    output = envelope(run, "APPLIED_OUTPUT", "B", `${seq}:output`, at, {
      command_id: decision.payload.command_id, decision_event_id: decision.event_id, actuator_id: "simulated-actuator",
      status: "APPLIED", reported_output: s.output, feedback_basis: "SIMULATED", reason: "Zero-lag scripted acknowledgement; no physical actuation"
    }) as AppliedOutput;
    events.push(decision, output);
  }
  if (!decision || !output) throw new Error("Missing initial decision/output");
  events.forEach(validate);
  const checkpoint = { sequence: seq, simulated_at: at, temperature_c: temperature, humidity_percent: humidity, decision, forecast, output };
  return {
    run_id: run.run_id, expected_sequence: seq - 1,
    frame: { sequence: seq, simulated_at: at, phase: time <= Date.parse(run.live_anchor) ? "HISTORY" : "CONTINUOUS", occupancy: s.occupancy, coverage: "COMPLETE", decision_event_id: decision.event_id, forecast_event_id: forecast.event_id, output_event_id: output.event_id },
    samples, events, checkpoint
  };
}
