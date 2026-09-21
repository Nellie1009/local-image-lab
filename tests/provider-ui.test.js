const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

test("the generation page exposes local API sources and the price dialog", () => {
  assert.match(html, /id="provider-source-panel"/);
  assert.match(html, /id="provider-select"/);
  assert.match(html, /id="add-provider-key"/);
  assert.match(html, /id="credential-rows"/);
  assert.match(html, /id="price-viewer"/);
  assert.match(html, /id="view-pricing"/);
  assert.match(html, /provider-catalog\.js/);
  assert.match(html, /credential-store\.js/);
  assert.match(html, /provider-router\.js/);
  assert.match(html, /provider-adapters\.js/);
  assert.doesNotMatch(html, /id="base-url"/);
  assert.doesNotMatch(html, /id="api-key"/);
});

test("models are rendered from the catalog instead of hard-coded checkboxes", () => {
  assert.match(html, /function renderModelOptions\(/);
  assert.match(html, /ProviderCatalog\.createModelConfigMap/);
  assert.doesNotMatch(html, /class="model-option"><input type="checkbox" value=/);
});

test("credentials can be restored without printing the secret into row markup", () => {
  assert.match(html, /CredentialStore\.maskSecret/);
  assert.match(html, /credentialStore\.restore/);
  assert.match(html, /credential-row exhausted/);
  assert.doesNotMatch(html, /row\.dataset\.secret/);
});

test("catalog failures leave generation disabled with a specific message", () => {
  assert.match(html, /function setCatalogFailure\(/);
  assert.match(html, /initializeProviderUi\(\)\.catch\(setCatalogFailure\)/);
});

test("price viewer distinguishes request, image, and token billing", () => {
  assert.match(html, /function openPriceViewer\(/);
  assert.match(html, /per_request/);
  assert.match(html, /per_image/);
  assert.match(html, /per_token/);
  assert.match(html, /pricing\.json/);
});
