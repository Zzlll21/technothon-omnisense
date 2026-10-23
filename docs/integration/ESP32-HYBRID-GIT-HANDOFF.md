# Hybrid Mode B — repository handoff

Date: 23 October 2026 (Malaysia). Branch: `feature/esp32-hybrid`.

This handoff includes Stage 1–3D source, shared contracts, SQL migrations,
subscribe-only diagnostics, the opt-in single-writer supervisor, private frontend
authentication, compatible historical readers, CSV provenance, regression tests
and integration reports. Committing or checking out these files performs no
database operation, MQTT connection, writer startup or deployment.

## Private configuration stays local

- The committed `deployment/approved-hybrid-targets.json` is an empty default
  registry. A fresh checkout must independently verify and approve its target
  before registering a manifest; it cannot inherit this machine's runtime approval.
- On the preparation machine, the operator's existing populated registry is kept
  unchanged in the working tree. Its intentional difference from the committed
  default must not be staged accidentally. Git status will show that local change.
- Actual `hybrid-target.*.draft.json` target/registry candidates and private
  `hybrid-*.env` files are ignored. The placeholder manifest and disabled example
  environment file are included. No actual environment file is committed.
- Firmware archives, embedded Wi-Fi/MQTT credentials, API keys, passwords and
  authentication tokens are excluded. UI screenshots and process logs are outside
  the repository; generated builds, landing assets and dependencies remain ignored.
- Stage 3D reports include non-secret project/run/Auth user identifiers, migration
  hashes and sanitized access-control evidence. They are historical deployment
  evidence, not credentials or approval to start another environment.

The SQL files are marked `-text` in `.gitattributes`: their exact reviewed bytes
must survive commits and checkouts for hash verification on every OS. Migration
001's Git blob therefore gains the existing Windows working-file CRLF bytes;
its SQL statements and already-approved working-file SHA-256 are unchanged.
Migrations 002/003 and the verification SQL also retain their reviewed bytes.

## Local validation before publication

- Shared contracts: 20 tests passed.
- Generator: 99 tests passed, including local PostgreSQL/PGlite transactions,
  rollback, RLS, disconnect snapshots, checkpoint recovery, fencing and complete
  synthetic tick byte parity.
- Dashboard: 131 tests passed, including private authentication/session guards,
  hybrid historical readers and synthetic CSV byte parity.
- Dashboard TypeScript and production build passed; Vite reported its existing
  advisory about a chunk larger than 500 kB.
- Secret-pattern review and an in-memory comparison against credential values
  extracted from the supplied firmware archive found no actual credentials in
  the publication candidates. Test-only fake credentials and placeholders remain.
- `git diff --check` and final staged-byte/hash checks are required before commit.

These offline tests do not prove populated-data hosted RLS or live physical
integration. The Auth-results report records the completed empty-data/login checks.
The first supervised MQTT/writer session and subsequent exact-run Reader A ACL
still require separate approval. No SQL or hosted changes are part of this Git
handoff, and the protected synthetic demonstration remains unchanged.
