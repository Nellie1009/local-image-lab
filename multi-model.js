(function initMultiModel(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MultiModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createMultiModelApi() {
  function normalizeSelectedModels(selected, available, fallback) {
    const allowed = new Set(Array.isArray(available) ? available : []);
    const unique = [];
    const seen = new Set();

    (Array.isArray(selected) ? selected : []).forEach((model) => {
      if (!allowed.has(model) || seen.has(model)) return;
      seen.add(model);
      unique.push(model);
    });

    if (!unique.length && allowed.has(fallback)) unique.push(fallback);
    if (!unique.length && allowed.size) unique.push(allowed.values().next().value);
    return unique;
  }

  function pickCompatibleValue(value, allowedValues) {
    const allowed = Array.isArray(allowedValues) ? allowedValues : [];
    if (!allowed.length) return undefined;
    const normalized = String(value ?? "");
    if (allowed.includes(normalized)) return normalized;
    if (allowed.includes("auto")) return "auto";
    return allowed[0];
  }

  function mergeSupportedOptions(models, configs, key) {
    const merged = [];
    const seen = new Set();
    (Array.isArray(models) ? models : []).forEach((model) => {
      const values = configs?.[model]?.[key];
      (Array.isArray(values) ? values : []).forEach((value) => {
        if (seen.has(value)) return;
        seen.add(value);
        merged.push(value);
      });
    });
    return merged;
  }

  function resolveCompatiblePayload(sharedPayload, model, config) {
    const shared = sharedPayload || {};
    const profile = config || {};
    const next = {
      model,
      prompt: String(shared.prompt || "")
    };
    const fields = [
      ["size", "sizes"],
      ["quality", "qualities"],
      ["output_format", "formats"],
      ["style", "styles"],
      ["background", "backgrounds"],
      ["gemini_resolution", "geminiResolutions"]
    ];

    fields.forEach(([payloadKey, configKey]) => {
      const value = pickCompatibleValue(shared[payloadKey], profile[configKey]);
      if (value !== undefined) next[payloadKey] = value;
    });

    if (next.background === "transparent" && next.output_format === "jpeg") {
      const alphaFormat = ["png", "webp"].find((format) =>
        (profile.formats || []).includes(format)
      );
      if (alphaFormat) {
        next.output_format = alphaFormat;
      } else {
        next.background = pickCompatibleValue("auto", profile.backgrounds);
      }
    }

    const count = pickCompatibleValue(shared.n, profile.counts);
    if (count !== undefined) next.n = Number(count);
    return next;
  }

  function detectBase64ImageType(value, fallbackFormat = "png") {
    const raw = String(value || "").trim();
    const dataUrlType = raw.match(/^data:image\/(png|jpe?g|webp);base64,/i)?.[1];
    let format = String(dataUrlType || fallbackFormat || "png").toLowerCase();
    const base64 = raw.replace(/^data:[^,]+,/, "");

    if (base64.startsWith("iVBORw0KGgo")) format = "png";
    else if (base64.startsWith("/9j/")) format = "jpeg";
    else if (base64.startsWith("UklGR")) format = "webp";

    if (format === "jpg") format = "jpeg";
    if (!["png", "jpeg", "webp"].includes(format)) format = "png";
    return {
      format,
      mime: format === "jpeg" ? "image/jpeg" : `image/${format}`,
      extension: format === "jpeg" ? "jpg" : format
    };
  }

  function estimateBase64Bytes(byteLength) {
    const bytes = Math.max(0, Number(byteLength) || 0);
    return bytes ? 4 * Math.ceil(bytes / 3) : 0;
  }

  async function fetchWithTimeout(url, options = {}, timeoutMs = 0, fetchImpl) {
    const request = fetchImpl || globalThis.fetch;
    const duration = Math.max(0, Number(timeoutMs) || 0);
    if (typeof request !== "function") throw new Error("当前环境不支持 fetch。");
    if (!duration) return request(url, options);

    const controller = new AbortController();
    const externalSignal = options.signal;
    let timedOut = false;
    const abortFromExternal = () => controller.abort(externalSignal.reason);
    if (externalSignal) {
      if (externalSignal.aborted) abortFromExternal();
      else externalSignal.addEventListener("abort", abortFromExternal, { once: true });
    }

    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, duration);

    try {
      return await request(url, { ...options, signal: controller.signal });
    } catch (error) {
      if (!timedOut) throw error;
      const timeoutError = new Error(`请求超过 ${Math.round(duration / 1000)} 秒仍未响应。`);
      timeoutError.name = "TimeoutError";
      timeoutError.status = 408;
      throw timeoutError;
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener("abort", abortFromExternal);
    }
  }

  function getBatchErrorAction(status, generatedImageCount, requestedCount) {
    const fatal = [400, 401, 402, 403].includes(Number(status));
    if (Number(requestedCount) <= 1) return "throw";
    if (!fatal) return "continue";
    return Number(generatedImageCount) > 0 ? "stop" : "throw";
  }

  async function runModelQueue(items, concurrency, worker) {
    const list = Array.isArray(items) ? items : [];
    const outcomes = new Array(list.length);
    const limit = Math.max(1, Math.min(list.length || 1, Number(concurrency) || 1));
    let cursor = 0;

    async function runNext() {
      while (cursor < list.length) {
        const index = cursor;
        cursor += 1;
        try {
          outcomes[index] = {
            status: "fulfilled",
            value: await worker(list[index], index)
          };
        } catch (reason) {
          outcomes[index] = { status: "rejected", reason };
        }
      }
    }

    await Promise.all(Array.from({ length: limit }, () => runNext()));
    return outcomes;
  }

  return {
    detectBase64ImageType,
    estimateBase64Bytes,
    fetchWithTimeout,
    getBatchErrorAction,
    mergeSupportedOptions,
    normalizeSelectedModels,
    resolveCompatiblePayload,
    runModelQueue
  };
});
