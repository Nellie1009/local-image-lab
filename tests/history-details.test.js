const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const modulePath = path.join(__dirname, "..", "history-details.js");

test("history image details expose the complete saved text parameters without secrets", () => {
  assert.equal(fs.existsSync(modulePath), true, "history-details.js should exist");
  const { buildHistoryDetails } = require(modulePath);
  const details = buildHistoryDetails({
    model: "doubao-seedream-5-0-pro-260628",
    providerName: "火山方舟",
    endpointName: "北京",
    credentialLabel: "private key",
    prompt: "saved style\n\nmain subject",
    user_prompt: "main subject",
    saved_prompt: { name: "Poster", content: "saved style" },
    generation_parameters: {
      size: "4K",
      quality: "high",
      output_format: "png",
      background: "opaque",
      gemini_resolution: "2K",
      n: 3,
      reference_images: ["a.png", "b.jpg"]
    },
    estimatedPrice: 0.9,
    createdAt: Date.parse("2026-09-22T08:00:00Z"),
    apiKey: "must-not-appear"
  }, { locale: "zh-CN", timeZone: "UTC" });

  assert.deepEqual(details, [
    { label: "模型", value: "doubao-seedream-5-0-pro-260628" },
    { label: "平台", value: "火山方舟" },
    { label: "接口线路", value: "北京" },
    { label: "主 Prompt", value: "main subject", multiline: true },
    { label: "保存的 Prompt", value: "Poster\nsaved style", multiline: true },
    { label: "完整 Prompt", value: "saved style\n\nmain subject", multiline: true },
    { label: "尺寸 / 比例", value: "4K" },
    { label: "质量", value: "high" },
    { label: "输出格式", value: "png" },
    { label: "背景", value: "opaque" },
    { label: "Gemini 分辨率", value: "2K" },
    { label: "生成数量", value: "3" },
    { label: "参考图", value: "a.png\nb.jpg", multiline: true },
    { label: "预计价格", value: "¥0.900" },
    { label: "生成时间", value: "2026/9/22 08:00:00" }
  ]);
  assert.equal(JSON.stringify(details).includes("must-not-appear"), false);
  assert.equal(JSON.stringify(details).includes("private key"), false);
});

test("legacy history records show known values and mark missing parameters", () => {
  assert.equal(fs.existsSync(modulePath), true, "history-details.js should exist");
  const { buildHistoryDetails } = require(modulePath);
  const details = buildHistoryDetails({ model: "legacy", prompt: "old prompt" });

  assert.equal(details.find((item) => item.label === "完整 Prompt").value, "old prompt");
  assert.equal(details.find((item) => item.label === "尺寸 / 比例").value, "未记录");
});

