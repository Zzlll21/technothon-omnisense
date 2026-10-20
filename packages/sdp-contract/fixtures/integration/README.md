# Integration Samples

All files here are **simulated REPLAY test data** for `sdp.v1-draft.1`, not live
controller/predictor output. The draft still requires team review.

| File | Expected CLI result | Basis |
| --- | --- | --- |
| `c-zone-decision.valid.json` | Exit 0 | Exact catalog event `decision-occupied` |
| `d-zone-forecast.valid.json` | Exit 0 | Exact catalog event `forecast-return` |
| `d-zone-forecast.cancelled.json` | Exit 0 | Exact catalog event `forecast-cancelled` |
| `d-zone-forecast.unavailable.json` | Exit 0 | Exact catalog event `forecast-unavailable` |
| `c-zone-decision.invalid.json` | Exit 1 | Missing occupancy; invalid `eco` requested mode |
| `d-zone-forecast.invalid.json` | Exit 1 | Invalid `EXPIRED` wire status and `VERY_HIGH` quality; missing expiry |

The valid copies are tested against `../scenarios.json`. Invalid examples are
deliberately rejected; do not feed this folder wholesale into a dashboard loader.
Each file contains one complete event including its common envelope. Referenced
config/evidence/prior-forecast records remain in the original scenario catalog.
These standalone examples validate message shape, not a complete event history.

Run commands from the repository root; see
[Integration Kit](../../../../docs/sdp-integration-kit.md),
[C guide](../../../../docs/sdp-component-c-guide.md) and
[D guide](../../../../docs/sdp-component-d-guide.md).
