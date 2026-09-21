(function initProviderAdapters(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ProviderAdapters = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createProviderAdaptersApi() {
  function cleanOrigin(value) {
    return String(value || "").replace(/\/+$/, "");
  }

  function resolveEndpoint(provider, endpointId) {
    const targetId = endpointId || provider?.defaultEndpointId;
    const endpoint = provider?.endpointsById?.get?.(targetId)
      || (provider?.endpoints || []).find((item) => item.id === targetId);
    if (!endpoint) throw new Error(`找不到 API 线路：${targetId || "(empty)"}`);
    return { ...endpoint, origin: cleanOrigin(endpoint.origin) };
  }

  function compactObject(value) {
    return Object.fromEntries(Object.entries(value).filter(([, item]) =>
      item !== undefined && item !== null && item !== ""
    ));
  }

  function openAiPayload(modelId, payload) {
    const body = compactObject({ ...payload, model: modelId });
    delete body.gemini_resolution;
    body.response_format = "b64_json";
    delete body.output_format;
    delete body.background;
    delete body.style;
    return body;
  }

  function buildOpenAiRequest(input = {}) {
    const origin = cleanOrigin(input.origin);
    const files = Array.isArray(input.files) ? input.files : [];
    const body = openAiPayload(input.modelId, input.payload || {});
    if (!files.length) {
      return {
        adapterId: "openai-images",
        url: `${origin}/v1/images/generations`,
        options: {
          method: "POST",
          headers: {
            Authorization: `Bearer ${input.apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(body)
        }
      };
    }

    const formData = new FormData();
    Object.entries(body).forEach(([key, value]) => formData.append(key, String(value)));
    files.forEach((file) => formData.append("image", file, file.name));
    return {
      adapterId: "openai-images",
      url: `${origin}/v1/images/edits`,
      options: {
        method: "POST",
        headers: { Authorization: `Bearer ${input.apiKey}` },
        body: formData
      }
    };
  }

  function buildGeminiRequest(input = {}) {
    const origin = cleanOrigin(input.origin);
    const modelId = encodeURIComponent(input.modelId);
    const apiKey = encodeURIComponent(input.apiKey);
    return {
      adapterId: "gemini-native",
      url: `${origin}/v1beta/models/${modelId}:generateContent?key=${apiKey}`,
      options: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input.body || {})
      }
    };
  }

  function buildArkRequest(input = {}) {
    const origin = cleanOrigin(input.origin);
    const payload = input.payload || {};
    const count = Math.max(1, Number(payload.n) || 1);
    const images = Array.isArray(input.imageDataUrls) ? input.imageDataUrls.filter(Boolean) : [];
    const body = compactObject({
      model: input.modelId,
      prompt: payload.prompt,
      image: images.length ? images : undefined,
      size: payload.size,
      output_format: payload.output_format,
      response_format: "b64_json",
      watermark: false,
      sequential_image_generation: count > 1 ? "auto" : "disabled",
      sequential_image_generation_options: count > 1 ? { max_images: count } : undefined
    });
    return {
      adapterId: "ark-images",
      url: `${origin}/api/v3/images/generations`,
      options: {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      }
    };
  }

  function redactInlineData(value) {
    if (Array.isArray(value)) return value.map(redactInlineData);
    if (!value || typeof value !== "object") {
      if (typeof value === "string" && /^data:image\//i.test(value)) {
        return `[inline image: ${value.length} chars]`;
      }
      return value;
    }
    const next = {};
    Object.entries(value).forEach(([key, item]) => {
      if ((key === "data" || key === "b64_json") && typeof item === "string") {
        next[key] = `[inline image: ${item.length} chars]`;
      } else {
        next[key] = redactInlineData(item);
      }
    });
    return next;
  }

  function redactRequestDescriptor(descriptor = {}) {
    let url = String(descriptor.url || "");
    try {
      const parsed = new URL(url);
      if (parsed.searchParams.has("key")) parsed.searchParams.set("key", "[hidden]");
      url = parsed.toString().replace("%5Bhidden%5D", "[hidden]");
    } catch (_error) {
      url = url.replace(/([?&]key=)[^&]+/i, "$1[hidden]");
    }

    const headers = { ...(descriptor.options?.headers || {}) };
    Object.keys(headers).forEach((key) => {
      if (key.toLowerCase() === "authorization") headers[key] = "Bearer [hidden]";
    });

    let body = descriptor.options?.body;
    if (typeof body === "string") {
      try {
        body = redactInlineData(JSON.parse(body));
      } catch (_error) {
        body = `[request body: ${body.length} chars]`;
      }
    } else if (typeof FormData !== "undefined" && body instanceof FormData) {
      const fields = [];
      body.forEach((value, key) => {
        fields.push([key, typeof value === "string" ? value : `[file: ${value.name || "image"}]`]);
      });
      body = fields;
    } else {
      body = redactInlineData(body);
    }

    return {
      adapterId: descriptor.adapterId,
      url,
      options: {
        method: descriptor.options?.method,
        headers,
        body
      }
    };
  }

  return {
    buildArkRequest,
    buildGeminiRequest,
    buildOpenAiRequest,
    redactRequestDescriptor,
    resolveEndpoint
  };
});
