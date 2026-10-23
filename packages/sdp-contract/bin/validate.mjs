#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const help = `SDP contract validator (sdp.v1-draft.1 review draft)

Usage, from the repository root:
  node packages/sdp-contract/bin/validate.mjs --file event.json
  node packages/sdp-contract/bin/validate.mjs --json '<complete JSON event>'
  Get-Content -Raw event.json | node packages/sdp-contract/bin/validate.mjs --stdin

Options:
  --file PATH        Read one UTF-8 JSON event from a file (relative to current directory).
  --json JSON        Read one JSON event from the next argument.
  --stdin            Read one JSON event from standard input.
  --type TYPE        Require ZONE_DECISION or ZONE_FORECAST (optional).
  --help             Show help without requiring a build.

Build first: npm.cmd --prefix packages/sdp-contract run build
Exit codes: 0 valid; 1 invalid JSON/event or unexpected type; 2 usage/read/build error.
Uses validateSdpEvent; no cloud services, algorithms or cross-event reference checks.
All seven shared event types are supported when --type is omitted.
`;

async function main(args) {
  if (args.length === 1 && args[0] === "--help") {
    process.stdout.write(help);
    return 0;
  }
  let input;
  let expectedType;
  for (let i = 0; i < args.length; i++) {
    const option = args[i];
    if (option === "--type") {
      if (expectedType || !["ZONE_DECISION", "ZONE_FORECAST"].includes(args[i + 1])) {
        process.stderr.write("Usage error: --type must be ZONE_DECISION or ZONE_FORECAST, supplied once.\n");
        return 2;
      }
      expectedType = args[++i];
    } else if (["--file", "--json", "--stdin"].includes(option)) {
      if (input || (option !== "--stdin" && (args[i + 1] === undefined || args[i + 1].startsWith("--")))) {
        process.stderr.write("Usage error: supply exactly one of --file PATH, --json JSON or --stdin.\n");
        return 2;
      }
      input = { kind: option, value: option === "--stdin" ? null : args[++i] };
    } else {
      process.stderr.write("Usage error: unrecognized argument. Run with --help.\n");
      return 2;
    }
  }
  if (!input) {
    process.stderr.write("Usage error: supply --file PATH, --json JSON or --stdin. Run with --help.\n");
    return 2;
  }

  let json;
  try {
    if (input.kind === "--file") json = await readFile(input.value, "utf8");
    else if (input.kind === "--json") json = input.value;
    else {
      json = "";
      process.stdin.setEncoding("utf8");
      for await (const chunk of process.stdin) json += chunk;
    }
  } catch {
    process.stderr.write("Input could not be read. Check the path, file permissions or input stream.\n");
    return 2;
  }
  let event;
  try {
    // Windows PowerShell 5.1 commonly writes UTF-8 JSON with a BOM.
    event = JSON.parse(json.replace(/^\uFEFF/, ""));
  } catch {
    process.stderr.write("INVALID JSON: supply one complete JSON event object. Input contents are not printed.\n");
    return 1;
  }

  let validateSdpEvent;
  try {
    ({ validateSdpEvent } = await import("../dist/index.js"));
  } catch {
    process.stderr.write("Validator build unavailable. Run: npm.cmd --prefix packages/sdp-contract run build\n");
    return 2;
  }
  const result = validateSdpEvent(event);
  if (!result.ok) {
    process.stderr.write(`INVALID SDP event. Check required fields and allowed values:\n${result.errors.map(error => `  - ${error}`).join("\n")}\n`);
    return 1;
  }
  if (expectedType && result.value.event_type !== expectedType) {
    process.stderr.write(`INVALID event.event_type: expected ${expectedType}; received another valid shared event type.\n`);
    return 1;
  }
  process.stdout.write(`VALID ${result.value.event_type} (${result.value.schema_version}).\n`);
  return 0;
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch {
  process.stderr.write("Validation could not complete. Rebuild the shared contract package and retry.\n");
  process.exitCode = 2;
}
