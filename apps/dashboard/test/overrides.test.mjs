import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { validateSdpEvent } from "../../../packages/sdp-contract/dist/index.js";

const source = readFileSync(new URL("../src/lib/sdpOverrides.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { createOccupiedOverride, createAutomaticReturn, createPendingOverride, overrideLifecycle } = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
const fixtures = JSON.parse(readFileSync(new URL("../../../packages/sdp-contract/fixtures/scenarios.json", import.meta.url), "utf8"));
const event = id => structuredClone(fixtures.events.find(item => item.event_id === id));
const scenario = id => {
  const selected = fixtures.scenarios.find(item => item.id === id);
  return { query: structuredClone(selected.query), events: selected.event_ids.map(event) };
};
const config = () => event("config-demo");
const query = () => scenario("override-applied").query;

test("occupied and temperature requests reuse the exact contract, zone limits and replay timestamps", () => {
  for (const setpoint of [null, 23, 24.5, 29]) {
    const request = createOccupiedOverride(config(), query(), "new-request", "new-request-event", 10, setpoint);
    assert.equal(validateSdpEvent(request).ok, true);
    assert.equal(request.payload.requested_mode, "OCCUPIED");
    assert.equal(request.payload.requested_setpoint_c, setpoint);
    assert.equal(request.occurred_at, query().as_of);
    assert.equal(request.payload.override_expires_at, "2026-10-20T08:13:08.000Z");
    assert.deepEqual(request.data_sources, ["SIMULATED"]);
    assert.equal(request.producer.component, "E");
  }
  assert.equal(validateSdpEvent(createOccupiedOverride(config(), query(), "request-max", "event-max", 30, null)).ok, true);
});

test("invalid limits, durations, clocks and scopes cannot create simulated requests", () => {
  for (const minutes of [0, -1, 1.5, NaN, 31]) assert.throws(() => createOccupiedOverride(config(), query(), "request", "event", minutes, null), /Duration/);
  for (const temperature of [22.9, 29.1, Infinity, NaN]) assert.throws(() => createOccupiedOverride(config(), query(), "request", "event", 10, temperature), /Temperature/);
  assert.throws(() => createOccupiedOverride(config(), { ...query(), clock: { time_base: "LIVE", replay_id: null } }, "request", "event", 10, null), /simulated replay/);
  assert.throws(() => createOccupiedOverride(config(), { ...query(), zone_id: "another-zone" }, "request", "event", 10, null), /matching/);
});

test("Return to Automatic references the original request ID without extra SET_OVERRIDE keys", () => {
  const original = event("override-request");
  const request = createAutomaticReturn(config(), query(), "return-new", "return-event-new", original);
  assert.equal(validateSdpEvent(request).ok, true);
  assert.equal(request.payload.target_request_id, original.payload.request_id);
  assert.equal(request.correlation_id, original.correlation_id);
  assert.equal(request.payload.action, "RETURN_TO_AUTOMATIC");
  assert.ok(!("requested_mode" in request.payload));
  assert.ok(!("override_expires_at" in request.payload));
  assert.throws(() => createAutomaticReturn(config(), query(), original.payload.request_id, "event", original), /earlier occupied-operation/);
  assert.throws(() => createAutomaticReturn(config(), query(), "return-new", "event", { ...original, zone_id: "wrong-zone" }), /this zone/);
});

test("local submission creates PENDING only, with no decision/application references", () => {
  const request = createOccupiedOverride(config(), query(), "new-request", "request-event", 5, null);
  const pending = createPendingOverride(request, "status-event");
  assert.equal(validateSdpEvent(pending).ok, true);
  assert.equal(pending.payload.status, "PENDING");
  assert.equal(pending.payload.request_id, request.payload.request_id);
  assert.equal(pending.correlation_id, request.correlation_id);
  assert.equal(pending.payload.decision_event_id, null);
  assert.equal(pending.payload.applied_output_event_id, null);
  const trace = overrideLifecycle([request, pending], request.payload.request_id, query().as_of);
  assert.equal(trace.acknowledged, null);
  assert.equal(trace.appliedOutput, null);
});

test("fixtures display all recorded lifecycle outcomes and acknowledge only C-owned responses", () => {
  for (const [id, expected] of [["override-pending", "PENDING"], ["override-accepted", "ACCEPTED"], ["override-applied", "APPLIED"], ["override-rejected", "REJECTED"], ["override-failed", "FAILED"], ["override-expired", "EXPIRED"], ["return-to-automatic", "CANCELLED"]]) {
    const selected = scenario(id);
    const trace = overrideLifecycle(selected.events, "request-occupied", selected.query.as_of);
    assert.equal(trace.latest.payload.status, expected, id);
    assert.equal(!!trace.acknowledged, expected !== "PENDING", id);
    assert.equal(!!trace.appliedOutput, ["APPLIED", "EXPIRED", "CANCELLED"].includes(expected), id);
  }
});

test("accepted/rejected/failed outcomes cannot claim a device APPLIED report", () => {
  for (const id of ["override-accepted", "override-rejected", "override-failed"]) {
    const selected = scenario(id);
    assert.equal(overrideLifecycle(selected.events, "request-occupied", selected.query.as_of).appliedOutput, null);
  }
});

test("C APPLIED needs its exact B report and matching scoped decision/command references", () => {
  const selected = scenario("override-applied");
  for (const mutate of [
    events => events.filter(item => item.event_id !== "output-override-applied"),
    events => events.map(item => item.event_id === "output-override-applied" ? { ...item, payload: { ...item.payload, command_id: "wrong" } } : item),
    events => events.map(item => item.event_id === "output-override-applied" ? { ...item, session_id: "other-session" } : item)
  ]) {
    const trace = overrideLifecycle(mutate(selected.events), "request-occupied", selected.query.as_of);
    assert.equal(trace.latest.payload.status, "APPLIED");
    assert.equal(trace.appliedOutput, null);
    assert.equal(trace.appliedReferenceMissing, true);
  }
});

test("missed acceptance and requested expiry become warnings without inventing terminal statuses", () => {
  const pending = scenario("override-pending");
  const before = structuredClone(pending.events);
  const trace = overrideLifecycle(pending.events, "request-occupied", "2026-10-20T08:14:00.000Z");
  assert.equal(trace.acknowledgementTimedOut, true);
  assert.equal(trace.endUnconfirmed, true);
  assert.equal(trace.latest.payload.status, "PENDING");
  assert.deepEqual(pending.events, before);
  const applied = scenario("override-applied");
  const late = overrideLifecycle(applied.events, "request-occupied", "2026-10-20T09:00:00.000Z");
  assert.equal(late.latest.payload.status, "APPLIED");
  assert.equal(late.endUnconfirmed, true);
  assert.equal(late.acknowledgementTimedOut, false);
});

test("request IDs isolate shared correlation traces and future responses are not leaked", () => {
  const selected = scenario("return-to-automatic");
  const returned = overrideLifecycle(selected.events, "request-return", selected.query.as_of);
  assert.equal(returned.latest.payload.status, "APPLIED");
  assert.equal(returned.appliedOutput.event_id, "output-return-applied");
  assert.ok(returned.statuses.every(item => item.payload.request_id === "request-return"));
  const early = overrideLifecycle(selected.events, "request-occupied", "2026-10-20T08:03:03.000Z");
  assert.equal(early.latest.payload.status, "PENDING");
  assert.equal(early.acknowledged, null);
  assert.equal(overrideLifecycle(selected.events, "not-present", selected.query.as_of).request, null);
});

test("controller-reported effective end is kept distinct from the requested expiry", () => {
  const selected = scenario("override-applied");
  const changed = selected.events.map(item => item.event_type === "OVERRIDE_STATUS" && item.producer.component === "C" ?
    { ...item, payload: { ...item.payload, effective_until: "2026-10-20T08:25:00.000Z" } } : item);
  const trace = overrideLifecycle(changed, "request-occupied", "2026-10-20T08:14:00.000Z");
  assert.equal(trace.request.payload.override_expires_at, "2026-10-20T08:13:02.000Z");
  assert.equal(trace.acknowledged.payload.effective_until, "2026-10-20T08:25:00.000Z");
  assert.equal(trace.endUnconfirmed, false);
});
