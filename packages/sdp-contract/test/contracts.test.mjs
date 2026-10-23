import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createSdpDataSource, isUtcTimestamp, parseSdpEvents, SCHEMA_VERSION, validateSdpEvent, validateStoredSdpEvent, eventMatchesRun } from "../dist/index.js";

const fixtures = JSON.parse(await readFile(new URL("../fixtures/scenarios.json", import.meta.url), "utf8"));
const events = parseSdpEvents(fixtures.events);
const eventById = new Map(events.map(event => [event.event_id, event]));
const scenarioById = new Map(fixtures.scenarios.map(scenario => [scenario.id, scenario]));
test('persisted hybrid version dispatch retains strict legacy shapes and measured inference semantics', () => {
  const e = structuredClone(events.find(e=>e.event_type==='NODE_EVIDENCE'));
  Object.assign(e,{schema_version:'sdp.v1-hybrid.1',clock:{time_base:'LIVE',replay_id:null},data_sources:['MEASURED']});
  e.payload.model_version=null;e.payload.firmware_version=null;
  const at=e.occurred_at;
  e.payload.classification={value:{class_label:'OCCUPIED_1P',class_scores:null,headcount_category:'ONE'},source:'MEASURED',source_id:`${e.payload.node_id}/thermal`,observed_at:at,validity:'VALID'};
  e.payload.temperature_c={value:25.4,source:'MEASURED',source_id:`${e.payload.node_id}/bme280`,observed_at:at,validity:'VALID'};
  e.payload.humidity_percent={value:null,source:'UNAVAILABLE',source_id:null,observed_at:null,validity:'UNAVAILABLE'};
  e.data_sources.push('UNAVAILABLE');
  e.payload.hardware={received_at:at,time_basis:'GATEWAY_RECEIPT',device_observed_at:null,headcount:1,inference_method:'TINYML',system_active:true,pir_motion:true,bme_valid:true,headcount_source:'thermal_ai',thermal_ai_label:'OCCUPIED_1P',thermal_ai_confidence:.92};
  assert.equal(validateStoredSdpEvent(e).ok,true);assert.equal(validateSdpEvent(e).ok,false);
  assert.equal(eventMatchesRun(e,e.session_id,'sdp-hybrid-v1'),true);assert.equal(eventMatchesRun(e,e.session_id),false);
  for(const mutate of [v=>v.payload.hardware.system_active=false,v=>v.payload.classification.value.headcount_category='ZERO',v=>v.payload.classification.value.class_scores={},v=>v.payload.hardware.headcount_source='thermal_blob_fallback',v=>v.payload.hardware.bme_valid=false,v=>v.payload.temperature_c.source_id='other/bme280']) {
    const bad=structuredClone(e);mutate(bad);assert.equal(validateStoredSdpEvent(bad).ok,false);
  }
});
function scenarioSource(id) {
  const scenario = scenarioById.get(id);
  assert.ok(scenario, id);
  return {
    query: scenario.query,
    source: createSdpDataSource(async () => scenario.event_ids.map(eventId => structuredClone(eventById.get(eventId))))
  };
}
test('hybrid decision validation rejects unconfirmed reduction and impossible duration categories',()=>{
 const e=structuredClone(events.find(e=>e.event_type==='ZONE_DECISION'));
 Object.assign(e,{schema_version:'sdp.v1-hybrid.1',clock:{time_base:'LIVE',replay_id:null}});
 Object.assign(e.payload,{occupancy:'VACANT',requested_mode:'SHORT_VACANCY',requested_output:{fan:'LOW',setpoint_c:27},vacancy_confirmed_at:null,override_request_id:null});
 assert.equal(validateStoredSdpEvent(e).ok,false);
 e.payload.vacancy_confirmed_at=e.payload.evaluated_at;
 assert.equal(validateStoredSdpEvent(e).ok,true);
 e.payload.requested_mode='LONG_VACANCY';assert.equal(validateStoredSdpEvent(e).ok,false);
 e.payload.requested_mode='OCCUPIED';assert.equal(validateStoredSdpEvent(e).ok,false);
});
async function snapshot(id) {
  const { source, query } = scenarioSource(id);
  return source.getZoneSnapshot(query);
}
function invalid(id, mutate) {
  const value = structuredClone(eventById.get(id));
  mutate(value);
  const result = validateSdpEvent(value);
  assert.equal(result.ok, false);
  assert.ok(result.errors.length > 0);
}

test("fixtures are explicitly simulated draft data and cover every event type", () => {
  assert.equal(fixtures.draft, true);
  assert.equal(fixtures.fixture_source, "SIMULATED");
  assert.equal(fixtures.schema_version, SCHEMA_VERSION);
  assert.equal(new Set(events.map(e => e.event_type)).size, 7);
  for (const event of events) {
    assert.ok(event.data_sources.includes("SIMULATED"));
    assert.equal(event.clock.time_base, "REPLAY");
    assert.equal(event.schema_version, SCHEMA_VERSION);
  }
  const required = ["normal-occupied", "confirmed-vacancy", "short-vacancy", "long-vacancy", "precool", "missing-node", "uncertain-occupancy", "expired-forecast", "override-pending", "override-accepted", "override-applied", "override-expired", "command-rejected", "command-failed", "return-to-automatic"];
  required.forEach(id => assert.ok(scenarioById.has(id), id));
});

test("scenario references, owners, provenance and causal timestamps are coherent", () => {
  for (const scenario of fixtures.scenarios) {
    const ids = new Set(scenario.event_ids);
    assert.equal(ids.size, scenario.event_ids.length);
    for (const id of ids) {
      const event = eventById.get(id);
      assert.ok(event, id);
      assert.equal(event.zone_id, scenario.query.zone_id);
      assert.equal(event.session_id, scenario.query.session_id);
      assert.deepEqual(event.clock, scenario.query.clock);
      assert.ok(Date.parse(event.occurred_at) <= Date.parse(scenario.query.as_of));
      const p = event.payload;
      const refs = [p.config_event_id, p.decision_event_id, p.applied_output_event_id, p.forecast_event_id, p.supersedes_event_id, ...(p.node_states ?? []).map(n => n.evidence_event_id)].filter(Boolean);
      for (const ref of refs) {
        assert.ok(ids.has(ref), `${scenario.id}: missing referenced event ${ref}`);
        assert.ok(Date.parse(eventById.get(ref).occurred_at) <= Date.parse(event.occurred_at));
      }
      if (event.event_type === "ZONE_DECISION") {
        const config = eventById.get(p.config_event_id).payload;
        assert.deepEqual(p.node_states.map(n => n.node_id).sort(), config.required_nodes.map(n => n.node_id).sort());
        for (const node of p.node_states.filter(n => n.state === "FRESH")) {
          const evidence = eventById.get(node.evidence_event_id);
          assert.equal(evidence.event_type, "NODE_EVIDENCE");
          assert.equal(evidence.payload.node_id, node.node_id);
          const age = Date.parse(p.evaluated_at) - Date.parse(evidence.payload.classification.observed_at);
          assert.ok(age >= 0 && age < config.freshness.stale_after_ms, `${scenario.id}: FRESH evidence must actually be fresh`);
        }
      }
      if (event.event_type === "APPLIED_OUTPUT") {
        const decision = eventById.get(p.decision_event_id);
        assert.equal(decision.event_type, "ZONE_DECISION");
        assert.equal(p.command_id, decision.payload.command_id);
      }
      if (event.event_type === "OVERRIDE_STATUS") {
        const request = scenario.event_ids.map(key => eventById.get(key)).find(candidate => candidate.event_type === "OVERRIDE_REQUEST" && candidate.payload.request_id === p.request_id);
        assert.ok(request, `${scenario.id}: request must be present`);
        assert.equal(event.correlation_id, request.correlation_id);
        if (p.status === "APPLIED") {
          const output = eventById.get(p.applied_output_event_id);
          assert.equal(output.event_type, "APPLIED_OUTPUT");
          assert.equal(output.payload.status, "APPLIED");
          assert.equal(output.payload.decision_event_id, p.decision_event_id);
        }
      }
    }
  }
});

test("snapshots expose C's supplied states without fusing evidence or calculating cooling", async () => {
  assert.equal((await snapshot("normal-occupied")).decision.payload.occupancy, "OCCUPIED");
  assert.equal((await snapshot("confirmed-vacancy")).decision.payload.occupancy, "VACANT");
  assert.equal((await snapshot("short-vacancy")).decision.payload.requested_mode, "SHORT_VACANCY");
  assert.equal((await snapshot("long-vacancy")).decision.payload.requested_mode, "LONG_VACANCY");
  assert.equal((await snapshot("precool")).decision.payload.requested_mode, "PRECOOL");
  const missing = await snapshot("missing-node");
  assert.equal(missing.nodes.length, 1);
  assert.equal(missing.config.payload.required_nodes.length, 2);
  assert.equal(missing.decision.payload.occupancy, "UNCERTAIN");
  const unknown = await snapshot("unavailable-environment");
  assert.equal(unknown.nodes[0].payload.temperature_c.value, null);
  assert.equal(unknown.nodes[0].payload.temperature_c.source, "UNAVAILABLE");
});

test("forecast expiry uses explicit replay time and cancellation clears a plan", async () => {
  assert.equal((await snapshot("precool")).forecast_state, "ACTIVE");
  assert.equal((await snapshot("expired-forecast")).forecast_state, "EXPIRED");
  assert.equal((await snapshot("cancelled-forecast")).forecast_state, "CANCELLED");
  assert.equal((await snapshot("unavailable-forecast")).forecast_state, "UNAVAILABLE");
  const { source, query } = scenarioSource("expired-forecast");
  assert.equal((await source.getZoneSnapshot({ ...query, as_of: eventById.get("forecast-expired").payload.expires_at })).forecast_state, "EXPIRED");
});

test("pending/accepted are not displayed as applied; expiry and Return to Automatic retain history", async () => {
  const pending = await snapshot("override-pending");
  assert.equal(pending.override_statuses.at(-1).payload.status, "PENDING");
  assert.equal(pending.decision.payload.requested_mode, "LONG_VACANCY");
  assert.equal((await snapshot("override-accepted")).override_statuses.at(-1).payload.status, "ACCEPTED");
  const applied = await snapshot("override-applied");
  assert.equal(applied.override_statuses.at(-1).payload.status, "APPLIED");
  assert.equal(applied.output.payload.status, "APPLIED");
  const expired = await snapshot("override-expired");
  assert.equal(expired.override_statuses.at(-1).payload.status, "EXPIRED");
  assert.equal(expired.decision.payload.reason_code, "OVERRIDE_EXPIRED");
  const returned = await snapshot("return-to-automatic");
  assert.equal(returned.override_requests.at(-1).payload.action, "RETURN_TO_AUTOMATIC");
  assert.equal(returned.decision.payload.reason_code, "RETURN_TO_AUTOMATIC");
  assert.equal((await snapshot("command-failed")).output.payload.status, "FAILED");
  assert.equal((await snapshot("command-rejected")).output.payload.reported_output, null);
});

test("loader boundary handles empty data, errors and isolated sessions/clocks", async () => {
  const { query } = scenarioSource("normal-occupied");
  const empty = await createSdpDataSource(async () => []).getZoneSnapshot(query);
  assert.equal(empty.decision, null);
  assert.equal(empty.forecast_state, "UNAVAILABLE");
  assert.deepEqual(empty.nodes, []);
  const source = createSdpDataSource(async () => events);
  assert.deepEqual(await source.getEvents({ ...query, session_id: "different-session" }), []);
  assert.deepEqual(await source.getEvents({ ...query, clock: { time_base: "LIVE", replay_id: null } }), []);
  assert.deepEqual(await source.getEvents({ ...query, as_of: "2026-10-20T07:00:00Z" }), []);
  await assert.rejects(source.getEvents({ ...query, as_of: "not-a-date" }), /valid UTC/);
  await assert.rejects(createSdpDataSource(async () => { throw new Error("backend unavailable"); }).getEvents(query), /backend unavailable/);
  await assert.rejects(createSdpDataSource(async () => [{}]).getEvents(query), /Invalid SDP event/);
  assert.throws(() => parseSdpEvents([events[0], events[0]]), /Duplicate event_id/);
});

test("strict version, timestamp, enum and nullable observation validation", () => {
  invalid("evidence-occupied-1", e => { e.schema_version = "sdp.v2"; });
  invalid("evidence-occupied-1", e => { e.payload.classification.value.headcount_category = 3; });
  invalid("evidence-occupied-1", e => { e.payload.humidity_percent.value = 101; });
  invalid("evidence-occupied-1", e => { e.payload.temperature_c.value = null; });
  invalid("evidence-occupied-1", e => { e.payload.temperature_c.source = "UNAVAILABLE"; });
  invalid("evidence-occupied-1", e => { e.payload.classification.value.class_scores.EMPTY_CORE = -1; });
  invalid("evidence-occupied-1", e => { e.payload.temperature_c.observed_at = "2026-10-21T00:00:00Z"; });
  invalid("decision-occupied", e => { e.payload.requested_mode = "eco"; });
  invalid("decision-occupied", e => { e.producer.component = "E"; });
  invalid("decision-occupied", e => { e.payload.future_field = true; });
  invalid("decision-occupied", e => { delete e.payload.occupancy; });
  invalid("config-demo", e => { e.payload.required_nodes.push(e.payload.required_nodes[0]); });
  invalid("config-demo", e => { e.payload.freshness.stale_after_ms = 400000; });
  invalid("config-demo", e => { e.payload.limits.occupied_target_c = 100; });
  assert.equal(isUtcTimestamp("2026-02-30T00:00:00Z"), false);
  assert.equal(isUtcTimestamp("2026-10-20T08:00:00+08:00"), false);
});

test("live hybrid evidence preserves independent measured, proxy and unavailable sources", () => {
  const hybrid = structuredClone(eventById.get("evidence-occupied-1"));
  hybrid.clock = { time_base: "LIVE", replay_id: null };
  hybrid.data_sources = ["MEASURED", "PROXY_TEST", "UNAVAILABLE"];
  hybrid.payload.classification.source = "PROXY_TEST";
  hybrid.payload.temperature_c.source = "MEASURED";
  hybrid.payload.temperature_c.source_id = "different-environment-sensor";
  hybrid.payload.humidity_percent = { value: null, source: "UNAVAILABLE", source_id: null, observed_at: null, validity: "UNAVAILABLE" };
  assert.equal(validateSdpEvent(hybrid).ok, true);
  // This constructed validation case is not a claim of an actual measured trial.
  hybrid.clock.replay_id = "unexpected-replay";
  assert.equal(validateSdpEvent(hybrid).ok, false);
});

test("lifecycle validation rejects contradictory command and forecast messages", () => {
  invalid("output-normal-applied", e => { e.payload.reported_output = null; });
  invalid("output-command-accepted", e => { e.payload.reported_output = { fan: "HIGH", setpoint_c: 24 }; });
  invalid("output-command-failed", e => { e.payload.reason = null; });
  invalid("override-applied", e => { e.payload.applied_output_event_id = null; });
  invalid("override-accepted", e => { e.producer.component = "E"; });
  invalid("override-request", e => { e.payload.override_expires_at = e.occurred_at; });
  invalid("return-request", e => { e.payload.target_request_id = e.payload.request_id; });
  invalid("override-expired", e => { e.payload.effective_until = "2026-10-21T00:00:00Z"; });
  invalid("forecast-return", e => { e.payload.expires_at = e.occurred_at; });
  invalid("forecast-return", e => { e.payload.planned_restart_at = "2026-10-21T00:00:00Z"; });
  invalid("forecast-cancelled", e => { e.payload.supersedes_event_id = null; });
});
