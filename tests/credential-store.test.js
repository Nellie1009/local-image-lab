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
  let nextId = 0;
  const store = Credentials.createCredentialStore(memoryStorage(), () => `cred-${++nextId}`);
  store.add({ providerId: "12api", label: "主 Key", secret: "sk-secret1234" });
  store.add({ providerId: "12api", label: "备用 Key", secret: "sk-secret5678" });

  store.markExhausted("cred-1", { status: 402, message: "余额不足" });
  assert.equal(store.list()[0].status, "exhausted");
  assert.equal(store.list()[0].lastFailure.status, 402);
  assert.equal(store.list()[1].status, "active");

  store.restore("cred-1");
  assert.equal(store.list()[0].status, "active");
  assert.equal(store.list()[0].lastFailure, null);
});

test("uses provider-specific endpoint and price-group defaults", () => {
  let nextId = 0;
  const store = Credentials.createCredentialStore(memoryStorage(), () => `cred-${++nextId}`);
  const twelveApi = store.add({ providerId: "12api", label: "12API", secret: "sk-secret1234" });
  const ark = store.add({ providerId: "volcengine-ark", label: "火山 Ark", secret: "ark-secret1234" });

  assert.equal(twelveApi.priceGroupId, "default");
  assert.equal(twelveApi.endpointId, "cdn");
  assert.equal(ark.priceGroupId, "default");
  assert.equal(ark.endpointId, "beijing");
});

test("stores custom API URLs without a separate source name field", () => {
  const storage = memoryStorage();
  const store = Credentials.createCredentialStore(storage, () => "custom-1");
  const credential = store.add({
    providerId: "custom",
    baseUrl: "https://images.example.com/v1/",
    label: "设计主 Key",
    secret: "custom-secret1234"
  });

  assert.equal(credential.label, "设计主 Key");
  assert.equal("providerName" in credential, false);
  assert.equal("integrationExample" in credential, false);
  assert.equal(credential.baseUrl, "https://images.example.com/v1");
  const restored = Credentials.createCredentialStore(storage).list()[0];
  assert.equal(restored.baseUrl, "https://images.example.com/v1");
  assert.equal("providerName" in restored, false);
  assert.equal("integrationExample" in restored, false);
});

test("drops the legacy custom source-name field when restoring saved APIs", () => {
  const storage = memoryStorage({
    local_image_lab_credentials_v1: JSON.stringify({
      version: 1,
      legacyMigrated: true,
      credentials: [{
        id: "legacy-custom",
        providerId: "custom",
        providerName: "Old Source Name",
        integrationExample: "old sample",
        baseUrl: "https://images.example.com/v1",
        label: "用户备注",
        secret: "custom-secret1234",
        status: "active"
      }]
    })
  });
  const restored = Credentials.createCredentialStore(storage).list()[0];

  assert.equal(restored.label, "用户备注");
  assert.equal(restored.baseUrl, "https://images.example.com/v1");
  assert.equal("providerName" in restored, false);
});

test("rejects custom API URLs with unsafe or invalid components", () => {
  const store = Credentials.createCredentialStore(memoryStorage(), () => "custom-1");
  assert.throws(() => store.add({ providerId: "custom", baseUrl: "javascript:alert(1)", secret: "custom-secret1234" }), /URL/);
  assert.throws(() => store.add({ providerId: "custom", baseUrl: "https://user:pass@example.com", secret: "custom-secret1234" }), /URL/);
});

test("migrates legacy keys once, deduplicates secrets, and masks them", () => {
  const storage = memoryStorage();
  const store = Credentials.createCredentialStore(storage, () => "legacy-1");
  const settings = {
    lastBaseUrl: "https://cdn.12ai.org",
    keysByBaseUrl: {
      "https://cdn.12ai.org": " Bearer sk-oldsecret9999 ",
      "https://new.12ai.org": "sk-oldsecret9999"
    },
    legacyKey: "sk-oldsecret9999"
  };

  store.migrateLegacy(settings);
  store.migrateLegacy(settings);

  assert.equal(store.list().length, 1);
  assert.equal(store.list()[0].secret, "sk-oldsecret9999");
  assert.equal(Credentials.maskSecret(store.list()[0].secret), "••••9999");
});

test("disables, enables, and removes one credential", () => {
  const store = Credentials.createCredentialStore(memoryStorage(), () => "cred-1");
  store.add({ providerId: "12api", secret: "sk-secret1234" });
  store.setDisabled("cred-1", true);
  assert.equal(store.list()[0].status, "disabled");
  store.setDisabled("cred-1", false);
  assert.equal(store.list()[0].status, "active");
  store.remove("cred-1");
  assert.deepEqual(store.list(), []);
});

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
