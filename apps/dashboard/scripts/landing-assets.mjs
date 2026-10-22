// Package only approved public presentation assets. No workspace data, fixtures or credentials.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const app = fileURLToPath(new URL("../", import.meta.url));
const source = resolve(app, "../../docs/design"), target = resolve(app, "public/landing");
export function prepareLanding() {
  const files = [
    ["omnisense-landing/index.html", "index.html"],
    ["omnisense-landing/styles.css", "styles.css"],
    ["omnisense-landing/app.js", "app.js"],
    ["omnisense-landing/vendor/gsap.min.js", "vendor/gsap.min.js"],
    ["omnisense-landing/vendor/ScrollTrigger.min.js", "vendor/ScrollTrigger.min.js"],
    ["omnisense-office/office-scene.js", "office-scene.js"]
  ];
  for (const [from, to] of files) {
    let body = readFileSync(resolve(source, from));
    if (to === "index.html") body = Buffer.from(body.toString("utf8")
      .replaceAll("../omnisense-room-workspace/", "/workspace")
      .replaceAll("../omnisense-office/office-scene.js", "office-scene.js"));
    const destination = resolve(target, to);
    mkdirSync(dirname(destination), { recursive: true });
    if (!existsSync(destination) || !readFileSync(destination).equals(body)) writeFileSync(destination, body);
  }
}

// Vite's public-file server does not resolve directory indexes in development.
// Keep /landing/ identical in dev and production preview without serving the SPA fallback there.
export function landingRoutes() {
  function route(request, response, next) {
    const path = (request.url ?? "").split("?")[0];
    if (path === "/landing") {
      response.statusCode = 302;
      response.setHeader("Location", request.url.replace("/landing", "/landing/"));
      response.end();
      return;
    }
    if (path === "/landing/") request.url = request.url.replace("/landing/", "/landing/index.html");
    next();
  }
  return {
    name: "approved-landing-directory",
    configureServer(server) { server.middlewares.use(route); },
    configurePreviewServer(server) { server.middlewares.use(route); }
  };
}
