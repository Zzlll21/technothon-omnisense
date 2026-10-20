import { AlertTriangle, Radio } from "lucide-react";
import type { NodeEvidence, NodeState, ZoneSnapshot } from "../../../../../packages/sdp-contract/src/index";
import { formatOutput, formatSdpTime, modeLabels, ObservationValue, SdpBadge, sourceLabels } from "./display";
import type { BadgeTone } from "./display";

const nodeLabels: Record<NodeState, string> = {
  FRESH: "Fresh", STALE: "Stale", DISCONNECTED: "Disconnected", MISSING: "Missing", INVALID: "Invalid"
};
const nodeTones: Record<NodeState, BadgeTone> = {
  FRESH: "normal", STALE: "attention", DISCONNECTED: "alert", MISSING: "attention", INVALID: "alert"
};
const headcountLabels = { ZERO: "0", ONE: "1", TWO: "2", THREE_PLUS: "3 or more", UNCERTAIN: "Uncertain" };

export function ZoneStatusPanel({ snapshot, zoneName, zoneId }: {
  snapshot: ZoneSnapshot;
  zoneName: string;
  zoneId: string;
}) {
  const { config, decision, output } = snapshot;
  const occupancy = decision?.payload.occupancy;
  const requiredNodes = config?.payload.required_nodes ?? [];
  const nodeWarnings = decision?.payload.node_states.filter(node => node.state !== "FRESH") ?? [];

  return (
    <>
      <section className="sdp-zone-section" aria-labelledby="sdp-zone-heading">
        <div className="sdp-section-heading">
          <div>
            <p className="sdp-kicker">Zone overview</p>
            <h2 id="sdp-zone-heading">{zoneName}</h2>
            <p className="sdp-meta">{zoneId}{config ? ` \u00b7 ${config.room_id}` : ""}</p>
          </div>
          <SdpBadge tone={occupancy === "OCCUPIED" ? "normal" : occupancy === "VACANT" ? "info" : "attention"}>
            {occupancy ?? "Occupancy unavailable"}
          </SdpBadge>
        </div>

        <div className="sdp-zone-summary">
          <div><span>Combined occupancy</span><strong>{occupancy ?? "Unavailable"}</strong><small>Reported by controller C</small></div>
          <div><span>Evidence coverage</span><strong>{decision?.payload.coverage ?? "Unknown"}</strong><small>{requiredNodes.length} required nodes</small></div>
          <div><span>Evaluated at</span><strong className="sdp-time">{formatSdpTime(decision?.payload.evaluated_at)}</strong></div>
        </div>

        {nodeWarnings.length > 0 && (
          <div className="sdp-notice sdp-notice-attention" role="status">
            <AlertTriangle size={19} aria-hidden="true" />
            <span>Evidence warning: {nodeWarnings.map(node => `${node.node_id} (${nodeLabels[node.state].toLowerCase()})`).join(", ")}.
              {" "}Zone occupancy above is the controller's reported assessment.</span>
          </div>
        )}
        {!config && <p className="message-panel">Zone configuration unavailable. Required nodes cannot be identified.</p>}
        {!decision && <p className="message-panel">No controller decision. Occupancy, connectivity assessment and requested mode are unavailable.</p>}

        <h3 className="sdp-subheading">Required sensor nodes</h3>
        <div className="sdp-node-grid">
          {requiredNodes.map(node => {
            const assessment = decision?.payload.node_states.find(item => item.node_id === node.node_id);
            // Display the exact evidence C evaluated, not an unrelated newer node reading.
            const evidence = decision
              ? snapshot.events.find((event): event is NodeEvidence =>
                event.event_type === "NODE_EVIDENCE" && event.event_id === assessment?.evidence_event_id &&
                event.payload.node_id === node.node_id)
              : snapshot.nodes.find(event => event.payload.node_id === node.node_id);
            const classification = evidence?.payload.classification;
            return (
              <article className="sdp-node" key={node.node_id}>
                <div className="sdp-node-heading">
                  <div><h4><Radio size={17} aria-hidden="true" /> {node.node_id}</h4><p>{node.label}</p></div>
                  <SdpBadge tone={assessment ? nodeTones[assessment.state] : "neutral"}>
                    {assessment ? nodeLabels[assessment.state] : "Not assessed"}
                  </SdpBadge>
                </div>
                {evidence ? (
                  <>
                    <dl className="sdp-facts sdp-node-facts">
                      <div><dt>Temperature</dt><dd><ObservationValue observation={evidence.payload.temperature_c} unit={" \u00b0C"} /></dd></div>
                      <div><dt>Humidity</dt><dd><ObservationValue observation={evidence.payload.humidity_percent} unit="%" /></dd></div>
                      <div><dt>Headcount category</dt><dd>{classification?.validity === "VALID" ? headcountLabels[classification.value.headcount_category] : "Unavailable"}
                        <small className="sdp-source">{classification ? sourceLabels[classification.source] : "No classification"}</small></dd></div>
                    </dl>
                    <p className="sdp-meta">Evidence: {formatSdpTime(evidence.occurred_at)}</p>
                  </>
                ) : <p className="sdp-meta">{assessment?.state === "MISSING" ? "No sensor evidence." : "Referenced sensor evidence unavailable."}</p>}
              </article>
            );
          })}
        </div>
      </section>

      <section className="sdp-section" aria-labelledby="sdp-cooling-heading">
        <div className="sdp-section-heading">
          <div><p className="sdp-kicker">Controller C / Output B</p><h2 id="sdp-cooling-heading">Cooling decision &amp; response</h2></div>
          {config && <SdpBadge>{config.payload.actuation_kind === "FAN_PROXY" ? "Fan proxy" : "HVAC interface"}</SdpBadge>}
        </div>
        <div className="sdp-control-columns">
          <div>
            <h3>Requested cooling</h3>
            <p className="sdp-primary-value">{decision ? modeLabels[decision.payload.requested_mode] : "Unavailable"}</p>
            <p>{decision?.payload.reason_text ?? "Waiting for a controller decision."}</p>
            <dl className="sdp-facts">
              <div><dt>Requested output</dt><dd>{formatOutput(decision?.payload.requested_output ?? null)}</dd></div>
              <div><dt>Reason code</dt><dd className="sdp-code">{decision?.payload.reason_code ?? "Unavailable"}</dd></div>
              <div><dt>Decision time</dt><dd>{formatSdpTime(decision?.occurred_at)}</dd></div>
              <div><dt>Command ID</dt><dd className="sdp-code">{decision?.payload.command_id ?? "Unavailable"}</dd></div>
            </dl>
          </div>
          <div>
            <h3>Reported applied output</h3>
            <SdpBadge tone={output?.payload.status === "APPLIED" ? "normal" :
              output?.payload.status === "FAILED" || output?.payload.status === "REJECTED" ? "alert" : "info"}>
              {output?.payload.status ?? (decision ? "Awaiting report" : "No decision")}
            </SdpBadge>
            <p className="sdp-primary-value sdp-output-value">
              {output?.payload.status === "APPLIED" ? formatOutput(output.payload.reported_output) : "Application not confirmed"}
            </p>
            {output?.payload.reason && <p>{output.payload.reason}</p>}
            <dl className="sdp-facts">
              <div><dt>Application time</dt><dd>{output?.payload.status === "APPLIED" ? formatSdpTime(output.occurred_at) : "Not confirmed"}</dd></div>
              <div><dt>Report time</dt><dd>{formatSdpTime(output?.occurred_at)}</dd></div>
              <div><dt>Feedback basis</dt><dd>{output ? {
                FIRMWARE_REPORT: "Firmware report (not physical verification)",
                PHYSICAL_FEEDBACK: "Physical feedback", SIMULATED: "Simulated test output"
              }[output.payload.feedback_basis] : "Unavailable"}</dd></div>
              <div><dt>Actuator</dt><dd>{output?.payload.actuator_id ?? config?.payload.actuator_id ?? "Unavailable"}</dd></div>
            </dl>
          </div>
        </div>
      </section>
    </>
  );
}
