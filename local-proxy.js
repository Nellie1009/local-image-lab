const http = require("node:http");
const https = require("node:https");

const PORT = Number(process.env.LOCAL_IMAGE_PROXY_PORT) || 8766;
const ALLOWED_HOSTS = new Set(["cdn.12ai.org", "new.12ai.org", "api.12ai.org"]);
const ALLOWED_PATHS = new Set(["/v1/images/edits", "/v1/images/generations"]);

function validateTarget(value) {
  let target;
  try {
    target = new URL(String(value || ""));
  } catch (_error) {
    throw new Error("目标地址无效。");
  }
  if (target.protocol !== "https:") throw new Error("代理只允许 HTTPS 目标。");
  if (target.username || target.password || target.port || target.hash || target.search
    || !ALLOWED_HOSTS.has(target.hostname) || !ALLOWED_PATHS.has(target.pathname)) {
    throw new Error("代理目标不允许访问。");
  }
  return target;
}

function isLocalOrigin(origin) {
  if (origin === "null") return true;
  try {
    const url = new URL(origin);
    return url.protocol === "http:"
      && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  } catch (_error) {
    return false;
  }
}

function getCorsHeaders(origin, isPrivateNetworkRequest = false) {
  if (!isLocalOrigin(origin)) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Local-Proxy-Target",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
    ...(isPrivateNetworkRequest ? { "Access-Control-Allow-Private-Network": "true" } : {})
  };
}

function applyCors(request, response) {
  const headers = getCorsHeaders(
    request.headers.origin,
    request.headers["access-control-request-private-network"] === "true"
  );
  if (!headers) return false;
  Object.entries(headers).forEach(([name, value]) => response.setHeader(name, value));
  return true;
}

function sendJson(response, status, body) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

function createServer() {
  return http.createServer(async (request, response) => {
    if (!applyCors(request, response)) return sendJson(response, 403, { error: { message: "仅允许本机页面访问代理。" } });

    if (request.url === "/__proxy/health" && request.method === "GET") {
      return sendJson(response, 200, { ok: true });
    }
    if (request.url !== "/__proxy") return sendJson(response, 404, { error: { message: "Not found" } });
    if (request.method === "OPTIONS") {
      response.statusCode = 204;
      return response.end();
    }
    if (request.method !== "POST") return sendJson(response, 405, { error: { message: "Method not allowed" } });

    let target;
    try {
      target = validateTarget(request.headers["x-local-proxy-target"]);
    } catch (error) {
      return sendJson(response, 400, { error: { message: error.message } });
    }

    const headers = {};
    for (const name of ["authorization", "content-type", "accept", "content-length"]) {
      const value = request.headers[name];
      if (value) headers[name] = value;
    }

    const upstreamRequest = https.request(target, { method: "POST", headers }, (upstream) => {
      response.statusCode = upstream.statusCode || 502;
      for (const name of ["content-type", "content-encoding", "content-length"]) {
        const value = upstream.headers[name];
        if (value) response.setHeader(name, value);
      }
      upstream.pipe(response);
    });
    const timeout = setTimeout(() => upstreamRequest.destroy(new Error("请求超时")), 175000);
    upstreamRequest.on("close", () => clearTimeout(timeout));
    upstreamRequest.on("error", (error) => {
      if (!response.headersSent) {
        sendJson(response, 502, { error: { message: `本机代理连接 12API 失败：${error.code || error.message}` } });
      } else {
        response.destroy();
      }
    });
    request.on("aborted", () => upstreamRequest.destroy());
    request.pipe(upstreamRequest);
  });
}

if (require.main === module) {
  const server = createServer();
  server.listen(PORT, "127.0.0.1", () => {
    process.stdout.write(`本地 GPT 图片代理已启动：http://127.0.0.1:${PORT}\n请保持此终端运行，再用 file:// 页面生图。\n`);
  });
}

module.exports = { createServer, getCorsHeaders, validateTarget };
