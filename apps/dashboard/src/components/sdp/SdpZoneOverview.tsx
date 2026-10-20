import { useEffect, useMemo, useState } from "react";
import { FlaskConical, RotateCw } from "lucide-react";
import { getSdpMockScenario, listSdpMockScenarios } from "../../api/sdp";
import type { EventQuery, SdpDataSource, ZoneSnapshot } from "../../../../../packages/sdp-contract/src/index";
import { SCHEMA_VERSION } from "../../../../../packages/sdp-contract/src/index";
import type { QueryState } from "../../types/readings";
import { PredictionPanel } from "./PredictionPanel";
import { ZoneStatusPanel } from "./ZoneStatusPanel";
import { formatSdpTime, SdpBadge } from "./display";

const scenarios = listSdpMockScenarios();

/** Mock selection is isolated from the source-independent, read-only zone view. */
export function SdpZoneOverview() {
  const [scenarioId, setScenarioId] = useState("normal-occupied");
  const scenario = useMemo(() => getSdpMockScenario(scenarioId), [scenarioId]);
  return (
    <div className="sdp-overview">
      <div className="sdp-demo-banner">
        <FlaskConical size={22} aria-hidden="true" />
        <div><strong>Simulated test data</strong><p>SDP integration draft. No live controller or physical output.</p></div>
        <SdpBadge tone="info">{SCHEMA_VERSION}</SdpBadge>
      </div>
      <div className="sdp-scenario-toolbar">
        {import.meta.env.DEV ? (
          <label htmlFor="sdp-scenario">Test scenario
            <select id="sdp-scenario" value={scenarioId} onChange={event => setScenarioId(event.target.value)}>
              {scenarios.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
        ) : <p className="sdp-meta">{scenario.label}</p>}
        <p className="sdp-meta">Replay snapshot<br /><time dateTime={scenario.query.as_of}>{formatSdpTime(scenario.query.as_of)}</time></p>
      </div>
      <SdpZoneView key={scenario.id} source={scenario.source} query={scenario.query} zoneName="Demo cooling zone" />
    </div>
  );
}

/** A future backend only needs to implement SdpDataSource; no telemetry conversion is needed. */
export function SdpZoneView({ source, query, zoneName }: {
  source: SdpDataSource;
  query: EventQuery;
  zoneName: string;
}) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<QueryState<ZoneSnapshot | null>>({
    status: "loading", data: null, error: null, isEmpty: true
  });
  useEffect(() => {
    let active = true;
    setState({ status: "loading", data: null, error: null, isEmpty: true });
    async function load() {
      try {
        const snapshot = await source.getZoneSnapshot(query);
        if (active) setState({ status: "success", data: snapshot, error: null, isEmpty: snapshot.events.length === 0 });
      } catch {
        if (active) setState({
          status: "error", data: null, isEmpty: true,
          error: "SDP records could not be loaded. The data source may be unavailable or contain invalid contract events."
        });
      }
    }
    void load();
    return () => { active = false; };
  }, [source, query, attempt]);

  if (state.status === "loading") return <p className="message-panel" role="status">Loading SDP zone records...</p>;
  if (state.status === "error") return (
    <div className="message-panel error-panel" role="alert">
      <p>{state.error}</p>
      <button className="sdp-retry" type="button" onClick={() => setAttempt(value => value + 1)}>
        <RotateCw size={18} aria-hidden="true" /> Retry
      </button>
    </div>
  );
  if (state.isEmpty || !state.data) return <p className="message-panel" role="status">No SDP records for this zone, session and event time.</p>;
  return (
    <>
      <ZoneStatusPanel snapshot={state.data} zoneName={zoneName} zoneId={query.zone_id} />
      <PredictionPanel snapshot={state.data} />
    </>
  );
}
