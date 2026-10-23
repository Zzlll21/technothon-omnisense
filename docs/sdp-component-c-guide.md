# Component C - Cooling Controller Integration

> Historical integration reference: the examples and proposed interfaces below
> belong to the original draft kit. For the implemented Hybrid pipeline and
> remaining capabilities, read the [current submission scope](SDP-SUBMISSION.md)
> and [version-aware contract status](sdp-contract-v1.md). Use Node.js 24 for the
> existing validation utilities. These examples do not authorize live operation.

**Review draft: `sdp.v1-draft.1`.** This guide uses the existing
[contract](sdp-contract-v1.md), [types](../packages/sdp-contract/src/types.ts) and
[validator](../packages/sdp-contract/src/validate.ts). Every example is simulated
test data. C can be implemented in any language that produces the same JSON.

## Inputs and Outputs

| Direction | Record | Required behavior |
| --- | --- | --- |
| Consume A/B | `NODE_EVIDENCE` | Read classification and independent temperature/humidity observations, original observation times, validity and provenance. Missing/invalid input is not zero people. |
| Consume configuration | `ZONE_CONFIG` | Use the agreed zone's required nodes, limits, freshness/dwell/vacancy/override durations and actuator mapping. Team-approved config is published under C ownership. |
| Consume D | `ZONE_FORECAST` | Check status, scope, expiry, source and quality; handle superseding/cancelling events. C decides whether to use a forecast. |
| Consume E/gateway | `OVERRIDE_REQUEST` | Handle `SET_OVERRIDE` and `RETURN_TO_AUTOMATIC`, deadlines, requested settings and original request identity. |
| Consume B | `APPLIED_OUTPUT` | Correlate command and decision IDs; distinguish accepted, applied, rejected and failed. |
| Produce | `ZONE_DECISION` | Supply combined zone occupancy, evidence assessment, requested cooling and reason. E displays this result directly. |
| Produce | `OVERRIDE_STATUS` | C owns statuses after gateway/E's `PENDING`; publish acceptance/application/failure/expiry/cancellation records. |

C owns occupancy fusion, freshness, conservative fallback, dwell and cooling
decisions. This kit supplies message validation and examples, not those rules.
Multiple required nodes describe one cooling zone; overlapping counts must not
be blindly added. Keep observed occupancy separate from a requested mode: a
manual override may request `OCCUPIED` cooling while occupancy remains `VACANT`.

## Required ZoneDecision Fields

Include every [common envelope field](sdp-contract-v1.md#common-envelope).
`producer.component` is `C`. Every payload key below is required; nullable keys
must be present as `null` when unused. Unknown keys fail validation.

| Payload field | Required value / meaning |
| --- | --- |
| `command_id` | Non-empty stable directive ID; identical retries keep this ID/content. |
| `config_event_id` | Exact `ZONE_CONFIG.event_id` used by this decision. |
| `occupancy` | `OCCUPIED`, `VACANT`, `UNCERTAIN`. |
| `coverage` | `COMPLETE`, `DEGRADED`, `UNKNOWN`. |
| `requested_mode` | `OCCUPIED`, `SHORT_VACANCY`, `LONG_VACANCY`, `PRECOOL`. |
| `requested_output` | `null` or `{ "fan": "HIGH", "setpoint_c": 24 }`; fan enum is `OFF`, `LOW`, `MEDIUM`, `HIGH`, `AUTO`, and setpoint is a number or `null`. |
| `reason_code` | One of the exact reason codes below. |
| `reason_text` | Non-empty readable explanation from C. |
| `evaluated_at` | UTC evaluation time at/before `occurred_at`. |
| `vacancy_confirmed_at` | UTC time at/before evaluation, or `null`. |
| `node_states` | One entry per required node: `{node_id, state, evidence_event_id}`. States: `FRESH`, `STALE`, `DISCONNECTED`, `MISSING`, `INVALID`. MISSING requires a null reference; other states require an evidence event ID. |
| `forecast_event_id` | Exact D forecast event used, or `null`. |
| `override_request_id` | Override payload's `request_id` used, or `null`; this is not the envelope event ID. |

Reason codes: `OCCUPIED_EVIDENCE`, `VACANCY_CONFIRMED`, `SHORT_GAP`, `LONG_GAP`,
`FORECAST_RESTART`, `MISSING_EVIDENCE`, `UNCERTAIN_EVIDENCE`, `MANUAL_OVERRIDE`,
`OVERRIDE_EXPIRED`, `RETURN_TO_AUTOMATIC`, `ENVIRONMENT_LIMIT`,
`CONSERVATIVE_FALLBACK`.

## Valid JSON Example

This is the complete existing catalog event `decision-occupied`, also available
as [c-zone-decision.valid.json](../packages/sdp-contract/fixtures/integration/c-zone-decision.valid.json).
Its referenced config and node events are in the `normal-occupied` scenario.

```json
{
  "schema_version": "sdp.v1-draft.1",
  "event_type": "ZONE_DECISION",
  "event_id": "decision-occupied",
  "correlation_id": "decision-occupied",
  "session_id": "sdp-fixture-session",
  "room_id": "room-demo",
  "zone_id": "zone-demo",
  "occurred_at": "2026-10-20T08:03:01.000Z",
  "clock": { "time_base": "REPLAY", "replay_id": "sdp-review-replay" },
  "producer": { "component": "C", "producer_id": "fixture-c" },
  "data_sources": ["SIMULATED"],
  "payload": {
    "config_event_id": "config-demo",
    "occupancy": "OCCUPIED",
    "coverage": "COMPLETE",
    "requested_mode": "OCCUPIED",
    "requested_output": { "fan": "HIGH", "setpoint_c": 24 },
    "reason_code": "OCCUPIED_EVIDENCE",
    "reason_text": "Scripted occupied evidence; review fixture only.",
    "evaluated_at": "2026-10-20T08:03:01.000Z",
    "vacancy_confirmed_at": null,
    "node_states": [
      { "node_id": "demo-1", "state": "FRESH", "evidence_event_id": "evidence-occupied-1" },
      { "node_id": "demo-2", "state": "FRESH", "evidence_event_id": "evidence-occupied-2" }
    ],
    "forecast_event_id": null,
    "override_request_id": null,
    "command_id": "command-decision-occupied"
  }
}
```

## Invalid Example and Local Validation

[c-zone-decision.invalid.json](../packages/sdp-contract/fixtures/integration/c-zone-decision.invalid.json)
is the same complete event with `occupancy` omitted and `requested_mode: "eco"`.
`eco` is a legacy HVAC string, not a valid SDP controller mode. Expected errors:

```text
event.payload.occupancy: expected OCCUPIED | VACANT | UNCERTAIN
event.payload.requested_mode: expected OCCUPIED | SHORT_VACANCY | LONG_VACANCY | PRECOOL
```

From the repository root in Windows PowerShell, after the
[one-time setup](sdp-integration-kit.md#local-setup-and-validation):

```powershell
node .\packages\sdp-contract\bin\validate.mjs --file .\packages\sdp-contract\fixtures\integration\c-zone-decision.valid.json --type ZONE_DECISION
$LASTEXITCODE  # 0
node .\packages\sdp-contract\bin\validate.mjs --file .\packages\sdp-contract\fixtures\integration\c-zone-decision.invalid.json --type ZONE_DECISION
$LASTEXITCODE  # 1: expected rejection
Get-Content -Raw .\my-c-decision.json | node .\packages\sdp-contract\bin\validate.mjs --stdin --type ZONE_DECISION
```

## Correlation and Controller Handoff

- B's `payload.command_id` must equal C's `payload.command_id`; B's
  `payload.decision_event_id` must equal C's envelope `event_id`. Preserve a shared
  correlation trace for the related decision/output or override lifecycle.
- Only B publishes `APPLIED_OUTPUT`. `ACCEPTED` does not confirm application.
  Only `APPLIED` contains non-null `reported_output`; rejection/failure needs a
  reason. Check `feedback_basis` before claiming physical confirmation.
- Set `forecast_event_id` to the exact forecast used, including a superseding
  forecast if applicable. An available forecast need not be used. C handles
  cancellation and expiry independently of the dashboard.
- `OVERRIDE_STATUS` requires `request_id`, `status`, `reason`,
  `decision_event_id`, `applied_output_event_id`, `effective_until` plus the
  envelope. C owns `ACCEPTED`, `APPLIED`, `REJECTED`, `FAILED`, `EXPIRED`,
  `CANCELLED`; E/gateway owns `PENDING`.
- Report an override `APPLIED` only after the corresponding B APPLIED report,
  linking the decision/output events. Enforce the override end even if E is closed.
  Return to Automatic targets the original request, has its own request/status
  chain, ends the original override and produces C's resulting automatic decision.
  Automatic does not inherently mean OFF.
- For algorithm exercises, select complete scenarios such as `missing-node`,
  `stale-node`, `uncertain-occupancy`, `precool`, `override-expired` or
  `return-to-automatic` from the existing catalog. Alternative branches are not
  one combined history.

The CLI checks one event and its internal rules. It cannot prove referenced
records exist, required-node coverage matches a config, or C made a correct/safe
decision. Check those across the selected history and follow the
[handoff and agreement checklist](sdp-integration-kit.md#handoff-to-the-dashboard).
