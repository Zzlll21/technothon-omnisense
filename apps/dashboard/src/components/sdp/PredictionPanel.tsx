import type { ZoneSnapshot } from "../../../../../packages/sdp-contract/src/index";
import { formatSdpTime, SdpBadge } from "./display";

export function PredictionPanel({ snapshot }: { snapshot: ZoneSnapshot }) {
  const { forecast, forecast_state: state, decision } = snapshot;
  const payload = forecast?.payload;
  const active = state === "ACTIVE";
  return (
    <section className="sdp-section" aria-labelledby="sdp-prediction-heading">
      <div className="sdp-section-heading">
        <div>
          <p className="sdp-kicker">Prediction D / Not a measurement</p>
          <h2 id="sdp-prediction-heading">Next-use forecast</h2>
        </div>
        <SdpBadge tone={active ? "info" : state === "EXPIRED" ? "attention" : "neutral"}>{state}</SdpBadge>
      </div>
      {!forecast ? (
        <p className="message-panel">No prediction record for this zone.</p>
      ) : (
        <>
          {state !== "ACTIVE" && (
            <p className="sdp-notice">{state === "EXPIRED" ? "Forecast expired. Previous estimates below are no longer valid." :
              state === "CANCELLED" ? "Forecast cancelled. No active prediction." : "Prediction unavailable."}
              {payload?.status_reason ? ` ${payload.status_reason}` : ""}</p>
          )}
          <dl className="sdp-facts sdp-prediction-grid">
            <div><dt>{active ? "Expected next use" : "Previous next-use estimate"}</dt>
              <dd>{payload?.next_use_window
                ? <>{formatSdpTime(payload.next_use_window.start)}<br />to {formatSdpTime(payload.next_use_window.end)}</>
                : "Not available"}</dd></div>
            <div><dt>{active ? "Planned cooling restart" : "Previous restart estimate"}</dt>
              <dd>{formatSdpTime(payload?.planned_restart_at)}</dd></div>
            <div><dt>Forecast quality</dt><dd>{payload?.quality}</dd></div>
            <div><dt>Forecast source</dt><dd>{payload ? { HISTORY: "History", BOOKING: "Booking", NONE: "Unavailable" }[payload.source] : "Unavailable"}</dd></div>
            <div><dt>Issued at</dt><dd>{formatSdpTime(forecast.occurred_at)}</dd></div>
            <div><dt>Expires at</dt><dd>{formatSdpTime(payload?.expires_at)}</dd></div>
          </dl>
          <p className="sdp-meta">{decision?.payload.forecast_event_id === forecast.event_id
            ? "Referenced by the current controller decision."
            : "Not referenced by the current controller decision."}{" "}
            Method: {payload?.method_version}. Validity uses the selected event clock.</p>
        </>
      )}
    </section>
  );
}
