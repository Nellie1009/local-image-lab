const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

test("generation builds exact-model candidates and uses quota fallback", () => {
  assert.match(html, /ProviderRouter\.buildCandidates/);
  assert.match(html, /modelId: model/);
  assert.match(html, /ProviderRouter\.runWithCredentialFallback/);
  assert.match(html, /credentialStore\.markExhausted/);
  assert.match(html, /ProviderAdapters\.redactRequestDescriptor/);
  assert.doesNotMatch(html, /const apiKey = normalizeApiKey\(data\.get\("apiKey"\)\)/);
});

test("all three request adapters are selected from catalog mappings", () => {
  assert.match(html, /mapping\.adapter === "openai-images"/);
  assert.match(html, /mapping\.adapter === "gemini-native"/);
  assert.match(html, /mapping\.adapter === "ark-images"/);
  assert.match(html, /mapping\.requestModel/);
});

test("request records use route labels without copying credential secrets", () => {
  assert.match(html, /credentialLabel/);
  assert.match(html, /routingAttempts/);
  assert.doesNotMatch(html, /recordModelRequest\([^)]*\.secret/);
});

test("Ark references are converted to data URLs and parsed as OpenAI-style images", () => {
  assert.match(html, /Promise\.all\(context\.sourceImages\.map\(blobToDataUrl\)\)/);
  assert.match(html, /ProviderAdapters\.buildArkRequest/);
  assert.match(html, /normalizeOpenAiImages/);
});

test("quota fallback does not replace the existing two-model queue", () => {
  assert.match(html, /MultiModel\.runModelQueue/);
  assert.match(html, /MODEL_REQUEST_CONCURRENCY/);
  assert.match(html, /正在切换 API Key/);
});

test("unknown timeouts are not replayed and Gemini images keep their winning route", () => {
  assert.match(html, /if \(error\?\.name === "TimeoutError"\) throw error/);
  assert.match(html, /route: createRouteMetadata\(successfulCandidate, routingAttempts\)/);
  assert.match(html, /const imageRoute = image\.route \|\| metadata\.route/);
});
