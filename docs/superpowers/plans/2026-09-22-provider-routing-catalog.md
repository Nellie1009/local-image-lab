# Provider Routing Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single Base URL/API Key form with catalog-driven image models, locally stored provider credentials, price-aware routing, quota fallback, and an in-page price viewer.

**Architecture:** Load three internal JSON catalogs at startup, normalize them through a small UMD catalog module, and keep secrets in a separate localStorage-backed credential store. Pure router and adapter modules choose and construct requests; `index.html` remains the orchestration and rendering layer so the existing static deployment, IndexedDB history, multi-model comparison, and Excel export keep working.

**Tech Stack:** Static HTML/CSS/JavaScript, browser `fetch`, localStorage, IndexedDB, Node.js built-in test runner, ExcelJS browser bundle.

**Spec:** `docs/superpowers/specs/2026-09-22-provider-routing-catalog-design.md`

## Global Constraints

- Keep exactly two application pages: generation configuration and image history.
- Store API secrets only in browser localStorage; never write them to JSON, history, diagnostics, Excel, Git, or rendered price data.
- Load catalogs from `data/providers.json`, `data/models.json`, and `data/pricing.json` over HTTP(S).
- Include the nine 12API image-generation models and three Volcengine Ark Seedream models listed in the spec.
- Use `default` as the current 12API credential price group and `cdn` as its default endpoint.
- Only a confirmed quota error exhausts a credential and triggers fallback; 400, 401, 403, timeout, and unknown network failures do not.
- Never substitute one model ID for another model ID.
- Do not automatically replay an unknown-timeout image request on another endpoint.
- Preserve multi-model comparison concurrency at two tasks.
- Preserve existing saved prompts, image upload/reordering, history, download, lightbox, and Excel comparison behavior.
- Do not send a real image-generation request during automated or browser verification.

## Review Focus

- Missing, malformed, or cross-referencing catalog data must disable generation with the exact failing filename and validation message; covered in Task 1.
- A static `0%` availability candidate must remain a last-resort candidate instead of being permanently disabled; covered in Task 3.
- Only HTTP 402 or a configured quota message may mark a credential exhausted; covered in Tasks 2 and 3.
- Legacy saved keys must migrate once without appearing in diagnostics, history, price JSON, or Excel; covered in Tasks 2, 5, and 6.
- Per-token prices must never be presented or sorted as a fabricated per-image estimate; covered in Tasks 1, 3, and 4.

---

### Task 1: Add and validate the provider, model, and price catalogs

**Files:**
- Create: `data/providers.json`
- Create: `data/models.json`
- Create: `data/pricing.json`
- Create: `provider-catalog.js`
- Create: `tests/provider-catalog.test.js`

**Interfaces:**
- Consumes: the approved spec's platform, model, and pricing tables.
- Produces: `ProviderCatalog.loadCatalogs(fetchImpl, rootPath)`, `ProviderCatalog.validateCatalogs(raw)`, `ProviderCatalog.createCatalogIndex(raw)`, `ProviderCatalog.createModelConfigMap(index)`, and `ProviderCatalog.getPriceRows(index, modelIds)`.

- [ ] **Step 1: Write the failing catalog integrity tests**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Catalog = require("../provider-catalog.js");

const readJson = (name) => JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "data", name), "utf8")
);

test("the catalogs contain exactly the approved twelve image models", () => {
  const raw = {
    providers: readJson("providers.json"),
    models: readJson("models.json"),
    pricing: readJson("pricing.json")
  };
  assert.deepEqual(Catalog.validateCatalogs(raw), []);
  assert.deepEqual(
    raw.models.models.map((model) => model.id),
    [
      "gpt-image-2.5-flare",
      "gpt-image-2.5-sunburst",
      "gpt-image-2",
      "gemini-3.1-flash-lite-image",
      "gemini-2.5-flash-image",
      "gemini-3-pro-image",
      "gemini-3-pro-image-preview",
      "gemini-3.1-flash-image",
      "gemini-3.1-flash-image-preview",
      "doubao-seedream-4-5-251128",
      "doubao-seedream-5-0-260128",
      "doubao-seedream-5-0-pro-260628"
    ]
  );
});

test("every model has a default 12API price group", () => {
  const index = Catalog.createCatalogIndex({
    providers: readJson("providers.json"),
    models: readJson("models.json"),
    pricing: readJson("pricing.json")
  });
  for (const model of index.modelsById.values()) {
    assert.ok(index.pricesByProviderModel.get(`12api:${model.id}`)?.groupsById.has("default"));
  }
});

test("per-token pricing has no per-image estimate", () => {
  const index = Catalog.createCatalogIndex({
    providers: readJson("providers.json"),
    models: readJson("models.json"),
    pricing: readJson("pricing.json")
  });
  const row = Catalog.getPriceRows(index, ["gpt-image-2"])
    .find((item) => item.groupId === "default");
  assert.equal(row.billingType, "per_token");
  assert.equal(row.estimatedPerRequest, null);
});
```

- [ ] **Step 2: Run the catalog test and verify it fails**

Run: `node --test tests/provider-catalog.test.js`

Expected: FAIL because `provider-catalog.js` and the three JSON files do not exist.

- [ ] **Step 3: Create the three JSON files from the approved data**

Use these top-level shapes and transcribe all twelve model entries and all 39 price-group records exactly from the spec:

```json
{
  "schemaVersion": 1,
  "providers": []
}
```

```json
{
  "schemaVersion": 1,
  "models": []
}
```

```json
{
  "schemaVersion": 1,
  "currency": "CNY",
  "updatedAt": "2026-09-22",
  "sources": []
}
```

Represent missing availability as JSON `null`. Store GPT Image 2.5 quality multipliers as exact numbers `1`, `1.5`, and `2`; preserve the source display price separately when it rounds to three decimals. Store `gpt-image-2` default pricing as `per_token`, with input `12.5`, output `75`, and cached input `5` per million tokens.

- [ ] **Step 4: Implement catalog loading, validation, indexing, and model-config conversion**

```js
(function initProviderCatalog(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ProviderCatalog = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  async function loadCatalogs(fetchImpl = globalThis.fetch, rootPath = "data") {
    const names = ["providers", "models", "pricing"];
    const values = await Promise.all(names.map(async (name) => {
      const response = await fetchImpl(`${rootPath}/${name}.json`, { cache: "no-store" });
      if (!response.ok) throw new Error(`${name}.json 加载失败：HTTP ${response.status}`);
      return response.json();
    }));
    const raw = Object.fromEntries(names.map((name, index) => [name, values[index]]));
    const errors = validateCatalogs(raw);
    if (errors.length) throw new Error(errors.join("\n"));
    return createCatalogIndex(raw);
  }

  function validateCatalogs(raw) {
    const errors = [];
    for (const name of ["providers", "models", "pricing"]) {
      if (raw?.[name]?.schemaVersion !== 1) {
        errors.push(`${name}.json: schemaVersion 必须为 1`);
      }
    }
    const providers = Array.isArray(raw?.providers?.providers) ? raw.providers.providers : [];
    const models = Array.isArray(raw?.models?.models) ? raw.models.models : [];
    const providerIds = new Set();
    const modelIds = new Set();
    for (const provider of providers) {
      if (!provider.id || providerIds.has(provider.id)) {
        errors.push(`providers.json: 平台 ID 缺失或重复：${provider.id || "(empty)"}`);
      }
      providerIds.add(provider.id);
    }
    for (const model of models) {
      if (!model.id || modelIds.has(model.id)) {
        errors.push(`models.json: 模型 ID 缺失或重复：${model.id || "(empty)"}`);
      }
      modelIds.add(model.id);
    }
    for (const provider of providers) {
      const endpointIds = new Set((provider.endpoints || []).map((item) => item.id));
      if (!endpointIds.has(provider.defaultEndpointId)) {
        errors.push(`providers.json: ${provider.id} 缺少默认线路 ${provider.defaultEndpointId}`);
      }
      for (const mapping of provider.modelMappings || []) {
        if (!modelIds.has(mapping.modelId)) {
          errors.push(`providers.json: ${provider.id} 引用了不存在的模型 ${mapping.modelId}`);
        }
        if (!mapping.requestModel || !["openai-images", "gemini-native"].includes(mapping.adapter)) {
          errors.push(`providers.json: ${provider.id}/${mapping.modelId} 的请求映射无效`);
        }
      }
    }
    for (const source of raw?.pricing?.sources || []) {
      if (!providerIds.has(source.providerId)) {
        errors.push(`pricing.json: 引用了不存在的平台 ${source.providerId}`);
      }
      for (const pricedModel of source.models || []) {
        if (!modelIds.has(pricedModel.modelId)) {
          errors.push(`pricing.json: 引用了不存在的模型 ${pricedModel.modelId}`);
        }
        const groupIds = new Set();
        for (const group of pricedModel.groups || []) {
          if (!group.id || groupIds.has(group.id)) {
            errors.push(`pricing.json: ${pricedModel.modelId} 的价格分组缺失或重复`);
          }
          groupIds.add(group.id);
        }
        if (!groupIds.has("default")) {
          errors.push(`pricing.json: ${pricedModel.modelId} 缺少 default 分组`);
        }
      }
    }
    return errors;
  }

  return { loadCatalogs, validateCatalogs, createCatalogIndex, createModelConfigMap, getPriceRows };
});
```

`createModelConfigMap` must return the existing `MODEL_CONFIGS` field names so `MultiModel.resolveCompatiblePayload` remains unchanged. `createCatalogIndex` exposes `providersById`, `modelsById`, `mappingsByModelId`, and `pricesByProviderModel`; `mappingsByModelId` contains one entry per provider mapping so the same global model can be offered by multiple platforms.

- [ ] **Step 5: Add malformed and missing-reference test cases**

```js
test("catalog validation names the file and broken reference", () => {
  const errors = Catalog.validateCatalogs({
    providers: {
      schemaVersion: 1,
      providers: [{
        id: "12api",
        endpoints: [{ id: "cdn", origin: "https://cdn.12ai.org" }],
        defaultEndpointId: "cdn",
        defaultPriceGroupId: "default",
        modelMappings: [{ modelId: "missing", requestModel: "missing", adapter: "openai-images" }]
      }]
    },
    models: { schemaVersion: 1, models: [] },
    pricing: { schemaVersion: 1, currency: "CNY", updatedAt: "2026-09-22", sources: [] }
  });
  assert.ok(errors.some((message) => message.includes("providers.json") && message.includes("missing")));
});
```

- [ ] **Step 6: Run tests and commit**

Run: `node --test tests/provider-catalog.test.js`

Expected: all catalog tests PASS.

```bash
git add data provider-catalog.js tests/provider-catalog.test.js
git commit -m "Add 12API provider catalogs"
```

### Task 2: Add local credential storage, migration, exhaustion, and recovery

**Files:**
- Create: `credential-store.js`
- Create: `tests/credential-store.test.js`

**Interfaces:**
- Consumes: provider IDs, endpoint IDs, and price-group IDs from Task 1.
- Produces: `CredentialStore.createCredentialStore(storage, idFactory)`, whose instance exposes `list()`, `add(input)`, `remove(id)`, `setDisabled(id, disabled)`, `markExhausted(id, failure)`, `restore(id)`, `migrateLegacy(settings)`, and `maskSecret(secret)`.

- [ ] **Step 1: Write failing storage tests**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const Credentials = require("../credential-store.js");

function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
}

test("exhausts and restores exactly one credential", () => {
  const store = Credentials.createCredentialStore(memoryStorage(), () => "cred-1");
  store.add({ providerId: "12api", label: "默认 Key", secret: "sk-secret1234" });
  store.markExhausted("cred-1", { status: 402, message: "余额不足" });
  assert.equal(store.list()[0].status, "exhausted");
  assert.equal(store.list()[0].lastFailure.status, 402);
  store.restore("cred-1");
  assert.equal(store.list()[0].status, "active");
});

test("defaults 12API credentials to the default group and CDN endpoint", () => {
  const store = Credentials.createCredentialStore(memoryStorage(), () => "cred-1");
  const saved = store.add({ providerId: "12api", label: "12API", secret: "sk-secret1234" });
  assert.equal(saved.priceGroupId, "default");
  assert.equal(saved.endpointId, "cdn");
});

test("migrates a legacy key once and masks it for display", () => {
  const storage = memoryStorage();
  const store = Credentials.createCredentialStore(storage, () => "legacy-1");
  store.migrateLegacy({ lastBaseUrl: "https://cdn.12ai.org", keysByBaseUrl: { "https://cdn.12ai.org": "sk-oldsecret9999" } });
  store.migrateLegacy({ lastBaseUrl: "https://cdn.12ai.org", keysByBaseUrl: { "https://cdn.12ai.org": "sk-oldsecret9999" } });
  assert.equal(store.list().length, 1);
  assert.equal(Credentials.maskSecret(store.list()[0].secret), "••••9999");
});
```

- [ ] **Step 2: Run the storage tests and verify they fail**

Run: `node --test tests/credential-store.test.js`

Expected: FAIL because `credential-store.js` does not exist.

- [ ] **Step 3: Implement the localStorage-backed credential store**

Use storage key `local_image_lab_credentials_v1`. Normalize secrets by removing a leading `Bearer`, zero-width characters, and whitespace. Persist this exact shape:

```js
{
  version: 1,
  legacyMigrated: true,
  credentials: [{
    id: "cred-1",
    providerId: "12api",
    label: "12API 默认 Key",
    secret: "sk-secret",
    priceGroupId: "default",
    endpointId: "cdn",
    status: "active",
    lastFailure: null
  }]
}
```

`markExhausted` sets only the targeted entry to `exhausted`. `restore` sets it to `active` and clears `lastFailure`. `setDisabled` toggles between `disabled` and `active`. `migrateLegacy` recognizes the current `image_generator_remember_settings_v2` and `openai_image_api_key` data supplied by `index.html`, creates at most one credential per unique normalized secret, then sets `legacyMigrated`.

- [ ] **Step 4: Add tests for storage corruption and secret validation**

```js
test("recovers from corrupt storage without inventing a credential", () => {
  const store = Credentials.createCredentialStore(memoryStorage({
    local_image_lab_credentials_v1: "not-json"
  }), () => "cred-1");
  assert.deepEqual(store.list(), []);
});

test("rejects empty and non-header-safe secrets", () => {
  const store = Credentials.createCredentialStore(memoryStorage(), () => "cred-1");
  assert.throws(() => store.add({ providerId: "12api", secret: "" }), /API Key/);
  assert.throws(() => store.add({ providerId: "12api", secret: "sk-中文" }), /请求头/);
});
```

- [ ] **Step 5: Run tests and commit**

Run: `node --test tests/credential-store.test.js`

Expected: all credential tests PASS.

```bash
git add credential-store.js tests/credential-store.test.js
git commit -m "Add local provider credential storage"
```

### Task 3: Add price-aware routing, quota classification, and request adapters

**Files:**
- Create: `provider-router.js`
- Create: `provider-adapters.js`
- Create: `tests/provider-router.test.js`
- Create: `tests/provider-adapters.test.js`

**Interfaces:**
- Consumes: catalog indexes from Task 1 and credential records from Task 2.
- Produces: `ProviderRouter.buildCandidates(input)`, `ProviderRouter.classifyProviderError(error, provider)`, `ProviderRouter.runWithCredentialFallback(candidates, requestCandidate, onExhausted)`, `ProviderAdapters.resolveEndpoint(provider, endpointId)`, `ProviderAdapters.buildOpenAiRequest(input)`, `ProviderAdapters.buildGeminiRequest(input)`, `ProviderAdapters.buildArkRequest(input)`, and `ProviderAdapters.redactRequestDescriptor(descriptor)`.

- [ ] **Step 1: Write failing routing tests**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Catalog = require("../provider-catalog.js");
const Router = require("../provider-router.js");

const readJson = (name) => JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "data", name), "utf8")
);
const catalog = Catalog.createCatalogIndex({
  providers: readJson("providers.json"),
  models: readJson("models.json"),
  pricing: readJson("pricing.json")
});
const activeDefaultCredential = {
  id: "cred-1",
  providerId: "12api",
  label: "默认 Key",
  secret: "sk-secret",
  priceGroupId: "default",
  endpointId: "cdn",
  status: "active"
};

test("keeps a zero-percent availability candidate as a last resort", () => {
  const candidates = Router.buildCandidates({
    modelId: "gemini-2.5-flash-image",
    isEdit: false,
    quality: "auto",
    catalog,
    credentials: [activeDefaultCredential]
  });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].availabilityPercent, 0);
});

test("does not fabricate a per-request estimate for token billing", () => {
  const [candidate] = Router.buildCandidates({
    modelId: "gpt-image-2",
    isEdit: false,
    quality: "high",
    catalog,
    credentials: [activeDefaultCredential]
  });
  assert.equal(candidate.billingType, "per_token");
  assert.equal(candidate.estimatedPrice, null);
});

test("falls back after quota exhaustion but not after other errors", async () => {
  const provider = {
    id: "12api",
    quotaErrors: { statusCodes: [402], messagePatterns: ["余额不足"] }
  };
  const exhausted = [];
  const result = await Router.runWithCredentialFallback(
    [
      { provider, credential: { id: "a" } },
      { provider, credential: { id: "b" } }
    ],
    async (candidate) => {
      if (candidate.credential.id === "a") throw Object.assign(new Error("余额不足"), { status: 402 });
      return "ok";
    },
    (credential, error) => exhausted.push([credential.id, error.status])
  );
  assert.equal(result.value, "ok");
  assert.deepEqual(exhausted, [["a", 402]]);
  await assert.rejects(
    Router.runWithCredentialFallback(
      [
        { provider, credential: { id: "a" } },
        { provider, credential: { id: "b" } }
      ],
      async () => { throw Object.assign(new Error("无效 Key"), { status: 401 }); },
      () => assert.fail("401 must not exhaust a credential")
    ),
    /无效 Key/
  );
});
```

- [ ] **Step 2: Run router tests and verify they fail**

Run: `node --test tests/provider-router.test.js`

Expected: FAIL because `provider-router.js` does not exist.

- [ ] **Step 3: Implement deterministic candidate creation and quota fallback**

Each candidate must contain:

```js
{
  provider,
  model,
  mapping,
  credential,
  endpoint,
  priceGroup,
  billingType,
  estimatedPrice,
  availabilityPercent
}
```

Filter out credentials whose status is not `active`. Require the exact `modelId`, a matching provider `modelMappings` entry, and matching generate/edit capability. Sort nonzero/unknown availability before `0%`, then known per-request prices low-to-high, then higher known availability, then provider and credential insertion order. For GPT Image 2.5, calculate `basePrice * qualityMultiplier`; for token pricing return `null`.

`classifyProviderError` returns `quota` only for configured status code 402 or a configured case-insensitive message pattern. `runWithCredentialFallback` calls `onExhausted`, records the failed candidate, and advances only for `quota`; every other error is rethrown immediately.

- [ ] **Step 4: Write failing adapter tests**

```js
test("builds OpenAI generation and edit requests with the 12API contract", () => {
  const generation = Adapters.buildOpenAiRequest({
    origin: "https://cdn.12ai.org",
    apiKey: "sk-secret",
    modelId: "gpt-image-2.5-flare",
    payload: { prompt: "poster", quality: "xhigh", n: 1 },
    files: []
  });
  assert.equal(generation.url, "https://cdn.12ai.org/v1/images/generations");
  assert.equal(generation.options.headers.Authorization, "Bearer sk-secret");

  const edit = Adapters.buildOpenAiRequest({
    origin: "https://cdn.12ai.org",
    apiKey: "sk-secret",
    modelId: "gpt-image-2.5-flare",
    payload: { prompt: "edit", n: 1 },
    files: [new File(["x"], "input.png", { type: "image/png" })]
  });
  assert.equal(edit.url, "https://cdn.12ai.org/v1/images/edits");
  assert.equal(edit.options.body.getAll("image[]").length, 1);
});

test("redacts secrets from request diagnostics", () => {
  const descriptor = Adapters.buildGeminiRequest({
    origin: "https://cdn.12ai.org",
    apiKey: "sk-secret",
    modelId: "gemini-3.1-flash-image-preview",
    body: { contents: [] }
  });
  assert.doesNotMatch(JSON.stringify(Adapters.redactRequestDescriptor(descriptor)), /sk-secret/);
});
```

- [ ] **Step 5: Implement the adapter registry and redaction**

OpenAI requests use `/v1/images/generations` for JSON and `/v1/images/edits` for `multipart/form-data`, repeating the `image[]` field for each reference. Gemini requests use `/v1beta/models/{requestModel}:generateContent?key=...`. Both builders receive `candidate.mapping.requestModel`, never infer or alias a model name. Return descriptors shaped as `{ url, options, adapterId }`. `redactRequestDescriptor` must replace Bearer values and `key` query values with `[hidden]`, and replace inline image base64 with size labels.

Ark requests use `/api/v3/images/generations`, Bearer authentication, and JSON. Send local references as data URLs in `image`; use `sequential_image_generation: "disabled"` for one output or `"auto"` plus `sequential_image_generation_options.max_images` for multiple outputs; request `b64_json` and `watermark: false`.

- [ ] **Step 6: Run router and adapter tests and commit**

Run: `node --test tests/provider-router.test.js tests/provider-adapters.test.js`

Expected: all routing and adapter tests PASS.

```bash
git add provider-router.js provider-adapters.js tests/provider-router.test.js tests/provider-adapters.test.js
git commit -m "Add provider routing and request adapters"
```

### Task 4: Replace the single-key form with API sources, dynamic models, and a price viewer

**Files:**
- Modify: `index.html` form markup, styles, script imports, startup, and model rendering
- Create: `tests/provider-ui.test.js`
- Modify: `tests/multi-model.test.js`

**Interfaces:**
- Consumes: `ProviderCatalog`, `CredentialStore`, and the catalog model-config map.
- Produces: `initializeProviderUi()`, `renderCredentialRows()`, `renderModelOptions()`, `openPriceViewer()`, `closePriceViewer()`, and `setCatalogFailure(error)` in the page script.

- [ ] **Step 1: Write failing static UI wiring tests**

```js
test("the generation page exposes local API sources and the price dialog", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.match(html, /id="provider-source-panel"/);
  assert.match(html, /id="add-provider-key"/);
  assert.match(html, /id="price-viewer"/);
  assert.match(html, /id="view-pricing"/);
  assert.match(html, /provider-catalog\.js/);
  assert.match(html, /credential-store\.js/);
  assert.doesNotMatch(html, /id="base-url"/);
});

test("models are rendered from the catalog instead of hard-coded checkboxes", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.match(html, /renderModelOptions/);
  assert.doesNotMatch(html, /class="model-option"><input type="checkbox" value=/);
});
```

- [ ] **Step 2: Run the UI tests and verify they fail**

Run: `node --test tests/provider-ui.test.js tests/multi-model.test.js`

Expected: FAIL because the old Base URL/API Key controls and static model options remain.

- [ ] **Step 3: Add focused provider-source and price-dialog markup/styles**

Replace the current API Key, remember checkbox, and Base URL fields with a compact `<details id="provider-source-panel">`. Include provider select, key label, password input, add button, existing credential rows, and a “查看价格” button. Each saved row exposes show/hide, disable, delete, and recovery controls; exhausted rows use a muted gray state.

Add `<dialog id="price-viewer">` with model filter tabs, a scrollable table, “查看原始 JSON”, and close control. Keep cards at 8px radius or less, use existing button classes, and keep the panel usable at mobile widths without nesting cards.

- [ ] **Step 4: Load catalogs before enabling generation and render dynamic models**

Add script imports before the inline application script:

```html
<script src="provider-catalog.js"></script>
<script src="credential-store.js"></script>
<script src="provider-router.js"></script>
<script src="provider-adapters.js"></script>
```

Boot with:

```js
let providerCatalog = null;
let modelConfigs = {};
let credentialStore = null;

async function initializeProviderUi() {
  submitButton.disabled = true;
  providerCatalog = await ProviderCatalog.loadCatalogs(fetch, "data");
  modelConfigs = ProviderCatalog.createModelConfigMap(providerCatalog);
  credentialStore = CredentialStore.createCredentialStore(localStorage);
  credentialStore.migrateLegacy(readRememberedSettings());
  renderCredentialRows();
  renderModelOptions();
  submitButton.disabled = false;
}
```

On catalog failure, leave generation disabled and show the exact loader/validation message in both the status pill and result area. Replace static `MODEL_CONFIGS` reads with `modelConfigs` and repopulate quality selects so `xhigh` and `max` appear for GPT Image 2.5.

- [ ] **Step 5: Render and operate local credentials and pricing**

Adding a Key calls `credentialStore.add` with `providerId: "12api"`, `priceGroupId: "default"`, and `endpointId: "cdn"`. Never insert the secret into row text or attributes. Use `maskSecret` for display. Recovery calls `credentialStore.restore(id)` and rerenders.

The price dialog uses `ProviderCatalog.getPriceRows`; display per-request values with quality-adjusted rows and per-token values as input/output/cache rates. Show `0%`, unknown availability, `updatedAt`, and the active `default` badge without treating token prices as per-image estimates.

- [ ] **Step 6: Run UI tests and commit**

Run: `node --test tests/provider-ui.test.js tests/multi-model.test.js`

Expected: UI wiring tests PASS and multi-model tests use the twelve catalog models.

```bash
git add index.html tests/provider-ui.test.js tests/multi-model.test.js
git commit -m "Add provider source and pricing UI"
```

### Task 5: Route every generation request through credentials and quota fallback

**Files:**
- Modify: `index.html` submit handler, `generateForModel`, Gemini batch loop, request diagnostics, ready states, and status rendering
- Create: `tests/provider-integration.test.js`
- Modify: `tests/multi-model.test.js`

**Interfaces:**
- Consumes: router candidates and adapter descriptors from Tasks 1–3.
- Produces: route-aware `generateForModel(modelId, context)` results with `{ images, warnings, route }` and redacted request records.

- [ ] **Step 1: Write failing integration wiring tests**

```js
test("generation builds candidates and uses quota fallback", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.match(html, /ProviderRouter\.buildCandidates/);
  assert.match(html, /ProviderRouter\.runWithCredentialFallback/);
  assert.match(html, /credentialStore\.markExhausted/);
  assert.match(html, /ProviderAdapters\.redactRequestDescriptor/);
  assert.doesNotMatch(html, /const apiKey = normalizeApiKey\(data\.get\("apiKey"\)\)/);
});

test("request records never read the full credential secret", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.doesNotMatch(html, /recordModelRequest\([^)]*secret/);
  assert.match(html, /credentialLabel/);
});
```

- [ ] **Step 2: Run integration tests and verify they fail**

Run: `node --test tests/provider-integration.test.js`

Expected: FAIL because submission still reads a single form API Key/Base URL.

- [ ] **Step 3: Build candidates per selected model and preserve the existing queue**

In the submit handler, remove direct API Key/Base URL validation. Before queueing, require at least one saved credential. In each existing `MultiModel.runModelQueue` worker, call:

```js
const candidates = ProviderRouter.buildCandidates({
  modelId: model,
  isEdit: sourceImages.length > 0,
  quality: sharedPayload.quality,
  catalog: providerCatalog,
  credentials: credentialStore.list()
});
```

If empty, fail only that model with “没有支持该模型的可用 API Key”. Preserve concurrency `2` and all other model outcomes.

- [ ] **Step 4: Route OpenAI requests atomically**

Wrap one OpenAI generation/edit request in `runWithCredentialFallback`. Construct each attempt through `ProviderAdapters.buildOpenAiRequest`. On quota:

```js
(credential, error) => {
  credentialStore.markExhausted(credential.id, {
    status: error.status,
    message: getErrorText(error),
    at: Date.now()
  });
  renderCredentialRows();
  setModelResultState(model, "正在切换 API Key", `${credential.label} 额度不足，尝试下一个来源。`, "warning");
}
```

Keep 429 and 5xx inside the existing limited retry for the same candidate. Do not pass 402 to that retry loop; it must return immediately to the router.

- [ ] **Step 5: Route each Gemini batch item without discarding earlier successes**

For `n > 1`, build candidates once and run each batch index through `runWithCredentialFallback`. If index 2 exhausts one Key, retry only index 2 on the next candidate; keep index 1's image. A successful candidate becomes the first candidate for the next remaining index. Continue using native Gemini response parsing and base64 request-size checks.

- [ ] **Step 6: Persist route metadata and redact diagnostics**

Return this route shape on success:

```js
{
  providerId: candidate.provider.id,
  providerName: candidate.provider.name,
  endpointId: candidate.endpoint.id,
  endpointName: candidate.endpoint.name,
  credentialLabel: candidate.credential.label,
  priceGroupId: candidate.credential.priceGroupId,
  billingType: candidate.billingType,
  estimatedPrice: candidate.estimatedPrice,
  routingAttempts: attempts.map(({ candidate, error }) => ({
    providerId: candidate.provider.id,
    credentialLabel: candidate.credential.label,
    status: error.status || null,
    reason: ProviderRouter.classifyProviderError(error, candidate.provider)
  }))
}
```

Pass only `ProviderAdapters.redactRequestDescriptor` to `recordModelRequest`. Ensure result status identifies the actual platform and reports fallback warnings.

- [ ] **Step 7: Run integration and regression tests and commit**

Run: `node --test tests/provider-integration.test.js tests/provider-router.test.js tests/provider-adapters.test.js tests/multi-model.test.js`

Expected: all tests PASS; existing multi-model queue and partial Gemini results remain covered.

```bash
git add index.html tests/provider-integration.test.js tests/multi-model.test.js
git commit -m "Route image requests across provider credentials"
```

### Task 6: Add provider metadata to history and Excel without exposing secrets

**Files:**
- Modify: `index.html` history persistence/rendering and workbook generation
- Modify: `comparison-export.js`
- Modify: `tests/comparison-export.test.js`

**Interfaces:**
- Consumes: the successful route metadata from Task 5.
- Produces: history records and export rows containing provider, endpoint, credential label, billing type, and estimated price without a secret.

- [ ] **Step 1: Write failing history/export metadata tests**

```js
test("comparison rows retain provider metadata without credentials", () => {
  const table = buildComparisonExportTable([{
    resultId: "r1",
    comparisonId: "c1",
    prompt: "poster",
    model: "gpt-image-2.5-flare",
    providerName: "12API",
    priceGroupId: "default",
    estimatedPrice: 0.225,
    credentialLabel: "默认 Key",
    batchIndex: 0
  }]);
  const record = table.rows[0].images["gpt-image-2.5-flare"];
  assert.equal(record.providerName, "12API");
  assert.equal(record.estimatedPrice, 0.225);
  assert.equal("secret" in record, false);
});

test("the history serializer never persists a credential secret", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.match(html, /credentialLabel:/);
  assert.doesNotMatch(html, /store\.add\(\{[^}]*secret:/s);
});
```

- [ ] **Step 2: Run export tests and verify they fail**

Run: `node --test tests/comparison-export.test.js`

Expected: FAIL because provider route metadata is not yet persisted or exported.

- [ ] **Step 3: Extend history records and cards**

Persist `providerId`, `providerName`, `endpointId`, `endpointName`, `credentialLabel`, `priceGroupId`, `billingType`, `estimatedPrice`, and sanitized `routingAttempts`. Old records remain valid when fields are absent. Show platform and estimated price beneath the model name; display “按 token 计费” when `estimatedPrice` is `null` and `billingType` is `per_token`.

- [ ] **Step 4: Extend selected Excel exports**

Keep `Prompt` and model image columns. Add leading metadata columns `平台`, `价格分组`, and `预计价格` for each comparison row; when models in a row used different platforms, join unique values with ` / `. Never export `credentialLabel`, routing errors, or secrets.

- [ ] **Step 5: Run export and full tests and commit**

Run: `node --test tests/*.test.js`

Expected: all tests PASS, including legacy history grouping and image embedding tests.

```bash
git add index.html comparison-export.js tests/comparison-export.test.js
git commit -m "Record provider routing metadata"
```

### Task 7: Update documentation and verify the complete static app

**Files:**
- Modify: `README.md`
- Modify: `.gitignore` only if verification creates a new local-only artifact pattern

**Interfaces:**
- Consumes: all completed tasks.
- Produces: documented local HTTP startup, catalog maintenance instructions, and final verification evidence.

- [ ] **Step 1: Update README usage and security notes**

Document:

````markdown
## 本地运行

项目会在启动时读取 `data/*.json`，请通过 HTTP 打开：

```bash
python3 -m http.server 8765
```

浏览器访问 `http://127.0.0.1:8765/`。API Key 只保存在当前浏览器的 localStorage，不会写入项目 JSON。

## 更新平台数据

- `data/providers.json`：线路与认证协议
- `data/models.json`：生图模型能力
- `data/pricing.json`：人工维护的价格快照
````

- [ ] **Step 2: Run all automated checks**

Run:

```bash
node --test tests/*.test.js
node -e 'const fs=require("fs"),vm=require("vm"); const html=fs.readFileSync("index.html","utf8"); const code=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m)=>m[1]).join("\n"); new vm.Script(code); console.log("inline script syntax ok")'
git diff --check
```

Expected: all tests PASS, inline script syntax reports OK, and `git diff --check` prints nothing.

- [ ] **Step 3: Start a local static server and verify loading**

Run: `python3 -m http.server 8765 --bind 127.0.0.1`

If 8765 is occupied, use 8766 and report the actual URL. Verify without a real generation request:

- all three JSON requests return HTTP 200;
- the page shows twelve model checkboxes from two providers;
- legacy or newly added 12API Key appears masked;
- the price dialog shows all four groups and the 2026-09-22 update date;
- an exhausted test credential row is gray and “恢复” reactivates it;
- current upload, prompt, history, download, lightbox, and export controls remain visible and non-overlapping at desktop and mobile widths;
- request diagnostics never show a complete Key.

- [ ] **Step 4: Review the final diff for secret leakage**

Run:

```bash
rg -n 'sk-[A-Za-z0-9]{12,}' . -g '!vendor/**' -g '!docs/superpowers/**'
git status --short
git diff --stat
```

Expected: no API Key matches in product files; status contains only intended project changes.

- [ ] **Step 5: Commit documentation and verification-ready state**

```bash
git add README.md
git commit -m "Document provider catalog workflow"
```

Do not push or deploy unless the user asks after reviewing the completed local implementation.
