import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareLanding, landingRoutes } from "../scripts/landing-assets.mjs";
const app = fileURLToPath(new URL("../", import.meta.url));

test("packaged landing links enter the real workspace and every local runtime asset exists", () => {
  prepareLanding();
  const html = readFileSync(resolve(app, "public/landing/index.html"), "utf8");
  assert.doesNotMatch(html, /omnisense-room-workspace|omnisense-office/);
  assert.equal((html.match(/href="\/workspace(?:\?view=records)?"/g) ?? []).length, 5);
  assert.match(html, /Illustrative synthetic records/);
  for (const [, url] of html.matchAll(/(?:src|href)="([^"#]+\.(?:js|css)(?:\?[^" ]*)?)"/g)) {
    const asset = resolve(app, "public/landing", url.split("?")[0]);
    assert.ok(existsSync(asset), `Missing packaged presentation asset: ${url}`);
  }
  const office = readFileSync(resolve(app, "../../docs/design/omnisense-office/office-scene.js"));
  assert.deepEqual(readFileSync(resolve(app, "public/landing/office-scene.js")), office);
});

test("development and preview serve the landing directory without substituting the React SPA", () => {
  const plugin = landingRoutes();
  for (const install of [plugin.configureServer, plugin.configurePreviewServer]) {
    let middleware;
    install({ middlewares: { use(fn) { middleware = fn; } } });
    const request = { url: "/landing/?campaign=demo" }; let passed = false;
    middleware(request, {}, () => { passed = true; });
    assert.equal(request.url, "/landing/index.html?campaign=demo"); assert.ok(passed);
    let location, ended = false; const response = { setHeader(_name, value) { location = value; }, end() { ended = true; } };
    middleware({ url: "/landing?campaign=demo" }, response, () => assert.fail("Expected redirect"));
    assert.equal(response.statusCode, 302); assert.equal(location, "/landing/?campaign=demo"); assert.ok(ended);
    const workspace = { url: "/workspace?view=records" };
    middleware(workspace, {}, () => {});
    assert.equal(workspace.url, "/workspace?view=records");
  }
});
