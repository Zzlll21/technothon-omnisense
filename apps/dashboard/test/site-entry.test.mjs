import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareLanding, landingRoutes } from "../scripts/landing-assets.mjs";
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
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

async function renderEntry(url, authenticated = false) {
  const react = import.meta.resolve('react');
  // Only the workspace and account state are mocked; execute the real App route branch.
  const reactMock = `data:text/javascript;base64,${Buffer.from(`import * as real from ${JSON.stringify(react)};export const Suspense=real.Suspense,useEffect=real.useEffect;export const lazy=()=>()=>real.createElement('p',null,'PROTECTED_WORKSPACE_SENTINEL');`).toString('base64')}`;
  const gate = `data:text/javascript;base64,${Buffer.from(`import * as React from ${JSON.stringify(react)};export const PrivateHybridAccess=({children})=>${authenticated?'children':"React.createElement('h1',null,'LOGIN_REQUIRED_SENTINEL')"};`).toString('base64')}`;
  let source = ts.transpileModule(readFileSync(resolve(app, 'src/App.tsx'), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  for (const quote of ['"', "'"]) source = source.replaceAll(quote+'react/jsx-runtime'+quote, JSON.stringify(import.meta.resolve('react/jsx-runtime'))).replaceAll(quote+'react'+quote, JSON.stringify(reactMock));
  source = source.replaceAll('./components/PrivateHybridAccess', gate);
  const { App } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const previous = globalThis.window;
  try {
    globalThis.window = { location: new URL(url, 'https://omnisense-hybrid-spatial.vercel.app') };
    return renderToStaticMarkup(React.createElement(App));
  } finally { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; }
}

test('anonymous root and index routes reach the public landing without mounting the login or workspace', async () => {
  for (const url of ['/', '/index.html', '/?campaign=demo', '/index.html#how-it-works']) {
    const html = await renderEntry(url);
    assert.match(html, /Visit the landing page/);
    assert.doesNotMatch(html, /LOGIN_REQUIRED_SENTINEL|PROTECTED_WORKSPACE_SENTINEL/);
  }
  const landing = readFileSync(resolve(app, 'public/landing/index.html'), 'utf8');
  assert.doesNotMatch(landing, /supabase|access_token|sb_secret_|de585067-a340-471c-b990-d0ee6004cde3/);
});

test('workspace and existing deep links require login; authenticated visitors mount the workspace directly', async () => {
  for (const url of ['/workspace', '/workspace/', '/workspace?view=records', '/?experience=spatial', '/?experience=spatial&view=room', '/?view=history', '/index.html?view=records']) {
    const anonymous = await renderEntry(url);
    assert.match(anonymous, /LOGIN_REQUIRED_SENTINEL/);
    assert.doesNotMatch(anonymous, /PROTECTED_WORKSPACE_SENTINEL|Visit the landing page/);
    const authorized = await renderEntry(url, true);
    assert.match(authorized, /PROTECTED_WORKSPACE_SENTINEL/);
    assert.doesNotMatch(authorized, /LOGIN_REQUIRED_SENTINEL|Visit the landing page/);
  }
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
