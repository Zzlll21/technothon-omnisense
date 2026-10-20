import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

// Compile the pure presentation/export helpers using the installed application compiler.
const sourceText = readFileSync(new URL("../src/lib/sdpRecords.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(sourceText, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const { describeRecord, exportRecordsCsv, filterRecords, forecastExpiryReached, loadOperatingRecords, recordsCsvColumns } =
  await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`);
const fixtures = JSON.parse(readFileSync(new URL("../../../packages/sdp-contract/fixtures/scenarios.json", import.meta.url), "utf8"));
const byId = id => structuredClone(fixtures.events.find(event => event.event_id === id));
const scenario = id => fixtures.scenarios.find(item => item.id === id);

function parseCsv(csv) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    if (char === '"') {
      if (quoted && csv[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (char === "," || char === "\r")) {
      row.push(cell); cell = "";
      if (char === "\r") { assert.equal(csv[++i], "\n"); rows.push(row); row = []; }
    } else cell += char;
  }
  assert.equal(quoted, false);
  return rows;
}
function csvObjects(csv) {
  const [columns, ...rows] = parseCsv(csv);
  return rows.map(row => Object.fromEntries(columns.map((column, index) => [column, row[index]])));
}

test("chronology uses actual timestamp values including fractional seconds and does not mutate input", () => {
  const first = byId("decision-occupied"), later = byId("output-normal-applied");
  first.occurred_at = "2026-10-20T08:03:01Z";
  later.occurred_at = "2026-10-20T08:03:01.001Z";
  const input = [later, first];
  assert.deepEqual(filterRecords(input, "", "").map(event => event.event_id), [first.event_id, later.event_id]);
  assert.equal(input[0], later);
  assert.equal(filterRecords(input, "", "")[0].occurred_at, "2026-10-20T08:03:01Z");
});

test("zone and type filters compose and support zero matches", () => {
  const otherZone = byId("decision-occupied");
  otherZone.zone_id = "zone-test-other"; otherZone.event_id = "decision-test-other";
  const input = [byId("decision-occupied"), byId("forecast-return"), otherZone];
  assert.equal(filterRecords(input, "", "").length, 3);
  assert.equal(filterRecords(input, "zone-demo", "").length, 2);
  assert.equal(filterRecords(input, "zone-demo", "ZONE_DECISION").length, 1);
  assert.equal(filterRecords(input, "zone-test-other", "ZONE_FORECAST").length, 0);
});

test("source queries remain isolated by scenario and output events are never synthesized", async () => {
  const selected = scenario("return-to-automatic");
  const events = selected.event_ids.map(byId);
  const queriesSeen = [];
  const result = await loadOperatingRecords({ getEvents: async query => { queriesSeen.push(query); return events; } }, [selected.query]);
  assert.deepEqual(queriesSeen, [selected.query]);
  assert.equal(result.length, events.length);
  assert.deepEqual(new Set(result.map(event => event.event_id)), new Set(selected.event_ids));
  assert.ok(result.every(event => Date.parse(event.occurred_at) <= Date.parse(selected.query.as_of)));
});

test("multiple zone queries are supported only for the same session, clock and cutoff", async () => {
  const query = scenario("normal-occupied").query;
  const other = { ...query, zone_id: "zone-test-other" };
  const source = { getEvents: async selected => [{ ...byId("decision-occupied"), event_id: selected.zone_id, zone_id: selected.zone_id }] };
  assert.equal((await loadOperatingRecords(source, [query, other])).length, 2);
  for (const changed of [{ session_id: "other" }, { as_of: "2026-10-20T08:04:00.000Z" }, { clock: { time_base: "LIVE", replay_id: null } }]) {
    await assert.rejects(loadOperatingRecords(source, [query, { ...other, ...changed }]), /one session, clock and cutoff/);
  }
  await assert.rejects(loadOperatingRecords(source, [query, query]), /unique zones/);
});

test("empty sources and rejected loads propagate to the UI boundary", async () => {
  const query = scenario("normal-occupied").query;
  assert.deepEqual(await loadOperatingRecords({ getEvents: async () => [] }, [query]), []);
  assert.deepEqual(await loadOperatingRecords({ getEvents: async () => { throw new Error("must not load"); } }, []), []);
  await assert.rejects(loadOperatingRecords({ getEvents: async () => { throw new Error("source failed"); } }, [query]), /source failed/);
});

test("forecast expiry is an as-of annotation, without rewriting ACTIVE or creating history", () => {
  const event = byId("forecast-expired"), original = structuredClone(event);
  assert.equal(forecastExpiryReached(event, "2026-10-20T08:02:59.999Z"), false);
  assert.equal(forecastExpiryReached(event, event.payload.expires_at), true);
  assert.equal(describeRecord(event).status, "ACTIVE");
  const rows = csvObjects(exportRecordsCsv([event], event.payload.expires_at));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "ACTIVE");
  assert.equal(rows[0].forecast_expiry_reached_as_of, "true");
  assert.deepEqual(event, original);
  assert.equal(forecastExpiryReached(byId("forecast-cancelled"), "2026-10-21T00:00:00Z"), false);
});

test("record summaries distinguish requests, acceptance, application, cancellation and referenced updates", () => {
  assert.equal(describeRecord(byId("override-request")).title, "Manual override requested");
  assert.equal(describeRecord(byId("return-request")).title, "Return to Automatic requested");
  assert.equal(describeRecord(byId("output-command-accepted")).summary, "Application not confirmed");
  assert.equal(describeRecord(byId("output-normal-applied")).status, "APPLIED");
  assert.equal(describeRecord(byId("forecast-cancelled")).title, "Forecast cancelled");
  const update = byId("forecast-return"); update.payload.supersedes_event_id = "previous-forecast";
  assert.equal(describeRecord(update).title, "Forecast updated");
  for (const event of fixtures.events) assert.ok(describeRecord(event).title);
});

test("CSV exports only selected records with exact UTC, IDs, provenance and separate requested/reported fields", () => {
  const selected = scenario("normal-occupied");
  const events = selected.event_ids.map(byId);
  const records = filterRecords(events, "zone-demo", "ZONE_DECISION");
  const rows = csvObjects(exportRecordsCsv(records, selected.query.as_of));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].event_id, "decision-occupied");
  assert.equal(rows[0].requested_fan, "HIGH");
  assert.equal(rows[0].reported_fan, "");
  assert.equal(rows[0].reason_code, "OCCUPIED_EVIDENCE");
  assert.equal(rows[0].data_sources, "SIMULATED");
  assert.equal(rows[0].time_base, "REPLAY");
  assert.equal(rows[0].as_of, selected.query.as_of);
  assert.equal(rows[0].occurred_at, records[0].occurred_at);
  assert.deepEqual(JSON.parse(rows[0].event_json), records[0]);
  const output = csvObjects(exportRecordsCsv([byId("output-normal-applied")], selected.query.as_of))[0];
  assert.equal(output.status, "APPLIED");
  assert.equal(output.reported_fan, "HIGH");
  assert.equal(output.requested_fan, "");
  assert.equal(output.decision_event_id, "decision-occupied");
});

test("CSV round-trips commas, quotes, Unicode and multiline text and neutralizes formula cells", () => {
  const event = byId("decision-occupied");
  event.payload.reason_text = '=SUM(1,2)\r\nReview "quoted" text / \u00b0C';
  const rows = csvObjects(exportRecordsCsv([event], scenario("normal-occupied").query.as_of));
  assert.equal(rows[0].reason, `'${event.payload.reason_text}`);
  assert.deepEqual(JSON.parse(rows[0].event_json), event);
  for (const prefix of ["+", "-", "@", "  =", "\t"]) {
    event.payload.reason_text = `${prefix}formula`;
    assert.ok(csvObjects(exportRecordsCsv([event], event.occurred_at))[0].reason.startsWith("'"));
  }
  assert.deepEqual(parseCsv(exportRecordsCsv([], event.occurred_at)), [[...recordsCsvColumns]]);
});

test("request filter and CSV use exact request IDs across controller decisions and B reports", () => {
  const selected = scenario("return-to-automatic");
  const events = selected.event_ids.map(byId);
  const original = filterRecords(events, "", "", "request-occupied");
  const returned = filterRecords(events, "", "", "request-return");
  assert.ok(original.some(event => event.event_id === "override-cancelled"));
  assert.ok(!returned.some(event => event.event_id === "override-cancelled"));
  assert.ok(returned.some(event => event.event_id === "output-return-applied"));
  assert.ok(!returned.some(event => event.event_id === "output-override-applied"));
  const outputs = filterRecords(events, "", "APPLIED_OUTPUT", "request-return");
  const rows = csvObjects(exportRecordsCsv(outputs, selected.query.as_of, events));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].override_request_id, "request-return");
  assert.equal(rows[0].event_id, "output-return-applied");
});
