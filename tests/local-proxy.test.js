const test = require("node:test");
const assert = require("node:assert/strict");
const { getCorsHeaders, validateTarget } = require("../local-proxy.js");

test("local proxy only forwards HTTPS OpenAI image endpoints on known 12API hosts", () => {
  assert.equal(
    validateTarget("https://cdn.12ai.org/v1/images/edits").href,
    "https://cdn.12ai.org/v1/images/edits"
  );
  assert.equal(
    validateTarget("https://api.12ai.org/v1/images/generations").href,
    "https://api.12ai.org/v1/images/generations"
  );
  assert.throws(() => validateTarget("http://cdn.12ai.org/v1/images/edits"), /HTTPS/);
  assert.throws(() => validateTarget("https://example.com/v1/images/edits"), /不允许/);
  assert.throws(() => validateTarget("https://cdn.12ai.org/v1/chat/completions"), /不允许/);
  assert.throws(() => validateTarget("https://cdn.12ai.org/v1/images/edits?key=secret"), /不允许/);
});

test("local proxy explicitly allows file-page Authorization preflight", () => {
  const headers = getCorsHeaders("null", true);
  assert.equal(headers["Access-Control-Allow-Origin"], "null");
  assert.match(headers["Access-Control-Allow-Headers"], /Authorization/i);
  assert.equal(headers["Access-Control-Allow-Private-Network"], "true");
  assert.equal(getCorsHeaders("https://attacker.example"), null);
});
