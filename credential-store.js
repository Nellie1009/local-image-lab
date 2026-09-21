(function initCredentialStore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CredentialStore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCredentialStoreApi() {
  const STORAGE_KEY = "local_image_lab_credentials_v1";
  const PROVIDER_DEFAULTS = {
    "12api": { endpointId: "cdn", priceGroupId: "default" },
    "volcengine-ark": { endpointId: "beijing", priceGroupId: "default" }
  };

  function emptyState() {
    return { version: 1, legacyMigrated: false, credentials: [] };
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeSecret(value) {
    return String(value || "")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .trim()
      .replace(/^Bearer\s+/i, "")
      .replace(/\s+/g, "");
  }

  function validateSecret(value) {
    const secret = normalizeSecret(value);
    if (!secret) throw new Error("请填写 API Key。");
    if (!/^[\x21-\x7E]+$/.test(secret)) {
      throw new Error("API Key 含有不能放进请求头的字符。");
    }
    return secret;
  }

  function maskSecret(value) {
    const secret = normalizeSecret(value);
    if (!secret) return "";
    return `••••${secret.slice(-4)}`;
  }

  function defaultId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `cred-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function normalizeCredential(value) {
    if (!value || typeof value !== "object") return null;
    const providerId = String(value.providerId || "").trim();
    const defaults = PROVIDER_DEFAULTS[providerId] || {};
    let secret;
    try {
      secret = validateSecret(value.secret);
    } catch (_error) {
      return null;
    }
    if (!providerId || !value.id) return null;
    const status = ["active", "disabled", "exhausted"].includes(value.status)
      ? value.status
      : "active";
    return {
      id: String(value.id),
      providerId,
      label: String(value.label || providerId).trim() || providerId,
      secret,
      priceGroupId: String(value.priceGroupId || defaults.priceGroupId || "default"),
      endpointId: String(value.endpointId || defaults.endpointId || "default"),
      status,
      lastFailure: value.lastFailure && typeof value.lastFailure === "object"
        ? clone(value.lastFailure)
        : null
    };
  }

  function readState(storage) {
    try {
      const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || "null");
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.credentials)) {
        return emptyState();
      }
      return {
        version: 1,
        legacyMigrated: Boolean(parsed.legacyMigrated),
        credentials: parsed.credentials.map(normalizeCredential).filter(Boolean)
      };
    } catch (_error) {
      return emptyState();
    }
  }

  function endpointForLegacyUrl(value) {
    try {
      const host = new URL(String(value || "")).hostname;
      if (host === "new.12ai.org") return "main";
      if (host === "api.12ai.org") return "direct";
    } catch (_error) {
      // Invalid legacy URLs fall back to the recommended CDN endpoint.
    }
    return "cdn";
  }

  function createCredentialStore(storage, idFactory = defaultId) {
    if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") {
      throw new Error("缺少可用的浏览器存储。");
    }
    let state = readState(storage);

    function persist() {
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    function find(id) {
      const credential = state.credentials.find((item) => item.id === id);
      if (!credential) throw new Error("找不到这个 API Key。");
      return credential;
    }

    function add(input = {}) {
      const providerId = String(input.providerId || "").trim();
      if (!providerId) throw new Error("请选择 API 平台。");
      const defaults = PROVIDER_DEFAULTS[providerId] || {};
      const credential = {
        id: String(idFactory()),
        providerId,
        label: String(input.label || providerId).trim() || providerId,
        secret: validateSecret(input.secret),
        priceGroupId: String(input.priceGroupId || defaults.priceGroupId || "default"),
        endpointId: String(input.endpointId || defaults.endpointId || "default"),
        status: "active",
        lastFailure: null
      };
      state.credentials.push(credential);
      persist();
      return clone(credential);
    }

    function list() {
      return clone(state.credentials);
    }

    function remove(id) {
      state.credentials = state.credentials.filter((item) => item.id !== id);
      persist();
    }

    function setDisabled(id, disabled) {
      const credential = find(id);
      credential.status = disabled ? "disabled" : "active";
      if (!disabled) credential.lastFailure = null;
      persist();
      return clone(credential);
    }

    function markExhausted(id, failure = {}) {
      const credential = find(id);
      credential.status = "exhausted";
      credential.lastFailure = {
        status: Number(failure.status) || null,
        message: String(failure.message || "额度不足"),
        at: failure.at || new Date().toISOString()
      };
      persist();
      return clone(credential);
    }

    function restore(id) {
      const credential = find(id);
      credential.status = "active";
      credential.lastFailure = null;
      persist();
      return clone(credential);
    }

    function migrateLegacy(settings = {}) {
      if (state.legacyMigrated) return list();
      const candidates = [];
      const keysByBaseUrl = settings.keysByBaseUrl && typeof settings.keysByBaseUrl === "object"
        ? settings.keysByBaseUrl
        : {};

      Object.entries(keysByBaseUrl).forEach(([baseUrl, secret]) => {
        candidates.push({ baseUrl, secret });
      });
      [settings.legacyKey, settings.apiKey, settings.openaiImageApiKey].forEach((secret) => {
        if (secret) candidates.push({ baseUrl: settings.lastBaseUrl, secret });
      });

      const existing = new Set(state.credentials.map((item) => item.secret));
      candidates.forEach(({ baseUrl, secret }) => {
        let normalized;
        try {
          normalized = validateSecret(secret);
        } catch (_error) {
          return;
        }
        if (existing.has(normalized)) return;
        existing.add(normalized);
        state.credentials.push({
          id: String(idFactory()),
          providerId: "12api",
          label: "迁移的 12API Key",
          secret: normalized,
          priceGroupId: "default",
          endpointId: endpointForLegacyUrl(baseUrl),
          status: "active",
          lastFailure: null
        });
      });

      state.legacyMigrated = true;
      persist();
      return list();
    }

    return {
      add,
      list,
      markExhausted,
      migrateLegacy,
      remove,
      restore,
      setDisabled
    };
  }

  return {
    STORAGE_KEY,
    createCredentialStore,
    maskSecret,
    normalizeSecret
  };
});
