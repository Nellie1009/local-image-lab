const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const Catalog = require("../provider-catalog.js");

const readJson = (name) => JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "data", name), "utf8")
);

function readCatalogs() {
  return {
    providers: readJson("providers.json"),
    models: readJson("models.json"),
    pricing: readJson("pricing.json")
  };
}

test("the catalogs contain exactly the approved twelve image models", () => {
  const raw = readCatalogs();
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

test("every model has at least one platform mapping and a default price group", () => {
  const index = Catalog.createCatalogIndex(readCatalogs());
  for (const model of index.modelsById.values()) {
    assert.ok(index.mappingsByModelId.get(model.id)?.length, `${model.id} mapping`);
    const hasDefaultPrice = index.mappingsByModelId.get(model.id).some((mapping) =>
      index.pricesByProviderModel.get(`${mapping.providerId}:${model.id}`)?.groupsById.has("default")
    );
    assert.equal(hasDefaultPrice, true, `${model.id} default price`);
  }
});

test("per-token pricing has no per-image estimate", () => {
  const index = Catalog.createCatalogIndex(readCatalogs());
  const row = Catalog.getPriceRows(index, ["gpt-image-2"])
    .find((item) => item.providerId === "12api" && item.groupId === "default");
  assert.equal(row.billingType, "per_token");
  assert.equal(row.estimatedPerRequest, null);
});

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

test("loads all three catalogs over HTTP and reports the filename on failure", async () => {
  const raw = readCatalogs();
  const fetchImpl = async (url) => {
    const name = path.basename(url, ".json");
    return { ok: true, json: async () => raw[name] };
  };
  const index = await Catalog.loadCatalogs(fetchImpl, "/data");
  assert.equal(index.providersById.size, 2);

  await assert.rejects(
    Catalog.loadCatalogs(async () => ({ ok: false, status: 404 }), "/data"),
    /providers\.json 加载失败：HTTP 404/
  );
});

test("converts catalog options to the existing multi-model config shape", () => {
  const configs = Catalog.createModelConfigMap(Catalog.createCatalogIndex(readCatalogs()));
  assert.deepEqual(configs["gpt-image-2.5-flare"].qualities, ["auto", "low", "medium", "high", "xhigh", "max"]);
  assert.equal(configs["doubao-seedream-5-0-pro-260628"].supportsEdit, true);
  assert.deepEqual(configs["doubao-seedream-5-0-pro-260628"].sizes, ["auto", "2K", "4K"]);
});
