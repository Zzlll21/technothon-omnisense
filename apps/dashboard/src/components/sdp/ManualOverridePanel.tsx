import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ExternalLink, FlaskConical, RotateCcw, RotateCw, Send } from "lucide-react";
import type { EventQuery, OverrideRequest, OverrideStatus, SdpDataSource, ZoneConfig, ZoneSnapshot } from "../../../../../packages/sdp-contract/src/index";
import { validateSdpEvent } from "../../../../../packages/sdp-contract/src/index";
import { getSdpMockScenario, listSdpMockScenarios } from "../../api/sdp";
import { createAutomaticReturn, createOccupiedOverride, createPendingOverride, overrideLifecycle } from "../../lib/sdpOverrides";
import type { QueryState } from "../../types/readings";
import { formatOutput, SdpBadge } from "./display";
import type { BadgeTone } from "./display";

const scenarios = listSdpMockScenarios();
const statusTones: Record<OverrideStatus["payload"]["status"], BadgeTone> = {
  PENDING: "info", ACCEPTED: "info", APPLIED: "normal", REJECTED: "alert", FAILED: "alert", EXPIRED: "neutral", CANCELLED: "neutral"
};

export function ManualOverridePanel({ localEvents, onLocalEvents, onViewRecords }: {
  localEvents: readonly (OverrideRequest | OverrideStatus)[];
  onLocalEvents: (events: (OverrideRequest | OverrideStatus)[]) => void;
  onViewRecords: (scenarioId: string, requestId: string) => void;
}) {
  const [scenarioId, setScenarioId] = useState("override-applied");
  const [reviewOffset, setReviewOffset] = useState(0);
  const scenario = useMemo(() => getSdpMockScenario(scenarioId), [scenarioId]);
  const queries = useMemo(() => [{ ...scenario.query, as_of: new Date(Date.parse(scenario.query.as_of) + reviewOffset).toISOString() }], [scenario, reviewOffset]);
  return (
    <div className="sdp-overview">
      <div className="sdp-demo-banner"><FlaskConical size={22} aria-hidden="true" /><div><strong>Simulated Test Data</strong><p>Timed override rehearsal / local requests only / no device delivery</p></div><SdpBadge tone="info">REPLAY</SdpBadge></div>
      <div className="sdp-scenario-toolbar sdp-override-review">
        <label htmlFor="override-scenario">Lifecycle example<select id="override-scenario" value={scenarioId} onChange={event => { setScenarioId(event.target.value); setReviewOffset(0); }}>
          {scenarios.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select></label>
        <label htmlFor="override-clock">Review time<select id="override-clock" value={reviewOffset} onChange={event => setReviewOffset(Number(event.target.value))}>
          <option value={0}>Fixture cutoff</option><option value={30000}>30 seconds later</option><option value={2400000}>40 minutes later</option>
        </select></label>
      </div>
      <p className="sdp-meta">Replay clock: {queries[0].as_of} / {queries[0].clock.replay_id}</p>
      <SdpManualOverrideView key={`${scenarioId}:${reviewOffset}`} source={scenario.source} queries={queries} localEvents={localEvents} onLocalEvents={onLocalEvents}
        onViewRecords={(requestId, local) => onViewRecords(local ? "local-overrides" : scenarioId, requestId)} />
    </div>
  );
}

export function SdpManualOverrideView({ source, queries, localEvents, onLocalEvents, onViewRecords }: {
  source: SdpDataSource;
  queries: readonly EventQuery[];
  localEvents: readonly (OverrideRequest | OverrideStatus)[];
  onLocalEvents: (events: (OverrideRequest | OverrideStatus)[]) => void;
  onViewRecords?: (requestId: string, local: boolean) => void;
}) {
  const [zoneId, setZoneId] = useState(queries[0]?.zone_id ?? "");
  const query = queries.find(item => item.zone_id === zoneId) ?? queries[0];
  const [state, setState] = useState<QueryState<ZoneSnapshot | null>>({ status: "loading", data: null, error: null, isEmpty: true });
  const [attempt, setAttempt] = useState(0);
  const [selectedId, setSelectedId] = useState("");
  useEffect(() => {
    let active = true;
    setState({ status: "loading", data: null, error: null, isEmpty: true });
    if (!query) { setState({ status: "success", data: null, error: null, isEmpty: true }); return; }
    void source.getZoneSnapshot(query).then(snapshot => {
      if (active) setState({ status: "success", data: snapshot, error: null, isEmpty: snapshot.events.length === 0 });
    }).catch(() => {
      if (active) setState({ status: "error", data: null, error: "Override records could not be loaded. Check the simulated event source.", isEmpty: true });
    });
    return () => { active = false; };
  }, [source, query, attempt]);

  const snapshot = state.data;
  const events = snapshot && query ? [...snapshot.events, ...localEvents.filter(event => event.session_id === query.session_id && event.zone_id === query.zone_id &&
    event.clock.time_base === query.clock.time_base && event.clock.replay_id === query.clock.replay_id && Date.parse(event.occurred_at) <= Date.parse(query.as_of))] : [];
  const requests = events.filter((event): event is OverrideRequest => event.event_type === "OVERRIDE_REQUEST")
    .sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at) || a.event_id.localeCompare(b.event_id));
  const requestId = requests.some(event => event.payload.request_id === selectedId) ? selectedId : requests.at(-1)?.payload.request_id ?? "";
  const trace = overrideLifecycle(events, requestId, query?.as_of ?? "");
  const nodeWarnings = snapshot?.decision?.payload.node_states.filter(node => node.state !== "FRESH") ?? [];
  const isLocal = !!trace.request && localEvents.some(event => event.event_id === trace.request?.event_id);

  return (
    <section className="sdp-section sdp-override-section" aria-labelledby="manual-override-heading">
      <div className="sdp-section-heading"><div><p className="sdp-kicker">SDP / Operator request</p><h2 id="manual-override-heading">Timed Manual Override</h2></div>
        <label className="sdp-override-zone" htmlFor="override-zone">Cooling zone<select id="override-zone" value={query?.zone_id ?? ""} onChange={event => { setZoneId(event.target.value); setSelectedId(""); }} disabled={queries.length === 0}>
          {queries.map(item => <option key={item.zone_id} value={item.zone_id}>{item.zone_id}</option>)}
        </select></label></div>
      {state.status === "loading" ? <p className="message-panel" role="status">Loading override records...</p> : state.status === "error" ? (
        <div className="message-panel error-panel" role="alert"><p>{state.error}</p><button className="sdp-retry" type="button" onClick={() => setAttempt(value => value + 1)}><RotateCw size={18} aria-hidden="true" /> Retry overrides</button></div>
      ) : !query || !snapshot ? <p className="message-panel" role="status">No zone or override configuration is available.</p> : (
        <>
          {nodeWarnings.length > 0 && <p className="sdp-notice sdp-notice-attention" role="status">Recorded node warning: {nodeWarnings.map(node => `${node.node_id}: ${node.state}`).join(" / ")}. Assessment time: {snapshot.decision?.payload.evaluated_at}.</p>}
          {requests.length === 0 && snapshot.override_statuses.length > 0 && <p className="sdp-notice sdp-notice-attention" role="status">Status records exist, but the original request is missing. Correlation and expiry cannot be verified.</p>}
          {!snapshot.config ? <p className="sdp-notice sdp-notice-attention" role="status">Zone configuration missing. Permitted settings are unknown; request controls are unavailable.</p> : (
            <OverrideComposer key={`${snapshot.config.event_id}:${query.zone_id}`} config={snapshot.config} query={query} target={trace.canReturn ? trace.request : null}
              onCreated={(records, id) => { onLocalEvents(records); setSelectedId(id); }} />
          )}
          <div className="sdp-section-heading sdp-section">
            <div><p className="sdp-kicker">Correlated request history</p><h3>Override lifecycle</h3></div>
            {trace.request && onViewRecords && <button className="sdp-retry" type="button" onClick={() => onViewRecords(requestId, isLocal)}><ExternalLink size={17} aria-hidden="true" /> Operating records</button>}
          </div>
          {requests.length === 0 ? <p className="message-panel" role="status">No override request records. A local simulation will remain pending until a separate controller response exists.</p> : (
            <>
              <label className="sdp-override-request" htmlFor="override-request-id">Request ID<select id="override-request-id" value={requestId} onChange={event => setSelectedId(event.target.value)}>
                {requests.map(request => <option key={request.event_id} value={request.payload.request_id}>{request.payload.request_id} / {request.payload.action}</option>)}
              </select></label>
              {trace.request && <>
                <p className="sdp-meta">{isLocal ? "Local simulated request" : "Recorded fixture request"} / Correlation: {trace.request.correlation_id}</p>
                <div className="sdp-override-stages" aria-label="Request outcome stages">
                  <div><span>Request submitted</span><SdpBadge tone="info">Recorded by E</SdpBadge><small>{trace.request.occurred_at}</small></div>
                  <div><span>Controller response</span><SdpBadge tone={trace.acknowledged ? statusTones[trace.acknowledged.payload.status] : "neutral"}>{trace.acknowledged?.payload.status ?? "Not acknowledged"}</SdpBadge><small>{trace.acknowledged?.occurred_at ?? "No C response for this request"}</small></div>
                  <div><span>Device reported applied</span><SdpBadge tone={trace.appliedOutput ? "normal" : "neutral"}>{trace.appliedOutput ? "Recorded application" : "Not confirmed"}</SdpBadge><small>{trace.appliedOutput ? `${trace.appliedOutput.occurred_at} / ${trace.appliedOutput.payload.feedback_basis}` : "No correlated B APPLIED report"}</small></div>
                </div>
                <dl className="sdp-facts sdp-override-facts">
                  <div><dt>Requested operation</dt><dd>{trace.request.payload.action === "SET_OVERRIDE" ? `OCCUPIED${trace.request.payload.requested_setpoint_c === null ? "" : ` / ${trace.request.payload.requested_setpoint_c.toFixed(1)} \u00b0C`}` : `Return to Automatic / target ${trace.request.payload.target_request_id}`}</dd></div>
                  <div><dt>Acceptance deadline</dt><dd>{trace.request.payload.valid_until}</dd></div>
                  <div><dt>Requested expiry</dt><dd>{trace.request.payload.action === "SET_OVERRIDE" ? trace.request.payload.override_expires_at : "Not applicable to Return to Automatic"}</dd></div>
                  <div><dt>Controller-reported end</dt><dd>{trace.acknowledged?.payload.effective_until ?? "Not reported"}</dd></div>
                  <div><dt>Latest recorded status</dt><dd>{trace.latest?.payload.status ?? "No status record"}</dd></div>
                </dl>
                {trace.appliedOutput && <p className="sdp-meta">Recorded output: {formatOutput(trace.appliedOutput.payload.reported_output)}. Feedback basis: {trace.appliedOutput.payload.feedback_basis}.</p>}
                {trace.acknowledgementTimedOut && <p className="sdp-notice sdp-notice-attention" role="status">Acknowledgement deadline passed at replay time. Controller outcome unknown; this is not a FAILED or EXPIRED controller report.</p>}
                {trace.endUnconfirmed && <p className="sdp-notice sdp-notice-attention" role="status">Override end deadline passed at replay time. No controller expiry/cancellation confirmation. Package C must enforce expiry and automatic return.</p>}
                {trace.appliedReferenceMissing && <p className="sdp-notice sdp-notice-attention" role="status">C reported APPLIED, but its matching decision or B application record is missing. Device application is not confirmed here.</p>}
                <ol className="sdp-override-status-list" aria-label="Recorded override lifecycle">
                  {trace.statuses.map(status => <li key={status.event_id}><SdpBadge tone={statusTones[status.payload.status]}>{status.payload.status}</SdpBadge><time dateTime={status.occurred_at}>{status.occurred_at}</time><p>{status.payload.reason}</p><small>{status.event_id} / {status.producer.component} / {status.payload.request_id}</small></li>)}
                </ol>
                {trace.statuses.length === 0 && <p className="message-panel" role="status">Request record present; no matching status records.</p>}
                <details className="sdp-record-details"><summary>Original request JSON</summary><pre>{JSON.stringify(trace.request, null, 2)}</pre></details>
              </>}
            </>
          )}
        </>
      )}
    </section>
  );
}

function OverrideComposer({ config, query, target, onCreated }: {
  config: ZoneConfig; query: EventQuery; target: OverrideRequest | null;
  onCreated: (events: (OverrideRequest | OverrideStatus)[], requestId: string) => void;
}) {
  const maxMinutes = Math.floor(config.payload.override_max_duration_ms / 60000);
  const [minutes, setMinutes] = useState(String(Math.min(10, maxMinutes)));
  const [temperatureEnabled, setTemperatureEnabled] = useState(false);
  const [temperature, setTemperature] = useState(String(config.payload.limits.occupied_target_c));
  const [createdId, setCreatedId] = useState<string | null>(null);
  const created = createdId !== null;
  const [error, setError] = useState<string | null>(null);
  const locked = useRef(false);
  const enabled = query.clock.time_base === "REPLAY" && config.data_sources.includes("SIMULATED") && maxMinutes >= 1;

  function simulate(returnToAutomatic: boolean) {
    if (locked.current) return;
    setError(null);
    try {
      if (!enabled) throw new Error("A simulated replay configuration is required.");
      const id = crypto.randomUUID();
      const request = returnToAutomatic && target
        ? createAutomaticReturn(config, query, `local-override-${id}`, `local-request-${id}`, target)
        : !returnToAutomatic ? createOccupiedOverride(config, query, `local-override-${id}`, `local-request-${id}`, minutes.trim() ? Number(minutes) : NaN, temperatureEnabled ? (temperature.trim() ? Number(temperature) : NaN) : null)
        : null;
      if (!request) throw new Error("Select an accepted or applied occupied-operation request to return to automatic.");
      const pending = createPendingOverride(request, `local-status-${id}`);
      for (const event of [request, pending]) {
        const result = validateSdpEvent(event);
        if (!result.ok) throw new Error(result.errors.join("; "));
      }
      locked.current = true;
      onCreated([request, pending], request.payload.request_id);
      setCreatedId(request.payload.request_id);
    } catch (cause) {
      locked.current = false;
      setError(cause instanceof Error ? cause.message : "The local simulated request could not be created.");
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); simulate(false); }
  return (
    <form className="sdp-override-composer" onSubmit={submit}>
      <h3>Request occupied operation</h3>
      <p className="sdp-meta">Requested mode: OCCUPIED. Configured maximum: {maxMinutes} minutes. Package C owns actual acceptance and expiry.</p>
      <div className="sdp-override-inputs">
        <label htmlFor="override-duration">Duration (minutes)<input id="override-duration" type="number" min={1} max={maxMinutes} step={1} value={minutes} onChange={event => setMinutes(event.target.value)} required disabled={!enabled || created} /></label>
        <label className="sdp-override-check" htmlFor="override-temperature-enabled"><input id="override-temperature-enabled" type="checkbox" checked={temperatureEnabled} onChange={event => setTemperatureEnabled(event.target.checked)} disabled={!enabled || created} /> Request temperature setting</label>
        {temperatureEnabled && <label htmlFor="override-temperature">Temperature ({"\u00b0C"})<input id="override-temperature" type="number" min={config.payload.limits.temperature_min_c} max={config.payload.limits.temperature_max_c} step="0.1" value={temperature} onChange={event => setTemperature(event.target.value)} required disabled={!enabled || created} /></label>}
      </div>
      {temperatureEnabled && <p className="sdp-meta">Permitted range: {config.payload.limits.temperature_min_c}-{config.payload.limits.temperature_max_c} {"\u00b0C"}. These are simulated configuration limits.</p>}
      {!enabled && <p className="sdp-notice sdp-notice-attention">Simulation controls unavailable for this configuration.</p>}
      <div className="sdp-override-actions">
        <button className="sdp-retry" type="submit" disabled={!enabled || created}><Send size={18} aria-hidden="true" /> Simulate override request</button>
        <button className="sdp-retry" type="button" disabled={!enabled || created || !target} onClick={() => simulate(true)}><RotateCcw size={18} aria-hidden="true" /> Simulate Return to Automatic</button>
        {created && <button className="sdp-retry" type="button" onClick={() => { locked.current = false; setCreatedId(null); setError(null); }}><RotateCw size={17} aria-hidden="true" /> New simulation</button>}
      </div>
      <p className="sdp-meta">Return to Automatic targets the selected recorded ACCEPTED/APPLIED occupied request. Neither button sends a real command.</p>
      {created && <p className="sdp-notice" role="status">Simulated request submitted locally: {createdId}. PENDING only; no controller or device response was generated. The request is available in Operating Records.</p>}
      {error && <p className="message-panel error-panel" role="alert">{error}</p>}
    </form>
  );
}
