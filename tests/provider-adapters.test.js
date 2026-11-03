const test = require("node:test");
const assert = require("node:assert/strict");
const Adapters = require("../provider-adapters.js");

test("resolves a configured endpoint and rejects an unknown one", () => {
  const provider = {
    defaultEndpointId: "cdn",
    endpoints: [{ id: "cdn", origin: "https://cdn.12ai.org/" }]
  };
  assert.equal(Adapters.resolveEndpoint(provider, "cdn").origin, "https://cdn.12ai.org");
  assert.throws(() => Adapters.resolveEndpoint(provider, "missing"), /线路/);
});

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
  assert.equal(JSON.parse(generation.options.body).model, "gpt-image-2.5-flare");

  const edit = Adapters.buildOpenAiRequest({
    origin: "https://cdn.12ai.org",
    apiKey: "sk-secret",
    modelId: "gpt-image-2.5-flare",
    payload: { prompt: "edit", n: 1 },
    files: [
      new File(["x"], "one.png", { type: "image/png" }),
      new File(["y"], "two.png", { type: "image/png" })
    ]
  });
  assert.equal(edit.url, "https://cdn.12ai.org/v1/images/edits");
  assert.equal(edit.options.body.getAll("image[]").length, 2);
});

test("explains 12API browser fetch failures as a preflight Authorization CORS issue", () => {
  const message = Adapters.formatFetchFailure(
    new TypeError("Failed to fetch"),
    "https://cdn.12ai.org/v1/images/edits"
  );
  assert.match(message, /CORS/);
  assert.match(message, /Authorization/);
  assert.match(message, /减少图片张数不会修复/);
});

test("routes 12API OpenAI image requests through the local proxy without changing the payload", () => {
  const request = Adapters.buildOpenAiRequest({
    origin: "https://cdn.12ai.org",
    apiKey: "sk-secret",
    modelId: "gpt-image-2",
    payload: { prompt: "edit this" },
    files: [new File(["image"], "reference.png", { type: "image/png" })]
  });

  const proxied = Adapters.buildLocalProxyRequest(request, "http://127.0.0.1:8766/__proxy");
  assert.equal(proxied.url, "http://127.0.0.1:8766/__proxy");
  assert.equal(proxied.options.headers.Authorization, "Bearer sk-secret");
  assert.equal(proxied.options.headers["X-Local-Proxy-Target"], request.url);
  assert.equal(proxied.options.body, request.options.body);

  const generation = Adapters.buildOpenAiRequest({
    origin: "https://other.example",
    apiKey: "sk-secret",
    modelId: "gpt-image-2",
    payload: { prompt: "text only" }
  });
  assert.equal(Adapters.buildLocalProxyRequest(generation, "http://127.0.0.1:8766/__proxy"), null);
});

test("builds Gemini requests from the mapped request model", () => {
  const descriptor = Adapters.buildGeminiRequest({
    origin: "https://cdn.12ai.org",
    apiKey: "sk-secret/+",
    modelId: "gemini-3.1-flash-image-preview",
    body: { contents: [] }
  });
  assert.equal(
    descriptor.url,
    "https://cdn.12ai.org/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=sk-secret%2F%2B"
  );
  assert.equal(descriptor.adapterId, "gemini-native");
});

test("builds Ark JSON requests with references and sequential output controls", () => {
  const descriptor = Adapters.buildArkRequest({
    origin: "https://ark.cn-beijing.volces.com",
    apiKey: "ark-secret",
    modelId: "doubao-seedream-5-0-pro-260628",
    payload: { prompt: "poster", size: "4K", n: 3, output_format: "png" },
    imageDataUrls: ["data:image/png;base64,AAAA", "data:image/jpeg;base64,BBBB"]
  });
  const body = JSON.parse(descriptor.options.body);
  assert.equal(descriptor.url, "https://ark.cn-beijing.volces.com/api/v3/images/generations");
  assert.equal(descriptor.options.headers.Authorization, "Bearer ark-secret");
  assert.deepEqual(body.image, ["data:image/png;base64,AAAA", "data:image/jpeg;base64,BBBB"]);
  assert.equal(body.sequential_image_generation, "auto");
  assert.equal(body.sequential_image_generation_options.max_images, 3);
  assert.equal(body.response_format, "b64_json");
  assert.equal(body.watermark, false);
  assert.equal("output_format" in body, false);
});

test("redacts API keys and inline image contents from diagnostics", () => {
  const descriptor = Adapters.buildGeminiRequest({
    origin: "https://cdn.12ai.org",
    apiKey: "sk-secret",
    modelId: "gemini-3.1-flash-image-preview",
    body: {
      contents: [{ parts: [{ inlineData: { mimeType: "image/png", data: "AAAA" } }] }]
    }
  });
  const redacted = JSON.stringify(Adapters.redactRequestDescriptor(descriptor));
  assert.doesNotMatch(redacted, /sk-secret|AAAA/);
  assert.match(redacted, /\[hidden\]|4 chars/);
});
