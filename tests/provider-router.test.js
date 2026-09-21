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

test("estimates quality multipliers and paid reference images", () => {
  const [gpt] = Router.buildCandidates({
    modelId: "gpt-image-2.5-flare",
    isEdit: false,
    quality: "xhigh",
    count: 2,
    catalog,
    credentials: [activeDefaultCredential]
  });
  assert.equal(gpt.estimatedPrice, 0.45);

  const [ark] = Router.buildCandidates({
    modelId: "doubao-seedream-5-0-pro-260628",
    isEdit: true,
    count: 2,
    referenceImageCount: 3,
    catalog,
    credentials: [{
      ...activeDefaultCredential,
      id: "ark-1",
      providerId: "volcengine-ark",
      endpointId: "beijing",
      secret: "ark-secret"
    }]
  });
  assert.equal(ark.estimatedPrice, 0.64);
});

test("filters inactive credentials and unsupported capabilities", () => {
  const candidates = Router.buildCandidates({
    modelId: "gemini-3.1-flash-image",
    isEdit: true,
    catalog,
    credentials: [
      { ...activeDefaultCredential, status: "exhausted" },
      { ...activeDefaultCredential, id: "active" }
    ]
  });
  assert.deepEqual(candidates.map((item) => item.credential.id), ["active"]);
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
      if (candidate.credential.id === "a") {
        throw Object.assign(new Error("余额不足"), { status: 402 });
      }
      return "ok";
    },
    (credential, error) => exhausted.push([credential.id, error.status])
  );
  assert.equal(result.value, "ok");
  assert.equal(result.candidate.credential.id, "b");
  assert.deepEqual(result.failedCandidates.map((item) => item.credential.id), ["a"]);
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

test("recognizes configured quota messages case-insensitively", () => {
  const provider = {
    quotaErrors: { statusCodes: [402], messagePatterns: ["Insufficient Balance"] }
  };
  assert.equal(
    Router.classifyProviderError(new Error("INSUFFICIENT BALANCE for account"), provider),
    "quota"
  );
  assert.equal(
    Router.classifyProviderError(Object.assign(new Error("bad request"), { status: 400 }), provider),
    "other"
  );
});
