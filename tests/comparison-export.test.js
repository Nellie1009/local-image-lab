const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  buildComparisonExportTable,
  buildModelColumns,
  formatEstimatedPrice,
  getExportRecordKey
} = require("../comparison-export.js");

test("uses the persistent result id as the cross-page selection key", () => {
  assert.equal(getExportRecordKey({ resultId: "result-42", id: 7 }), "result-42");
  assert.equal(getExportRecordKey({ id: 7 }), "history-7");
});

test("places an individual estimated-price column immediately before each model result", () => {
  assert.deepEqual(buildModelColumns(["gpt-image-2", "gemini-3.1-flash-image"]), [
    { model: "gpt-image-2", kind: "price", header: "gpt-image-2 估计价格" },
    { model: "gpt-image-2", kind: "result", header: "gpt-image-2" },
    { model: "gemini-3.1-flash-image", kind: "price", header: "gemini-3.1-flash-image 估计价格" },
    { model: "gemini-3.1-flash-image", kind: "result", header: "gemini-3.1-flash-image" }
  ]);
});

test("formats each model estimate without combining prices", () => {
  assert.equal(formatEstimatedPrice({ estimatedPrice: 0.15 }), "¥0.150");
  assert.equal(formatEstimatedPrice({ estimatedPrice: 0.3 }), "¥0.300");
  assert.equal(formatEstimatedPrice({ billingType: "per_token" }), "按 token 计费");
  assert.equal(formatEstimatedPrice(null), "");
});

test("aligns selected model outputs by generation batch and image index", () => {
  const table = buildComparisonExportTable([
    {
      resultId: "gpt-1",
      comparisonId: "batch-a",
      prompt: "一只猫",
      user_prompt: "一只猫的输入",
      model: "gpt-image-2",
      batchIndex: 0,
      exportReferenceImages: [{ name: "猫咪.png", dataUrl: "data:image/png;base64,ref-cat" }],
      src: "data:image/png;base64,gpt1",
      createdAt: 1
    },
    {
      resultId: "gemini-1",
      comparisonId: "batch-a",
      prompt: "一只猫",
      user_prompt: "一只猫的输入",
      model: "gemini-3-pro-image-preview",
      batchIndex: 0,
      exportReferenceImages: [{ name: "猫咪.png", dataUrl: "data:image/png;base64,ref-cat" }],
      src: "data:image/png;base64,gemini1",
      createdAt: 2
    },
    {
      resultId: "gpt-2",
      comparisonId: "batch-a",
      prompt: "一只猫",
      model: "gpt-image-2",
      batchIndex: 1,
      src: "data:image/png;base64,gpt2",
      createdAt: 3
    },
    {
      resultId: "gemini-2",
      comparisonId: "batch-a",
      prompt: "一只猫",
      model: "gemini-3-pro-image-preview",
      batchIndex: 1,
      src: "data:image/png;base64,gemini2",
      createdAt: 3.5
    },
    {
      resultId: "other-1",
      comparisonId: "batch-b",
      prompt: "一片海",
      model: "gpt-image-2",
      batchIndex: 0,
      src: "data:image/png;base64,other1",
      createdAt: 4
    }
  ]);

  assert.deepEqual(table.models, ["gpt-image-2", "gemini-3-pro-image-preview"]);
  assert.equal(table.rows.length, 3);
  assert.equal(table.rows[0].prompt, "一只猫");
  assert.deepEqual(table.rows[0].referenceImages, [{ name: "猫咪.png", dataUrl: "data:image/png;base64,ref-cat" }]);
  assert.deepEqual(table.rows[1].referenceImages, [{ name: "猫咪.png", dataUrl: "data:image/png;base64,ref-cat" }]);
  assert.deepEqual(
    table.rows.map((row) => ({
      prompt: row.prompt,
      index: row.index,
      gpt: row.images["gpt-image-2"]?.resultId,
      gemini: row.images["gemini-3-pro-image-preview"]?.resultId
    })),
    [
      { prompt: "一只猫", index: 1, gpt: "gpt-1", gemini: "gemini-1" },
      { prompt: "一只猫", index: 2, gpt: "gpt-2", gemini: "gemini-2" },
      { prompt: "一片海", index: 1, gpt: "other-1", gemini: undefined }
    ]
  );
});

test("keeps legacy history records with the same prompt in one export group", () => {
  const table = buildComparisonExportTable([
    { id: 1, prompt: "旧记录", model: "dall-e-3", batchIndex: 0, createdAt: 1 },
    { id: 2, prompt: "旧记录", model: "gemini-2.5-flash-image", batchIndex: 0, createdAt: 2 }
  ]);

  assert.equal(table.rows.length, 1);
  assert.equal(table.rows[0].images["dall-e-3"].id, 1);
  assert.equal(table.rows[0].images["gemini-2.5-flash-image"].id, 2);
});

test("exports names for reference images from older history that has no stored source files", () => {
  const table = buildComparisonExportTable([{
    id: 3,
    prompt: "旧 prompt",
    model: "dall-e-3",
    generation_parameters: { reference_images: ["old-a.png", "old-b.jpg"] }
  }]);

  assert.deepEqual(table.rows[0].referenceImages, [
    { name: "old-a.png" },
    { name: "old-b.jpg" }
  ]);
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.match(html, /原图未保存/);
  assert.doesNotMatch(html, /row\.referenceImages\.filter\(\(image\) => !image\.dataUrl\)\.map\(\(image\) => image\.name\)/);
});

test("comparison rows retain provider metadata but strip credential secrets", () => {
  const table = buildComparisonExportTable([{
    resultId: "r1",
    comparisonId: "c1",
    prompt: "poster",
    model: "gpt-image-2.5-flare",
    providerName: "12API",
    endpointName: "CDN 线路",
    priceGroupId: "default",
    billingType: "per_request",
    estimatedPrice: 0.225,
    credentialLabel: "默认 Key",
    secret: "must-not-export",
    batchIndex: 0
  }]);
  const record = table.rows[0].images["gpt-image-2.5-flare"];
  assert.equal(record.providerName, "12API");
  assert.equal(record.estimatedPrice, 0.225);
  assert.equal(record.credentialLabel, "默认 Key");
  assert.equal("secret" in record, false);
});

test("summarizes mixed provider routes for leading Excel metadata columns", () => {
  const table = buildComparisonExportTable([
    {
      resultId: "r1",
      comparisonId: "c1",
      prompt: "poster",
      model: "gpt-image-2.5-flare",
      providerName: "12API",
      priceGroupId: "default",
      billingType: "per_request",
      estimatedPrice: 0.15,
      batchIndex: 0
    },
    {
      resultId: "r2",
      comparisonId: "c1",
      prompt: "poster",
      model: "doubao-seedream-5-0-pro-260628",
      providerName: "火山方舟 Ark",
      priceGroupId: "default",
      billingType: "per_image",
      estimatedPrice: 0.3,
      batchIndex: 0
    }
  ]);

  assert.equal(table.rows[0].platforms, "12API / 火山方舟 Ark");
  assert.equal(table.rows[0].priceGroups, "default");
  assert.equal(formatEstimatedPrice(table.rows[0].images["gpt-image-2.5-flare"]), "¥0.150");
  assert.equal(formatEstimatedPrice(table.rows[0].images["doubao-seedream-5-0-pro-260628"]), "¥0.300");
});

test("the history serializer persists route labels without a credential secret", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const serializer = html.match(/async function saveHistoryRecords[\s\S]*?async function getHistoryRecords/)?.[0] || "";

  assert.match(serializer, /providerId:/);
  assert.match(serializer, /providerName:/);
  assert.match(serializer, /credentialLabel:/);
  assert.match(serializer, /estimatedPrice:/);
  assert.doesNotMatch(serializer, /secret:/);
});

test("the page preserves selection data in history and wires the Excel exporter", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

  assert.match(html, /<script src="comparison-export\.js"><\/script>/);
  assert.match(html, /<script src="vendor\/exceljs\.min\.js"><\/script>/);
  assert.match(html, /resultId:/);
  assert.match(html, /comparisonId:/);
  assert.match(html, /exportSelectedImagesToExcel/);
  assert.match(html, /createExportSelectionToggle/);
  assert.match(html, /id="export-selection-history"/);
  assert.match(html, /id="export-selection-home"/);
  assert.match(html, /id="clear-export-selection-home"/);
  assert.match(html, /ComparisonExport\.buildModelColumns\(table\.models\)/);
  assert.match(html, /ComparisonExport\.formatEstimatedPrice\(row\.images\[column\.model\]\)/);
  assert.match(html, /HISTORY_REFERENCE_STORE_NAME/);
  assert.match(html, /exportReferenceImages/);
});
