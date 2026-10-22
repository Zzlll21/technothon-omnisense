# Stage 3D — isolated private Auth setup

Date: 23 October 2026 (Malaysia). Branch: `feature/esp32-hybrid`.
Target: `omnisense-hybrid-test` / `onfzcxtejvxpcppcvkgk`.
Protected synthetic project: `uaqblatyabykhghiqecp` (untouched).

## Confirmed configuration

Only the isolated project's authenticated Supabase Dashboard was used for Auth
configuration. Public new-user signup was disabled and saved. Email sign-in is
enabled; anonymous sign-ins and unused providers are disabled. Ordinary email
confirmation remains enabled. Site URL is `http://127.0.0.1:5178`; no redirect
wildcard or additional redirect URL was added. Password sign-in needs no callback.

The operator created both users privately using administrative Create new user
with auto-confirm, then reported completion. The authenticated user-detail views
independently showed confirmed email accounts, no invitation timestamp and no
confirmation-email timestamp:

| Purpose | Email | Auth user UUID |
| --- | --- | --- |
| Reader A, intended future exact-run reader | reader-a@omnisense.test | `743edfa3-e769-49cc-90a8-089690b1141c` |
| Reader B, unprivileged negative control | reader-b@omnisense.test | `ba74d7d3-4c3f-4777-8131-fa6f3e2a8e29` |

Neither account was granted a database role or run ACL. Creating an Auth user does
not add an `sdp_hybrid_readers` row. No Hybrid Run, sample, frame, event or lease
was created. The exact-run ACL must wait until an approved supervisor initializes
that run; the foreign key deliberately prevents an earlier grant.

## Private preview and preliminary checks

A dedicated Vite preview was started on loopback port 5178. Its process-only
configuration pins private mode, the registered manifest, the isolated URL and
that project's existing `sb_publishable_...` key. No backend key was revealed or
supplied to the preview. Relevant inherited backend/MQTT configuration was removed
from this new process; no existing process or dotenv file was modified. Temporary
public configuration transfer files were removed immediately after loading.

Local HTTP returned 200. Before authentication the UI showed only the private
login form, with no dashboard children. Use the existing direct Spatial entry:

`http://127.0.0.1:5178/?experience=spatial`

The root `/` redirects after sign-in to the illustrative landing page. That full
navigation loses the intentionally memory-only Auth session. Landing illustrations
are static synthetic examples, not persisted Hybrid observations. No code was
changed for this; the direct Spatial entry avoids that redirect.

The operator first signed in as A at `/`; the observed landing redirect matches
the existing route behavior. The operator then privately signed in as A and B in
turn at the direct Spatial entry. Both sessions visibly mounted the authenticated
`Private hybrid test session` view with `No published dataset`, no sensor values,
mode or forecast. The agent signed each session out and observed the login-only
view immediately. A deliberately invalid diagnostic password for B was rejected
with the sanitized `Sign-in failed. Use your approved test account.` message;
dashboard children remained absent. No real password or JWT was read by the agent.
Fresh authenticated Supabase account-detail views independently recorded A's last
sign-in at 03:51 and B's at 03:53 on 23 October 2026 (Malaysia).

The preview remains available locally, signed out. Actual hosted token expiry and
refresh, wrong-project JWT rejection and populated-data access remain untested.

Nine real anonymous API GET requests used only the isolated publishable key and
**no Authorization header**. Recorded statuses/counts, without response data or
credentials, are in [the evidence file](evidence/STAGE-3D-AUTH-ANONYMOUS-CHECKS.json).

| Target | Result |
| --- | --- |
| Six data tables: runs, zones, nodes, frames, samples, events | HTTP 200, zero rows each |
| Environment, reader ACL and writer lease control tables | HTTP 401, PostgreSQL `42501` permission denied each |

These are an **empty-data baseline**, not proof of populated-data RLS isolation.
No claim of successful A reads or B/anonymous denial of existing Hybrid rows is
made. No mutation RPC or write-denial probe was invoked during Auth setup.

Five focused local private-auth tests passed during this setup: request/session
guard, login/refresh/expiry/sign-out, late response/error handling, manifest target
pinning and pre-login rendering. These use local fakes and do not establish hosted
JWT refresh/expiry behavior. The registered manifest and all three migration-file
hashes passed the existing loader again; none was edited.

## Minimum remaining supervised session

1. Obtain separate explicit runtime approval for this exact target and registered
   run `de585067-a340-471c-b990-d0ee6004cde3`. Review a bounded operator-supervised
   session (initially 10–15 minutes), secure backend/MQTT process configuration,
   unchanged migration/manifest hashes and the absence of another writer.
2. Start exactly one existing Hybrid Runtime Supervisor, using `hybrid:run` with
   `--live --manifest <approved absolute path> --confirm onfzcxtejvxpcppcvkgk`.
   Both write/MQTT opt-ins are required. Do not run the legacy synthetic generator
   against this project. Existing synthetic processes retain their original target.
3. Observe both demo-1/demo-2 receipts, independent freshness and one fenced lease.
   Keep approved coverage false; do not claim confirmed vacancy or vacancy-driven
   reduction from this configuration. Forecasts and HVAC output remain simulated.
4. After initialization, separately approve and insert only A's exact-run ACL;
   never add B. Check real populated API reads: A sees the intended run and both
   nodes; B and anonymous see no Hybrid rows; all three cannot read private control
   tables. No broad grant or service key in the browser is needed.
5. Verify Spatial readings/history, occupied and unavailable evidence, independent
   offline/stale/reconnect states, transactional correlations and stored-provenance
   CSV export. Gracefully stop the single supervisor at the agreed deadline and
   rerun read-only integrity checks. No additional hosted test harness is required.

**Runtime remains unapproved and unstarted.** This Auth setup does not authorize
MQTT ingestion, a writer, run creation, ACL insertion or production cutover.
No SQL was executed during this Auth setup. No application code, migration,
manifest, production configuration or firmware was changed. The only new repository
artifacts from this work are this report and the sanitized anonymous-check evidence.
