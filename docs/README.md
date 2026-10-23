# Documentation guide

Start with the [project overview and judge access](../README.md).

## Current SDP submission

- [Architecture, implemented scope and reproduction limits](SDP-SUBMISSION.md)
- [Safe runtime setup and environment templates](PUBLIC-RUNTIME.md)
- [Dashboard entry points and authentication](../apps/dashboard/README.md)
- [Hybrid Backend and separate synthetic evaluation](../services/sdp-generator/README.md)
- [Contract versions and original field reference](sdp-contract-v1.md)
- [Firmware ZIP audit and proposed contribution](FIRMWARE-AUDIT.md)
- [Audited Vercel frontend packaging](integration/VERCEL-HYBRID-FRONTEND.md)
- [Public release boundaries](PUBLIC-RELEASE.md) and [security policy](../SECURITY.md)

Use Node.js 24 for current backend/frontend commands. Package lockfiles are
separate; the repository root is not an npm workspace.

## Retained development references

These documents remain available for traceability; they are not the current
deployment checklist:

| Material | Scope / limitation |
| --- | --- |
| [MQTT contract](mqtt-contract.md), [firmware guide](firmware-integration-guide.md) | Earlier device design; compare with the current normalizer and firmware audit before assuming optional fields or commands are implemented. |
| [Local demo](local-demo.md), [demo checklist](demo-checklist.md) | Technothon services; do not start them alongside the current Writer. |
| [C guide](sdp-component-c-guide.md), [D guide](sdp-component-d-guide.md), [integration kit](sdp-integration-kit.md) | Draft examples, including proposed actuator/override/prediction capabilities. |
| [Synthetic setup](sdp-foundation-setup.md) | Original synthetic provisioning; existing migrated targets must not repeat migrations. |
| [Integration reports](integration/) | Dated phase evidence. Old branch names and test counts describe checkpoints, not required checkout targets. |
| [Design sources](design/) | UI exploration and landing assets; illustrative content is not operational data. |

The project began as a Technothon prototype and evolved into the current SDP
submission. This update preserves that history without requiring judges to use
the obsolete startup path.
