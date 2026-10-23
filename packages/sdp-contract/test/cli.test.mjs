import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { validateSdpEvent } from "../dist/index.js";

const cli = fileURLToPath(new URL("../bin/validate.mjs", import.meta.url));
const samples = new URL("../fixtures/integration/", import.meta.url);
const catalog = JSON.parse(readFileSync(new URL("../fixtures/scenarios.json", import.meta.url), "utf8"));
const sample = name => JSON.parse(readFileSync(new URL(name, samples), "utf8"));
function run(args, input) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8", input, timeout: 10000, windowsHide: true
  });
  assert.ifError(result.error);
  return result;
}
function json(event, args = []) {
  return run(["--json", JSON.stringify(event), ...args]);
}

test("standalone valid examples remain exact copies of the shared simulated catalog", () => {
  for (const name of ["c-zone-decision.valid.json", "d-zone-forecast.valid.json", "d-zone-forecast.cancelled.json", "d-zone-forecast.unavailable.json"]) {
    const event = sample(name);
    assert.deepEqual(event, catalog.events.find(item => item.event_id === event.event_id));
    assert.ok(event.data_sources.includes("SIMULATED"));
    assert.equal(event.clock.time_base, "REPLAY");
    assert.equal(validateSdpEvent(event).ok, true);
    const result = run(["--file", fileURLToPath(new URL(name, samples)), "--type", event.event_type]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(`VALID ${event.event_type}`));
    assert.equal(result.stderr, "");
  }
});

test("JSON argument and multiline stdin use the same shared event validation, including UTF-8 BOM", () => {
  const event = sample("c-zone-decision.valid.json");
  assert.equal(json(event).status, 0);
  const input = `\uFEFF${JSON.stringify(event, null, 2)}\r\n`;
  assert.equal(run(["--stdin", "--type", "ZONE_DECISION"], input).status, 0);
  const failures = run(["--stdin"], JSON.stringify(sample("d-zone-forecast.invalid.json")));
  assert.equal(failures.status, 1);
  for (const error of validateSdpEvent(sample("d-zone-forecast.invalid.json")).errors) {
    assert.ok(failures.stderr.includes(error));
  }
});

test("guide JSON examples match the standalone valid contract samples", () => {
  for (const [guide, name] of [["sdp-component-c-guide.md", "c-zone-decision.valid.json"], ["sdp-component-d-guide.md", "d-zone-forecast.valid.json"]]) {
    const text = readFileSync(new URL(`../../../docs/${guide}`, import.meta.url), "utf8");
    const examples = [...text.matchAll(/```json\r?\n([\s\S]*?)\r?\n```/g)];
    assert.equal(examples.length, 1, guide);
    assert.deepEqual(JSON.parse(examples[0][1]), sample(name), guide);
  }
});

test("missing keys and invalid C/D enum values report field paths and allowed values", () => {
  const decision = json(sample("c-zone-decision.invalid.json"));
  assert.equal(decision.status, 1);
  assert.match(decision.stderr, /event\.payload\.occupancy: expected OCCUPIED \| VACANT \| UNCERTAIN/);
  assert.match(decision.stderr, /event\.payload\.requested_mode: expected OCCUPIED \| SHORT_VACANCY \| LONG_VACANCY \| PRECOOL/);
  const forecast = json(sample("d-zone-forecast.invalid.json"));
  assert.equal(forecast.status, 1);
  assert.match(forecast.stderr, /event\.payload\.status: expected ACTIVE \| CANCELLED \| UNAVAILABLE/);
  assert.match(forecast.stderr, /event\.payload\.quality: expected HIGH \| MEDIUM \| LOW \| UNAVAILABLE/);
  assert.match(forecast.stderr, /event\.payload\.expires_at: expected valid UTC/);
});

test("required nullable keys are accepted as null but rejected when omitted", () => {
  const event = sample("c-zone-decision.valid.json");
  assert.equal(event.payload.forecast_event_id, null);
  assert.equal(json(event).status, 0);
  delete event.payload.forecast_event_id;
  const result = json(event);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /event\.payload\.forecast_event_id/);
});

test("semantic failures reach the CLI unchanged from the shared validator", () => {
  const cases = [
    ["d-zone-forecast.valid.json", event => { event.payload.planned_restart_at = "2026-10-20T08:36:00.000Z"; }, /forecast window\/restart order is invalid/],
    ["d-zone-forecast.cancelled.json", event => { event.payload.supersedes_event_id = null; }, /cancellation must reference its prior forecast/],
    ["d-zone-forecast.unavailable.json", event => { event.payload.status_reason = null; }, /unavailable forecast must explain why/],
    ["c-zone-decision.valid.json", event => { event.producer.component = "D"; }, /producer component does not own this event type/],
    ["c-zone-decision.valid.json", event => { event.payload.node_states[0].state = "MISSING"; }, /missing nodes require null evidence reference/]
  ];
  for (const [name, mutate, message] of cases) {
    const event = sample(name);
    mutate(event);
    const result = json(event);
    assert.equal(result.status, 1);
    assert.match(result.stderr, message);
  }
});

test("type filter rejects a valid event of the wrong type; default retains all shared event types", () => {
  const forecast = sample("d-zone-forecast.valid.json");
  const result = json(forecast, ["--type", "ZONE_DECISION"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /event\.event_type: expected ZONE_DECISION/);
  const output = catalog.events.find(event => event.event_type === "APPLIED_OUTPUT");
  assert.equal(json(output).status, 0);
});

test("malformed JSON, non-object input and draft/unknown-field violations fail without echoing raw values", () => {
  const badJson = run(["--json", '{"private":"sensitive-test-input",']);
  assert.equal(badJson.status, 1);
  assert.match(badJson.stderr, /INVALID JSON/);
  assert.ok(!badJson.stderr.includes("sensitive-test-input"));
  for (const value of [null, [], 123, "text"]) assert.equal(json(value).status, 1);
  const event = sample("c-zone-decision.valid.json");
  event.schema_version = "wrong-version";
  event.payload.unexpected = "sensitive-test-input";
  const result = json(event);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /event\.schema_version/);
  assert.match(result.stderr, /event\.payload\.unexpected: unknown field/);
  assert.ok(!result.stderr.includes("sensitive-test-input"));
});

test("help, input errors and usage errors have stable exit codes", () => {
  const help = run(["--help"]);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /--file/);
  assert.match(help.stdout, /--stdin/);
  assert.match(help.stdout, /Exit codes/);
  const unreadable = run(["--file", fileURLToPath(new URL("does-not-exist.json", samples))]);
  assert.equal(unreadable.status, 2);
  assert.match(unreadable.stderr, /Input could not be read/);
  for (const args of [[], ["--file"], ["--json"], ["--unknown"], ["--stdin", "--json", "{}"], ["--type", "INVALID"], ["--stdin", "--type", "ZONE_DECISION", "--type", "ZONE_DECISION"]]) {
    const result = run(args);
    assert.equal(result.status, 2, args.join(" "));
    assert.match(result.stderr, /Usage error/);
  }
});
