import http from "node:http";
import { closeMqttPublisher, publishCrisisCommand } from "./mqttPublisher.js";

const port = Number.parseInt(process.env.PORT ?? "3001", 10);

if (!Number.isInteger(port) || port <= 0) {
  throw new Error("PORT must be a positive integer.");
}

const server = http.createServer(async (request, response) => {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method !== "POST" || request.url !== "/api/crisis") {
    sendJson(response, 404, {
      ok: false,
      error: "Not found"
    });
    return;
  }

  try {
    const body = await readJsonBody(request);
    const validation = validateCrisisRequest(body);

    if (!validation.ok) {
      sendJson(response, 400, {
        ok: false,
        error: validation.error
      });
      return;
    }

    const result = await publishCrisisCommand(validation.value);

    console.log(
      `Crisis command published: node_id=${validation.value.node_id} topic=${result.topic} enabled=${validation.value.enabled}`
    );

    sendJson(response, 200, {
      ok: true,
      topic: result.topic,
      payload: result.payload
    });
  } catch (error) {
    console.error(`Crisis command failed: ${formatError(error)}`);
    sendJson(response, 500, {
      ok: false,
      error: "Failed to publish crisis command"
    });
  }
});

server.listen(port, () => {
  console.log(`OmniSense control API listening on http://localhost:${port}`);
  console.log("CORS: allowing local dashboard development origins.");
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function shutdown() {
  console.log("Stopping control API...");
  server.close(() => {
    closeMqttPublisher(() => {
      console.log("Control API stopped.");
      process.exit(0);
    });
  });
}

function validateCrisisRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      error: "Request body must be a JSON object."
    };
  }

  const nodeId = typeof body.node_id === "string" ? body.node_id.trim() : "";
  if (!/^[A-Za-z0-9_-]+$/.test(nodeId)) {
    return {
      ok: false,
      error: "node_id must be a non-empty string using letters, numbers, underscores, or hyphens."
    };
  }

  if (typeof body.enabled !== "boolean") {
    return {
      ok: false,
      error: "enabled must be a boolean."
    };
  }

  if (
    body.target_pmv_limit !== undefined &&
    (typeof body.target_pmv_limit !== "number" || !Number.isFinite(body.target_pmv_limit))
  ) {
    return {
      ok: false,
      error: "target_pmv_limit must be a finite number when provided."
    };
  }

  if (body.reason !== undefined && typeof body.reason !== "string") {
    return {
      ok: false,
      error: "reason must be a string when provided."
    };
  }

  return {
    ok: true,
    value: {
      node_id: nodeId,
      enabled: body.enabled,
      target_pmv_limit: body.target_pmv_limit,
      reason: body.reason?.trim() || undefined
    }
  };
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let rawBody = "";

    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      rawBody += chunk;
      if (rawBody.length > 16_384) {
        reject(new Error("Request body is too large."));
        request.destroy();
      }
    });

    request.on("end", () => {
      try {
        resolve(rawBody ? JSON.parse(rawBody) : {});
      } catch {
        reject(new Error("Request body must be valid JSON."));
      }
    });

    request.on("error", reject);
  });
}

function setCorsHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json"
  });
  response.end(JSON.stringify(body));
}

function formatError(error) {
  if (!error) {
    return "unknown error";
  }

  return error.message ? error.message : String(error);
}
