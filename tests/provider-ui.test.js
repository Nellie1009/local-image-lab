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

test("the page wires additive image input, queued submissions, and history details", () => {
  assert.match(html, /id="reference-dropzone"/);
  assert.match(html, /id="reference-drop-target"/);
  assert.match(html, /class="upload-symbol"/);
  assert.match(html, /<kbd>⌘V<\/kbd>/);
  assert.match(html, /referenceDropTarget\.addEventListener\("click"/);
  assert.match(html, /referenceDropTarget\.addEventListener\("keydown"/);
  assert.doesNotMatch(html, /拖到这里/);
  assert.match(html, /\.upload-actions \.ghost-button,[\s\S]*?width: 112px;[\s\S]*?height: 38px;/);
  assert.match(html, /id="generation-queue-status"/);
  assert.match(html, /id="lightbox-details"/);
  assert.match(html, /reference-images\.js/);
  assert.match(html, /generation-queue\.js/);
  assert.match(html, /history-details\.js/);
  assert.match(html, /ReferenceImages\.extractImageFiles/);
  assert.match(html, /GenerationQueue\.createGenerationQueue/);
  assert.match(html, /HistoryDetails\.buildHistoryDetails/);
});
