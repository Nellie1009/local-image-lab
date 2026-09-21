const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  detectBase64ImageType,
  estimateBase64Bytes,
  fetchWithTimeout,
  getBatchErrorAction,
  mergeSupportedOptions,
  normalizeSelectedModels,
  resolveCompatiblePayload,
  runModelQueue
} = require("../multi-model.js");

test("keeps unique available models and restores the fallback when selection is empty", () => {
  const available = ["gpt-image-2", "dall-e-3", "gemini-3-pro-image-preview"];

  assert.deepEqual(
    normalizeSelectedModels(
      ["gemini-3-pro-image-preview", "missing", "gpt-image-2", "gpt-image-2"],
      available,
      "gpt-image-2"
    ),
    ["gemini-3-pro-image-preview", "gpt-image-2"]
  );
  assert.deepEqual(
    normalizeSelectedModels([], available, "gpt-image-2"),
    ["gpt-image-2"]
  );
});

test("uses shared values when supported and compatible defaults when they are not", () => {
  const shared = {
    prompt: "同一个提示词",
    size: "1536x1024",
    quality: "high",
    output_format: "webp",
    style: "vivid",
    background: "transparent",
    gemini_resolution: "4K",
    n: 4
  };

  assert.deepEqual(
    resolveCompatiblePayload(shared, "dall-e-3", {
      sizes: ["1024x1024", "1792x1024", "1024x1792"],
      qualities: ["standard", "hd"],
      formats: [],
      styles: ["auto", "vivid", "natural"],
      backgrounds: [],
      geminiResolutions: [],
      counts: ["1"]
    }),
    {
      model: "dall-e-3",
      prompt: "同一个提示词",
      size: "1024x1024",
      quality: "standard",
      style: "vivid",
      n: 1
    }
  );

  assert.deepEqual(
    resolveCompatiblePayload(shared, "gemini-3-pro-image-preview", {
      sizes: ["auto", "1:1", "3:2", "2:3"],
      qualities: [],
      formats: [],
      styles: ["auto"],
      backgrounds: [],
      geminiResolutions: ["auto", "1K", "2K", "4K"],
      counts: ["1", "2", "3", "4", "5", "6", "7", "8"]
    }),
    {
      model: "gemini-3-pro-image-preview",
      prompt: "同一个提示词",
      size: "auto",
      style: "auto",
      gemini_resolution: "4K",
      n: 4
    }
  );
});

test("keeps transparent output in a format that supports alpha", () => {
  assert.deepEqual(
    resolveCompatiblePayload({
      prompt: "透明贴纸",
      output_format: "jpeg",
      background: "transparent",
      n: 1
    }, "gpt-image-1", {
      sizes: ["auto"],
      qualities: ["auto"],
      formats: ["png", "jpeg", "webp"],
      styles: ["auto"],
      backgrounds: ["auto", "opaque", "transparent"],
      geminiResolutions: [],
      counts: ["1"]
    }),
    {
      model: "gpt-image-1",
      prompt: "透明贴纸",
      size: "auto",
      quality: "auto",
      output_format: "png",
      style: "auto",
      background: "transparent",
      n: 1
    }
  );
});

test("merges shared control options across every selected model", () => {
  const configs = {
    "dall-e-3": {
      counts: ["1"],
      geminiResolutions: []
    },
    "gemini-3-pro-image-preview": {
      counts: ["1", "2", "3", "4"],
      geminiResolutions: ["auto", "1K", "2K", "4K"]
    }
  };

  assert.deepEqual(
    mergeSupportedOptions(
      ["dall-e-3", "gemini-3-pro-image-preview"],
      configs,
      "counts"
    ),
    ["1", "2", "3", "4"]
  );
  assert.deepEqual(
    mergeSupportedOptions(
      ["dall-e-3", "gemini-3-pro-image-preview"],
      configs,
      "geminiResolutions"
    ),
    ["auto", "1K", "2K", "4K"]
  );
});

test("detects the real base64 image type instead of trusting the requested format", () => {
  assert.deepEqual(detectBase64ImageType("iVBORw0KGgoAAA", "jpeg"), {
    format: "png",
    mime: "image/png",
    extension: "png"
  });
  assert.deepEqual(detectBase64ImageType("/9j/4AAQSkZJRg", "png"), {
    format: "jpeg",
    mime: "image/jpeg",
    extension: "jpg"
  });
  assert.deepEqual(detectBase64ImageType("UklGRiIAAABXRUJQVlA4", "png"), {
    format: "webp",
    mime: "image/webp",
    extension: "webp"
  });
});

test("estimates base64 expansion for Gemini inline image validation", () => {
  assert.equal(estimateBase64Bytes(0), 0);
  assert.equal(estimateBase64Bytes(1), 4);
  assert.equal(estimateBase64Bytes(3), 4);
  assert.equal(estimateBase64Bytes(4), 8);
  assert.equal(estimateBase64Bytes(15 * 1024 * 1024), 20 * 1024 * 1024);
});

test("aborts a fetch attempt after its timeout so the queue can continue", async () => {
  const neverSettles = (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(options.signal.reason));
  });

  await assert.rejects(
    fetchWithTimeout("https://example.test/image", {}, 15, neverSettles),
    (error) => error.name === "TimeoutError" && error.status === 408
  );
});

test("keeps successful Gemini batch images when a later request fails", () => {
  assert.equal(getBatchErrorAction(400, 0, 4), "throw");
  assert.equal(getBatchErrorAction(400, 1, 4), "stop");
  assert.equal(getBatchErrorAction(502, 1, 4), "continue");
  assert.equal(getBatchErrorAction(502, 0, 1), "throw");
});

test("runs at most two model tasks concurrently and returns outcomes in model order", async () => {
  const models = ["model-a", "model-b", "model-c", "model-d"];
  let active = 0;
  let maxActive = 0;

  const outcomes = await runModelQueue(models, 2, async (model, index) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 8 - index));
    active -= 1;
    if (model === "model-c") throw new Error("model-c failed");
    return `${model}-done`;
  });

  assert.equal(maxActive, 2);
  assert.deepEqual(
    outcomes.map((outcome) => outcome.status),
    ["fulfilled", "fulfilled", "rejected", "fulfilled"]
  );
  assert.equal(outcomes[0].value, "model-a-done");
  assert.equal(outcomes[2].reason.message, "model-c failed");
  assert.equal(outcomes[3].value, "model-d-done");
});

test("the page wires multi-select models to independent queued result panels", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

  assert.match(html, /let modelCheckboxes = \[\]/);
  assert.match(html, /providerCatalog\.modelsById\.forEach/);
  assert.match(html, /MODEL_REQUEST_CONCURRENCY = 2/);
  assert.match(html, /MultiModel\.runModelQueue/);
  assert.match(html, /MultiModel\.mergeSupportedOptions/);
  assert.match(html, /MultiModel\.fetchWithTimeout/);
  assert.match(html, /MultiModel\.detectBase64ImageType/);
  assert.match(html, /createModelComparison\(selectedModels\)/);
});
