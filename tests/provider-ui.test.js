const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

test("the generation page exposes local API sources and the price dialog", () => {
  assert.match(html, /<section class="provider-source-panel" id="provider-source-panel">/);
  assert.match(html, /<div class="provider-source-heading">/);
  assert.doesNotMatch(html, /<details class="provider-source-panel"/);
  assert.match(html, /id="provider-select"/);
  assert.match(html, /customOption\.value = "custom"/);
  assert.match(html, /id="provider-key-label"[^>]*placeholder="备注（可选），例如：主 Key"/);
  assert.doesNotMatch(html, /id="custom-provider-name"/);
  assert.match(html, /id="custom-provider-url"/);
  assert.doesNotMatch(html, /custom-provider-example|credential\.integrationExample|接入示例/);
  assert.match(html, /id="add-provider-key"/);
  assert.match(html, /<details class="saved-credentials" id="saved-credentials">[\s\S]*?<summary>已保存的 API<\/summary>[\s\S]*?<div class="credential-rows" id="credential-rows">/);
  assert.match(html, /id="price-viewer"/);
  assert.match(html, /id="view-pricing"/);
  assert.match(html, /provider-catalog\.js/);
  assert.match(html, /credential-store\.js/);
  assert.match(html, /provider-router\.js/);
  assert.match(html, /provider-adapters\.js/);
  assert.doesNotMatch(html, /id="base-url"/);
  assert.doesNotMatch(html, /id="api-key"/);
});

test("custom APIs use a URL-derived source and an optional user remark", () => {
  const customAdd = html.match(/if \(providerSelect\.value === "custom"\) \{([\s\S]*?)\n        \}/)?.[1] || "";
  assert.doesNotMatch(html, /providerKeyLabel\.hidden/);
  assert.doesNotMatch(customAdd, /providerName:/);
  assert.match(customAdd, /label: providerKeyLabel\.value\.trim\(\) \|\| `\$\{sourceName\} Key`/);
  assert.match(html, /const sourceName = new URL\(customBaseUrl\)\.hostname/);
  assert.match(html, /label: providerKeyLabel\.value\.trim\(\) \|\| `\$\{sourceName\} Key`/);
  assert.match(html, /id="custom-provider-url"/);
});

test("the history header navigation collapses to one return-to-studio link", () => {
  const syncRoute = html.match(/function syncRoute\(\) \{[\s\S]*?\n    \}/)?.[0] || "";

  assert.match(html, /id="history-link">查看生图历史<\/a>/);
  assert.doesNotMatch(html, /id="home-link"/);
  assert.match(html, /id="history-return-link"[^>]*>返回生图台<\/a>/);
  assert.match(syncRoute, /historyLink\.hidden = showHistory/);
  assert.match(syncRoute, /historyReturnLink\.hidden = !showHistory/);
  assert.match(html, /\.top-actions \[hidden\] \{\s*display: none;/);
  assert.doesNotMatch(html, /class="status-pill"/);
  assert.doesNotMatch(html, /id="status"|\bstatusEl\b/);
  assert.doesNotMatch(html, /href="#home">返回生成<\/a>/);
});

test("models are rendered from the catalog instead of hard-coded checkboxes", () => {
  assert.match(html, /function renderModelOptions\(/);
  assert.match(html, /ProviderCatalog\.createModelConfigMap/);
  assert.doesNotMatch(html, /class="model-option"><input type="checkbox" value=/);
});

test("model picker allows deselecting its only checked model", () => {
  const changeHandler = html.match(/function handleModelSelectionChange\(event\) \{[\s\S]*?\n    \}/)?.[0] || "";
  assert.doesNotMatch(changeHandler, /if \(!modelCheckboxes\.some\(\(checkbox\) => checkbox\.checked\)\)/);
  assert.match(html, /if \(!selected\.length\) return \[\]/);
  assert.match(html, /\? "未选择模型"/);
  assert.match(html, /setPreviewState\("未选择模型"/);
});

test("model and count stay visible while advanced generation settings start collapsed", () => {
  const advancedIndex = html.indexOf('<details class="advanced-model-settings"');
  assert.notEqual(advancedIndex, -1);

  const modelControlsStart = html.indexOf('id="model-picker"');
  const countControl = html.indexOf('id="count"');
  assert.ok(modelControlsStart >= 0 && modelControlsStart < advancedIndex);
  assert.ok(countControl >= 0 && countControl < advancedIndex);
  assert.doesNotMatch(html.slice(advancedIndex, html.indexOf(">", advancedIndex)), /\sopen(?:\s|>)/);

  const advancedEnd = html.indexOf("</details>", advancedIndex);
  const advancedControls = html.slice(advancedIndex, advancedEnd);
  assert.match(advancedControls, /id="size"/);
  assert.match(advancedControls, /id="quality"/);
  assert.match(advancedControls, /id="output-format"/);
  assert.match(advancedControls, /id="style"/);
  assert.match(advancedControls, /id="background"/);
  assert.match(advancedControls, /id="gemini-resolution"/);
});

test("credentials can be restored without printing the secret into row markup", () => {
  assert.match(html, /CredentialStore\.maskSecret/);
  assert.match(html, /credentialStore\.restore/);
  assert.match(html, /credential-row exhausted/);
  assert.doesNotMatch(html, /row\.dataset\.secret/);
});

test("credential rows display and copy API URLs while unconfigured sources stay unroutable", () => {
  assert.match(html, /providerName/);
  assert.match(html, /baseUrl/);
  assert.match(html, /copy-url/);
  assert.match(html, /navigator\.clipboard\.writeText/);
  assert.match(html, /待接入/);
  assert.match(html, /providersById\.has\(credential\.providerId\)/);
});

test("saved credential rows show URL before API Key with matching field styling", () => {
  assert.match(html, /main\.append\(name\);[\s\S]*?urlInput\.className = "credential-value";[\s\S]*?main\.appendChild\(urlLine\);[\s\S]*?secret\.className = "credential-value credential-secret-display";[\s\S]*?main\.append\(secret, meta\);/);
  assert.match(html, /\.credential-value\s*\{[^}]*min-height: 40px;[^}]*padding: 11px 12px;[^}]*font-size: 12px;/);
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
  assert.match(html, /点击上传参考图片/);
  assert.match(html, /支持 JPG、PNG、WebP，可拖拽或粘贴添加/);
  assert.match(html, /class="upload-clear-button"/);
  assert.match(html, /referenceDropTarget\.addEventListener\("click"/);
  assert.match(html, /referenceDropTarget\.addEventListener\("keydown"/);
  assert.doesNotMatch(html, /拖到这里/);
  assert.doesNotMatch(html, /class="upload-actions"/);
  assert.match(html, /id="generation-queue-status"/);
  assert.match(html, /id="lightbox-details"/);
  assert.match(html, /reference-images\.js/);
  assert.match(html, /generation-queue\.js/);
  assert.match(html, /history-details\.js/);
  assert.match(html, /ReferenceImages\.extractImageFiles/);
  assert.match(html, /GenerationQueue\.createGenerationQueue/);
  assert.match(html, /HistoryDetails\.buildHistoryDetails/);
});

test("GPT Image controls expose complexity, GIF timing, and a separate markup PNG input", () => {
  assert.match(html, /id="complexity"/);
  assert.match(html, /id="frame-count"/);
  assert.match(html, /id="frame-duration-ms"/);
  assert.match(html, /id="markup-image"[^>]*accept="image\/png"/);
  assert.match(html, /id="markup-status"/);
  assert.match(html, /id="mask-image"[^>]*accept="image\/png"/);
  assert.match(html, /id="mask-status"/);
  assert.match(html, /id="custom-size"/);
  assert.match(html, /function syncOutputFormatDetails\(/);
  assert.match(html, /if \(next\.output_format === "svg"\) next\.n = 1;/);
});
