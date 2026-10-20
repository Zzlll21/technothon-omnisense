import type { SupabaseClient } from "@supabase/supabase-js";
import { validateSdpEvent } from "../../../../packages/sdp-contract/src";
import type { SdpEvent, ZoneConfig } from "../../../../packages/sdp-contract/src";
import type { OverviewData, SdpRun, SdpZone, SdpNode, SdpFrame, SdpSample, StoredEvent } from "../types/overview";

const RUN = "run_id,model_version,status,last_sequence,last_simulated_at,history_start,live_anchor,updated_at";
const FRAME = "run_id,zone_id,sequence,simulated_at,inserted_at,phase,occupancy,coverage,decision_event_id,forecast_event_id,output_event_id";
const EVENTS = "event_id,sequence,ordinal,occurred_at,event";
class SnapshotChanged extends Error {}
function fail(): never { throw new Error("The SDP records are incomplete or inconsistent. Refresh the data and check the dedicated SDP project."); }
async function read<T>(query: PromiseLike<{ data: unknown; error: { code?: string } | null }>): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(error.code === "42501" ? "Read access is blocked. Check the SDP SELECT policies and publishable key." : "Unable to read the SDP dataset. Check your connection and that the URL points to omnisense-sdp.");
  if (!Array.isArray(data)) fail();
  return data as T[];
}
function event(value: unknown, runId: string, zoneId: string, cutoff: string): SdpEvent {
  const checked = validateSdpEvent(value);
  if (!checked.ok || checked.value.session_id !== runId || checked.value.zone_id !== zoneId || checked.value.clock.time_base !== "REPLAY" || checked.value.clock.replay_id !== runId || checked.value.data_sources.some(s => s !== "SIMULATED") || Date.parse(checked.value.occurred_at) > Date.parse(cutoff)) fail();
  return checked.value;
}
export async function fetchOverview(client: Pick<SupabaseClient, "from">, signal: AbortSignal): Promise<OverviewData | null> {
  // A publication switch may hide a run midway through the reads; retry once.
  for (let attempt = 0; attempt < 2; attempt++) {
    try { return await fetchSnapshot(client, signal); }
    catch (error) { if (!(error instanceof SnapshotChanged) || attempt) throw error; }
  }
  return null;
}
async function fetchSnapshot(client: Pick<SupabaseClient, "from">, signal: AbortSignal): Promise<OverviewData | null> {
  const runs = await read<SdpRun>(client.from("sdp_runs").select(RUN).eq("status", "ACTIVE").order("created_at", { ascending: false }).limit(2).abortSignal(signal));
  if (!runs.length) return null;
  if (runs.length !== 1) fail();
  const run = runs[0];
  if (!Number.isSafeInteger(run.last_sequence) || run.last_sequence < 0 || !Number.isFinite(Date.parse(run.last_simulated_at))) fail();
  const zones = await read<SdpZone>(client.from("sdp_zones").select("run_id,zone_id,room_id,name,config").eq("run_id", run.run_id).order("zone_id").limit(2).abortSignal(signal));
  if (!zones.length) throw new SnapshotChanged("The active dataset changed. Refresh to load the latest run.");
  if (zones.length !== 1) throw new Error("This Overview supports one cooling zone. Multiple zones require the next monitoring phase.");
  const zone = zones[0];
  const [frames, nodes] = await Promise.all([
    read<SdpFrame>(client.from("sdp_zone_frames").select(FRAME).eq("run_id", run.run_id).eq("zone_id", zone.zone_id).eq("sequence", run.last_sequence).limit(1).abortSignal(signal)),
    read<SdpNode>(client.from("sdp_nodes").select("run_id,zone_id,node_id,label,required,x,y").eq("run_id", run.run_id).eq("zone_id", zone.zone_id).order("node_id").limit(64).abortSignal(signal))
  ]);
  if (!frames.length) throw new SnapshotChanged("The active dataset changed. Refresh to load the latest frame.");
  const frame = frames[0];
  const config = event(zone.config, run.run_id, zone.zone_id, frame.simulated_at);
  if (config.event_type !== "ZONE_CONFIG" || frame.sequence !== run.last_sequence || frame.run_id !== run.run_id || frame.zone_id !== zone.zone_id || frame.simulated_at !== run.last_simulated_at) fail();
  const samples = await read<SdpSample>(client.from("sdp_node_samples").select("run_id,zone_id,sequence,node_id,observed_at,inserted_at,temperature_c,humidity_percent,evidence_event_id").eq("run_id", run.run_id).eq("zone_id", zone.zone_id).eq("sequence", frame.sequence).order("node_id").limit(64).abortSignal(signal));
  const ids = [...new Set([frame.decision_event_id, frame.forecast_event_id, frame.output_event_id, ...samples.map(s => s.evidence_event_id)])];
  const [linked, recent] = await Promise.all([
    read<StoredEvent>(client.from("sdp_events").select(EVENTS).eq("run_id", run.run_id).eq("zone_id", zone.zone_id).in("event_id", ids).lte("sequence", frame.sequence).limit(ids.length).abortSignal(signal)),
    read<StoredEvent>(client.from("sdp_events").select(EVENTS).eq("run_id", run.run_id).eq("zone_id", zone.zone_id).neq("event_type", "NODE_EVIDENCE").neq("event_type", "ZONE_CONFIG").lte("sequence", frame.sequence).order("occurred_at", { ascending: false }).order("sequence", { ascending: false }).order("ordinal", { ascending: false }).limit(5).abortSignal(signal))
  ]);
  const checked = linked.map(row => event(row.event, run.run_id, zone.zone_id, frame.simulated_at));
  const decision = checked.find(e => e.event_id === frame.decision_event_id);
  const forecast = checked.find(e => e.event_id === frame.forecast_event_id);
  const output = checked.find(e => e.event_id === frame.output_event_id);
  if (!decision || !forecast || !output) throw new SnapshotChanged("Linked records changed while loading. Refresh the dataset.");
  if (decision.event_type !== "ZONE_DECISION" || forecast.event_type !== "ZONE_FORECAST" || output.event_type !== "APPLIED_OUTPUT" || decision.payload.occupancy !== frame.occupancy || decision.payload.coverage !== frame.coverage || decision.payload.forecast_event_id !== forecast.event_id || decision.payload.config_event_id !== config.event_id || output.payload.decision_event_id !== decision.event_id || output.payload.command_id !== decision.payload.command_id) fail();
  const evidence = checked.filter(e => e.event_type === "NODE_EVIDENCE");
  for (const sample of samples) {
    const source = evidence.find(e => e.event_id === sample.evidence_event_id);
    if (sample.run_id !== run.run_id || sample.zone_id !== zone.zone_id || sample.sequence !== frame.sequence || !Number.isFinite(sample.temperature_c) || !Number.isFinite(sample.humidity_percent) || !Number.isFinite(Date.parse(sample.observed_at)) || Date.parse(sample.observed_at) > Date.parse(frame.simulated_at) || source?.payload.node_id !== sample.node_id || source.payload.temperature_c.value !== sample.temperature_c || source.payload.humidity_percent.value !== sample.humidity_percent || Date.parse(source.payload.temperature_c.observed_at ?? "") !== Date.parse(sample.observed_at) || Date.parse(source.payload.humidity_percent.observed_at ?? "") !== Date.parse(sample.observed_at)) fail();
  }
  return { run, zone: { ...zone, config: config as ZoneConfig }, frame, nodes, samples, decision, forecast, output, evidence,
    activity: recent.map(row => ({ ...row, event: event(row.event, run.run_id, zone.zone_id, frame.simulated_at) })) };
}
