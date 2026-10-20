import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Download, FlaskConical, RotateCw } from "lucide-react";
import type { EventQuery, OverrideRequest, OverrideStatus, SdpDataSource, SdpEvent } from "../../../../../packages/sdp-contract/src/index";
import { getLocalOverrideHistory, getSdpMockScenario, listSdpMockScenarios } from "../../api/sdp";
import type { QueryState } from "../../types/readings";
import { describeRecord, eventTypeLabels, exportRecordsCsv, filterRecords, forecastExpiryReached, loadOperatingRecords } from "../../lib/sdpRecords";
import { formatOutput, SdpBadge, sourceLabels } from "./display";

const scenarios = listSdpMockScenarios();

export function OperatingRecords({ localOverrideEvents = [], selection = null }: {
  localOverrideEvents?: readonly (OverrideRequest | OverrideStatus)[];
  selection?: { scenarioId: string; requestId: string } | null;
}) {
  const [scenarioId, setScenarioId] = useState("return-to-automatic");
  const localHistory = useMemo(() => getLocalOverrideHistory(localOverrideEvents), [localOverrideEvents]);
  const localSelected = scenarioId === "local-overrides" && !!localHistory;
  const scenario = useMemo(() => getSdpMockScenario(scenarioId === "local-overrides" ? "normal-occupied" : scenarioId), [scenarioId]);
  const queries = useMemo(() => [scenario.query], [scenario]);
  const activeQueries = localSelected ? localHistory.queries : queries;
  useEffect(() => { if (selection) setScenarioId(selection.scenarioId); }, [selection]);
  return (
    <div className="sdp-overview">
      <div className="sdp-demo-banner">
        <FlaskConical size={22} aria-hidden="true" />
        <div><strong>Simulated Test Data</strong><p>Operating records / {activeQueries[0].clock.time_base} / {activeQueries[0].clock.replay_id}</p></div>
      </div>
      <div className="sdp-scenario-toolbar">
        <label htmlFor="records-scenario">Recorded scenario
          <select id="records-scenario" value={scenarioId} onChange={event => setScenarioId(event.target.value)}>
            {scenarios.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            {localHistory && <option value="local-overrides">Local simulated override requests</option>}
          </select>
        </label>
        <p className="sdp-meta">Replay cutoff (UTC)<br /><time dateTime={activeQueries[0].as_of}>{activeQueries[0].as_of}</time></p>
      </div>
      <OperatingRecordsView key={scenarioId} source={localSelected ? localHistory.source : scenario.source} queries={activeQueries}
        initialRequestId={selection?.scenarioId === scenarioId ? selection.requestId : ""} />
    </div>
  );
}

/** A source can supply multiple zone queries within the same session/replay cutoff. */
export function OperatingRecordsView({ source, queries, initialRequestId = "" }: { source: SdpDataSource; queries: readonly EventQuery[]; initialRequestId?: string }) {
  const [state, setState] = useState<QueryState<SdpEvent[]>>({ status: "loading", data: [], error: null, isEmpty: true });
  const [attempt, setAttempt] = useState(0);
  const [zoneId, setZoneId] = useState("");
  const [eventType, setEventType] = useState("");
  const [requestId, setRequestId] = useState(initialRequestId);
  useEffect(() => { setRequestId(initialRequestId); }, [initialRequestId]);
  const [exportError, setExportError] = useState<string | null>(null);
  const events = useMemo(() => filterRecords(state.data, zoneId, eventType, requestId), [state.data, zoneId, eventType, requestId]);
  const zones = [...new Set(queries.map(query => query.zone_id))].sort();
  const asOf = queries[0]?.as_of ?? "";
  useEffect(() => {
    let active = true;
    setState({ status: "loading", data: [], error: null, isEmpty: true });
    setExportError(null);
    void loadOperatingRecords(source, queries).then(data => {
      if (active) setState({ status: "success", data, error: null, isEmpty: data.length === 0 });
    }).catch(() => {
      if (active) setState({ status: "error", data: [], isEmpty: true, error: "Operating records could not be loaded. Check the event source and selected session." });
    });
    return () => { active = false; };
  }, [source, queries, attempt]);

  function downloadCsv() {
    setExportError(null);
    try {
      const csv = exportRecordsCsv(events, asOf, state.data);
      const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "sdp-operating-records.csv";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setExportError("CSV export could not be created. Please try again.");
    }
  }

  return (
    <section aria-labelledby="operating-records-heading">
      <div className="sdp-section-heading">
        <div><p className="sdp-kicker">Event history / UTC</p><h2 id="operating-records-heading">Operating Records</h2><p className="sdp-meta">Recorded events, oldest first</p></div>
        <button className="sdp-retry" type="button" disabled={state.status !== "success" || events.length === 0} onClick={downloadCsv}>
          <Download size={18} aria-hidden="true" /> Export CSV
        </button>
      </div>
      <div className="sdp-record-filters">
        <label htmlFor="records-zone">Zone<select id="records-zone" value={zoneId} onChange={event => setZoneId(event.target.value)}>
          <option value="">All zones</option>{zones.map(zone => <option key={zone} value={zone}>{zone}</option>)}
        </select></label>
        <label htmlFor="records-type">Event type<select id="records-type" value={eventType} onChange={event => setEventType(event.target.value)}>
          <option value="">All event types</option>{Object.entries(eventTypeLabels).map(([type, label]) => <option key={type} value={type}>{label}</option>)}
        </select></label>
        <label htmlFor="records-request-id">Request ID (exact)<input id="records-request-id" type="text" value={requestId} placeholder="All requests" onChange={event => setRequestId(event.target.value)} /></label>
        <p className="sdp-meta" role="status">{state.status === "success" ? `${events.length} of ${state.data.length} records` : state.status === "loading" ? "Loading records..." : "Records unavailable"}</p>
      </div>
      {exportError && <p className="message-panel error-panel" role="alert">{exportError}</p>}
      {state.status === "error" ? (
        <div className="message-panel error-panel" role="alert"><p>{state.error}</p><button className="sdp-retry" type="button" onClick={() => setAttempt(value => value + 1)}><RotateCw size={18} aria-hidden="true" /> Retry records</button></div>
      ) : state.status === "loading" ? (
        <p className="message-panel">Loading operating records...</p>
      ) : events.length === 0 ? (
        <p className="message-panel" role="status">{state.isEmpty ? "No recorded events for this session, zone and cutoff." : "No events match the selected filters."}</p>
      ) : (
        <ol className="sdp-record-list" aria-label="Chronological operating records">
          {events.map(event => <RecordRow key={event.event_id} event={event} asOf={asOf} />)}
        </ol>
      )}
    </section>
  );
}

function RecordRow({ event, asOf }: { event: SdpEvent; asOf: string }) {
  const details = describeRecord(event);
  const forecast = event.event_type === "ZONE_FORECAST" ? event.payload : null;
  return (
    <li className={`sdp-record sdp-record-${details.tone}`}>
      <div className="sdp-record-time"><time dateTime={event.occurred_at}>{event.occurred_at}</time><span>{event.zone_id}</span><span>{event.producer.component} / {event.producer.producer_id}</span></div>
      <div className="sdp-record-content">
        <div className="sdp-record-heading"><h3>{details.title}</h3><SdpBadge tone={details.tone}>{details.status}</SdpBadge></div>
        <p>{details.summary}</p>
        {details.reason && <p className="sdp-record-reason">{details.reason}</p>}
        {event.event_type === "ZONE_DECISION" && <p className="sdp-meta">Requested: {formatOutput(event.payload.requested_output)}</p>}
        {event.event_type === "APPLIED_OUTPUT" && event.payload.status === "APPLIED" && <p className="sdp-meta">Reported applied: {formatOutput(event.payload.reported_output)}</p>}
        {forecast && <p className="sdp-meta">Expiry: {forecast.expires_at}{forecast.supersedes_event_id ? ` / Replaces: ${forecast.supersedes_event_id}` : ""}</p>}
        {forecastExpiryReached(event, asOf) && <p className="sdp-record-expiry">Expired by {event.clock.time_base === "REPLAY" ? "replay" : "query"} cutoff / deadline {forecast?.expires_at}. Derived expiry annotation; no separate expiry event was recorded.</p>}
        <div className="sdp-record-provenance">{event.data_sources.map(source => <SdpBadge key={source} tone={source === "SIMULATED" ? "info" : "neutral"}>{sourceLabels[source]}</SdpBadge>)}<span className="sdp-meta">{event.event_id}</span></div>
        <details className="sdp-record-details">
          <summary><ChevronDown size={16} aria-hidden="true" /> Event details</summary>
          <dl className="sdp-facts sdp-record-details-grid">
            <div><dt>Event type</dt><dd>{event.event_type}</dd></div>
            <div><dt>Correlation ID</dt><dd>{event.correlation_id}</dd></div>
            <div><dt>Session</dt><dd>{event.session_id}</dd></div>
            <div><dt>Time base</dt><dd>{event.clock.time_base} / {event.clock.replay_id ?? "Live"}</dd></div>
            {details.reasonCode && <div><dt>Reason code</dt><dd>{details.reasonCode}</dd></div>}
          </dl>
          <pre aria-label={`Original event JSON ${event.event_id}`}>{JSON.stringify(event, null, 2)}</pre>
        </details>
      </div>
    </li>
  );
}
