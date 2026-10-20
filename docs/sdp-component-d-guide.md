# Component D - Occupancy Prediction Integration

**Review draft: `sdp.v1-draft.1`.** Use the existing
[contract](sdp-contract-v1.md), [types](../packages/sdp-contract/src/types.ts) and
[validator](../packages/sdp-contract/src/validate.ts). JSON is language independent;
the Node.js utility validates output from any implementation. Examples are
simulated test data.

## Inputs and Responsibility

- Consume C's `ZONE_DECISION` history for the agreed session/room/zone/time base:
  `occupancy`, `coverage`, `evaluated_at`, `vacancy_confirmed_at`, `node_states`
  and config references. Use authoritative combined occupancy, not summed node
  counts or legacy PMV readings. Preserve uncertain intervals and evidence gaps.
- Use the relevant `ZONE_CONFIG` and agreed environmental/cooling assumptions.
  Bookings may supply a separate forecast source, but their import format and
  updates still require agreement. No booking or history service exists yet.
- Restrict inputs to information available at forecast issue time. Replay uses
  its virtual clock; future arrivals/ground truth belong to evaluation, not
  predictor input. Agree interval reconstruction and late-data handling with C.
- Produce immutable `ZONE_FORECAST` events. C decides whether to request cooling;
  D does not publish `ZONE_DECISION` or actuator commands. The kit does not
  implement a prediction model.

## Required ZoneForecast Fields

Include every [common envelope field](sdp-contract-v1.md#common-envelope), with
`producer.component: "D"`. Every field below is required, including nullable keys.

| Payload field | Rule |
| --- | --- |
| `status` | `ACTIVE`, `CANCELLED`, `UNAVAILABLE`. `EXPIRED` is a consumer display state, not a wire enum. |
| `source` | `HISTORY`, `BOOKING`, `NONE`. Booking and learned history must remain distinguishable. |
| `quality` | `HIGH`, `MEDIUM`, `LOW`, `UNAVAILABLE`; qualitative, not an invented probability. |
| `next_use_window` | `{start, end}` UTC times or `null`; end must follow start. ACTIVE requires a window. |
| `planned_restart_at` | UTC restart proposal or `null`; ACTIVE requires a value at/before window start. |
| `expires_at` | UTC plan deadline, required in every state. For ACTIVE it must follow `occurred_at`. |
| `method_version` | Non-empty method/version label. |
| `cooling_model_version` | Assumed response-model version or `null`; no claim of measured AC performance. |
| `supersedes_event_id` | Prior forecast event being replaced/cancelled, or `null` for a first event. |
| `status_reason` | Explanation or `null`; non-empty for CANCELLED and UNAVAILABLE. |

`data_sources` describes input provenance (`MEASURED`, `PROXY_TEST`, `SIMULATED`,
`UNAVAILABLE`), while `payload.source` describes the forecasting basis. Neither
turns an estimate into a measured future arrival. The draft has no `confidence`,
`history_event_ids` or `next_use_at` field; traceability extensions need agreement
and versioning rather than extra keys added to draft.1.

## Valid Active JSON

This exact catalog event is available as
[d-zone-forecast.valid.json](../packages/sdp-contract/fixtures/integration/d-zone-forecast.valid.json).
The `precool` scenario shows C referencing its event ID.

```json
{
  "schema_version": "sdp.v1-draft.1",
  "event_type": "ZONE_FORECAST",
  "event_id": "forecast-return",
  "correlation_id": "forecast-return",
  "session_id": "sdp-fixture-session",
  "room_id": "room-demo",
  "zone_id": "zone-demo",
  "occurred_at": "2026-10-20T08:02:00.000Z",
  "clock": { "time_base": "REPLAY", "replay_id": "sdp-review-replay" },
  "producer": { "component": "D", "producer_id": "fixture-d" },
  "data_sources": ["SIMULATED"],
  "payload": {
    "status": "ACTIVE",
    "source": "HISTORY",
    "quality": "LOW",
    "next_use_window": {
      "start": "2026-10-20T08:30:00.000Z",
      "end": "2026-10-20T08:35:00.000Z"
    },
    "planned_restart_at": "2026-10-20T08:03:00.000Z",
    "expires_at": "2026-10-20T08:31:40.000Z",
    "method_version": "scripted-history-fixture-1",
    "cooling_model_version": "assumed-cooling-fixture-1",
    "supersedes_event_id": null,
    "status_reason": null
  }
}
```

These fixture times/lead times are review examples, not adopted cooling settings.
A past-dated ACTIVE event can still validate as a historical record. The CLI
checks expiry relative to issue time; the adapter checks display expiry against
the caller's explicit `as_of`. It does not compare replay records with today.

## Cancellation, Unavailable and Invalid Messages

| Example | Exact representation |
| --- | --- |
| [Cancelled JSON](../packages/sdp-contract/fixtures/integration/d-zone-forecast.cancelled.json) | New event, `status: "CANCELLED"`, `supersedes_event_id: "forecast-return"`, non-empty `status_reason`, null window and restart. Existing example retains HISTORY source and has UNAVAILABLE quality. |
| [Unavailable JSON](../packages/sdp-contract/fixtures/integration/d-zone-forecast.unavailable.json) | New event, `status: "UNAVAILABLE"`, `quality: "UNAVAILABLE"`, null window/restart, reason explaining sparse history. Existing example uses `source: "NONE"`. |
| [Invalid JSON](../packages/sdp-contract/fixtures/integration/d-zone-forecast.invalid.json) | Complete event with invalid `status: "EXPIRED"`, invalid `quality: "VERY_HIGH"`, and omitted `expires_at`. Must fail. |

Cancellation and unavailable records still contain all other envelope/payload
keys, including `expires_at`. The current validator permits sources other than
NONE on UNAVAILABLE; use the source that honestly describes the failed basis.
Do not silently narrow the contract in a language-specific implementation.

Expected invalid-example diagnostics include:

```text
event.payload.status: expected ACTIVE | CANCELLED | UNAVAILABLE
event.payload.quality: expected HIGH | MEDIUM | LOW | UNAVAILABLE
event.payload.expires_at: expected valid UTC ISO timestamp ending in Z
```

An otherwise valid ACTIVE event also fails if window end is at/before start,
restart is after window start, or expiry is at/before issue. Updates use a new
event ID and `supersedes_event_id`; keep prior records immutable. Current
single-event validation cannot resolve that reference or enforce full update
ordering. Expiry/cancellation causes C to decide its own fallback.

## Local Validation and Handoff

From the repository root in Windows PowerShell, after the
[one-time setup](sdp-integration-kit.md#local-setup-and-validation):

```powershell
node .\packages\sdp-contract\bin\validate.mjs --file .\packages\sdp-contract\fixtures\integration\d-zone-forecast.valid.json --type ZONE_FORECAST
$LASTEXITCODE  # 0
node .\packages\sdp-contract\bin\validate.mjs --file .\packages\sdp-contract\fixtures\integration\d-zone-forecast.cancelled.json --type ZONE_FORECAST
node .\packages\sdp-contract\bin\validate.mjs --file .\packages\sdp-contract\fixtures\integration\d-zone-forecast.unavailable.json --type ZONE_FORECAST
node .\packages\sdp-contract\bin\validate.mjs --file .\packages\sdp-contract\fixtures\integration\d-zone-forecast.invalid.json --type ZONE_FORECAST
$LASTEXITCODE  # 1: expected rejection
Get-Content -Raw .\my-d-forecast.json | node .\packages\sdp-contract\bin\validate.mjs --stdin --type ZONE_FORECAST
```

Deliver sample history selection, forecast JSON, input cutoff/replay clock,
method/model versions and intended update/cancellation behavior for review. Test
`precool`, `expired-forecast`, `cancelled-forecast` and `unavailable-forecast`
against the existing scenario catalog. Before live transport, agree forecast
quality meanings, booking format, thermal lead-time assumptions, expiry policy
and history traceability with C/E. See the [handoff plan](sdp-integration-kit.md).
